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
import { fixesSchema } from "@/common/contracts/phase3/fixes.schema";
import { graphSchema } from "@/common/contracts/phase2/graph.schema";

// Verified fix suggestions on the real application and PostgreSQL. No AI is involved anywhere. The central check: every number the
// endpoint reports for a fix equals what a separate, fresh simulation of that same edited design gives.
jest.setTimeout(120000);
describe("Verified fix suggestions (isolated Postgres, real engine, no AI)", () => {
  let app: NestExpressApplication, db: DataSource, http: ReturnType<typeof request>;
  let owner: string, foreign: string;
  const auth = () => ({ Authorization: "Bearer " + owner });
  const other = () => ({ Authorization: "Bearer " + foreign });

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(RedisCacheService).useValue(new FakeRedisCacheService()).compile();
    app = mod.createNestApplication<NestExpressApplication>();
    configureApp(app);
    db = app.get(DataSource);
    await db.runMigrations();
    setupSwagger(app);
    await app.init();
    http = request(app.getHttpServer());
    for (const who of ["owner", "other"]) {
      const r = await http.post("/v1/auth/register").send({ email: who + randomUUID() + "@example.test", password: "Fixes-e2e-2026!", displayName: who }).expect(201);
      if (who === "owner") owner = r.body.data.accessToken;
      else foreign = r.body.data.accessToken;
    }
  });
  afterAll(async () => {
    await app?.close();
  });

  /** A template design at a load that stresses it. */
  async function design(templateId = "mvp", rpsFactor = 3) {
    const t = getTemplates().find((x) => x.id === templateId)!;
    return (
      await http.post("/v1/designs").set(auth()).send({ schemaVersion: 1, name: t.name, description: t.blurb, source: "template", templateId: t.id, graph: t.graph, traffic: { ...t.traffic, rps: Math.round(t.traffic.rps * rpsFactor) } }).expect(201)
    ).body.data;
  }
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
  const fixes = (id: string, body: unknown, headers = auth()) => http.post(`/v1/designs/${id}/fixes`).set(headers).send(body as object);
  const preview = async (graph: unknown, traffic: unknown) =>
    (await http.post("/v1/simulation/preview").set(auth()).send({ editorSessionId: randomUUID(), sequence: 0, schemaVersion: 1, graph, traffic }).expect(200)).body.data.summary;

  it("needs a signed-in person", async () => {
    await http.post(`/v1/designs/${randomUUID()}/fixes`).send({ expectedRevision: 1, runId: randomUUID() }).expect(401);
  });

  it("suggests fixes for a failing run, in the published shape, best first, never more than three", async () => {
    const d = await design("mvp", 3);
    const run = await simulate(d.id, d.revision);
    expect(run.result.summary.verdict).not.toBe("pass");
    const res = await fixes(d.id, { expectedRevision: d.revision, runId: run.id }).expect(200);
    const body = fixesSchema.parse(res.body.data);
    expect(body).toMatchObject({ designId: d.id, runId: run.id, revision: d.revision, status: "SUGGESTIONS" });
    expect(body.baseline).toEqual({ verdict: run.result.summary.verdict, p95: run.result.summary.p95, errorRate: run.result.summary.errorRate, maxRho: run.result.summary.maxRho });
    expect(body.limiter?.id).toBe(run.result.summary.bottleneckId);
    expect(body.suggestions.length).toBeGreaterThan(0);
    expect(body.suggestions.length).toBeLessThanOrEqual(3);
    expect(body.tried).toBeGreaterThanOrEqual(body.suggestions.length);
    expect(body.skipped).toBe(0);
    const order = { pass: 0, strained: 1, fail: 2 };
    const afters = body.suggestions.map((s) => s.after);
    for (let i = 1; i < afters.length; i++) expect(order[afters[i].verdict]).toBeGreaterThanOrEqual(order[afters[i - 1].verdict]);
    expect(new Set(body.suggestions.map((s) => s.id)).size).toBe(body.suggestions.length);
  });

  it("reports for each fix exactly what a fresh simulation of that edited design gives, and never something worse than the run", async () => {
    let checked = 0;
    for (const [template, factor] of [["mvp", 3], ["three-tier", 3], ["content", 3], ["media", 3]] as const) {
      const d = await design(template, factor);
      const run = await simulate(d.id, d.revision);
      if (run.result.summary.verdict === "pass") continue;
      const body = fixesSchema.parse((await fixes(d.id, { expectedRevision: d.revision, runId: run.id }).expect(200)).body.data);
      for (const s of body.suggestions) {
        const fresh = await preview(s.graph, d.traffic);
        expect(s.after).toEqual({ verdict: fresh.verdict, p95: fresh.p95, errorRate: fresh.errorRate, maxRho: fresh.maxRho });
        expect(s.after.p95).toBeLessThanOrEqual(body.baseline.p95 * 1.001);
        expect(s.after.errorRate).toBeLessThanOrEqual(body.baseline.errorRate + 1e-9);
        expect(graphSchema.safeParse(s.graph).success).toBe(true);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(5);
  });

  it("gives the same answer when asked twice", async () => {
    const d = await design("three-tier", 3);
    const run = await simulate(d.id, d.revision);
    const a = (await fixes(d.id, { expectedRevision: d.revision, runId: run.id }).expect(200)).body.data;
    const b = (await fixes(d.id, { expectedRevision: d.revision, runId: run.id }).expect(200)).body.data;
    expect(b).toEqual(a);
  });

  it("changes nothing: the design keeps its revision and graph, and no run is added", async () => {
    const d = await design("mvp", 3);
    const run = await simulate(d.id, d.revision);
    const runsBefore = (await db.query("SELECT count(*)::int AS n FROM design_runs WHERE design_id=$1", [d.id]))[0].n;
    await fixes(d.id, { expectedRevision: d.revision, runId: run.id }).expect(200);
    const after = (await http.get(`/v1/designs/${d.id}`).set(auth()).expect(200)).body.data;
    expect(after.revision).toBe(d.revision);
    expect(after.graph).toEqual(d.graph);
    expect((await db.query("SELECT count(*)::int AS n FROM design_runs WHERE design_id=$1", [d.id]))[0].n).toBe(runsBefore);
  });

  it("has nothing to fix for a run that passes", async () => {
    const d = await design("mvp", 0.2);
    const run = await simulate(d.id, d.revision);
    expect(run.result.summary.verdict).toBe("pass");
    const body = fixesSchema.parse((await fixes(d.id, { expectedRevision: d.revision, runId: run.id }).expect(200)).body.data);
    expect(body).toMatchObject({ status: "NOTHING_TO_FIX", suggestions: [], tried: 0, skipped: 0 });
  });

  it("refuses a run that is not for the current saved design, and says to run the test again", async () => {
    const d = await design("mvp", 3);
    const run = await simulate(d.id, d.revision);
    const edited = (await http.patch(`/v1/designs/${d.id}`).set(auth()).send({ expectedRevision: d.revision, traffic: { ...d.traffic, rps: d.traffic.rps + 1 } }).expect(200)).body.data;
    const res = await fixes(d.id, { expectedRevision: edited.revision, runId: run.id }).expect(422);
    expect(JSON.stringify(res.body)).toMatch(/RUN_NOT_CURRENT/);
  });

  it("refuses a stale revision, a limits run, a run of another design, an unknown run and a malformed request", async () => {
    const d = await design("mvp", 3);
    const run = await simulate(d.id, d.revision);
    await fixes(d.id, { expectedRevision: d.revision + 5, runId: run.id }).expect(409);
    const lim = await limits(d.id, d.revision);
    expect(JSON.stringify((await fixes(d.id, { expectedRevision: d.revision, runId: lim.id }).expect(422)).body)).toMatch(/RUN_NOT_USABLE/);
    const d2 = await design("mvp", 3);
    const run2 = await simulate(d2.id, d2.revision);
    await fixes(d.id, { expectedRevision: d.revision, runId: run2.id }).expect(404);
    await fixes(d.id, { expectedRevision: d.revision, runId: randomUUID() }).expect(404);
    for (const bad of [{}, { expectedRevision: d.revision }, { runId: run.id }, { expectedRevision: 0, runId: run.id }, { expectedRevision: d.revision, runId: "x" }, { expectedRevision: d.revision, runId: run.id, extra: 1 }])
      await fixes(d.id, bad).expect(422);
  });

  it("keeps designs private: another person is refused, as for every other design endpoint", async () => {
    const d = await design("mvp", 3);
    const run = await simulate(d.id, d.revision);
    await fixes(d.id, { expectedRevision: d.revision, runId: run.id }, other()).expect(403);
  });

  it("is in the published contract", () => {
    const doc = phase3OpenApi() as unknown as { paths: Record<string, Record<string, { operationId: string }>>; components: { schemas: Record<string, unknown> } };
    expect(doc.paths["/v1/designs/{id}/fixes"].post.operationId).toBe("suggestDesignFixes");
    expect(doc.components.schemas.DesignFixes).toBeDefined();
    expect(doc.components.schemas.FixesRequest).toBeDefined();
  });
});
