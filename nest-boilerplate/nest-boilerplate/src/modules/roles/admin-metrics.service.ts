import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, QueryRunner } from "typeorm";
import { componentType } from "@/common/contracts/phase2/graph.schema";
import { ALERT_KEYS, ALERT_LEVELS, AdminMetrics, METRIC_WINDOW_HOURS, adminMetricsSchema } from "@/common/contracts/phase3/admin-metrics.schema";
import { SUPPORT_CATEGORIES, SUPPORT_STATUSES } from "@/common/contracts/phase3/support.schema";
import { DEFAULT_QUOTA } from "@/modules/ai/ai-quota";
import { aiSettings } from "@/modules/ai/ai.settings";
import { RedisCacheService } from "@/providers/cache/redis/redis-cache.service";

/** A snapshot this young is served again, so any number of open dashboards cost the database one read every few seconds. */
export const METRICS_CACHE_MS = 3000;
const ACTIVE_WINDOW_MINUTES = 15;
const CACHE_PING_TIMEOUT_MS = 1000;

type Alert = AdminMetrics["alerts"][number];
const SERIES_FROM = `date_trunc('hour', now()) - interval '${METRIC_WINDOW_HOURS - 1} hours'`;

/**
 * Live numbers for the Admin dashboard. Counts and durations only: nothing here selects a name, an email, a design, a note or a
 * prompt, and the result is parsed against a strict contract before it leaves. All counts come from one read-only
 * REPEATABLE READ transaction, so the cards and the charts describe the same instant, and the card totals for the last 24 hours are
 * the sum of their chart series.
 */
