import { Test } from "@nestjs/testing";
import { NestExpressApplication } from "@nestjs/platform-express";
import { DataSource } from "typeorm";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { AppModule } from "@/src/app.module";
import { configureApp, setupSwagger } from "@/src/app.setup";
import { RedisCacheService } from "@/providers/cache/redis/redis-cache.service";
import { FakeRedisCacheService } from "../test/fake-redis";
import { getTemplates } from "@/modules/simulation/engine/templates";
import { phase3OpenApi } from "@/common/contracts/phase3/openapi";
import { comparisonSchema } from "@/common/contracts/phase3/compare.schema";
import { inputFingerprint } from "@/common/contracts/phase2/fingerprint";

jest.setTimeout(120000);
describe("M15.4 Compare (isolated Postgres, no AI involved)", () => {
  let app: NestExpressApplication, db: DataSource, http: ReturnType<typeof request>;
  let owner: string, foreign: string;
  const auth = () => ({ Authorization: "Bearer " + owner });
  const other = () => ({ Authorization: "Bearer " + foreign });

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RedisCacheService)
      .useValue(new FakeRedisCacheService())
      .compile();
    app = mod.createNestApplication<NestExpressApplication>();
    configureApp(app);
    db = app.get(DataSource);
    await db.runMigrations();
    setupSwagger(app);
    await app.init();
    http = request(app.getHttpServer());
    for (const who of ["owner", "other"]) {
      const r = await http
        .post("/v1/auth/register")
        .send({ email: who + randomUUID() + "@example.test", password: "M15-compare-2026!", displayName: who })
        .expect(201);
      if (who === "owner") owner = r.body.data.accessToken;
      else foreign = r.body.data.accessToken;
    }
  });
  afterAll(async () => {
    await app?.close();
  });

  async function newDesign() {
    const t = getTemplates().find((x) => x.id === "mvp")!;
    return (
      await http
        .post("/v1/designs")
        .set(auth())
        .send({ schemaVersion: 1, name: t.name, description: t.blurb, source: "template", templateId: t.id, graph: t.graph, traffic: t.traffic })
        .expect(201)
    ).body.data;
  }
  const edit = async (id: string, expectedRevision: number, body: Record<string, unknown>) =>
    (await http.patch("/v1/designs/" + id).set(auth()).send({ expectedRevision, ...body }).expect(200)).body.data;
  async function waitFor(statusUrl: string) {
    for (let i = 0; i < 150; i++) {
      const r = (await http.get(statusUrl).set(auth()).expect(200)).body.data;
      if (r.status !== "pending") return r;
      await new Promise((res) => setTimeout(res, 50));
    }
    throw new Error("run stayed pending");
  }
  const simulate = async (id: string, revision: number) =>
    waitFor((await http.post(`/v1/designs/${id}/simulate`).set(auth()).send({ expectedRevision: revision, requestId: randomUUID() }).expect(202)).body.data.statusUrl);
  const limits = async (id: string, revision: number) =>
    waitFor((await http.post(`/v1/designs/${id}/limits`).set(auth()).send({ expectedRevision: revision, requestId: randomUUID() }).expect(202)).body.data.statusUrl);
  const compare = (id: string, query: string, headers = auth()) => http.get(`/v1/designs/${id}/compare?${query}`).set(headers);
  /** Same traffic, stronger app tier: the typical before/after improvement. */
  const strongerApp = (design: { graph: { nodes: { type: string; props: Record<string, unknown> }[]; edges: unknown[] } }) => ({
    graph: { ...design.graph, nodes: design.graph.nodes.map((n) => (n.type === "app" ? { ...n, props: { ...n.props, replicas: 6 } } : n)) },
  });

  it("compares two versions at identical traffic, with deltas only from the server's own results", async () => {
    const d = await newDesign();
    const runA = await simulate(d.id, 1);
    await edit(d.id, 1, strongerApp(d));
    const runB = await simulate(d.id, 2);
    const result = comparisonSchema.parse((await compare(d.id, "a=1&b=2").expect(200)).body.data);
    expect(result.comparable).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.a.run?.id).toBe(runA.id);
    expect(result.b.run?.id).toBe(runB.id);
    const sa = runA.result.summary, sb = runB.result.summary;
    expect(result.a.run?.metrics).toMatchObject({ verdict: sa.verdict, p95: sa.p95, errorRate: sa.errorRate, throughput: sa.throughput });
    expect(result.deltas).toEqual({
      p50: sb.p50 - sa.p50,
      p95: sb.p95 - sa.p95,
      p99: sb.p99 - sa.p99,
      errorRate: sb.errorRate - sa.errorRate,
      throughput: sb.throughput - sa.throughput,
    });
    // Sides are reported as asked, so swapping them negates every delta.
    const swapped = (await compare(d.id, "a=2&b=1").expect(200)).body.data;
    expect(swapped.deltas.p95).toBe(-result.deltas!.p95);
  });

  it("defaults to the latest completed simulation of each version and honours an explicit run", async () => {
    const d = await newDesign();
    const first = await simulate(d.id, 1);
    const second = await simulate(d.id, 1);
    await edit(d.id, 1, strongerApp(d));
    const other2 = await simulate(d.id, 2);
    const byDefault = (await compare(d.id, "a=1&b=2").expect(200)).body.data;
    expect(byDefault.a.run.id).toBe(second.id);
    const explicit = (await compare(d.id, `a=1&b=2&runA=${first.id}&runB=${other2.id}`).expect(200)).body.data;
    expect(explicit.a.run.id).toBe(first.id);
    expect(explicit.comparable).toBe(true);
  });

  it("never subtracts incomparable results: different traffic, missing runs, wrong runs and other kinds of run", async () => {
    const d = await newDesign();
    const limitsRun = await limits(d.id, 1);
    const run1 = await simulate(d.id, 1);
    const v2 = await edit(d.id, 1, { traffic: { ...d.traffic, rps: d.traffic.rps + 100 } });
    const run2 = await simulate(d.id, 2);
    await edit(d.id, v2.revision, { name: "No run for this one" });
    // Traffic differs: both sides keep their own numbers, but there are no deltas.
    const traffic = (await compare(d.id, "a=1&b=2").expect(200)).body.data;
    expect(traffic).toMatchObject({ comparable: false, reasons: ["TRAFFIC_DIFFERS"], deltas: null });
    expect(traffic.a.run.metrics).not.toBeNull();
    expect(traffic.b.run.metrics).not.toBeNull();
    // Missing run for a version.
    const missing = (await compare(d.id, "a=1&b=3").expect(200)).body.data;
    expect(missing).toMatchObject({ comparable: false, deltas: null });
    expect(missing.reasons).toContain("RUN_MISSING_B");
    expect(missing.b.run).toBeNull();
    expect(missing.a.run.metrics).not.toBeNull();
    // A run that belongs to a different version of this design.
    const wrong = (await compare(d.id, `a=1&b=2&runA=${run2.id}`).expect(200)).body.data;
    expect(wrong.comparable).toBe(false);
    expect(wrong.reasons).toContain("RUN_NOT_FOR_VERSION_A");
    expect(wrong.deltas).toBeNull();
    // A Limits search is not a simulation result.
    const kind = (await compare(d.id, `a=1&b=2&runA=${limitsRun.id}&runB=${run2.id}`).expect(200)).body.data;
    expect(kind.reasons).toContain("RUN_NOT_SIMULATION_A");
    expect(kind.deltas).toBeNull();
    expect(kind.a.run.metrics).toBeNull();
    expect(run1.status).toBe("completed");
  });

  it("flags a different engine version even when everything else matches", async () => {
    const d = await newDesign();
    const runA = await simulate(d.id, 1);
    await edit(d.id, 1, strongerApp(d));
    const runB = await simulate(d.id, 2);
    const row = (await db.query("SELECT payload FROM design_runs WHERE id=$1", [runB.id]))[0].payload;
    const fingerprint = inputFingerprint({ schemaVersion: 1, graph: row.snapshot.graph, traffic: row.snapshot.traffic }, "older-engine-v0");
    await db.query(
      "UPDATE design_runs SET payload = jsonb_set(jsonb_set(payload,'{engineVersion}','\"older-engine-v0\"'),'{fingerprint}', to_jsonb($2::text)) WHERE id=$1",
      [runB.id, fingerprint],
    );
    const result = (await compare(d.id, "a=1&b=2").expect(200)).body.data;
    expect(runA.engineVersion).not.toBe("older-engine-v0");
    expect(result).toMatchObject({ comparable: false, deltas: null });
    expect(result.reasons).toContain("ENGINE_DIFFERS");
  });

  it("validates the request and never reveals other designs, accounts or runs", async () => {
    const d = await newDesign();
    const e = await newDesign();
    const foreignRun = await simulate(e.id, 1);
    await edit(d.id, 1, { name: "Second" });
    await compare(d.id, "a=1&b=1").expect(422);
    await compare(d.id, "a=1").expect(422);
    await compare(d.id, "a=0&b=2").expect(422);
    await compare(d.id, "a=1&b=2&runA=not-a-uuid").expect(422);
    await compare(d.id, "a=1&b=2&extra=1").expect(422);
    const gone = await compare(d.id, "a=1&b=9").expect(404);
    expect(gone.body.error.details).toMatchObject({ reason: "VERSION_NOT_RETAINED", revision: 9 });
    await compare(d.id, `a=1&b=2&runA=${randomUUID()}`).expect(404);
    // A real run id from ANOTHER design is not found through this one.
    await compare(d.id, `a=1&b=2&runA=${foreignRun.id}`).expect(404);
    await compare(d.id, "a=1&b=2", other()).expect(403);
    await http.get(`/v1/designs/${d.id}/compare?a=1&b=2`).expect(401);
    await compare(randomUUID(), "a=1&b=2").expect(404);
  });

  it("publishes the operation in the live OpenAPI document, identical to the canonical contract", async () => {
    const live = (await http.get("/docs-json").expect(200)).body;
    const canonical = phase3OpenApi().paths as Record<string, unknown>;
    expect(canonical["/v1/designs/{id}/compare"]).toBeDefined();
    expect(live.paths["/v1/designs/{id}/compare"]).toEqual(canonical["/v1/designs/{id}/compare"]);
  });
});
