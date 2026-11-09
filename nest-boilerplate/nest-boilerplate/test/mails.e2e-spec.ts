import { Test } from "@nestjs/testing";
import { NestExpressApplication } from "@nestjs/platform-express";
import { DataSource } from "typeorm";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { AppModule } from "@/src/app.module";
import { configureApp } from "@/src/app.setup";
import { RedisCacheService } from "@/providers/cache/redis/redis-cache.service";
import { FakeRedisCacheService } from "../test/fake-redis";
import { MailOutboxService } from "@/modules/mails/mail-outbox.service";
import type { MailMessage, MailSender } from "@/modules/mails/mail-sender";
import { NotificationEmails1795000000000 } from "@/database/migrations/1795000000000-NotificationEmails";

jest.setTimeout(120000);

class FakeSender implements MailSender {
  sent: MailMessage[] = [];
  failWith: (Error & { code?: string }) | null = null;
  async send(m: MailMessage) {
    if (this.failWith) throw this.failWith;
    this.sent.push(m);
  }
}

describe("mailer outbox: real Postgres, fake mail server", () => {
  let app: NestExpressApplication;
  let db: DataSource;
  let http: ReturnType<typeof request>;
  let sender: FakeSender;
  let outbox: MailOutboxService;
  const options = { from: "x", hourlyLimit: 3, frontendUrl: "http://localhost:3000" };

  async function account() {
    const email = "mail-" + randomUUID() + "@example.test";
    const res = await http.post("/v1/auth/register").send({ email, password: "Mailer-Only-2026!", displayName: "PRIVATE NAME" }).expect(201);
    return { id: res.body.data.user.id as string, email };
  }
  async function ticket(authorId: string) {
    const [t] = await db.query(
      "INSERT INTO support_tickets(author_id,category,title,body,context,created_at,updated_at,last_user_activity_at) VALUES($1,'bug','PRIVATE TITLE','PRIVATE BODY','{}',now(),now(),now()) RETURNING id,ref",
      [authorId],
    );
    return t as { id: string; ref: number };
  }
  async function notify(userId: string, kind: string, refId: string) {
    const [n] = await db.query("INSERT INTO notifications(user_id,kind,ref_id) VALUES($1,$2,$3) RETURNING id", [userId, kind, refId]);
    return n.id as string;
  }
  const status = async (id: string) => (await db.query("SELECT * FROM notification_emails WHERE notification_id=$1", [id]))[0];

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RedisCacheService)
      .useValue(new FakeRedisCacheService())
      .compile();
    app = mod.createNestApplication<NestExpressApplication>();
    configureApp(app);
    db = app.get(DataSource);
    await db.runMigrations();
    await app.listen(0, "127.0.0.1");
    http = request(app.getHttpServer());
  });
  beforeEach(async () => {
    sender = new FakeSender();
    outbox = new MailOutboxService(db, sender, options);
    // Earlier tests leave fresh notifications behind; this file only wants its own.
    await db.query("DELETE FROM notification_emails");
    await db.query("UPDATE notifications SET created_at = now() - interval '2 days' WHERE created_at > now() - interval '1 hour'");
  });
  afterAll(async () => {
    if (app) await app.close();
  });

  it("mails the reporter once for a reply, with no report text, and records it", async () => {
    const u = await account();
    const t = await ticket(u.id);
    const id = await notify(u.id, "support_reply", t.id);
    expect(await outbox.runOnce()).toMatchObject({ sent: 1 });
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0].to).toBe(u.email);
    expect(sender.sent[0].subject).toBe(`Support replied to your report SF-${t.ref}`);
    expect(JSON.stringify(sender.sent[0])).not.toMatch(/PRIVATE/);
    expect(sender.sent[0].text).toContain(`/reports/${t.id}`);
    expect((await status(id)).status).toBe("sent");
    await outbox.runOnce();
    expect(sender.sent).toHaveLength(1);
  });

  it("does not mail staff-facing kinds, old notifications or suspended accounts", async () => {
    const u = await account();
    const t = await ticket(u.id);
    await notify(u.id, "support_new_report", t.id);
    await notify(u.id, "reporter_reply", t.id);
    await notify(u.id, "support_assigned", t.id);
    const old = await notify(u.id, "support_reply", t.id);
    await db.query("UPDATE notifications SET created_at = now() - interval '3 hours' WHERE id=$1", [old]);
    const s = await account();
    const st = await ticket(s.id);
    await notify(s.id, "report_status", st.id);
    await db.query("UPDATE users SET account_status='suspended' WHERE id=$1", [s.id]);
    expect(await outbox.runOnce()).toMatchObject({ sent: 0 });
    expect(sender.sent).toHaveLength(0);
  });

  it("retries a failing server three times, then gives up, and never throws", async () => {
    const u = await account();
    const t = await ticket(u.id);
    const id = await notify(u.id, "report_status", t.id);
    sender.failWith = Object.assign(new Error("smtp password in this message"), { code: "ECONNREFUSED" });
    expect(await outbox.runOnce()).toMatchObject({ retry: 1 });
    expect((await status(id)).status).toBe("retry");
    expect(await outbox.runOnce()).toMatchObject({ retry: 1 });
    expect(await outbox.runOnce()).toMatchObject({ failed: 1 });
    const row = await status(id);
    expect(row).toMatchObject({ status: "failed", attempts: 3, last_error_code: "ECONNREFUSED" });
    expect(JSON.stringify(row)).not.toContain("password");
    sender.failWith = null;
    await outbox.runOnce();
    expect(sender.sent).toHaveLength(0);
  });

  it("recovers when the server comes back before the last attempt", async () => {
    const u = await account();
    const t = await ticket(u.id);
    const id = await notify(u.id, "support_reply", t.id);
    sender.failWith = new Error("down");
    await outbox.runOnce();
    sender.failWith = null;
    expect(await outbox.runOnce()).toMatchObject({ sent: 1 });
    expect((await status(id)).status).toBe("sent");
  });

  it("skips emails beyond the hourly cap for one account", async () => {
    const u = await account();
    const t = await ticket(u.id);
    for (let i = 0; i < 5; i++) await notify(u.id, "support_reply", t.id);
    expect(await outbox.runOnce()).toMatchObject({ sent: 3, skipped: 2 });
    expect(sender.sent).toHaveLength(3);
  });

  it("is switched off by default: the app runs without the mail module and adds no job", async () => {
    expect(() => app.get(MailOutboxService, { strict: false })).toThrow();
  });

  it("migration round-trips and the table refuses invalid statuses", async () => {
    await expect(db.query("INSERT INTO notification_emails(notification_id,status) VALUES(gen_random_uuid(),'sent')")).rejects.toThrow();
    const u = await account();
    const t = await ticket(u.id);
    const id = await notify(u.id, "support_reply", t.id);
    await expect(db.query("INSERT INTO notification_emails(notification_id,status) VALUES($1,'bogus')", [id])).rejects.toThrow();
    const qr = db.createQueryRunner();
    await qr.connect();
    try {
      const m = new NotificationEmails1795000000000();
      await m.down(qr);
      expect((await qr.query("SELECT to_regclass('notification_emails') AS t"))[0].t).toBeNull();
      await m.up(qr);
      expect((await qr.query("SELECT to_regclass('notification_emails') AS t"))[0].t).not.toBeNull();
    } finally {
      await qr.release();
    }
  });
});
