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
import { AccountRolesService, OPERATOR } from "@/modules/roles/account-roles.service";

jest.setTimeout(240000);
const PASSWORD = "P4-account-2026!";
const NEXT = "P4-changed-2027!";
type Account = { id: string; email: string; name: string; token: string; refresh: string };
const TRAFFIC = { preset: "steady", rps: 500, burst: 1.5, readRatio: 0.8, durationMin: 10, shape: "steady" };

describe("P4 account self-service: profile, password, export and deletion (isolated Postgres, no AI involved)", () => {
  let app: NestExpressApplication, db: DataSource, http: ReturnType<typeof request>, roles: AccountRolesService;
  const as = (a: { token: string }) => ({ Authorization: "Bearer " + a.token });
  const cookieOf = (res: request.Response) => {
    const raw = ([] as string[]).concat((res.headers["set-cookie"] as unknown as string[]) ?? []).find((c) => c.startsWith("sf_refresh="));
    return raw ? raw.split(";")[0] : "";
  };

  async function register(name: string, password = PASSWORD): Promise<Account> {
    const email = `${name.replace(/\s+/g, "-").toLowerCase()}-${randomUUID()}@example.test`;
    const res = await http.post("/v1/auth/register").send({ email, password, displayName: name }).expect(201);
    return { id: res.body.data.user.id, email, name, token: res.body.data.accessToken, refresh: cookieOf(res) };
  }
  async function login(a: Account, password = PASSWORD) {
    const res = await http.post("/v1/auth/login").send({ email: a.email, password });
    return { res, token: res.body?.data?.accessToken as string, refresh: cookieOf(res) };
  }
  async function withRole(name: string, role: "instructor" | "reviewer" | "admin") {
    const a = await register(name);
    await roles.grant(OPERATOR, a.id, { role });
    return a;
  }
  async function design(who: Account, name = "My design") {
    const t = getTemplates().find((x) => x.id === "mvp")!;
    return (await http.post("/v1/designs").set(as(who)).send({ schemaVersion: 1, name, description: t.blurb, source: "template", templateId: t.id, graph: t.graph, traffic: t.traffic }).expect(201)).body.data;
  }
  async function publishedChallenge(who: Account) {
    const d = await design(who, "Starter");
    const c = (await http.post("/v1/instructor/challenges").set(as(who)).send({ title: "Fix checkout", summary: "Bring p95 down.", goal: { p95Ms: 60000, errorRate: 1 }, traffic: TRAFFIC, from: { designId: d.id } }).expect(201)).body.data;
    return (await http.post(`/v1/instructor/challenges/${c.id}/publish`).set(as(who)).expect(200)).body.data;
  }
  async function gradedAttempt(learner: Account, challengeId: string) {
    const a = (await http.post(`/v1/challenges/${challengeId}/attempt`).set(as(learner)).expect(200)).body.data;
    await http.post(`/v1/attempts/${a.id}/submissions`).set(as(learner)).send({ requestId: randomUUID(), expectedRevision: 1 }).expect(202);
    for (let n = 0; n < 200; n++) {
      const v = (await http.get(`/v1/attempts/${a.id}`).set(as(learner)).expect(200)).body.data;
      const s = v.submissions.find((x: { status: string }) => x.status === "completed");
      if (s) return { attempt: a, submission: s as { id: string } };
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error("Judging did not settle");
  }
  const remove = (a: { token: string }, password: string, confirmation = "delete my account") => http.post("/v1/account/delete").set(as(a)).send({ password, confirmation });

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
  });
  afterAll(async () => {
    await app?.close();
  });

  describe("profile", () => {
    it("changes only the display name, trims it, keeps markup as plain text, and shows it everywhere", async () => {
      const a = await register("Pat Profile");
      const res = await http.patch("/v1/account/profile").set(as(a)).send({ displayName: "  Pat <b>Q</b> Public  " }).expect(200);
      expect(res.body.data).toMatchObject({ id: a.id, email: a.email, displayName: "Pat <b>Q</b> Public" });
      expect(Object.keys(res.body.data).sort()).toEqual(["createdAt", "displayName", "email", "id", "role"]);
      expect((await http.get("/v1/auth/me").set(as(a)).expect(200)).body.data.displayName).toBe("Pat <b>Q</b> Public");
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/);
    });

    it("refuses empty, blank, overlong, control-character and unknown-field requests and changes nothing", async () => {
      const a = await register("Quinn Strict");
      for (const bad of [{ displayName: "" }, { displayName: "   " }, { displayName: "x".repeat(61) }, { displayName: "tab\there" }, { displayName: "nul\u0000" }, { displayName: 5 }, {}, { displayName: "Ok", email: "other@example.test" }, { displayName: "Ok", role: "admin" }]) {
        const r = await http.patch("/v1/account/profile").set(as(a)).send(bad).expect(422);
        expect(r.body.error.details.fields.length).toBeGreaterThan(0);
      }
      await http.patch("/v1/account/profile").set(as(a)).send({ displayName: "x".repeat(60) }).expect(200);
      expect((await db.query("SELECT display_name, email FROM users WHERE id = $1", [a.id]))[0]).toEqual({ display_name: "x".repeat(60), email: a.email });
    });

    it("needs a signed-in account and can only ever touch the caller's own", async () => {
      await http.patch("/v1/account/profile").send({ displayName: "Nobody" }).expect(401);
      const a = await register("Alma Own");
      const b = await register("Boris Own");
      await http.patch("/v1/account/profile").set(as(a)).send({ displayName: "Alma Changed", id: b.id }).expect(422);
      await http.patch("/v1/account/profile").set(as(a)).send({ displayName: "Alma Changed" }).expect(200);
      expect((await db.query("SELECT display_name FROM users WHERE id = $1", [b.id]))[0].display_name).toBe("Boris Own");
    });
  });

  describe("password change", () => {
    it("refuses a wrong current password, an unchanged password and a weak one, and leaves the password as it was", async () => {
      const a = await register("Wanda Password");
      const wrong = await http.post("/v1/auth/password").set(as(a)).send({ currentPassword: "nope-nope-1", newPassword: NEXT }).expect(422);
      expect(wrong.body.error.details.fields).toEqual([{ path: "currentPassword", message: "Incorrect password" }]);
      const same = await http.post("/v1/auth/password").set(as(a)).send({ currentPassword: PASSWORD, newPassword: PASSWORD }).expect(422);
      expect(same.body.error.details.fields[0].path).toBe("newPassword");
      for (const weak of ["short1", "nodigitsatall", "12345678901"]) {
        const r = await http.post("/v1/auth/password").set(as(a)).send({ currentPassword: PASSWORD, newPassword: weak }).expect(422);
        expect(r.body.error.details.fields[0].path).toBe("newPassword");
      }
      await http.post("/v1/auth/password").set(as(a)).send({ currentPassword: PASSWORD, newPassword: NEXT, extra: 1 }).expect(422);
      await http.post("/v1/auth/password").send({ currentPassword: PASSWORD, newPassword: NEXT }).expect(401);
      expect((await login(a)).res.status).toBe(200);
    });

    it("switches to the new password at once, gives this device a working new session, and ends every other session", async () => {
      const a = await register("Sven Sessions");
      const other = await login(a); // a second device, signed in a moment ago (very likely in the same second)
      expect(other.res.status).toBe(200);
      await http.get("/v1/designs").set(as(other)).expect(200);

      const res = await http.post("/v1/auth/password").set(as(a)).send({ currentPassword: PASSWORD, newPassword: NEXT }).expect(200);
      const fresh = { token: res.body.data.accessToken as string, refresh: cookieOf(res) };
      expect(fresh.refresh).not.toBe("");
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/);

      // The other device: its access token and its refresh cookie are both dead straight away.
      await http.get("/v1/designs").set(as(other)).expect(401);
      await http.post("/v1/auth/refresh").set("Cookie", other.refresh).expect((r) => expect([401, 403]).toContain(r.status));
      // The device that changed it: the old access token (same account, older session) is dead, the new one works, and it can refresh.
      await http.get("/v1/designs").set(as(a)).expect(401);
      await http.get("/v1/designs").set(as(fresh)).expect(200);
      const refreshed = await http.post("/v1/auth/refresh").set("Cookie", fresh.refresh).expect(200);
      await http.get("/v1/designs").set(as({ token: refreshed.body.data.accessToken })).expect(200);

      // Signing in right afterwards, in the same second, works with the new password only.
      expect((await login(a)).res.status).toBe(401);
      const again = await login(a, NEXT);
      expect(again.res.status).toBe(200);
      await http.get("/v1/designs").set(as(again)).expect(200);
      await http.post("/v1/auth/refresh").set("Cookie", again.refresh).expect(200);
    });

    it("does not touch other accounts' sessions", async () => {
      const a = await register("Alex Alone");
      const b = await register("Bea Bystander");
      await http.post("/v1/auth/password").set(as(a)).send({ currentPassword: PASSWORD, newPassword: NEXT }).expect(200);
      await http.get("/v1/designs").set(as(b)).expect(200);
      await http.post("/v1/auth/refresh").set("Cookie", b.refresh).expect(200);
    });

    it("stores a hash, never the password, and the stored hash changes", async () => {
      const a = await register("Hana Hash");
      const before = (await db.query("SELECT password_hash FROM users WHERE id = $1", [a.id]))[0].password_hash;
      await http.post("/v1/auth/password").set(as(a)).send({ currentPassword: PASSWORD, newPassword: NEXT }).expect(200);
      const after = (await db.query("SELECT password_hash FROM users WHERE id = $1", [a.id]))[0].password_hash;
      expect(after).not.toBe(before);
      expect(after).toMatch(/^\$argon2/);
      expect(after).not.toContain(NEXT);
    });
  });

  describe("export", () => {
    it("returns everything the account holds, and nothing that belongs to anyone else", async () => {
      const me = await register("Eve Export");
      const other = await register("Olga Other");
      const reviewer = await withRole("Rita Reviewer", "reviewer");
      const mine = await design(me, "Mine one");
      await design(me, "Mine two");
      const theirs = await design(other, "Not mine");
      await http.post(`/v1/designs/${mine.id}/notes`).set(as(me)).send({ revision: 1, kind: "decision", text: "Chose a cache." }).expect((r) => expect([200, 201]).toContain(r.status));
      await db.query("INSERT INTO design_runs(id, design_id, request_id, status, completed_at, payload) VALUES (gen_random_uuid(), $1, gen_random_uuid(), 'completed', now(), '{\"p95\": 12}')", [mine.id]);
      const share = (await http.post(`/v1/designs/${mine.id}/shares`).set(as(me)).send({ scope: "design" }).expect(201)).body.data;
      const grant = (await http.post(`/v1/designs/${mine.id}/reviews`).set(as(me)).send({ email: reviewer.email }).expect(201)).body.data;
      await http.post(`/v1/reviews/${grant.id}/comments`).set(as(reviewer)).send({ text: "Looks fine." }).expect(201);

      const res = await http.get("/v1/account/export").set(as(me)).expect(200);
      expect(res.headers["cache-control"]).toMatch(/no-store/);
      const data = res.body.data;
      expect(data.format).toBe("stressforge-export-v1");
      expect(data.account).toMatchObject({ id: me.id, email: me.email, displayName: "Eve Export", roles: ["user"] });
      expect(data.designs.map((d: { name: string }) => d.name).sort()).toEqual(["Mine one", "Mine two"]);
      const one = data.designs.find((d: { id: string }) => d.id === mine.id);
      expect(one.graph.nodes.length).toBeGreaterThan(0);
      expect(one.versions.length).toBeGreaterThan(0);
      expect(one.notes[0].text).toBe("Chose a cache.");
      expect(one.runs).toHaveLength(1);
      expect(one.runs[0].result).toEqual({ p95: 12 });
      expect(one.shareLinks).toHaveLength(1);
      expect(data.reviewsOfMyDesigns[0]).toMatchObject({ designId: mine.id, reviewer: "Rita Reviewer" });
      expect(data.reviewsOfMyDesigns[0].comments[0]).toMatchObject({ author: "Rita Reviewer", text: "Looks fine." });

      const text = JSON.stringify(res.body);
      for (const secret of [other.email, other.id, theirs.id, reviewer.email, reviewer.id, share.token]) expect(text).not.toContain(secret);
      expect(text).not.toMatch(/token_hash|tokenHash|passwordHash|\$argon2/);
      // The Reviewer's own export holds their comment but not the owner's design.
      const rev = JSON.stringify((await http.get("/v1/account/export").set(as(reviewer)).expect(200)).body.data);
      expect(rev).toContain("Looks fine.");
      expect(rev).not.toContain(mine.id);
      expect(rev).not.toContain(me.email);
    });

    it("lists runs beyond the latest 20 without their large result, and needs a signed-in account", async () => {
      const me = await register("Rex Runs");
      const d = await design(me);
      for (let i = 0; i < 22; i++) await db.query("INSERT INTO design_runs(id, design_id, request_id, status, completed_at, payload, created_at) VALUES (gen_random_uuid(), $1, gen_random_uuid(), 'completed', now(), '{\"n\": 1}', now() - ($2 || ' minutes')::interval)", [d.id, String(100 - i)]);
      const runs = (await http.get("/v1/account/export").set(as(me)).expect(200)).body.data.designs[0].runs;
      expect(runs).toHaveLength(22);
      expect(runs.filter((r: { result?: unknown }) => r.result !== undefined)).toHaveLength(20);
      expect(runs.slice(0, 2).every((r: { result?: unknown }) => r.result === undefined)).toBe(true);
      await http.get("/v1/account/export").expect(401);
    });

    it("includes a learner's attempts, results and the feedback received, and an Instructor's own challenges", async () => {
      const teacher = await withRole("Tess Teacher", "instructor");
      const learner = await register("Lena Learner");
      const c = await publishedChallenge(teacher);
      const g = await gradedAttempt(learner, c.id);
      await http.post(`/v1/instructor/submissions/${g.submission.id}/feedback`).set(as(teacher)).send({ text: "Nice work." }).expect(201);
      const mine = (await http.get("/v1/account/export").set(as(learner)).expect(200)).body.data;
      expect(mine.challengeAttempts).toHaveLength(1);
      expect(mine.challengeAttempts[0]).toMatchObject({ challengeTitle: "Fix checkout" });
      expect(mine.challengeAttempts[0].submissions[0].status).toBe("completed");
      expect(mine.challengeAttempts[0].feedbackReceived[0]).toMatchObject({ from: "Tess Teacher", text: "Nice work." });
      const theirs = (await http.get("/v1/account/export").set(as(teacher)).expect(200)).body.data;
      expect(theirs.challengesIManage.map((x: { title: string }) => x.title)).toContain("Fix checkout");
      expect(theirs.challengeAttempts).toEqual([]);
      expect(JSON.stringify(theirs)).not.toContain(learner.email);
    });
  });

  describe("deletion", () => {
    it("needs the right password and the typed phrase; a refused request deletes nothing", async () => {
      const a = await register("Dana Careful");
      await design(a);
      for (const [pw, phrase] of [["wrong-pass-1", "delete my account"], [PASSWORD, "yes"], [PASSWORD, ""], ["", "delete my account"]] as const) {
        const r = await remove(a, pw, phrase).expect(422);
        expect(r.body.error.details.fields.length).toBeGreaterThan(0);
      }
      await http.post("/v1/account/delete").set(as(a)).send({ password: PASSWORD, confirmation: "delete my account", extra: true }).expect(422);
      await http.post("/v1/account/delete").send({ password: PASSWORD, confirmation: "delete my account" }).expect(401);
      expect((await db.query("SELECT count(*)::int AS n FROM users WHERE id = $1", [a.id]))[0].n).toBe(1);
      expect((await db.query("SELECT count(*)::int AS n FROM designs WHERE owner_id = $1", [a.id]))[0].n).toBe(1);
    });

    it("deletes the account and everything that belonged to it, ends every session, and touches nobody else", async () => {
      const gone = await register("Gus Gone");
      const keep = await register("Kim Keeper");
      const reviewer = await withRole("Ray Reviewer", "reviewer");
      const d = await design(gone, "Doomed");
      const kept = await design(keep, "Kept");
      await http.post(`/v1/designs/${d.id}/notes`).set(as(gone)).send({ revision: 1, kind: "decision", text: "bye" }).expect((r) => expect([200, 201]).toContain(r.status));
      const share = (await http.post(`/v1/designs/${d.id}/shares`).set(as(gone)).send({ scope: "design" }).expect(201)).body.data;
      const grant = (await http.post(`/v1/designs/${d.id}/reviews`).set(as(gone)).send({ email: reviewer.email }).expect(201)).body.data;
      const second = await login(gone);

      await remove(gone, PASSWORD).expect(204).expect((r) => expect(String(r.headers["set-cookie"] ?? "")).toMatch(/sf_refresh=;/));

      for (const [table, col] of [["designs", "owner_id"], ["user_roles", "user_id"], ["challenge_attempts", "learner_id"], ["review_grants", "owner_id"]] as const) {
        expect((await db.query(`SELECT count(*)::int AS n FROM ${table} WHERE ${col} = $1`, [gone.id]))[0].n).toBe(0);
      }
      expect((await db.query("SELECT count(*)::int AS n FROM users WHERE id = $1", [gone.id]))[0].n).toBe(0);
      expect((await db.query("SELECT count(*)::int AS n FROM design_notes WHERE design_id = $1", [d.id]))[0].n).toBe(0);
      // Every way back in is closed.
      await http.get("/v1/designs").set(as(gone)).expect(401);
      await http.get("/v1/designs").set(as(second)).expect(401);
      await http.post("/v1/auth/refresh").set("Cookie", gone.refresh).expect((r) => expect([401, 403]).toContain(r.status));
      await http.post("/v1/auth/refresh").set("Cookie", second.refresh).expect((r) => expect([401, 403]).toContain(r.status));
      expect((await login(gone)).res.status).toBe(401);
      // The share link, the review and the Reviewer's access died with the design.
      await http.post("/v1/shares/open").send({ token: share.token }).expect(404);
      await http.get(`/v1/reviews/${grant.id}`).set(as(reviewer)).expect(404);
      // Other people are untouched.
      expect((await http.get(`/v1/designs/${kept.id}`).set(as(keep)).expect(200)).body.data.name).toBe("Kept");
      expect((await db.query("SELECT count(*)::int AS n FROM users WHERE id = ANY($1)", [[keep.id, reviewer.id]]))[0].n).toBe(2);
      // The same email can register again, as a brand-new account.
      const back = await http.post("/v1/auth/register").send({ email: gone.email, password: PASSWORD, displayName: "Gus Again" }).expect(201);
      expect(back.body.data.user.id).not.toBe(gone.id);
    });

    it("keeps a challenge other people have attempted (archived, ownerless) and the feedback they got; removes the rest", async () => {
      const teacher = await withRole("Terry Teacher", "instructor");
      const learner = await register("Lou Learner");
      const used = await publishedChallenge(teacher);
      const unused = await publishedChallenge(teacher);
      const g = await gradedAttempt(learner, used.id);
      await http.post(`/v1/instructor/submissions/${g.submission.id}/feedback`).set(as(teacher)).send({ text: "Good." }).expect(201);

      await remove(teacher, PASSWORD).expect(204);

      const [kept] = await db.query("SELECT instructor_id, status FROM challenges WHERE id = $1", [used.id]);
      expect(kept).toEqual({ instructor_id: null, status: "archived" });
      expect((await db.query("SELECT count(*)::int AS n FROM challenges WHERE id = $1", [unused.id]))[0].n).toBe(0);
      const view = (await http.get(`/v1/attempts/${g.attempt.id}`).set(as(learner)).expect(200)).body.data;
      expect(view.challenge.archived).toBe(true);
      expect(view.submissions[0].status).toBe("completed");
      expect(view.feedback[0]).toMatchObject({ text: "Good.", author: { displayName: "Former Instructor" } });
      const progress = (await http.get("/v1/progress/challenges").set(as(learner)).expect(200)).body.data;
      expect(progress.items.find((i: { attemptId: string }) => i.attemptId === g.attempt.id)).toMatchObject({ archived: true, passed: true });
      await http.get(`/v1/challenges/${used.id}`).expect(404);
      const exp = (await http.get("/v1/account/export").set(as(learner)).expect(200)).body.data;
      expect(exp.challengeAttempts[0].feedbackReceived[0].from).toBe("Former Instructor");
    });

    it("removes a learner's attempts and their results from the Instructor's view, but not the challenge", async () => {
      const teacher = await withRole("Tilda Teacher", "instructor");
      const learner = await register("Lea Leaving");
      const c = await publishedChallenge(teacher);
      await gradedAttempt(learner, c.id);
      expect((await http.get(`/v1/instructor/challenges/${c.id}/submissions`).set(as(teacher)).expect(200)).body.data).toHaveLength(1);
      await remove(learner, PASSWORD).expect(204);
      expect((await http.get(`/v1/instructor/challenges/${c.id}/submissions`).set(as(teacher)).expect(200)).body.data).toEqual([]);
      expect((await http.get(`/v1/instructor/challenges/${c.id}`).set(as(teacher)).expect(200)).body.data.status).toBe("published");
      expect((await db.query("SELECT count(*)::int AS n FROM challenge_attempts WHERE learner_id = $1", [learner.id]))[0].n).toBe(0);
    });

    it("never deletes the last working Admin, but lets an Admin go when another one remains", async () => {
      await db.query("DELETE FROM user_roles WHERE role = 'admin'"); // an isolated database: start with no Admins
      const first = await withRole("Ada Admin", "admin");
      const refused = await remove(first, PASSWORD).expect(409);
      expect(refused.body.error.details).toMatchObject({ reason: "LAST_ADMIN" });
      expect((await db.query("SELECT count(*)::int AS n FROM users WHERE id = $1", [first.id]))[0].n).toBe(1);
      const second = await withRole("Bob Admin", "admin");
      await remove(first, PASSWORD).expect(204);
      const lastOne = await remove(second, PASSWORD).expect(409);
      expect(lastOne.body.error.details.reason).toBe("LAST_ADMIN");
    });

    it("keeps the role history (an append-only audit log) and survives two deletions racing", async () => {
      const a = await withRole("Rob Racer", "reviewer");
      const [{ n: before }] = await db.query("SELECT count(*)::int AS n FROM role_audit WHERE target_id = $1", [a.id]);
      expect(before).toBeGreaterThan(0);
      const rr = await Promise.all([remove(a, PASSWORD), remove(a, PASSWORD)]);
      const codes = rr.map((r) => r.status).sort();
      expect(codes[0]).toBe(204);
      expect([204, 401, 422]).toContain(codes[1]);
      expect(codes).not.toContain(500);
      expect((await db.query("SELECT count(*)::int AS n FROM role_audit WHERE target_id = $1", [a.id]))[0].n).toBe(before);
    });
  });

  it("publishes the account operations in the live OpenAPI document", async () => {
    const live = (await http.get("/docs-json").expect(200)).body;
    for (const path of ["/v1/account/profile", "/v1/account/export", "/v1/account/delete", "/v1/auth/password"]) expect(live.paths[path]).toBeDefined();
  });
});
