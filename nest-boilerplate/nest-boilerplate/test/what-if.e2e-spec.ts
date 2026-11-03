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
import { whatIfSchema, type WhatIfChange } from "@/common/contracts/phase3/what-if.schema";

// "What if the traffic changed?" on the real application and PostgreSQL. No AI is involved anywhere. The central check: the answer
// equals what a separate, fresh simulation of the same design under the same changed traffic gives.
jest.setTimeout(120000);
const keep: WhatIfChange = { trafficMode: "keep", value: 0, shape: "keep", readShare: "keep" };
const change = (over: Partial<WhatIfChange>): WhatIfChange => ({ ...keep, ...over });

describe("What-if (isolated Postgres, real engine, no AI)", () => {
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
      const r = await http.post("/v1/auth/register").send({ email: who + randomUUID() + "@example.test", password: "WhatIf-e2e-2026!", displayName: who }).expect(201);
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
  const ask = (id: string, body: unknown, headers = auth()) => http.post(`/v1/designs/${id}/what-if`).set(headers).send(body as object);
  const preview = async (graph: unknown, traffic: unknown) =>
    (await http.post("/v1/simulation/preview").set(auth()).send({ editorSessionId: randomUUID(), sequence: 0, schemaVersion: 1, graph, traffic }).expect(200)).body.data.summary;

  it("needs a signed-in person", async () => {
    await http.post(`/v1/designs/${randomUUID()}/what-if`).send({ expectedRevision: 1, runId: randomUUID(), change: keep }).expect(401);
  });

  it("answers in the published shape, with the recorded run as 'before'", async () => {
    const d = await design("three-tier");
    const run = await simulate(d.id, d.revision);
    const s = run.result.summary;
    const out = whatIfSchema.parse((await ask(d.id, { expectedRevision: d.revision, runId: run.id, change: change({ trafficMode: "multiply", value: 2 }) }).expect(200)).body.data);
    expect(out).toMatchObject({ designId: d.id, runId: run.id, revision: d.revision });
    expect(out.before).toMatchObject({ rps: d.traffic.rps, shape: d.traffic.shape, readRatio: d.traffic.readRatio, status: "OK" });
    expect(out.before.measure).toEqual({ verdict: s.verdict, p95: s.p95, errorRate: s.errorRate, maxRho: s.maxRho });
    expect(out.after).toMatchObject({ rps: d.traffic.rps * 2, status: "OK" });
  });

  it("reports exactly what a fresh simulation of the same design under the same changed traffic gives", async () => {
    let checked = 0;
    for (const template of ["mvp", "three-tier", "content", "media", "checkout"]) {
      const d = await design(template);
      const run = await simulate(d.id, d.revision);
      const cases: [WhatIfChange, Record<string, unknown>][] = [
        [change({ trafficMode: "multiply", value: 3 }), { rps: d.traffic.rps * 3 }],
        [change({ trafficMode: "multiply", value: 0.5 }), { rps: d.traffic.rps * 0.5 }],
        [change({ shape: "spike" }), { shape: "spike" }],
        [change({ readShare: "mostly_writes" }), { readRatio: 0.1 }],
        [change({ trafficMode: "set", value: 1234, shape: "ramp", readShare: "balanced" }), { rps: 1234, shape: "ramp", readRatio: 0.5 }],
      ];
      for (const [c, patch] of cases) {
        const out = whatIfSchema.parse((await ask(d.id, { expectedRevision: d.revision, runId: run.id, change: c }).expect(200)).body.data);
        const fresh = await preview(d.graph, { ...d.traffic, ...patch });
        expect(out.after.measure).toEqual({ verdict: fresh.verdict, p95: fresh.p95, errorRate: fresh.errorRate, maxRho: fresh.maxRho });
        const hot = fresh.bottleneckId ? fresh.nodes.find((n: { id: string }) => n.id === fresh.bottleneckId) : undefined;
        expect(out.after.limiter).toEqual(hot ? { id: hot.id, label: hot.label, type: hot.type } : null);
        checked++;
      }
    }
    expect(checked).toBe(25);
  });

  it("gives the same answer when asked twice, and changes nothing: revision, graph, traffic and run count stay", async () => {
    const d = await design("content");
    const run = await simulate(d.id, d.revision);
    const runsBefore = (await db.query("SELECT count(*)::int AS n FROM design_runs WHERE design_id=$1", [d.id]))[0].n;
    const body = { expectedRevision: d.revision, runId: run.id, change: change({ trafficMode: "multiply", value: 4, shape: "spike" }) };
    const a = (await ask(d.id, body).expect(200)).body.data;
    const b = (await ask(d.id, body).expect(200)).body.data;
    expect(b).toEqual(a);
    const after = (await http.get(`/v1/designs/${d.id}`).set(auth()).expect(200)).body.data;
    expect([after.revision, after.graph, after.traffic]).toEqual([d.revision, d.graph, d.traffic]);
    expect((await db.query("SELECT count(*)::int AS n FROM design_runs WHERE design_id=$1", [d.id]))[0].n).toBe(runsBefore);
  });

  it("refuses an out-of-range value or an empty change with a plain message, never clamping", async () => {
    const d = await design("mvp");
    const run = await simulate(d.id, d.revision);
    const send = (c: unknown) => ask(d.id, { expectedRevision: d.revision, runId: run.id, change: c }).expect(422);
    for (const c of [change({ trafficMode: "multiply", value: 1_000_000 }), change({ trafficMode: "multiply", value: 0.01 }), change({ trafficMode: "set", value: 10_000_000_000 }), change({ trafficMode: "set", value: 0 })])
      expect(JSON.stringify((await send(c)).body)).toMatch(/WHATIF_OUT_OF_RANGE/);
    expect(JSON.stringify((await send(keep)).body)).toMatch(/WHATIF_NOTHING_TO_CHANGE/);
    for (const bad of [{}, { ...keep, trafficMode: "double" }, { ...keep, shape: "wave" }, { ...keep, readShare: "all" }, { ...keep, extra: 1 }, { ...keep, value: "2" }]) await send(bad);
  });

  it("says plainly when the changed rate is beyond what the model accepts", async () => {
    const d = await design("mvp", 4_000_000);
    const run = await simulate(d.id, d.revision);
    const out = whatIfSchema.parse((await ask(d.id, { expectedRevision: d.revision, runId: run.id, change: change({ trafficMode: "multiply", value: 4 }) }).expect(200)).body.data);
    expect(out.after).toMatchObject({ rps: 16_000_000, status: "TOO_LARGE", measure: null, limiter: null });
    expect(out.before.status).toBe("OK");
  });

  it("refuses a run that is not for the current saved design, a stale revision, a foreign design and a malformed request", async () => {
    const d = await design("mvp");
    const run = await simulate(d.id, d.revision);
    const edited = (await http.patch(`/v1/designs/${d.id}`).set(auth()).send({ expectedRevision: d.revision, traffic: { ...d.traffic, rps: d.traffic.rps + 1 } }).expect(200)).body.data;
    const c = change({ shape: "spike" });
    expect(JSON.stringify((await ask(d.id, { expectedRevision: edited.revision, runId: run.id, change: c }).expect(422)).body)).toMatch(/RUN_NOT_CURRENT/);
    await ask(d.id, { expectedRevision: edited.revision + 5, runId: run.id, change: c }).expect(409);
    await ask(d.id, { expectedRevision: d.revision, runId: run.id, change: c }, other()).expect(403);
    await ask(d.id, { expectedRevision: edited.revision, runId: randomUUID(), change: c }).expect(404);
    for (const bad of [{}, { expectedRevision: d.revision, runId: run.id }, { expectedRevision: 0, runId: run.id, change: c }, { expectedRevision: d.revision, runId: "x", change: c }, { expectedRevision: d.revision, runId: run.id, change: c, extra: 1 }])
      await ask(d.id, bad).expect(422);
  });

  it("is in the published contract", () => {
    const doc = phase3OpenApi() as unknown as { paths: Record<string, Record<string, { operationId: string }>>; components: { schemas: Record<string, unknown> } };
    expect(doc.paths["/v1/designs/{id}/what-if"].post.operationId).toBe("askDesignWhatIf");
    expect(doc.components.schemas.DesignWhatIf).toBeDefined();
    expect(doc.components.schemas.WhatIfRequest).toBeDefined();
  });
});
