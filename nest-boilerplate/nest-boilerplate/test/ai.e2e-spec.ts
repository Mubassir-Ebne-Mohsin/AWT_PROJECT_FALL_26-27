import { Test } from "@nestjs/testing";
import { NestExpressApplication } from "@nestjs/platform-express";
import { DataSource } from "typeorm";
import request from "supertest";
import { createServer, Server, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { AppModule } from "@/src/app.module";
import { configureApp, setupSwagger } from "@/src/app.setup";
import { dataSourceOptions } from "@/config/database.config";
import { CreateUsers1761000000000 } from "@/database/migrations/1761000000000-CreateUsers";
import { CreateDesigns1792800000000 } from "@/database/migrations/1792800000000-CreateDesigns";
import { RedisCacheService } from "@/providers/cache/redis/redis-cache.service";
import { FakeRedisCacheService } from "../test/fake-redis";
import { AI_SETTINGS, AiSettings } from "@/modules/ai/ai.settings";
import { AiMemory } from "@/modules/ai/ai-memory";
import { AppException } from "@/common/errors";
import type { ProviderObservation } from "@/modules/ai/provider";
import { EXPLANATION_PROVIDER, ExplanationProvider, HOSTED_DIGEST } from "@/modules/ai/provider";
import { getTemplates } from "@/modules/simulation/engine/templates";
import {
  aiEvidenceSchema,
  aiJobSchema,
  designVersionSchema,
} from "@/common/contracts/phase3/ai.schema";
import { phase3OpenApi } from "@/common/contracts/phase3/openapi";
jest.setTimeout(60000);
const pause = (ms = 50) => new Promise((r) => setTimeout(r, ms));
describe("M11 AI foundation (isolated Postgres and real mock HTTP upstream)", () => {
  let app: NestExpressApplication,
    db: DataSource,
    http: ReturnType<typeof request>,
    upstream: Server,
    redis: FakeRedisCacheService;
  let owner: string, foreign: string;
  let mode = "success",
    loaded = false,
    digest = "a".repeat(64),
    chats = 0,
    hits = 0,
    aborts = 0;
  // Claims that are true of the run just computed; the mock model echoes them so jobs can complete.
  let claims: string[] = [];
  let physical = 10000,
    commit = 10000;
  let held: ServerResponse[] = [];
  const settings: AiSettings = {
    enabled: true,
    model: "qwen2.5:1.5b",
    baseUrl: "",
    deadlineMs: 6000,
    minFreeMiB: 1536,
    minCommitMiB: 4096,
  };
  const auth = () => ({ Authorization: "Bearer " + owner });
  const body = () => ({
    model: settings.model,
    done: true,
    done_reason: mode === "truncated" ? "length" : "stop",
    message: {
      content:
        mode === "invalid"
          ? "not json"
          : JSON.stringify({
              summary:
                mode === "bad-figure"
                  ? "The recorded p95 is 31 ms."
                  : "The saved model has an inspectable verdict.",
              evidenceIds: [mode === "bad-ref" ? "invented" : "verdict"],
              claims:
                mode === "no-claims"
                  ? undefined
                  : mode === "false-claim"
                    ? [claims[0] === "latency_above_target" ? "latency_within_target" : "latency_above_target"]
                    : claims,
            }),
    },
  });
  const release = () => {
    loaded = false;
    for (const res of held)
      if (!res.destroyed && !res.writableEnded) res.end(JSON.stringify(body()));
    held = [];
  };
  async function boot(provider?: ExplanationProvider) {
    redis = new FakeRedisCacheService();
    let builder = Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RedisCacheService)
      .useValue(redis)
      .overrideProvider(AI_SETTINGS)
      .useValue(settings)
      .overrideProvider(AiMemory)
      .useValue({
        sample: async () => ({ physicalMiB: physical, commitMiB: commit }),
      });
    // A hosted provider stand-in replaces the configured one; with none given the Ollama mock upstream is used.
    if (provider) builder = builder.overrideProvider(EXPLANATION_PROVIDER).useValue(provider);
    const module = await builder.compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureApp(app);
    db = app.get(DataSource);
    await db.runMigrations();
    setupSwagger(app);
    await app.init();
    http = request(app.getHttpServer());
  }
  beforeAll(async () => {
    upstream = createServer((req, res) => {
      hits++;
      res.setHeader("Content-Type", "application/json");
      if (mode === "down") {
        res.statusCode = 503;
        res.end("{}");
        return;
      }
      if (req.url === "/api/tags") {
        res.end(
          JSON.stringify({
            models:
              mode === "missing-model"
                ? []
                : [{ name: settings.model, digest }],
          }),
        );
        return;
      }
      if (req.url === "/api/ps") {
        res.end(
          JSON.stringify({ models: loaded ? [{ name: settings.model }] : [] }),
        );
        return;
      }
      let text = "";
      req.on("data", (chunk) => {
        text += chunk;
      });
      req.on("end", () => {
        if (req.url === "/api/generate") {
          if (mode !== "cancel-delayed") release();
          res.end('{"done":true}');
          return;
        }
        chats++;
        loaded = true;
        const input = JSON.parse(text);
        expect(input.options.num_ctx).toBe(2048);
        expect(input.keep_alive).toBe(0);
        if (["hold", "cancel-delayed"].includes(mode)) {
          held.push(res);
          res.on("close", () => {
            if (!res.writableEnded) {
              aborts++;
              if (mode !== "cancel-delayed") loaded = false;
            }
          });
          return;
        }
        if (mode === "model-change") digest = "b".repeat(64);
        loaded = false;
        if (mode === "oversize") res.end("x".repeat(17000));
        else res.end(JSON.stringify(body()));
      });
    });
    await new Promise<void>((r) => upstream.listen(0, "127.0.0.1", r));
    settings.baseUrl =
      "http://127.0.0.1:" + (upstream.address() as { port: number }).port;
    // Upgrade/rollback/re-upgrade on disposable DB: old rows must retain only a truthful current baseline.
    if (dataSourceOptions.type !== "postgres")
      throw new Error("M11 migration checks require PostgreSQL");
    const migrationName =
      "sf_m11_migration_" + randomUUID().replaceAll("-", "").slice(0, 12);
    const admin = new DataSource({
      ...dataSourceOptions,
      type: "postgres" as const,
      database: "postgres",
    });
    await admin.initialize();
    await admin.query(`CREATE DATABASE "${migrationName}"`);
    await admin.destroy();
    const migrationOptions = {
      ...dataSourceOptions,
      type: "postgres" as const,
      database: migrationName,
    };
    let migrationDb = new DataSource({
      ...migrationOptions,
      migrations: [CreateUsers1761000000000, CreateDesigns1792800000000],
    });
    await migrationDb.initialize();
    await migrationDb.runMigrations();
    const user = randomUUID(),
      design = randomUUID();
    await migrationDb.query(
      "INSERT INTO users(id,email,password_hash,display_name,role) VALUES($1,$2,'test-only-not-a-real-hash','Legacy','user')",
      [user, user + "@example.test"],
    );
    const template = getTemplates().find((t) => t.id === "mvp")!;
    await migrationDb.query(
      "INSERT INTO designs(id,owner_id,name,description,source,template_id,schema_version,graph,traffic,revision) VALUES($1,$2,'Legacy baseline','before M11','template','mvp',1,$3,$4,7)",
      [
        design,
        user,
        JSON.stringify(template.graph),
        JSON.stringify(template.traffic),
      ],
    );
    await migrationDb.destroy();
    migrationDb = new DataSource(migrationOptions);
    await migrationDb.initialize();
    await migrationDb.runMigrations();
    const before = await migrationDb.query(
      "SELECT * FROM design_versions WHERE design_id=$1",
      [design],
    );
    expect(before).toHaveLength(1);
    expect(before[0].origin).toBe("baseline");
    expect(before[0].revision).toBe(7);
    expect(
      designVersionSchema.parse({
        ...{
          id: before[0].id,
          designId: design,
          revision: 7,
          origin: "baseline",
          createdAt: before[0].created_at.toISOString(),
          snapshot: before[0].snapshot,
        },
      }).snapshot.name,
    ).toBe("Legacy baseline");
    await migrationDb.undoLastMigration();
    expect(
      (
        await migrationDb.query("SELECT revision FROM designs WHERE id=$1", [
          design,
        ])
      )[0].revision,
    ).toBe(7);
    await migrationDb.runMigrations();
    expect(
      await migrationDb.query(
        "SELECT revision FROM design_versions WHERE design_id=$1",
        [design],
      ),
    ).toHaveLength(1);
    await migrationDb.destroy();
    await boot();
    for (const name of ["owner", "foreign"]) {
      const r = await http
        .post("/v1/auth/register")
        .send({
          email: randomUUID() + "@example.test",
          password: "M11-Disposable-Only!",
          displayName: name,
        })
        .expect(201);
      if (name === "owner") owner = r.body.data.accessToken;
      else foreign = r.body.data.accessToken;
    }
  });
  afterAll(async () => {
    release();
    await app?.close();
    upstream?.closeAllConnections();
    await new Promise<void>((r) => upstream?.close(() => r()));
  });
  beforeEach(async () => {
    release();
    mode = "success";
    digest = "a".repeat(64);
    physical = commit = 10000;
    settings.enabled = true;
    await available();
  });
  async function available() {
    for (let i = 0; i < 160; i++) {
      const r = await http.get("/v1/ai/readiness").set(auth());
      if (r.body.data?.ready) return;
      await pause();
    }
    throw new Error("AI capacity did not recover");
  }
  async function designRun() {
    const t = getTemplates().find((t) => t.id === "mvp")!;
    const d = (
      await http
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
        .expect(201)
    ).body.data;
    const accepted = (
      await http
        .post(`/v1/designs/${d.id}/simulate`)
        .set(auth())
        .send({ expectedRevision: 1, requestId: randomUUID() })
        .expect(202)
    ).body.data;
    for (let i = 0; i < 150; i++) {
      const r = (await http.get(accepted.statusUrl).set(auth()).expect(200))
        .body.data;
      if (r.status === "completed") {
        const sm = r.result.summary;
        claims = [
          sm.p95 > sm.traffic.sloP95 ? "latency_above_target" : "latency_within_target",
          sm.bottleneckId ? "bottleneck_identified" : "no_bottleneck_identified",
        ];
      }
      if (r.status === "completed")
        return {
          design: d,
          request: {
            designId: d.id,
            expectedRevision: 1,
            runId: r.id,
            requestId: randomUUID(),
          },
        };
      if (r.status === "failed") throw new Error("Fixture calculation failed");
      await pause();
    }
    throw new Error("Fixture calculation remained pending");
  }
  async function terminal(id: string) {
    for (let i = 0; i < 180; i++) {
      const r = (await http.get(`/v1/ai/jobs/${id}`).set(auth()).expect(200))
        .body.data;
      if (r.status !== "pending") return aiJobSchema.parse(r);
      await pause();
    }
    throw new Error("AI job remained pending");
  }
  it("publishes canonical mounted contracts, protects routes and never lets readiness load a model", async () => {
    await http.get("/v1/ai/readiness").expect(401);
    const count = chats;
    await http.get("/v1/ai/readiness").set(auth()).expect(200);
    expect(chats).toBe(count);
    const r = await http.get("/docs-json").expect(200);
    for (const [p, definition] of Object.entries(phase3OpenApi().paths))
      expect(r.body.paths[p]).toEqual(definition);
    writeFileSync(
      resolve(__dirname, "../../../docs/contracts/m11-runtime.openapi.json"),
      JSON.stringify(r.body, null, 2) + "\n",
    );
  });
  it("records immutable versions atomically, rejects stale saves and paginates owned snapshots", async () => {
    const { design: d } = await designRun();
    await http
      .patch(`/v1/designs/${d.id}`)
      .set(auth())
      .send({ expectedRevision: 1, name: "Revision two" })
      .expect(200);
    await http
      .patch(`/v1/designs/${d.id}`)
      .set(auth())
      .send({ expectedRevision: 1, name: "stale" })
      .expect(409);
    const versions = (
      await http.get(`/v1/designs/${d.id}/versions`).set(auth()).expect(200)
    ).body.data;
    expect(versions.map((v: any) => v.revision)).toEqual([2, 1]);
    expect(versions[1].snapshot.name).toBe(d.name);
    expect(
      (
        await http
          .get(`/v1/designs/${d.id}/versions?beforeRevision=2&limit=1`)
          .set(auth())
          .expect(200)
      ).body.data,
    ).toHaveLength(1);
    await http
      .get(`/v1/designs/${d.id}/versions?limit=51`)
      .set(auth())
      .expect(422);
    await http
      .get(`/v1/designs/${d.id}/versions`)
      .set({ Authorization: "Bearer " + foreign })
      .expect(403);
  });
  it("completes a bounded job with provenance and retained request-id replay without exposing facts", async () => {
    const { request: d } = await designRun();
    const count = chats;
    const a = (await http.post("/v1/ai/jobs").set(auth()).send(d).expect(202))
      .body.data;
    const job = await terminal(a.job.id);
    expect(job.status).toBe("completed");
    expect(job.modelDigest).toBe("a".repeat(64));
    expect(job.experimental).toBe(true);
    expect(job).not.toHaveProperty("facts");
    const replay = (
      await http.post("/v1/ai/jobs").set(auth()).send(d).expect(200)
    ).body.data;
    expect(replay.job.id).toBe(job.id);
    expect(chats).toBe(count + 1);
    await http
      .post("/v1/ai/jobs")
      .set(auth())
      .send({ ...d, expectedRevision: 2 })
      .expect(409);
    await http
      .get(a.statusUrl)
      .set({ Authorization: "Bearer " + foreign })
      .expect(403);
    await http
      .post(a.statusUrl + "/cancel")
      .set({ Authorization: "Bearer " + foreign })
      .expect(403);
  });
  it("serves owner-only verified facts with explicit units that match the recorded run", async () => {
    const { request: d } = await designRun();
    const a = (await http.post("/v1/ai/jobs").set(auth()).send(d).expect(202)).body.data;
    const job = await terminal(a.job.id);
    expect(job.promptVersion).toBe("m12-explain-v1");
    const evidence = aiEvidenceSchema.parse(
      (await http.get(`/v1/ai/jobs/${job.id}/evidence`).set(auth()).expect(200)).body.data,
    );
    const run = (await http.get(`/v1/designs/${d.designId}/runs/${d.runId}`).set(auth()).expect(200)).body.data;
    const summary = run.result.summary;
    expect(evidence).toMatchObject({ jobId: job.id, runId: d.runId, designRevision: 1, structured: true });
    expect(evidence.facts).toMatchObject({
      verdict: summary.verdict,
      p95Ms: summary.p95,
      p95TargetMs: summary.traffic.sloP95,
      errorRateFraction: summary.errorRate,
      errorBudgetFraction: summary.traffic.errorBudget,
    });
    // A missing bottleneck is JSON null with its own evidence id, never a string.
    if (summary.bottleneckId === null) {
      expect(evidence.facts!.bottleneck).toBeNull();
      expect(evidence.evidenceIds).toContain("noBottleneck");
      expect(evidence.evidenceIds).not.toContain("bottleneck");
    } else {
      expect(evidence.facts!.bottleneck!.id).toBe(summary.bottleneckId);
      expect(evidence.evidenceIds).toContain("bottleneck");
    }
    expect(evidence.limitations.join(" ")).toMatch(/not measured/i);
    await http.get(`/v1/ai/jobs/${job.id}/evidence`).expect(401);
    await http
      .get(`/v1/ai/jobs/${job.id}/evidence`)
      .set({ Authorization: "Bearer " + foreign })
      .expect(403);
    await http.get(`/v1/ai/jobs/${randomUUID()}/evidence`).set(auth()).expect(404);
  });
  it("rejects generated prose that cites a figure absent from the verified facts", async () => {
    const { request: d } = await designRun();
    mode = "bad-figure";
    const a = (await http.post("/v1/ai/jobs").set(auth()).send(d).expect(202)).body.data;
    const job = await terminal(a.job.id);
    expect(job.status).toBe("failed");
    expect(job.result).toBeNull();
    expect(job.failure?.reason).toBe("INVALID_OUTPUT");
  });
  it("keeps M11 artifacts readable, labelled unstructured and never reinterpreted as verified", async () => {
    const { request: d } = await designRun();
    const a = (await http.post("/v1/ai/jobs").set(auth()).send(d).expect(202)).body.data;
    const job = await terminal(a.job.id);
    await db.query(
      `UPDATE ai_jobs SET payload = jsonb_set(payload, '{promptVersion}', '"m11-foundation-v1"'),
        facts = '{"revision":1,"verdict":"fail","bottleneckId":null,"evidenceIds":["verdict"]}'::jsonb WHERE id = $1`,
      [job.id],
    );
    const evidence = aiEvidenceSchema.parse(
      (await http.get(`/v1/ai/jobs/${job.id}/evidence`).set(auth()).expect(200)).body.data,
    );
    expect(evidence.structured).toBe(false);
    expect(evidence.facts).toBeNull();
    expect(evidence.limitations.join(" ")).toMatch(/predates verified facts/);
    const legacy = (await http.get(`/v1/ai/jobs/${job.id}`).set(auth()).expect(200)).body.data;
    expect(legacy.promptVersion).toBe("m11-foundation-v1");
    expect(legacy.experimental).toBe(true);
  });
  it("renders accepted claims server-side and rejects missing or false claims", async () => {
    const { request: d } = await designRun();
    const a = (await http.post("/v1/ai/jobs").set(auth()).send(d).expect(202)).body.data;
    const job = await terminal(a.job.id);
    expect(job.status).toBe("completed");
    expect(job.result?.claims?.length).toBeGreaterThan(0);
    const evidence = aiEvidenceSchema.parse(
      (await http.get(`/v1/ai/jobs/${job.id}/evidence`).set(auth()).expect(200)).body.data,
    );
    expect(evidence.statements).toHaveLength(job.result!.claims!.length);
    // Wording and numbers come from the facts, never from model text.
    expect(evidence.statements.join(" ")).toMatch(/p95 latency [\d,.]+ ms is (above|within) the 300 ms target/);
    for (const fault of ["no-claims", "false-claim"]) {
      const next = await designRun();
      mode = fault;
      const b = (await http.post("/v1/ai/jobs").set(auth()).send(next.request).expect(202)).body.data;
      const failed = await terminal(b.job.id);
      expect(failed.status).toBe("failed");
      expect(failed.result).toBeNull();
      expect(failed.failure?.reason).toBe("INVALID_OUTPUT");
    }
  });
  it.each(["invalid", "truncated", "bad-ref", "oversize", "model-change"])(
    "fails closed on provider %s",
    async (fault) => {
      const { request: d } = await designRun();
      mode = fault;
      const a = (await http.post("/v1/ai/jobs").set(auth()).send(d).expect(202))
        .body.data;
      const job = await terminal(a.job.id);
      expect(job.status).toBe("failed");
      expect(job.result).toBeNull();
      expect(job.failure?.reason).toBe(
        fault === "model-change"
          ? "MODEL_CHANGED"
          : fault === "oversize"
            ? "PROVIDER_UNAVAILABLE"
            : "INVALID_OUTPUT",
      );
    },
  );
  it("rejects missing model, provider outage and low physical/commit headroom without generating", async () => {
    const { request: d } = await designRun();
    const count = chats;
    for (const change of ["down", "missing-model", "physical", "commit"]) {
      mode = "success";
      physical = commit = 10000;
      if (change === "physical") physical = 100;
      if (change === "commit") commit = 100;
      else if (["down", "missing-model"].includes(change)) mode = change;
      await http
        .post("/v1/ai/jobs")
        .set(auth())
        .send({ ...d, requestId: randomUUID() })
        .expect(503);
    }
    expect(chats).toBe(count);
    physical = commit = 10000;
    mode = "success";
  });
  it("enforces one global request and keeps cancelled GPU work accounted for until idle", async () => {
    const { request: d } = await designRun();
    mode = "cancel-delayed";
    const first = (
      await http.post("/v1/ai/jobs").set(auth()).send(d).expect(202)
    ).body.data;
    for (let i = 0; i < 50 && !loaded; i++) await pause();
    await http
      .post("/v1/ai/jobs")
      .set(auth())
      .send({ ...d, requestId: randomUUID() })
      .expect(429);
    const count = aborts;
    await http
      .post(first.statusUrl + "/cancel")
      .set(auth())
      .expect(200);
    expect((await terminal(first.job.id)).status).toBe("cancelled");
    await pause(100);
    expect(aborts).toBeGreaterThan(count);
    await http
      .post("/v1/ai/jobs")
      .set(auth())
      .send({ ...d, requestId: randomUUID() })
      .expect(429);
    release();
    await available();
  });
  it("aborts on deadline and leaves input design unchanged", async () => {
    const { design: d, request: q } = await designRun();
    mode = "hold";
    const a = (await http.post("/v1/ai/jobs").set(auth()).send(q).expect(202))
      .body.data;
    expect((await terminal(a.job.id)).failure?.reason).toBe("DEADLINE");
    expect(
      (
        await http
          .get("/v1/designs/" + d.id)
          .set(auth())
          .expect(200)
      ).body.data.revision,
    ).toBe(1);
  });
  it("aborts when runtime commit headroom drops", async () => {
    const { request: d } = await designRun();
    mode = "hold";
    const a = (await http.post("/v1/ai/jobs").set(auth()).send(d).expect(202))
      .body.data;
    commit = 100;
    expect((await terminal(a.job.id)).failure?.reason).toBe("MEMORY_PRESSURE");
    commit = 10000;
  });
  it("keeps core saving/health available with AI disabled, and rejects forged configuration inputs", async () => {
    const { design: d, request: q } = await designRun();
    settings.enabled = false;
    const count = chats;
    expect(
      (await http.get("/v1/ai/readiness").set(auth()).expect(200)).body.data
        .reason,
    ).toBe("DISABLED");
    await http.post("/v1/ai/jobs").set(auth()).send(q).expect(503);
    await http.get("/v1/health").expect(200);
    await http
      .patch("/v1/designs/" + d.id)
      .set(auth())
      .send({ expectedRevision: 1, name: "Core still works" })
      .expect(200);
    expect(chats).toBe(count);
    settings.enabled = true;
    await http
      .post("/v1/ai/jobs")
      .set(auth())
      .send({ ...q, url: "https://evil.invalid", model: "70b" })
      .expect(422);
    await http
      .post("/v1/ai/jobs")
      .set({ Authorization: "Bearer " + foreign })
      .send({ ...q, requestId: randomUUID() })
      .expect(403);
    await http
      .post("/v1/ai/jobs")
      .set(auth())
      .send({ ...q, expectedRevision: 1, requestId: randomUUID() })
      .expect(409);
  });
  it("bounds version retention, pins accepted provenance and cascades only with explicit design deletion", async () => {
    const { design: d, request: q } = await designRun();
    const accepted = (
      await http.post("/v1/ai/jobs").set(auth()).send(q).expect(202)
    ).body.data;
    const job = await terminal(accepted.job.id);
    await available();
    await db.query(
      `INSERT INTO design_versions(id,design_id,revision,origin,snapshot,created_at)
      SELECT gen_random_uuid(),$1,n,'edit',jsonb_set(v.snapshot,'{revision}',to_jsonb(n)),now()
      FROM design_versions v CROSS JOIN generate_series(2,101) n WHERE v.id=$2`,
      [d.id, job.versionId],
    );
    await db.query("UPDATE designs SET revision=101 WHERE id=$1", [d.id]);
    await http
      .patch("/v1/designs/" + d.id)
      .set(auth())
      .send({ expectedRevision: 101, name: "Keep the pinned baseline" })
      .expect(200);
    const remaining = await db.query(
      "SELECT revision FROM design_versions WHERE design_id=$1 ORDER BY revision",
      [d.id],
    );
    expect(remaining).toHaveLength(101);
    expect(remaining[0].revision).toBe(1);
    expect(remaining.some((v: { revision: number }) => v.revision === 2)).toBe(
      false,
    );
    // A direct independent delete is restricted while the job still refers to its snapshot.
    await expect(
      db.query("DELETE FROM design_versions WHERE id=$1", [job.versionId]),
    ).rejects.toBeDefined();
    await http
      .delete("/v1/designs/" + d.id)
      .set(auth())
      .expect(204);
    expect(
      await db.query("SELECT id FROM ai_jobs WHERE design_id=$1", [d.id]),
    ).toHaveLength(0);
    expect(
      await db.query("SELECT id FROM design_versions WHERE design_id=$1", [
        d.id,
      ]),
    ).toHaveLength(0);
  });
  it("keeps one AI instance lease without breaking the other API core", async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RedisCacheService)
      .useValue(new FakeRedisCacheService())
      .overrideProvider(AI_SETTINGS)
      .useValue(settings)
      .overrideProvider(AiMemory)
      .useValue({
        sample: async () => ({ physicalMiB: 10000, commitMiB: 10000 }),
      })
      .compile();
    const second = module.createNestApplication<NestExpressApplication>();
    configureApp(second);
    await second.init();
    try {
      const secondHttp = request(second.getHttpServer());
      expect(
        (await secondHttp.get("/v1/ai/readiness").set(auth()).expect(200)).body
          .data.reason,
      ).toBe("INSTANCE_BUSY");
      await secondHttp.get("/v1/health").expect(200);
    } finally {
      await second.close();
    }
  });
  it("retains keys for a day and only removes eligible expired artifacts on a new admission", async () => {
    const { request: q } = await designRun();
    const first = (
      await http.post("/v1/ai/jobs").set(auth()).send(q).expect(202)
    ).body.data;
    await terminal(first.job.id);
    await available();
    await db.query(
      "UPDATE ai_jobs SET expires_at=now()-interval '1 second' WHERE id=$1",
      [first.job.id],
    );
    const second = (
      await http
        .post("/v1/ai/jobs")
        .set(auth())
        .send({ ...q, requestId: randomUUID() })
        .expect(202)
    ).body.data;
    await terminal(second.job.id);
    expect(
      await db.query("SELECT id FROM ai_jobs WHERE id=$1", [first.job.id]),
    ).toHaveLength(0);
    expect(
      await db.query("SELECT id FROM ai_jobs WHERE id=$1", [second.job.id]),
    ).toHaveLength(1);
  });
  it("records the provider on a local job, with no token figures it never measured", async () => {
    const { request: d } = await designRun();
    const a = (await http.post("/v1/ai/jobs").set(auth()).send(d).expect(202)).body.data;
    const job = await terminal(a.job.id);
    expect(job).toMatchObject({ status: "completed", provider: "ollama", returnedModel: null, usage: null });
    expect(typeof job.latencyMs).toBe("number");
    expect((await http.get("/v1/ai/readiness").set(auth()).expect(200)).body.data.provider).toBe("ollama");
  });
  it("reconciles orphan pending work as interrupted on restart without automatic inference", async () => {
    const { request: d } = await designRun();
    const a = (await http.post("/v1/ai/jobs").set(auth()).send(d).expect(202))
      .body.data;
    await terminal(a.job.id);
    await available();
    await db.query(
      `UPDATE ai_jobs SET status='pending',payload=jsonb_set(jsonb_set(jsonb_set(jsonb_set(payload,'{status}','"pending"'),'{completedAt}','null'),'{result}','null'),'{failure}','null') WHERE id=$1`,
      [a.job.id],
    );
    await http.post("/v1/ai/jobs").set(auth()).send({ ...d, requestId: randomUUID() }).expect(429);
    const count = chats;
    await app.close();
    await boot();
    expect((await terminal(a.job.id)).status).toBe("interrupted");
    expect(chats).toBe(count);
  });

  describe("hosted provider (a fake standing in for Groq; no network)", () => {
    let hostedMode = "ok";
    let hostedCalls = 0;
    let hostedUnloads = 0;
    const hosted: ExplanationProvider = {
      kind: "groq",
      model: "openai/gpt-oss-20b",
      needsHostMemory: false,
      async identity() {
        if (hostedMode === "no-key") throw new AppException("UNAVAILABLE", "Hosted AI is not configured", { reason: "PROVIDER_NOT_CONFIGURED" });
        return { name: "openai/gpt-oss-20b", digest: HOSTED_DIGEST };
      },
      async idle() {
        return true;
      },
      async generate(_facts, _allowed, _digest, _signal, observe?: (o: ProviderObservation) => void) {
        hostedCalls++;
        if (hostedMode === "usage") observe?.({ returnedModel: "openai/gpt-oss-20b", usage: { promptTokens: 400, completionTokens: 120, totalTokens: 520 }, latencyMs: 123 });
        if (hostedMode === "limited") {
          observe?.({ retryAfterSeconds: 90, latencyMs: 40 });
          throw new AppException("RATE_LIMITED", "Hosted AI quota is temporarily exhausted", { reason: "PROVIDER_RATE_LIMITED", retryAfterSeconds: 90 });
        }
        if (hostedMode === "down") throw new TypeError("fetch failed");
        // Longer than the 5 second host memory check, to prove that check does not apply to a hosted model.
        if (hostedMode === "slow") await new Promise((r) => setTimeout(r, 5600));
        if (hostedMode === "changed") throw new AppException("UNAVAILABLE", "The configured model changed during generation", { reason: "MODEL_CHANGED" });
        return { summary: "The saved model has an inspectable verdict.", evidenceIds: ["verdict"], claims: claims as never };
      },
      async unload() {
        hostedUnloads++;
      },
    };
    beforeAll(async () => {
      await app.close();
      settings.provider = "groq";
      settings.model = "openai/gpt-oss-20b";
      await boot(hosted);
    });
    afterAll(async () => {
      await app.close();
      delete settings.provider;
      settings.model = "qwen2.5:1.5b";
      await boot();
    });
    afterEach(() => {
      hostedMode = "ok";
      delete settings.quota;
      redis.reset();
    });

    it("explains a result without asking any local runner, and ignores host memory pressure", async () => {
      const { request: d } = await designRun();
      physical = commit = 0;
      const readiness = (await http.get("/v1/ai/readiness").set(auth()).expect(200)).body.data;
      expect(readiness).toMatchObject({ ready: true, reason: "AVAILABLE", model: "openai/gpt-oss-20b" });
      const before = hits;
      const calls = hostedCalls;
      const a = (await http.post("/v1/ai/jobs").set(auth()).send(d).expect(202)).body.data;
      const job = await terminal(a.job.id);
      expect(job.status).toBe("completed");
      expect(job.model).toBe("openai/gpt-oss-20b");
      // No digest exists for a hosted model; the record says so instead of inventing one.
      expect(job.modelDigest).toBe(HOSTED_DIGEST);
      expect(hostedCalls).toBe(calls + 1);
      expect(hits).toBe(before);
      expect(hostedUnloads).toBe(0);
      const evidence = aiEvidenceSchema.parse((await http.get(`/v1/ai/jobs/${job.id}/evidence`).set(auth()).expect(200)).body.data);
      expect(evidence.statements.length).toBeGreaterThan(0);
    });

    it("is not aborted by low host memory while a hosted generation is running", async () => {
      const { request: d } = await designRun();
      hostedMode = "slow";
      const a = (await http.post("/v1/ai/jobs").set(auth()).send(d).expect(202)).body.data;
      physical = commit = 0;
      const job = await terminal(a.job.id);
      expect(job.status).toBe("completed");
      expect(job.failure).toBeNull();
    });

    it("ends a job as unavailable when the provider is down, and accepts the next request without a local runner to wait for", async () => {
      const { request: d } = await designRun();
      hostedMode = "down";
      const a = (await http.post("/v1/ai/jobs").set(auth()).send(d).expect(202)).body.data;
      const job = await terminal(a.job.id);
      expect(job.status).toBe("failed");
      expect(job.failure?.reason).toBe("PROVIDER_UNAVAILABLE");
      hostedMode = "ok";
      await available();
      const b = (await http.post("/v1/ai/jobs").set(auth()).send({ ...d, requestId: randomUUID() }).expect(202)).body.data;
      expect((await terminal(b.job.id)).status).toBe("completed");
    });

    it("reports a changed hosted model as MODEL_CHANGED", async () => {
      const { request: d } = await designRun();
      hostedMode = "changed";
      const a = (await http.post("/v1/ai/jobs").set(auth()).send(d).expect(202)).body.data;
      const job = await terminal(a.job.id);
      expect(job.status).toBe("failed");
      expect(job.failure?.reason).toBe("MODEL_CHANGED");
    });

    it("is not ready and refuses a request, without generating, when no key is configured", async () => {
      const { request: d } = await designRun();
      hostedMode = "no-key";
      const readiness = (await http.get("/v1/ai/readiness").set(auth()).expect(200)).body.data;
      expect(readiness).toMatchObject({ ready: false, reason: "PROVIDER_UNAVAILABLE" });
      const calls = hostedCalls;
      await http.post("/v1/ai/jobs").set(auth()).send({ ...d, requestId: randomUUID() }).expect(503);
      expect(hostedCalls).toBe(calls);
    });

    it("records provenance on a hosted job: the provider, the model it reported, the tokens it counted and how long it took", async () => {
      const { request: d } = await designRun();
      hostedMode = "usage";
      const a = (await http.post("/v1/ai/jobs").set(auth()).send(d).expect(202)).body.data;
      expect(a.job).toMatchObject({ provider: "groq", returnedModel: null, usage: null, latencyMs: null });
      const job = await terminal(a.job.id);
      expect(job).toMatchObject({ status: "completed", provider: "groq", returnedModel: "openai/gpt-oss-20b", latencyMs: 123 });
      expect(job.usage).toEqual({ promptTokens: 400, completionTokens: 120, totalTokens: 520 });
      expect((await http.get("/v1/ai/readiness").set(auth()).expect(200)).body.data.provider).toBe("groq");
    });

    it("stops calling the provider once the account's daily limit is used, and says how long to wait", async () => {
      settings.quota = { requestsPerMinute: 1000, requestsPerDay: 2, tokensPerMinute: 100000000, tokensPerDay: 1000000000, margin: 1, userPerDay: 100 };
      const calls = hostedCalls;
      for (let i = 0; i < 2; i++) {
        const { request: d } = await designRun();
        const a = (await http.post("/v1/ai/jobs").set(auth()).send(d).expect(202)).body.data;
        expect((await terminal(a.job.id)).status).toBe("completed");
        await available().catch(() => undefined);
      }
      const { request: d } = await designRun();
      const refused = await http.post("/v1/ai/jobs").set(auth()).send(d).expect(429);
      expect(refused.body.error.details).toMatchObject({ reason: "AI_QUOTA", limit: "requests per day" });
      expect(refused.body.error.details.retryAfterSeconds).toBeGreaterThan(0);
      const readiness = (await http.get("/v1/ai/readiness").set(auth()).expect(200)).body.data;
      expect(readiness).toMatchObject({ ready: false, reason: "QUOTA_EXHAUSTED", provider: "groq" });
      expect(readiness.retryAfterSeconds).toBeGreaterThan(0);
      expect(hostedCalls).toBe(calls + 2);
    });

    // After a job ends the slot frees a moment later; wait for that so the next request is not refused as busy.
    const idleAgain = async () => {
      for (let i = 0; i < 120; i++) {
        const r = (await http.get("/v1/ai/readiness").set(auth()).expect(200)).body.data;
        if (r.reason !== "BUSY") return r;
        await pause();
      }
      throw new Error("AI stayed busy");
    };
    const tightDay = () => {
      settings.quota = { requestsPerMinute: 1000, requestsPerDay: 100000, tokensPerMinute: 100000000, tokensPerDay: 6000, margin: 1, userPerDay: 100 };
    };

    it("counts the tokens the provider really used, so an answer that cost little leaves room for the next", async () => {
      tightDay();
      hostedMode = "usage"; // 520 tokens actually used, against an estimate of more than 2,000 each
      for (let i = 0; i < 3; i++) {
        const { request: d } = await designRun();
        const a = (await http.post("/v1/ai/jobs").set(auth()).send(d).expect(202)).body.data;
        expect((await terminal(a.job.id)).status).toBe("completed");
        await idleAgain();
      }
      expect(hostedCalls).toBeGreaterThanOrEqual(3);
    });

    it("keeps the estimate when the provider reports no usage, so a daily token limit still holds", async () => {
      tightDay();
      hostedMode = "ok"; // no usage figures reported: each request stays counted at its estimate
      const calls = hostedCalls;
      for (let i = 0; i < 2; i++) {
        const { request: d } = await designRun();
        const a = (await http.post("/v1/ai/jobs").set(auth()).send(d).expect(202)).body.data;
        expect((await terminal(a.job.id)).status).toBe("completed");
        await idleAgain();
      }
      const { request: d } = await designRun();
      const refused = await http.post("/v1/ai/jobs").set(auth()).send(d).expect(429);
      expect(refused.body.error.details).toMatchObject({ reason: "AI_QUOTA", limit: "tokens per day" });
      expect(hostedCalls).toBe(calls + 2);
    });

    it("fails a job as rate limited when the provider says so, and refuses further requests until its back-off ends", async () => {
      const { request: d } = await designRun();
      hostedMode = "limited";
      const calls = hostedCalls;
      const a = (await http.post("/v1/ai/jobs").set(auth()).send(d).expect(202)).body.data;
      const job = await terminal(a.job.id);
      expect(job.status).toBe("failed");
      expect(job.failure?.reason).toBe("PROVIDER_RATE_LIMITED");
      const readiness = (await http.get("/v1/ai/readiness").set(auth()).expect(200)).body.data;
      expect(readiness).toMatchObject({ ready: false, reason: "QUOTA_EXHAUSTED" });
      expect(readiness.retryAfterSeconds).toBeGreaterThan(60);
      expect(readiness.retryAfterSeconds).toBeLessThanOrEqual(90);
      const refused = await http.post("/v1/ai/jobs").set(auth()).send({ ...d, requestId: randomUUID() }).expect(429);
      expect(refused.body.error.details).toMatchObject({ reason: "AI_QUOTA", limit: "provider back-off" });
      expect(hostedCalls).toBe(calls + 1);
    });

    it("never calls the local runner's endpoints for readiness", async () => {
      const before = hits;
      await http.get("/v1/ai/readiness").set(auth()).expect(200);
      expect(hits).toBe(before);
    });
  });
});
