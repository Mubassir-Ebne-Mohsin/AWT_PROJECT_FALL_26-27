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
import { accountRolesSchema, adminUserSchema, auditEntrySchema, roleChangeSchema } from "@/common/contracts/phase3/roles.schema";
import { AccountRolesService, OPERATOR } from "@/modules/roles/account-roles.service";
import { seedDemoAccounts } from "@/modules/roles/demo-accounts";

jest.setTimeout(120000);
type Account = { id: string; email: string; token: string };

describe("R1 Roles (isolated Postgres, no AI involved)", () => {
  let app: NestExpressApplication, db: DataSource, http: ReturnType<typeof request>, roles: AccountRolesService;
  const as = (a: Account) => ({ Authorization: "Bearer " + a.token });

  async function register(name: string): Promise<Account> {
    const email = `${name}-${randomUUID()}@example.test`;
    const res = await http.post("/v1/auth/register").send({ email, password: "R1-roles-2026!", displayName: name }).expect(201);
    return { id: res.body.data.user.id, email, token: res.body.data.accessToken };
  }
  /** A fresh Admin, made by the server-side path so it does not depend on any other account. */
  async function makeAdmin(name = "admin") {
    const account = await register(name);
    await roles.grant(OPERATOR, account.id, { role: "admin" });
    return account;
  }
  async function withRole(name: string, role: "instructor" | "reviewer") {
    const account = await register(name);
    await roles.grant(OPERATOR, account.id, { role });
    return account;
  }
  const myRoles = async (a: Account) => accountRolesSchema.parse((await http.get("/v1/account/roles").set(as(a)).expect(200)).body.data).roles;
  const audit = async (a: Account, query = "limit=50") => (await http.get(`/v1/admin/audit?${query}`).set(as(a)).expect(200)).body.data as Array<{ id: string; at: string; action: string; role: string; actor: { id: string | null; email: string }; target: { id: string | null; email: string } }>;
  const grant = (admin: Account, targetId: string, body: unknown) => http.post(`/v1/admin/users/${targetId}/roles`).set(as(admin)).send(body as object);
  const revoke = (admin: Account, targetId: string, role: string) => http.delete(`/v1/admin/users/${targetId}/roles/${role}`).set(as(admin));
  const onlyAdminsLeft = async () => {
    await db.query("UPDATE users SET role = 'user' WHERE role = 'admin'");
    await db.query("DELETE FROM user_roles WHERE role = 'admin'");
  };

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

  it("starts every account as User only, and registration cannot grant a privileged role", async () => {
    const plain = await register("plain");
    expect(await myRoles(plain)).toEqual(["user"]);
    await http.get("/v1/account/roles").expect(401);
    const sneaky = await http.post("/v1/auth/register").send({ email: `sneaky-${randomUUID()}@example.test`, password: "R1-roles-2026!", displayName: "Sneaky", role: "admin", roles: ["admin"] });
    if (sneaky.status === 201) expect(await myRoles({ id: sneaky.body.data.user.id, email: "", token: sneaky.body.data.accessToken })).toEqual(["user"]);
    else expect(sneaky.status).toBe(422);
  });

  it("makes the first Admin once, records it as an operator action, and refuses to make another this way", async () => {
    await onlyAdminsLeft();
    const first = await register("first");
    const second = await register("second");
    const result = await roles.bootstrapAdmin(first.email);
    expect(result.roles).toEqual(["user", "admin"]);
    await expect(roles.bootstrapAdmin(second.email)).rejects.toThrow(/admin already exists/i);
    await expect(roles.bootstrapAdmin(`nobody-${randomUUID()}@example.test`)).rejects.toThrow(/No account/);
    expect(await myRoles(second)).toEqual(["user"]);
    const entry = (await audit(first)).find((e) => e.target.email === first.email && e.action === "bootstrap")!;
    expect(auditEntrySchema.parse(entry)).toMatchObject({ role: "admin", actor: { id: null, email: "operator" } });
  });

  it("allows every admin operation to Admin only: guests get 401, User, Instructor and Reviewer get 403, with no side effect", async () => {
    const admin = await makeAdmin("matrix-admin");
    const target = await register("matrix-target");
    const instructor = await withRole("matrix-instructor", "instructor");
    const reviewer = await withRole("matrix-reviewer", "reviewer");
    const user = await register("matrix-user");
    const calls: Array<[string, (a?: Account) => request.Test]> = [
      ["lookup", (a) => { const r = http.get(`/v1/admin/users/lookup?email=${encodeURIComponent(target.email)}`); return a ? r.set(as(a)) : r; }],
      ["view roles", (a) => { const r = http.get(`/v1/admin/users/${target.id}/roles`); return a ? r.set(as(a)) : r; }],
      ["grant", (a) => { const r = http.post(`/v1/admin/users/${target.id}/roles`).send({ role: "reviewer" }); return a ? r.set(as(a)) : r; }],
      ["revoke", (a) => { const r = http.delete(`/v1/admin/users/${target.id}/roles/reviewer`); return a ? r.set(as(a)) : r; }],
      ["audit", (a) => { const r = http.get("/v1/admin/audit"); return a ? r.set(as(a)) : r; }],
    ];
    for (const [name, call] of calls) {
      expect([name, (await call()).status]).toEqual([name, 401]);
      for (const refused of [user, instructor, reviewer]) expect([name, (await call(refused)).status]).toEqual([name, 403]);
    }
    expect(await myRoles(target)).toEqual(["user"]); // nothing happened to the target
    for (const [, call] of calls) expect((await call(admin)).status).toBe(200);
  });

  it("takes effect at once with no new token, is idempotent, is audited, and an account can hold several roles", async () => {
    const admin = await makeAdmin();
    const subject = await register("subject");
    const first = roleChangeSchema.parse((await grant(admin, subject.id, { role: "instructor" }).expect(200)).body.data);
    expect(first.roles).toEqual(["user", "instructor"]);
    expect(await myRoles(subject)).toEqual(["user", "instructor"]); // the old token already sees it
    await grant(admin, subject.id, { role: "instructor" }).expect(200);
    const both = (await grant(admin, subject.id, { role: "reviewer" }).expect(200)).body.data;
    expect(both.roles).toEqual(["user", "instructor", "reviewer"]);
    const grants = (await audit(admin)).filter((e) => e.target.email === subject.email);
    expect(grants.map((e) => `${e.action}:${e.role}`).sort()).toEqual(["grant:instructor", "grant:reviewer"]); // the repeat wrote nothing
    expect(grants.every((e) => e.actor.email === admin.email && e.actor.id === admin.id)).toBe(true);
    expect((await revoke(admin, subject.id, "instructor").expect(200)).body.data.roles).toEqual(["user", "reviewer"]);
    await revoke(admin, subject.id, "instructor").expect(200);
    expect((await audit(admin)).filter((e) => e.target.email === subject.email && e.action === "revoke")).toHaveLength(1);
    expect(await myRoles(subject)).toEqual(["user", "reviewer"]);
  });

  it("stops a revoked Admin at once even with a valid token, and never removes the last Admin", async () => {
    await onlyAdminsLeft();
    const x = await makeAdmin("x");
    const y = await makeAdmin("y");
    await http.get("/v1/admin/audit").set(as(y)).expect(200);
    await revoke(x, y.id, "admin").expect(200);
    await http.get("/v1/admin/audit").set(as(y)).expect(403); // the same token, refused at once
    const refusal = await revoke(x, x.id, "admin").expect(409);
    expect(refusal.body.error.details).toMatchObject({ reason: "LAST_ADMIN" });
    expect(await myRoles(x)).toEqual(["user", "admin"]);
    await grant(x, y.id, { role: "admin" }).expect(200);
    await revoke(y, x.id, "admin").expect(200); // two admins: one may step down
    await http.get("/v1/admin/audit").set(as(x)).expect(403);
    await revoke(y, y.id, "admin").expect(409);
    expect(await myRoles(y)).toEqual(["user", "admin"]);
  });

  it("lets an Admin grant themselves a role, audited, but gives no one a way to escalate themselves", async () => {
    const admin = await makeAdmin();
    await grant(admin, admin.id, { role: "reviewer" }).expect(200);
    expect(await myRoles(admin)).toEqual(["user", "reviewer", "admin"]);
    expect((await audit(admin)).some((e) => e.target.id === admin.id && e.actor.id === admin.id && e.role === "reviewer")).toBe(true);
    const plain = await register("plain");
    await grant(plain, plain.id, { role: "admin" }).expect(403);
    expect(await myRoles(plain)).toEqual(["user"]);
  });

  it("reads the legacy admin column through, and clearing admin clears the column too", async () => {
    const admin = await makeAdmin();
    const legacy = await register("legacy");
    await db.query("UPDATE users SET role = 'admin' WHERE id = $1", [legacy.id]);
    expect(await myRoles(legacy)).toEqual(["user", "admin"]);
    await http.get("/v1/admin/audit").set(as(legacy)).expect(200);
    expect((await revoke(admin, legacy.id, "admin").expect(200)).body.data.roles).toEqual(["user"]);
    expect((await db.query("SELECT role FROM users WHERE id = $1", [legacy.id]))[0].role).toBe("user");
    await http.get("/v1/admin/audit").set(as(legacy)).expect(403);
  });

  it("refuses bad input: User cannot be granted or revoked, unknown roles and fields, missing or unknown accounts", async () => {
    const admin = await makeAdmin();
    const target = await register("target");
    for (const body of [{ role: "user" }, { role: "superadmin" }, { role: "admin", extra: true }, {}, { role: 5 }]) await grant(admin, target.id, body).expect(422);
    await revoke(admin, target.id, "user").expect(422);
    await revoke(admin, target.id, "superadmin").expect(422);
    await http.get("/v1/admin/users/lookup").set(as(admin)).expect(422);
    await grant(admin, randomUUID(), { role: "reviewer" }).expect(404);
    await revoke(admin, randomUUID(), "reviewer").expect(404);
    await http.get(`/v1/admin/users/${randomUUID()}/roles`).set(as(admin)).expect(404);
    expect([400, 422]).toContain((await grant(admin, "not-a-uuid", { role: "reviewer" })).status);
    await http.get("/v1/admin/audit?limit=0").set(as(admin)).expect(422);
    await http.get("/v1/admin/audit?beforeId=" + randomUUID()).set(as(admin)).expect(422);
    expect(await myRoles(target)).toEqual(["user"]);
  });

  it("shows an Admin an allow-listed account view, found by email in any case, with no password material", async () => {
    const admin = await makeAdmin();
    const target = await withRole("findme", "reviewer");
    const res = await http.get(`/v1/admin/users/lookup?email=${encodeURIComponent(target.email.toUpperCase())}`).set(as(admin)).expect(200);
    const view = adminUserSchema.parse(res.body.data);
    expect(view).toMatchObject({ id: target.id, email: target.email, roles: ["user", "reviewer"] });
    expect(Object.keys(res.body.data).sort()).toEqual(["createdAt", "displayName", "email", "id", "roles", "status"]);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2|\$argon/i);
    await http.get(`/v1/admin/users/lookup?email=${encodeURIComponent("nobody-" + randomUUID() + "@example.test")}`).set(as(admin)).expect(404);
  });

  it("keeps a complete, ordered audit trail that pages without gaps, cannot be edited, and outlives the accounts in it", async () => {
    const admin = await makeAdmin();
    const a = await register("audit-a");
    const b = await register("audit-b");
    for (const [who, role] of [[a, "instructor"], [b, "reviewer"], [a, "reviewer"], [b, "instructor"]] as const) await grant(admin, who.id, { role }).expect(200);
    await revoke(admin, a.id, "instructor").expect(200);
    const all = await audit(admin);
    for (let i = 1; i < all.length; i++) expect(Date.parse(all[i - 1].at)).toBeGreaterThanOrEqual(Date.parse(all[i].at));
    const paged: string[] = [];
    let cursor = "limit=2";
    for (let guard = 0; guard < 200; guard++) {
      const page = await audit(admin, cursor);
      if (!page.length || paged.length >= all.length) break;
      paged.push(...page.map((e) => e.id));
      const last = page[page.length - 1];
      cursor = `limit=2&before=${encodeURIComponent(last.at)}&beforeId=${last.id}`;
    }
    expect(paged.slice(0, all.length)).toEqual(all.map((e) => e.id)); // no gaps, no repeats, same order (the shared test database can hold more than one page)
    await expect(db.query("UPDATE role_audit SET role = 'reviewer' WHERE id = $1", [all[0].id])).rejects.toThrow(/append-only/);
    await expect(db.query("DELETE FROM role_audit WHERE id = $1", [all[0].id])).rejects.toThrow(/append-only/);
    const before = (await audit(admin)).length;
    await db.query("DELETE FROM users WHERE id = $1", [a.id]); // roles cascade, history stays
    expect((await db.query("SELECT count(*)::int AS n FROM user_roles WHERE user_id = $1", [a.id]))[0].n).toBe(0);
    const after = await audit(admin);
    expect(after).toHaveLength(before);
    expect(after.some((e) => e.target.email === a.email)).toBe(true);
  });

  it("gives no role any access to another person's design, including Admin", async () => {
    const owner = await register("owner");
    const t = getTemplates().find((x) => x.id === "mvp")!;
    const design = (await http.post("/v1/designs").set(as(owner)).send({ schemaVersion: 1, name: t.name, description: t.blurb, source: "template", templateId: t.id, graph: t.graph, traffic: t.traffic }).expect(201)).body.data;
    const admin = await makeAdmin();
    const instructor = await withRole("peek-instructor", "instructor");
    const reviewer = await withRole("peek-reviewer", "reviewer");
    for (const peeker of [admin, instructor, reviewer]) {
      await http.get(`/v1/designs/${design.id}`).set(as(peeker)).expect(403);
      await http.get(`/v1/designs/${design.id}/report`).set(as(peeker)).expect(403);
      await http.get(`/v1/designs/${design.id}/notes`).set(as(peeker)).expect(403);
    }
    await http.get(`/v1/designs/${design.id}`).set(as(owner)).expect(200);
  });

  it("creates one demo account per role in development only, never in production, and keeps existing passwords", async () => {
    await db.query("DELETE FROM users WHERE email LIKE 'demo-%@example.test'");
    await expect(seedDemoAccounts(db, { production: true })).rejects.toThrow(/never created in production/);
    expect((await db.query("SELECT count(*)::int AS n FROM users WHERE email LIKE 'demo-%@example.test'"))[0].n).toBe(0);
    const made = await seedDemoAccounts(db, { production: false });
    const byEmail = Object.fromEntries(made.map((m) => [m.email.split("@")[0], m]));
    expect(byEmail["demo-user"].roles).toEqual(["user"]);
    expect(byEmail["demo-instructor"].roles).toEqual(["user", "instructor"]);
    expect(byEmail["demo-reviewer"].roles).toEqual(["user", "reviewer"]);
    expect(byEmail["demo-admin"].roles).toEqual(["user", "admin"]);
    for (const m of made) {
      expect(m.password).toMatch(/^[A-Za-z0-9_-]{20}$/);
      const login = await http.post("/v1/auth/login").send({ email: m.email, password: m.password }).expect(200);
      expect(await myRoles({ id: "", email: m.email, token: login.body.data.accessToken })).toEqual(m.roles);
    }
    const demoAdmin = await http.post("/v1/auth/login").send({ email: byEmail["demo-admin"].email, password: byEmail["demo-admin"].password }).expect(200);
    await http.get("/v1/admin/audit").set({ Authorization: "Bearer " + demoAdmin.body.data.accessToken }).expect(200);
    const again = await seedDemoAccounts(db, { production: false });
    expect(again.every((m) => m.password === null)).toBe(true);
    expect(again.map((m) => m.roles)).toEqual(made.map((m) => m.roles));
    expect((await db.query("SELECT count(*)::int AS n FROM users WHERE email LIKE 'demo-%@example.test'"))[0].n).toBe(4);
  });

  it("publishes the operations in the live OpenAPI document, identical to the canonical contract", async () => {
    const live = (await http.get("/docs-json").expect(200)).body;
    const canonical = phase3OpenApi().paths as Record<string, unknown>;
    for (const path of ["/v1/account/roles", "/v1/admin/users/lookup", "/v1/admin/users/{id}/roles", "/v1/admin/users/{id}/roles/{role}", "/v1/admin/audit"]) {
      expect(canonical[path]).toBeDefined();
      expect(live.paths[path]).toEqual(canonical[path]);
    }
  });
});
