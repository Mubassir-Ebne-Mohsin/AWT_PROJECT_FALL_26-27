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
import { libraryListSchema } from "@/common/contracts/phase3/library.schema";

jest.setTimeout(120000);
describe("M15.5 Designs list (isolated Postgres, no AI involved)", () => {
  let app: NestExpressApplication, db: DataSource, http: ReturnType<typeof request>;

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
  });
  afterAll(async () => {
    await app?.close();
  });

  /** A fresh account per test keeps counts exact. */
  async function account() {
    const r = await http
      .post("/v1/auth/register")
      .send({ email: "lib" + randomUUID() + "@example.test", password: "M15-library-2026!", displayName: "lib" })
      .expect(201);
    const headers = { Authorization: "Bearer " + r.body.data.accessToken };
    const template = getTemplates().find((x) => x.id === "mvp")!;
    const create = async (name: string, over: Record<string, unknown> = {}) =>
      (
        await http
          .post("/v1/designs")
          .set(headers)
          .send({ schemaVersion: 1, name, description: template.blurb, source: "template", templateId: template.id, graph: template.graph, traffic: template.traffic, ...over })
          .expect(201)
      ).body.data;
    const simulate = async (id: string, revision = 1) => {
      const accepted = (await http.post(`/v1/designs/${id}/simulate`).set(headers).send({ expectedRevision: revision, requestId: randomUUID() }).expect(202)).body.data;
      for (let i = 0; i < 150; i++) {
        const run = (await http.get(accepted.statusUrl).set(headers).expect(200)).body.data;
        if (run.status !== "pending") return run;
        await new Promise((res) => setTimeout(res, 50));
      }
      throw new Error("run stayed pending");
    };
    const list = (query = "") => http.get(`/v1/library/designs${query ? "?" + query : ""}`).set(headers);
    return { headers, template, create, simulate, list };
  }

  it("lists only the owner's designs, newest first, with counts and the latest result", async () => {
    const a = await account();
    const b = await account();
    const first = await a.create("First design");
    const second = await a.create("Second design");
    await b.create("Someone else's design");
    await a.simulate(second.id);
    const body = libraryListSchema.parse((await a.list().expect(200)).body);
    expect(body.meta).toEqual({ page: 1, pageSize: 20, total: 2 });
    expect(body.data.map((d) => d.id)).toEqual([second.id, first.id]);
    expect(body.data[0]).toMatchObject({ name: "Second design", revision: 1, archivedAt: null, nodeCount: 3, edgeCount: 2 });
    expect(body.data[0].latestRun).toMatchObject({ kind: "simulation", status: "completed", designRevision: 1 });
    expect(["pass", "strained", "fail"]).toContain(body.data[0].latestRun!.verdict);
    expect(body.data[1].latestRun).toBeNull(); // no result yet is shown honestly, not as a pass
  });

  it("searches name and description case-insensitively, treats % and _ literally and is injection-safe", async () => {
    const a = await account();
    await a.create("Checkout service", { description: "Handles PAYMENTS" });
    await a.create("100% uptime");
    await a.create("100x growth");
    await a.create("snake_case name");
    await a.create("snakeXcase name");
    const names = async (q: string) => (await a.list("q=" + encodeURIComponent(q)).expect(200)).body.data.map((d: { name: string }) => d.name).sort();
    expect(await names("CHECKOUT")).toEqual(["Checkout service"]);
    expect(await names("payments")).toEqual(["Checkout service"]);
    expect(await names("100%")).toEqual(["100% uptime"]);
    expect(await names("snake_case")).toEqual(["snake_case name"]);
    expect(await names("\\")).toEqual([]);
    expect(await names("'; DROP TABLE designs; --")).toEqual([]);
    expect(await names("zzz nothing matches")).toEqual([]);
    const total = await db.query("SELECT count(*)::int AS n FROM designs");
    expect(total[0].n).toBeGreaterThan(4); // the table is intact
  });

  it("filters by verdict, separates designs with no result, and sorts by name or last run", async () => {
    const a = await account();
    const ok = await a.create("Beta calm", { traffic: { ...a.template.traffic, rps: 5 } });
    const bad = await a.create("alpha overloaded", { traffic: { ...a.template.traffic, rps: 400000 } });
    await a.create("charlie unrun");
    await a.simulate(ok.id);
    await a.simulate(bad.id);
    const ids = async (query: string) => (await a.list(query).expect(200)).body.data.map((d: { id: string }) => d.id);
    expect(await ids("verdict=fail")).toEqual([bad.id]);
    expect(await ids("verdict=pass")).toEqual([ok.id]);
    const strained = (await a.list("verdict=strained").expect(200)).body.data;
    expect(strained.every((d: { latestRun: { verdict: string } }) => d.latestRun.verdict === "strained")).toBe(true);
    const none = (await a.list("verdict=none").expect(200)).body.data;
    expect(none.map((d: { name: string }) => d.name)).toEqual(["charlie unrun"]);
    expect(none[0].latestRun).toBeNull();
    expect((await a.list("sort=name").expect(200)).body.data.map((d: { name: string }) => d.name)).toEqual(["alpha overloaded", "Beta calm", "charlie unrun"]);
    // The overloaded design ran last, so it comes first; the never-run design is last.
    expect((await a.list("sort=lastRun").expect(200)).body.data.map((d: { name: string }) => d.name)).toEqual(["alpha overloaded", "Beta calm", "charlie unrun"]);
    const reversed = await a.simulate(ok.id); // now the calm one ran most recently
    expect(reversed.status).toBe("completed");
    expect((await a.list("sort=lastRun").expect(200)).body.data.map((d: { name: string }) => d.name)).toEqual(["Beta calm", "alpha overloaded", "charlie unrun"]);
  });

  it("pages without gaps or repeats and reports the true total", async () => {
    const a = await account();
    for (let i = 0; i < 5; i++) await a.create("Design " + i);
    const seen: string[] = [];
    for (const page of [1, 2, 3]) {
      const body = (await a.list(`pageSize=2&page=${page}&sort=name`).expect(200)).body;
      expect(body.meta).toEqual({ page, pageSize: 2, total: 5 });
      seen.push(...body.data.map((d: { name: string }) => d.name));
    }
    expect(seen).toEqual(["Design 0", "Design 1", "Design 2", "Design 3", "Design 4"]);
    expect((await a.list("pageSize=2&page=4").expect(200)).body.data).toEqual([]);
  });

  it("archives and unarchives only visibility: nothing else changes, and it is idempotent", async () => {
    const a = await account();
    const d = await a.create("To archive");
    await a.create("Stays active");
    const run = await a.simulate(d.id);
    await http.post(`/v1/designs/${d.id}/notes`).set(a.headers).send({ kind: "decision", text: "keep this note" }).expect(201);
    const before = (await http.get("/v1/designs/" + d.id).set(a.headers).expect(200)).body.data;
    const versionsBefore = (await http.get(`/v1/designs/${d.id}/versions`).set(a.headers).expect(200)).body.data;
    const first = (await http.post(`/v1/designs/${d.id}/archive`).set(a.headers).expect(200)).body.data;
    expect(first).toMatchObject({ designId: d.id, archived: true });
    const again = (await http.post(`/v1/designs/${d.id}/archive`).set(a.headers).expect(200)).body.data;
    expect(again.archivedAt).toBe(first.archivedAt);
    expect((await a.list().expect(200)).body.data.map((x: { name: string }) => x.name)).toEqual(["Stays active"]);
    expect((await a.list("archived=archived").expect(200)).body.data.map((x: { id: string }) => x.id)).toEqual([d.id]);
    expect((await a.list("archived=all").expect(200)).body.meta.total).toBe(2);
    expect((await a.list("archived=archived").expect(200)).body.data[0].archivedAt).toBe(first.archivedAt);
    // Hidden from the older list and the dashboard too, but still fully readable and intact.
    expect((await http.get("/v1/designs").set(a.headers).expect(200)).body.data.map((x: { id: string }) => x.id)).not.toContain(d.id);
    const dashboard = (await http.get("/v1/dashboard").set(a.headers).expect(200)).body.data;
    expect(dashboard.counts.designs).toBe(1);
    expect(dashboard.recentRuns.map((r: { id: string }) => r.id)).not.toContain(run.id);
    const during = (await http.get("/v1/designs/" + d.id).set(a.headers).expect(200)).body.data;
    expect(during).toEqual(before);
    expect((await http.get(`/v1/designs/${d.id}/versions`).set(a.headers).expect(200)).body.data).toEqual(versionsBefore);
    await http.get(`/v1/designs/${d.id}/runs/${run.id}`).set(a.headers).expect(200);
    expect((await http.get(`/v1/designs/${d.id}/notes`).set(a.headers).expect(200)).body.data).toHaveLength(1);
    const restored = (await http.post(`/v1/designs/${d.id}/unarchive`).set(a.headers).expect(200)).body.data;
    expect(restored).toEqual({ designId: d.id, archived: false, archivedAt: null });
    await http.post(`/v1/designs/${d.id}/unarchive`).set(a.headers).expect(200);
    expect((await a.list().expect(200)).body.meta.total).toBe(2);
    expect((await http.get("/v1/dashboard").set(a.headers).expect(200)).body.data.counts.designs).toBe(2);
  });

  it("duplicates content into a new independent design without runs, notes or archive state", async () => {
    const a = await account();
    const b = await account();
    const d = await a.create("Original");
    await a.simulate(d.id);
    await http.post(`/v1/designs/${d.id}/notes`).set(a.headers).send({ kind: "assumption", text: "not copied" }).expect(201);
    await http.post(`/v1/designs/${d.id}/archive`).set(a.headers).expect(200);
    const copy = (await http.post(`/v1/designs/${d.id}/duplicate`).set(a.headers).expect(201)).body.data;
    expect(copy.id).not.toBe(d.id);
    expect(copy).toMatchObject({ name: "Copy of Original", revision: 1, source: d.source, templateId: d.templateId });
    expect(copy.graph).toEqual(d.graph);
    expect(copy.traffic).toEqual(d.traffic);
    const item = (await a.list().expect(200)).body.data.find((x: { id: string }) => x.id === copy.id);
    expect(item).toMatchObject({ archivedAt: null, latestRun: null });
    expect((await http.get(`/v1/designs/${copy.id}/notes`).set(a.headers).expect(200)).body.data).toEqual([]);
    const versions = (await http.get(`/v1/designs/${copy.id}/versions`).set(a.headers).expect(200)).body.data;
    expect(versions).toHaveLength(1);
    expect(versions[0].origin).toBe("create");
    const again = (await http.post(`/v1/designs/${copy.id}/duplicate`).set(a.headers).expect(201)).body.data;
    expect(again.name).toBe("Copy of Copy of Original");
    const long = await a.create("x".repeat(100));
    const longCopy = (await http.post(`/v1/designs/${long.id}/duplicate`).set(a.headers).expect(201)).body.data;
    expect(longCopy.name.length).toBeLessThanOrEqual(100);
    await http.post(`/v1/designs/${d.id}/duplicate`).set(b.headers).expect(403);
    expect((await http.get("/v1/designs/" + d.id).set(a.headers).expect(200)).body.data.name).toBe("Original");
  });

  it("validates the query, requires authentication and never exposes other accounts' designs", async () => {
    const a = await account();
    const b = await account();
    const d = await a.create("Private");
    for (const query of ["sort=bad", "pageSize=51", "pageSize=0", "page=0", "verdict=great", "archived=maybe", "q=" + "x".repeat(101), "extra=1"])
      await a.list(query).expect(422);
    await http.get("/v1/library/designs").expect(401);
    await http.post(`/v1/designs/${d.id}/archive`).expect(401);
    await http.post(`/v1/designs/${d.id}/archive`).set(b.headers).expect(403);
    await http.post(`/v1/designs/${d.id}/unarchive`).set(b.headers).expect(403);
    await http.post(`/v1/designs/${randomUUID()}/archive`).set(a.headers).expect(404);
    await http.post(`/v1/designs/${randomUUID()}/duplicate`).set(a.headers).expect(404);
    expect((await b.list("q=Private").expect(200)).body.data).toEqual([]);
    expect((await b.list("archived=all").expect(200)).body.meta.total).toBe(0);
  });

  it("publishes every new operation in the live OpenAPI document, identical to the canonical contract", async () => {
    const live = (await http.get("/docs-json").expect(200)).body;
    const canonical = phase3OpenApi().paths as Record<string, unknown>;
    for (const path of ["/v1/library/designs", "/v1/designs/{id}/duplicate", "/v1/designs/{id}/archive", "/v1/designs/{id}/unarchive"]) {
      expect(canonical[path]).toBeDefined();
      expect(live.paths[path]).toEqual(canonical[path]);
    }
  });
});
