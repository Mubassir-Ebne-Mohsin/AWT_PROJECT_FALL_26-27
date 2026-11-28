import { RegionResults } from "@/modules/region-lab/results/region-results.service";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { cleanupOpenApiDoc } from "nestjs-zod";
import { TypeOrmModule } from "@nestjs/typeorm";
jest.mock("dotenv", () => ({
  config: () => {
    throw new Error(
      "Environment-file access forbidden in isolated Region Lab verification",
    );
  },
}));
jest.mock("@/providers/cache/redis/redis-cache.service", () => ({
  RedisCacheService: class {},
}));
import { Test } from "@nestjs/testing";
import { DataSource } from "typeorm";
import { Client } from "pg";
import { JwtService } from "@nestjs/jwt";
import { Reflector } from "@nestjs/core";
import { ZodValidationPipe } from "nestjs-zod";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fork } from "node:child_process";
import request from "supertest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { RegionLabModule } from "@/modules/region-lab/region-lab.module";
import { RegionStore } from "@/modules/region-lab/region-store.service";
import { RegionJobs } from "@/modules/region-lab/region-jobs.service";
import {
  RegionExecutor,
  RegionExecutionError,
  spawnRegionChild,
  regionChildLaunch,
} from "@/modules/region-lab/worker/region-executor";
import { RegionLabStorage1795600000000 } from "@/database/migrations/1795600000000-RegionLabStorage";
import {
  frozenSnapshot,
  profiles,
  REGION_POLICY,
  hash,
} from "@/modules/region-lab/region-policy";
import { validateRegionResult } from "@/modules/region-lab/worker/region-result";
import { simulateRegionLabScenario } from "@/modules/region-lab/engine/regional-scenario";
import { AuthGuard } from "@/common/guard/auth.guard";
import { TokenStore } from "@/modules/auth/token-store.service";
import { AllExceptionsFilter } from "@/common/filters/all-exceptions.filter";
import { ResponseEnvelopeInterceptor } from "@/common/interceptors/response-envelope.interceptor";
import { httpBoundary } from "@/common/middlewares/http-boundary";
import { Role } from "@/common/enums/role.enum";

if (process.env.SF_REGION_STAGE6_FAULT === "owner") {
  const real = RegionStore.prototype.get;
  jest.spyOn(RegionStore.prototype, "get").mockImplementation(async function (
    this: RegionStore,
    _owner,
    id,
  ) {
    const [r] = await this.db.query(
      "SELECT owner_id FROM region_lab_experiments WHERE id=$1",
      [id],
    );
    return real.call(this, r?.owner_id ?? _owner, id);
  });
}
if (process.env.SF_REGION_STAGE6_FAULT === "lease") {
  const real = RegionStore.prototype.finish;
  jest
    .spyOn(RegionStore.prototype, "finish")
    .mockImplementation(async function (
      this: RegionStore,
      id,
      _token,
      outcome,
    ) {
      const [r] = await this.db.query(
        "SELECT lease_token FROM region_lab_runs WHERE id=$1",
        [id],
      );
      return real.call(this, id, r?.lease_token ?? _token, outcome);
    });
}

if (process.env.SF_REGION_STAGE7_FAULT === "owner") {
  const original = RegionResults.prototype.retained;
  jest
    .spyOn(RegionResults.prototype, "retained")
    .mockImplementation(async function (
      this: RegionResults,
      owner,
      id,
      completed,
    ) {
      const [r] = await (this as any).db.query(
        "SELECT owner_id FROM region_lab_runs WHERE id=$1",
        [id],
      );
      return original.call(this, r?.owner_id ?? owner, id, completed);
    });
}
if (process.env.SF_REGION_STAGE7_FAULT === "compare")
  jest
    .spyOn(RegionResults.prototype, "foundation")
    .mockImplementation(() => ({}) as any);

jest.setTimeout(120000);
const DATABASE = "sf_region_stage6";
function scenario() {
  const s = JSON.parse(
    readFileSync(
      resolve(process.cwd(), "../../docs/region-lab/examples.json"),
      "utf8",
    ),
  ).baseline;
  s.profiles.forEach((p: any) => (p.origin = "custom"));
  s.workload.arrival = "constant_rate";
  s.workload.baselineRps = 1;
  s.workload.warmupSeconds = 0;
  s.workload.durationSeconds = 10;
  s.workload.schedule = [
    { atSeconds: 0, multiplier: 1 },
    { atSeconds: 10, multiplier: 1 },
  ];
  s.runOptions = { mode: "baseline", seed: 42, repetitions: 1 };
  return s;
}
const fault =
  (mode: string, heap = 160) =>
  () =>
    fork(resolve(process.cwd(), "test/fixtures/region-worker-fault.cjs"), [], {
      execArgv: ["--max-old-space-size=" + heap],
      env: { SF_TEST_FAULT: mode },
      stdio: ["ignore", "ignore", "ignore", "ipc"],
      windowsHide: true,
    });
