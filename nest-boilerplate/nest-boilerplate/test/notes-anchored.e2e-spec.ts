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
import { designNoteSchema } from "@/common/contracts/phase3/notes.schema";
import { reportSchema } from "@/common/contracts/phase3/report.schema";
import { NoteComponent1794600000000 } from "@/database/migrations/1794600000000-NoteComponent";

// Component-anchored notes (docs/COMPONENT-NOTES-SCOPE.md) on the real application and PostgreSQL. No AI is involved.
jest.setTimeout(120000);
type Node = { id: string; label: string; type: string; x: number; y: number; props: Record<string, unknown> };
type Graph = { nodes: Node[]; edges: { id: string; from: string; to: string }[] };

describe("Component-anchored notes (isolated Postgres, no AI)", () => {
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
      const r = await http.post("/v1/auth/register").send({ email: who + randomUUID() + "@example.test", password: "Anchored-2026!", displayName: who }).expect(201);
      if (who === "owner") owner = r.body.data.accessToken;
      else foreign = r.body.data.accessToken;
    }
  });
  afterAll(async () => {
    await app?.close();
  });

  async function newDesign() {
    const t = getTemplates().find((x) => x.id === "mvp")!;
    return (await http.post("/v1/designs").set(auth()).send({ schemaVersion: 1, name: t.name, description: t.blurb, source: "template", templateId: t.id, graph: t.graph, traffic: t.traffic }).expect(201)).body.data;
  }
  const create = (id: string, body: Record<string, unknown>, headers = auth()) => http.post(`/v1/designs/${id}/notes`).set(headers).send(body);
  const list = async (id: string) => (await http.get(`/v1/designs/${id}/notes`).set(auth()).expect(200)).body.data as Array<Record<string, unknown>>;
  const saveGraph = async (id: string, revision: number, graph: Graph) =>
    (await http.patch(`/v1/designs/${id}`).set(auth()).send({ expectedRevision: revision, graph }).expect(200)).body.data;
  const report = async (id: string) => reportSchema.parse((await http.get(`/v1/designs/${id}/report`).set(auth()).expect(200)).body.data);
  const app1 = (d: { graph: Graph }) => d.graph.nodes.find((n) => n.type === "app") ?? d.graph.nodes[1];

  it("pins a note to a component of the design and returns the component as it is now", async () => {
    const d = await newDesign();
    const target = app1(d);
    const pinned = designNoteSchema.parse((await create(d.id, { kind: "decision", text: "Two copies is enough for launch.", componentId: target.id }).expect(201)).body.data);
    expect(pinned).toMatchObject({ componentId: target.id, component: { id: target.id, label: target.label }, componentRemoved: false, revision: 1 });
    const loose = designNoteSchema.parse((await create(d.id, { kind: "assumption", text: "About the whole design." }).expect(201)).body.data);
    expect(loose).toMatchObject({ componentId: null, component: null, componentRemoved: false });
    const all = await list(d.id);
    expect(all.map((n) => n.componentId).sort()).toEqual([null, target.id].sort());
  });

  it("refuses a component that is not in the design, with a plain reason, and a malformed id", async () => {
    const d = await newDesign();
    const res = await create(d.id, { kind: "decision", text: "x", componentId: "nope" }).expect(422);
    expect(JSON.stringify(res.body)).toMatch(/NOTE_COMPONENT_UNKNOWN/);
    for (const bad of ["bad id", "1abc", "", 5, "x".repeat(65)]) await create(d.id, { kind: "decision", text: "x", componentId: bad }).expect(422);
    expect(await list(d.id)).toHaveLength(0);
  });

  it("validates the pin against the graph of the note's own revision", async () => {
    const d = await newDesign();
    const extra: Node = { id: "extra1", label: "Extra cache", type: "cache", x: 900, y: 300, props: {} };
    const v2 = await saveGraph(d.id, d.revision, { ...d.graph, nodes: [...d.graph.nodes, extra] });
    // The extra component exists in revision 2, not in revision 1.
    await create(d.id, { kind: "decision", text: "x", componentId: "extra1", revision: 1 }).expect(422);
    const ok = (await create(d.id, { kind: "decision", text: "Added a cache.", componentId: "extra1", revision: v2.revision }).expect(201)).body.data;
    expect(ok).toMatchObject({ revision: 2, component: { id: "extra1", label: "Extra cache" } });
    // A component of revision 1 still pins to revision 1.
    await create(d.id, { kind: "assumption", text: "Original app tier.", componentId: app1(d).id, revision: 1 }).expect(201);
  });

  it("keeps a note when its component is removed, flags it, and follows a renamed component", async () => {
    const d = await newDesign();
    const target = app1(d);
    const note = (await create(d.id, { kind: "decision", text: "Why this tier exists: the first release needs it.", componentId: target.id }).expect(201)).body.data;
    const renamed = await saveGraph(d.id, d.revision, { ...d.graph, nodes: d.graph.nodes.map((n: Node) => (n.id === target.id ? { ...n, label: "Web tier" } : n)) });
    expect((await list(d.id))[0]).toMatchObject({ id: note.id, component: { id: target.id, label: "Web tier" }, componentRemoved: false });
    await saveGraph(d.id, renamed.revision, { nodes: renamed.graph.nodes.filter((n: Node) => n.id !== target.id), edges: renamed.graph.edges.filter((e: { from: string; to: string }) => e.from !== target.id && e.to !== target.id) });
    const after = (await list(d.id))[0];
    expect(after).toMatchObject({ id: note.id, text: "Why this tier exists: the first release needs it.", componentId: target.id, component: null, componentRemoved: true });
  });

  it("does not let an edit change the pin, and keeps the pin when the text changes", async () => {
    const d = await newDesign();
    const target = app1(d);
    const note = (await create(d.id, { kind: "decision", text: "Original.", componentId: target.id }).expect(201)).body.data;
    const other2 = d.graph.nodes.find((n: Node) => n.id !== target.id);
    // A text change that also tries to move the pin is refused as a whole (the pin is not part of an edit), and nothing changes.
    await http.patch(`/v1/designs/${d.id}/notes/${note.id}`).set(auth()).send({ expectedUpdatedAt: note.updatedAt, text: "Moved?", componentId: other2.id }).expect(422);
    expect((await list(d.id))[0]).toMatchObject({ text: "Original.", componentId: target.id });
    const edited = (await http.patch(`/v1/designs/${d.id}/notes/${note.id}`).set(auth()).send({ expectedUpdatedAt: note.updatedAt, text: "Edited." }).expect(200)).body.data;
    expect(edited).toMatchObject({ text: "Edited.", componentId: target.id, component: { id: target.id } });
  });

  it("is owner-only: another account can neither read nor pin notes on this design", async () => {
    const d = await newDesign();
    await create(d.id, { kind: "decision", text: "x", componentId: app1(d).id }, other()).expect(403);
    await http.get(`/v1/designs/${d.id}/notes`).set(other()).expect(403);
  });

  it("the report names the component of a pinned note, says so when it was removed, and adds nothing else", async () => {
    const d = await newDesign();
    const target = app1(d);
    await create(d.id, { kind: "decision", text: "Pinned note.", componentId: target.id }).expect(201);
    await create(d.id, { kind: "assumption", text: "Loose note." }).expect(201);
    const r1 = await report(d.id);
    expect(Object.keys(r1.notes[0]).sort()).toEqual(["component", "createdAt", "kind", "revision", "text"]);
    expect(r1.notes.map((n) => [n.text, n.component])).toEqual([["Pinned note.", target.label], ["Loose note.", null]]);
    await saveGraph(d.id, d.revision, { nodes: d.graph.nodes.filter((n: Node) => n.id !== target.id), edges: d.graph.edges.filter((e: { from: string; to: string }) => e.from !== target.id && e.to !== target.id) });
    const r2 = await report(d.id);
    expect(r2.notes.find((n) => n.text === "Pinned note.")!.component).toBe("a removed component");
  });

  it("the migration adds one nullable column, keeps existing notes, and going down loses only the pins", async () => {
    const d = await newDesign();
    const note = (await create(d.id, { kind: "decision", text: "Survives the migration.", componentId: app1(d).id }).expect(201)).body.data;
    const column = async () => (await db.query("SELECT is_nullable FROM information_schema.columns WHERE table_name='design_notes' AND column_name='component_id'")) as { is_nullable: string }[];
    expect((await column())[0].is_nullable).toBe("YES");
    const runner = db.createQueryRunner();
    try {
      const migration = new NoteComponent1794600000000();
      await migration.down(runner);
      expect(await column()).toHaveLength(0);
      expect((await db.query("SELECT text FROM design_notes WHERE id=$1", [note.id]))[0].text).toBe("Survives the migration.");
      await migration.up(runner);
      expect((await column())[0].is_nullable).toBe("YES");
      expect((await db.query("SELECT component_id FROM design_notes WHERE id=$1", [note.id]))[0].component_id).toBeNull();
    } finally {
      await runner.release();
    }
  });
});
