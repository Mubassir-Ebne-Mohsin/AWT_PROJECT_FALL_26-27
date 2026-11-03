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
import { fixesSchema } from "@/common/contracts/phase3/fixes.schema";
import { phase3OpenApi } from "@/common/contracts/phase3/openapi";

// What a person may ask of the fix suggestions (leave kinds out, choose what comes first), on the real application, PostgreSQL and
// engine. No AI is involved: the filter narrows and orders what the engine verifies, and never changes a figure.
jest.setTimeout(120000);
describe("Fix suggestions with a filter (isolated Postgres, real engine, no AI)", () => {
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
      const r = await http.post("/v1/auth/register").send({ email: who + randomUUID() + "@example.test", password: "Filter-e2e-2026!", displayName: who }).expect(201);
      if (who === "owner") owner = r.body.data.accessToken;
      else foreign = r.body.data.accessToken;
    }
  });
  afterAll(async () => {
    await app?.close();
  });

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
  const fixes = (id: string, body: unknown, headers = auth()) => http.post(`/v1/designs/${id}/fixes`).set(headers).send(body as object);
  const preview = async (graph: unknown, traffic: unknown) =>
    (await http.post("/v1/simulation/preview").set(auth()).send({ editorSessionId: randomUUID(), sequence: 0, schemaVersion: 1, graph, traffic }).expect(200)).body.data.summary;
  const counts = async (id: string) => ({
    runs: (await db.query("SELECT count(*)::int AS n FROM design_runs WHERE design_id=$1", [id]))[0].n,
    revision: (await db.query("SELECT revision FROM designs WHERE id=$1", [id]))[0].revision,
  });

  /** A failing design with a completed run, and what the unfiltered fixes say about it. */
  async function failing() {
    const d = await design("mvp", 3);
    const run = await simulate(d.id, d.revision);
    expect(run.result.summary.verdict).not.toBe("pass");
    const plain = fixesSchema.parse((await fixes(d.id, { expectedRevision: d.revision, runId: run.id }).expect(200)).body.data);
    return { d, run, plain, ask: (filter: unknown) => fixes(d.id, { expectedRevision: d.revision, runId: run.id, filter }) };
  }

  it("is part of the published contract, as an optional filter on the request and an echo on the answer", () => {
    const doc = JSON.stringify(phase3OpenApi());
    expect(doc).toContain("ALL_EXCLUDED");
    expect(doc).toContain('"filter"');
    const schemas = (phase3OpenApi() as unknown as { components: { schemas: Record<string, unknown> } }).components.schemas;
    expect(JSON.stringify(schemas.FixesRequest)).toContain('"filter"');
    expect(JSON.stringify(schemas.FixesRequest)).not.toMatch(/"required":\[[^\]]*"filter"/);
  });

  it("without a filter answers exactly as before and echoes that nothing was left out", async () => {
    const { plain } = await failing();
    expect(plain.filter).toEqual({ exclude: [], preference: "default" });
    expect(plain.suggestions.map((s) => s.kind).sort()).toEqual(["capacity", "replicas"]);
  });

  it("never tries or offers a kind the person left out, and the rest are exactly the unfiltered ones", async () => {
    const { plain, ask } = await failing();
    const out = fixesSchema.parse((await ask({ exclude: ["replicas"], preference: "default" }).expect(200)).body.data);
    expect(out.filter).toEqual({ exclude: ["replicas"], preference: "default" });
    expect(out.suggestions.map((s) => s.kind)).toEqual(["capacity"]);
    expect([plain.tried, out.tried]).toEqual([2, 1]);
    const same = plain.suggestions.find((s) => s.kind === "capacity")!;
    expect(out.suggestions[0]).toEqual(same);
  });

  it("reports for a filtered fix exactly what a fresh simulation of that edited design gives", async () => {
    const { d, ask } = await failing();
    const out = fixesSchema.parse((await ask({ exclude: ["capacity"], preference: "fewest_errors" }).expect(200)).body.data);
    expect(out.suggestions.length).toBeGreaterThan(0);
    for (const fix of out.suggestions) {
      const fresh = await preview(fix.graph, (await http.get(`/v1/designs/${d.id}`).set(auth()).expect(200)).body.data.traffic);
      expect(fix.after).toEqual({ verdict: fresh.verdict, p95: fresh.p95, errorRate: fresh.errorRate, maxRho: fresh.maxRho });
    }
  });

  it("orders by the preference: lowest p95 and fewest errors each put their own measure first", async () => {
    const { ask } = await failing();
    const byLatency = fixesSchema.parse((await ask({ exclude: [], preference: "lowest_latency" }).expect(200)).body.data).suggestions.map((s) => s.after.p95);
    expect([...byLatency].sort((a, b) => a - b)).toEqual(byLatency);
    const byErrors = fixesSchema.parse((await ask({ exclude: [], preference: "fewest_errors" }).expect(200)).body.data).suggestions.map((s) => Math.round(s.after.errorRate * 10_000));
    expect([...byErrors].sort((a, b) => a - b)).toEqual(byErrors);
    const bySimplest = fixesSchema.parse((await ask({ exclude: [], preference: "simplest" }).expect(200)).body.data);
    expect(bySimplest.suggestions[0].kind).toBe("replicas");
  });

  it("says ALL_EXCLUDED and calculates nothing when every kind that could be tried is left out", async () => {
    const { d, ask } = await failing();
    const before = await counts(d.id);
    const out = fixesSchema.parse((await ask({ exclude: ["replicas", "capacity"], preference: "default" }).expect(200)).body.data);
    expect(out).toMatchObject({ status: "ALL_EXCLUDED", suggestions: [], tried: 0, skipped: 0 });
    expect(await counts(d.id)).toEqual(before);
  });

  it("changes nothing in the design or its runs, whatever the filter", async () => {
    const { d, ask } = await failing();
    const before = await counts(d.id);
    await ask({ exclude: ["cache"], preference: "simplest" }).expect(200);
    expect(await counts(d.id)).toEqual(before);
  });

  it("refuses a filter with an unknown kind or word, extra fields, or a repeated shape, before any calculation", async () => {
    const { d, run } = await failing();
    for (const filter of [{ exclude: ["bigger"], preference: "default" }, { exclude: [], preference: "cheapest" }, { exclude: [], preference: "default", extra: 1 }, { exclude: "cache", preference: "default" }, { exclude: ["cache"] }, { preference: "default" }, null])
      await fixes(d.id, { expectedRevision: d.revision, runId: run.id, filter }).expect(422);
  });

  it("keeps another person's design private, with or without a filter", async () => {
    const { d, run } = await failing();
    for (const filter of [undefined, { exclude: ["cache"], preference: "default" }]) await fixes(d.id, { expectedRevision: d.revision, runId: run.id, ...(filter ? { filter } : {}) }, other()).expect(403);
  });
});
