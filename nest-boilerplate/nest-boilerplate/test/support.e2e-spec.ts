import { Test } from "@nestjs/testing";
import { NestExpressApplication } from "@nestjs/platform-express";
import { DataSource } from "typeorm";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { AppModule } from "@/src/app.module";
import { configureApp, setupSwagger } from "@/src/app.setup";
import { RedisCacheService } from "@/providers/cache/redis/redis-cache.service";
import { FakeRedisCacheService } from "../test/fake-redis";
import { dataSourceOptions } from "@/config/database.config";
import { AccountRolesService, OPERATOR } from "@/modules/roles/account-roles.service";
import { getTemplates } from "@/modules/simulation/engine/templates";
import { inboxDetailSchema, inboxPageSchema, reportDetailSchema, reportListSchema } from "@/common/contracts/phase3/support.schema";
import { accountExportSchema } from "@/common/contracts/phase3/account.schema";

// Support role and problem reports (docs/SUPPORT-SYSTEM-SCOPE.md) on the real application and PostgreSQL. No AI is involved.
jest.setTimeout(180000);
type Account = { id: string; email: string; token: string; name: string };
const PASSWORD = "Support-2026!";

describe("Support role and problem reports (isolated Postgres, no AI)", () => {
  let app: NestExpressApplication, db: DataSource, http: ReturnType<typeof request>, roles: AccountRolesService;
  const as = (a: Account) => ({ Authorization: "Bearer " + a.token });
  const TAG = randomUUID().slice(0, 8);
  let n = 0;

  async function register(label: string): Promise<Account> {
    const name = `${label}-${TAG}-${++n}`;
    const email = `${name}@example.test`;
    const res = await http.post("/v1/auth/register").send({ email, password: PASSWORD, displayName: name }).expect(201);
    return { id: res.body.data.user.id, email, token: res.body.data.accessToken, name };
  }
  async function withRole(label: string, role: "support" | "admin" | "reviewer" | "instructor") {
    const a = await register(label);
    await roles.grant(OPERATOR, a.id, { role });
    return a;
  }
  const report = (a: Account, over: Record<string, unknown> = {}) =>
    http.post("/v1/support/reports").set(as(a)).send({ category: "bug", title: "Title " + randomUUID().slice(0, 8), body: "Something went wrong when I pressed run.", ...over });
  const made = async (a: Account, over: Record<string, unknown> = {}) => reportDetailSchema.parse((await report(a, over).expect(201)).body.data);
  const inbox = async (s: Account, query = "") => inboxPageSchema.parse((await http.get("/v1/support/inbox" + query).set(as(s)).expect(200)).body.data);
  const detail = async (s: Account, id: string) => inboxDetailSchema.parse((await http.get(`/v1/support/inbox/${id}`).set(as(s)).expect(200)).body.data);
  const reply = (s: Account, id: string, body: string, internal = false) => http.post(`/v1/support/inbox/${id}/messages`).set(as(s)).send({ body, internal });
  const patch = (s: Account, id: string, body: Record<string, unknown>) => http.patch(`/v1/support/inbox/${id}`).set(as(s)).send(body);
  const ticket = async (id: string) => (await db.query("SELECT * FROM support_tickets WHERE id = $1", [id]))[0];

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
    // This database is kept between runs, so start from no Support accounts left over: the agents list is capped at 200.
    await db.query("DELETE FROM user_roles WHERE role = 'support'");
  });
  afterAll(async () => {
    await app?.close();
  });

  describe("who can do what", () => {
    it("any signed-in account can report; anonymous cannot", async () => {
      await http.post("/v1/support/reports").send({}).expect(401);
      await http.get("/v1/support/reports").expect(401);
      const user = await register("plain");
      const r = await made(user);
      expect(r.code).toMatch(/^SF-\d{4,}$/);
      expect(r.status).toBe("open");
      expect(r.priority).toBe("normal");
    });

    it("the inbox is Support only: a plain user, Instructor, Reviewer and an Admin without Support are all refused", async () => {
      const user = await register("plain");
      const r = await made(user);
      const others = [user, await withRole("instructor", "instructor"), await withRole("reviewer", "reviewer"), await withRole("adminonly", "admin")];
      for (const who of others) {
        await http.get("/v1/support/inbox").set(as(who)).expect(403);
        await http.get(`/v1/support/inbox/${r.id}`).set(as(who)).expect(403);
        await http.get("/v1/support/agents").set(as(who)).expect(403);
        await http.post(`/v1/support/inbox/${r.id}/read`).set(as(who)).expect(403);
        await reply(who, r.id, "hello").expect(403);
        await patch(who, r.id, { status: "resolved" }).expect(403);
      }
      await http.get("/v1/support/inbox").expect(401);
    });

    it("Support gains nothing else: no admin tools, no audit log, no other person's design", async () => {
      const support = await withRole("support", "support");
      await http.get("/v1/admin/users?q=ab").set(as(support)).expect(403);
      await http.get("/v1/admin/audit").set(as(support)).expect(403);
      await http.get("/v1/admin/metrics").set(as(support)).expect(403);
      const owner = await register("owner");
      const t = getTemplates().find((x) => x.id === "mvp")!;
      const design = (await http.post("/v1/designs").set(as(owner)).send({ schemaVersion: 1, name: t.name, description: t.blurb, source: "template", templateId: t.id, graph: t.graph, traffic: t.traffic }).expect(201)).body.data;
      expect((await http.get(`/v1/designs/${design.id}`).set(as(support))).status).toBeGreaterThanOrEqual(403);
      expect((await http.get(`/v1/designs/${design.id}/report`).set(as(support))).status).toBeGreaterThanOrEqual(403);
    });

    it("granting Support through the Admin tools works, is audited, and revoking it removes the inbox on the very next call", async () => {
      const admin = await withRole("boss", "admin");
      const person = await register("future");
      await http.get("/v1/support/inbox").set(as(person)).expect(403);
      await http.post(`/v1/admin/users/${person.id}/roles`).set(as(admin)).send({ role: "support" }).expect(200);
      expect((await http.get("/v1/account/roles").set(as(person)).expect(200)).body.data.roles).toEqual(["user", "support"]);
      await http.get("/v1/support/inbox").set(as(person)).expect(200);
      const trail = (await http.get("/v1/admin/audit?limit=20").set(as(admin)).expect(200)).body.data as Array<{ action: string; role: string; target: { id: string } }>;
      expect(trail.some((e) => e.action === "grant" && e.role === "support" && e.target.id === person.id)).toBe(true);
      await http.delete(`/v1/admin/users/${person.id}/roles/support`).set(as(admin)).expect(200);
      // Same token, no re-login: the role is read from the database on every call.
      const refreshed = await http.post("/v1/auth/login").send({ email: person.email, password: PASSWORD }).expect(200);
      await http.get("/v1/support/inbox").set({ Authorization: "Bearer " + refreshed.body.data.accessToken }).expect(403);
      // The Admin role still does not reach the inbox.
      await http.get("/v1/support/inbox").set(as(admin)).expect(403);
    });
  });

  describe("writing a report", () => {
    it("keeps the context it is given and nothing else, and refuses anything that could carry a secret", async () => {
      const user = await register("ctx");
      const ok = await made(user, { context: { page: "/designs/abc/results", app: "1.0.0", browser: "Mozilla/5.0 Test", screen: { width: 1024, height: 768 }, at: new Date().toISOString(), errorId: "req-1234-abcd" } });
      expect(ok.context).toMatchObject({ page: "/designs/abc/results", app: "1.0.0", screen: { width: 1024, height: 768 } });
      expect(Object.keys((await made(user, { context: {} })).context)).toEqual([]);
      const bad: Array<[string, Record<string, unknown>]> = [
        ["a token field", { context: { token: "eyJhbGciOi" } }],
        ["cookies", { context: { cookies: "sf_refresh=abc" } }],
        ["a query string on the page", { context: { page: "/reset?token=abc" } }],
        ["a fragment on the page", { context: { page: "/x#access_token=abc" } }],
        ["a full address", { context: { page: "http://evil.test/x" } }],
        ["spaces in the page", { context: { page: "/a b" } }],
        ["a bad error id", { context: { errorId: "<script>" } }],
        ["a huge screen", { context: { screen: { width: 99999, height: 1 } } }],
        ["a nested extra key", { context: { screen: { width: 1, height: 1, dpr: 2 } } }],
        ["an extra top-level key", { role: "admin" }],
        ["an assignee", { assigneeId: randomUUID() }],
        ["a status", { status: "resolved" }],
      ];
      for (const [what, over] of bad) {
        const res = await report(user, { title: "Bad " + what, ...over });
        expect([what, res.status]).toEqual([what, 422]);
      }
    });

    it("bounds and cleans the text: lengths, control characters and NUL are refused; tabs and new lines are kept", async () => {
      const user = await register("text");
      const refused: Array<[string, Record<string, unknown>]> = [
        ["a title of 2 characters", { title: "ab" }],
        ["a title of 121 characters", { title: "x".repeat(121) }],
        ["a blank title", { title: "    " }],
        ["a short body", { body: "too short" }],
        ["a body over 4000", { body: "x".repeat(4001) }],
        ["an expected over 2000", { expected: "x".repeat(2001) }],
        ["a NUL in the body", { body: "hello there\u0000 world" }],
        ["a control character in the title", { title: "bad\u0007title" }],
        ["an unknown category", { category: "hack" }],
      ];
      for (const [what, over] of refused) expect([what, (await report(user, over)).status]).toEqual([what, 422]);
      const kept = await made(user, { body: "line one\nline two\twith a tab, long enough", expected: "  works  " });
      expect(kept.body).toBe("line one\nline two\twith a tab, long enough");
      expect(kept.expected).toBe("works");
    });

    it("stores hostile text exactly as written, and the API never turns it into anything else", async () => {
      const user = await register("hostile");
      const body = `<script>alert("x")</script> <img src=x onerror=alert(1)> {{7*7}} '; DROP TABLE support_tickets;-- \${process.env.SECRET}`;
      const title = `<b>bold</b> & "quotes" ${randomUUID().slice(0, 6)}`;
      const r = await made(user, { title, body });
      expect(r.title).toBe(title);
      expect(r.body).toBe(body);
      expect((await db.query("SELECT count(*)::int AS n FROM support_tickets"))[0].n).toBeGreaterThan(0);
      const support = await withRole("support", "support");
      const seen = await detail(support, r.id);
      expect(seen.body).toBe(body);
      expect(seen.title).toBe(title);
    });

    it("limits an account to 5 reports an hour on the server, even when they arrive at the same time, and does not limit anyone else", async () => {
      const spammer = await register("spammer");
      const burst = await Promise.all(Array.from({ length: 8 }, (_, i) => report(spammer, { title: "Burst " + i + " " + TAG })));
      const statuses = burst.map((r) => r.status).sort();
      expect(statuses.filter((s) => s === 201)).toHaveLength(5);
      expect(statuses.filter((s) => s === 429)).toHaveLength(3);
      const limited = burst.find((r) => r.status === 429)!;
      expect(limited.body.error.details).toMatchObject({ reason: "REPORTS_PER_HOUR" });
      expect(limited.body.error.details.retryAfterSeconds).toBeGreaterThan(0);
      expect((await db.query("SELECT count(*)::int AS n FROM support_tickets WHERE author_id = $1", [spammer.id]))[0].n).toBe(5);
      const other = await register("other");
      await made(other);
    });

    it("limits an account to 20 reports a day", async () => {
      const heavy = await register("heavy");
      // Twenty earlier reports from a few hours ago, so the hourly limit is not what stops the next ones.
      for (let i = 0; i < 20; i++)
        await db.query(
          `INSERT INTO support_tickets (author_id, category, title, body, context, created_at, updated_at, last_user_activity_at) VALUES ($1,'bug',$2,'Older report body text.','{}'::jsonb, now() - interval '5 hours', now() - interval '5 hours', now() - interval '5 hours')`,
          [heavy.id, "Older " + i],
        );
      const res = await report(heavy).expect(429);
      expect(res.body.error.details.reason).toBe("REPORTS_PER_DAY");
    });

    it("warns once about an open report with the same title (any capitalisation), and lets the person send it anyway", async () => {
      const user = await register("dup");
      const title = "Run button does nothing " + TAG;
      const first = await made(user, { title });
      const dup = await report(user, { title: title.toUpperCase() }).expect(409);
      expect(dup.body.error.details).toMatchObject({ reason: "DUPLICATE_OPEN", code: first.code });
      await made(user, { title: title.toUpperCase(), confirmDuplicate: true });
      // A different person with the same title is not a duplicate.
      await made(await register("dup2"), { title });
      // A resolved report is not an open duplicate.
      const support = await withRole("support", "support");
      const solo = await register("dup3");
      const t = "Another title " + TAG;
      const a = await made(solo, { title: t });
      await patch(support, a.id, { status: "resolved" }).expect(200);
      await made(solo, { title: t });
    });
  });

  describe("the author's own view", () => {
    it("lists and opens only their own reports; someone else's, and one that does not exist, look the same", async () => {
      const a = await register("a");
      const b = await register("b");
      const ra = await made(a);
      const rb = await made(b);
      const mine = reportListSchema.parse((await http.get("/v1/support/reports").set(as(a)).expect(200)).body.data);
      expect(mine.map((r) => r.id)).toEqual([ra.id]);
      await http.get(`/v1/support/reports/${rb.id}`).set(as(a)).expect(404);
      await http.get(`/v1/support/reports/${randomUUID()}`).set(as(a)).expect(404);
      await http.post(`/v1/support/reports/${rb.id}/messages`).set(as(a)).send({ body: "I am not the author" }).expect(404);
      await http.get("/v1/support/reports/not-a-uuid").set(as(a)).expect(422);
      expect((await ticket(rb.id)).status).toBe("open");
      expect((await db.query("SELECT count(*)::int AS n FROM support_messages WHERE ticket_id = $1", [rb.id]))[0].n).toBe(0);
    });

    it("never shows an internal note, on any route or with any query", async () => {
      const user = await register("notes");
      const support = await withRole("support", "support");
      const r = await made(user);
      const SECRET_NOTE = "INTERNAL-ONLY " + randomUUID();
      const PUBLIC = "Public answer " + randomUUID();
      await reply(support, r.id, SECRET_NOTE, true).expect(201);
      await reply(support, r.id, PUBLIC, false).expect(201);
      const urls = [`/v1/support/reports/${r.id}`, `/v1/support/reports/${r.id}?internal=true`, `/v1/support/reports/${r.id}?include=notes&all=1`, "/v1/support/reports", "/v1/account/export"];
      for (const url of urls) {
        const body = JSON.stringify((await http.get(url).set(as(user)).expect(200)).body);
        expect([url, body.includes("INTERNAL-ONLY")]).toEqual([url, false]);
      }
      const threadOf = (await http.get(`/v1/support/reports/${r.id}`).set(as(user)).expect(200)).body.data.messages as Array<{ from: string; body: string }>;
      expect(threadOf).toEqual([expect.objectContaining({ from: "support", body: PUBLIC })]);
      const posted = await http.post(`/v1/support/reports/${r.id}/messages`).set(as(user)).send({ body: "Thanks", internal: true });
      expect(posted.status).toBe(422);
      const seen = await detail(support, r.id);
      expect(seen.messages.map((m) => m.kind)).toEqual(["note", "support"]);
      expect(seen.messages[0].body).toBe(SECRET_NOTE);
      // The Support reply never names the person who wrote it to the author.
      expect(JSON.stringify(threadOf)).not.toContain(support.name);
    });

    it("moves through its states: Support replies, the author answers, it is resolved, reopened inside 14 days and not after", async () => {
      const user = await register("flow");
      const support = await withRole("support", "support");
      const r = await made(user);
      expect((await ticket(r.id)).first_response_at).toBeNull();
      await reply(support, r.id, "Looking into it.").expect(201);
      let seen = await detail(support, r.id);
      expect(seen.status).toBe("in_progress");
      expect((await ticket(r.id)).first_response_at).not.toBeNull();
      await patch(support, r.id, { status: "waiting" }).expect(200);
      let own = reportDetailSchema.parse((await http.post(`/v1/support/reports/${r.id}/messages`).set(as(user)).send({ body: "Here is more detail." }).expect(201)).body.data);
      expect(own.status).toBe("open");
      expect(own.messages.map((m) => m.from)).toEqual(["support", "you"]);
      await patch(support, r.id, { status: "resolved" }).expect(200);
      let row = await ticket(r.id);
      expect(row.resolved_at).not.toBeNull();
      own = reportDetailSchema.parse((await http.get(`/v1/support/reports/${r.id}`).set(as(user)).expect(200)).body.data);
      expect(own.status).toBe("resolved");
      expect(new Date(own.reopenUntil!).getTime() - Date.now()).toBeGreaterThan(13.9 * 86400000);
      own = reportDetailSchema.parse((await http.post(`/v1/support/reports/${r.id}/messages`).set(as(user)).send({ body: "It happened again." }).expect(201)).body.data);
      expect([own.status, own.resolvedAt, own.reopenUntil]).toEqual(["open", null, null]);
      expect((await ticket(r.id)).resolved_at).toBeNull();
      await patch(support, r.id, { status: "resolved" }).expect(200);
      await db.query("UPDATE support_tickets SET resolved_at = now() - interval '15 days' WHERE id = $1", [r.id]);
      own = reportDetailSchema.parse((await http.get(`/v1/support/reports/${r.id}`).set(as(user)).expect(200)).body.data);
      expect(own.reopenUntil).toBeNull();
      const late = await http.post(`/v1/support/reports/${r.id}/messages`).set(as(user)).send({ body: "Too late?" }).expect(409);
      expect(late.body.error.details.reason).toBe("REOPEN_WINDOW_PASSED");
      row = await ticket(r.id);
      expect(row.status).toBe("resolved");
      seen = await detail(support, r.id);
      expect(seen.messages.filter((m) => m.kind === "user")).toHaveLength(2);
    });

    it("limits an account's messages to 30 an hour", async () => {
      const user = await register("chatty");
      const r = await made(user);
      for (let i = 0; i < 30; i++) await http.post(`/v1/support/reports/${r.id}/messages`).set(as(user)).send({ body: "message " + i }).expect(201);
      const res = await http.post(`/v1/support/reports/${r.id}/messages`).set(as(user)).send({ body: "one more" }).expect(429);
      expect(res.body.error.details.reason).toBe("MESSAGES_PER_HOUR");
    });
  });

  describe("the Support inbox", () => {
    it("lists newest first, pages by cursor without gaps or repeats, and filters by every field", async () => {
      const support = await withRole("support", "support");
      const agent2 = await withRole("support2", "support");
      const user = await register("filters");
      const WORD = "zq" + TAG.replace(/[^a-z0-9]/gi, "");
      const a = await made(user, { category: "bug", title: "First " + WORD, body: "Body about alpha " + WORD });
      const b = await made(user, { category: "idea", title: "Second " + WORD, body: "Body about beta " + WORD });
      const c = await made(user, { category: "account", title: "Third " + WORD, body: "Body about gamma 100%_off " + WORD });
      await patch(support, b.id, { priority: "urgent", assigneeId: support.id }).expect(200);
      await patch(support, c.id, { status: "waiting", assigneeId: agent2.id }).expect(200);

      const all = await inbox(support, `?q=${WORD}`);
      expect(all.items.map((i) => i.id)).toEqual([c.id, b.id, a.id]);
      expect(all.next).toBeNull();
      const seen: string[] = [];
      let next = await inbox(support, `?q=${WORD}&limit=1`);
      for (let guard = 0; guard < 5; guard++) {
        seen.push(...next.items.map((i) => i.id));
        if (!next.next) break;
        next = await inbox(support, `?q=${WORD}&limit=1&before=${encodeURIComponent(next.next.at)}&beforeId=${next.next.id}`);
      }
      expect(seen).toEqual([c.id, b.id, a.id]);

      const ids = async (query: string) => (await inbox(support, `?q=${WORD}&${query}`)).items.map((i) => i.id);
      expect(await ids("status=waiting")).toEqual([c.id]);
      expect(await ids("category=idea")).toEqual([b.id]);
      expect(await ids("priority=urgent")).toEqual([b.id]);
      expect(await ids("assignee=me")).toEqual([b.id]);
      expect(await ids("assignee=none")).toEqual([a.id]);
      expect(await ids(`assignee=${agent2.id}`)).toEqual([c.id]);
      expect(await ids("status=resolved")).toEqual([]);
      expect(await ids("status=open&category=bug")).toEqual([a.id]);
      // Search by reference code, with or without the prefix, and by words in the body.
      expect((await inbox(support, `?q=${a.code}`)).items.map((i) => i.id)).toEqual([a.id]);
      expect((await inbox(support, `?q=${String(a.ref)}`)).items.map((i) => i.id)).toContain(a.id); // a bare number also matches text, so others may come with it
      expect((await inbox(support, `?q=${a.code.toLowerCase()}`)).items.map((i) => i.id)).toEqual([a.id]);
      expect((await inbox(support, `?q=${encodeURIComponent("beta " + WORD)}`)).items.map((i) => i.id)).toEqual([b.id]);
      // Pattern characters are taken literally: a bare % or _ does not match everything.
      expect((await inbox(support, `?q=${encodeURIComponent("100%_off " + WORD)}`)).items.map((i) => i.id)).toEqual([c.id]);
      expect((await inbox(support, `?q=${encodeURIComponent("%")}&status=waiting&category=account&assignee=${agent2.id}`)).items.map((i) => i.id)).toEqual([c.id]);
      expect((await inbox(support, `?q=${encodeURIComponent("%%%" + WORD)}`)).items).toEqual([]);
      for (const bad of ["status=nope", "limit=0", "limit=500", "assignee=somebody", "beforeId=" + randomUUID(), "unread=false", "extra=1"]) await http.get("/v1/support/inbox?" + bad).set(as(support)).expect(422);
      const item = all.items.find((i) => i.id === b.id)!;
      expect(item).toMatchObject({ authorName: user.name, assigneeId: support.id, assigneeName: support.name, priority: "urgent" });
      expect(JSON.stringify(all)).not.toContain(user.email);
    });

    it("keeps a separate unread marker for each Support account", async () => {
      const s1 = await withRole("support", "support");
      const s2 = await withRole("support", "support");
      const user = await register("unread");
      const r = await made(user);
      const flag = async (s: Account) => (await inbox(s, `?q=${r.code}`)).items[0].unread;
      expect([await flag(s1), await flag(s2)]).toEqual([true, true]);
      await http.post(`/v1/support/inbox/${r.id}/read`).set(as(s1)).expect(200);
      expect([await flag(s1), await flag(s2)]).toEqual([false, true]);
      expect((await inbox(s1, "?unread=true&q=" + r.code)).items).toEqual([]);
      expect((await inbox(s2, "?unread=true&q=" + r.code)).items).toHaveLength(1);
      // Support's own reply does not make it unread again; the author's message does.
      await reply(s1, r.id, "Hello").expect(201);
      expect(await flag(s1)).toBe(false);
      await http.post(`/v1/support/reports/${r.id}/messages`).set(as(user)).send({ body: "Any news?" }).expect(201);
      expect(await flag(s1)).toBe(true);
      await http.post(`/v1/support/inbox/${randomUUID()}/read`).set(as(s1)).expect(404);
    });

    it("assigns only to Support accounts, lists them, and unassigns", async () => {
      const support = await withRole("support", "support");
      const plain = await register("notsupport");
      const adminOnly = await withRole("adminonly", "admin");
      const r = await made(await register("assign"));
      for (const bad of [plain, adminOnly]) {
        const res = await patch(support, r.id, { assigneeId: bad.id }).expect(422);
        expect(res.body.error.details.fields[0].path).toBe("assigneeId");
      }
      await patch(support, r.id, { assigneeId: randomUUID() }).expect(422);
      await patch(support, r.id, { assigneeId: support.id }).expect(200);
      expect((await detail(support, r.id)).assigneeId).toBe(support.id);
      const agents = (await http.get("/v1/support/agents").set(as(support)).expect(200)).body.data as Array<{ id: string; displayName: string }>;
      expect(agents.map((a) => a.id)).toContain(support.id);
      expect(agents.map((a) => a.id)).not.toContain(adminOnly.id);
      expect(JSON.stringify(agents)).not.toContain("@");
      await patch(support, r.id, { assigneeId: null }).expect(200);
      expect((await detail(support, r.id)).assigneeId).toBeNull();
      for (const bad of [{}, { status: "closed" }, { priority: "meh" }, { status: "open", extra: 1 }]) await patch(support, r.id, bad).expect(422);
    });

    it("caps the list of Support accounts at 200 instead of failing when there are more", async () => {
      const support = await withRole("support", "support");
      const tag = "cap" + TAG.replace(/[^a-z0-9]/gi, "");
      await db.query(`INSERT INTO users (email, password_hash, display_name) SELECT '${tag}-' || n || '@example.test', 'x', 'Cap ${tag} ' || n FROM generate_series(1, 205) n`);
      await db.query(`INSERT INTO user_roles (user_id, role, granted_at) SELECT id, 'support', now() FROM users WHERE email LIKE '${tag}-%@example.test'`);
      try {
        const res = await http.get("/v1/support/agents").set(as(support)).expect(200);
        expect(res.body.data).toHaveLength(200);
      } finally {
        await db.query(`DELETE FROM users WHERE email LIKE '${tag}-%@example.test'`);
      }
    });

    it("answers 404 for a report that does not exist and refuses a malformed id", async () => {
      const support = await withRole("support", "support");
      await http.get(`/v1/support/inbox/${randomUUID()}`).set(as(support)).expect(404);
      await reply(support, randomUUID(), "hello").expect(404);
      await patch(support, randomUUID(), { status: "open" }).expect(404);
      await http.get("/v1/support/inbox/nope").set(as(support)).expect(422);
    });
  });

  describe("the activity log", () => {
    it("records every change with who did it, and the database refuses to edit or delete it", async () => {
      const user = await register("audit");
      const support = await withRole("support", "support");
      const r = await made(user);
      await reply(support, r.id, "Working on it").expect(201);
      await reply(support, r.id, "Private thought", true).expect(201);
      await patch(support, r.id, { priority: "high", status: "waiting", assigneeId: support.id }).expect(200);
      await patch(support, r.id, { priority: "high" }).expect(200); // no change: no entry
      await http.post(`/v1/support/reports/${r.id}/messages`).set(as(user)).send({ body: "More" }).expect(201);
      const rows = (await db.query("SELECT action, actor_kind, actor_email, from_value, to_value FROM support_activity WHERE ticket_id = $1 ORDER BY seq", [r.id])) as Array<Record<string, string | null>>;
      expect(rows.map((x) => [x.action, x.from_value, x.to_value])).toEqual([
        ["create", null, "open"],
        ["status", "open", "in_progress"],
        ["reply", null, null],
        ["note", null, null],
        ["status", "in_progress", "waiting"],
        ["priority", "normal", "high"],
        ["assign", null, support.id],
        ["status", "waiting", "open"],
        ["reply", null, null],
      ]);
      expect(rows.filter((x) => x.actor_kind === "support").every((x) => x.actor_email === support.email)).toBe(true);
      expect(rows.filter((x) => x.actor_kind === "user").every((x) => x.actor_email === "(reporter)")).toBe(true);
      await expect(db.query("UPDATE support_activity SET action = 'reply' WHERE ticket_id = $1", [r.id])).rejects.toThrow(/append-only/);
      await expect(db.query("DELETE FROM support_activity WHERE ticket_id = $1", [r.id])).rejects.toThrow(/append-only/);
    });
  });

  describe("deleting an account", () => {
    it("keeps its reports without any name or email, keeps the log intact, and leaves other people's reports alone", async () => {
      const leaving = await register("leaving");
      const staying = await register("staying");
      const support = await withRole("support", "support");
      const mine = await made(leaving, { title: "Leaving report " + TAG, body: "I am about to delete my account." });
      const theirs = await made(staying);
      await reply(support, mine.id, "Sorry to see you go").expect(201);
      await patch(support, mine.id, { assigneeId: support.id }).expect(200);
      const before = (await db.query("SELECT count(*)::int AS n FROM support_activity WHERE ticket_id = $1", [mine.id]))[0].n;
      await http.post("/v1/account/delete").set(as(leaving)).send({ password: PASSWORD, confirmation: "delete my account" }).expect(204);
      const row = await ticket(mine.id);
      expect(row.author_id).toBeNull();
      expect(row.body).toBe("I am about to delete my account.");
      const seen = await detail(support, mine.id);
      expect(seen.authorName).toBeNull();
      expect(seen.messages.map((m) => m.kind)).toEqual(["support"]);
      const everything = JSON.stringify(await db.query("SELECT t.*, (SELECT json_agg(m) FROM support_messages m WHERE m.ticket_id = t.id) AS messages, (SELECT json_agg(a) FROM support_activity a WHERE a.ticket_id = t.id) AS log FROM support_tickets t WHERE t.id = $1", [mine.id]));
      expect(everything).not.toContain(leaving.email);
      expect(everything).not.toContain(leaving.name);
      expect((await db.query("SELECT count(*)::int AS n FROM support_activity WHERE ticket_id = $1", [mine.id]))[0].n).toBe(before);
      expect((await ticket(theirs.id)).author_id).toBe(staying.id);
      await http.get(`/v1/support/reports/${theirs.id}`).set(as(staying)).expect(200);
      // A Support account that is deleted just leaves the report unassigned.
      const leavingSupport = await withRole("support", "support");
      const t2 = await made(await register("x"));
      await patch(support, t2.id, { assigneeId: leavingSupport.id }).expect(200);
      await http.post("/v1/account/delete").set(as(leavingSupport)).send({ password: PASSWORD, confirmation: "delete my account" }).expect(204);
      expect((await detail(support, t2.id)).assigneeId).toBeNull();
    });
  });

  describe("the account export", () => {
    it("includes the person's own reports and Support's public replies, and never an internal note", async () => {
      const user = await register("export");
      const support = await withRole("support", "support");
      const r = await made(user, { title: "Export me " + TAG });
      await reply(support, r.id, "Public reply for export").expect(201);
      await reply(support, r.id, "INTERNAL-EXPORT-NOTE", true).expect(201);
      const res = await http.get("/v1/account/export").set(as(user)).expect(200);
      const data = accountExportSchema.parse(res.body.data);
      expect(data.problemReports).toHaveLength(1);
      expect(data.problemReports[0]).toMatchObject({ code: r.code, title: "Export me " + TAG, messages: [{ from: "support", text: "Public reply for export" }] });
      expect(JSON.stringify(res.body)).not.toContain("INTERNAL-EXPORT-NOTE");
    });
  });

  describe("the database", () => {
    it("holds the rules itself: bad values are refused below the application", async () => {
      const user = await register("rules");
      const insert = (over: Record<string, string>) =>
        db.query(
          `INSERT INTO support_tickets (author_id, category, title, body, context, status, priority, resolved_at, created_at, updated_at, last_user_activity_at)
           VALUES ($1, ${over.category ?? "'bug'"}, ${over.title ?? "'Valid title'"}, ${over.body ?? "'A valid body text.'"}, ${over.context ?? "'{}'::jsonb"}, ${over.status ?? "'open'"}, ${over.priority ?? "'normal'"}, ${over.resolved ?? "NULL"}, now(), now(), now())`,
          [user.id],
        );
      await expect(insert({ category: "'nope'" })).rejects.toThrow();
      await expect(insert({ status: "'closed'" })).rejects.toThrow();
      await expect(insert({ priority: "'meh'" })).rejects.toThrow();
      await expect(insert({ title: "'ab'" })).rejects.toThrow();
      await expect(insert({ body: "'short'" })).rejects.toThrow();
      await expect(insert({ context: "'[]'::jsonb" })).rejects.toThrow();
      await expect(insert({ status: "'resolved'" })).rejects.toThrow(); // resolved needs a resolved_at
      await expect(insert({ resolved: "now()" })).rejects.toThrow(); // and an open one must not have it
      const r = await made(user);
      await expect(db.query("INSERT INTO support_messages (ticket_id, author_id, author_kind, internal, body, created_at) VALUES ($1, $2, 'user', true, 'x', now())", [r.id, user.id])).rejects.toThrow(); // a user cannot write a note
      await expect(db.query("INSERT INTO user_roles(user_id, role, granted_at) VALUES ($1, 'superuser', now())", [user.id])).rejects.toThrow();
      await db.query("INSERT INTO user_roles(user_id, role, granted_at) VALUES ($1, 'support', now()) ON CONFLICT DO NOTHING", [user.id]);
    });
  });

  describe("the migration", () => {
    it("goes up, down and up again on a separate database that already holds data, and refuses to go down while the role is in use", async () => {
      const name = "sf_support_mig_" + randomUUID().slice(0, 8).replace(/-/g, "");
      await db.query(`CREATE DATABASE ${name}`);
      const other = new DataSource({ ...dataSourceOptions, database: name } as never);
      try {
        await other.initialize();
        await other.runMigrations();
        const tables = async () => (await other.query("SELECT tablename FROM pg_tables WHERE tablename LIKE 'support_%' ORDER BY 1")).map((r: { tablename: string }) => r.tablename);
        expect(await tables()).toEqual(["support_activity", "support_messages", "support_reads", "support_tickets"]);
        const [{ id }] = await other.query("INSERT INTO users (email, password_hash, display_name) VALUES ('mig@example.test', 'x', 'Mig') RETURNING id");
        await other.query("INSERT INTO user_roles(user_id, role, granted_at) VALUES ($1, 'support', now())", [id]);
        await other.query("INSERT INTO support_tickets (author_id, category, title, body, context, created_at, updated_at, last_user_activity_at) VALUES ($1,'bug','Kept title','A body that is long enough.','{}'::jsonb, now(), now(), now())", [id]);
        // Refused while the role is in use: nothing is lost and nothing is half done.
        await expect(other.undoLastMigration()).rejects.toThrow(/Revoke the role/);
        expect(await tables()).toHaveLength(4);
        expect((await other.query("SELECT count(*)::int AS n FROM support_tickets"))[0].n).toBe(1);
        // Role audit rows that name support also block it, because the audit history is never edited.
        await other.query("DELETE FROM user_roles WHERE role = 'support'");
        await other.query("INSERT INTO role_audit(at, action, role, actor_id, actor_email, target_id, target_email) VALUES (now(),'grant','support',NULL,'operator',$1,'mig@example.test')", [id]);
        await expect(other.undoLastMigration()).rejects.toThrow(/Revoke the role/);
        // Without any trace of the role it goes down, removes the tables and restores the old role lists.
        await other.query("ALTER TABLE role_audit DISABLE TRIGGER role_audit_no_change");
        await other.query("DELETE FROM role_audit WHERE role = 'support'");
        await other.query("ALTER TABLE role_audit ENABLE TRIGGER role_audit_no_change");
        await other.undoLastMigration();
        expect(await tables()).toEqual([]);
        await expect(other.query("INSERT INTO user_roles(user_id, role, granted_at) VALUES ($1, 'support', now())", [id])).rejects.toThrow();
        expect((await other.query("SELECT count(*)::int AS n FROM users"))[0].n).toBe(1);
        await other.runMigrations();
        expect(await tables()).toHaveLength(4);
        await other.query("INSERT INTO user_roles(user_id, role, granted_at) VALUES ($1, 'support', now())", [id]);
      } finally {
        if (other.isInitialized) await other.destroy();
        await db.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      }
    });
  });
});
