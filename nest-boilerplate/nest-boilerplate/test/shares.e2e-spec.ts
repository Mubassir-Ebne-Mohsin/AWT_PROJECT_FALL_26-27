import { Test } from "@nestjs/testing";
import { NestExpressApplication } from "@nestjs/platform-express";
import { DataSource } from "typeorm";
import request from "supertest";
import { createHash, randomUUID } from "node:crypto";
import { AppModule } from "@/src/app.module";
import { configureApp, setupSwagger } from "@/src/app.setup";
import { RedisCacheService } from "@/providers/cache/redis/redis-cache.service";
import { FakeRedisCacheService } from "../test/fake-redis";
import { getTemplates } from "@/modules/simulation/engine/templates";
import { phase3OpenApi } from "@/common/contracts/phase3/openapi";
import { shareCreatedSchema, shareSchema, sharedViewSchema } from "@/common/contracts/phase3/share.schema";

jest.setTimeout(120000);
describe("M16.2 Read-only share links (isolated Postgres, no AI involved)", () => {
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
        .send({ email: who === "owner" ? email : who + randomUUID() + "@example.test", password: "M16-share-2026!", displayName: who })
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
  async function simulate(id: string, revision: number) {
    const url = (await http.post(`/v1/designs/${id}/simulate`).set(auth()).send({ expectedRevision: revision, requestId: randomUUID() }).expect(202)).body.data.statusUrl;
    for (let i = 0; i < 150; i++) {
      const r = (await http.get(url).set(auth()).expect(200)).body.data;
      if (r.status !== "pending") return r;
      await new Promise((res) => setTimeout(res, 50));
    }
    throw new Error("run stayed pending");
  }
  const note = (id: string, kind: "decision" | "assumption", text: string) =>
    http.post(`/v1/designs/${id}/notes`).set(auth()).send({ kind, text }).expect(201);
  const create = (id: string, body: Record<string, unknown>, headers = auth()) => http.post(`/v1/designs/${id}/shares`).set(headers).send(body);
  const open = (token: unknown) => http.post("/v1/shares/open").send({ token });
  const list = (id: string, headers = auth()) => http.get(`/v1/designs/${id}/shares`).set(headers);
  const sha = (s: string) => createHash("sha256").update(s).digest("hex");

  it("creates a link whose secret is shown once, is unpredictable, and is stored only as a hash", async () => {
    const d = await newDesign();
    const run = await simulate(d.id, 1);
    const a = shareCreatedSchema.parse((await create(d.id, { scope: "design_report" }).expect(201)).body.data);
    const b = shareCreatedSchema.parse((await create(d.id, { scope: "design_report" }).expect(201)).body.data);
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 256 bits, base64url
    expect(a.token).not.toBe(b.token);
    expect(a).toMatchObject({ scope: "design_report", revision: 1, runId: run.id, includeDecisions: false, status: "active", openCount: 0, revokedAt: null, lastOpenedAt: null });
    const stored = (await db.query("SELECT * FROM design_shares WHERE id = $1", [a.id]))[0];
    expect(stored.token_hash).toBe(sha(a.token));
    expect(JSON.stringify(stored)).not.toContain(a.token);
    const listed = (await list(d.id).expect(200)).body.data;
    expect(listed).toHaveLength(2);
    for (const item of listed) {
      shareSchema.parse(item);
      expect(item).not.toHaveProperty("token");
    }
    expect(JSON.stringify(listed)).not.toContain(a.token);
  });

  it("serves a safe public view without any login, and records the open", async () => {
    const d = await newDesign();
    const run = await simulate(d.id, 1);
    const link = (await create(d.id, { scope: "design_report" }).expect(201)).body.data;
    const res = await open(link.token).expect(200);
    const view = sharedViewSchema.parse(res.body.data);
    expect(view.scope).toBe("design_report");
    expect(view.report).toMatchObject({ name: d.name, revision: 1, isCurrentRevision: true });
    expect(view.report.run).toMatchObject({ id: run.id, status: "completed" });
    expect(view.report.run!.simulation!.p95).toBe(run.result.summary.p95);
    // Allow-list: nothing identifying the owner or the internal design leaks.
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(email);
    expect(text).not.toContain(d.id);
    expect(text).not.toContain("ownerId");
    expect(text).not.toContain("tokenHash");
    expect(Object.keys(res.body.data).sort()).toEqual(["expiresAt", "report", "scope", "sharedAt"]);
    expect(Object.keys(view.report)).not.toContain("designId");
    // The open is counted for the owner.
    await open(link.token).expect(200);
    const mine = (await list(d.id).expect(200)).body.data[0];
    expect(mine.openCount).toBe(2);
    expect(mine.lastOpenedAt).not.toBeNull();
  });

  it("the public answer is a frozen snapshot: later edits and notes never appear", async () => {
    const d = await newDesign();
    await simulate(d.id, 1);
    await note(d.id, "decision", "Before the link.");
    const link = (await create(d.id, { scope: "design_report", includeDecisions: true }).expect(201)).body.data;
    const before = (await open(link.token).expect(200)).body.data;
    await edit(d.id, 1, { name: "Renamed after sharing", traffic: { ...d.traffic, rps: d.traffic.rps + 500 } });
    await note(d.id, "decision", "After the link.");
    const after = (await open(link.token).expect(200)).body.data;
    expect(after).toEqual(before);
    expect(after.report.name).toBe(d.name);
    expect(after.report.notes.map((n: { text: string }) => n.text)).toEqual(["Before the link."]);
  });

  it("design-only links carry no result, Limits or notes, and cannot be asked to", async () => {
    const d = await newDesign();
    const run = await simulate(d.id, 1);
    await note(d.id, "decision", "Private for design-only.");
    const link = (await create(d.id, { scope: "design" }).expect(201)).body.data;
    expect(link).toMatchObject({ scope: "design", runId: null, includeDecisions: false });
    const view = (await open(link.token).expect(200)).body.data;
    expect(view.report).toMatchObject({ run: null, limits: null, notes: [], noteScope: "none", name: d.name });
    expect(view.report.graph).toEqual(d.graph);
    await create(d.id, { scope: "design", includeDecisions: true }).expect(422);
    await create(d.id, { scope: "design", run: run.id }).expect(422);
  });

  it("shares only Decision notes when asked; assumptions stay private", async () => {
    const d = await newDesign();
    await note(d.id, "decision", "Keep one database.");
    await note(d.id, "assumption", "Secret planning assumption.");
    const withDecisions = (await create(d.id, { scope: "design_report", includeDecisions: true }).expect(201)).body.data;
    const without = (await create(d.id, { scope: "design_report" }).expect(201)).body.data;
    const a = (await open(withDecisions.token).expect(200)).body.data.report;
    expect(a.noteScope).toBe("decisions");
    expect(a.notes.map((n: { text: string }) => n.text)).toEqual(["Keep one database."]);
    expect(JSON.stringify(a)).not.toContain("Secret planning assumption.");
    const b = (await open(without.token).expect(200)).body.data.report;
    expect(b).toMatchObject({ noteScope: "none", notes: [] });
  });

  it("revocation is checked on every read, is idempotent, and an unknown link looks identical", async () => {
    const d = await newDesign();
    const link = (await create(d.id, { scope: "design" }).expect(201)).body.data;
    await open(link.token).expect(200);
    const first = (await http.post(`/v1/designs/${d.id}/shares/${link.id}/revoke`).set(auth()).expect(200)).body.data;
    expect(first.status).toBe("revoked");
    const again = (await http.post(`/v1/designs/${d.id}/shares/${link.id}/revoke`).set(auth()).expect(200)).body.data;
    expect(again.revokedAt).toBe(first.revokedAt);
    expect(again.openCount).toBe(1); // opening statistics are kept
    const gone = await open(link.token).expect(404);
    const unknown = await open("A".repeat(43)).expect(404);
    expect(gone.body.error.code).toBe("NOT_FOUND");
    expect(gone.body.error.message).toBe(unknown.body.error.message);
    expect(gone.body.error.details ?? null).toEqual(unknown.body.error.details ?? null);
  });

  it("expired links stop working and say so to the owner; the expiry choices are validated", async () => {
    const d = await newDesign();
    const week = (await create(d.id, { scope: "design", expiresInDays: 7 }).expect(201)).body.data;
    const never = (await create(d.id, { scope: "design", expiresInDays: null }).expect(201)).body.data;
    const dflt = (await create(d.id, { scope: "design" }).expect(201)).body.data;
    const days = (iso: string, created: string) => Math.round((Date.parse(iso) - Date.parse(created)) / 86_400_000);
    expect(days(week.expiresAt, week.createdAt)).toBe(7);
    expect(never.expiresAt).toBeNull();
    expect(days(dflt.expiresAt, dflt.createdAt)).toBe(30);
    await create(d.id, { scope: "design", expiresInDays: 15 }).expect(422);
    await open(week.token).expect(200);
    await db.query("UPDATE design_shares SET expires_at = now() - interval '1 minute' WHERE id = $1", [week.id]);
    await open(week.token).expect(404);
    const states = Object.fromEntries((await list(d.id).expect(200)).body.data.map((s: { id: string; status: string }) => [s.id, s.status]));
    expect(states[week.id]).toBe("expired");
    expect(states[never.id]).toBe("active");
    await open(never.token).expect(200);
  });

  it("allows at most 5 active links per design; revoked and expired ones do not count", async () => {
    const d = await newDesign();
    const links: { id: string; token: string }[] = [];
    for (let i = 0; i < 5; i++) links.push((await create(d.id, { scope: "design" }).expect(201)).body.data);
    const full = await create(d.id, { scope: "design" }).expect(422);
    expect(full.body.error.details).toMatchObject({ reason: "SHARE_LIMIT_REACHED", limit: 5 });
    await http.post(`/v1/designs/${d.id}/shares/${links[0].id}/revoke`).set(auth()).expect(200);
    await create(d.id, { scope: "design" }).expect(201);
    await db.query("UPDATE design_shares SET expires_at = now() - interval '1 minute' WHERE id = $1", [links[1].id]);
    await create(d.id, { scope: "design" }).expect(201);
    await create(d.id, { scope: "design" }).expect(422);
  });

  it("serves the public answer, success or failure, with no-store, no-referrer and noindex headers", async () => {
    const d = await newDesign();
    const link = (await create(d.id, { scope: "design" }).expect(201)).body.data;
    for (const res of [await open(link.token).expect(200), await open("B".repeat(43)).expect(404)]) {
      expect(res.headers["cache-control"]).toContain("no-store");
      expect(res.headers["referrer-policy"]).toBe("no-referrer");
      expect(res.headers["x-robots-tag"]).toContain("noindex");
    }
  });

  it("treats malformed tokens and bodies as an unavailable link, never as an error that explains why", async () => {
    const same = (await open("A".repeat(43)).expect(404)).body.error.message;
    for (const token of ["short", "has spaces and symbols!!!!!!!!", "x".repeat(300), 123, null, ""]) {
      expect((await open(token).expect(404)).body.error.message).toBe(same);
    }
    expect((await http.post("/v1/shares/open").send({ token: "A".repeat(43), extra: 1 }).expect(404)).body.error.message).toBe(same);
    expect((await http.post("/v1/shares/open").send({}).expect(404)).body.error.message).toBe(same);
    // The secret is never accepted in a URL, so it can never reach an access log.
    await http.get("/v1/shares/" + "A".repeat(43)).expect(404);
    await http.get("/v1/shares/open?token=" + "A".repeat(43)).expect(404);
  });

  it("refuses foreign accounts and anonymous callers on every owner operation", async () => {
    const d = await newDesign();
    const link = (await create(d.id, { scope: "design" }).expect(201)).body.data;
    await create(d.id, { scope: "design" }, other()).expect(403);
    await list(d.id, other()).expect(403);
    await http.post(`/v1/designs/${d.id}/shares/${link.id}/revoke`).set(other()).expect(403);
    await http.post(`/v1/designs/${d.id}/shares`).send({ scope: "design" }).expect(401);
    await http.get(`/v1/designs/${d.id}/shares`).expect(401);
    await http.post(`/v1/designs/${d.id}/shares/${link.id}/revoke`).expect(401);
    await create(randomUUID(), { scope: "design" }).expect(404);
    await http.post(`/v1/designs/${d.id}/shares/${randomUUID()}/revoke`).set(auth()).expect(404);
    // Another design's link id is not revocable through this design.
    const e = await newDesign();
    await http.post(`/v1/designs/${e.id}/shares/${link.id}/revoke`).set(auth()).expect(404);
    expect((await open(link.token).expect(200)).body.data.scope).toBe("design");
  });

  it("refuses bad creation input: unknown revision, another design's run, extra fields", async () => {
    const d = await newDesign();
    const e = await newDesign();
    const foreignRun = await simulate(e.id, 1);
    const gone = await create(d.id, { scope: "design_report", revision: 9 }).expect(404);
    expect(gone.body.error.details).toMatchObject({ reason: "VERSION_NOT_RETAINED" });
    await create(d.id, { scope: "design_report", run: foreignRun.id }).expect(404);
    await create(d.id, { scope: "design_report", run: "not-a-uuid" }).expect(422);
    await create(d.id, { scope: "design_report", extra: true }).expect(422);
    await create(d.id, {}).expect(422);
    await create(d.id, { scope: "public" }).expect(422);
  });

  it("deleting a design removes its links", async () => {
    const d = await newDesign();
    const link = (await create(d.id, { scope: "design" }).expect(201)).body.data;
    await open(link.token).expect(200);
    await http.delete(`/v1/designs/${d.id}`).set(auth()).expect(204);
    await open(link.token).expect(404);
    expect((await db.query("SELECT count(*)::int AS n FROM design_shares WHERE design_id = $1", [d.id]))[0].n).toBe(0);
  });

  it("publishes the operations in the live OpenAPI document, identical to the canonical contract", async () => {
    const live = (await http.get("/docs-json").expect(200)).body;
    const canonical = phase3OpenApi().paths as Record<string, unknown>;
    for (const path of ["/v1/designs/{id}/shares", "/v1/designs/{id}/shares/{shareId}/revoke", "/v1/shares/open"]) {
      expect(canonical[path]).toBeDefined();
      expect(live.paths[path]).toEqual(canonical[path]);
    }
  });
});
