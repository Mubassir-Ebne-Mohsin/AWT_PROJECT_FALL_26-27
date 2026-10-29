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
import { designNoteSchema } from "@/common/contracts/phase3/notes.schema";

jest.setTimeout(120000);
describe("M15.3 Notes (isolated Postgres, no AI involved)", () => {
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
        .send({ email: who + randomUUID() + "@example.test", password: "M15-notes-2026!", displayName: who })
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
  const create = (id: string, body: Record<string, unknown>, headers = auth()) => http.post(`/v1/designs/${id}/notes`).set(headers).send(body);
  const list = async (id: string) => (await http.get(`/v1/designs/${id}/notes`).set(auth()).expect(200)).body.data;
  const patchNote = (id: string, noteId: string, body: Record<string, unknown>, headers = auth()) =>
    http.patch(`/v1/designs/${id}/notes/${noteId}`).set(headers).send(body);

  it("creates, lists newest first, edits with the last seen timestamp and deletes", async () => {
    const d = await newDesign();
    await http.patch("/v1/designs/" + d.id).set(auth()).send({ expectedRevision: 1, name: "Second" }).expect(200);
    const first = designNoteSchema.parse((await create(d.id, { kind: "decision", text: "  Keep one database.  " }).expect(201)).body.data);
    expect(first).toMatchObject({ designId: d.id, revision: 2, kind: "decision", text: "Keep one database." });
    const older = (await create(d.id, { kind: "assumption", text: "Reads are 80% of traffic.", revision: 1 }).expect(201)).body.data;
    expect(older.revision).toBe(1);
    const all = await list(d.id);
    expect(all.map((n: { id: string }) => n.id)).toEqual([older.id, first.id]);
    const edited = (await patchNote(d.id, first.id, { expectedUpdatedAt: first.updatedAt, text: "Keep one database for now.", kind: "assumption" }).expect(200)).body.data;
    expect(edited).toMatchObject({ text: "Keep one database for now.", kind: "assumption", revision: 2, createdAt: first.createdAt });
    expect(Date.parse(edited.updatedAt)).toBeGreaterThan(Date.parse(first.updatedAt));
    await http.delete(`/v1/designs/${d.id}/notes/${first.id}`).set(auth()).expect(204);
    expect((await list(d.id)).map((n: { id: string }) => n.id)).toEqual([older.id]);
    await http.delete(`/v1/designs/${d.id}/notes/${first.id}`).set(auth()).expect(404);
  });

  it("validates input: bounded plain text, known kinds, real revisions", async () => {
    const d = await newDesign();
    await create(d.id, { kind: "decision", text: "   " }).expect(422);
    await create(d.id, { kind: "decision", text: "x".repeat(2001) }).expect(422);
    expect((await create(d.id, { kind: "decision", text: "y".repeat(2000) }).expect(201)).body.data.text).toHaveLength(2000);
    await create(d.id, { kind: "decision", text: "bad\u0000text" }).expect(422);
    await create(d.id, { kind: "opinion", text: "x" }).expect(422);
    await create(d.id, { kind: "decision", text: "x", extra: true }).expect(422);
    await create(d.id, { kind: "decision", text: "x", revision: 0 }).expect(422);
    const future = await create(d.id, { kind: "decision", text: "x", revision: 5 }).expect(422);
    expect(future.body.error.details).toMatchObject({ reason: "NOTE_REVISION_INVALID", currentRevision: 1 });
    const note = (await create(d.id, { kind: "decision", text: "ok" }).expect(201)).body.data;
    await patchNote(d.id, note.id, { expectedUpdatedAt: note.updatedAt }).expect(422);
    await patchNote(d.id, note.id, { expectedUpdatedAt: "yesterday", text: "x" }).expect(422);
    await patchNote(d.id, note.id, { expectedUpdatedAt: note.updatedAt, text: "" }).expect(422);
    expect((await list(d.id)).find((n: { id: string }) => n.id === note.id).text).toBe("ok");
  });

  it("stores hostile text verbatim as plain data and never interprets it", async () => {
    const d = await newDesign();
    const hostile = "<script>alert(1)</script>\n'; DROP TABLE designs; --\n${process.env.SECRET} {{7*7}} 😀 مرحبا";
    const note = (await create(d.id, { kind: "decision", text: hostile }).expect(201)).body.data;
    expect(note.text).toBe(hostile);
    expect((await list(d.id))[0].text).toBe(hostile);
    expect((await http.get("/v1/designs/" + d.id).set(auth()).expect(200)).body.data.id).toBe(d.id);
  });

  it("enforces the per-design limit, even for parallel requests", async () => {
    const d = await newDesign();
    for (let i = 0; i < 98; i++) await create(d.id, { kind: "assumption", text: "note " + i }).expect(201);
    const results = await Promise.all([0, 1, 2, 3].map((i) => create(d.id, { kind: "decision", text: "race " + i })));
    expect(results.map((r) => r.status).sort()).toEqual([201, 201, 422, 422]);
    const rejected = results.find((r) => r.status === 422)!;
    expect(rejected.body.error.details).toMatchObject({ reason: "NOTES_LIMIT_REACHED", limit: 100 });
    expect(await list(d.id)).toHaveLength(100);
  });

  it("is owner-only for every operation and never crosses designs", async () => {
    const a = await newDesign();
    const b = await newDesign();
    const note = (await create(a.id, { kind: "decision", text: "private" }).expect(201)).body.data;
    await http.get(`/v1/designs/${a.id}/notes`).expect(401);
    await http.post(`/v1/designs/${a.id}/notes`).send({ kind: "decision", text: "x" }).expect(401);
    await http.get(`/v1/designs/${a.id}/notes`).set(other()).expect(403);
    await create(a.id, { kind: "decision", text: "intruder" }, other()).expect(403);
    await patchNote(a.id, note.id, { expectedUpdatedAt: note.updatedAt, text: "hijack" }, other()).expect(403);
    await http.delete(`/v1/designs/${a.id}/notes/${note.id}`).set(other()).expect(403);
    // A real note id used through a different (own) design is simply not found.
    await patchNote(b.id, note.id, { expectedUpdatedAt: note.updatedAt, text: "wrong design" }).expect(404);
    await http.delete(`/v1/designs/${b.id}/notes/${note.id}`).set(auth()).expect(404);
    await http.get(`/v1/designs/${randomUUID()}/notes`).set(auth()).expect(404);
    expect((await list(a.id))[0].text).toBe("private");
    expect(await list(b.id)).toEqual([]);
  });

  it("refuses an edit from a stale view with 409 and keeps the newer text", async () => {
    const d = await newDesign();
    const note = (await create(d.id, { kind: "decision", text: "v1" }).expect(201)).body.data;
    const second = (await patchNote(d.id, note.id, { expectedUpdatedAt: note.updatedAt, text: "v2 from another tab" }).expect(200)).body.data;
    const stale = await patchNote(d.id, note.id, { expectedUpdatedAt: note.updatedAt, text: "v3 stale" }).expect(409);
    expect(stale.body.error.details).toMatchObject({ reason: "NOTE_CHANGED", currentUpdatedAt: second.updatedAt });
    expect((await list(d.id))[0].text).toBe("v2 from another tab");
  });

  it("keeps notes when versions are pruned or restored, and removes them only with the design", async () => {
    const d = await newDesign();
    const note = (await create(d.id, { kind: "assumption", text: "about revision 1", revision: 1 }).expect(201)).body.data;
    let revision = 1;
    for (let i = 0; i < 104; i++) {
      await http.patch("/v1/designs/" + d.id).set(auth()).send({ expectedRevision: revision, description: "edit " + i }).expect(200);
      revision++;
    }
    const versions = (await http.get(`/v1/designs/${d.id}/versions?limit=50`).set(auth()).expect(200)).body.data;
    expect(versions.some((v: { revision: number }) => v.revision === 1)).toBe(false);
    expect((await list(d.id))[0]).toMatchObject({ id: note.id, revision: 1 });
    await http.post(`/v1/designs/${d.id}/versions/6/restore`).set(auth()).send({ expectedRevision: revision }).expect(200);
    expect(await list(d.id)).toHaveLength(1);
    await http.delete("/v1/designs/" + d.id).set(auth()).expect(204);
    const left = await db.query("SELECT count(*)::int AS n FROM design_notes WHERE design_id=$1", [d.id]);
    expect(left[0].n).toBe(0);
  });

  it("publishes the notes operations in the live OpenAPI document, identical to the canonical contract", async () => {
    const live = (await http.get("/docs-json").expect(200)).body;
    const canonical = phase3OpenApi().paths as Record<string, unknown>;
    for (const path of ["/v1/designs/{id}/notes", "/v1/designs/{id}/notes/{noteId}"]) {
      expect(canonical[path]).toBeDefined();
      expect(live.paths[path]).toEqual(canonical[path]);
    }
  });
});
