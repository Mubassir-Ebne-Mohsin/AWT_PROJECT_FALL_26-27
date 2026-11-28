import { Test } from "@nestjs/testing";
import { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { DataSource } from "typeorm";
import { randomUUID } from "node:crypto";
import { AppModule } from "@/src/app.module";
import { configureApp, setupSwagger } from "@/src/app.setup";
import { RedisCacheService } from "@/providers/cache/redis/redis-cache.service";
import { FakeRedisCacheService } from "../test/fake-redis";
import {
  AccountRolesService,
  OPERATOR,
} from "@/modules/roles/account-roles.service";
import { roleDirectorySchema } from "@/common/contracts/phase3/roles.schema";
import { phase3OpenApi } from "@/common/contracts/phase3/openapi";
import { dataSourceOptions } from "@/config/database.config";
Object.assign(dataSourceOptions.extra,{connectionTimeoutMillis:15000,statement_timeout:30000,query_timeout:32000});
jest.setTimeout(120000);
type Member = { id: string; token: string };
describe("Admin role-holder directory (isolated Postgres)", () => {
  let app: NestExpressApplication,
    db: DataSource,
    http: ReturnType<typeof request>,
    roles: AccountRolesService,
    admin: Member,
    instructor: Member,
    support: Member,
    reviewer: Member,
    plain: Member,
    legacy: Member,
    multi: Member;
  const as = (u: Member) => ({ Authorization: "Bearer " + u.token });
  async function user(name: string) {
    const res = await http
      .post("/v1/auth/register")
      .send({
        email: name + randomUUID() + "@example.test",
        displayName: name,
        password: "Directory-2026!",
      })
      .expect(201);
    return { id: res.body.data.user.id, token: res.body.data.accessToken };
  }
  beforeAll(async () => {
    const m = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RedisCacheService)
      .useValue(new FakeRedisCacheService())
      .compile();
    app = m.createNestApplication<NestExpressApplication>();
    configureApp(app);
    db = app.get(DataSource);
    await db.runMigrations();
    // Dedicated disposable database only; isolate from other suites' fixture accounts.
    await db.query('TRUNCATE TABLE "users" CASCADE');
    setupSwagger(app);
    await app.init();
    http = request(app.getHttpServer());
    roles = app.get(AccountRolesService);
    admin = await user("directory-admin");
    instructor = await user("directory-instructor");
    support = await user("directory-support");
    reviewer = await user("directory-reviewer");
    plain = await user("directory-plain");
    legacy = await user("directory-legacy");
    multi = await user("directory-multi");
    for (const [u, role] of [
      [admin, "admin"],
      [instructor, "instructor"],
      [support, "support"],
      [reviewer, "reviewer"],
      [multi, "instructor"],
      [multi, "support"],
    ] as const)
      await roles.grant(OPERATOR, u.id, { role });
    await db.query("UPDATE users SET role='admin' WHERE id=$1", [legacy.id]);
    await roles.suspend(
      { id: admin.id, email: "admin@example.test" },
      support.id,
    );
    // Precision and same-time ties must not skip/duplicate accounts across pages.
    await db.query("UPDATE users SET created_at='2026-11-26T00:00:00.123456Z'");
  });
  afterAll(async () => {
    await app?.close();
  });
  it("requires authentication and live Admin permission", async () => {
    await http.get("/v1/admin/users/privileged").expect(401);
    for (const u of [plain, instructor, reviewer])
      await http.get("/v1/admin/users/privileged").set(as(u)).expect(403);
    await http.get("/v1/admin/users/privileged").set(as(legacy)).expect(200);
  });
  it("includes explicit/legacy roles once, excludes ordinary/reviewer-only accounts, and exposes no private content", async () => {
    const res = await http
        .get("/v1/admin/users/privileged")
        .set(as(admin))
        .expect(200),
      page = roleDirectorySchema.parse(res.body.data);
    expect(new Set(page.items.map((u) => u.id))).toEqual(
      new Set([admin.id, instructor.id, support.id, legacy.id, multi.id]),
    );
    expect(page.items.find((u) => u.id === support.id)?.status).toBe(
      "suspended",
    );
    expect(page.items.find((u) => u.id === legacy.id)?.roles).toContain(
      "admin",
    );
    for (const u of page.items)
      expect(Object.keys(u).sort()).toEqual([
        "createdAt",
        "displayName",
        "email",
        "id",
        "roles",
        "status",
      ]);
    expect(page.next).toBeNull();
  });
  it("filters by actual current role, including legacy Admin membership", async () => {
    for (const [role, ids] of [
      ["admin", [admin.id, legacy.id]],
      ["instructor", [instructor.id, multi.id]],
      ["support", [support.id, multi.id]],
    ] as const) {
      const res = await http
        .get("/v1/admin/users/privileged?role=" + role)
        .set(as(admin))
        .expect(200);
      expect(
        new Set(res.body.data.items.map((u: { id: string }) => u.id)),
      ).toEqual(new Set(ids));
    }
  });
  it("pages tied timestamps without repeats or omissions and validates query input", async () => {
    const ids: string[] = [];
    let cursor: { at: string; id: string } | null = null;
    do {
      const p = new URLSearchParams({ limit: "2" });
      if (cursor) {
        p.set("before", cursor.at);
        p.set("beforeId", cursor.id);
      }
      const res = await http
        .get("/v1/admin/users/privileged?" + p)
        .set(as(admin))
        .expect(200);
      const page = roleDirectorySchema.parse(res.body.data);
      expect(page.items.length).toBeLessThanOrEqual(2);
      ids.push(...page.items.map((u) => u.id));
      cursor = page.next;
    } while (cursor);
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
    expect(ids).toEqual([...ids].sort().reverse());
    for (const q of [
      "role=reviewer",
      "role=user",
      "limit=21",
      "limit=0",
      "before=invalid",
      "beforeId=" + admin.id,
      "before=2026-11-26T00%3A00%3A00Z",
      "unknown=x",
    ])
      await http
        .get("/v1/admin/users/privileged?" + q)
        .set(as(admin))
        .expect(422);
  });
  it("removes a last-role holder immediately, retaining the account and its audit history", async () => {
    await roles.revoke(OPERATOR, instructor.id, "instructor");
    const res = await http
      .get("/v1/admin/users/privileged")
      .set(as(admin))
      .expect(200);
    expect(res.body.data.items.map((u: { id: string }) => u.id)).not.toContain(
      instructor.id,
    );
    expect(
      await db.query("SELECT id FROM users WHERE id=$1", [instructor.id]),
    ).toHaveLength(1);
    expect(
      (
        await db.query("SELECT id FROM role_audit WHERE target_id=$1", [
          instructor.id,
        ])
      ).length,
    ).toBeGreaterThan(0);
  });
  it("registers the contract and rejects a former Admin's unchanged token", async () => {
    expect(phase3OpenApi().paths).toHaveProperty("/v1/admin/users/privileged");
    const spec = (await http.get("/docs-json").expect(200)).body;
    expect(spec.paths).toHaveProperty("/v1/admin/users/privileged");
    await roles.revoke(OPERATOR, admin.id, "admin");
    await http.get("/v1/admin/users/privileged").set(as(admin)).expect(403);
  });
});
