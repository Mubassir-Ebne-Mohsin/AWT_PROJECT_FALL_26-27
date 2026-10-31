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
import {
  AccountRolesService,
  OPERATOR,
} from "@/modules/roles/account-roles.service";

jest.setTimeout(240000);
const PASSWORD = "R53-feedback-2026!";
type Account = { id: string; email: string; token: string; name: string };
const TRAFFIC = { preset: "steady", rps: 500, burst: 1.5, readRatio: 0.8, durationMin: 10, shape: "steady" };

describe("R5.3 Instructor submissions and feedback (isolated Postgres, no AI involved)", () => {
  let app: NestExpressApplication, db: DataSource, http: ReturnType<typeof request>, roles: AccountRolesService;
  let teacher: Account, otherTeacher: Account, learner: Account, learnerTwo: Account, reviewer: Account, admin: Account;
  const as = (a: Account) => ({ Authorization: "Bearer " + a.token });

  async function register(name: string): Promise<Account> {
    const email = `${name.replace(/\s+/g, "-").toLowerCase()}-${randomUUID()}@example.test`;
    const res = await http.post("/v1/auth/register").send({ email, password: PASSWORD, displayName: name }).expect(201);
    return { id: res.body.data.user.id, email, token: res.body.data.accessToken, name };
  }
  async function withRole(name: string, role: "instructor" | "reviewer" | "admin") {
    const a = await register(name);
    await roles.grant(OPERATOR, a.id, { role });
    return a;
  }
  async function challenge(who: Account = teacher) {
    const t = getTemplates().find((x) => x.id === "mvp")!;
    const d = (
      await http.post("/v1/designs").set(as(who)).send({ schemaVersion: 1, name: "Starting design", description: t.blurb, source: "template", templateId: t.id, graph: t.graph, traffic: t.traffic }).expect(201)
    ).body.data;
    const c = (
      await http.post("/v1/instructor/challenges").set(as(who)).send({ title: "Fix the checkout", summary: "Bring p95 down.", goal: { p95Ms: 300, errorRate: 0.01 }, traffic: TRAFFIC, from: { designId: d.id } }).expect(201)
    ).body.data;
    return (await http.post(`/v1/instructor/challenges/${c.id}/publish`).set(as(who)).expect(200)).body.data;
  }
  async function graded(who: Account, challengeId: string) {
    const a = (await http.post(`/v1/challenges/${challengeId}/attempt`).set(as(who)).expect(200)).body.data;
    await http.post(`/v1/attempts/${a.id}/submissions`).set(as(who)).send({ requestId: randomUUID(), expectedRevision: 1 }).expect(202);
    for (let n = 0; n < 200; n++) {
      const v = (await http.get(`/v1/attempts/${a.id}`).set(as(who)).expect(200)).body.data;
      const s = v.submissions.find((x: { status: string }) => x.status === "completed");
      if (s) return { attempt: a, submission: s as { id: string } };
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error("Judging did not settle");
  }
  const list = (who: Account, id: string) => http.get(`/v1/instructor/challenges/${id}/submissions`).set(as(who));
  const detail = (who: Account, id: string) => http.get(`/v1/instructor/submissions/${id}`).set(as(who));
  const note = (who: Account, id: string, text: unknown) => http.post(`/v1/instructor/submissions/${id}/feedback`).set(as(who)).send({ text });

  let c: { id: string };
  let ls: { attempt: { id: string }; submission: { id: string } };
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
    otherTeacher = await withRole("Tom Otherteacher", "instructor");
    learner = await register("Lena Learner");
    learnerTwo = await register("Liam Learner");
    reviewer = await withRole("Rhea Reviewer", "reviewer");
    admin = await withRole("Ada Admin", "admin");
    c = await challenge();
    ls = await graded(learner, c.id);
  });
  afterAll(async () => {
    await app?.close();
  });

  it("lists graded submissions with the learner's display name only, never an email or account id", async () => {
    await graded(learnerTwo, c.id);
    const body = (await list(teacher, c.id).expect(200)).body.data as Array<{ id: string; learner: { displayName: string }; passes: boolean }>;
    expect(body.map((s) => s.learner.displayName).sort()).toEqual(["Lena Learner", "Liam Learner"]);
    const text = JSON.stringify(body);
    for (const secret of [learner.email, learnerTwo.email, learner.id, learnerTwo.id]) expect(text).not.toContain(secret);
    expect(body.find((s) => s.id === ls.submission.id)).toMatchObject({ feedbackCount: 0, designRevision: 1 });
  });

  it("only shows graded submissions: failed and interrupted records do not exist for the Instructor", async () => {
    const other = await challenge();
    const a = (await http.post(`/v1/challenges/${other.id}/attempt`).set(as(learner)).expect(200)).body.data;
    const ids: string[] = [];
    for (const status of ["failed", "interrupted"]) {
      const [row] = await db.query(
        `INSERT INTO challenge_submissions(attempt_id, request_id, design_revision, snapshot, goal, status, completed_at)
         VALUES ($1, gen_random_uuid(), 1, '{}', '{}', $2::text, now()) RETURNING id`,
        [a.id, status],
      );
      ids.push(row.id);
    }
    expect((await list(teacher, other.id).expect(200)).body.data).toEqual([]);
    for (const id of ids) {
      await detail(teacher, id).expect(404);
      await note(teacher, id, "hello").expect(404);
    }
  });

  it("returns the frozen design that was judged, equal to what is stored, with the challenge's own traffic", async () => {
    const d = (await detail(teacher, ls.submission.id).expect(200)).body.data;
    const [stored] = await db.query("SELECT snapshot FROM challenge_submissions WHERE id = $1", [ls.submission.id]);
    expect(d.snapshot).toEqual(stored.snapshot);
    expect(d.snapshot.traffic.rps).toBe(TRAFFIC.rps);
    expect(d.challenge).toMatchObject({ id: c.id, title: "Fix the checkout", goal: { p95Ms: 300, errorRate: 0.01 } });
    expect(JSON.stringify(d)).not.toContain(learner.email);
  });

  it("keeps everyone else out: other Instructors see nothing, learners, Reviewers and Admins are refused, guests are unauthenticated", async () => {
    await list(otherTeacher, c.id).expect(404);
    await detail(otherTeacher, ls.submission.id).expect(404);
    await note(otherTeacher, ls.submission.id, "not mine").expect(404);
    for (const who of [learner, learnerTwo, reviewer, admin]) {
      await list(who, c.id).expect(403);
      await detail(who, ls.submission.id).expect(403);
      await note(who, ls.submission.id, "nope").expect(403);
    }
    await http.get(`/v1/instructor/challenges/${c.id}/submissions`).expect(401);
    await http.get(`/v1/instructor/submissions/${ls.submission.id}`).expect(401);
    await http.post(`/v1/instructor/submissions/${ls.submission.id}/feedback`).send({ text: "x" }).expect(401);
    await list(teacher, randomUUID()).expect(404);
    await detail(teacher, randomUUID()).expect(404);
    expect((await db.query("SELECT count(*)::int AS n FROM challenge_feedback WHERE submission_id = $1", [ls.submission.id]))[0].n).toBe(0);
  });

  it("stores feedback as plain text, shows it to the Instructor and to that learner only, and counts it", async () => {
    const text = "Try a cache in front of the database. <script>alert(1)</script>";
    const made = (await note(teacher, ls.submission.id, `  ${text}  `).expect(201)).body.data;
    expect(made).toMatchObject({ submissionId: ls.submission.id, text, author: { displayName: "Tess Teacher" } });
    expect(JSON.stringify(made)).not.toContain(teacher.email);
    expect((await detail(teacher, ls.submission.id).expect(200)).body.data.feedback.map((f: { id: string }) => f.id)).toEqual([made.id]);
    expect((await list(teacher, c.id).expect(200)).body.data.find((s: { id: string }) => s.id === ls.submission.id).feedbackCount).toBe(1);
    const mine = (await http.get(`/v1/attempts/${ls.attempt.id}`).set(as(learner)).expect(200)).body.data;
    expect(mine.feedback).toEqual([made]);
    await http.get(`/v1/attempts/${ls.attempt.id}`).set(as(learnerTwo)).expect(404);
    await http.get(`/v1/attempts/${ls.attempt.id}`).set(as(otherTeacher)).expect(404);
  });

  it("is one-way and permanent: no edit or delete routes exist", async () => {
    const made = (await note(teacher, ls.submission.id, "A note that stays.").expect(201)).body.data;
    await http.patch(`/v1/instructor/submissions/${ls.submission.id}/feedback/${made.id}`).set(as(teacher)).send({ text: "changed" }).expect(404);
    await http.delete(`/v1/instructor/submissions/${ls.submission.id}/feedback/${made.id}`).set(as(teacher)).expect(404);
    await http.post(`/v1/attempts/${ls.attempt.id}/feedback`).set(as(learner)).send({ text: "reply" }).expect(404);
  });

  it("accepts only 1 to 2000 characters of text and nothing else", async () => {
    const fresh = await graded(learner, (await challenge()).id);
    await note(teacher, fresh.submission.id, "x".repeat(2000)).expect(201);
    for (const bad of ["", "   ", "x".repeat(2001), "bad\u0000text", 5, null]) await note(teacher, fresh.submission.id, bad).expect(422);
    await http.post(`/v1/instructor/submissions/${fresh.submission.id}/feedback`).set(as(teacher)).send({ text: "ok", submissionId: randomUUID() }).expect(422);
    await http.post(`/v1/instructor/submissions/${fresh.submission.id}/feedback`).set(as(teacher)).send({}).expect(422);
    expect((await detail(teacher, fresh.submission.id).expect(200)).body.data.feedback).toHaveLength(1);
  });

  it("allows at most 20 notes per submission even when requests race", async () => {
    const fresh = await graded(learner, (await challenge()).id);
    for (let i = 0; i < 19; i++) await db.query("INSERT INTO challenge_feedback(submission_id, instructor_id, body) VALUES ($1, $2, 'earlier')", [fresh.submission.id, teacher.id]);
    const rr = await Promise.all([note(teacher, fresh.submission.id, "one"), note(teacher, fresh.submission.id, "two")]);
    expect(rr.map((r) => r.status).sort()).toEqual([201, 422]);
    expect((await db.query("SELECT count(*)::int AS n FROM challenge_feedback WHERE submission_id = $1", [fresh.submission.id]))[0].n).toBe(20);
    await note(teacher, fresh.submission.id, "twenty-one").expect(422);
  });

  it("still works after the challenge is archived: results and feedback are retained", async () => {
    const arch = await challenge();
    const g = await graded(learner, arch.id);
    await http.post(`/v1/instructor/challenges/${arch.id}/archive`).set(as(teacher)).expect(200);
    expect((await list(teacher, arch.id).expect(200)).body.data).toHaveLength(1);
    await note(teacher, g.submission.id, "Good attempt.").expect(201);
    expect((await http.get(`/v1/attempts/${g.attempt.id}`).set(as(learner)).expect(200)).body.data.feedback).toHaveLength(1);
  });

  it("keeps the database honest: empty or oversized notes are rejected by the table itself", async () => {
    await expect(db.query("INSERT INTO challenge_feedback(submission_id, instructor_id, body) VALUES ($1, $2, '')", [ls.submission.id, teacher.id])).rejects.toThrow();
    await expect(db.query("INSERT INTO challenge_feedback(submission_id, instructor_id, body) VALUES ($1, $2, $3)", [ls.submission.id, teacher.id, "x".repeat(2001)])).rejects.toThrow();
  });

  it("publishes the three operations in the live OpenAPI document", async () => {
    const live = (await http.get("/docs-json").expect(200)).body;
    for (const path of ["/v1/instructor/challenges/{id}/submissions", "/v1/instructor/submissions/{id}", "/v1/instructor/submissions/{id}/feedback"]) expect(live.paths[path]).toBeDefined();
  });
});
