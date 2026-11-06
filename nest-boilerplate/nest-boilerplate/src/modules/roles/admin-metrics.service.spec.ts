import { AdminMetrics, AdminMetricsBody, adminMetricsBodySchema, adminMetricsSchema } from "@/common/contracts/phase3/admin-metrics.schema";
import { calm } from "@/modules/roles/admin-metrics.fixture";
import { AdminMetricsService, METRICS_CACHE_MS, deriveAlerts } from "@/modules/roles/admin-metrics.service";

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
    (svc as unknown as { read: () => Promise<AdminMetricsBody> }).read = async () => {
      reads += 1;
      const { snapshotKey: _key, ...body } = calm();
      return { ...body, activeNow: reads };
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
    (svc as unknown as { read: () => Promise<AdminMetricsBody> }).read = async () => {
      if (++n === 1) throw new Error("db down");
      const { snapshotKey: _key, ...body } = calm();
      return adminMetricsBodySchema.parse(body);
    };
    await expect(svc.snapshot(() => 1)).rejects.toThrow("db down");
    await expect(svc.snapshot(() => 2)).resolves.toBeDefined();
  });
});


describe("Support aggregate contract", () => {
  it("refuses private content at every Support aggregate boundary", () => {
    const valid = calm();
    expect(adminMetricsSchema.parse(valid).support.responded).toBe(0);
    for (const support of [
      { ...valid.support, title: "private" },
      { ...valid.support, byCategory: { ...valid.support.byCategory, email: "private@example.test" } },
      { ...valid.support, byStatus: { ...valid.support.byStatus, reporterId: "private" } },
      { ...valid.support, medianFirstResponseMs: -1 },
      { ...valid.support, medianFirstResponseMs: Number.POSITIVE_INFINITY },
    ]) expect(adminMetricsSchema.safeParse({ ...valid, support }).success).toBe(false);
  });
});
