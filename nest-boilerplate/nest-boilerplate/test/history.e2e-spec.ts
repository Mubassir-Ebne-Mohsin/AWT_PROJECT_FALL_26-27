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
import { designVersionSchema } from "@/common/contracts/phase3/version.schema";

jest.setTimeout(120000);
describe("M15 History and Restore (isolated Postgres, no AI involved)", () => {
  let app: NestExpressApplication, db: DataSource, http: ReturnType<typeof request>;
  let owner: string, foreign: string;
  const auth = () => ({ Authorization: "Bearer " + owner });
  const other = () => ({ Authorization: "Bearer " + foreign });
  const template = () => getTemplates().find((t) => t.id === "mvp")!;

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
        .send({ email: who + randomUUID() + "@example.test", password: "M15-history-2026!", displayName: who })
        .expect(201);
      if (who === "owner") owner = r.body.data.accessToken;
      else foreign = r.body.data.accessToken;
    }
  });
  afterAll(async () => {
    await app?.close();
  });

  async function newDesign() {
    const t = template();
    return (
      await http
        .post("/v1/designs")
        .set(auth())
        .send({ schemaVersion: 1, name: t.name, description: t.blurb, source: "template", templateId: t.id, graph: t.graph, traffic: t.traffic })
        .expect(201)
    ).body.data;
  }
  const patch = (id: string, expectedRevision: number, body: Record<string, unknown>, headers = auth()) =>
    http.patch("/v1/designs/" + id).set(headers).send({ expectedRevision, ...body });
  const restore = (id: string, revision: number | string, expectedRevision: number, headers = auth()) =>
    http.post(`/v1/designs/${id}/versions/${revision}/restore`).set(headers).send({ expectedRevision });
  const versions = async (id: string, limit = 50) =>
    (await http.get(`/v1/designs/${id}/versions?limit=${limit}`).set(auth()).expect(200)).body.data;

  it("restores an old version as a NEW revision, remembers its source and never touches history", async () => {
    const d = await newDesign();
    const v2 = (await patch(d.id, 1, { traffic: { ...d.traffic, rps: 777 } }).expect(200)).body.data;
    const v3 = (await patch(d.id, 2, { name: "Renamed later" }).expect(200)).body.data;
    expect([v2.revision, v3.revision]).toEqual([2, 3]);
    const before = await versions(d.id);
    const restored = (await restore(d.id, 1, 3).expect(200)).body.data;
    expect(restored.revision).toBe(4);
    expect(restored.name).toBe(d.name);
    expect(restored.traffic).toEqual(d.traffic);
    expect(restored.graph).toEqual(d.graph);
    const after = await versions(d.id);
    expect(after).toHaveLength(4);
    const newest = designVersionSchema.parse(after[0]);
    expect(newest).toMatchObject({ revision: 4, origin: "restore", restoredFromRevision: 1 });
    // Historical rows are identical before and after: restore is insert-only.
    expect(after.slice(1)).toEqual(before);
    const current = (await http.get("/v1/designs/" + d.id).set(auth()).expect(200)).body.data;
    expect(current.revision).toBe(4);
    expect(current.name).toBe(d.name);
  });

  it("rejects a stale view with 409 and writes nothing; identical and missing versions are refused", async () => {
    const d = await newDesign();
    await patch(d.id, 1, { name: "Second" }).expect(200);
    const count = (await versions(d.id)).length;
    const stale = await restore(d.id, 1, 1).expect(409);
    expect(stale.body.error.details).toMatchObject({ reason: "REVISION_MISMATCH", currentRevision: 2 });
    expect((await versions(d.id)).length).toBe(count);
    // Renaming back makes revision 3 content-identical to revision 1: nothing to restore.
    await patch(d.id, 2, { name: d.name }).expect(200);
    const same = await restore(d.id, 1, 3).expect(422);
    expect(same.body.error.details).toMatchObject({ reason: "RESTORE_NO_CHANGES" });
    const missing = await restore(d.id, 99, 3).expect(404);
    expect(missing.body.error.details).toMatchObject({ reason: "VERSION_NOT_RETAINED" });
    expect((await versions(d.id)).length).toBe(count + 1);
  });

  it("enforces authentication, ownership and input validation without leaking or changing anything", async () => {
    const d = await newDesign();
    await patch(d.id, 1, { name: "Changed" }).expect(200);
    await http.post(`/v1/designs/${d.id}/versions/1/restore`).send({ expectedRevision: 2 }).expect(401);
    await restore(d.id, 1, 2, other()).expect(403);
    await http.get(`/v1/designs/${d.id}/runs`).set(other()).expect(403);
    await restore(randomUUID(), 1, 1).expect(404);
    await restore(d.id, 0, 2).expect(422);
    await restore(d.id, "abc", 2).expect((r) => expect([400, 422]).toContain(r.status));
    await http.post(`/v1/designs/${d.id}/versions/1/restore`).set(auth()).send({ expectedRevision: 2, name: "x" }).expect(422);
    await http.post(`/v1/designs/${d.id}/versions/1/restore`).set(auth()).send({}).expect(422);
    const current = (await http.get("/v1/designs/" + d.id).set(auth()).expect(200)).body.data;
    expect(current.revision).toBe(2);
    expect(current.name).toBe("Changed");
  });

  it("lets exactly one of two parallel restores win; the other gets a conflict", async () => {
    const d = await newDesign();
    await patch(d.id, 1, { name: "Two" }).expect(200);
    const results = await Promise.all([restore(d.id, 1, 2), restore(d.id, 1, 2)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const current = (await http.get("/v1/designs/" + d.id).set(auth()).expect(200)).body.data;
    expect(current.revision).toBe(3);
    expect((await versions(d.id)).filter((v: { origin: string }) => v.origin === "restore")).toHaveLength(1);
  });

  it("says a version is no longer retained once it is pruned, and keeps the newest hundred", async () => {
    const d = await newDesign();
    let revision = 1;
    for (let i = 0; i < 104; i++) {
      await patch(d.id, revision, { description: "edit " + i }).expect(200);
      revision++;
    }
    const kept = await versions(d.id, 50);
    expect(kept[0].revision).toBe(105);
    const total = await db.query("SELECT count(*)::int AS n FROM design_versions WHERE design_id=$1", [d.id]);
    expect(total[0].n).toBe(100);
    const pruned = await restore(d.id, 1, 105).expect(404);
    expect(pruned.body.error.details).toMatchObject({ reason: "VERSION_NOT_RETAINED" });
    const oldest = (await restore(d.id, 6, 105).expect(200)).body.data;
    expect(oldest.revision).toBe(106);
    expect(oldest.description).toBe("edit 4");
  });

  it("lists recorded runs newest first with a bounded cursor, owner-only", async () => {
    const d = await newDesign();
    expect((await http.get(`/v1/designs/${d.id}/runs`).set(auth()).expect(200)).body.data).toEqual([]);
    const run = async (revision: number) => {
      const accepted = (await http.post(`/v1/designs/${d.id}/simulate`).set(auth()).send({ expectedRevision: revision, requestId: randomUUID() }).expect(202)).body.data;
      for (let i = 0; i < 100; i++) {
        const r = (await http.get(accepted.statusUrl).set(auth()).expect(200)).body.data;
        if (r.status !== "pending") return r;
        await new Promise((res) => setTimeout(res, 50));
      }
      throw new Error("run stayed pending");
    };
    const first = await run(1);
    await patch(d.id, 1, { traffic: { ...d.traffic, rps: 123 } }).expect(200);
    const second = await run(2);
    const list = (await http.get(`/v1/designs/${d.id}/runs`).set(auth()).expect(200)).body.data;
    expect(list.map((r: { id: string }) => r.id)).toEqual([second.id, first.id]);
    expect(list[0]).toMatchObject({ kind: "simulation", status: "completed", designRevision: 2 });
    expect(["pass", "strained", "fail"]).toContain(list[0].verdict);
    expect(list[1].designRevision).toBe(1);
    const page = (await http.get(`/v1/designs/${d.id}/runs?limit=1`).set(auth()).expect(200)).body.data;
    expect(page).toHaveLength(1);
    const next = (await http.get(`/v1/designs/${d.id}/runs?limit=1&before=${encodeURIComponent(page[0].createdAt)}`).set(auth()).expect(200)).body.data;
    expect(next.map((r: { id: string }) => r.id)).toEqual([first.id]);
    await http.get(`/v1/designs/${d.id}/runs?limit=0`).set(auth()).expect(422);
    await http.get(`/v1/designs/${d.id}/runs?limit=51`).set(auth()).expect(422);
    await http.get(`/v1/designs/${d.id}/runs?before=yesterday`).set(auth()).expect(422);
    await http.get(`/v1/designs/${d.id}/runs`).expect(401);
    // A restored revision is a normal saved revision: it can be simulated and the old run stays readable.
    const restored = (await restore(d.id, 1, 2).expect(200)).body.data;
    await http.post(`/v1/designs/${d.id}/simulate`).set(auth()).send({ expectedRevision: restored.revision, requestId: randomUUID() }).expect(202);
    await http.get(`/v1/designs/${d.id}/runs/${first.id}`).set(auth()).expect(200);
  });

  it("publishes both operations in the live OpenAPI document, identical to the canonical contract", async () => {
    const live = (await http.get("/docs-json").expect(200)).body;
    const canonical = phase3OpenApi().paths as Record<string, unknown>;
    for (const path of ["/v1/designs/{id}/runs", "/v1/designs/{id}/versions/{revision}/restore"]) {
      expect(canonical[path]).toBeDefined();
      expect(live.paths[path]).toEqual(canonical[path]);
    }
  });
});
