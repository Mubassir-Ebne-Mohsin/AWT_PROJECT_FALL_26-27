import { Test } from "@nestjs/testing";
import { NestExpressApplication } from "@nestjs/platform-express";
import { DataSource } from "typeorm";
import request from "supertest";
import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import { AppModule } from "@/src/app.module";
import { configureApp, setupSwagger } from "@/src/app.setup";
import { RedisCacheService } from "@/providers/cache/redis/redis-cache.service";
import { FakeRedisCacheService } from "../test/fake-redis";
import { getTemplates } from "@/modules/simulation/engine/templates";
import { AccountRolesService, OPERATOR } from "@/modules/roles/account-roles.service";
import { AdminMetricsService } from "@/modules/roles/admin-metrics.service";
import { AdminMetrics, adminMetricsSchema } from "@/common/contracts/phase3/admin-metrics.schema";

// Admin live dashboard (docs/ADMIN-DASHBOARD-SCOPE.md) on the real application and PostgreSQL. No AI is called.
jest.setTimeout(120000);
type Account = { id: string; email: string; token: string };

describe("Admin metrics (isolated Postgres, no AI)", () => {
  let app: NestExpressApplication, db: DataSource, http: ReturnType<typeof request>, roles: AccountRolesService, metrics: AdminMetricsService;
  const as = (a: Account) => ({ Authorization: "Bearer " + a.token });
  const NAME = "Zebra-" + randomUUID().slice(0, 8);

  async function register(name: string): Promise<Account> {
    const email = `${name}-${randomUUID()}@example.test`;
    const res = await http.post("/v1/auth/register").send({ email, password: "Metrics-2026!", displayName: name }).expect(201);
    return { id: res.body.data.user.id, email, token: res.body.data.accessToken };
  }
  async function makeAdmin(name = "metricsadmin") {
    const a = await register(name);
    await roles.grant(OPERATOR, a.id, { role: "admin" });
    return a;
  }
  /** Always a fresh read: the 3 second cache is exercised by its own test. */
  const read = async (a: Account): Promise<AdminMetrics> => {
    metrics.reset();
    const res = await http.get("/v1/admin/metrics").set(as(a)).expect(200);
    return adminMetricsSchema.parse(res.body.data);
  };
  async function newDesign(a: Account, name = NAME) {
    const t = getTemplates().find((x) => x.id === "mvp")!;
    return (await http.post("/v1/designs").set(as(a)).send({ schemaVersion: 1, name, description: "private blurb " + NAME, source: "template", templateId: t.id, graph: t.graph, traffic: t.traffic }).expect(201)).body.data;
  }
  async function simulate(a: Account, id: string, revision: number) {
    const started = (await http.post(`/v1/designs/${id}/simulate`).set(as(a)).send({ expectedRevision: revision, requestId: randomUUID() }).expect(202)).body.data;
    for (let i = 0; i < 150; i++) {
      const r = (await http.get(started.statusUrl).set(as(a)).expect(200)).body.data;
      if (r.status !== "pending") return r;
      await new Promise((res) => setTimeout(res, 50));
    }
    throw new Error("run stayed pending");
  }
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

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
    metrics = app.get(AdminMetricsService);
  });
  afterAll(async () => {
    await app?.close();
  });

  it("is for Admins only: anonymous 401, plain user 403, instructor 403, reviewer 403, support 403", async () => {
    await http.get("/v1/admin/metrics").expect(401);
    const plain = await register("plain");
    await http.get("/v1/admin/metrics").set(as(plain)).expect(403);
    for (const role of ["instructor", "reviewer", "support"] as const) {
      const a = await register(role);
      await roles.grant(OPERATOR, a.id, { role });
      await http.get("/v1/admin/metrics").set(as(a)).expect(403);
    }
  });

  it("stops serving an Admin whose role is revoked on the very next call", async () => {
    const boss = await makeAdmin("boss");
    const temp = await makeAdmin("tempadmin");
    await read(temp);
    await roles.revoke(OPERATOR, temp.id, "admin");
    await http.get("/v1/admin/metrics").set(as(temp)).expect(403);
    await read(boss);
  });

  it("exports require current Admin permission and a valid snapshot, never return private content", async () => {
    const admin = await makeAdmin("exportadmin");
    const m = await read(admin);
    const query = `?format=json&snapshot=${m.snapshotKey}`;
    // FakeRedis implements no Lua: use a strict spy for this endpoint, real Redis is tested in the browser harness.
    const redis = app.get(RedisCacheService).getClient();
    const evalFn = jest.fn().mockResolvedValue(1);
    Object.assign(redis, { eval: evalFn });
    await http.get("/v1/admin/metrics/export"+query).expect(401);
    for (const role of ["user", "instructor", "reviewer", "support"] as const) {
      const a = await register("export"+role);
      if(role !== "user") await roles.grant(OPERATOR,a.id,{role});
      await http.get("/v1/admin/metrics/export"+query).set(as(a)).expect(403);
    }
    const json = (await http.get("/v1/admin/metrics/export"+query).set(as(admin)).expect(200)).body.data;
    expect(JSON.parse(json.content)).toEqual(m);
    const csv = (await http.get(`/v1/admin/metrics/export?format=csv&snapshot=${m.snapshotKey}`).set(as(admin)).expect(200)).body.data.content;
    expect(csv).toContain(`heatmap.total,${m.heatmap.total}`);
    expect(csv).not.toContain(admin.id); expect(json.content).not.toContain(admin.email);
    await http.get(`/v1/admin/metrics/export?format=json&snapshot=${"f".repeat(64)}`).set(as(admin)).expect(404);
    await http.get(`/v1/admin/metrics/export?format=json&snapshot=${m.snapshotKey}&name=private`).set(as(admin)).expect(422);
    evalFn.mockRejectedValueOnce(new Error("down"));
    const down = await http.get("/v1/admin/metrics/export"+query).set(as(admin)).expect(503);
    expect(down.body.error.code).toBe("UNAVAILABLE");
    await roles.revoke(OPERATOR,admin.id,"admin");
    await http.get("/v1/admin/metrics/export"+query).set(as(admin)).expect(403);
    expect(evalFn).toHaveBeenCalledTimes(3);
  });

  it("heatmap cells and rolling totals agree with independent SQL in the same returned window", async () => {
    const a = await makeAdmin("heatmapadmin");
    const design = await newDesign(a);
    await simulate(a,design.id,design.revision);
    const m = await read(a), h = m.heatmap;
    const rows = await db.query(`SELECT
      (SELECT count(*)::int FROM designs WHERE created_at >= $1 AND created_at < $2) AS designs,
      (SELECT count(*)::int FROM design_runs WHERE created_at >= $1 AND created_at < $2) AS runs`, [h.windowStart,h.windowEnd]);
    expect(h.designsCreated).toBe(rows[0].designs); expect(h.runsCreated).toBe(rows[0].runs);
    expect(h.total).toBe(h.designsCreated+h.runsCreated); expect(sum(h.cells)).toBe(h.total);
    expect(Date.parse(h.windowEnd)-Date.parse(h.windowStart)).toBe(28*86400000);
    expect(h.windowEnd).toBe(m.generatedAt);
  });

  it("UTC lower boundary is included, upper excluded; Sunday 23 and Monday 00 stay separate", async () => {
    const { readActivityHeatmap } = await import("@/modules/roles/admin-activity");
    const a = await makeAdmin("boundary");
    const dates = ["2000-01-31T00:00:00Z", "2000-01-30T23:59:59.999Z", "2000-02-28T00:00:00Z", "2000-02-27T23:59:59.999Z", "2000-02-07T06:00:00+06:00"];
    const fixtureIds: string[] = [];
    const testDatabase = process.env.DB_TEST_DATABASE ?? "stressforge_test";
    if(db.options.database !== testDatabase || !/(test|e2e)/i.test(testDatabase)) throw new Error("Boundary fixtures require isolated test database");
    for(const date of dates) { const d=await newDesign(a); fixtureIds.push(d.id); await db.query("UPDATE designs SET created_at=$1 WHERE id=$2",[date,d.id]); }
    const q=db.createQueryRunner(); await q.connect();
    try {
      await q.query("SET TIME ZONE 'Asia/Dhaka'");
      const h=await readActivityHeatmap(q,new Date("2000-02-28T00:00:00Z"));
      expect(h.cells[0]).toBe(2); expect(h.cells[167]).toBe(1); expect(h.total).toBe(3);
      const empty=await readActivityHeatmap(q,new Date("1990-01-01T00:00:00Z"));
      expect(empty.total).toBe(0); expect(empty.cells).toEqual(Array(168).fill(0));
    } finally {
      await q.query("RESET TIME ZONE"); await q.release();
      await db.query("DELETE FROM designs WHERE id = ANY($1::uuid[])", [fixtureIds]);
    }
  });

  it("matches the contract and its cards agree with its charts", async () => {
    const admin = await makeAdmin();
    const m = await read(admin);
    expect(m.windowHours).toBe(24);
    for (const key of ["signups", "designsCreated", "runsCompleted", "runsFailed", "aiCalls"] as const) {
      expect(m.series[key]).toHaveLength(24);
      expect(m.last24h[key]).toBe(sum(m.series[key]));
    }
    expect(m.last24h.signups).toBeGreaterThanOrEqual(1);
    expect(m.roles.admin).toBeGreaterThanOrEqual(1);
    expect(m.roles.user).toBe(m.totals.users);
    expect(m.funnel.registered).toBe(m.totals.users);
    expect(m.funnel.createdDesign).toBeGreaterThanOrEqual(m.funnel.ranDesign);
    expect(m.system.database.ok).toBe(true);
    expect(m.system.cache.ok).toBe(true);
    const a = new Date(m.seriesStart).getTime();
    expect(a % 3600000).toBe(0);
    expect(new Date(m.generatedAt).getTime() - a).toBeGreaterThanOrEqual(23 * 3600000);
  });

  it("counts what really happens: accounts, designs, runs, shares, notes, AI calls and a stuck run", async () => {
    const admin = await makeAdmin();
    const before = await read(admin);
    const user = await register("counted");
    const d = await newDesign(user);
    await http.post(`/v1/designs/${d.id}/notes`).set(as(user)).send({ kind: "decision", text: "Secret decision " + NAME }).expect(201);
    await http.post(`/v1/designs/${d.id}/shares`).set(as(user)).send({ scope: "design" }).expect(201);
    const run = await simulate(user, d.id, d.revision);
    expect(run.status).toBe("completed");

    const inserted: string[] = [];
    const ai = async (task: string, outcome: string, latency: number | null, tokens: number | null) => {
      const id = randomUUID();
      inserted.push(id);
      await db.query(
        `INSERT INTO ai_task_calls (id, owner_id, task, provider, model, outcome, total_tokens, latency_ms, input_length, input_hash, created_at)
         VALUES ($1,$2,$3,'groq','test-model',$4,$5,$6,10,$7,now())`,
        [id, user.id, task, outcome, tokens, latency, "a".repeat(64)],
      );
    };
    await ai("describe", "completed", 120, 300);
    await ai("whatif", "completed", 480, 200);
    await ai("fixes", "PROVIDER_RATE_LIMITED", null, null);
    await ai("fixes", "INVALID_OUTPUT", null, null);
    await ai("describe", "CANCELLED", null, null);
    await ai("describe", "SOMETHING_NEW", null, null);
    const stuck = randomUUID();
    await db.query(
      `INSERT INTO design_runs (id, design_id, request_id, status, created_at, payload) VALUES ($1,$2,$3,'pending', now() - interval '20 minutes', '{}'::jsonb)`,
      [stuck, d.id, randomUUID()],
    );
    try {
      const after = await read(admin);
      expect(after.totals.users - before.totals.users).toBe(1);
      expect(after.totals.designs - before.totals.designs).toBe(1);
      expect(after.totals.notes - before.totals.notes).toBe(1);
      expect(after.totals.shares - before.totals.shares).toBe(1);
      expect(after.totals.openShares - before.totals.openShares).toBe(1);
      expect(after.totals.runs - before.totals.runs).toBe(2);
      expect(after.last24h.signups - before.last24h.signups).toBe(1);
      expect(after.last24h.designsCreated - before.last24h.designsCreated).toBe(1);
      expect(after.last24h.runsCompleted - before.last24h.runsCompleted).toBe(1);
      expect(after.last24h.aiCalls - before.last24h.aiCalls).toBe(6);
      expect(after.series.aiCalls[23]! - before.series.aiCalls[23]!).toBe(6);
      expect(after.ai.byTask.describe - before.ai.byTask.describe).toBe(3);
      expect(after.ai.byTask.whatif - before.ai.byTask.whatif).toBe(1);
      expect(after.ai.byTask.fixes - before.ai.byTask.fixes).toBe(2);
      expect(after.ai.completed - before.ai.completed).toBe(2);
      expect(after.ai.failed - before.ai.failed).toBe(4);
      const outcomes = (k: keyof AdminMetrics["ai"]["byOutcome"]) => after.ai.byOutcome[k] - before.ai.byOutcome[k];
      expect([outcomes("completed"), outcomes("rate_limited"), outcomes("invalid_output"), outcomes("cancelled"), outcomes("other"), outcomes("unavailable")]).toEqual([2, 1, 1, 1, 1, 0]);
      expect(sum(Object.values(after.ai.byOutcome)) - sum(Object.values(before.ai.byOutcome))).toBe(6);
      expect(after.ai.tokens24h - before.ai.tokens24h).toBe(500);
      expect(after.ai.latencyMs.p50).not.toBeNull();
      expect(after.ai.latencyMs.p95!).toBeGreaterThanOrEqual(after.ai.latencyMs.p50!);
      expect(after.ai.usage.lastMinute).toBeGreaterThanOrEqual(3);
      const verdicts = (m: AdminMetrics) => m.runs.byVerdict.pass + m.runs.byVerdict.strained + m.runs.byVerdict.fail;
      expect(verdicts(after) - verdicts(before)).toBe(1);
      expect(after.runs.byVerdict.unknown - before.runs.byVerdict.unknown).toBe(0);
      expect(after.runs.queue.pending - before.runs.queue.pending).toBe(1);
      expect(after.runs.queue.oldestPendingSeconds!).toBeGreaterThanOrEqual(1200);
      expect(after.alerts).toContainEqual({ key: "queue_backlog", level: "critical" });
      expect(after.activeNow).toBeGreaterThanOrEqual(1);
      expect(after.funnel.createdDesign - before.funnel.createdDesign).toBe(1);
      expect(after.funnel.ranDesign - before.funnel.ranDesign).toBe(1);
      expect(after.funnel.sharedDesign - before.funnel.sharedDesign).toBe(1);
    } finally {
      await db.query("DELETE FROM design_runs WHERE id = $1", [stuck]);
      await db.query("DELETE FROM ai_task_calls WHERE id = ANY($1)", [inserted]);
    }
    // The stuck run is gone again, so the backlog alert clears.
    const cleared = await read(admin);
    expect(cleared.alerts.find((a) => a.key === "queue_backlog" && a.level === "critical")).toBeUndefined();
  });

  it("counts the limiting component type of strained and failed runs only, and only for known types", async () => {
    const admin = await makeAdmin();
    const user = await register("bottleneck");
    const d = await newDesign(user);
    const before = await read(admin);
    const rows: string[] = [];
    const run = async (verdict: string, type: string, status = "completed") => {
      const id = randomUUID();
      rows.push(id);
      const payload = { result: { summary: { verdict, bottleneckId: "n1", nodes: [{ id: "n0", type: "client" }, { id: "n1", type }] } } };
      await db.query(`INSERT INTO design_runs (id, design_id, request_id, status, created_at, payload) VALUES ($1,$2,$3,$4, now(), $5::jsonb)`, [id, d.id, randomUUID(), status, JSON.stringify(payload)]);
    };
    try {
      await run("strained", "db");
      await run("fail", "db");
      await run("fail", "cache");
      await run("pass", "app"); // passing runs have no real limit
      await run("fail", "<script>alert(1)</script>"); // not a component type: dropped, never shown
      await run("fail", "worker", "failed"); // not completed
      const after = await read(admin);
      const delta = (t: keyof AdminMetrics["runs"]["bottlenecks"]) => after.runs.bottlenecks[t] - before.runs.bottlenecks[t];
      expect([delta("db"), delta("cache"), delta("app"), delta("worker")]).toEqual([2, 1, 0, 0]);
      expect(JSON.stringify(after)).not.toContain("script");
    } finally {
      await db.query("DELETE FROM design_runs WHERE id = ANY($1)", [rows]);
    }
  });

  it("files a finished run with no usable verdict under 'No verdict', and never shows the odd value", async () => {
    const admin = await makeAdmin();
    const user = await register("noverdict");
    const d = await newDesign(user);
    const before = await read(admin);
    const rows: string[] = [];
    const insert = async (payload: unknown) => {
      const id = randomUUID();
      rows.push(id);
      await db.query(`INSERT INTO design_runs (id, design_id, request_id, status, created_at, payload) VALUES ($1,$2,$3,'completed', now(), $4::jsonb)`, [id, d.id, randomUUID(), JSON.stringify(payload)]);
    };
    try {
      await insert({});
      await insert({ result: { summary: { verdict: "<b>bold</b>" } } });
      const after = await read(admin);
      const v = (k: keyof AdminMetrics["runs"]["byVerdict"]) => after.runs.byVerdict[k] - before.runs.byVerdict[k];
      expect([v("unknown"), v("pass"), v("strained"), v("fail")]).toEqual([2, 0, 0, 0]);
      expect(JSON.stringify(after)).not.toContain("bold");
    } finally {
      await db.query("DELETE FROM design_runs WHERE id = ANY($1)", [rows]);
    }
  });

  it("never carries an email, a display name, a design name, a note or a description", async () => {
    const admin = await makeAdmin();
    const user = await register("leaktarget-" + NAME);
    const d = await newDesign(user, "Leak " + NAME);
    await http.post(`/v1/designs/${d.id}/notes`).set(as(user)).send({ kind: "assumption", text: "Never show " + NAME }).expect(201);
    const ticket = (await http.post("/v1/support/reports").set(as(user)).send({ category: "bug", title: "Private report " + NAME, body: "Private body " + NAME, expected: "Private expectation " + NAME, context: { browser: "Private browser " + NAME } }).expect(201)).body.data;
    await db.query("INSERT INTO support_messages (ticket_id, author_id, author_kind, internal, body, created_at) VALUES ($1,$2,'support',true,$3,now())", [ticket.id, admin.id, "Internal canary " + NAME]);
    const raw = JSON.stringify((await http.get("/v1/admin/metrics").set(as(admin)).expect(200)).body);
    metrics.reset();
    const fresh = JSON.stringify((await http.get("/v1/admin/metrics").set(as(admin)).expect(200)).body);
    for (const body of [raw, fresh]) {
      for (const secret of [NAME, user.email, user.id, d.id, "example.test", "private blurb", "leaktarget", ticket.id, "Private report", "Private body", "Private expectation", "Private browser", "Internal canary"]) expect(body).not.toContain(secret);
    }
    // Every leaf is a number, a boolean, a timestamp or a closed key.
    const leaves: unknown[] = [];
    const walk = (v: unknown): void => {
      if (v !== null && typeof v === "object") Object.values(v).forEach(walk);
      else leaves.push(v);
    };
    const { snapshotKey, ...body } = JSON.parse(fresh).data;
    expect(snapshotKey).toBe(createHash("sha256").update(JSON.stringify(body)).digest("hex"));
    walk(body);
    for (const leaf of leaves) {
      if (typeof leaf === "string") expect(leaf).toMatch(/^(\d{4}-\d\d-\d\dT[\d:.]+Z|queue_backlog|run_failures_high|ai_failures_high|ai_quota_near|database_slow|cache_down|info|warning|critical)$/);
    }
  });

  it("serves a snapshot read within 3 seconds again, and one read for concurrent callers", async () => {
    const admin = await makeAdmin();
    metrics.reset();
    const spy = jest.spyOn(metrics as unknown as { read: () => Promise<unknown> }, "read");
    try {
      const [a, b, c] = await Promise.all([1, 2, 3].map(() => http.get("/v1/admin/metrics").set(as(admin)).expect(200)));
      expect(spy).toHaveBeenCalledTimes(1);
      expect(b.body.data.generatedAt).toBe(a.body.data.generatedAt);
      expect(c.body.data.generatedAt).toBe(a.body.data.generatedAt);
      await http.get("/v1/admin/metrics").set(as(admin)).expect(200);
      expect(spy).toHaveBeenCalledTimes(1);
      metrics.reset();
      const later = await http.get("/v1/admin/metrics").set(as(admin)).expect(200);
      expect(spy).toHaveBeenCalledTimes(2);
      expect(new Date(later.body.data.generatedAt).getTime()).toBeGreaterThanOrEqual(new Date(a.body.data.generatedAt).getTime());
    } finally {
      spy.mockRestore();
    }
  });

  it("reads inside one read-only REPEATABLE READ transaction and commits it", async () => {
    const admin = await makeAdmin();
    const seen: string[] = [];
    const real = db.createQueryRunner.bind(db);
    const spy = jest.spyOn(db, "createQueryRunner").mockImplementation((...args) => {
      const runner = real(...args);
      const query = runner.query.bind(runner);
      runner.query = ((sql: string, ...rest: unknown[]) => {
        seen.push(String(sql).replace(/\s+/g, " ").trim());
        return query(sql, ...(rest as []));
      }) as typeof runner.query;
      return runner;
    });
    try {
      metrics.reset();
      await http.get("/v1/admin/metrics").set(as(admin)).expect(200);
    } finally {
      spy.mockRestore();
    }
    const mine = seen.filter((q) => /^(START TRANSACTION|COMMIT|ROLLBACK)/.test(q));
    expect(mine).toContain("START TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    expect(mine[mine.length - 1]).toBe("COMMIT");
    expect(seen.filter((q) => /^(INSERT|UPDATE|DELETE)/i.test(q))).toEqual([]);
    // And a read-only transaction really refuses a write.
    const q = db.createQueryRunner();
    await q.connect();
    try {
      await q.query("START TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await expect(q.query("UPDATE users SET display_name = display_name WHERE false")).rejects.toThrow(/read-only/);
    } finally {
      await q.query("ROLLBACK").catch(() => undefined);
      await q.release();
    }
  });
  it("Support aggregates include every status/category, retain unanswered rows and compute odd/even valid reply medians", async () => {
    // This suite runs only on the dedicated e2e database; these are disposable fixtures, not the development inbox.
    const testDatabase = process.env.DB_TEST_DATABASE ?? "stressforge_test";
    if (db.options.database !== testDatabase || !/(test|e2e)/i.test(testDatabase)) throw new Error("Support fixture cleanup requires the isolated test database");
    await db.query("DELETE FROM support_tickets");
    const admin = await makeAdmin("supportmetrics");
    const empty = (await read(admin)).support;
    expect(empty.total).toBe(0);
    expect(empty.unresolved).toBe(0);
    expect(empty.responded).toBe(0);
    expect(empty.medianFirstResponseMs).toBeNull();
    expect(Object.values(empty.byCategory)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(Object.values(empty.byStatus)).toEqual([0, 0, 0, 0]);
    const created = Date.parse("2025-01-01T00:00:00.000Z");
    const fixtures = [
      ["bug", "open", 0], ["wrong_result", "in_progress", 60000], ["account", "waiting", 120000],
      ["performance", "resolved", 240000], ["idea", "open", null], ["other", "resolved", -60000],
    ] as const;
    const ids: string[] = [];
    try {
      for (const [category, status, delay] of fixtures) {
        const id = randomUUID(); ids.push(id);
        await db.query(`INSERT INTO support_tickets (id, category, title, body, context, status, created_at, updated_at, last_user_activity_at, resolved_at, first_response_at)
          VALUES ($1,$2,$3,$4,'{}',$5,$6,$6,$6,$7,$8)`,
        [id, category, "Private aggregate fixture", "Private report body must stay private", status, new Date(created), status === "resolved" ? new Date(created) : null, delay === null ? null : new Date(created + delay)]);
      }
      const even = (await read(admin)).support;
      expect(even).toEqual({ total: 6, unresolved: 4, responded: 4, medianFirstResponseMs: 90000,
        byCategory: { bug: 1, wrong_result: 1, account: 1, performance: 1, idea: 1, other: 1 },
        byStatus: { open: 2, in_progress: 1, waiting: 1, resolved: 2 } });
      await db.query("UPDATE support_tickets SET first_response_at = NULL WHERE id = $1", [ids[3]]);
      const odd = (await read(admin)).support;
      expect(odd.responded).toBe(3);
      expect(odd.medianFirstResponseMs).toBe(60000);
      await db.query("UPDATE support_tickets SET first_response_at = NULL WHERE id = ANY($1::uuid[])", [ids]);
      const unanswered = (await read(admin)).support;
      expect(unanswered.total).toBe(6);
      expect(unanswered.responded).toBe(0);
      expect(unanswered.medianFirstResponseMs).toBeNull();
    } finally { await db.query("DELETE FROM support_tickets WHERE id = ANY($1::uuid[])", [ids]); }
  });

  it("only the first public Support reply starts response timing; internal notes and author messages do not", async () => {
    const admin = await makeAdmin("replymetrics");
    const author = await register("replyauthor");
    const agent = await register("replyagent");
    const before = await read(admin);
    await roles.grant(OPERATOR, agent.id, { role: "support" });
    expect((await read(admin)).roles.support).toBe(before.roles.support + 1);
    const ticket = (await http.post("/v1/support/reports").set(as(author)).send({ category: "bug", title: "Response timing", body: "Something went wrong in my design." }).expect(201)).body.data;
    const metricBefore = (await read(admin)).support;
    await http.post(`/v1/support/inbox/${ticket.id}/messages`).set(as(agent)).send({ body: "Internal investigation only", internal: true }).expect(201);
    await http.post(`/v1/support/reports/${ticket.id}/messages`).set(as(author)).send({ body: "A little more context from the author" }).expect(201);
    expect((await read(admin)).support.responded).toBe(metricBefore.responded);
    await http.post(`/v1/support/inbox/${ticket.id}/messages`).set(as(agent)).send({ body: "The first public reply", internal: false }).expect(201);
    const first = (await read(admin)).support;
    expect(first.responded).toBe(metricBefore.responded + 1);
    const [stamp] = await db.query("SELECT first_response_at FROM support_tickets WHERE id = $1", [ticket.id]);
    await http.post(`/v1/support/inbox/${ticket.id}/messages`).set(as(agent)).send({ body: "A later public reply", internal: false }).expect(201);
    const [later] = await db.query("SELECT first_response_at FROM support_tickets WHERE id = $1", [ticket.id]);
    expect(later.first_response_at).toEqual(stamp.first_response_at);
    expect((await read(admin)).support).toEqual(first);
    await http.get("/v1/support/inbox").set(as(admin)).expect(403);
    await http.get("/v1/admin/metrics").set(as(agent)).expect(403);
  });

});