@Injectable()
export class AdminMetricsService {
  private cached: { at: number; value: AdminMetrics } | null = null;
  private inflight: Promise<AdminMetrics> | null = null;

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly redis: RedisCacheService,
  ) {}

  /** Single flight: concurrent callers share one read, and a recent result is reused. */
  snapshot(now: () => number = Date.now): Promise<AdminMetrics> {
    if (this.cached && now() - this.cached.at < METRICS_CACHE_MS) return Promise.resolve(this.cached.value);
    if (!this.inflight) {
      this.inflight = this.read()
        .then((value) => {
          this.cached = { at: now(), value };
          return value;
        })
        .finally(() => {
          this.inflight = null;
        });
    }
    return this.inflight;
  }

  /** Test seam: forget the cached snapshot. */
  reset() {
    this.cached = null;
  }

  private async series(q: QueryRunner, table: string, ts: string, where = "TRUE"): Promise<number[]> {
    const rows: { n: number }[] = await q.query(
      `SELECT COALESCE(c.n, 0)::int AS n
         FROM generate_series(${SERIES_FROM}, date_trunc('hour', now()), interval '1 hour') h
         LEFT JOIN (SELECT date_trunc('hour', ${ts}) AS b, count(*) AS n FROM ${table}
                     WHERE ${ts} >= ${SERIES_FROM} AND ${where} GROUP BY 1) c ON c.b = h
        ORDER BY h`,
    );
    return rows.map((r) => r.n);
  }

  private async one<T>(q: QueryRunner, sql: string): Promise<T> {
    const rows: T[] = await q.query(sql);
    return rows[0];
  }

  private async probeDatabase(): Promise<{ ok: boolean; latencyMs: number }> {
    const started = process.hrtime.bigint();
    try {
      await this.db.query("SELECT 1");
      return { ok: true, latencyMs: Math.round(Number(process.hrtime.bigint() - started) / 1e4) / 100 };
    } catch {
      return { ok: false, latencyMs: Math.round(Number(process.hrtime.bigint() - started) / 1e4) / 100 };
    }
  }

  private async probeCache(): Promise<boolean> {
    try {
      await Promise.race([this.redis.getClient().ping(), new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), CACHE_PING_TIMEOUT_MS))]);
      return true;
    } catch {
      return false;
    }
  }

  private async read(): Promise<AdminMetrics> {
    const [database, cacheOk] = await Promise.all([this.probeDatabase(), this.probeCache()]);
    const q = this.db.createQueryRunner();
    await q.connect();
    try {
      await q.query("START TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const meta = await this.one<{ now: Date; start: Date }>(q, `SELECT now() AS now, ${SERIES_FROM} AS start`);
      const totals = await this.one<Record<string, number>>(
        q,
        `SELECT (SELECT count(*) FROM users)::int AS users,
                (SELECT count(*) FROM users WHERE account_status = 'suspended')::int AS "suspendedUsers",
                (SELECT count(*) FROM designs)::int AS designs,
                (SELECT count(*) FROM designs WHERE archived_at IS NOT NULL)::int AS "archivedDesigns",
                (SELECT count(*) FROM design_runs)::int AS runs,
                (SELECT count(*) FROM design_shares)::int AS shares,
                (SELECT count(*) FROM design_shares WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now()))::int AS "openShares",
                (SELECT count(*) FROM design_notes)::int AS notes`,
      );
      const active = await this.one<{ n: number }>(
        q,
        `SELECT count(*)::int AS n FROM (
           SELECT owner_id FROM designs WHERE updated_at > now() - interval '${ACTIVE_WINDOW_MINUTES} minutes'
           UNION SELECT d.owner_id FROM design_runs r JOIN designs d ON d.id = r.design_id WHERE r.created_at > now() - interval '${ACTIVE_WINDOW_MINUTES} minutes'
           UNION SELECT owner_id FROM ai_task_calls WHERE created_at > now() - interval '${ACTIVE_WINDOW_MINUTES} minutes'
         ) a`,
      );
      const series = {
        signups: await this.series(q, "users", "created_at"),
        designsCreated: await this.series(q, "designs", "created_at"),
        runsCompleted: await this.series(q, "design_runs", "created_at", "status = 'completed'"),
        runsFailed: await this.series(q, "design_runs", "created_at", "status = 'failed'"),
        aiCalls: await this.series(q, "ai_task_calls", "created_at"),
      };
      const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
      const roleRows: { role: string; n: number }[] = await q.query(`SELECT role, count(DISTINCT user_id)::int AS n FROM user_roles GROUP BY role`);
      const roleCount = (r: string) => roleRows.find((x) => x.role === r)?.n ?? 0;
      const verdictRows: { v: string; n: number }[] = await q.query(
        `SELECT CASE WHEN payload->'result'->'summary'->>'verdict' IN ('pass','strained','fail') THEN payload->'result'->'summary'->>'verdict' ELSE 'unknown' END AS v,
                count(*)::int AS n FROM design_runs WHERE status = 'completed' GROUP BY 1`,
      );
      const verdict = (v: string) => verdictRows.find((x) => x.v === v)?.n ?? 0;
      const queue = await this.one<{ pending: number; oldest: number | null }>(
        q,
        `SELECT count(*)::int AS pending, floor(extract(epoch FROM (now() - min(created_at))))::int AS oldest FROM design_runs WHERE status = 'pending'`,
      );
      const bottleneckRows: { t: string; n: number }[] = await q.query(
        `SELECT n->>'type' AS t, count(*)::int AS n
           FROM design_runs r, jsonb_array_elements(r.payload->'result'->'summary'->'nodes') n
          WHERE r.status = 'completed' AND r.payload->'result'->'summary'->>'verdict' IN ('strained','fail')
            AND n->>'id' = r.payload->'result'->'summary'->>'bottleneckId' GROUP BY 1`,
      );
      const bottlenecks = Object.fromEntries(componentType.options.map((t) => [t, bottleneckRows.find((x) => x.t === t)?.n ?? 0])) as AdminMetrics["runs"]["bottlenecks"];
      const outcomeRows: { o: string; n: number }[] = await q.query(
        `SELECT CASE
                  WHEN outcome = 'completed' THEN 'completed'
                  WHEN outcome IN ('PROVIDER_RATE_LIMITED','AI_QUOTA','QUOTA_EXHAUSTED','AI_BUSY') THEN 'rate_limited'
                  WHEN outcome = 'INVALID_OUTPUT' THEN 'invalid_output'
                  WHEN outcome IN ('PROVIDER_UNAVAILABLE','PROVIDER_NOT_CONFIGURED','PROVIDER_AUTH','AI_DISABLED','MODEL_CHANGED','MODEL_MISSING') THEN 'unavailable'
                  WHEN outcome = 'CANCELLED' THEN 'cancelled'
                  ELSE 'other' END AS o, count(*)::int AS n
           FROM ai_task_calls WHERE created_at >= now() - interval '${METRIC_WINDOW_HOURS} hours' GROUP BY 1`,
      );
      const outcome = (o: string) => outcomeRows.find((x) => x.o === o)?.n ?? 0;
      const taskRows: { task: string; n: number }[] = await q.query(
        `SELECT task, count(*)::int AS n FROM ai_task_calls WHERE created_at >= now() - interval '${METRIC_WINDOW_HOURS} hours' GROUP BY task`,
      );
      const task = (t: string) => taskRows.find((x) => x.task === t)?.n ?? 0;
      const ai = await this.one<{ completed: number; failed: number; tokens: number; p50: number | null; p95: number | null; minute: number; today: number }>(
        q,
        `SELECT count(*) FILTER (WHERE outcome = 'completed')::int AS completed,
                count(*) FILTER (WHERE outcome <> 'completed')::int AS failed,
                COALESCE(sum(total_tokens), 0)::int AS tokens,
                percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE outcome = 'completed' AND latency_ms IS NOT NULL) AS p50,
                percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE outcome = 'completed' AND latency_ms IS NOT NULL) AS p95,
                (SELECT count(*) FROM ai_task_calls WHERE created_at > now() - interval '1 minute')::int AS minute,
                (SELECT count(*) FROM ai_task_calls WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')::int AS today
           FROM ai_task_calls WHERE created_at >= now() - interval '${METRIC_WINDOW_HOURS} hours'`,
      );
      const funnel = await this.one<{ created: number; ran: number; shared: number }>(
        q,
        `SELECT (SELECT count(DISTINCT owner_id) FROM designs)::int AS created,
                (SELECT count(DISTINCT d.owner_id) FROM designs d JOIN design_runs r ON r.design_id = d.id)::int AS ran,
                (SELECT count(DISTINCT d.owner_id) FROM designs d JOIN design_shares s ON s.design_id = d.id)::int AS shared`,
      );
      const supportSummary = await this.one<Pick<AdminMetrics["support"], "total" | "unresolved" | "responded" | "medianFirstResponseMs">>(
        q,
        `SELECT count(*)::int AS total,
                (count(*) FILTER (WHERE status <> 'resolved'))::int AS unresolved,
                (count(*) FILTER (WHERE first_response_at >= created_at))::int AS responded,
                percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (first_response_at - created_at)) * 1000)
                  FILTER (WHERE first_response_at >= created_at) AS "medianFirstResponseMs"
           FROM support_tickets`,
      );
      const supportCategories: { key: string; n: number }[] = await q.query("SELECT category AS key, count(*)::int AS n FROM support_tickets GROUP BY category");
      const supportStatuses: { key: string; n: number }[] = await q.query("SELECT status AS key, count(*)::int AS n FROM support_tickets GROUP BY status");
      const support: AdminMetrics["support"] = {
        ...supportSummary,
        byCategory: Object.fromEntries(SUPPORT_CATEGORIES.map((key) => [key, supportCategories.find((r) => r.key === key)?.n ?? 0])) as AdminMetrics["support"]["byCategory"],
        byStatus: Object.fromEntries(SUPPORT_STATUSES.map((key) => [key, supportStatuses.find((r) => r.key === key)?.n ?? 0])) as AdminMetrics["support"]["byStatus"],
      };
      await q.query("COMMIT");

      const limits = aiSettings().quota ?? DEFAULT_QUOTA;
      const last24h = {
        signups: sum(series.signups),
        designsCreated: sum(series.designsCreated),
        runsCompleted: sum(series.runsCompleted),
        runsFailed: sum(series.runsFailed),
        aiCalls: sum(series.aiCalls),
      };
      const value: AdminMetrics = {
        generatedAt: new Date(meta.now).toISOString(),
        windowHours: METRIC_WINDOW_HOURS,
        seriesStart: new Date(meta.start).toISOString(),
        totals: totals as AdminMetrics["totals"],
        activeNow: active.n,
        last24h,
        series,
        roles: { user: totals.users, instructor: roleCount("instructor"), reviewer: roleCount("reviewer"), admin: roleCount("admin"), support: roleCount("support") },
        support,
        runs: {
          byVerdict: { pass: verdict("pass"), strained: verdict("strained"), fail: verdict("fail"), unknown: verdict("unknown") },
          queue: { pending: queue.pending, oldestPendingSeconds: queue.pending > 0 ? Math.max(0, queue.oldest ?? 0) : null },
          bottlenecks,
        },
        ai: {
          byTask: { describe: task("describe"), whatif: task("whatif"), fixes: task("fixes") },
          completed: ai.completed,
          failed: ai.failed,
          byOutcome: { completed: outcome("completed"), rate_limited: outcome("rate_limited"), invalid_output: outcome("invalid_output"), unavailable: outcome("unavailable"), cancelled: outcome("cancelled"), other: outcome("other") },
          tokens24h: ai.tokens,
          latencyMs: { p50: ai.p50 === null ? null : Math.round(ai.p50), p95: ai.p95 === null ? null : Math.round(ai.p95) },
          usage: { lastMinute: ai.minute, today: ai.today, limitPerMinute: limits.requestsPerMinute, limitPerDay: limits.requestsPerDay },
        },
        funnel: { registered: totals.users, createdDesign: funnel.created, ranDesign: funnel.ran, sharedDesign: funnel.shared },
        system: { database, cache: { ok: cacheOk }, uptimeSeconds: Math.floor(process.uptime()) },
        alerts: [],
      };
      value.alerts = deriveAlerts(value);
      return adminMetricsSchema.parse(value);
    } catch (e) {
      await q.query("ROLLBACK").catch(() => undefined);
      throw e;
    } finally {
      await q.release();
    }
  }
}

