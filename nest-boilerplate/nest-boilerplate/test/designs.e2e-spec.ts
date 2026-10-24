import { SimulationService } from "@/modules/simulation/simulation.service";
import { Test } from "@nestjs/testing";
import { NestExpressApplication } from "@nestjs/platform-express";
import { DataSource, SelectQueryBuilder } from "typeorm";
import { SavedDesign } from "@/modules/designs/entities/design.entity";
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
  it("M4 prepares every creation source without persistence, then saves owned snapshots", async () => {
    await http
      .post("/v1/designs/prepare")
      .send({ input: { source: "scripted", text: "app" } })
      .expect(401);
    const before = await db.getRepository(SavedDesign).count();
    for (const input of [
      {
        source: "blank",
        name: "Blank",
        region: "ap-south",
        start: "empty",
        preset: "flash",
      },
      {
        source: "import",
        text: JSON.stringify({ nodes: [{ id: "a", type: "app" }] }),
      },
      {
        source: "scripted",
        text: "Online store, 3 app servers, Redis, Postgres, Stripe, background emails.",
      },
    ]) {
      const checked = await http
        .post("/v1/designs/prepare")
        .set(auth())
        .send({ input })
        .expect(200);
      expect(await db.getRepository(SavedDesign).count()).toBe(before);
      const created = await http
        .post("/v1/designs")
        .set(auth())
        .send(checked.body.data.design)
        .expect(201);
      const id = created.body.data.id;
      await http
        .get("/v1/designs/" + id)
        .set({ Authorization: "Bearer " + foreign })
        .expect(403);
      if (input.source === "scripted")
        expect(created.body.data.description).toContain(
          "Scripted mock assumptions:",
        );
      await http
        .delete("/v1/designs/" + id)
        .set(auth())
        .expect(204);
    }
    expect(await db.getRepository(SavedDesign).count()).toBe(before);
    const docs = await http.get("/docs-json").expect(200);
    expect(
      docs.body.paths["/v1/designs/prepare"].post.responses["200"],
    ).toBeDefined();
  });
  it("M4 invalid preparation leaves design and run counts unchanged", async () => {
    const designs = await db.getRepository(SavedDesign).count(),
      runs = await db.getRepository(SavedRun).count();
    for (const input of [
      { source: "scripted", text: "" },
      { source: "scripted", text: "1.5 app servers" },
      {
        source: "blank",
        name: "bad",
        region: "nowhere",
        start: "empty",
        preset: "steady",
      },
      { source: "import", text: "{" },
      {
        source: "import",
        text: JSON.stringify({ nodes: [], schemaVersion: 2 }),
      },
      {
        source: "import",
        text: JSON.stringify({ nodes: [], ownerId: "forged" }),
      },
      {
        source: "import",
        text: JSON.stringify({ nodes: [], description: "界".repeat(22000) }),
      },
    ])
      await http
        .post("/v1/designs/prepare")
        .set(auth())
        .send({ input })
        .expect(422);
    await http
      .post("/v1/designs/prepare")
      .set(auth())
      .send({ input: { source: "scripted", text: "app" }, ownerId: "forged" })
      .expect(422);
    expect(await db.getRepository(SavedDesign).count()).toBe(designs);
    expect(await db.getRepository(SavedRun).count()).toBe(runs);
  });
  it("M4 accepts the full 64 KiB import allowance even when JSON transport doubles whitespace", async () => {
    const text = "\t".repeat(64000) + '{"nodes":[]}';
    expect(Buffer.byteLength(text, "utf8")).toBeLessThan(65536);
    await http
      .post("/v1/designs/prepare")
      .set(auth())
      .send({ input: { source: "import", text } })
      .expect(200);
  });
  it("M4 creates exact owned copies of all six templates without implicit model runs", async () => {
    const runs = await db.getRepository(SavedRun).count();
    for (const template of getTemplates()) {
      const body = {
        schemaVersion: 1,
        name: template.name,
        description: template.blurb,
        source: "template",
        templateId: template.id,
        graph: template.graph,
        traffic: template.traffic,
      };
      const created = await http
        .post("/v1/designs")
        .set(auth())
        .send(body)
        .expect(201);
      const id = created.body.data.id;
      const reopened = await http
        .get("/v1/designs/" + id)
        .set(auth())
        .expect(200);
      expect(reopened.body.data.graph).toEqual(template.graph);
      expect(reopened.body.data.traffic).toEqual(template.traffic);
      expect(reopened.body.data.templateId).toBe(template.id);
      await http
        .delete("/v1/designs/" + id)
        .set(auth())
        .expect(204);
    }
    expect(await db.getRepository(SavedRun).count()).toBe(runs);
  });
  it("M4 oversized transport errors retain CORS and the validation envelope", async () => {
    await http
      .post("/v1/designs/prepare")
      .set("Origin", "http://localhost:3000")
      .set(auth())
      .send({ input: { source: "import", text: " ".repeat(170000) } })
      .expect(422)
      .expect("Access-Control-Allow-Origin", "http://localhost:3000")
      .expect("X-Content-Type-Options", "nosniff")
      .expect((r) => expect(r.body.error.code).toBe("VALIDATION_FAILED"));
  });
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
    const transaction = jest.spyOn(db, "transaction").mockRejectedValueOnce(
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
  it("rejects unsafe settings and payloads without mutating a saved design", async () => {
    const d = await create();
    const invalidGraphs = [
      {
        ...d.graph,
        nodes: d.graph.nodes.map((n) =>
          n.type === "app" ? { ...n, props: { ...n.props, replicas: 201 } } : n,
        ),
      },
      {
        ...d.graph,
        nodes: d.graph.nodes.map((n) =>
          n.type === "app" ? { ...n, props: { ...n.props, replicas: 1.5 } } : n,
        ),
      },
      {
        ...d.graph,
        nodes: d.graph.nodes.map((n) =>
          n.type === "app" ? { ...n, props: { ...n.props, capacity: 0 } } : n,
        ),
      },
      {
        ...d.graph,
        nodes: d.graph.nodes.map((n) =>
          n.type === "app" ? { ...n, props: { ...n.props, unknown: 1 } } : n,
        ),
      },
      { ...d.graph, nodes: [...d.graph.nodes, d.graph.nodes[0]] },
      {
        ...d.graph,
        edges: [
          ...d.graph.edges,
          { id: "unsafeEdge", from: "missing", to: d.graph.nodes[0].id },
        ],
      },
      {
        ...d.graph,
        nodes: d.graph.nodes.map((n, i) =>
          i === 0 ? { ...n, id: "constructor" } : n,
        ),
      },
      {
        ...d.graph,
        nodes: d.graph.nodes.map((n, i) => (i === 0 ? { ...n, x: 100001 } : n)),
      },
    ];
    for (const graph of invalidGraphs)
      await http
        .patch("/v1/designs/" + d.id)
        .set(auth())
        .send({ expectedRevision: 1, graph })
        .expect(422);
    for (const body of [
      { expectedRevision: 1, name: " " },
      { expectedRevision: 1, revision: 999 },
      { expectedRevision: 1, schemaVersion: 2 },
      { expectedRevision: 0, name: "unsafe" },
      { expectedRevision: 1, traffic: { ...d.traffic, rps: -1 } },
    ])
      await http
        .patch("/v1/designs/" + d.id)
        .set(auth())
        .send(body)
        .expect(422);
    for (const query of [
      "page=NaN",
      "pageSize=51",
      "page=1.5",
      "pageSize=0",
      "page[]=1",
    ])
      await http
        .get("/v1/designs?" + query)
        .set(auth())
        .expect(422);
    const after = await http
      .get("/v1/designs/" + d.id)
      .set(auth())
      .expect(200);
    expect(after.body.data).toEqual(d);
  });
  it("supports zero traffic and the replica upper bound without non-finite output", async () => {
    const d = await create(),
      graph = structuredClone(d.graph);
    graph.nodes.find((n) => n.type === "app")!.props.replicas = 200;
    await http
      .patch("/v1/designs/" + d.id)
      .set(auth())
      .send({ expectedRevision: 1, graph, traffic: { ...d.traffic, rps: 0 } })
      .expect(200);
    const response = await http
      .post("/v1/designs/" + d.id + "/simulate")
      .set(auth())
      .send({ expectedRevision: 2, requestId: randomUUID() })
      .expect(202);
    const completed = await terminal(d.id, response.body.data.run.id);
    expect(completed.status).toBe("completed");
    if (
      completed.status === "completed" &&
      completed.result.kind === "simulation"
    ) {
      expect(completed.result.summary.rps).toBe(0);
      expect(completed.result.summary.errorRate).toBe(0);
      expect(Number.isFinite(completed.result.summary.p95)).toBe(true);
    }
  });
  it("saves a safe cyclic draft but blocks calculation with a structured cycle issue", async () => {
    const d = await create(),
      graph = structuredClone(d.graph);
    graph.edges.push({
      id: "backLink",
      from: graph.nodes[2].id,
      to: graph.nodes[1].id,
    });
    await http
      .patch("/v1/designs/" + d.id)
      .set(auth())
      .send({ expectedRevision: 1, graph })
      .expect(200);
    const validation = await http
      .post("/v1/designs/" + d.id + "/validate")
      .set(auth())
      .send({ expectedRevision: 2 })
      .expect(200);
    expect(
      validation.body.data.errors.some(
        (e: { code: string }) => e.code === "CYCLE",
      ),
    ).toBe(true);
    await http
      .post("/v1/designs/" + d.id + "/simulate")
      .set(auth())
      .send({ expectedRevision: 2, requestId: randomUUID() })
      .expect(422);
    expect(await db.getRepository(SavedRun).countBy({ designId: d.id })).toBe(
      0,
    );
  });
  it("rejects conflicting concurrent identities under one request key", async () => {
    const d = await create(),
      requestId = randomUUID();
    const responses = await Promise.all(
      [1, 2].map((expectedRevision) =>
        http
          .post("/v1/designs/" + d.id + "/simulate")
          .set(auth())
          .send({ expectedRevision, requestId }),
      ),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([202, 409]);
    const accepted = responses.find((r) => r.status === 202)!;
    await terminal(d.id, accepted.body.data.run.id);
    expect(
      await db.getRepository(SavedRun).countBy({ designId: d.id, requestId }),
    ).toBe(1);
  });
  it("expires provisional admission blocked behind a database row lock, then recovers", async () => {
    const d = await create(),
      runner = db.createQueryRunner(),
      body = { expectedRevision: 1, requestId: randomUUID() };
    await runner.connect();
    await runner.startTransaction();
    await runner.query("SELECT id FROM designs WHERE id=$1 FOR UPDATE", [d.id]);
    const pending = http
      .post("/v1/designs/" + d.id + "/simulate")
      .set(auth())
      .send(body)
      .then((r) => r);
    let clock: jest.SpyInstance | undefined;
    try {
      for (let i = 0; i < 150 && executor.state.reservations === 0; i++)
        await new Promise((r) => setTimeout(r, 10));
      expect(executor.state.reservations).toBe(1);
      const now = Date.now();
      clock = jest.spyOn(Date, "now").mockReturnValue(now + 6000);
      await runner.commitTransaction();
      expect((await pending).status).toBe(503);
    } finally {
      clock?.mockRestore();
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
    }
    expect(executor.state.reservations).toBe(0);
    expect(await db.getRepository(SavedRun).countBy({ designId: d.id })).toBe(
      0,
    );
    const retry = await http
      .post("/v1/designs/" + d.id + "/simulate")
      .set(auth())
      .send(body)
      .expect(202);
    expect((await terminal(d.id, retry.body.data.run.id)).status).toBe(
      "completed",
    );
  });
  it("protects more than fifty young keys and never prunes pending records", async () => {
    const d = await create();
    const accepted = await http
      .post("/v1/designs/" + d.id + "/simulate")
      .set(auth())
      .send({ expectedRevision: 1, requestId: randomUUID() })
      .expect(202);
    const original = await terminal(d.id, accepted.body.data.run.id),
      repo = db.getRepository(SavedRun);
    for (let i = 0; i < 55; i++) {
      const id = randomUUID(),
        requestId = randomUUID(),
        createdAt = new Date(Date.now() - 1000 - i);
      await repo.insert({
        id,
        designId: d.id,
        requestId,
        status: "completed",
        createdAt,
        completedAt: createdAt,
        payload: {
          ...original,
          id,
          requestId,
          createdAt: createdAt.toISOString(),
        },
      });
    }
    const id = randomUUID(),
      requestId = randomUUID(),
      pending: DesignRun = {
        ...original,
        id,
        requestId,
        status: "pending",
        result: null,
        failure: null,
        completedAt: null,
      };
    await repo.insert({
      id,
      designId: d.id,
      requestId,
      status: "pending",
      createdAt: new Date(Date.now() - 48 * 3600000),
      completedAt: null,
      payload: pending,
    });
    await app.get(RunsService).prune(d.id);
    expect(await repo.countBy({ designId: d.id })).toBe(57);
    expect((await repo.findOneByOrFail({ id })).status).toBe("pending");
    await app.get(RunsService).reconcile(true);
  });
  it("keeps dashboard available when a design is deleted between its read queries", async () => {
    const d = await create(),
      response = await http
        .post("/v1/designs/" + d.id + "/simulate")
        .set(auth())
        .send({ expectedRevision: 1, requestId: randomUUID() })
        .expect(202);
    await terminal(d.id, response.body.data.run.id);
    const originalCount = SelectQueryBuilder.prototype.getCount;
    const count = jest
      .spyOn(SelectQueryBuilder.prototype, "getCount")
      .mockImplementationOnce(async function (
        this: SelectQueryBuilder<SavedRun>,
      ) {
        await db.getRepository(SavedDesign).delete(d.id);
        return originalCount.call(this);
      });
    try {
      await http.get("/v1/dashboard").set(auth()).expect(200);
    } finally {
      count.mockRestore();
    }
  });
  it("replays retained keys even when unrelated scheduler capacity is full", async () => {
    const d = await create(),
      requestId = randomUUID(),
      body = { expectedRevision: 1, requestId };
    const accepted = await http
      .post("/v1/designs/" + d.id + "/simulate")
      .set(auth())
      .send(body)
      .expect(202);
    await terminal(d.id, accepted.body.data.run.id);
    const slots = Array.from({ length: 4 }, (_, i) =>
      executor.reserve("capacity-audit-" + i, "durable"),
    );
    try {
      const replay = await http
        .post("/v1/designs/" + d.id + "/simulate")
        .set(auth())
        .send(body)
        .expect(200);
      expect(replay.body.data.run.id).toBe(accepted.body.data.run.id);
      await http
        .post("/v1/designs/" + d.id + "/simulate")
        .set(auth())
        .send({ ...body, expectedRevision: 2 })
        .expect(409);
      await http
        .post("/v1/designs/" + d.id + "/simulate")
        .set(auth())
        .send({ ...body, requestId: randomUUID() })
        .expect(429);
      expect(await db.getRepository(SavedRun).countBy({ designId: d.id })).toBe(
        1,
      );
    } finally {
      slots.forEach((slot) => slot.release());
      await Promise.allSettled(slots.map((slot) => slot.result));
    }
    const next = await http
      .post("/v1/designs/" + d.id + "/simulate")
      .set(auth())
      .send({ ...body, requestId: randomUUID() })
      .expect(202);
    expect((await terminal(d.id, next.body.data.run.id)).status).toBe(
      "completed",
    );
  });
});
