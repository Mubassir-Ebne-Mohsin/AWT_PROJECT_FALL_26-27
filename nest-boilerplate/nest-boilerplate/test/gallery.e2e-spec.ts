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
import { galleryDetailSchema, galleryListSchema, galleryPostSchema, galleryRemixSchema } from "@/common/contracts/phase3/gallery.schema";

jest.setTimeout(120000);
describe("Community gallery: publish, browse, view, remix (isolated Postgres, no AI involved)", () => {
  let app: NestExpressApplication, db: DataSource, http: ReturnType<typeof request>;
  let owner: string, other: string;
  const as = (t: string) => ({ Authorization: "Bearer " + t });
  const ownerEmail = "gal-owner" + randomUUID() + "@example.test";

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(RedisCacheService).useValue(new FakeRedisCacheService()).compile();
    app = mod.createNestApplication<NestExpressApplication>();
    configureApp(app);
    db = app.get(DataSource);
    await db.runMigrations();
    setupSwagger(app);
    await app.init();
    http = request(app.getHttpServer());
    const a = await http.post("/v1/auth/register").send({ email: ownerEmail, password: "Gallery-test-2026!", displayName: "Owner Person" }).expect(201);
    owner = a.body.data.accessToken;
    const b = await http.post("/v1/auth/register").send({ email: "gal-other" + randomUUID() + "@example.test", password: "Gallery-test-2026!", displayName: "Other Person" }).expect(201);
    other = b.body.data.accessToken;
  });
  afterAll(async () => {
    await app?.close();
  });

  async function newDesign(token = owner, id = "mvp") {
    const t = getTemplates().find((x) => x.id === id)!;
    return (
      await http.post("/v1/designs").set(as(token)).send({ schemaVersion: 1, name: t.name, description: t.blurb, source: "template", templateId: t.id, graph: t.graph, traffic: t.traffic }).expect(201)
    ).body.data;
  }
  async function simulate(id: string, revision: number, token = owner) {
    const url = (await http.post(`/v1/designs/${id}/simulate`).set(as(token)).send({ expectedRevision: revision, requestId: randomUUID() }).expect(202)).body.data.statusUrl;
    for (let i = 0; i < 150; i++) {
      const r = (await http.get(url).set(as(token)).expect(200)).body.data;
      if (r.status !== "pending") return r;
      await new Promise((res) => setTimeout(res, 50));
    }
    throw new Error("run stayed pending");
  }
  const publish = (id: string, body: Record<string, unknown>, token = owner) => http.post(`/v1/designs/${id}/gallery`).set(as(token)).send(body);
  const ok = { title: "Online shop", description: "p95 is over target", confirmOwnership: true };

  it("requires a completed run, the ownership statement and plain text", async () => {
    const d = await newDesign();
    const res = await publish(d.id, ok).expect(422);
    expect(res.body.error?.details?.reason ?? res.body.details?.reason ?? JSON.stringify(res.body)).toContain("NO_COMPLETED_RUN");
    await simulate(d.id, 1);
    await publish(d.id, { ...ok, confirmOwnership: false }).expect(422);
    await publish(d.id, { title: "", confirmOwnership: true }).expect(422);
    await publish(d.id, { ...ok, title: "<b>bold</b>" }).expect(422);
    await publish(d.id, { ...ok, extra: 1 }).expect(422);
  });

  it("only the owner can publish a design, and a post shows a display name, never an email", async () => {
    const d = await newDesign();
    await simulate(d.id, 1);
    await publish(d.id, ok, other).expect(403);
    const post = galleryPostSchema.parse((await publish(d.id, ok).expect(201)).body.data);
    expect(post).toMatchObject({ title: "Online shop", ownerName: "Owner Person", isMine: true, remixCount: 0, allowRemix: true, revision: 1 });
    expect(JSON.stringify(post)).not.toContain(ownerEmail);
    const detail = galleryDetailSchema.parse((await http.get("/v1/gallery/" + post.id).set(as(other)).expect(200)).body.data);
    expect(detail.isMine).toBe(false);
    expect(detail.report).not.toHaveProperty("designId");
    expect(detail.report.notes).toEqual([]);
    expect(JSON.stringify(detail)).not.toContain(ownerEmail);
  });

  it("a post is frozen: later edits and notes of the design never reach it", async () => {
    const d = await newDesign();
    await simulate(d.id, 1);
    await http.post(`/v1/designs/${d.id}/notes`).set(as(owner)).send({ kind: "assumption", text: "private note written before publishing" }).expect(201);
    const post = (await publish(d.id, ok).expect(201)).body.data;
    await http.post(`/v1/designs/${d.id}/notes`).set(as(owner)).send({ kind: "decision", text: "secret reasoning" }).expect(201);
    await http.patch("/v1/designs/" + d.id).set(as(owner)).send({ expectedRevision: 1, name: "Renamed later" }).expect(200);
    const detail = (await http.get("/v1/gallery/" + post.id).set(as(other)).expect(200)).body.data;
    expect(JSON.stringify(detail)).not.toContain("secret reasoning");
    expect(JSON.stringify(detail)).not.toContain("private note written before publishing");
    expect(detail.report.notes).toEqual([]);
    expect(detail.report.name).not.toBe("Renamed later");
    expect(detail.revision).toBe(1);
  });

  it("refuses the same revision twice, and enforces the active and daily limits", async () => {
    const d = await newDesign();
    await simulate(d.id, 1);
    await publish(d.id, ok).expect(201);
    const again = await publish(d.id, ok).expect(409);
    expect(JSON.stringify(again.body)).toContain("ALREADY_PUBLISHED");
    // The daily limit counts posts published in the last 24 hours (5 per account).
    const user = (await http.post("/v1/auth/register").send({ email: "gal-lim" + randomUUID() + "@example.test", password: "Gallery-test-2026!", displayName: "Limit Person" }).expect(201)).body.data.accessToken;
    const posted: string[] = [];
    for (let i = 0; i < 5; i++) {
      const x = await newDesign(user);
      await simulate(x.id, 1, user);
      posted.push((await publish(x.id, { ...ok, title: "Post " + i }, user).expect(201)).body.data.id);
    }
    const extra = await newDesign(user);
    await simulate(extra.id, 1, user);
    const limited = await publish(extra.id, ok, user).expect(422);
    expect(JSON.stringify(limited.body)).toContain("GALLERY_DAILY_LIMIT");
  });

  it("lists newest first with filters and pages, and 'mine' shows only the viewer's posts", async () => {
    const d = await newDesign(other, "mvp");
    await simulate(d.id, 1, other);
    const word = "zebra" + randomUUID().slice(0, 8);
    const mine = (await publish(d.id, { ...ok, title: "Findable " + word }, other).expect(201)).body.data;
    const all = galleryListSchema.parse((await http.get("/v1/gallery?pageSize=24").set(as(owner)).expect(200)).body.data);
    expect(all.items.length).toBeGreaterThan(1);
    const times = all.items.map((i) => Date.parse(i.publishedAt));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    const found = galleryListSchema.parse((await http.get("/v1/gallery?q=" + word).set(as(owner)).expect(200)).body.data);
    expect(found.items.map((i) => i.id)).toEqual([mine.id]);
    expect(found.items[0].isMine).toBe(false);
    const only = galleryListSchema.parse((await http.get("/v1/gallery?mine=true").set(as(other)).expect(200)).body.data);
    expect(only.items.every((i) => i.isMine)).toBe(true);
    const verdict = galleryListSchema.parse((await http.get("/v1/gallery?verdict=" + mine.verdict).set(as(owner)).expect(200)).body.data);
    expect(verdict.items.every((i) => i.verdict === mine.verdict)).toBe(true);
    const page2 = galleryListSchema.parse((await http.get("/v1/gallery?pageSize=1&page=2").set(as(owner)).expect(200)).body.data);
    expect(page2.items).toHaveLength(1);
    await http.get("/v1/gallery?pageSize=500").set(as(owner)).expect(422);
    await http.get("/v1/gallery?q=%25").set(as(owner)).expect(200); // a literal % is not a wildcard
  });

  it("is for signed-in people only", async () => {
    await http.get("/v1/gallery").expect(401);
    await http.get("/v1/gallery/" + randomUUID()).expect(401);
  });

  it("remix copies the snapshot into a new private design with credit, counts, and shares nothing afterwards", async () => {
    const d = await newDesign();
    await simulate(d.id, 1);
    const post = (await publish(d.id, ok).expect(201)).body.data;
    const res = galleryRemixSchema.parse((await http.post(`/v1/gallery/${post.id}/remix`).set(as(other)).expect(201)).body.data);
    expect(res.remixCount).toBe(1);
    expect(res.design.name).toBe("Remix of Online shop");
    expect(res.design.description).toContain('Remixed from "Online shop" by Owner Person');
    expect(res.design.revision).toBe(1);
    expect(res.design.graph.nodes.length).toBe(d.graph.nodes.length);
    // The copy belongs to the other person only, and has no runs or notes.
    await http.get("/v1/designs/" + res.design.id).set(as(owner)).expect(403);
    await http.get("/v1/designs/" + res.design.id).set(as(other)).expect(200);
    expect((await db.query("SELECT count(*)::int AS n FROM design_runs WHERE design_id = $1", [res.design.id]))[0].n).toBe(0);
    const again = galleryRemixSchema.parse((await http.post(`/v1/gallery/${post.id}/remix`).set(as(other)).expect(201)).body.data);
    expect(again.remixCount).toBe(2);
    // Editing the remix never changes the post.
    await http.patch("/v1/designs/" + res.design.id).set(as(other)).send({ expectedRevision: 1, name: "Mine now" }).expect(200);
    const detail = (await http.get("/v1/gallery/" + post.id).set(as(owner)).expect(200)).body.data;
    expect(detail.title).toBe("Online shop");
    expect(detail.remixCount).toBe(2);
  });

  it("the owner can turn remixing off", async () => {
    const d = await newDesign();
    await simulate(d.id, 1);
    const post = (await publish(d.id, { ...ok, allowRemix: false }).expect(201)).body.data;
    const res = await http.post(`/v1/gallery/${post.id}/remix`).set(as(other)).expect(403);
    expect(JSON.stringify(res.body)).toContain("REMIX_NOT_ALLOWED");
  });

  async function freshUser(name: string) {
    return (await http.post("/v1/auth/register").send({ email: "gal-" + randomUUID() + "@example.test", password: "Gallery-test-2026!", displayName: name }).expect(201)).body.data.accessToken as string;
  }

  it("unpublishing hides the post for everyone, only the owner may do it, and it is idempotent", async () => {
    const mine = await freshUser("Unpublisher");
    const d = await newDesign(mine);
    await simulate(d.id, 1, mine);
    const post = (await publish(d.id, ok, mine).expect(201)).body.data;
    await http.post(`/v1/gallery/${post.id}/unpublish`).set(as(other)).expect(404);
    await http.get("/v1/gallery/" + post.id).set(as(other)).expect(200);
    const first = (await http.post(`/v1/gallery/${post.id}/unpublish`).set(as(mine)).expect(200)).body.data;
    const second = (await http.post(`/v1/gallery/${post.id}/unpublish`).set(as(mine)).expect(200)).body.data;
    expect(second.unpublishedAt).toBe(first.unpublishedAt);
    await http.get("/v1/gallery/" + post.id).set(as(other)).expect(404);
    await http.post(`/v1/gallery/${post.id}/remix`).set(as(other)).expect(404);
    const listed = (await http.get("/v1/gallery?pageSize=24").set(as(other)).expect(200)).body.data;
    expect(listed.items.map((i: { id: string }) => i.id)).not.toContain(post.id);
    // The revision can be published again after it was unpublished.
    await publish(d.id, ok, mine).expect(201);
  });

  it("deleting the design removes its posts", async () => {
    const mine = await freshUser("Deleter");
    const d = await newDesign(mine);
    await simulate(d.id, 1, mine);
    const post = (await publish(d.id, ok, mine).expect(201)).body.data;
    await http.delete("/v1/designs/" + d.id).set(as(mine)).expect(204);
    await http.get("/v1/gallery/" + post.id).set(as(other)).expect(404);
  });
});
