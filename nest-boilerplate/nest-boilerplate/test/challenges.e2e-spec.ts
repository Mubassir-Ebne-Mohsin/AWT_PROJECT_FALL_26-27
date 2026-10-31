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
import { challengeSchema } from "@/common/contracts/phase3/challenges.schema";
import { SimulationService } from "@/modules/simulation/simulation.service";
import { AccountRolesService, OPERATOR } from "@/modules/roles/account-roles.service";

jest.setTimeout(240000);
const PASSWORD = "R5-challenges-2026!";
type Account = { id: string; email: string; token: string };
const TRAFFIC = { preset: "steady", rps: 500, burst: 1.5, readRatio: 0.8, durationMin: 10, shape: "steady" };

describe("R5.1 Instructor challenges (isolated Postgres, no AI involved)", () => {
  let app: NestExpressApplication, db: DataSource, http: ReturnType<typeof request>, roles: AccountRolesService;
  let teacher: Account, otherTeacher: Account, learner: Account, reviewer: Account, admin: Account;
  const as = (a: Account) => ({ Authorization: "Bearer " + a.token });

  async function register(name: string): Promise<Account> {
    const email = `${name.replace(/\s+/g, "-").toLowerCase()}-${randomUUID()}@example.test`;
    const res = await http.post("/v1/auth/register").send({ email, password: PASSWORD, displayName: name }).expect(201);
    return { id: res.body.data.user.id, email, token: res.body.data.accessToken };
  }
  async function withRole(name: string, role: "instructor" | "reviewer" | "admin") {
    const a = await register(name);
    await roles.grant(OPERATOR, a.id, { role });
    return a;
  }
  async function newDesign(who: Account, name = "Starting design") {
    const t = getTemplates().find((x) => x.id === "mvp")!;
    return (await http.post("/v1/designs").set(as(who)).send({ schemaVersion: 1, name, description: t.blurb, source: "template", templateId: t.id, graph: t.graph, traffic: t.traffic }).expect(201)).body.data;
  }
  const body = (designId: string, over: Record<string, unknown> = {}) => ({
    title: "Survive the flash sale",
    summary: "Keep p95 under budget while traffic spikes.",
    goal: { p95Ms: 300, errorRate: 0.01 },
    traffic: TRAFFIC,
    from: { designId },
    ...over,
  });
  const create = (who: Account, b: unknown) => http.post("/v1/instructor/challenges").set(as(who)).send(b as object);
  async function made(who: Account = teacher, over: Record<string, unknown> = {}) {
    const d = await newDesign(who);
    return (await create(who, body(d.id, over)).expect(201)).body.data as { id: string; [k: string]: any };
  }
  const get = (who: Account, id: string) => http.get(`/v1/instructor/challenges/${id}`).set(as(who));
  const patch = (who: Account, id: string, b: unknown) => http.patch(`/v1/instructor/challenges/${id}`).set(as(who)).send(b as object);
  const publish = (who: Account, id: string) => http.post(`/v1/instructor/challenges/${id}/publish`).set(as(who));
  const archive = (who: Account, id: string) => http.post(`/v1/instructor/challenges/${id}/archive`).set(as(who));
  const duplicate = (who: Account, id: string) => http.post(`/v1/instructor/challenges/${id}/duplicate`).set(as(who));

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(RedisCacheService).useValue(new FakeRedisCacheService()).compile();
    app = mod.createNestApplication<NestExpressApplication>();
    configureApp(app);
    db = app.get(DataSource);
    await db.runMigrations();
    setupSwagger(app);
    await app.init();
    http = request(app.getHttpServer());
    roles = app.get(AccountRolesService);
    teacher = await withRole("Tess Teacher", "instructor");
    otherTeacher = await withRole("Tom Otherteacher", "instructor");
    learner = await register("Lena Learner");
    reviewer = await withRole("Rhea Reviewer", "reviewer");
    admin = await withRole("Ada Admin", "admin");
  });
  afterAll(async () => {
    await app?.close();
  });

  it("lets an Instructor create a draft from their own design, with the SLO taken from the goal and the design itself kept out of the view", async () => {
    const design = await newDesign(teacher);
    const c = challengeSchema.parse((await create(teacher, body(design.id)).expect(201)).body.data);
    expect(c).toMatchObject({ title: "Survive the flash sale", status: "draft", baseline: null, publishedAt: null, archivedAt: null, goal: { p95Ms: 300, errorRate: 0.01 } });
    expect(c.traffic).toEqual({ ...TRAFFIC, sloP95: 300, errorBudget: 0.01 });
    expect(c.componentCount).toBe(design.graph.nodes.length);
    expect(Object.keys(c).sort()).toEqual(["archivedAt", "baseline", "componentCount", "createdAt", "goal", "id", "publishedAt", "status", "summary", "title", "traffic", "updatedAt"]);
    expect(JSON.stringify(c)).not.toContain(design.id); // no link back to the Instructor's design
    expect(JSON.stringify(c)).not.toContain("nodes");
    expect(challengeSchema.parse((await get(teacher, c.id).expect(200)).body.data)).toEqual(c);
    expect((await http.get("/v1/instructor/challenges").set(as(teacher)).expect(200)).body.data.map((x: { id: string }) => x.id)).toContain(c.id);
  });

  it("rejects bad challenges with no side effect", async () => {
    const design = await newDesign(teacher);
    const other = await newDesign(learner);
    const before = (await db.query("SELECT count(*)::int AS n FROM challenges WHERE instructor_id = $1", [teacher.id]))[0].n;
    const bad: Array<Record<string, unknown>> = [
      { title: "" }, { title: "   " }, { title: "x".repeat(81) }, { title: "bad\u0000title" }, { summary: "" }, { summary: "y".repeat(2001) },
      { goal: { p95Ms: 0, errorRate: 0.01 } }, { goal: { p95Ms: 60001, errorRate: 0.01 } }, { goal: { p95Ms: 300, errorRate: -0.1 } }, { goal: { p95Ms: 300, errorRate: 1.1 } },
      { goal: { p95Ms: 300 } }, { goal: { p95Ms: 300, errorRate: 0.01, extra: 1 } },
      { traffic: { ...TRAFFIC, rps: -1 } }, { traffic: { ...TRAFFIC, shape: "wavy" } }, { traffic: { ...TRAFFIC, sloP95: 10 } }, { traffic: {} },
      { from: {} }, { from: { designId: "not-a-uuid" } }, { from: { designId: design.id, revision: 0 } }, { extra: true },
    ];
    for (const over of bad) await create(teacher, body(design.id, over)).expect(422);
    await create(teacher, { title: "No source", summary: "x", goal: { p95Ms: 300, errorRate: 0.01 }, traffic: TRAFFIC }).expect(422);
    await create(teacher, body(randomUUID())).expect(404);
    await create(teacher, body(other.id)).expect(403); // someone else's design
    const missing = await create(teacher, body(design.id, { from: { designId: design.id, revision: 99 } })).expect(404);
    expect(missing.body.error.details).toMatchObject({ reason: "VERSION_NOT_RETAINED" });
    expect((await db.query("SELECT count(*)::int AS n FROM challenges WHERE instructor_id = $1", [teacher.id]))[0].n).toBe(before);
  });

  it("allows every challenge operation to the Instructor role only: guests get 401, User, Reviewer and Admin get 403 with no effect", async () => {
    const c = await made();
    const design = await newDesign(teacher);
    const calls: Array<[string, (a?: Account) => request.Test]> = [
      ["create", (a) => { const r = http.post("/v1/instructor/challenges").send(body(design.id)); return a ? r.set(as(a)) : r; }],
      ["list", (a) => { const r = http.get("/v1/instructor/challenges"); return a ? r.set(as(a)) : r; }],
      ["get", (a) => { const r = http.get(`/v1/instructor/challenges/${c.id}`); return a ? r.set(as(a)) : r; }],
      ["patch", (a) => { const r = http.patch(`/v1/instructor/challenges/${c.id}`).send({ title: "Hijacked" }); return a ? r.set(as(a)) : r; }],
      ["publish", (a) => { const r = http.post(`/v1/instructor/challenges/${c.id}/publish`); return a ? r.set(as(a)) : r; }],
      ["archive", (a) => { const r = http.post(`/v1/instructor/challenges/${c.id}/archive`); return a ? r.set(as(a)) : r; }],
      ["duplicate", (a) => { const r = http.post(`/v1/instructor/challenges/${c.id}/duplicate`); return a ? r.set(as(a)) : r; }],
    ];
    const count = async () => (await db.query("SELECT count(*)::int AS n FROM challenges"))[0].n;
    const before = await count();
    for (const [name, call] of calls) {
      expect([name, (await call()).status]).toEqual([name, 401]);
      for (const refused of [learner, reviewer, admin]) expect([name, (await call(refused)).status]).toEqual([name, 403]);
    }
    expect(await count()).toBe(before);
    const row = (await db.query("SELECT title, status FROM challenges WHERE id = $1", [c.id]))[0];
    expect(row).toEqual({ title: c.title, status: "draft" });
    for (const [, call] of calls) expect([200, 201]).toContain((await call(teacher)).status);
  });

  it("keeps each Instructor's challenges private: another Instructor gets 'not found' for every operation", async () => {
    const c = await made(teacher);
    for (const res of [await get(otherTeacher, c.id), await patch(otherTeacher, c.id, { title: "Mine now" }), await publish(otherTeacher, c.id), await archive(otherTeacher, c.id), await duplicate(otherTeacher, c.id)]) expect(res.status).toBe(404);
    await get(teacher, randomUUID()).expect(404);
    expect((await http.get("/v1/instructor/challenges").set(as(otherTeacher)).expect(200)).body.data.map((x: { id: string }) => x.id)).not.toContain(c.id);
    expect((await get(teacher, c.id).expect(200)).body.data.title).toBe(c.title);
    expect([400, 422]).toContain((await http.get("/v1/instructor/challenges/not-a-uuid").set(as(teacher))).status);
  });

  it("edits a draft freely, re-derives the SLO, clears any measurement, and can swap the starting design", async () => {
    const c = await made();
    const first = (await publish(teacher, c.id).expect(200)).body.data;
    expect(first.baseline).not.toBeNull();
    const d2 = await newDesign(teacher, "Another starting point");
    const dup = (await duplicate(teacher, c.id).expect(201)).body.data; // a fresh editable draft of a published one
    const edited = (await patch(teacher, dup.id, { title: "  Renamed  ", summary: "New wording.", goal: { p95Ms: 120, errorRate: 0.02 }, traffic: { ...TRAFFIC, rps: 800, shape: "spike" }, from: { designId: d2.id } }).expect(200)).body.data;
    expect(edited).toMatchObject({ title: "Renamed", summary: "New wording.", goal: { p95Ms: 120, errorRate: 0.02 }, status: "draft", baseline: null });
    expect(edited.traffic).toMatchObject({ rps: 800, shape: "spike", sloP95: 120, errorBudget: 0.02 });
    expect(edited.updatedAt >= dup.updatedAt).toBe(true);
    await patch(teacher, dup.id, {}).expect(422);
    await patch(teacher, dup.id, { goal: { p95Ms: 0, errorRate: 0 } }).expect(422);
    await patch(teacher, dup.id, { id: randomUUID() }).expect(422);
    await patch(teacher, dup.id, { from: { designId: (await newDesign(learner)).id } }).expect(403);
    expect((await get(teacher, dup.id).expect(200)).body.data.title).toBe("Renamed");
  });

  it("measures the starting design when publishing, at the challenge's own traffic, and compares it with the goal inclusively", async () => {
    const design = await newDesign(teacher);
    const first = (await create(teacher, body(design.id)).expect(201)).body.data;
    const published = challengeSchema.parse((await publish(teacher, first.id).expect(200)).body.data);
    expect(published.status).toBe("published");
    expect(published.publishedAt).not.toBeNull();
    const b = published.baseline!;
    expect(b.engineVersion).toMatch(/^reference-port/);
    expect(b.p95).toBeGreaterThan(0);
    expect(b.passes).toBe(b.p95 <= 300 && b.errorRate <= 0.01);
    const measuring = jest.spyOn(app.get(SimulationService).executor, "submit");
    expect((await publish(teacher, first.id).expect(200)).body.data).toEqual(published); // idempotent
    expect(measuring).not.toHaveBeenCalled(); // and publishing again does not run the model again
    measuring.mockRestore();

    // The same design and traffic give the same numbers, so a goal set exactly at them is met, and just below is not.
    const exact = (await create(teacher, body(design.id, { goal: { p95Ms: b.p95, errorRate: Math.max(b.errorRate, 0) } })).expect(201)).body.data;
    const exactPub = (await publish(teacher, exact.id).expect(200)).body.data;
    expect(exactPub.baseline.p95).toBe(b.p95);
    expect(exactPub.baseline.passes).toBe(true);
    if (b.p95 - 0.5 >= 1) {
      const below = (await create(teacher, body(design.id, { goal: { p95Ms: b.p95 - 0.5, errorRate: 1 } })).expect(201)).body.data;
      expect((await publish(teacher, below.id).expect(200)).body.data.baseline.passes).toBe(false);
    }
    // A much heavier traffic profile changes what the model says about the very same design.
    const heavy = (await create(teacher, body(design.id, { traffic: { ...TRAFFIC, rps: 40000, burst: 3, shape: "spike" } })).expect(201)).body.data;
    const heavyPub = (await publish(teacher, heavy.id).expect(200)).body.data;
    expect(heavyPub.baseline.p95 === b.p95 && heavyPub.baseline.errorRate === b.errorRate).toBe(false);
    // Both halves of the goal count: a roomy p95 does not save a design that drops requests.
    if (heavyPub.baseline.errorRate > 0) {
      const strict = (await create(teacher, body(design.id, { goal: { p95Ms: 60000, errorRate: 0 }, traffic: { ...TRAFFIC, rps: 40000, burst: 3, shape: "spike" } })).expect(201)).body.data;
      const strictPub = (await publish(teacher, strict.id).expect(200)).body.data;
      expect(strictPub.baseline.p95).toBeLessThanOrEqual(60000);
      expect(strictPub.baseline.errorRate).toBeGreaterThan(0);
      expect(strictPub.baseline.passes).toBe(false);
    }
  });

  it("refuses to publish a draft that was edited while it was being measured, and leaves it a draft", async () => {
    const c = await made();
    const executor = app.get(SimulationService).executor;
    const real = executor.submit.bind(executor);
    const spy = jest.spyOn(executor, "submit").mockImplementationOnce(async (...args: Parameters<typeof real>) => {
      await patch(teacher, c.id, { title: "Edited mid-publish" }).expect(200);
      return real(...args);
    });
    const res = await publish(teacher, c.id).expect(409);
    spy.mockRestore();
    expect(res.body.error.details).toMatchObject({ reason: "CHANGED_DURING_PUBLISH" });
    expect((await db.query("SELECT title, status, baseline FROM challenges WHERE id = $1", [c.id]))[0]).toEqual({ title: "Edited mid-publish", status: "draft", baseline: null });
    expect((await publish(teacher, c.id).expect(200)).body.data.status).toBe("published"); // trying again works
  });

  it("does not publish a starting design the model cannot test, and leaves the draft untouched", async () => {
    const c = await made();
    await db.query("UPDATE challenges SET starting_graph = '{\"nodes\":[],\"edges\":[]}'::jsonb WHERE id = $1", [c.id]);
    const res = await publish(teacher, c.id).expect(422);
    expect(res.body.error.details).toMatchObject({ reason: "STARTING_DESIGN_INVALID" });
    expect((await db.query("SELECT status, baseline, published_at FROM challenges WHERE id = $1", [c.id]))[0]).toEqual({ status: "draft", baseline: null, published_at: null });
    // A graph the model's own schema rejects outright is the same answer, never "try again later".
    for (const broken of ["{}", '{"nodes":"nonsense","edges":5}', "[]"]) {
      await db.query("UPDATE challenges SET starting_graph = $2::jsonb WHERE id = $1", [c.id, broken]);
      const again = await publish(teacher, c.id).expect(422);
      expect(again.body.error.details).toMatchObject({ reason: "STARTING_DESIGN_INVALID" });
    }
    expect((await db.query("SELECT status FROM challenges WHERE id = $1", [c.id]))[0].status).toBe("draft");
  });

  it("freezes goal, traffic and starting design once published, while the wording can still be fixed", async () => {
    const c = await made();
    await publish(teacher, c.id).expect(200);
    const other = await newDesign(teacher);
    for (const change of [{ goal: { p95Ms: 100, errorRate: 0.5 } }, { traffic: TRAFFIC }, { from: { designId: other.id } }, { title: "Fine", goal: { p95Ms: 100, errorRate: 0.5 } }]) {
      const res = await patch(teacher, c.id, change).expect(409);
      expect(res.body.error.details).toMatchObject({ reason: "PUBLISHED_FROZEN" });
    }
    const fixed = (await patch(teacher, c.id, { title: "Better title", summary: "Clearer summary." }).expect(200)).body.data;
    expect(fixed).toMatchObject({ title: "Better title", summary: "Clearer summary.", status: "published", goal: { p95Ms: 300, errorRate: 0.01 } });
    expect(fixed.baseline).not.toBeNull(); // wording changes keep the measurement
    expect((await db.query("SELECT goal_p95_ms, goal_error_rate FROM challenges WHERE id = $1", [c.id]))[0]).toEqual({ goal_p95_ms: 300, goal_error_rate: 0.01 });
  });

  it("archives idempotently, keeps the record readable, and refuses any further change or publishing", async () => {
    const c = await made();
    await publish(teacher, c.id).expect(200);
    const first = (await archive(teacher, c.id).expect(200)).body.data;
    expect(first.status).toBe("archived");
    expect(first.archivedAt).not.toBeNull();
    await new Promise((r) => setTimeout(r, 15));
    expect((await archive(teacher, c.id).expect(200)).body.data.archivedAt).toBe(first.archivedAt);
    expect((await get(teacher, c.id).expect(200)).body.data.status).toBe("archived");
    expect((await patch(teacher, c.id, { title: "Too late" }).expect(409)).body.error.details).toMatchObject({ reason: "ARCHIVED" });
    expect((await publish(teacher, c.id).expect(409)).body.error.details).toMatchObject({ reason: "ARCHIVED" });
    const draft = await made();
    expect((await archive(teacher, draft.id).expect(200)).body.data.status).toBe("archived"); // a draft can be dropped too
    expect((await duplicate(teacher, c.id).expect(201)).body.data.status).toBe("draft"); // and an archived one can be revived as a copy
  });

  it("duplicates into a new editable draft with the same goal, traffic and starting design, leaving the original alone", async () => {
    const c = await made(teacher, { title: "T".repeat(80) });
    const pub = (await publish(teacher, c.id).expect(200)).body.data;
    const copy = challengeSchema.parse((await duplicate(teacher, c.id).expect(201)).body.data);
    expect(copy.id).not.toBe(c.id);
    expect(copy).toMatchObject({ status: "draft", baseline: null, publishedAt: null, goal: pub.goal, traffic: pub.traffic, summary: pub.summary, componentCount: pub.componentCount });
    expect(copy.title).toHaveLength(80); // the " (copy)" suffix is cut to fit
    const same = await db.query("SELECT a.starting_graph = b.starting_graph AS same FROM challenges a, challenges b WHERE a.id = $1 AND b.id = $2", [c.id, copy.id]);
    expect(same[0].same).toBe(true);
    await patch(teacher, copy.id, { goal: { p95Ms: 50, errorRate: 0.001 } }).expect(200);
    expect((await get(teacher, c.id).expect(200)).body.data).toEqual(pub);
    expect((await duplicate(teacher, (await made(teacher, { title: "Short" })).id).expect(201)).body.data.title).toBe("Short (copy)");
  });

  it("keeps its own frozen copy of the starting design: deleting the source design changes nothing about the challenge", async () => {
    const design = await newDesign(teacher);
    const c = (await create(teacher, body(design.id)).expect(201)).body.data;
    await http.delete(`/v1/designs/${design.id}`).set(as(teacher)).expect((res) => expect([200, 204]).toContain(res.status));
    await http.get(`/v1/designs/${design.id}`).set(as(teacher)).expect(404);
    const pub = (await publish(teacher, c.id).expect(200)).body.data; // still measurable: the graph lives in the challenge
    expect(pub.baseline).not.toBeNull();
    expect(pub.componentCount).toBe(c.componentCount);
    expect(pub.componentCount).toBeGreaterThan(0);
  });

  it("stops at 50 challenges per Instructor, counts drafts, published and archived, and cannot be passed by parallel requests", async () => {
    const lone = await withRole("Quinn Quota", "instructor");
    const design = await newDesign(lone);
    const first = (await create(lone, body(design.id)).expect(201)).body.data;
    const filler = (i: number) =>
      db.query(
        `INSERT INTO challenges(instructor_id, title, summary, goal_p95_ms, goal_error_rate, traffic, starting_graph, status, created_at, updated_at)
         VALUES ($1, $2, 's', 300, 0.01, '{}', '{}', 'draft', now(), now())`,
        [lone.id, "Filler " + i],
      );
    for (let i = 0; i < 47; i++) await filler(i); // 48 in total
    const burst = await Promise.all(Array.from({ length: 5 }, () => create(lone, body(design.id))));
    expect(burst.filter((r) => r.status === 201)).toHaveLength(2);
    const refused = burst.find((r) => r.status === 422)!;
    expect(refused.body.error.details).toMatchObject({ reason: "CHALLENGE_LIMIT_REACHED", limit: 50 });
    expect((await db.query("SELECT count(*)::int AS n FROM challenges WHERE instructor_id = $1", [lone.id]))[0].n).toBe(50);
    expect((await duplicate(lone, first.id).expect(422)).body.error.details).toMatchObject({ reason: "CHALLENGE_LIMIT_REACHED" });
    await db.query("UPDATE challenges SET status = 'archived', archived_at = now() WHERE instructor_id = $1", [lone.id]);
    await create(lone, body(design.id)).expect(422); // archived ones still count
    await db.query("DELETE FROM challenges WHERE instructor_id = $1 AND title = 'Filler 0'", [lone.id]);
    await create(lone, body(design.id)).expect(201);
  });

  it("ends an Instructor's access at once when the Instructor role is removed, with the same token", async () => {
    const t = await withRole("Rita Role", "instructor");
    const c = await made(t);
    await get(t, c.id).expect(200);
    await roles.revoke(OPERATOR, t.id, "instructor");
    await get(t, c.id).expect(403);
    await create(t, body((await newDesign(t)).id)).expect(403);
    await roles.grant(OPERATOR, t.id, { role: "instructor" });
    await get(t, c.id).expect(200); // the challenge itself was never touched
  });

  it("works for an account that is both Instructor and Reviewer, and gives neither role the other's powers", async () => {
    const both = await withRole("Bea Both", "instructor");
    await roles.grant(OPERATOR, both.id, { role: "reviewer" });
    await made(both);
    expect((await http.get("/v1/reviews/shared-with-me").set(as(both)).expect(200)).body.data).toEqual([]);
    await http.get("/v1/admin/audit").set(as(both)).expect(403);
    expect((await http.get("/v1/instructor/challenges").set(as(reviewer))).status).toBe(403); // a Reviewer alone has no Instructor powers
  });

  it("stores wording as plain text and returns it unchanged, never as HTML", async () => {
    const payload = `<script>alert("x")</script> <img src=x onerror=alert(1)> [link](javascript:alert(1)) & é 日本語 😀`;
    const c = await made(teacher, { title: "<b>Bold</b> title", summary: payload });
    const res = await get(teacher, c.id).expect(200);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body.data.title).toBe("<b>Bold</b> title");
    expect(res.body.data.summary).toBe(payload);
  });

  it("keeps the database honest: a status needs its timestamps, and the goal stays in bounds", async () => {
    const c = await made();
    await expect(db.query("UPDATE challenges SET status = 'published' WHERE id = $1", [c.id])).rejects.toThrow(); // no published_at
    await expect(db.query("UPDATE challenges SET status = 'archived' WHERE id = $1", [c.id])).rejects.toThrow(); // no archived_at
    await expect(db.query("UPDATE challenges SET status = 'live' WHERE id = $1", [c.id])).rejects.toThrow();
    await expect(db.query("UPDATE challenges SET goal_p95_ms = 0 WHERE id = $1", [c.id])).rejects.toThrow();
    await expect(db.query("UPDATE challenges SET goal_error_rate = 2 WHERE id = $1", [c.id])).rejects.toThrow();
    await expect(db.query("UPDATE challenges SET title = '' WHERE id = $1", [c.id])).rejects.toThrow();
    expect((await db.query("SELECT status FROM challenges WHERE id = $1", [c.id]))[0].status).toBe("draft");
  });

  it("deletes an Instructor's challenges with the account", async () => {
    const gone = await withRole("Gil Gone", "instructor");
    const c = await made(gone);
    await db.query("DELETE FROM users WHERE id = $1", [gone.id]);
    expect((await db.query("SELECT count(*)::int AS n FROM challenges WHERE id = $1", [c.id]))[0].n).toBe(0);
  });

  it("publishes the new operations in the live OpenAPI document, identical to the canonical contract", async () => {
    const live = (await http.get("/docs-json").expect(200)).body;
    const canonical = phase3OpenApi().paths as Record<string, unknown>;
    for (const path of ["/v1/instructor/challenges", "/v1/instructor/challenges/{id}", "/v1/instructor/challenges/{id}/publish", "/v1/instructor/challenges/{id}/archive", "/v1/instructor/challenges/{id}/duplicate"]) {
      expect(canonical[path]).toBeDefined();
      expect(live.paths[path]).toEqual(canonical[path]);
    }
  });
});
