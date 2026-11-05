import { AdminMetrics } from "@/common/contracts/phase3/admin-metrics.schema";
import { AdminMetricsService, METRICS_CACHE_MS, deriveAlerts } from "@/modules/roles/admin-metrics.service";

const calm = (): AdminMetrics => {
  const h = new Array(24).fill(0);
  return {
    generatedAt: "2026-11-05T10:00:00.000Z",
    windowHours: 24,
    seriesStart: "2026-11-04T11:00:00.000Z",
    totals: { users: 1, suspendedUsers: 0, designs: 0, archivedDesigns: 0, runs: 0, shares: 0, openShares: 0, notes: 0 },
    activeNow: 0,
    last24h: { signups: 0, designsCreated: 0, runsCompleted: 0, runsFailed: 0, aiCalls: 0 },
    series: { signups: h, designsCreated: h, runsCompleted: h, runsFailed: h, aiCalls: h },
    roles: { user: 1, instructor: 0, reviewer: 0, admin: 1 },
    runs: { byVerdict: { pass: 0, strained: 0, fail: 0, unknown: 0 }, queue: { pending: 0, oldestPendingSeconds: null }, bottlenecks: { client: 0, cdn: 0, lb: 0, gateway: 0, app: 0, worker: 0, cache: 0, db: 0, replica: 0, queue: 0, storage: 0, external: 0 } },
    ai: { byTask: { describe: 0, whatif: 0, fixes: 0 }, completed: 0, failed: 0, byOutcome: { completed: 0, rate_limited: 0, invalid_output: 0, unavailable: 0, cancelled: 0, other: 0 }, tokens24h: 0, latencyMs: { p50: null, p95: null }, usage: { lastMinute: 0, today: 0, limitPerMinute: 30, limitPerDay: 1000 } },
    funnel: { registered: 1, createdDesign: 0, ranDesign: 0, sharedDesign: 0 },
    system: { database: { ok: true, latencyMs: 2 }, cache: { ok: true }, uptimeSeconds: 10 },
    alerts: [],
  };
};
const edit = (f: (m: AdminMetrics) => void) => {
  const m = calm();
  f(m);
  return deriveAlerts(m);
};

describe("deriveAlerts", () => {
  it("raises nothing when everything is calm", () => expect(deriveAlerts(calm())).toEqual([]));
  it("queue: warning from 2 minutes or 10 waiting, critical from 10 minutes", () => {
    expect(edit((m) => (m.runs.queue = { pending: 1, oldestPendingSeconds: 119 }))).toEqual([]);
    expect(edit((m) => (m.runs.queue = { pending: 1, oldestPendingSeconds: 120 }))).toEqual([{ key: "queue_backlog", level: "warning" }]);
    expect(edit((m) => (m.runs.queue = { pending: 10, oldestPendingSeconds: 5 }))).toEqual([{ key: "queue_backlog", level: "warning" }]);
    expect(edit((m) => (m.runs.queue = { pending: 1, oldestPendingSeconds: 600 }))).toEqual([{ key: "queue_backlog", level: "critical" }]);
  });
  it("run failures need both 5 failures and 30 percent", () => {
    expect(edit((m) => ((m.last24h.runsFailed = 4), (m.last24h.runsCompleted = 0)))).toEqual([]);
    expect(edit((m) => ((m.last24h.runsFailed = 5), (m.last24h.runsCompleted = 100)))).toEqual([]);
    expect(edit((m) => ((m.last24h.runsFailed = 5), (m.last24h.runsCompleted = 11)))).toEqual([{ key: "run_failures_high", level: "warning" }]);
  });
  it("AI failures need both 5 failures and half of the calls", () => {
    expect(edit((m) => ((m.ai.failed = 4), (m.ai.completed = 0)))).toEqual([]);
    expect(edit((m) => ((m.ai.failed = 5), (m.ai.completed = 6)))).toEqual([]);
    expect(edit((m) => ((m.ai.failed = 5), (m.ai.completed = 5)))).toEqual([{ key: "ai_failures_high", level: "warning" }]);
  });
  it("AI quota: warning from 80 percent of either limit, critical at the limit", () => {
    expect(edit((m) => (m.ai.usage.lastMinute = 23))).toEqual([]);
    expect(edit((m) => (m.ai.usage.lastMinute = 24))).toEqual([{ key: "ai_quota_near", level: "warning" }]);
    expect(edit((m) => (m.ai.usage.today = 800))).toEqual([{ key: "ai_quota_near", level: "warning" }]);
    expect(edit((m) => (m.ai.usage.today = 1000))).toEqual([{ key: "ai_quota_near", level: "critical" }]);
  });
  it("system: slow database warns, dead database and dead cache are critical", () => {
    expect(edit((m) => (m.system.database.latencyMs = 500))).toEqual([]);
    expect(edit((m) => (m.system.database.latencyMs = 501))).toEqual([{ key: "database_slow", level: "warning" }]);
    expect(edit((m) => (m.system.database.ok = false))).toEqual([{ key: "database_slow", level: "critical" }]);
    expect(edit((m) => (m.system.cache.ok = false))).toEqual([{ key: "cache_down", level: "critical" }]);
  });
});

describe("AdminMetricsService cache", () => {
  const make = () => {
    const svc = new AdminMetricsService({} as never, {} as never);
    let reads = 0;
    (svc as unknown as { read: () => Promise<AdminMetrics> }).read = async () => {
      reads += 1;
      return { ...calm(), activeNow: reads };
    };
    return { svc, reads: () => reads };
  };
  it("shares one read between callers that arrive together", async () => {
    const { svc, reads } = make();
    const all = await Promise.all([svc.snapshot(() => 1000), svc.snapshot(() => 1000), svc.snapshot(() => 1000)]);
    expect(reads()).toBe(1);
    expect(all.map((m) => m.activeNow)).toEqual([1, 1, 1]);
  });
  it("reuses a young snapshot and reads again once it is old", async () => {
    const { svc, reads } = make();
    await svc.snapshot(() => 1000);
    await svc.snapshot(() => 1000 + METRICS_CACHE_MS - 1);
    expect(reads()).toBe(1);
    await svc.snapshot(() => 1000 + METRICS_CACHE_MS);
    expect(reads()).toBe(2);
  });
  it("does not cache a failed read", async () => {
    const svc = new AdminMetricsService({} as never, {} as never);
    let n = 0;
    (svc as unknown as { read: () => Promise<AdminMetrics> }).read = async () => {
      if (++n === 1) throw new Error("db down");
      return calm();
    };
    await expect(svc.snapshot(() => 1)).rejects.toThrow("db down");
    await expect(svc.snapshot(() => 2)).resolves.toBeDefined();
  });
});
