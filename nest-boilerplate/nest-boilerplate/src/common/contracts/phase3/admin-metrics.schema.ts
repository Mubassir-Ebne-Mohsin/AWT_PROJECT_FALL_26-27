import { z } from "zod";
import { SUPPORT_CATEGORIES, SUPPORT_STATUSES } from "@/common/contracts/phase3/support.schema";
import { componentType } from "@/common/contracts/phase2/graph.schema";

// Admin live dashboard. Aggregates only: every value is a count, a duration or a closed key. No account, design, note, prompt
// or email text can appear here, and the strict objects make a stray field a contract failure rather than a leak.

export const METRIC_WINDOW_HOURS = 24;
const count = z.number().int().min(0);
const ms = z.number().min(0);

/** One value per hour, oldest first, always exactly METRIC_WINDOW_HOURS entries. */
const COMPONENT_TYPES = componentType.options;
/** Closed keys only: a count per component type, so no free text can come through. */
const byComponent = z.strictObject(Object.fromEntries(COMPONENT_TYPES.map((t) => [t, count])) as Record<(typeof COMPONENT_TYPES)[number], typeof count>);
export const AI_OUTCOMES = ["completed", "rate_limited", "invalid_output", "unavailable", "cancelled", "other"] as const;
const bySupportCategory = z.strictObject(Object.fromEntries(SUPPORT_CATEGORIES.map((key) => [key, count])) as Record<(typeof SUPPORT_CATEGORIES)[number], typeof count>);
const bySupportStatus = z.strictObject(Object.fromEntries(SUPPORT_STATUSES.map((key) => [key, count])) as Record<(typeof SUPPORT_STATUSES)[number], typeof count>);
const hourly = z.array(count).length(METRIC_WINDOW_HOURS);

export const RUN_VERDICTS = ["pass", "strained", "fail", "unknown"] as const;
export const AI_TASKS = ["describe", "whatif", "fixes"] as const;
export const ALERT_KEYS = ["queue_backlog", "run_failures_high", "ai_failures_high", "ai_quota_near", "database_slow", "cache_down"] as const;
export const ALERT_LEVELS = ["info", "warning", "critical"] as const;

export const adminMetricsSchema = z.strictObject({
  /** Server time the snapshot was read, from one transaction. */
  generatedAt: z.iso.datetime(),
  windowHours: z.literal(METRIC_WINDOW_HOURS),
  /** Start of the oldest hourly bucket (UTC, on the hour). */
  seriesStart: z.iso.datetime(),
  totals: z.strictObject({
    users: count,
    suspendedUsers: count,
    designs: count,
    archivedDesigns: count,
    runs: count,
    shares: count,
    openShares: count,
    notes: count,
  }),
  /** Accounts with any write of their own (design edit, run, AI call) in the last 15 minutes. Derived, not a login count. */
  activeNow: count,
  last24h: z.strictObject({
    signups: count,
    designsCreated: count,
    runsCompleted: count,
    runsFailed: count,
    aiCalls: count,
  }),
  series: z.strictObject({
    signups: hourly,
    designsCreated: hourly,
    runsCompleted: hourly,
    runsFailed: hourly,
    aiCalls: hourly,
  }),
  roles: z.strictObject({ user: count, instructor: count, reviewer: count, admin: count, support: count }),
  /** All-time aggregates. Only valid first public reply timestamps contribute to the median/denominator. */
  support: z.strictObject({
    total: count,
    unresolved: count,
    responded: count,
    medianFirstResponseMs: ms.nullable(),
    byCategory: bySupportCategory,
    byStatus: bySupportStatus,
  }),
  runs: z.strictObject({
    byVerdict: z.strictObject({ pass: count, strained: count, fail: count, unknown: count }),
    queue: z.strictObject({ pending: count, oldestPendingSeconds: count.nullable() }),
    /** The limiting component type in strained or failed runs. */
    bottlenecks: byComponent,
  }),
  ai: z.strictObject({
    byTask: z.strictObject({ describe: count, whatif: count, fixes: count }),
    completed: count,
    failed: count,
    byOutcome: z.strictObject({ completed: count, rate_limited: count, invalid_output: count, unavailable: count, cancelled: count, other: count }),
    tokens24h: count,
    latencyMs: z.strictObject({ p50: ms.nullable(), p95: ms.nullable() }),
    usage: z.strictObject({ lastMinute: count, today: count, limitPerMinute: count, limitPerDay: count }),
  }),
  funnel: z.strictObject({ registered: count, createdDesign: count, ranDesign: count, sharedDesign: count }),
  system: z.strictObject({
    database: z.strictObject({ ok: z.boolean(), latencyMs: ms }),
    cache: z.strictObject({ ok: z.boolean() }),
    uptimeSeconds: count,
  }),
  alerts: z.array(z.strictObject({ key: z.enum(ALERT_KEYS), level: z.enum(ALERT_LEVELS) })).max(ALERT_KEYS.length),
});

export type AdminMetrics = z.infer<typeof adminMetricsSchema>;
