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
import { reportSchema } from "@/common/contracts/phase3/report.schema";
import { ReportService, REPORT_LIMITATIONS } from "@/modules/designs/report.service";

jest.setTimeout(120000);
describe("M16.1 Report (isolated Postgres, no AI involved)", () => {
  let app: NestExpressApplication, db: DataSource, http: ReturnType<typeof request>;
  let owner: string, foreign: string;
  const auth = () => ({ Authorization: "Bearer " + owner });
  const other = () => ({ Authorization: "Bearer " + foreign });
  const email = "owner" + randomUUID() + "@example.test";

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
        .send({ email: who === "owner" ? email : who + randomUUID() + "@example.test", password: "M16-report-2026!", displayName: who })
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
  const note = (id: string, kind: "decision" | "assumption", text: string, revision?: number) =>
    http.post(`/v1/designs/${id}/notes`).set(auth()).send({ kind, text, revision }).expect(201);
  const report = (id: string, query = "", headers = auth()) => http.get(`/v1/designs/${id}/report${query ? "?" + query : ""}`).set(headers);

  it("reports the current revision and its latest completed run, with the model's own numbers", async () => {
    const d = await newDesign();
    await simulate(d.id, 1);
    const latest = await simulate(d.id, 1);
    const r = reportSchema.parse((await report(d.id).expect(200)).body.data);
    expect(r).toMatchObject({ designId: d.id, name: d.name, revision: 1, isCurrentRevision: true, noteScope: "all" });
    expect(r.graph).toEqual(d.graph);
    expect(r.traffic).toEqual(d.traffic);
    expect(r.run).toMatchObject({ id: latest.id, kind: "simulation", status: "completed", designRevision: 1, matchesRevision: true });
    const s = latest.result.summary;
    expect(r.run!.simulation).toMatchObject({ verdict: s.verdict, p50: s.p50, p95: s.p95, p99: s.p99, errorRate: s.errorRate, throughput: s.throughput, sloMet: s.sloMet });
    expect(r.run!.simulation!.p95Target).toBe(s.traffic.sloP95);
    expect(r.run!.simulation!.components).toHaveLength(s.nodes.length);
    expect(r.run!.traffic).toEqual(latest.snapshot.traffic);
    expect(r.limitations).toEqual(REPORT_LIMITATIONS);
  });

  it("says plainly when Limits was not run, and carries the search result when it was", async () => {
    const d = await newDesign();
    await simulate(d.id, 1);
    expect((await report(d.id).expect(200)).body.data.limits).toBeNull();
    const search = await limits(d.id, 1);
    const r = reportSchema.parse((await report(d.id).expect(200)).body.data);
    expect(r.limits).toMatchObject({ runId: search.id, state: search.result.state });
    if (search.result.state === "found") {
      expect(r.limits!.passingRps).toBe(search.result.passingRps);
      expect(r.limits!.failingRps).toBe(search.result.failingRps);
    }
    // A Limits search is disclosed per revision: another revision has no such disclosure.
    await edit(d.id, 1, { name: "Second revision" });
    expect((await report(d.id).expect(200)).body.data.limits).toBeNull();
  });

  it("reports an earlier revision from its retained snapshot, and flags a run recorded for a different revision", async () => {
    const d = await newDesign();
    const run1 = await simulate(d.id, 1);
    const stronger = { ...d.graph, nodes: d.graph.nodes.map((n: { type: string; props: Record<string, unknown> }) => (n.type === "app" ? { ...n, props: { ...n.props, replicas: 6 } } : n)) };
    await edit(d.id, 1, { name: "Renamed later", graph: stronger, traffic: { ...d.traffic, rps: d.traffic.rps + 100 } });
    const old = reportSchema.parse((await report(d.id, "revision=1").expect(200)).body.data);
    expect(old).toMatchObject({ name: d.name, revision: 1, isCurrentRevision: false });
    expect(old.traffic).toEqual(d.traffic);
    expect(old.graph).toEqual(d.graph);
    expect(old.run!.id).toBe(run1.id);
    // Current revision has no run of its own: nothing is borrowed from revision 1.
    const current = reportSchema.parse((await report(d.id).expect(200)).body.data);
    expect(current).toMatchObject({ name: "Renamed later", revision: 2, isCurrentRevision: true, run: null });
    expect(current.graph).toEqual(stronger);
    // Choosing revision 2 with revision 1's run is allowed but never disguised.
    const mismatch = reportSchema.parse((await report(d.id, `revision=2&run=${run1.id}`).expect(200)).body.data);
    expect(mismatch.run).toMatchObject({ id: run1.id, designRevision: 1, matchesRevision: false });
    expect(mismatch.traffic.rps).toBe(d.traffic.rps + 100);
    expect(mismatch.run!.traffic.rps).toBe(d.traffic.rps);
  });

  it("includes every note in the owner's report, and the shared-report scopes filter them", async () => {
    const d = await newDesign();
    await note(d.id, "decision", "Keep one database.");
    await note(d.id, "assumption", "Reads are 80% of traffic.");
    const own = reportSchema.parse((await report(d.id).expect(200)).body.data);
    expect(own.notes.map((n) => n.text).sort()).toEqual(["Keep one database.", "Reads are 80% of traffic."]);
    const service = app.get(ReportService);
    const decisions = await service.assemble(d.id, 1, null, "decisions");
    expect(decisions.notes.map((n) => n.text)).toEqual(["Keep one database."]);
    expect(decisions.noteScope).toBe("decisions");
    const none = await service.assemble(d.id, 1, null, "none");
    expect(none.notes).toEqual([]);
    expect(none.noteScope).toBe("none");
  });

  it("returns a purpose-built document: no owner details or internal ids, and no run for a design never run", async () => {
    const d = await newDesign();
    const r = (await report(d.id).expect(200)).body.data;
    expect(r.run).toBeNull();
    const text = JSON.stringify(r);
    expect(text).not.toContain(email);
    expect(text).not.toContain("ownerId");
    expect(text).not.toContain("owner_id");
    expect(Object.keys(r).sort()).toEqual(
      ["designId", "name", "description", "revision", "isCurrentRevision", "versionCreatedAt", "generatedAt", "graph", "traffic", "run", "limits", "noteScope", "notes", "limitations"].sort(),
    );
  });

  it("refuses foreign accounts, other designs' runs, unknown revisions and bad input", async () => {
    const d = await newDesign();
    const e = await newDesign();
    const foreignRun = await simulate(e.id, 1);
    await report(d.id, "", other()).expect(403);
    await http.get(`/v1/designs/${d.id}/report`).expect(401);
    await report(randomUUID()).expect(404);
    const gone = await report(d.id, "revision=9").expect(404);
    expect(gone.body.error.details).toMatchObject({ reason: "VERSION_NOT_RETAINED", revision: 9 });
    await report(d.id, `run=${randomUUID()}`).expect(404);
    await report(d.id, `run=${foreignRun.id}`).expect(404);
    await report(d.id, "revision=0").expect(422);
    await report(d.id, "run=not-a-uuid").expect(422);
    await report(d.id, "extra=1").expect(422);
  });

  it("publishes the operation in the live OpenAPI document, identical to the canonical contract", async () => {
    const live = (await http.get("/docs-json").expect(200)).body;
    const canonical = phase3OpenApi().paths as Record<string, unknown>;
    expect(canonical["/v1/designs/{id}/report"]).toBeDefined();
    expect(live.paths["/v1/designs/{id}/report"]).toEqual(canonical["/v1/designs/{id}/report"]);
  });
});
