import { SimulationService } from "@/modules/simulation/simulation.service";
import { Test } from "@nestjs/testing";
import { NestExpressApplication } from "@nestjs/platform-express";
import { DataSource } from "typeorm";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { Worker } from "node:worker_threads";
import { join } from "node:path";
import { AppModule } from "@/src/app.module";
import { configureApp, setupSwagger } from "@/src/app.setup";
import { RedisCacheService } from "@/providers/cache/redis/redis-cache.service";
import { FakeRedisCacheService } from "../test/fake-redis";
import { SavedRun } from "@/modules/designs/entities/design-run.entity";
import { RunsService } from "@/modules/designs/runs.service";
import { SimulationExecutor } from "@/modules/simulation/worker/simulation-executor";
import { createComputeWorker } from "@/modules/simulation/worker/worker-factory";
import { getTemplates } from "@/modules/simulation/engine/templates";
import { runSchema, designSchema } from "@/common/contracts/phase2/api.schema";
import type { DesignRun } from "@/common/contracts/phase2/api.schema";
jest.setTimeout(30000);
describe("M3 saved designs and simulation (isolated database)", () => {
  let app: NestExpressApplication,
    db: DataSource,
    http: ReturnType<typeof request>,
    token: string,
    foreign: string;
  let fault: "crash" | "hang" | undefined;
  let executor: SimulationExecutor;
  const auth = () => ({ Authorization: "Bearer " + token });
  async function boot() {
    executor = new SimulationExecutor(() => {
      if (!fault) return createComputeWorker();
      const mode = fault;
      fault = undefined;
      return new Worker(join(__dirname, "fixtures/compute-fault.cjs"), {
        workerData: { mode },
      });
    });
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RedisCacheService)
      .useValue(new FakeRedisCacheService())
      .overrideProvider(SimulationExecutor)
      .useValue(executor)
      .compile();
    app = mod.createNestApplication<NestExpressApplication>();
    configureApp(app);
    db = app.get(DataSource);
    await db.runMigrations();
    setupSwagger(app);
    await app.init();
    http = request(app.getHttpServer());
  }
  beforeAll(async () => {
    await boot();
    for (const who of ["owner", "other"]) {
      const r = await http
        .post("/v1/auth/register")
        .send({
          email: who + randomUUID() + "@example.test",
          password: "M3-audit-pass-2026!",
          displayName: who,
        })
        .expect(201);
      if (who === "owner") token = r.body.data.accessToken;
      else foreign = r.body.data.accessToken;
    }
  });
  afterAll(async () => {
    await app?.close();
  });
  async function create() {
    const t = getTemplates().find((t) => t.id === "mvp")!;
    const r = await http
      .post("/v1/designs")
      .set(auth())
      .send({
        schemaVersion: 1,
        name: t.name,
        description: t.blurb,
        source: "template",
        templateId: t.id,
        graph: t.graph,
        traffic: t.traffic,
      })
      .expect(201);
    return designSchema.parse(r.body.data);
  }
  async function terminal(id: string, runId: string) {
    for (let i = 0; i < 100; i++) {
      const r = await http
        .get("/v1/designs/" + id + "/runs/" + runId)
        .set(auth())
        .expect(200);
      const run = runSchema.parse(r.body.data);
      if (run.status !== "pending") return run;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("Run remained pending");
  }
  it("authenticates all new routes and publishes only mounted contracts", async () => {
    for (const path of [
      "/designs",
      "/templates",
      "/simulation/catalog",
      "/dashboard",
    ])
      await http.get("/v1" + path).expect(401);
    const docs = await http.get("/docs-json").expect(200);
    expect(
      docs.body.paths["/v1/designs/{id}/simulate"].post.responses["202"],
    ).toBeDefined();
    expect(docs.body.paths["/v1/simulation/preview"]).toBeUndefined();
    expect(docs.body.paths["/v1/designs/{id}/limits"]).toBeUndefined();
    await http
      .get("/v1/templates")
      .set(auth())
      .expect(200)
      .expect((r) => expect(r.body.data).toHaveLength(6));
    await http
      .get("/v1/simulation/catalog")
      .set(auth())
      .expect(200)
      .expect((r) => expect(r.body.data.components).toHaveLength(12));
  });
  it("persists drafts, scopes ownership, rejects unknown fields and validates pagination", async () => {
    const d = await create();
    await http
      .get("/v1/designs/" + d.id)
      .set({ Authorization: "Bearer " + foreign })
      .expect(403)
      .expect((r) => expect(JSON.stringify(r.body)).not.toContain(d.name));
    await http
      .patch("/v1/designs/" + d.id)
      .set({ Authorization: "Bearer " + foreign })
      .send({ expectedRevision: 1, name: "stolen" })
      .expect(403);
    await http
      .delete("/v1/designs/" + d.id)
      .set({ Authorization: "Bearer " + foreign })
      .expect(403);
    await http
      .get("/v1/designs/" + randomUUID())
      .set(auth())
      .expect(404);
    await http
      .patch("/v1/designs/" + d.id)
      .set(auth())
      .send({ expectedRevision: 1, ownerId: randomUUID() })
      .expect(422);
    await http.get("/v1/designs?page=0").set(auth()).expect(422);
    const list = await http
      .get("/v1/designs?page=1&pageSize=50")
      .set({ Authorization: "Bearer " + foreign })
      .expect(200);
    expect(list.body.data).toEqual([]);
    expect(list.body.meta.total).toBe(0);
    const empty = await http
      .patch("/v1/designs/" + d.id)
      .set(auth())
      .send({ expectedRevision: 1, graph: { nodes: [], edges: [] } })
      .expect(200);
    await http
      .post("/v1/designs/" + d.id + "/validate")
      .set(auth())
      .send({ expectedRevision: empty.body.data.revision })
      .expect(200)
      .expect((r) => expect(r.body.data.ok).toBe(false));
    await http
      .post("/v1/designs/" + d.id + "/simulate")
      .set(auth())
      .send({ expectedRevision: 2, requestId: randomUUID() })
      .expect(422);
  });
  it("allows exactly one concurrent save and retains an immutable simulation snapshot", async () => {
    const d = await create();
    const saves = await Promise.all(
      ["A", "B"].map((name) =>
        http
          .patch("/v1/designs/" + d.id)
          .set(auth())
          .send({ expectedRevision: 1, name }),
      ),
    );
    expect(saves.map((r) => r.status).sort()).toEqual([200, 409]);
    const graph = structuredClone(d.graph),
      node = graph.nodes.find((n) => n.type === "app")!;
    node.props = { ...node.props, replicas: 3 };
    await http
      .patch("/v1/designs/" + d.id)
      .set(auth())
      .send({ expectedRevision: 2, graph })
      .expect(200);
    const body = { expectedRevision: 3, requestId: randomUUID() };
    const [a, b] = await Promise.all([
      http
        .post("/v1/designs/" + d.id + "/simulate")
        .set(auth())
        .send(body),
      http
        .post("/v1/designs/" + d.id + "/simulate")
        .set(auth())
        .send(body),
    ]);
    expect([a.status, b.status]).toEqual([202, 202]);
    expect(a.body.data.run.id).toBe(b.body.data.run.id);
    await http
      .patch("/v1/designs/" + d.id)
      .set(auth())
      .send({ expectedRevision: 3, name: "newer" })
      .expect(200);
    const run = await terminal(d.id, a.body.data.run.id);
    expect(run.status).toBe("completed");
    expect(run.snapshot.graph).toEqual(graph);
    expect(run.designRevision).toBe(3);
    const replay = await http
      .post("/v1/designs/" + d.id + "/simulate")
      .set(auth())
      .send(body)
      .expect(200);
    expect(replay.body.data.run.id).toBe(run.id);
    await http
      .post("/v1/designs/" + d.id + "/simulate")
      .set(auth())
      .send({ ...body, expectedRevision: 4 })
      .expect(409);
    await http
      .get("/v1/designs/" + d.id + "/runs/" + run.id)
      .set({ Authorization: "Bearer " + foreign })
      .expect(403);
    await http
      .get("/v1/dashboard")
      .set(auth())
      .expect(200)
      .expect((r) =>
        expect(
          r.body.data.recentRuns.some((x: { id: string }) => x.id === run.id),
        ).toBe(true),
      );
    await http
      .get("/v1/dashboard")
      .set({ Authorization: "Bearer " + foreign })
      .expect(200)
      .expect((r) =>
        expect(r.body.data.counts).toEqual({ designs: 0, retainedRuns: 0 }),
      );
    const second = await create();
    await http
      .get("/v1/designs/" + second.id + "/runs/" + run.id)
      .set(auth())
      .expect(404);
  });
  it("recovers after a real worker crash and timeout while health responds", async () => {
    await executor.close();
    // Replace the closed test executor with a fresh fault factory through its service reference.
    executor = new SimulationExecutor(() => {
      if (!fault) return createComputeWorker();
      const mode = fault;
      fault = undefined;
      return new Worker(join(__dirname, "fixtures/compute-fault.cjs"), {
        workerData: { mode },
      });
    });
    const simulation = app.get(SimulationService) as {
      executor: SimulationExecutor;
    };
    simulation.executor = executor;
    for (const mode of ["crash", "hang"] as const) {
      fault = mode;
      const d = await create();
      const r = await http
        .post("/v1/designs/" + d.id + "/simulate")
        .set(auth())
        .send({ expectedRevision: 1, requestId: randomUUID() })
        .expect(202);
      await http.get("/v1/health").expect(200);
      const run = await terminal(d.id, r.body.data.run.id);
      expect(run.status).toBe("failed");
      if (run.status === "failed")
        expect(run.failure.code).toBe(
          mode === "crash" ? "WORKER_CRASH" : "TIMEOUT",
        );
    }
    const d = await create();
    const r = await http
      .post("/v1/designs/" + d.id + "/simulate")
      .set(auth())
      .send({ expectedRevision: 1, requestId: randomUUID() })
      .expect(202);
    expect((await terminal(d.id, r.body.data.run.id)).status).toBe("completed");
  });
  it("deletion cascades results and late work cannot recreate rows", async () => {
    const d = await create();
    const r = await http
      .post("/v1/designs/" + d.id + "/simulate")
      .set(auth())
      .send({ expectedRevision: 1, requestId: randomUUID() })
      .expect(202);
    await http
      .delete("/v1/designs/" + d.id)
      .set(auth())
      .expect(204);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(await db.getRepository(SavedRun).countBy({ designId: d.id })).toBe(
      0,
    );
    await http
      .get("/v1/designs/" + d.id + "/runs/" + r.body.data.run.id)
      .set(auth())
      .expect(404);
  });
  it("releases admission when persistence fails before acceptance", async () => {
    const d = await create(),
      body = { expectedRevision: 1, requestId: randomUUID() };
    const transaction = jest
      .spyOn(db, "transaction")
      .mockRejectedValueOnce(
        Object.assign(new Error("test-only unavailable database"), {
          code: "ECONNREFUSED",
        }),
      );
    await http
      .post("/v1/designs/" + d.id + "/simulate")
      .set(auth())
      .send(body)
      .expect(503);
    transaction.mockRestore();
    expect(executor.state.reservations).toBe(0);
    expect(await db.getRepository(SavedRun).countBy({ designId: d.id })).toBe(
      0,
    );
    const accepted = await http
      .post("/v1/designs/" + d.id + "/simulate")
      .set(auth())
      .send(body)
      .expect(202);
    expect((await terminal(d.id, accepted.body.data.run.id)).status).toBe(
      "completed",
    );
  });
  it("reconciles a failed finalization after database recovery and releases the worker", async () => {
    const d = await create(),
      repo = db.getRepository(SavedRun);
    const write = jest
      .spyOn(repo, "update")
      .mockRejectedValueOnce(new Error("test-only finalization failure"));
    const accepted = await http
      .post("/v1/designs/" + d.id + "/simulate")
      .set(auth())
      .send({ expectedRevision: 1, requestId: randomUUID() })
      .expect(202);
    for (let i = 0; i < 100 && write.mock.calls.length === 0; i++)
      await new Promise((r) => setTimeout(r, 30));
    expect(write).toHaveBeenCalled();
    write.mockRestore();
    await new Promise((r) => setTimeout(r, 50));
    expect(executor.state.reservations).toBe(0);
    const id = accepted.body.data.run.id;
    expect((await repo.findOneByOrFail({ id })).status).toBe("pending");
    await http
      .post("/v1/designs/" + d.id + "/simulate")
      .set(auth())
      .send({ expectedRevision: 1, requestId: randomUUID() })
      .expect(429);
    await repo.update(id, { createdAt: new Date(Date.now() - 60000) });
    await app.get(RunsService).reconcile(false);
    expect((await repo.findOneByOrFail({ id })).payload).toMatchObject({
      status: "failed",
      failure: { code: "INTERRUPTED" },
    });
  });
  it("reopens the same completed inputs and results after an actual app restart", async () => {
    const d = await create();
    const response = await http
      .post("/v1/designs/" + d.id + "/simulate")
      .set(auth())
      .send({ expectedRevision: 1, requestId: randomUUID() })
      .expect(202);
    const original = await terminal(d.id, response.body.data.run.id);
    const interruptedId = randomUUID(),
      interruptedRequest = randomUUID();
    const pending: DesignRun = {
      ...original,
      id: interruptedId,
      requestId: interruptedRequest,
      status: "pending",
      completedAt: null,
      result: null,
      failure: null,
    };
    await db.getRepository(SavedRun).insert({
      id: interruptedId,
      designId: d.id,
      requestId: interruptedRequest,
      status: "pending",
      createdAt: new Date(),
      completedAt: null,
      payload: pending,
    });
    await app.close();
    await boot();
    const loaded = await http
      .get("/v1/designs/" + d.id)
      .set(auth())
      .expect(200);
    expect(loaded.body.data.graph).toEqual(d.graph);
    const reopened = await terminal(d.id, original.id);
    expect(reopened).toEqual(original);
    const interrupted = await terminal(d.id, interruptedId);
    expect(interrupted).toMatchObject({
      status: "failed",
      failure: { code: "INTERRUPTED" },
    });
  });

  it("reconciles interrupted records and protects 24h keys before pruning to 50", async () => {
    const d = await create();
    const started = await http
      .post("/v1/designs/" + d.id + "/simulate")
      .set(auth())
      .send({ expectedRevision: 1, requestId: randomUUID() })
      .expect(202);
    const original = await terminal(d.id, started.body.data.run.id);
    const interruptedId = randomUUID();
    const pending: DesignRun = {
      ...original,
      id: interruptedId,
      requestId: randomUUID(),
      status: "pending",
      result: null,
      failure: null,
      completedAt: null,
    };
    await db.getRepository(SavedRun).insert({
      id: interruptedId,
      designId: d.id,
      requestId: pending.requestId,
      status: "pending",
      createdAt: new Date(),
      completedAt: null,
      payload: pending,
    });
    await app.get(RunsService).reconcile(true);
    expect(
      (await db.getRepository(SavedRun).findOneByOrFail({ id: interruptedId }))
        .payload.status,
    ).toBe("failed");
    const repo = db.getRepository(SavedRun);
    for (let i = 0; i < 55; i++) {
      const id = randomUUID(),
        requestId = randomUUID(),
        date = new Date(Date.now() - 48 * 3600000 - i * 1000),
        payload = { ...original, id, requestId, createdAt: date.toISOString() };
      await repo.insert({
        id,
        designId: d.id,
        requestId,
        status: "completed",
        createdAt: date,
        completedAt: date,
        payload,
      });
    }
    await app.get(RunsService).prune(d.id);
    expect(await repo.countBy({ designId: d.id })).toBe(50);
    expect(await repo.findOneBy({ id: original.id })).not.toBeNull();
    expect(await repo.findOneBy({ id: interruptedId })).not.toBeNull();
  });
});
