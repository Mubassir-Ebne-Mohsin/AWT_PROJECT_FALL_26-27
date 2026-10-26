import { Test } from "@nestjs/testing";
import { NestExpressApplication } from "@nestjs/platform-express";
import { DataSource } from "typeorm";
import request from "supertest";
import http from "node:http";
import { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { Worker } from "node:worker_threads";
import { join } from "node:path";
import { AppModule } from "@/src/app.module";
import { configureApp, setupSwagger } from "@/src/app.setup";
import { RedisCacheService } from "@/providers/cache/redis/redis-cache.service";
import { FakeRedisCacheService } from "../test/fake-redis";
import { SavedRun } from "@/modules/designs/entities/design-run.entity";
import { SimulationExecutor } from "@/modules/simulation/worker/simulation-executor";
import { createComputeWorker } from "@/modules/simulation/worker/worker-factory";
import { getTemplates } from "@/modules/simulation/engine/templates";
import {
  designSchema,
  previewResponseSchema,
  runSchema,
} from "@/common/contracts/phase2/api.schema";
import type { DesignRun } from "@/common/contracts/phase2/api.schema";
import { limitsOutputSchema } from "@/common/contracts/phase2/result.schema";
import { PREVIEW_THROTTLE_LIMIT } from "@/common/decorators/preview-throttle.decorator";

jest.setTimeout(60000);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const traffic = (rps: number) => ({
  preset: "custom" as const,
  rps,
  burst: 2,
  readRatio: 1,
  sloP95: 300,
  errorBudget: 0.01,
  durationMin: 10,
  shape: "steady" as const,
});
const graph = (capacity: number, replicas: number) => ({
  nodes: [
    { id: "u", label: "Users", x: 0, y: 0, type: "client", props: { region: "us-east" } },
    { id: "a", label: "App", x: 240, y: 0, type: "app", props: { replicas, capacity, latency: 1, region: "us-east" } },
  ],
  edges: [{ id: "e1", from: "u", to: "a" }],
});

describe("M8 Limits and live preview HTTP boundary (isolated database)", () => {
  let app: NestExpressApplication, db: DataSource, http_: ReturnType<typeof request>;
  let executor: SimulationExecutor, port: number;
  let fault: "crash" | "hang" | undefined;
  const tokens: Record<string, string> = {};
  const as = (who = "owner") => ({ Authorization: "Bearer " + tokens[who] });

  beforeAll(async () => {
    executor = new SimulationExecutor(() => {
      if (!fault) return createComputeWorker();
      const mode = fault;
      fault = undefined;
      return new Worker(join(__dirname, "fixtures/compute-fault.cjs"), { workerData: { mode } });
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
    // A real listening socket: client aborts must travel through Node's HTTP stack.
    await app.listen(0, "127.0.0.1");
    port = (app.getHttpServer().address() as AddressInfo).port;
    http_ = request(app.getHttpServer());
    for (const who of ["owner", "other", "third"]) {
      const r = await http_
        .post("/v1/auth/register")
        .send({ email: "m8-" + who + randomUUID() + "@example.test", password: "M8-audit-pass-2026!", displayName: who })
        .expect(201);
      tokens[who] = r.body.data.accessToken;
    }
  });
  afterAll(async () => {
    await app?.close();
  });

  async function create(who = "owner", snapshot?: { graph: unknown; traffic: unknown }) {
    const t = getTemplates().find((x) => x.id === "mvp")!;
    const r = await http_
      .post("/v1/designs")
      .set(as(who))
      .send({
        schemaVersion: 1, name: "M8 " + who, description: "", source: snapshot ? "blank" : "template",
        templateId: snapshot ? null : t.id, graph: snapshot?.graph ?? t.graph, traffic: snapshot?.traffic ?? t.traffic,
      })
      .expect(201);
    return designSchema.parse(r.body.data);
  }
  async function terminal(id: string, runId: string, who = "owner"): Promise<DesignRun> {
    for (let i = 0; i < 150; i++) {
      const r = await http_.get(`/v1/designs/${id}/runs/${runId}`).set(as(who)).expect(200);
      const run = runSchema.parse(r.body.data);
      if (run.status !== "pending") return run;
      await sleep(100);
    }
    throw new Error("Run remained pending");
  }
  const previewBody = (sessionId: string, sequence: number, snapshot?: { graph: unknown; traffic: unknown }) => {
    const t = getTemplates().find((x) => x.id === "mvp")!;
    return { editorSessionId: sessionId, sequence, schemaVersion: 1, graph: snapshot?.graph ?? t.graph, traffic: snapshot?.traffic ?? t.traffic };
  };
  const runRows = () => db.getRepository(SavedRun).count();
  /** The executor keeps one lazy worker alive; retire it so the next job starts on the fault worker. */
  async function inject(mode: "crash" | "hang") {
    await (executor as unknown as { retire(): Promise<unknown> }).retire();
    fault = mode;
  }
  async function idle() {
    for (let i = 0; i < 100 && (executor.state.active || executor.state.reservations); i++) await sleep(50);
    expect(executor.state).toMatchObject({ active: 0, queued: 0, reservations: 0 });
  }

  describe("Limits", () => {
    it("requires authentication and ownership", async () => {
      const d = await create();
      const body = { expectedRevision: 1, requestId: randomUUID() };
      await http_.post(`/v1/designs/${d.id}/limits`).send(body).expect(401);
      const foreign = await http_.post(`/v1/designs/${d.id}/limits`).set(as("other")).send(body).expect(403);
      expect(JSON.stringify(foreign.body)).not.toContain(d.name);
      await http_.post(`/v1/designs/${randomUUID()}/limits`).set(as()).send(body).expect(404);
      await http_.post(`/v1/designs/${d.id}/limits`).set(as()).send({ expectedRevision: 1 }).expect(422);
      await http_.post(`/v1/designs/${d.id}/limits`).set(as()).send({ ...body, kind: "simulation" }).expect(422);
      expect(await db.getRepository(SavedRun).countBy({ designId: d.id })).toBe(0);
    });

    it("persists a completed limits run that reopens by kind, and replays the same key", async () => {
      const d = await create();
      const body = { expectedRevision: 1, requestId: randomUUID() };
      const accepted = await http_.post(`/v1/designs/${d.id}/limits`).set(as()).send(body).expect(202);
      expect(accepted.body.data.run).toMatchObject({ kind: "limits", status: "pending", designRevision: 1 });
      expect(accepted.body.data.statusUrl).toBe(`/v1/designs/${d.id}/runs/${accepted.body.data.run.id}`);
      const run = await terminal(d.id, accepted.body.data.run.id);
      expect(run.status).toBe("completed");
      if (run.status !== "completed" || run.result.kind !== "limits") throw new Error("expected limits result");
      expect(limitsOutputSchema.parse(run.result).orderLabel).toBe("predicted saturation under unshed demand");
      expect(run.result.minimumTestedRps).toBe(1);
      const replay = await http_.post(`/v1/designs/${d.id}/limits`).set(as()).send(body).expect(200);
      expect(replay.body.data.run.id).toBe(run.id);
      // The same key may never be reinterpreted as a different calculation kind.
      const reused = await http_.post(`/v1/designs/${d.id}/simulate`).set(as()).send(body).expect(409);
      expect(reused.body.error).toMatchObject({ code: "CONFLICT", details: { reason: "REQUEST_ID_REUSED" } });
      const simKey = { expectedRevision: 1, requestId: randomUUID() };
      const sim = await http_.post(`/v1/designs/${d.id}/simulate`).set(as()).send(simKey).expect(202);
      await terminal(d.id, sim.body.data.run.id);
      await http_.post(`/v1/designs/${d.id}/limits`).set(as()).send(simKey).expect(409);
      expect(await db.getRepository(SavedRun).countBy({ designId: d.id })).toBe(2);
      const dash = await http_.get("/v1/dashboard").set(as()).expect(200);
      const kinds = dash.body.data.recentRuns.filter((r: { designId: string }) => r.designId === d.id).map((r: { kind: string }) => r.kind).sort();
      expect(kinds).toEqual(["limits", "simulation"]);
    });

    it("returns each honest search state over HTTP, including zero current load", async () => {
      const cases = [
        { name: "failsAtMinimumLoad", g: graph(1, 1), rps: 300 },
        { name: "notReachedWithinRange", g: graph(1e9, 200), rps: 300 },
        { name: "notReachedWithinRange", g: graph(1e9, 200), rps: 0 },
        { name: "found", g: graph(300, 1), rps: 0 },
      ];
      for (const c of cases) {
        const d = await create("owner", { graph: c.g, traffic: traffic(c.rps) });
        const r = await http_.post(`/v1/designs/${d.id}/limits`).set(as()).send({ expectedRevision: 1, requestId: randomUUID() }).expect(202);
        const run = await terminal(d.id, r.body.data.run.id);
        if (run.status !== "completed" || run.result.kind !== "limits") throw new Error("not completed: " + c.name);
        expect(run.result.state).toBe(c.name);
        if (run.result.state === "failsAtMinimumLoad") {
          expect(run.result.lowerThreshold).toBe("unknown");
          expect(run.result.headroom).toBeNull();
        }
        if (run.result.state === "notReachedWithinRange") {
          expect(run.result.headroomIsLowerBound).toBe(true);
          if (c.rps === 0) expect(run.result.headroom).toBeNull();
          else expect(run.result.headroom).toBeGreaterThan(1);
        }
        if (run.result.state === "found") {
          expect(run.result.passingRps).toBeLessThan(run.result.failingRps);
          expect(run.result.failingRps).toBeLessThanOrEqual(run.result.maximumTestedRps);
          // Zero current traffic: the contract carries an explicit unbounded marker, never a finite multiplier.
          expect(run.result.headroom).toEqual({ kind: "unbounded" });
        }
      }
    });

    it("blocks an invalid graph, a stale revision and a second pending durable job per owner", async () => {
      const cyclic = await create("owner", {
        graph: { nodes: [{ id: "a", label: "A", x: 0, y: 0, type: "app", props: {} }, { id: "b", label: "B", x: 200, y: 0, type: "app", props: {} }], edges: [{ id: "e1", from: "a", to: "b" }, { id: "e2", from: "b", to: "a" }] },
        traffic: traffic(100),
      });
      const invalid = await http_.post(`/v1/designs/${cyclic.id}/limits`).set(as()).send({ expectedRevision: 1, requestId: randomUUID() }).expect(422);
      expect(invalid.body.error.details.validation.ok).toBe(false);
      const d = await create();
      const stale = await http_.post(`/v1/designs/${d.id}/limits`).set(as()).send({ expectedRevision: 2, requestId: randomUUID() }).expect(409);
      expect(stale.body.error.details).toEqual({ reason: "REVISION_MISMATCH", currentRevision: 1 });
      await inject("hang");
      const pending = await http_.post(`/v1/designs/${d.id}/limits`).set(as()).send({ expectedRevision: 1, requestId: randomUUID() }).expect(202);
      const blocked = await http_.post(`/v1/designs/${d.id}/simulate`).set(as()).send({ expectedRevision: 1, requestId: randomUUID() }).expect(429);
      expect(blocked.body.error.code).toBe("RATE_LIMITED");
      const failed = await terminal(d.id, pending.body.data.run.id);
      expect(failed).toMatchObject({ status: "failed", kind: "limits", failure: { code: "TIMEOUT" } });
      await idle();
    });

    it("deleting a design during a pending Limits search cancels it and leaves no rows", async () => {
      const d = await create();
      await inject("hang");
      const r = await http_.post(`/v1/designs/${d.id}/limits`).set(as()).send({ expectedRevision: 1, requestId: randomUUID() }).expect(202);
      await http_.delete(`/v1/designs/${d.id}`).set(as()).expect(204);
      await idle();
      expect(await db.getRepository(SavedRun).countBy({ designId: d.id })).toBe(0);
      await http_.get(`/v1/designs/${d.id}/runs/${r.body.data.run.id}`).set(as()).expect(404);
    });
  });

  describe("Live preview", () => {
    it("requires authentication and validates the bounded request", async () => {
      const id = randomUUID();
      await http_.post("/v1/simulation/preview").send(previewBody(id, 1)).expect(401);
      for (const bad of [
        { ...previewBody(id, 1), sequence: -1 },
        { ...previewBody(id, 1), sequence: 1.5 },
        { ...previewBody("not-a-uuid", 1) },
        { ...previewBody(id, 1), ownerId: randomUUID() },
        { editorSessionId: id, sequence: 1 },
        previewBody(id, 1, { graph: { nodes: Array.from({ length: 51 }, (_, i) => ({ id: "n" + i, label: "N", x: 0, y: 0, type: "app", props: {} })), edges: [] }, traffic: traffic(1) }),
        previewBody(id, 1, { graph: graph(1, 1), traffic: { ...traffic(1), rps: 1e8 } }),
      ]) {
        const r = await http_.post("/v1/simulation/preview").set(as()).send(bad).expect(422);
        expect(r.body.error.code).toBe("VALIDATION_FAILED");
      }
    });

    it("returns an echoed, unsaved summary and never creates runs or dashboard history", async () => {
      const before = await runRows();
      const dashBefore = (await http_.get("/v1/dashboard").set(as()).expect(200)).body.data.counts;
      const id = randomUUID();
      const r = await http_.post("/v1/simulation/preview").set(as()).send(previewBody(id, 1)).expect(200);
      const data = previewResponseSchema.parse(r.body.data);
      expect(data).toMatchObject({ editorSessionId: id, sequence: 1 });
      expect(data.validation.ok).toBe(true);
      expect(data.summary!.nodes.map((n) => n.id).sort()).toEqual(["n1", "n2", "n4"]);
      expect(data.summary!.flows.length).toBeGreaterThan(0);
      const invalid = await http_
        .post("/v1/simulation/preview")
        .set(as())
        .send(previewBody(id, 2, { graph: { nodes: [{ id: "a", label: "A", x: 0, y: 0, type: "app", props: {} }], edges: [] }, traffic: traffic(1) }))
        .expect(200);
      expect(invalid.body.data.validation.ok).toBe(false);
      expect(invalid.body.data.summary).toBeNull();
      expect(await runRows()).toBe(before);
      expect((await http_.get("/v1/dashboard").set(as()).expect(200)).body.data.counts).toEqual(dashBefore);
    });

    it("rejects replayed or older sequences as superseded, scoped per owner", async () => {
      const id = randomUUID();
      await http_.post("/v1/simulation/preview").set(as()).send(previewBody(id, 5)).expect(200);
      for (const seq of [5, 3]) {
        const r = await http_.post("/v1/simulation/preview").set(as()).send(previewBody(id, seq)).expect(409);
        expect(r.body.error).toMatchObject({ code: "CONFLICT", details: { reason: "PREVIEW_SUPERSEDED" } });
      }
      // Another account reusing the same editor-session UUID is not affected by the owner's sequence.
      await http_.post("/v1/simulation/preview").set(as("other")).send(previewBody(id, 1)).expect(200);
      await http_.post("/v1/simulation/preview").set(as()).send(previewBody(id, 6)).expect(200);
    });

    it("a newer sequence supersedes a running preview of the same editor session", async () => {
      const id = randomUUID();
      await inject("hang");
      const first = http_.post("/v1/simulation/preview").set(as()).send(previewBody(id, 1)).then((r) => r);
      await sleep(300);
      const second = await http_.post("/v1/simulation/preview").set(as()).send(previewBody(id, 2)).expect(200);
      const firstResponse = await first;
      expect(firstResponse.status).toBe(409);
      expect(firstResponse.body.error.details).toEqual({ reason: "PREVIEW_SUPERSEDED" });
      expect(second.body.data.sequence).toBe(2);
      await idle();
    });

    it("a real client disconnect cancels only that preview and releases the worker", async () => {
      await inject("hang");
      const body = JSON.stringify(previewBody(randomUUID(), 1));
      const req = http.request({
        host: "127.0.0.1", port, path: "/v1/simulation/preview", method: "POST",
        headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body), ...as() },
      });
      req.on("error", () => undefined);
      req.end(body);
      for (let i = 0; i < 40 && !executor.state.active; i++) await sleep(50);
      expect(executor.state.active).toBe(1);
      const destroyedAt = Date.now();
      req.destroy();
      for (let i = 0; i < 100 && executor.state.reservations; i++) await sleep(10);
      // Released by the abort, well before the 2s preview deadline would have freed it anyway.
      expect(executor.state.reservations).toBe(0);
      expect(Date.now() - destroyedAt).toBeLessThan(1000);
      await idle();
      // The worker was replaced; the next preview computes normally.
      await http_.post("/v1/simulation/preview").set(as()).send(previewBody(randomUUID(), 1)).expect(200);
    });

    it("pauses (429 DURABLE_PENDING) for the owner's own durable job; other owners queue and time out honestly", async () => {
      const d = await create();
      await inject("hang");
      const pending = await http_.post(`/v1/designs/${d.id}/limits`).set(as()).send({ expectedRevision: 1, requestId: randomUUID() }).expect(202);
      const paused = await http_.post("/v1/simulation/preview").set(as()).send(previewBody(randomUUID(), 1)).expect(429);
      expect(paused.body.error).toMatchObject({ code: "RATE_LIMITED", details: { reason: "DURABLE_PENDING" } });
      const waited = await http_.post("/v1/simulation/preview").set(as("other")).send(previewBody(randomUUID(), 1)).expect(503);
      expect(waited.body.error).toMatchObject({ code: "UNAVAILABLE", details: { reason: "PREVIEW_TIMEOUT" } });
      // Preview pressure never cancels the accepted durable job: it ends by its own deadline.
      expect(await terminal(d.id, pending.body.data.run.id)).toMatchObject({ status: "failed", failure: { code: "TIMEOUT" } });
      await idle();
    });

    it("Run/Limits preempts a running preview and evicts queued previews from a full queue", async () => {
      await inject("hang");
      const running = http_.post("/v1/simulation/preview").set(as("other")).send(previewBody(randomUUID(), 1)).then((r) => r);
      for (let i = 0; i < 40 && !executor.state.active; i++) await sleep(50);
      const queued = [1, 2, 3, 4].map(() =>
        http_.post("/v1/simulation/preview").set(as("third")).send(previewBody(randomUUID(), 1)).then((r) => r),
      );
      for (let i = 0; i < 40 && executor.state.queued < 4; i++) await sleep(25);
      expect(executor.state).toMatchObject({ active: 1, queued: 4 });
      const d = await create();
      const limits = await http_.post(`/v1/designs/${d.id}/limits`).set(as()).send({ expectedRevision: 1, requestId: randomUUID() }).expect(202);
      const preempted = await running;
      expect(preempted.status).toBe(409);
      expect(preempted.body.error.details).toEqual({ reason: "PREVIEW_SUPERSEDED" });
      const statuses = (await Promise.all(queued)).map((r) => r.status);
      expect(statuses.filter((s) => s === 409).length).toBeGreaterThanOrEqual(1);
      expect(statuses.every((s) => [200, 409, 503].includes(s))).toBe(true);
      expect((await terminal(d.id, limits.body.data.run.id)).status).toBe("completed");
      await idle();
    });

    it("a crashed preview worker fails inline (503 PREVIEW_FAILED) and the next preview recovers", async () => {
      await inject("crash");
      const r = await http_.post("/v1/simulation/preview").set(as()).send(previewBody(randomUUID(), 1)).expect(503);
      expect(r.body.error.details).toEqual({ reason: "PREVIEW_FAILED" });
      await http_.get("/v1/health").expect((x) => expect([200, 503]).toContain(x.status));
      await http_.post("/v1/simulation/preview").set(as()).send(previewBody(randomUUID(), 1)).expect(200);
      await idle();
    });

    it("documents both mounted operations in the live OpenAPI document", async () => {
      const doc = (await http_.get("/docs-json").expect(200)).body;
      expect(doc.paths["/v1/simulation/preview"].post["x-implementation-status"]).toBe("implemented");
      expect(doc.paths["/v1/designs/{id}/limits"].post["x-implementation-status"]).toBe("implemented");
      expect(doc.components.schemas.PreviewErrorDetails).toBeDefined();
    });

    // Keep last: it exhausts this instance's preview bucket.
    it("uses a separate preview throttle bucket", async () => {
      const id = randomUUID();
      let limited: request.Response | undefined, sent = 0;
      for (let seq = 1; seq <= PREVIEW_THROTTLE_LIMIT + 5 && !limited; seq++) {
        const r = await http_.post("/v1/simulation/preview").set(as("third")).send(previewBody(id, seq));
        sent++;
        if (r.status === 429) limited = r;
        else expect(r.status).toBe(200);
      }
      expect(limited?.body.error.code).toBe("RATE_LIMITED");
      expect(limited?.body.error.details).toBeUndefined();
      expect(sent).toBeLessThanOrEqual(PREVIEW_THROTTLE_LIMIT + 1);
      // The shared default bucket (autosave/Run/reads) is unaffected by exhausted previews.
      await http_.get("/v1/dashboard").set(as("third")).expect(200);
      const d = await create("third");
      await http_.patch(`/v1/designs/${d.id}`).set(as("third")).send({ expectedRevision: 1, name: "still saving" }).expect(200);
    });
  });
});
