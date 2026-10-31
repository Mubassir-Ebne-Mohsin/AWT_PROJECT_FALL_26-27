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
import { adminUserSchema, statusChangeSchema } from "@/common/contracts/phase3/roles.schema";
import { AccountRolesService, OPERATOR } from "@/modules/roles/account-roles.service";

jest.setTimeout(120000);
const PASSWORD = "R2-status-2026!";
type Account = { id: string; email: string; token: string; cookie: string };
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("R2 Admin tools: suspension, ended sessions, search (isolated Postgres, no AI involved)", () => {
  let app: NestExpressApplication, db: DataSource, http: ReturnType<typeof request>, roles: AccountRolesService;
  const as = (a: Account) => ({ Authorization: "Bearer " + a.token });
  const cookieOf = (res: request.Response) => ((res.headers["set-cookie"] as unknown as string[] | undefined) ?? []).find((c) => c.startsWith("sf_refresh="))!.split(";")[0];

  async function register(name: string): Promise<Account> {
    const email = `${name}-${randomUUID()}@example.test`;
    const res = await http.post("/v1/auth/register").send({ email, password: PASSWORD, displayName: name }).expect(201);
    return { id: res.body.data.user.id, email, token: res.body.data.accessToken, cookie: cookieOf(res) };
  }
  async function login(a: Account): Promise<Account> {
    const res = await http.post("/v1/auth/login").send({ email: a.email, password: PASSWORD }).expect(200);
    return { ...a, token: res.body.data.accessToken, cookie: cookieOf(res) };
  }
  const refresh = (a: Account) => http.post("/v1/auth/refresh").set("Cookie", a.cookie);
  async function makeAdmin(name = "admin") {
    const account = await register(name);
    await roles.grant(OPERATOR, account.id, { role: "admin" });
    return account;
  }
  const suspend = (admin: Account, id: string) => http.post(`/v1/admin/users/${id}/suspend`).set(as(admin));
  const restore = (admin: Account, id: string) => http.post(`/v1/admin/users/${id}/restore`).set(as(admin));
  const audit = async (admin: Account) =>
    (await http.get("/v1/admin/audit?limit=50").set(as(admin)).expect(200)).body.data as Array<{ action: string; role: string | null; actor: { email: string }; target: { email: string } }>;

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

  it("refuses sign-in to a suspended account only after the password is right, and allows it again after restore", async () => {
    const admin = await makeAdmin();
    const subject = await register("suspendee");
    await suspend(admin, subject.id).expect(200);
    const refused = await http.post("/v1/auth/login").send({ email: subject.email, password: PASSWORD }).expect(403);
    expect(refused.body.error.details).toMatchObject({ reason: "ACCOUNT_SUSPENDED" });
    // A wrong password learns nothing about the suspension.
    const wrong = await http.post("/v1/auth/login").send({ email: subject.email, password: "not-the-password-1!" }).expect(401);
    expect(JSON.stringify(wrong.body)).not.toMatch(/suspend/i);
    await restore(admin, subject.id).expect(200);
    await http.post("/v1/auth/login").send({ email: subject.email, password: PASSWORD }).expect(200);
  });

  it("ends the suspended account's live access token at once and its refresh cookie for good", async () => {
    const admin = await makeAdmin();
    const subject = await register("liveuser");
    await http.get("/v1/account/roles").set(as(subject)).expect(200);
    const status = statusChangeSchema.parse((await suspend(admin, subject.id).expect(200)).body.data);
    expect(status).toEqual({ userId: subject.id, status: "suspended" });
    await http.get("/v1/account/roles").set(as(subject)).expect(401); // the same token, refused at once
    await refresh(subject).expect(401);
    await sleep(1100);
    await restore(admin, subject.id).expect(200);
    await refresh(subject).expect(401); // the session that was ended stays ended after a restore
    const fresh = await login(subject);
    await http.get("/v1/account/roles").set(as(fresh)).expect(200);
  });

  it("ends an account's refresh sessions when a role is removed, and it can sign in again afterwards", async () => {
    const admin = await makeAdmin();
    const subject = await register("demoted");
    await roles.grant(OPERATOR, subject.id, { role: "reviewer" });
    await sleep(1100);
    const session = await login(subject);
    await http.delete(`/v1/admin/users/${subject.id}/roles/reviewer`).set(as(admin)).expect(200);
    await refresh(session).expect(401); // a valid cookie from before the change is refused
    await sleep(1100);
    const after = await login(subject);
    await refresh(after).expect(200);
  });

  it("refuses a refresh for a suspended account even when only its status was changed, as an operator might in the database", async () => {
    const subject = await register("statusonly");
    await refresh(subject).expect(200); // healthy first
    const rotated = await login(subject);
    await db.query("UPDATE users SET account_status = 'suspended' WHERE id = $1", [subject.id]);
    expect((await db.query("SELECT sessions_revoked_at FROM users WHERE id = $1", [subject.id]))[0].sessions_revoked_at).toBeNull();
    await refresh(rotated).expect(401);
    await db.query("UPDATE users SET account_status = 'active' WHERE id = $1", [subject.id]);
  });

  it("leaves other accounts' sessions alone when one account is suspended or loses a role", async () => {
    const admin = await makeAdmin();
    const bystander = await register("bystander");
    const target = await register("target");
    await sleep(1100);
    const session = await login(bystander);
    await suspend(admin, target.id).expect(200);
    await roles.grant(OPERATOR, target.id, { role: "instructor" });
    await http.delete(`/v1/admin/users/${target.id}/roles/instructor`).set(as(admin)).expect(200);
    await http.get("/v1/account/roles").set(as(session)).expect(200);
    await refresh(session).expect(200);
  });

  it("allows suspend, restore and search to Admin only: guests get 401 and User, Instructor and Reviewer get 403 with no effect", async () => {
    const admin = await makeAdmin();
    const target = await register("matrix-target");
    const instructor = await register("m-instructor");
    await roles.grant(OPERATOR, instructor.id, { role: "instructor" });
    const reviewer = await register("m-reviewer");
    await roles.grant(OPERATOR, reviewer.id, { role: "reviewer" });
    const user = await register("m-user");
    const calls: Array<[string, (a?: Account) => request.Test]> = [
      ["suspend", (a) => { const r = http.post(`/v1/admin/users/${target.id}/suspend`); return a ? r.set(as(a)) : r; }],
      ["restore", (a) => { const r = http.post(`/v1/admin/users/${target.id}/restore`); return a ? r.set(as(a)) : r; }],
      ["search", (a) => { const r = http.get("/v1/admin/users?q=matrix"); return a ? r.set(as(a)) : r; }],
    ];
    for (const [name, call] of calls) {
      expect([name, (await call()).status]).toEqual([name, 401]);
      for (const refused of [user, instructor, reviewer]) expect([name, (await call(refused)).status]).toEqual([name, 403]);
    }
    expect((await db.query("SELECT account_status FROM users WHERE id = $1", [target.id]))[0].account_status).toBe("active");
    for (const [, call] of calls) expect((await call(admin)).status).toBe(200);
  });

  it("is idempotent, audits each real change once with no role, and shows the status to an Admin", async () => {
    const admin = await makeAdmin();
    const subject = await register("audited");
    await suspend(admin, subject.id).expect(200);
    await suspend(admin, subject.id).expect(200);
    const seen = adminUserSchema.parse((await http.get(`/v1/admin/users/lookup?email=${encodeURIComponent(subject.email)}`).set(as(admin)).expect(200)).body.data);
    expect(seen.status).toBe("suspended");
    await restore(admin, subject.id).expect(200);
    await restore(admin, subject.id).expect(200);
    const mine = (await audit(admin)).filter((e) => e.target.email === subject.email);
    expect(mine.map((e) => `${e.action}:${e.role}`).sort()).toEqual(["restore:null", "suspend:null"]);
    expect(mine.every((e) => e.actor.email === admin.email)).toBe(true);
    await suspend(admin, randomUUID()).expect(404);
    await restore(admin, randomUUID()).expect(404);
  });

  it("never lets an Admin suspend themselves, and never suspends or demotes the last working Admin", async () => {
    await db.query("UPDATE users SET account_status = 'suspended' WHERE role = 'admin' OR id IN (SELECT user_id FROM user_roles WHERE role = 'admin')");
    const x = await makeAdmin("x");
    const self = await suspend(x, x.id).expect(409);
    expect(self.body.error.details).toMatchObject({ reason: "SELF" });
    // Reached by another actor only through the service, because any Admin who could call the API is working too.
    await expect(roles.suspend({ id: randomUUID(), email: "someone-else" }, x.id)).rejects.toMatchObject({ response: expect.anything() });
    const lastOnSuspend = await roles.suspend({ id: randomUUID(), email: "someone-else" }, x.id).catch((e) => e);
    expect(lastOnSuspend.details).toMatchObject({ reason: "LAST_ADMIN" });
    const demote = await http.delete(`/v1/admin/users/${x.id}/roles/admin`).set(as(x)).expect(409);
    expect(demote.body.error.details).toMatchObject({ reason: "LAST_ADMIN" });
    expect((await db.query("SELECT account_status FROM users WHERE id = $1", [x.id]))[0].account_status).toBe("active");
    // With a second working Admin there is room again.
    const z = await makeAdmin("z");
    await suspend(z, x.id).expect(200);
    await restore(z, x.id).expect(200);
    await http.delete(`/v1/admin/users/${x.id}/roles/admin`).set(as(z)).expect(200);
  });

  it("keeps every row of a suspended account: its design is still there after a restore", async () => {
    const admin = await makeAdmin();
    const owner = await register("keeper");
    const t = getTemplates().find((x) => x.id === "mvp")!;
    const design = (await http.post("/v1/designs").set(as(owner)).send({ schemaVersion: 1, name: t.name, description: t.blurb, source: "template", templateId: t.id, graph: t.graph, traffic: t.traffic }).expect(201)).body.data;
    await suspend(admin, owner.id).expect(200);
    expect((await db.query("SELECT count(*)::int AS n FROM designs WHERE id = $1", [design.id]))[0].n).toBe(1);
    await restore(admin, owner.id).expect(200);
    const back = await login(owner);
    await http.get(`/v1/designs/${design.id}`).set(as(back)).expect(200);
  });

  it("searches by part of an email or name, treats % and _ as plain characters, and shows account details only", async () => {
    const admin = await makeAdmin();
    const tag = randomUUID().slice(0, 8);
    const alpha = await register(`zq${tag}-alpha`);
    await register(`zq${tag}-beta`);
    const found = (await http.get(`/v1/admin/users?q=${encodeURIComponent(("ZQ" + tag).toUpperCase())}`).set(as(admin)).expect(200)).body.data;
    expect(found).toHaveLength(2);
    for (const row of found) {
      adminUserSchema.parse(row);
      expect(Object.keys(row).sort()).toEqual(["createdAt", "displayName", "email", "id", "roles", "status"]);
    }
    expect(found.map((r: { id: string }) => r.id)).toContain(alpha.id);
    expect(JSON.stringify(found)).not.toMatch(/passwordHash|argon2|\$argon/i);
    const limited = (await http.get(`/v1/admin/users?q=zq${tag}&limit=1`).set(as(admin)).expect(200)).body.data;
    expect(limited).toHaveLength(1);
    expect((await http.get("/v1/admin/users?q=%25%25").set(as(admin)).expect(200)).body.data).toEqual([]); // "%%" is not a wildcard
    expect((await http.get("/v1/admin/users?q=__").set(as(admin)).expect(200)).body.data).toEqual([]); // "__" is not a wildcard
  });

  it("rejects bad searches and bad ids", async () => {
    const admin = await makeAdmin();
    await http.get("/v1/admin/users").set(as(admin)).expect(422);
    await http.get("/v1/admin/users?q=a").set(as(admin)).expect(422);
    await http.get("/v1/admin/users?q=ab&limit=0").set(as(admin)).expect(422);
    await http.get("/v1/admin/users?q=ab&limit=21").set(as(admin)).expect(422);
    await http.get("/v1/admin/users?q=ab&extra=1").set(as(admin)).expect(422);
    expect([400, 422]).toContain((await suspend(admin, "not-a-uuid")).status);
  });

  it("publishes the new operations in the live OpenAPI document, identical to the canonical contract", async () => {
    const live = (await http.get("/docs-json").expect(200)).body;
    const canonical = phase3OpenApi().paths as Record<string, unknown>;
    for (const path of ["/v1/admin/users", "/v1/admin/users/{id}/suspend", "/v1/admin/users/{id}/restore"]) {
      expect(canonical[path]).toBeDefined();
      expect(live.paths[path]).toEqual(canonical[path]);
    }
  });
});