/** Plain thresholds, in one place so the dashboard and the tests agree on what raises an alert. */
export function deriveAlerts(m: AdminMetrics): Alert[] {
  const out: Alert[] = [];
  const add = (key: Alert["key"], level: Alert["level"]) => {
    if (ALERT_KEYS.includes(key) && ALERT_LEVELS.includes(level)) out.push({ key, level });
  };
  const oldest = m.runs.queue.oldestPendingSeconds ?? 0;
  if (oldest >= 600) add("queue_backlog", "critical");
  else if (oldest >= 120 || m.runs.queue.pending >= 10) add("queue_backlog", "warning");
  const runs = m.last24h.runsCompleted + m.last24h.runsFailed;
  if (m.last24h.runsFailed >= 5 && m.last24h.runsFailed / runs >= 0.3) add("run_failures_high", "warning");
  const calls = m.ai.completed + m.ai.failed;
  if (m.ai.failed >= 5 && m.ai.failed / calls >= 0.5) add("ai_failures_high", "warning");
  const share = Math.max(m.ai.usage.lastMinute / Math.max(1, m.ai.usage.limitPerMinute), m.ai.usage.today / Math.max(1, m.ai.usage.limitPerDay));
  if (share >= 1) add("ai_quota_near", "critical");
  else if (share >= 0.8) add("ai_quota_near", "warning");
  if (!m.system.database.ok) add("database_slow", "critical");
  else if (m.system.database.latencyMs > 500) add("database_slow", "warning");
  if (!m.system.cache.ok) add("cache_down", "critical");
  return out;
}
