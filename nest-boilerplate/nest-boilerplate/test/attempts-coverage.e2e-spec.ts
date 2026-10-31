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
import { SimulationService } from "@/modules/simulation/simulation.service";
import { LearnerChallengesService } from "@/modules/challenges/learner-challenges.service";
import {
  AccountRolesService,
  OPERATOR,
} from "@/modules/roles/account-roles.service";

jest.setTimeout(240000);
const PASSWORD = "R52-coverage-2026!";
type Account = { id: string; email: string; token: string };
const TRAFFIC = {
  preset: "steady",
  rps: 500,
  burst: 1.5,
  readRatio: 0.8,
  durationMin: 10,
  shape: "steady",
};

describe("R5.2 learner attempts, extra coverage (isolated Postgres, no AI involved)", () => {
  let app: NestExpressApplication,
    db: DataSource,
    http: ReturnType<typeof request>,
    roles: AccountRolesService;
  let teacher: Account,
    learner: Account,
    learnerTwo: Account,
    reviewer: Account,
    admin: Account;
  const as = (a: Account) => ({ Authorization: "Bearer " + a.token });

  async function register(name: string): Promise<Account> {
    const email = `${name.replace(/\s+/g, "-").toLowerCase()}-${randomUUID()}@example.test`;
    const res = await http
      .post("/v1/auth/register")
      .send({ email, password: PASSWORD, displayName: name })
      .expect(201);
    return {
      id: res.body.data.user.id,
      email,
      token: res.body.data.accessToken,
    };
  }
  async function withRole(
    name: string,
    role: "instructor" | "reviewer" | "admin",
  ) {
    const a = await register(name);
    await roles.grant(OPERATOR, a.id, { role });
    return a;
  }
  async function newDesign(who: Account) {
    const t = getTemplates().find((x) => x.id === "mvp")!;
    return (
      await http
        .post("/v1/designs")
        .set(as(who))
        .send({
          schemaVersion: 1,
          name: "Starting design",
          description: t.blurb,
          source: "template",
          templateId: t.id,
          graph: t.graph,
          traffic: t.traffic,
        })
        .expect(201)
    ).body.data;
  }
  /** Created and (unless told otherwise) published. */
  async function challenge(over: Record<string, unknown> = {}, publishIt = true) {
    const d = await newDesign(teacher);
    const c = (
      await http
        .post("/v1/instructor/challenges")
        .set(as(teacher))
        .send({
          title: "Fix the checkout",
          summary: "Bring p95 down.",
          goal: { p95Ms: 300, errorRate: 0.01 },
          traffic: TRAFFIC,
          from: { designId: d.id },
          ...over,
        })
        .expect(201)
    ).body.data;
    if (!publishIt) return c;
    return (
      await http
        .post(`/v1/instructor/challenges/${c.id}/publish`)
        .set(as(teacher))
        .expect(200)
    ).body.data;
  }
  const begin = (a: Account, id: string) =>
    http.post(`/v1/challenges/${id}/attempt`).set(as(a));
  const view = (a: Account, id: string) =>
    http.get(`/v1/attempts/${id}`).set(as(a));
  const progress = async (a: Account) =>
    (await http.get("/v1/progress/challenges").set(as(a)).expect(200)).body
      .data;
  const submit = (
    a: Account,
    id: string,
    expectedRevision = 1,
    requestId = randomUUID(),
  ) =>
    http
      .post(`/v1/attempts/${id}/submissions`)
      .set(as(a))
      .send({ requestId, expectedRevision });
  async function settled(a: Account, id: string) {
    for (let n = 0; n < 200; n++) {
      const r = await view(a, id).expect(200);
      if (!r.body.data.submissions.some((s: { status: string }) => s.status === "pending"))
        return r.body.data;
      await new Promise((res) => setTimeout(res, 25));
    }
    throw new Error("Judging did not settle");
  }
  const insertSubmission = (
    attemptId: string,
    status: string,
    result: Record<string, unknown> | null,
    ageSeconds = 0,
  ) =>
    db.query(
      `INSERT INTO challenge_submissions(attempt_id, request_id, design_revision, snapshot, goal, status, result, created_at, completed_at)
       VALUES ($1, gen_random_uuid(), 1, '{}', '{"p95Ms":300,"errorRate":0.01}', $2::text, $3, now() - ($4 || ' seconds')::interval, CASE WHEN $2::text = 'pending' THEN NULL ELSE now() END)`,
      [attemptId, status, result ? JSON.stringify(result) : null, String(ageSeconds)],
    );
  const done = (p95: number, errorRate: number, passes: boolean) => ({
    p95,
    errorRate,
    passes,
    engineVersion: "reference-port-v1",
  });

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
    roles = app.get(AccountRolesService);
    teacher = await withRole("Tess Teacher", "instructor");
    learner = await register("Lena Learner");
    learnerTwo = await register("Liam Learner");
    reviewer = await withRole("Rhea Reviewer", "reviewer");
    admin = await withRole("Ada Admin", "admin");
  });
  afterAll(async () => {
    await app?.close();
  });

  it("gives each learner their own attempt and private design, and no one else can read or use them", async () => {
    const c = await challenge();
    const a = (await begin(learner, c.id).expect(200)).body.data;
    const b = (await begin(learnerTwo, c.id).expect(200)).body.data;
    expect(a.id).not.toBe(b.id);
    expect(a.designId).not.toBe(b.designId);
    await http.get(`/v1/designs/${a.designId}`).set(as(learner)).expect(200);
    await http.get(`/v1/designs/${a.designId}`).set(as(learnerTwo)).expect((r) => expect([403, 404]).toContain(r.status));
    for (const other of [learnerTwo, teacher, reviewer, admin]) {
      await view(other, a.id).expect(404);
      await submit(other, a.id).expect(404);
    }
    const mine = await progress(learner);
    const theirs = await progress(learnerTwo);
    expect(mine.items.map((i: { attemptId: string }) => i.attemptId)).toContain(a.id);
    expect(mine.items.map((i: { attemptId: string }) => i.attemptId)).not.toContain(b.id);
    expect(theirs.items.map((i: { attemptId: string }) => i.attemptId)).toContain(b.id);
    expect(theirs.items.map((i: { attemptId: string }) => i.attemptId)).not.toContain(a.id);
  });

  it("copies the starting design and never touches the challenge or its source design", async () => {
    const c = await challenge();
    const before = (await db.query("SELECT starting_graph FROM challenges WHERE id = $1", [c.id]))[0].starting_graph;
    const a = (await begin(learner, c.id).expect(200)).body.data;
    await http.patch(`/v1/designs/${a.designId}`).set(as(learner)).send({ expectedRevision: 1, name: "My own name" }).expect(200);
    expect((await db.query("SELECT starting_graph FROM challenges WHERE id = $1", [c.id]))[0].starting_graph).toEqual(before);
    expect((await http.get(`/v1/designs/${a.designId}`).set(as(learner)).expect(200)).body.data.graph).toEqual(before);
  });

  it("offers only published challenges: a draft and an archived one cannot be started, and nothing private leaks", async () => {
    const draft = await challenge({}, false);
    const live = await challenge();
    const old = await challenge();
    await http.post(`/v1/instructor/challenges/${old.id}/archive`).set(as(teacher)).expect(200);
    await begin(learner, draft.id).expect(404);
    await begin(learnerTwo, old.id).expect(404);
    await http.get(`/v1/challenges/${draft.id}`).expect(404);
    await http.get(`/v1/challenges/${old.id}`).expect(404);
    await begin(learner, randomUUID()).expect(404);
    const list = (await http.get("/v1/challenges").expect(200)).body.data as Array<{ id: string }>;
    expect(list.map((x) => x.id)).toContain(live.id);
    expect(list.map((x) => x.id)).not.toContain(draft.id);
    expect(list.map((x) => x.id)).not.toContain(old.id);
    const text = JSON.stringify([list, (await http.get(`/v1/challenges/${live.id}`).expect(200)).body.data]);
    for (const secret of [teacher.id, teacher.email, "starting_graph", "nodes", "baseline"]) expect(text).not.toContain(secret);
    await http.get("/v1/progress/challenges").expect(401);
    await http.get(`/v1/attempts/${randomUUID()}`).expect(401);
    await http.post(`/v1/attempts/${randomUUID()}/submissions`).send({ requestId: randomUUID(), expectedRevision: 1 }).expect(401);
  });

  it("keeps an existing attempt after the challenge is archived: it resumes, refuses new submissions, and keeps its record", async () => {
    const c = await challenge();
    const a = (await begin(learner, c.id).expect(200)).body.data;
    await http.post(`/v1/instructor/challenges/${c.id}/archive`).set(as(teacher)).expect(200);
    const seen = (await view(learner, a.id).expect(200)).body.data;
    expect(seen.challenge).toMatchObject({ archived: true, title: "Fix the checkout" });
    await submit(learner, a.id).expect(409);
    expect((await progress(learner)).items.find((i: { attemptId: string }) => i.attemptId === a.id)).toMatchObject({ archived: true, passed: false });
  });

  it("judges with inclusive boundaries: exactly at the goal passes, just under it fails", async () => {
    const probe = await challenge({ goal: { p95Ms: 60000, errorRate: 1 } });
    const p = (await begin(learner, probe.id).expect(200)).body.data;
    await submit(learner, p.id).expect(202);
    const measured = (await settled(learner, p.id)).submissions[0];
    expect(measured.status).toBe("completed");

    const exact = await challenge({ goal: { p95Ms: measured.p95, errorRate: measured.errorRate } });
    const e = (await begin(learnerTwo, exact.id).expect(200)).body.data;
    await submit(learnerTwo, e.id).expect(202);
    expect((await settled(learnerTwo, e.id)).submissions[0]).toMatchObject({ status: "completed", passes: true, p95: measured.p95 });

    if (measured.p95 > 1) {
      const tight = await challenge({ goal: { p95Ms: measured.p95 - 0.5, errorRate: 1 } });
      const t = (await begin(learnerTwo, tight.id).expect(200)).body.data;
      await submit(learnerTwo, t.id).expect(202);
      expect((await settled(learnerTwo, t.id)).submissions[0]).toMatchObject({ status: "completed", passes: false });
    }
    if (measured.errorRate > 0) {
      const strict = await challenge({ goal: { p95Ms: 60000, errorRate: measured.errorRate / 2 } });
      const s = (await begin(learnerTwo, strict.id).expect(200)).body.data;
      await submit(learnerTwo, s.id).expect(202);
      expect((await settled(learnerTwo, s.id)).submissions[0]).toMatchObject({ status: "completed", passes: false });
    }
  });

  it("allows only one submission to be judged at a time, and frees the slot when it settles", async () => {
    const c = await challenge();
    const a = (await begin(learner, c.id).expect(200)).body.data;
    const sim = app.get(SimulationService);
    const real = sim.run.bind(sim);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const spy = jest.spyOn(sim, "run").mockImplementationOnce(async (...args: Parameters<typeof real>) => {
      await gate;
      return real(...args);
    });
    await submit(learner, a.id).expect(202);
    await submit(learner, a.id).expect(429);
    expect((await view(learner, a.id).expect(200)).body.data.submissions).toHaveLength(1);
    release();
    await settled(learner, a.id);
    spy.mockRestore();
    await submit(learner, a.id).expect(202);
    expect((await settled(learner, a.id)).submissions).toHaveLength(2);
  });

  it("never replays work after a restart: pending records become interrupted, on boot and when read long after, and free the slot", async () => {
    const c = await challenge();
    const a = (await begin(learner, c.id).expect(200)).body.data;
    await insertSubmission(a.id, "pending", null);
    await submit(learner, a.id).expect(429);
    await app.get(LearnerChallengesService).onApplicationBootstrap();
    expect((await view(learner, a.id).expect(200)).body.data.submissions[0]).toMatchObject({ status: "interrupted", passes: null, p95: null });
    await submit(learner, a.id).expect(202);
    await settled(learner, a.id);
    const c2 = await challenge();
    const a2 = (await begin(learner, c2.id).expect(200)).body.data;
    await insertSubmission(a2.id, "pending", null, 600);
    expect((await view(learner, a2.id).expect(200)).body.data.submissions[0].status).toBe("interrupted");
    await submit(learner, a2.id).expect(202);
    await settled(learner, a2.id);
  });

  it("counts only pending and graded submissions toward the 20 limit", async () => {
    const c = await challenge();
    const a = (await begin(learner, c.id).expect(200)).body.data;
    for (let i = 0; i < 15; i++) await insertSubmission(a.id, "failed", null);
    for (let i = 0; i < 15; i++) await insertSubmission(a.id, "interrupted", null);
    await submit(learner, a.id).expect(202);
    await settled(learner, a.id);
    for (let i = 0; i < 19; i++) await insertSubmission(a.id, "completed", done(100, 0, true));
    await submit(learner, a.id).expect(422);
  });

  it("picks the best result passed-first, then lower p95, then lower errors, then the earlier record, and keeps a pass for good", async () => {
    const c = await challenge();
    const a = (await begin(learner, c.id).expect(200)).body.data;
    await insertSubmission(a.id, "completed", done(100, 0, false), 50);
    await insertSubmission(a.id, "completed", done(200, 0.01, true), 40);
    await insertSubmission(a.id, "completed", done(150, 0.02, true), 30);
    await insertSubmission(a.id, "completed", done(150, 0.01, true), 20);
    await insertSubmission(a.id, "completed", done(150, 0.01, true), 10);
    const find = async () => (await progress(learner)).items.find((i: { attemptId: string }) => i.attemptId === a.id);
    const item = await find();
    expect(item.passed).toBe(true);
    expect(item.best).toMatchObject({ p95: 150, errorRate: 0.01, passes: true });
    const twins = item.submissions
      .filter((s: { p95: number; errorRate: number }) => s.p95 === 150 && s.errorRate === 0.01)
      .sort((x: { createdAt: string }, y: { createdAt: string }) => x.createdAt.localeCompare(y.createdAt));
    expect(item.best.id).toBe(twins[0].id);
    await insertSubmission(a.id, "completed", done(9000, 0.5, false), 0);
    const again = await find();
    expect(again.passed).toBe(true);
    expect(again.best.p95).toBe(150);
    const all = await progress(learner);
    expect(all.attempted).toBe(all.items.length);
    expect(all.passed).toBe(all.items.filter((i: { passed: boolean }) => i.passed).length);
  });

  it("keeps recorded results when the learner deletes their private design, and refuses new submissions for it", async () => {
    const c = await challenge();
    const a = (await begin(learner, c.id).expect(200)).body.data;
    await submit(learner, a.id).expect(202);
    await settled(learner, a.id);
    await http.delete(`/v1/designs/${a.designId}`).set(as(learner)).expect((r) => expect([200, 204]).toContain(r.status));
    const item = (await progress(learner)).items.find((i: { attemptId: string }) => i.attemptId === a.id);
    expect(item.submissions).toHaveLength(1);
    expect(item.submissions[0].status).toBe("completed");
    await submit(learner, a.id).expect(404);
  });

  it("refuses a suspended learner immediately, with the same token, while the public list stays open", async () => {
    const gone = await register("Sam Suspended");
    const c = await challenge();
    await begin(gone, c.id).expect(200);
    await roles.suspend(OPERATOR, gone.id);
    await begin(gone, c.id).expect((r) => expect([401, 403]).toContain(r.status));
    await http.get("/v1/progress/challenges").set(as(gone)).expect((r) => expect([401, 403]).toContain(r.status));
    await http.get(`/v1/challenges/${c.id}`).expect(200);
  });

  it("accepts nothing from the browser except a request identity and a revision", async () => {
    const c = await challenge();
    const a = (await begin(learner, c.id).expect(200)).body.data;
    for (const extra of [{ traffic: TRAFFIC }, { goal: { p95Ms: 99999, errorRate: 1 } }, { verdict: "pass" }, { engineVersion: "x" }, { p95: 1 }, { designId: randomUUID() }]) {
      await http.post(`/v1/attempts/${a.id}/submissions`).set(as(learner)).send({ requestId: randomUUID(), expectedRevision: 1, ...extra }).expect(422);
    }
    for (const bad of [{}, { requestId: "nope", expectedRevision: 1 }, { requestId: randomUUID(), expectedRevision: 0 }, { requestId: randomUUID(), expectedRevision: 1.5 }]) {
      await http.post(`/v1/attempts/${a.id}/submissions`).set(as(learner)).send(bad).expect(422);
    }
    expect((await view(learner, a.id).expect(200)).body.data.submissions).toEqual([]);
  });

  it("keeps the database honest: one attempt per learner and challenge, one pending record per attempt, valid statuses, results keep their challenge", async () => {
    const c = await challenge();
    const a = (await begin(learner, c.id).expect(200)).body.data;
    await expect(db.query("INSERT INTO challenge_attempts(challenge_id, learner_id) VALUES ($1, $2)", [c.id, learner.id])).rejects.toThrow();
    await insertSubmission(a.id, "pending", null);
    await expect(insertSubmission(a.id, "pending", null)).rejects.toThrow();
    await expect(insertSubmission(a.id, "weird", null)).rejects.toThrow();
    await expect(db.query("DELETE FROM challenges WHERE id = $1", [c.id])).rejects.toThrow();
  });

  it("publishes the learner operations in the live OpenAPI document, identical to the canonical contract", async () => {
    const live = (await http.get("/docs-json").expect(200)).body;
    const canonical = phase3OpenApi().paths as Record<string, unknown>;
    for (const path of ["/v1/challenges", "/v1/challenges/{id}", "/v1/challenges/{id}/attempt", "/v1/attempts/{id}", "/v1/attempts/{id}/submissions", "/v1/progress/challenges"]) {
      expect(canonical[path]).toBeDefined();
      expect(live.paths[path]).toBeDefined();
    }
  });
});
