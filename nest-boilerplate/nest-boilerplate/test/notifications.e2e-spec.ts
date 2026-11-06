import { Test } from "@nestjs/testing";
import { NestExpressApplication } from "@nestjs/platform-express";
import { DataSource } from "typeorm";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { AppModule } from "@/src/app.module";
import { configureApp } from "@/src/app.setup";
import { RedisCacheService } from "@/providers/cache/redis/redis-cache.service";
import { FakeRedisCacheService } from "../test/fake-redis";
import {
  AccountRolesService,
  OPERATOR,
} from "@/modules/roles/account-roles.service";
import { NotificationsService } from "@/modules/notifications/notifications.service";
import {
  notificationsPageSchema,
  NOTIFICATION_KINDS,
} from "@/common/contracts/phase3/notifications.schema";
import { Notifications1794800000000 } from "@/database/migrations/1794800000000-Notifications";

jest.setTimeout(120000);
type Account = { id: string; token: string; email: string };
describe("C notifications: real Postgres, isolated accounts", () => {
  let app: NestExpressApplication,
    db: DataSource,
    http: ReturnType<typeof request>,
    roles: AccountRolesService,
    notices: NotificationsService;
  let a: Account,
    b: Account,
    s: Account,
    t: Account,
    admin: Account,
    ticket: string;
  const auth = (u: Account) => ({ Authorization: "Bearer " + u.token });
  async function account(role?: "support" | "admin") {
    const email = `notice-${randomUUID()}@example.test`;
    const res = await http
      .post("/v1/auth/register")
      .send({
        email,
        password: "Notice-Test-2026!",
        displayName: "PRIVATE NOTIFICATION NAME",
      })
      .expect(201);
    const u = {
      id: res.body.data.user.id,
      token: res.body.data.accessToken,
      email,
    };
    if (role) await roles.grant(OPERATOR, u.id, { role });
    return u;
  }
  const page = async (u: Account, q = "") =>
    notificationsPageSchema.parse(
      (
        await http
          .get("/v1/notifications" + q)
          .set(auth(u))
          .expect(200)
      ).body.data,
    );
  const report = async (u: Account) =>
    (
      await http
        .post("/v1/support/reports")
        .set(auth(u))
        .send({
          category: "bug",
          title: "PRIVATE TITLE " + randomUUID(),
          body: "PRIVATE REPORT BODY not in notifications",
        })
        .expect(201)
    ).body.data.id;
  const reply = (u: Account, internal = false) =>
    http
      .post(`/v1/support/inbox/${ticket}/messages`)
      .set(auth(u))
      .send({ body: "PRIVATE REPLY BODY", internal });
  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RedisCacheService)
      .useValue(new FakeRedisCacheService())
      .compile();
    app = mod.createNestApplication<NestExpressApplication>();
    configureApp(app);
    db = app.get(DataSource);
    await db.runMigrations();
    await app.init();
    http = request(app.getHttpServer());
    roles = app.get(AccountRolesService);
    notices = app.get(NotificationsService);
    a = await account();
    b = await account();
    s = await account("support");
    t = await account("support");
    admin = await account("admin");
  });
  afterAll(async () => {
    await app?.close();
  });
  it("notifies only the active Support team, excluding the actor, when a report is created", async () => {
    const before = (await page(s)).unreadCount;
    ticket = await report(a);
    expect((await page(s)).unreadCount).toBe(before + 1);
    expect(
      (await page(t)).items.some(
        (x) => x.refId === ticket && x.kind === "support_new_report",
      ),
    ).toBe(true);
    expect((await page(a)).items.some((x) => x.refId === ticket)).toBe(false);
    expect((await page(b)).items.some((x) => x.refId === ticket)).toBe(false);
    expect((await page(admin)).items.some((x) => x.refId === ticket)).toBe(
      false,
    );
    const own = await report(s);
    expect((await page(s)).items.some((x) => x.refId === own)).toBe(false);
  });
  it("public replies and status changes notify only the author; internal notes never notify", async () => {
    const before = (await page(a)).unreadCount;
    await reply(s, true).expect(201);
    expect((await page(a)).unreadCount).toBe(before);
    await reply(s).expect(201);
    const items = (await page(a)).items.filter((x) => x.refId === ticket);
    expect(items.map((x) => x.kind).sort()).toEqual([
      "report_status",
      "support_reply",
    ]);
    expect(
      (await page(b)).items.filter((x) => x.refId === ticket),
    ).toHaveLength(0);
    const noChange = (await page(a)).unreadCount;
    await http
      .patch(`/v1/support/inbox/${ticket}`)
      .set(auth(s))
      .send({ status: "in_progress" })
      .expect(200);
    expect((await page(a)).unreadCount).toBe(noChange);
  });
  it("assignments notify the assignee; reporter replies use that agent, or active team when unassigned", async () => {
    const before = (await page(t)).unreadCount;
    await http
      .patch(`/v1/support/inbox/${ticket}`)
      .set(auth(s))
      .send({ assigneeId: t.id })
      .expect(200);
    expect((await page(t)).unreadCount).toBe(before + 1);
    const sBefore = (await page(s)).unreadCount,
      tBefore = (await page(t)).unreadCount;
    await http
      .post(`/v1/support/reports/${ticket}/messages`)
      .set(auth(a))
      .send({ body: "PRIVATE REPORTER MESSAGE" })
      .expect(201);
    expect((await page(s)).unreadCount).toBe(sBefore);
    expect((await page(t)).unreadCount).toBe(tBefore + 1);
    await http
      .patch(`/v1/support/inbox/${ticket}`)
      .set(auth(s))
      .send({ assigneeId: null })
      .expect(200);
    await http
      .post(`/v1/support/reports/${ticket}/messages`)
      .set(auth(a))
      .send({ body: "Another private reply" })
      .expect(201);
    expect((await page(s)).unreadCount).toBe(sBefore + 1);
  });
  it("mark-one/all are own-only, idempotent, authenticated and reject unknown query/body fields", async () => {
    await http.get("/v1/notifications").expect(401);
    const id = (await page(a)).items[0].id;
    for (const suffix of ["read", "open"])
      await http
        .post(`/v1/notifications/${id}/${suffix}`)
        .set(auth(b))
        .expect(404);
    await http.post(`/v1/notifications/${id}/read`).set(auth(a)).expect(200);
    await http.post(`/v1/notifications/${id}/read`).set(auth(a)).expect(200);
    await http.post("/v1/notifications/read-all").set(auth(a)).expect(200);
    expect((await page(a)).unreadCount).toBe(0);
    expect(
      (await http.post("/v1/notifications/read-all").set(auth(a)).expect(200))
        .body.data.updated,
    ).toBe(0);
    await http
      .get("/v1/notifications?userId=" + b.id)
      .set(auth(a))
      .expect(422);
    await http
      .get("/v1/notifications?before=2026-01-01T00:00:00Z")
      .set(auth(a))
      .expect(422);
    await http
      .patch("/v1/notifications/preferences")
      .set(auth(a))
      .send({ kind: "support_reply", muted: true, userId: b.id })
      .expect(422);
  });
  it("per-kind mutes persist, suppress only future matching events and never erase existing ones", async () => {
    const count = (await page(a)).items.filter(
      (x) => x.kind === "support_reply",
    ).length;
    const prefs = (
      await http
        .patch("/v1/notifications/preferences")
        .set(auth(a))
        .send({ kind: "support_reply", muted: true })
        .expect(200)
    ).body.data;
    expect(prefs).toHaveLength(5);
    expect(prefs.find((p: any) => p.kind === "support_reply").muted).toBe(true);
    await reply(s).expect(201);
    expect(
      (await page(a)).items.filter((x) => x.kind === "support_reply"),
    ).toHaveLength(count);
    await http
      .patch("/v1/notifications/preferences")
      .set(auth(a))
      .send({ kind: "support_reply", muted: false })
      .expect(200);
    await reply(s).expect(201);
    expect(
      (await page(a)).items.filter((x) => x.kind === "support_reply"),
    ).toHaveLength(count + 1);
    expect(
      (
        await http.get("/v1/notifications/preferences").set(auth(b)).expect(200)
      ).body.data.every((p: any) => !p.muted),
    ).toBe(true);
  });
  it("stable timestamp/id pagination never duplicates or skips ties, and unread count is not page size", async () => {
    await db.transaction(async (m) => {
      for (let i = 0; i < 25; i++)
        await notices.emit(m, "support_reply", ticket, s.id, [b.id]);
    });
    await db.query(
      "UPDATE notifications SET created_at=date_trunc('day',now()) WHERE user_id=$1",
      [b.id],
    );
    const ids: string[] = [];
    let cursor = "?limit=7", expected = 0;
    do {
      const p = await page(b, cursor);
      expected = p.unreadCount;
      ids.push(...p.items.map((x) => x.id));
      cursor = p.next
        ? `?limit=7&before=${encodeURIComponent(p.next.at)}&beforeId=${p.next.id}`
        : "";
    } while (cursor);
    expect(ids).toHaveLength(25);
    expect(new Set(ids).size).toBe(25);
    expect(expected).toBe(25);
  });
  it("opening checks current access; revoked Support sees unavailable, not report contents", async () => {
    const item = (await page(s)).items.find(
      (x) => x.kind === "support_new_report" && x.refId === ticket,
    )!;
    expect(
      (
        await http
          .post(`/v1/notifications/${item.id}/open`)
          .set(auth(s))
          .expect(200)
      ).body.data.href,
    ).toBe(`/support/${ticket}`);
    await roles.revoke(OPERATOR, s.id, "support");
    const login = await http
      .post("/v1/auth/login")
      .send({ email: s.email, password: "Notice-Test-2026!" })
      .expect(200);
    s.token = login.body.data.accessToken;
    expect(
      (
        await http
          .post(`/v1/notifications/${item.id}/open`)
          .set(auth(s))
          .expect(200)
      ).body.data.href,
    ).toBeNull();
    await http.get(`/v1/support/inbox/${ticket}`).set(auth(s)).expect(403);
    await roles.grant(OPERATOR, s.id, { role: "support" });
  });
  it("events roll back with their originating transaction, including preference filtering", async () => {
    const before = (await page(a)).unreadCount;
    await expect(
      db.transaction(async (m) => {
        await notices.emit(m, "support_reply", ticket, s.id, [a.id]);
        throw Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect((await page(a)).unreadCount).toBe(before);
    const spy = jest
      .spyOn(notices, "team")
      .mockRejectedValueOnce(new Error("notification write unavailable"));
    const [{ n: old }] = await db.query(
      "SELECT count(*)::int AS n FROM support_tickets WHERE author_id=$1",
      [b.id],
    );
    await http
      .post("/v1/support/reports")
      .set(auth(b))
      .send({
        category: "bug",
        title: "Atomic failure " + randomUUID(),
        body: "A valid private report body",
      })
      .expect(500);
    spy.mockRestore();
    expect(
      (
        await db.query(
          "SELECT count(*)::int AS n FROM support_tickets WHERE author_id=$1",
          [b.id],
        )
      )[0].n,
    ).toBe(old);
  });
  it("90-day expiry is ignored on every access and cleaned lazily; account cascade removes rows/preferences", async () => {
    const u = await account();
    await db.transaction((m) =>
      notices.emit(m, "support_reply", ticket, s.id, [u.id]),
    );
    const id = (await page(u)).items[0].id;
    await db.query(
      "UPDATE notifications SET created_at=now()-interval '90 days' WHERE id=$1",
      [id],
    );
    await http.post(`/v1/notifications/${id}/open`).set(auth(u)).expect(404);
    await http.post(`/v1/notifications/${id}/read`).set(auth(u)).expect(404);
    expect((await page(u)).unreadCount).toBe(0);
    expect(
      (await db.query("SELECT id FROM notifications WHERE id=$1", [id])).length,
    ).toBe(0);
    await notices.setPreference(u.id, { kind: "support_reply", muted: true });
    await db.transaction((m) =>
      notices.emit(m, "report_status", ticket, s.id, [u.id]),
    );
    await db.query("DELETE FROM users WHERE id=$1", [u.id]);
    expect(
      await db.query("SELECT id FROM notifications WHERE user_id=$1", [u.id]),
    ).toEqual([]);
    expect(
      await db.query(
        "SELECT kind FROM notification_preferences WHERE user_id=$1",
        [u.id],
      ),
    ).toEqual([]);
  });
  it("stores no text, exposes only allow-listed fields, exports own rows, and refuses lossy rollback", async () => {
    const stored = JSON.stringify(
      await db.query(
        "SELECT row_to_json(n) AS row FROM notifications n WHERE user_id=$1",
        [a.id],
      ),
    );
    expect(stored).not.toContain("PRIVATE TITLE");
    expect(stored).not.toContain("PRIVATE REPLY BODY");
    const columns = await db.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name='notifications' ORDER BY ordinal_position",
    );
    expect(columns.map((x: any) => x.column_name)).toEqual([
      "id",
      "user_id",
      "kind",
      "ref_id",
      "created_at",
      "read_at",
    ]);
    const p = await page(a),
      serialized = JSON.stringify(p);
    for (const privateValue of [
      a.email,
      b.id,
      "PRIVATE TITLE",
      "PRIVATE REPLY BODY",
      "PRIVATE NOTIFICATION NAME",
    ])
      expect(serialized).not.toContain(privateValue);
    for (const row of p.items)
      expect(Object.keys(row).sort()).toEqual([
        "createdAt",
        "id",
        "kind",
        "readAt",
        "refId",
      ]);
    const exported = (
      await http.get("/v1/account/export").set(auth(a)).expect(200)
    ).body.data;
    expect(exported.notifications.map((x: any) => x.id).sort()).toEqual(
      p.items.map((x) => x.id).sort(),
    );
    expect(exported.notificationPreferences).toHaveLength(
      NOTIFICATION_KINDS.length,
    );
    const q = db.createQueryRunner();
    await q.connect();
    try {
      await expect(new Notifications1794800000000().down(q)).rejects.toThrow(
        "refuses",
      );
    } finally {
      await q.release();
    }
  });
  it("concurrent tabs can clean the same expired rows without failing or touching another account", async () => {
    const u = await account();
    await db.query(
      "INSERT INTO notifications(user_id,kind,ref_id,created_at) SELECT $1,'support_reply',$2,now()-interval '91 days' FROM generate_series(1,80)",
      [u.id, ticket],
    );
    const before = (await page(a)).items.map((x) => x.id).sort();
    const replies = await Promise.all(
      Array.from({ length: 6 }, () =>
        http.get("/v1/notifications").set(auth(u)),
      ),
    );
    expect(replies.map((r) => r.status)).toEqual(Array(6).fill(200));
    for (const r of replies) expect(r.body.data.unreadCount).toBe(0);
    expect((await page(a)).items.map((x) => x.id).sort()).toEqual(before);
  });
  it("migration up/down round-trips an empty isolated schema and preserves populated rows", async () => {
    const database = process.env.DB_TEST_DATABASE ?? "";
    if (db.options.database !== database || !/(test|e2e)/i.test(database))
      throw Error("Isolated migration target required");
    const schema =
      "sf_notification_migration_" +
      randomUUID().replaceAll("-", "").slice(0, 8);
    if (!/^sf_notification_migration_[a-f0-9]{8}$/.test(schema))
      throw Error("Unsafe schema");
    const q = db.createQueryRunner();
    await q.connect();
    try {
      await q.query(`CREATE SCHEMA "${schema}"`);
      await q.query(`SET search_path TO "${schema}",public`);
      await q.query("CREATE TABLE users(id uuid PRIMARY KEY)");
      await q.query("CREATE TABLE support_tickets(id uuid PRIMARY KEY)");
      const migration = new Notifications1794800000000();
      await migration.up(q);
      await migration.down(q);
      await migration.up(q);
      const uid = randomUUID(),
        ref = randomUUID();
      await q.query("INSERT INTO users VALUES($1)", [uid]);
      await q.query("INSERT INTO support_tickets VALUES($1)", [ref]);
      await q.query(
        "INSERT INTO notifications(user_id,kind,ref_id) VALUES($1,'support_reply',$2)",
        [uid, ref],
      );
      await expect(migration.down(q)).rejects.toThrow("refuses");
      expect(
        (await q.query("SELECT count(*)::int AS n FROM notifications"))[0].n,
      ).toBe(1);
    } finally {
      await q.query("SET search_path TO public");
      await q.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await q.release();
    }
  });
});
