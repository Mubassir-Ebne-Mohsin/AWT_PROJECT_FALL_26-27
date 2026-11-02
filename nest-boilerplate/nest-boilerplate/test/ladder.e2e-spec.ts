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
import { ladderSchema } from "@/common/contracts/phase3/ladder.schema";

// The load ladder on the real application and PostgreSQL. No AI is involved anywhere. The central check: every number a rung
// reports equals what a separate, fresh simulation of the same design at that request rate gives.
jest.setTimeout(120000);
describe("Load ladder (isolated Postgres, real engine, no AI)", () => {
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
      const r = await http.post("/v1/auth/register").send({ email: who + randomUUID() + "@example.test", password: "Ladder-e2e-2026!", displayName: who }).expect(201);
      if (who === "owner") owner = r.body.data.accessToken;
      else foreign = r.body.data.accessToken;
    }
  });
  afterAll(async () => {
    await app?.close();
  });

  async function design(templateId = "mvp", rps?: number) {
    const t = getTemplates().find((x) => x.id === templateId)!;
    return (
      await http.post("/v1/designs").set(auth()).send({ schemaVersion: 1, name: t.name, description: t.blurb, source: "template", templateId: t.id, graph: t.graph, traffic: { ...t.traffic, ...(rps === undefined ? {} : { rps }) } }).expect(201)
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
  const ladder = (id: string, body: unknown, headers = auth()) => http.post(`/v1/designs/${id}/ladder`).set(headers).send(body as object);
  const preview = async (graph: unknown, traffic: unknown) =>
    (await http.post("/v1/simulation/preview").set(auth()).send({ editorSessionId: randomUUID(), sequence: 0, schemaVersion: 1, graph, traffic }).expect(200)).body.data.summary;

  it("needs a signed-in person", async () => {
    await http.post(`/v1/designs/${randomUUID()}/ladder`).send({ expectedRevision: 1, runId: randomUUID() }).expect(401);
  });

  it("climbs a passing design: the recorded run, then two, five and ten times its rate, in the published shape", async () => {
    const d = await design("mvp");
    const run = await simulate(d.id, d.revision);
    const out = ladderSchema.parse((await ladder(d.id, { expectedRevision: d.revision, runId: run.id }).expect(200)).body.data);
    expect(out).toMatchObject({ designId: d.id, runId: run.id, revision: d.revision });
    expect(out.rungs.map((r) => r.multiplier)).toEqual([1, 2, 5, 10]);
    expect(out.rungs.map((r) => r.rps)).toEqual([1, 2, 5, 10].map((m) => d.traffic.rps * m));
    expect(out.rungs.every((r) => r.status === "OK")).toBe(true);
  });

  it("reports the recorded run itself for the first rung", async () => {
    const d = await design("three-tier");
    const run = await simulate(d.id, d.revision);
    const s = run.result.summary;
    const [first] = ladderSchema.parse((await ladder(d.id, { expectedRevision: d.revision, runId: run.id }).expect(200)).body.data).rungs;
    expect(first.measure).toEqual({ verdict: s.verdict, p95: s.p95, errorRate: s.errorRate, maxRho: s.maxRho });
    const hot = s.bottleneckId ? s.nodes.find((n: { id: string }) => n.id === s.bottleneckId) : undefined;
    expect(first.limiter).toEqual(hot ? { id: hot.id, label: hot.label, type: hot.type } : null);
  });

  it("reports for each rung exactly what a fresh simulation of the same design at that rate gives", async () => {
    let checked = 0;
    for (const template of ["mvp", "three-tier", "content", "media", "checkout"]) {
      const d = await design(template);
      const run = await simulate(d.id, d.revision);
      const out = ladderSchema.parse((await ladder(d.id, { expectedRevision: d.revision, runId: run.id }).expect(200)).body.data);
      for (const rung of out.rungs.filter((r) => r.multiplier > 1)) {
        const fresh = await preview(d.graph, { ...d.traffic, rps: d.traffic.rps * rung.multiplier });
        expect(rung.measure).toEqual({ verdict: fresh.verdict, p95: fresh.p95, errorRate: fresh.errorRate, maxRho: fresh.maxRho });
        const hot = fresh.bottleneckId ? fresh.nodes.find((n: { id: string }) => n.id === fresh.bottleneckId) : undefined;
        expect(rung.limiter).toEqual(hot ? { id: hot.id, label: hot.label, type: hot.type } : null);
        checked++;
      }
    }
    expect(checked).toBe(15);
  });

  it("never shows more load doing better: errors and p95 do not fall as the rate rises", async () => {
    for (const template of ["mvp", "three-tier", "content", "media", "ingest", "checkout"]) {
      const d = await design(template);
      const run = await simulate(d.id, d.revision);
      const rungs = ladderSchema.parse((await ladder(d.id, { expectedRevision: d.revision, runId: run.id }).expect(200)).body.data).rungs;
      for (let i = 1; i < rungs.length; i++) {
        expect(rungs[i].measure!.errorRate).toBeGreaterThanOrEqual(rungs[i - 1].measure!.errorRate - 1e-9);
        expect(rungs[i].measure!.p95).toBeGreaterThanOrEqual(rungs[i - 1].measure!.p95 - 1e-6);
      }
    }
  });

  it("gives the same answer when asked twice", async () => {
    const d = await design("content");
    const run = await simulate(d.id, d.revision);
    const a = (await ladder(d.id, { expectedRevision: d.revision, runId: run.id }).expect(200)).body.data;
    const b = (await ladder(d.id, { expectedRevision: d.revision, runId: run.id }).expect(200)).body.data;
    expect(b).toEqual(a);
  });

  it("changes nothing: the design keeps its revision, graph and traffic, and no run is added", async () => {
    const d = await design("mvp");
    const run = await simulate(d.id, d.revision);
    const runsBefore = (await db.query("SELECT count(*)::int AS n FROM design_runs WHERE design_id=$1", [d.id]))[0].n;
    await ladder(d.id, { expectedRevision: d.revision, runId: run.id }).expect(200);
    const after = (await http.get(`/v1/designs/${d.id}`).set(auth()).expect(200)).body.data;
    expect(after.revision).toBe(d.revision);
    expect(after.graph).toEqual(d.graph);
    expect(after.traffic).toEqual(d.traffic);
    expect((await db.query("SELECT count(*)::int AS n FROM design_runs WHERE design_id=$1", [d.id]))[0].n).toBe(runsBefore);
  });

  it("says plainly when a rate is beyond what the model accepts, and calculates the others", async () => {
    const d = await design("mvp", 4_000_000);
    const run = await simulate(d.id, d.revision);
    const rungs = ladderSchema.parse((await ladder(d.id, { expectedRevision: d.revision, runId: run.id }).expect(200)).body.data).rungs;
    expect(rungs.map((r) => [r.multiplier, r.status])).toEqual([[1, "OK"], [2, "OK"], [5, "TOO_LARGE"], [10, "TOO_LARGE"]]);
    expect(rungs[2]).toMatchObject({ rps: 20_000_000, measure: null, limiter: null });
  });

  it("refuses a run that is not for the current saved design, and says to run the test again", async () => {
    const d = await design("mvp");
    const run = await simulate(d.id, d.revision);
    const edited = (await http.patch(`/v1/designs/${d.id}`).set(auth()).send({ expectedRevision: d.revision, traffic: { ...d.traffic, rps: d.traffic.rps + 1 } }).expect(200)).body.data;
    const res = await ladder(d.id, { expectedRevision: edited.revision, runId: run.id }).expect(422);
    expect(JSON.stringify(res.body)).toMatch(/RUN_NOT_CURRENT/);
  });

  it("refuses a stale revision, a limits run, a run of another design, an unknown run and a malformed request", async () => {
    const d = await design("mvp");
    const run = await simulate(d.id, d.revision);
    await ladder(d.id, { expectedRevision: d.revision + 5, runId: run.id }).expect(409);
    const lim = await limits(d.id, d.revision);
    expect(JSON.stringify((await ladder(d.id, { expectedRevision: d.revision, runId: lim.id }).expect(422)).body)).toMatch(/RUN_NOT_USABLE/);
    const d2 = await design("mvp");
    const run2 = await simulate(d2.id, d2.revision);
    await ladder(d.id, { expectedRevision: d.revision, runId: run2.id }).expect(404);
    await ladder(d.id, { expectedRevision: d.revision, runId: randomUUID() }).expect(404);
    for (const bad of [{}, { expectedRevision: d.revision }, { runId: run.id }, { expectedRevision: 0, runId: run.id }, { expectedRevision: d.revision, runId: "x" }, { expectedRevision: d.revision, runId: run.id, extra: 1 }])
      await ladder(d.id, bad).expect(422);
  });

  it("keeps designs private: another person is refused, as for every other design endpoint", async () => {
    const d = await design("mvp");
    const run = await simulate(d.id, d.revision);
    await ladder(d.id, { expectedRevision: d.revision, runId: run.id }, other()).expect(403);
  });

  it("is in the published contract", () => {
    const doc = phase3OpenApi() as unknown as { paths: Record<string, Record<string, { operationId: string }>>; components: { schemas: Record<string, unknown> } };
    expect(doc.paths["/v1/designs/{id}/ladder"].post.operationId).toBe("climbDesignLadder");
    expect(doc.components.schemas.DesignLadder).toBeDefined();
    expect(doc.components.schemas.LadderRequest).toBeDefined();
  });
});