async function until<T>(
  read: () => Promise<T>,
  accept: (v: T) => boolean,
  timeout = 20000,
) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await read();
    if (accept(value)) return value;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw Error("Region Lab verification timed out");
}
describe("Region Lab private persistence and isolated execution", () => {
  let db: DataSource,
    app: NestExpressApplication,
    store: RegionStore,
    jwt: JwtService,
    http: ReturnType<typeof request>;
  let owner: { id: string; token: string },
    other: { id: string; token: string };
  const jobs: RegionJobs[] = [];
  async function user(role = Role.USER) {
    const id = randomUUID();
    await db.query(
      "INSERT INTO users(id,email,password_hash,display_name,role) VALUES($1,$2,'test-hash','Region test',$3)",
      [id, id + "@example.test", role],
    );
    return {
      id,
      token: jwt.sign({
        typ: "access",
        sub: id,
        email: id + "@example.test",
        role,
        jti: randomUUID(),
      }),
    };
  }
  const auth = (u = owner) => ({ Authorization: "Bearer " + u.token });
  const create = () =>
    store.create(owner.id, {
      name: "Private experiment",
      description: "Synthetic verification",
      scenario: scenario(),
    });
  async function enqueue() {
    const e = await create();
    const accepted = await store.submit(owner.id, e.id, {
      expectedRevision: 1,
      requestId: randomUUID(),
    });
    return { e, run: accepted.run };
  }
  const scheduler = (executor = new RegionExecutor()) => {
    const j = new RegionJobs(store, executor);
    jobs.push(j);
    return j;
  };
  beforeAll(async () => {
    const admin = new Client({
      host: "127.0.0.1",
      port: 55468,
      user: "sf_stage6",
      database: "postgres",
    });
    await admin.connect();
    if (!/^sf_region_stage6$/.test(DATABASE))
      throw Error("Unsafe isolated target");
    const exists = await admin.query(
      "SELECT 1 FROM pg_database WHERE datname=$1",
      [DATABASE],
    );
    if (!exists.rowCount) await admin.query("CREATE DATABASE sf_region_stage6");
    await admin.end();
    db = new DataSource({
      type: "postgres",
      host: "127.0.0.1",
      port: 55468,
      username: "sf_stage6",
      database: DATABASE,
      entities: [],
      migrations: [resolve(process.cwd(), "src/database/migrations/*.ts")],
      synchronize: false,
      extra: {
        connectionTimeoutMillis: 3000,
        statement_timeout: 15000,
        query_timeout: 17000,
        max: 8,
      },
    });
    await db.initialize();
    expect(db.options.database).toBe(DATABASE);
    await db.runMigrations();
    jwt = new JwtService({
      secret: "region-stage6-disposable-auth-secret-0123456789",
      signOptions: { expiresIn: 3600 },
    });
    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: "postgres",
          host: "127.0.0.1",
          port: 55468,
          username: "sf_stage6",
          database: DATABASE,
          entities: [],
          synchronize: false,
          extra: {
            connectionTimeoutMillis: 3000,
            statement_timeout: 15000,
            max: 8,
          },
        }),
        RegionLabModule,
      ],
      providers: [
        { provide: JwtService, useValue: jwt },
        {
          provide: TokenStore,
          useValue: {
            isAccessRevoked: async () => false,
            isUserBlocked: async () => false,
            sessionsEndedAt: async () => null,
          },
        },
        Reflector,
        AuthGuard,
      ],
    })
      .overrideProvider(RegionJobs)
      .useValue({})
      .compile();
    app = module.createNestApplication<NestExpressApplication>();
    app.setGlobalPrefix("v1");
    app.use("/v1", httpBoundary(["http://localhost:3000"]));
    app.useGlobalPipes(new ZodValidationPipe());
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
    app.useGlobalGuards(module.get(AuthGuard));
    if (process.env.SF_REGION_STAGE7_SERVE === "1")
      app.use("/__stage7/session", (_req: any, res: any) =>
        res.json({
          data: {
            accessToken: owner.token,
            expiresIn: 3600,
            user: {
              id: owner.id,
              email: owner.id + "@example.test",
              displayName: "Stage7 learner",
              role: "user",
              createdAt: new Date().toISOString(),
            },
          },
        }),
      );
    await app.init();
    store = app.get(RegionStore);
    http = request(app.getHttpServer());
  });
  beforeEach(async () => {
    await db.query("DELETE FROM users");
    await db.query(
      "UPDATE region_lab_execution_slot SET run_id=NULL,lease_token=NULL,lease_expires_at=NULL WHERE id=1",
    );
    owner = await user();
    other = await user(Role.ADMIN);
  });
  afterEach(async () => {
    for (const j of jobs.splice(0)) await j.onModuleDestroy();
  });
  afterAll(async () => {
    await app?.close();
    await db?.destroy();
  });

  it("requires the existing bearer guard, rejects hostile origins and validates strict bodies", async () => {
    await http.get("/v1/region-lab/experiments").expect(401);
    await http
      .get("/v1/region-lab/profiles")
      .set({ Authorization: "Bearer invalid" })
      .expect(401);
    await http
      .post("/v1/region-lab/experiments")
      .set(auth())
      .set("Origin", "https://hostile.invalid")
      .send({})
      .expect(403);
    await http
      .post("/v1/region-lab/experiments")
      .set(auth())
      .send({ name: "X", scenario: scenario(), ownerId: other.id })
      .expect(422);
    const r = await http
      .post("/v1/region-lab/experiments")
      .set(auth())
      .send({ name: "Private", scenario: scenario() })
      .expect(201);
    expect(r.body.data.revision).toBe(1);
    expect(r.body.data.calibration).toBe("uncalibrated");
  });
  it("Admin and other accounts get404 on every private identifier operation", async () => {
    const { e, run } = await enqueue();
    await http
      .get("/v1/region-lab/experiments/" + e.id)
      .set(auth(other))
      .expect(404);
    await http
      .patch("/v1/region-lab/experiments/" + e.id)
      .set(auth(other))
      .send({ expectedRevision: 1, name: "stolen" })
      .expect(404);
    await http
      .get("/v1/region-lab/experiments/" + e.id + "/versions")
      .set(auth(other))
      .expect(404);
    await http
      .post("/v1/region-lab/experiments/" + e.id + "/duplicate")
      .set(auth(other))
      .send({ expectedRevision: 1, name: "copy" })
      .expect(404);
    await http
      .delete("/v1/region-lab/experiments/" + e.id + "?expectedRevision=1")
      .set(auth(other))
      .expect(404);
    await http
      .post("/v1/region-lab/experiments/" + e.id + "/runs")
      .set(auth(other))
      .send({ expectedRevision: 1, requestId: randomUUID() })
      .expect(404);
    await http
      .get("/v1/region-lab/runs/" + run.id)
      .set(auth(other))
      .expect(404);
    await http
      .post("/v1/region-lab/runs/" + run.id + "/cancel")
      .set(auth(other))
      .expect(404);
    expect((await store.list(other.id, {})).items).toHaveLength(0);
  });
  it("records immutable versions, rejects stale edits and duplicates independently", async () => {
    const e = await create();
    const results = await Promise.allSettled([
      store.patch(owner.id, e.id, { expectedRevision: 1, name: "first" }),
      store.patch(owner.id, e.id, { expectedRevision: 1, name: "second" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (await store.versions(owner.id, e.id, {})).items.map(
        (v: any) => v.revision,
      ),
    ).toEqual([2, 1]);
    await expect(
      db.query(
        "UPDATE region_lab_versions SET snapshot='{}' WHERE experiment_id=$1",
        [e.id],
      ),
    ).rejects.toThrow("immutable");
    const copy = await store.duplicate(owner.id, e.id, {
      expectedRevision: 2,
      name: "Independent",
    });
    expect(copy.id).not.toBe(e.id);
    expect(copy.revision).toBe(1);
    expect(
      await db.query("SELECT id FROM region_lab_runs WHERE experiment_id=$1", [
        copy.id,
      ]),
    ).toHaveLength(0);
  });
  it("paginates summaries without graphs and binds cursors to their owner", async () => {
    await create();
    await create();
    const page = await store.list(owner.id, { limit: 1 });
    expect(page.nextCursor).toBeTruthy();
    expect(page.items[0]).not.toHaveProperty("scenario");
    const second = await store.list(owner.id, {
      limit: 1,
      cursor: page.nextCursor,
    });
    expect(second.items[0].id).not.toBe(page.items[0].id);
    await expect(
      store.list(other.id, { limit: 1, cursor: page.nextCursor }),
    ).rejects.toThrow("cursor");
  });
  it("authenticates operator profiles and treats custom provenance as assumptions", async () => {
    const r = await http.get("/v1/region-lab/profiles").set(auth()).expect(200);
    expect(r.body.data.items).toHaveLength(11);
    const s = scenario(),
      p = profiles().find((p) => p.component === "app")!;
    s.profiles[0] = p;
    for (const n of s.graph.nodes)
      if (n.type === "app") {
        n.profileId = p.id;
        n.profileVersion = p.version;
      }
    await store.validate(owner.id, s);
    s.profiles[0].properties.serviceTime.valueMs++;
    await expect(store.validate(owner.id, s)).rejects.toThrow(
      "operator profile",
    );
    const spoof = scenario();
    spoof.profiles[0].origin = "measured";
    await expect(store.validate(owner.id, spoof)).rejects.toThrow(
      "operator profile",
    );
    const overload = scenario();
    overload.workload.baselineRps = 20000;
    overload.workload.durationSeconds = 3600;
    overload.workload.schedule[1].atSeconds = 3600;
    await expect(store.validate(owner.id, overload)).rejects.toThrow(
      "admission",
    );
  });
  it("serializes idempotent submissions and freezes accepted input across later edits", async () => {
    const e = await create(),
      requestId = randomUUID();
    const accepted = await Promise.all(
      Array.from({ length: 6 }, () =>
        store.submit(owner.id, e.id, { expectedRevision: 1, requestId }),
      ),
    );
    expect(new Set(accepted.map((r) => r.run.id)).size).toBe(1);
    expect(accepted.filter((r) => !r.replayed)).toHaveLength(1);
    const [old] = await db.query(
      "SELECT snapshot FROM region_lab_runs WHERE id=$1",
      [accepted[0].run.id],
    );
    const changed = scenario();
    changed.workload.baselineRps = 2;
    await store.patch(owner.id, e.id, {
      expectedRevision: 1,
      scenario: changed,
    });
    expect(
      (
        await db.query("SELECT snapshot FROM region_lab_runs WHERE id=$1", [
          accepted[0].run.id,
        ])
      )[0].snapshot,
    ).toEqual(old.snapshot);
    await expect(
      store.submit(owner.id, e.id, { expectedRevision: 2, requestId }),
    ).rejects.toThrow("changed");
    await expect(
      db.query("UPDATE region_lab_runs SET snapshot='{}' WHERE id=$1", [
        accepted[0].run.id,
      ]),
    ).rejects.toThrow("immutable");
  });
  it("bounds owner queues, prevents active deletion and retains deleted request-id tombstones", async () => {
    const e = await create(),
      firstId = randomUUID(),
      first = await store.submit(owner.id, e.id, {
        expectedRevision: 1,
        requestId: firstId,
      });
    await store.submit(owner.id, e.id, {
      expectedRevision: 1,
      requestId: randomUUID(),
    });
    await expect(
      store.submit(owner.id, e.id, {
        expectedRevision: 1,
        requestId: randomUUID(),
      }),
    ).rejects.toThrow("queue");
    await expect(store.remove(owner.id, e.id, 1)).rejects.toThrow("changed");
    const runs = await db.query(
      "SELECT id FROM region_lab_runs WHERE experiment_id=$1",
      [e.id],
    );
    for (const r of runs) await store.cancel(owner.id, r.id);
    await store.remove(owner.id, e.id, 1);
    const replay = await store.submit(owner.id, e.id, {
      expectedRevision: 1,
      requestId: firstId,
    });
    expect(replay.run.id).toBe(first.run.id);
    expect(replay.run.retained).toBe(false);
    expect(await db.query("SELECT * FROM region_lab_runs")).toHaveLength(0);
  });
  it("only one dispatcher claims execution and stale lease tokens cannot publish", async () => {
    await enqueue();
    const [a, b] = await Promise.all([
      store.claim(randomUUID()),
      store.claim(randomUUID()),
    ]);
    const row = a ?? b;
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(row).toBeTruthy();
    const result = simulateRegionLabScenario(row!.snapshot.scenario);
    expect(await store.finish(row!.id, randomUUID(), { result })).toBe(false);
    expect((await store.getRun(owner.id, row!.id)).status).toBe("running");
    expect(await store.finish(row!.id, row!.lease_token, { result })).toBe(
      true,
    );
    expect((await store.getRun(owner.id, row!.id)).status).toBe("completed");
    await expect(
      db.query("UPDATE region_lab_runs SET status='queued' WHERE id=$1", [
        row!.id,
      ]),
    ).rejects.toThrow("terminal");
  });
  it("completion and cancellation have one atomic winner and cancellation retains the physical slot", async () => {
    await enqueue();
    const row = (await store.claim(randomUUID()))!;
    await store.cancel(owner.id, row.id);
    expect(
      (await db.query("SELECT run_id FROM region_lab_execution_slot"))[0]
        .run_id,
    ).toBe(row.id);
    expect(
      await store.finish(row.id, row.lease_token, {
        result: simulateRegionLabScenario(row.snapshot.scenario),
      }),
    ).toBe(false);
    expect((await store.getRun(owner.id, row.id)).status).toBe("cancelled");
    expect(
      (await db.query("SELECT run_id FROM region_lab_execution_slot"))[0]
        .run_id,
    ).toBeNull();
    const next = await enqueue(),
      claimed = (await store.claim(randomUUID()))!;
    expect(
      await store.finish(claimed.id, claimed.lease_token, {
        result: simulateRegionLabScenario(claimed.snapshot.scenario),
      }),
    ).toBe(true);
    expect((await store.cancel(owner.id, next.run.id)).status).toBe(
      "completed",
    );
  });
  it("expired leases fail without silent retry or acceptance of a late result", async () => {
    await enqueue();
    const row = (await store.claim(randomUUID()))!;
    await db.query(
      "UPDATE region_lab_runs SET lease_expires_at=now()-interval '1 second' WHERE id=$1",
      [row.id],
    );
    await db.query(
      "UPDATE region_lab_execution_slot SET lease_expires_at=now()-interval '1 second' WHERE id=1",
    );
    expect(
      await store.finish(row.id, row.lease_token, {
        result: simulateRegionLabScenario(row.snapshot.scenario),
      }),
    ).toBe(false);
    expect((await store.getRun(owner.id, row.id)).status).toBe("failed");
    expect(await store.claim(randomUUID())).toBeNull();
  });
  it("database deletion fences jobs and cascades all owner-private state before a stale publication", async () => {
    await enqueue();
    const row = (await store.claim(randomUUID()))!;
    await db.query("DELETE FROM users WHERE id=$1", [owner.id]);
    expect(
      await store.finish(row.id, row.lease_token, {
        result: simulateRegionLabScenario(row.snapshot.scenario),
      }),
    ).toBe(false);
    for (const table of [
      "region_lab_experiments",
      "region_lab_runs",
      "region_lab_requests",
    ])
      expect(
        await db.query("SELECT * FROM " + table + " WHERE owner_id=$1", [
          owner.id,
        ]),
      ).toHaveLength(0);
    await http.get("/v1/region-lab/experiments").set(auth()).expect(401);
  });
  it("executes a real child with no DB/JWT/provider credentials and publishes only after exit", async () => {
    const launch = regionChildLaunch();
    expect(Object.keys(launch.options.env)).toEqual(
      expect.arrayContaining(["NODE_ENV", "TEMP", "TMP"]),
    );
    expect(
      Object.keys(launch.options.env).every((k) =>
        ["NODE_ENV", "TEMP", "TMP", "TS_NODE_PROJECT"].includes(k),
      ),
    ).toBe(true);
    expect(launch.options.execArgv).toContain("--max-old-space-size=160");
    const snapshot = frozenSnapshot(scenario()),
      controller = new AbortController();
    let childPid: number | undefined;
    const execute = new RegionExecutor(() => {
      const child = spawnRegionChild();
      childPid = child.pid;
      return child;
    });
    const result = await execute.run(
      randomUUID(),
      randomUUID(),
      snapshot,
      controller.signal,
    );
    expect(
      (result as any).repetitions[0].baseline.summary.successfulRequests,
    ).toBe(10);
    expect(() => process.kill(childPid!, 0)).toThrow();
    const bad = structuredClone(result) as any;
    bad.repetitions[0].baseline.summary.successfulRequests++;
    expect(() => validateRegionResult(snapshot, bad)).toThrow(
      "Invalid isolated",
    );
    const forged = structuredClone(result) as any;
    forged.provenance[0].provenance = "invented evidence";
    expect(() => validateRegionResult(snapshot, forged)).toThrow(
      "Invalid isolated",
    );
  });
  it.each(["crash", "invalid", "wrong-token", "rss"])(
    "isolates%s and never treats it as completed",
    async (mode) => {
      const execute = new RegionExecutor(fault(mode), 2000);
      await expect(
        execute.run(
          randomUUID(),
          randomUUID(),
          frozenSnapshot(scenario()),
          new AbortController().signal,
        ),
      ).rejects.toBeInstanceOf(RegionExecutionError);
    },
  );
  it("parent watchdog terminates a spinning child while the API event loop stays responsive", async () => {
    const execute = new RegionExecutor(fault("spin"), 500);
    const start = Date.now();
    const promise = execute.run(
      randomUUID(),
      randomUUID(),
      frozenSnapshot(scenario()),
      new AbortController().signal,
    );
    const checked = expect(promise).rejects.toMatchObject({
      code: "DEADLINE_EXCEEDED",
    });
    await new Promise((r) => setTimeout(r, 50));
    await http.get("/v1/region-lab/experiments").set(auth()).expect(200);
    await checked;
    expect(Date.now() - start).toBeLessThan(5000);
  });
  it("a real V8 heap ceiling contains allocation failure in the child process", async () => {
    const execute = new RegionExecutor(fault("memory", 16), 4000);
    await expect(
      execute.run(
        randomUUID(),
        randomUUID(),
        frozenSnapshot(scenario()),
        new AbortController().signal,
      ),
    ).rejects.toBeInstanceOf(RegionExecutionError);
  });
  it("dispatchers persist actual child results and cancelling a running child releases the lease after exit", async () => {
    const { run } = await enqueue(),
      j = scheduler();
    await j.tick();
    const completed = await until(
      () => store.getRun(owner.id, run.id),
      (r) => r.status === "completed" || r.status === "failed",
    );
    expect(completed.status).toBe("completed");
    const next = await enqueue(),
      slow = scheduler(new RegionExecutor(fault("spin"), 5000));
    await slow.tick();
    await store.cancel(owner.id, next.run.id);
    await slow.tick();
    await until(
      () => db.query("SELECT run_id FROM region_lab_execution_slot"),
      (r) => r[0].run_id === null,
    );
    expect((await store.getRun(owner.id, next.run.id)).status).toBe(
      "cancelled",
    );
  });
  it("generates18 authenticated Swagger operations for the private API", () => {
    const doc = cleanupOpenApiDoc(
      SwaggerModule.createDocument(
        app,
        new DocumentBuilder()
          .setTitle("Isolated Region Lab")
          .setVersion("1")
          .addBearerAuth()
          .build(),
      ),
    );
    const paths = Object.entries(doc.paths).filter(([p]) =>
      p.startsWith("/v1/region-lab"),
    );
    expect(
      paths.reduce(
        (count, [_p, item]) =>
          count +
          Object.keys(item!).filter((k) =>
            ["get", "post", "patch", "delete"].includes(k),
          ).length,
        0,
      ),
    ).toBe(18);
    expect(doc.paths["/v1/region-lab/experiments"].get!.security).toEqual([
      { bearer: [] },
    ]);
    expect(JSON.stringify(doc.components?.schemas)).toContain("hdr-v2-base64");
    for (const [_path, item] of paths)
      for (const method of ["get", "post", "patch", "delete"] as const)
        if (item?.[method])
          expect(item[method]!.security).toEqual([{ bearer: [] }]);
    if (process.env.SF_REGION_STAGE7_WRITE_CONTRACT === "1")
      writeFileSync(
        resolve(
          process.cwd(),
          "../../docs/contracts/region-lab-implemented.openapi.json",
        ),
        JSON.stringify(doc, null, 2) + "\n",
      );
  });
  it("does not skip rows that share a millisecond but differ in PostgreSQL microseconds", async () => {
    const a = await create(),
      b = await create();
    await db.query(
      "UPDATE region_lab_experiments SET created_at='2026-11-28T00:00:00.000900Z' WHERE id=$1",
      [a.id],
    );
    await db.query(
      "UPDATE region_lab_experiments SET created_at='2026-11-28T00:00:00.000800Z' WHERE id=$1",
      [b.id],
    );
    const first = await store.list(owner.id, { limit: 1 });
    expect(first.items[0].id).toBe(a.id);
    const second = await store.list(owner.id, {
      limit: 1,
      cursor: first.nextCursor,
    });
    expect(second.items[0].id).toBe(b.id);
  });
  it("validates source-design ownership without modifying the legacy design", async () => {
    const [d] = await db.query(
      "INSERT INTO designs(owner_id,name,description,source,schema_version,graph,traffic) VALUES($1,'Source','','blank',1,'{\"nodes\":[],\"edges\":[]}','{}') RETURNING id",
      [other.id],
    );
    await db.query(
      "INSERT INTO design_versions(id,design_id,revision,origin,snapshot,created_at) VALUES($1,$2,1,'create','{}',now())",
      [randomUUID(), d.id],
    );
    await expect(
      store.create(owner.id, {
        name: "Invalid reference",
        description: "",
        scenario: scenario(),
        sourceDesign: { id: d.id, revision: 1 },
      }),
    ).rejects.toThrow("not found");
    const own = await store.create(other.id, {
      name: "Owned reference",
      description: "",
      scenario: scenario(),
      sourceDesign: { id: d.id, revision: 1 },
    });
    expect(own.sourceDesign).toEqual({ id: d.id, revision: 1 });
    expect(
      (await db.query("SELECT revision FROM designs WHERE id=$1", [d.id]))[0]
        .revision,
    ).toBe(1);
  });
  it("reconciles an abandoned expired lease without executing that run again", async () => {
    await enqueue();
    const abandoned = (await store.claim(randomUUID()))!;
    await db.query(
      "UPDATE region_lab_execution_slot SET lease_expires_at=now()-interval '1 second' WHERE id=1",
    );
    await db.query(
      "UPDATE region_lab_runs SET lease_expires_at=now()-interval '1 second' WHERE id=$1",
      [abandoned.id],
    );
    expect(await store.claim(randomUUID())).toBeNull();
    const r = await store.getRun(owner.id, abandoned.id);
    expect(r.status).toBe("failed");
    expect(r.failure).toMatchObject({ code: "WORKER_INTERRUPTED" });
    expect(
      (
        await db.query("SELECT result FROM region_lab_runs WHERE id=$1", [
          abandoned.id,
        ])
      )[0].result,
    ).toBeNull();
  });
  it("suspension fences pending jobs before reactivation can resume them", async () => {
    const { run } = await enqueue();
    await db.query("UPDATE users SET account_status='suspended' WHERE id=$1", [
      owner.id,
    ]);
    await http.get("/v1/region-lab/experiments").set(auth()).expect(401);
    expect(
      (
        await db.query("SELECT status FROM region_lab_runs WHERE id=$1", [
          run.id,
        ])
      )[0].status,
    ).toBe("cancelled");
    await db.query("UPDATE users SET account_status='active' WHERE id=$1", [
      owner.id,
    ]);
    expect(await store.claim(randomUUID())).toBeNull();
  });
  it("a graceful API shutdown records interruption and frees capacity only after worker exit", async () => {
    const { run } = await enqueue(),
      j = scheduler(new RegionExecutor(fault("spin"), 5000));
    await j.tick();
    await j.onModuleDestroy();
    const r = await store.getRun(owner.id, run.id);
    expect(r.status).toBe("failed");
    expect(r.failure).toMatchObject({ code: "WORKER_INTERRUPTED" });
    expect(
      (await db.query("SELECT run_id FROM region_lab_execution_slot"))[0]
        .run_id,
    ).toBeNull();
  });
  it("prunes old terminal runs while retaining request-id replay tombstones", async () => {
    const e = await create(),
      first = randomUUID();
    let firstRun = "";
    for (let i = 0; i < 101; i++) {
      const a = await store.submit(owner.id, e.id, {
        expectedRevision: 1,
        requestId: i === 0 ? first : randomUUID(),
      });
      if (i === 0) firstRun = a.run.id;
      await store.cancel(owner.id, a.run.id);
    }
    expect(
      (
        await db.query(
          "SELECT count(*)::int AS count FROM region_lab_runs WHERE experiment_id=$1",
          [e.id],
        )
      )[0].count,
    ).toBe(100);
    const replay = await store.submit(owner.id, e.id, {
      expectedRevision: 1,
      requestId: first,
    });
    expect(replay.run.id).toBe(firstRun);
    expect(replay.run.retained).toBe(false);
    expect(
      (
        await db.query(
          "SELECT count(*)::int AS count FROM region_lab_requests WHERE owner_id=$1",
          [owner.id],
        )
      )[0].count,
    ).toBe(101);
  });
  it("normalizes UUID case for idempotent HTTP replay", async () => {
    const e = await create(),
      requestId = randomUUID();
    const first = await http
      .post("/v1/region-lab/experiments/" + e.id.toUpperCase() + "/runs")
      .set(auth())
      .send({ expectedRevision: 1, requestId: requestId.toUpperCase() })
      .expect(202);
    const replay = await http
      .post("/v1/region-lab/experiments/" + e.id + "/runs")
      .set(auth())
      .send({ expectedRevision: 1, requestId })
      .expect(200);
    expect(replay.body.data.run.id).toBe(first.body.data.run.id);
    const uppercaseReplay = await http
      .post("/v1/region-lab/experiments/" + e.id.toUpperCase() + "/runs")
      .set(auth())
      .send({ expectedRevision: 1, requestId })
      .expect(200);
    expect(uppercaseReplay.body.data.run.id).toBe(first.body.data.run.id);
  });
  it("keeps metadata out of numerical identity while bounding raw scenario bytes", () => {
    const a = frozenSnapshot(scenario()),
      raw = scenario();
    raw.profiles[0].label = "Changed display label";
    raw.network[0].provenance = "Changed assumption note";
    const b = frozenSnapshot(raw);
    expect(a.inputHash).toBe(b.inputHash);
    expect(hash(a)).not.toBe(hash(b));
    expect(() =>
      frozenSnapshot({ note: "x".repeat(REGION_POLICY.maxInputBytes) }),
    ).toThrow("bounded JSON");
  });
  it("bounds the durable queue globally across different owners", async () => {
    for (let i = 0; i < REGION_POLICY.globalQueued / 2; i++) {
      const u = await user();
      const e = await store.create(u.id, {
        name: "Quota fixture",
        description: "",
        scenario: scenario(),
      });
      for (let j = 0; j < 2; j++)
        await store.submit(u.id, e.id, {
          expectedRevision: 1,
          requestId: randomUUID(),
        });
    }
    const e = await create();
    await expect(
      store.submit(owner.id, e.id, {
        expectedRevision: 1,
        requestId: randomUUID(),
      }),
    ).rejects.toThrow("queue");
    expect(
      (
        await db.query(
          "SELECT count(*)::int AS count FROM region_lab_runs WHERE status='queued'",
        )
      )[0].count,
    ).toBe(REGION_POLICY.globalQueued);
  });
  async function recorded(s = scenario(), native = false) {
    const e = await store.create(owner.id, {
      name: "Recorded Stage7",
      description: "",
      scenario: s,
    });
    const accepted = await store.submit(owner.id, e.id, {
      expectedRevision: 1,
      requestId: randomUUID(),
    });
    const row = await store.claim(randomUUID());
    const result = native
      ? simulateRegionLabScenario(row!.snapshot.scenario)
      : await new RegionExecutor().run(
          row!.id,
          row!.lease_token,
          row!.snapshot,
          new AbortController().signal,
        );
    expect(await store.finish(row!.id, row!.lease_token, { result })).toBe(
      true,
    );
    return { e, id: accepted.run.id, result: result as any };
  }
  it("Stage7 executes two paired repetitions with conserved HDR and cohort data in the trusted worker", async () => {
    const s = scenario();
    s.workload.baselineRps = 120;
    s.workload.durationSeconds = 20;
    s.workload.schedule = [
      { atSeconds: 0, multiplier: 1 },
      { atSeconds: 20, multiplier: 1 },
    ];
    s.runOptions = { mode: "paired", seed: 42, repetitions: 2 };
    s.targets.perRegion = [
      { region: "us-east", p95Ms: 1, errorBudgetRatio: 0.01 },
    ];
    s.outage = {
      id: "test_outage",
      scope: "application_deployment",
      region: "eu-west",
      affectedNodeIds: ["eu_app"],
      startSeconds: 3,
      durationSeconds: 6,
      inFlightPolicy: "abort_at_failed_node",
    };
    s.routing.forEach((r: any) => {
      r.detectionMs = 1000;
      r.switchMs = 500;
      r.failbackMs = 1000;
    });
    const { id, result } = await recorded(s);
    expect(result.telemetry.executions).toHaveLength(4);
    for (const rep of result.repetitions) {
      expect(rep.baseline.summary.offeredRequests).toBe(2400);
      expect(rep.outage.summary.offeredRequests).toBe(2400);
    }
    const view = await http
      .get(`/v1/region-lab/runs/${id}/results?scenario=outage&repetition=1`)
      .set(auth())
      .expect(200);
    expect(view.body.data.seed).toBe(result.repetitions[1].seed);
    expect(
      view.body.data.items.find((r: any) => r.region === "us-east").verdict,
    ).toBe("fail");
    expect(
      view.body.data.distributionPlot.reduce(
        (n: number, b: any) => n + b.count,
        0,
      ),
    ).toBe(view.body.data.summary.successfulRequests);
  });
  it("Stage7 gates every numerical result, export, PDF, comparison and version export by owner", async () => {
    const { e, id } = await recorded();
    for (const suffix of [
      "results",
      "export",
      "report",
      `compare?otherId=${id}&right=baseline`,
    ]) {
      await http.get(`/v1/region-lab/runs/${id}/${suffix}`).expect(401);
      await http
        .get(`/v1/region-lab/runs/${id}/${suffix}`)
        .set(auth(other))
        .expect(404);
    }
    await http
      .get(`/v1/region-lab/experiments/${e.id}/versions/1/export`)
      .set(auth(other))
      .expect(404);
    await http
      .get(`/v1/region-lab/experiments/${e.id}/runs`)
      .set(auth(other))
      .expect(404);
  });
  it("Stage7 exposes captured distributions and exactly conserved recorded arrival buckets", async () => {
    const { id } = await recorded();
    const r = await http
      .get(`/v1/region-lab/runs/${id}/results?view=timeline`)
      .set(auth())
      .expect(200);
    expect(r.body.data.distributionStatus).toBe("captured");
    expect(r.body.data.distribution.count).toBe(10);
    expect(
      r.body.data.items.reduce((n: number, b: any) => n + b.offeredRequests, 0),
    ).toBe(10);
    expect(r.body.data.summary.latency.p95Ms).toBeNull();
  });
  it("Stage7 rejects unavailable sides/repetitions, invalid queries and cross-view cursors", async () => {
    const { id } = await recorded();
    for (const q of ["scenario=outage", "repetition=1"])
      await http
        .get(`/v1/region-lab/runs/${id}/results?${q}`)
        .set(auth())
        .expect(409);
    for (const q of ["limit=121", "extra=true", "cursor=bad"])
      await http
        .get(`/v1/region-lab/runs/${id}/results?${q}`)
        .set(auth())
        .expect(422);
    const a = await http
      .get(`/v1/region-lab/runs/${id}/results?view=regions&limit=1`)
      .set(auth())
      .expect(200);
    expect(a.body.data.nextCursor).toBeTruthy();
    await http
      .get(
        `/v1/region-lab/runs/${id}/results?view=components&cursor=${a.body.data.nextCursor}`,
      )
      .set(auth())
      .expect(422);
    const b = await http
      .get(
        `/v1/region-lab/runs/${id}/results?view=regions&limit=1&cursor=${a.body.data.nextCursor}`,
      )
      .set(auth())
      .expect(200);
    expect(b.body.data.items[0].region).not.toBe(a.body.data.items[0].region);
  });
  it("Stage7 refuses numerical exports before completion and never recomputes native legacy results", async () => {
    const queued = await enqueue();
    for (const kind of ["results", "export", "report"])
      await http
        .get(`/v1/region-lab/runs/${queued.run.id}/${kind}`)
        .set(auth())
        .expect(409);
    await store.cancel(owner.id, queued.run.id);
    const legacy = await recorded(scenario(), true);
    const view = await http
      .get(`/v1/region-lab/runs/${legacy.id}/results?view=timeline`)
      .set(auth())
      .expect(200);
    expect(view.body.data.distributionStatus).toBe(
      "unavailable_for_legacy_run",
    );
    expect(view.body.data.items).toEqual([]);
    const exported = await http
      .get(`/v1/region-lab/runs/${legacy.id}/export`)
      .set(auth())
      .expect(200);
    expect(hash(exported.body.result)).toBe(hash(legacy.result));
    expect(exported.body.result.telemetry).toBeUndefined();
  });
  it("Stage7 downloads byte-valid private PDF and JSON with frozen inputs and safe headers", async () => {
    const { e, id, result } = await recorded();
    await store.patch(owner.id, e.id, {
      expectedRevision: 1,
      name: "New live name",
    });
    const json = await http
      .get(`/v1/region-lab/runs/${id}/export`)
      .set(auth())
      .expect(200);
    expect(json.body.snapshot.metadata.name).toBe("Recorded Stage7");
    const stale = await http
      .get(`/v1/region-lab/runs/${id}/results`)
      .set(auth())
      .expect(200);
    expect(stale.body.data.isCurrentRevision).toBe(false);
    expect(stale.body.data.currentRevision).toBe(2);
    expect(stale.body.data.experimentRevision).toBe(1);
    expect(json.body.result).toEqual(result);
    expect(json.body.run.experimentRevision).toBe(1);
    expect(json.headers["cache-control"]).toMatch(/no-store/);
    const version = await http
      .get(`/v1/region-lab/experiments/${e.id}/versions/1/export`)
      .set(auth())
      .expect(200);
    expect(version.body.snapshot.name).toBe("Recorded Stage7");
    const pdf = await http
      .get(`/v1/region-lab/runs/${id}/report`)
      .set(auth())
      .expect(200);
    const { PDFDocument } = await import("pdf-lib");
    const document = await PDFDocument.load(pdf.body);
    expect(document.getPageCount()).toBeGreaterThan(0);
    expect(pdf.headers["content-type"]).toMatch(/application\/pdf/);
    expect(JSON.stringify(json.body)).not.toMatch(
      /lease_token|worker_instance|accessToken|password_hash/,
    );
  });
  it("Stage7 withholds deltas for incompatible workload or code and compares compatible saved sides", async () => {
    const a = await recorded(),
      s = scenario();
    s.workload.baselineRps = 2;
    const b = await recorded(s);
    const ok = await http
      .get(`/v1/region-lab/runs/${a.id}/compare?otherId=${a.id}&right=baseline`)
      .set(auth())
      .expect(200);
    expect(ok.body.data.comparable).toBe(true);
    expect(
      ok.body.data.items.find((r: any) => r.metric === "offeredRequests").delta,
    ).toBe(0);
    const mismatch = await http
      .get(`/v1/region-lab/runs/${a.id}/compare?otherId=${b.id}&right=baseline`)
      .set(auth())
      .expect(200);
    expect(mismatch.body.data.comparable).toBe(false);
    expect(mismatch.body.data.reasons).toContain("workload");
    expect(mismatch.body.data.items.every((r: any) => r.delta === null)).toBe(
      true,
    );
    await http
      .get(`/v1/region-lab/runs/${a.id}/compare?otherId=${randomUUID()}`)
      .set(auth())
      .expect(404);
  });
  it("Stage7 account manifest is owner-only and includes immutable version/run download paths without leases", async () => {
    const a = await recorded();
    const { regionAccountExport } =
      await import("@/modules/region-lab/results/region-account-export");
    const own = await regionAccountExport(db, owner.id),
      foreign = await regionAccountExport(db, other.id);
    expect(own.runs[0].id).toBe(a.id);
    expect(own.versions[0].snapshotUrl).toContain("/versions/1/export");
    expect(foreign.runs).toEqual([]);
    expect(foreign.experiments).toEqual([]);
    expect(JSON.stringify(own)).not.toMatch(
      /lease_token|worker_instance|password_hash|accessToken/,
    );
  });
  it("Stage7 histories page retained run records without skipping identical-millisecond timestamps", async () => {
    const { e, id } = await recorded();
    await store.submit(owner.id, e.id, {
      expectedRevision: 1,
      requestId: randomUUID(),
    });
    const page = await http
      .get(`/v1/region-lab/experiments/${e.id}/runs?limit=1`)
      .set(auth())
      .expect(200);
    expect(page.body.data.nextCursor).toBeTruthy();
    const last = await http
      .get(
        `/v1/region-lab/experiments/${e.id}/runs?limit=1&before=${page.body.data.nextCursor}`,
      )
      .set(auth())
      .expect(200);
    expect(last.body.data.items[0].id).toBe(id);
  });

  (process.env.SF_REGION_STAGE7_SERVE === "1" ? it : it.skip)(
    "Stage7 browser fixture serves only the disposable module until its stop file arrives",
    async () => {
      if (process.env.SF_REGION_STAGE7_SERVE !== "1") return;
      const { existsSync } = await import("node:fs"),
        { tmpdir } = await import("node:os");
      const job = scheduler();
      job.onApplicationBootstrap();
      await app.listen(5057, "127.0.0.1");
      const deadline = Date.now() + 15 * 60 * 1000;
      while (
        !existsSync(resolve(tmpdir(), "sf-stage7-browser-stop")) &&
        Date.now() < deadline
      )
        await new Promise((r) => setTimeout(r, 250));
    },
    16 * 60 * 1000,
  );
  it("migration rollback refuses populated data and restores an empty disposable schema", async () => {
    await create();
    const migration = new RegionLabStorage1795600000000(),
      q = db.createQueryRunner();
    await expect(migration.down(q)).rejects.toThrow("Refusing");
    expect((await store.list(owner.id, {})).items).toHaveLength(1);
    await db.query("DELETE FROM users");
    await q.startTransaction();
    await migration.down(q);
    await q.commitTransaction();
    expect(
      (await db.query("SELECT to_regclass('region_lab_runs') AS table"))[0]
        .table,
    ).toBeNull();
    await q.startTransaction();
    await migration.up(q);
    await q.commitTransaction();
    await q.release();
  });
});
