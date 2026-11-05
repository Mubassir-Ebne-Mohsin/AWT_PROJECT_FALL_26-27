import type { components } from "@/lib/api/phase3-schema";

export type AdminMetrics = components["schemas"]["AdminMetrics"];
export type MetricAlert = AdminMetrics["alerts"][number];

// ---- Live state -------------------------------------------------------------------------------------------------------
// The dashboard polls. The rules live here, as plain functions, so they can be tested without a browser or a clock.

export const POLL_MS = 5000;
export const MAX_BACKOFF_MS = 40000;
/** After this long without a good answer, the numbers on screen are called stale and said to be old. */
export const STALE_AFTER_MS = 60000;

export type LiveStatus = "live" | "paused" | "reconnecting" | "stale";
export interface LiveState {
  data: AdminMetrics | null;
  /** Failed requests in a row; zero after any good answer. */
  failures: number;
  /** The Admin pressed Pause. */
  paused: boolean;
  /** The tab is in the background, so nobody is looking and nothing is polled. */
  hidden: boolean;
  /** Client time the last good snapshot arrived. */
  lastGoodAt: number | null;
}

export const initialLive = (hidden = false): LiveState => ({ data: null, failures: 0, paused: false, hidden, lastGoodAt: null });

/** 5s, then 10s, 20s, 40s and no slower, so a down server is not hammered and a recovered one is noticed within 40 seconds. */
export const nextDelay = (failures: number) => Math.min(MAX_BACKOFF_MS, POLL_MS * 2 ** Math.max(0, failures));

export const shouldPoll = (s: LiveState) => !s.paused && !s.hidden;

/**
 * A snapshot that is older than the one on screen (a slow answer that overtook a faster one) is ignored whole: the numbers never
 * go backwards. A snapshot read at the same instant is fine, because the server may serve one cached read to several callers.
 */
export function onSuccess(s: LiveState, data: AdminMetrics, now: number): LiveState {
  if (s.data && Date.parse(data.generatedAt) < Date.parse(s.data.generatedAt)) return s;
  return { ...s, data, failures: 0, lastGoodAt: now };
}

export const onFailure = (s: LiveState): LiveState => ({ ...s, failures: s.failures + 1 });
export const withPaused = (s: LiveState, paused: boolean): LiveState => ({ ...s, paused });
export const withHidden = (s: LiveState, hidden: boolean): LiveState => ({ ...s, hidden });

export function liveStatus(s: LiveState, now: number): LiveStatus {
  if (s.paused || s.hidden) return "paused";
  if (s.failures === 0) return "live";
  if (s.lastGoodAt !== null && now - s.lastGoodAt > STALE_AFTER_MS) return "stale";
  return "reconnecting";
}

/** True when the tab should fetch right away on becoming visible or on pressing Resume: nothing recent is on screen. */
export const needsFetchNow = (s: LiveState, now: number) => s.lastGoodAt === null || now - s.lastGoodAt >= POLL_MS;

export const STATUS_TEXT: Record<LiveStatus, string> = {
  live: "Live",
  paused: "Paused",
  reconnecting: "Reconnecting",
  stale: "Out of date",
};

export function statusDetail(s: LiveState, status: LiveStatus, now: number): string {
  if (status === "live") return "Updates every 5 seconds.";
  if (status === "paused") return s.paused ? "Updates are paused. The numbers below are not changing." : "Updates are paused while this tab is in the background.";
  const age = s.lastGoodAt === null ? null : ageText(Math.max(0, Math.round((now - s.lastGoodAt) / 1000)));
  if (status === "reconnecting") return age ? `Could not reach the server. Trying again. Showing numbers from ${age} ago.` : "Could not reach the server. Trying again.";
  return `The server has not answered for over a minute. These numbers are ${age ?? "old"} old and may be wrong.`;
}

// ---- Formatting -------------------------------------------------------------------------------------------------------

/** 1,234 stays whole; from 10,000 it is 12.3k so a card never overflows. */
export function compact(n: number): string {
  if (!Number.isFinite(n)) return "–";
  if (n < 10000) return n.toLocaleString("en-US");
  if (n < 999_500) return (n / 1000).toFixed(n < 100000 ? 1 : 0).replace(/\.0$/, "") + "k";
  return (n / 1_000_000).toFixed(n < 10_000_000 ? 2 : 1).replace(/\.?0+$/, "") + "M";
}

/** "45 s", "3 min", "2 h 5 min". */
export function ageText(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}

export const utcTime = (iso: string) => iso.slice(11, 19) + " UTC";

/** The hour a bar stands for, e.g. "14:00 UTC". Bucket 0 is the oldest. */
export function bucketLabel(seriesStart: string, index: number): string {
  const t = new Date(Date.parse(seriesStart) + index * 3600000);
  return String(t.getUTCHours()).padStart(2, "0") + ":00 UTC";
}

export const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);

/** Share as a whole percent; 0 when the whole is 0, never NaN. */
export const percent = (part: number, whole: number) => (whole <= 0 ? 0 : Math.round((part / whole) * 100));

/** Bar height in 0..1 against the tallest bar of the same chart; a non-zero value is always at least slightly visible. */
export function barHeights(values: readonly number[]): number[] {
  const top = Math.max(0, ...values);
  if (top === 0) return values.map(() => 0);
  return values.map((v) => (v === 0 ? 0 : Math.max(0.06, v / top)));
}

// ---- Alerts -----------------------------------------------------------------------------------------------------------

const ALERT_TEXT: Record<MetricAlert["key"], string> = {
  queue_backlog: "Simulation runs are waiting longer than they should.",
  run_failures_high: "A large share of simulation runs failed in the last 24 hours.",
  ai_failures_high: "Half or more of the AI calls failed in the last 24 hours.",
  ai_quota_near: "AI usage is close to the hosted limit.",
  database_slow: "The database is slow or not answering.",
  cache_down: "The cache is not answering.",
};
export const alertText = (key: MetricAlert["key"]) => ALERT_TEXT[key];
export const LEVEL_TEXT: Record<MetricAlert["level"], string> = { info: "Note", warning: "Warning", critical: "Critical" };
const LEVEL_RANK: Record<MetricAlert["level"], number> = { critical: 0, warning: 1, info: 2 };
export const sortedAlerts = (alerts: readonly MetricAlert[]) => [...alerts].sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || a.key.localeCompare(b.key));

export const VERDICT_TEXT = { pass: "Passed", strained: "Strained", fail: "Failed", unknown: "No verdict" } as const;
export const TASK_TEXT = { describe: "Describe a system", whatif: "What-if sentence", fixes: "Fix by goal" } as const;

export const COMPONENT_TEXT = {
  client: "Clients",
  cdn: "CDN",
  lb: "Load balancer",
  gateway: "Gateway",
  app: "App servers",
  worker: "Workers",
  cache: "Cache",
  db: "Database",
  replica: "Read replica",
  queue: "Queue",
  storage: "Storage",
  external: "External service",
} as const;
export const OUTCOME_TEXT = {
  completed: "Answered",
  rate_limited: "Held back by a limit",
  invalid_output: "Model answer rejected",
  unavailable: "Model not available",
  cancelled: "Cancelled",
  other: "Other failure",
} as const;

// ---- Wall display ------------------------------------------------------------------------------------------------------

/** Seconds each lower panel stays up before the next one. */
export const WALL_CYCLE_S = 10;
/** Index of the panel on show after `seconds` of cycling; never moves when cycling is off. */
export const wallPanel = (seconds: number, count: number, cycling: boolean) => (cycling ? Math.floor(seconds / WALL_CYCLE_S) % count : 0);
