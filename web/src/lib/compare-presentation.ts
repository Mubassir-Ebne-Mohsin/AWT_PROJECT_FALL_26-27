import type { Comparison } from "@/lib/api/history";
import { milliseconds, numberText, percent } from "@/lib/result-presentation";

export type Reason = Comparison["reasons"][number];
export type Metrics = NonNullable<NonNullable<Comparison["a"]["run"]>["metrics"]>;

/** Plain-language explanation of why two results cannot be compared. `a` and `b` are the revision numbers. */
export function reasonText(reason: Reason, a: number, b: number): string {
  switch (reason) {
    case "RUN_MISSING_A":
      return `Revision ${a} has no completed test run to compare.`;
    case "RUN_MISSING_B":
      return `Revision ${b} has no completed test run to compare.`;
    case "RUN_NOT_FOR_VERSION_A":
      return `The run chosen for revision ${a} was recorded for a different version.`;
    case "RUN_NOT_FOR_VERSION_B":
      return `The run chosen for revision ${b} was recorded for a different version.`;
    case "RUN_NOT_COMPLETED_A":
      return `The run for revision ${a} has not completed.`;
    case "RUN_NOT_COMPLETED_B":
      return `The run for revision ${b} has not completed.`;
    case "RUN_NOT_SIMULATION_A":
      return `The run chosen for revision ${a} is a Limits search, not a test run.`;
    case "RUN_NOT_SIMULATION_B":
      return `The run chosen for revision ${b} is a Limits search, not a test run.`;
    case "TRAFFIC_DIFFERS":
      return "The two runs used different traffic settings, so their numbers measure different things.";
    case "ENGINE_DIFFERS":
      return "The two runs were calculated with different model versions.";
  }
}

export const NOT_COMPARABLE_GUIDANCE =
  "Nothing was subtracted. Pick another run above, or run a test so both versions have a completed result at the same traffic, then compare again.";

export type MetricKey = "p50" | "p95" | "p99" | "errorRate" | "throughput";
interface Row {
  key: MetricKey;
  label: string;
  better: "lower" | "higher";
  /** Changes smaller than this are shown as no change. */
  epsilon: number;
  format: (n: number) => string;
  formatDelta: (n: number) => string;
}
const signed = (n: number, body: string) => (n > 0 ? "+" : n < 0 ? "−" : "") + body;
export const METRIC_ROWS: Row[] = [
  { key: "p50", label: "p50 latency", better: "lower", epsilon: 0.01, format: milliseconds, formatDelta: (n) => signed(n, milliseconds(Math.abs(n))) },
  { key: "p95", label: "p95 latency", better: "lower", epsilon: 0.01, format: milliseconds, formatDelta: (n) => signed(n, milliseconds(Math.abs(n))) },
  { key: "p99", label: "p99 latency", better: "lower", epsilon: 0.01, format: milliseconds, formatDelta: (n) => signed(n, milliseconds(Math.abs(n))) },
  { key: "errorRate", label: "Error rate", better: "lower", epsilon: 1e-6, format: percent, formatDelta: (n) => signed(n, numberText(Math.abs(n) * 100, 3) + " percentage points") },
  { key: "throughput", label: "Throughput", better: "higher", epsilon: 0.01, format: (n) => numberText(n, 0) + " rps", formatDelta: (n) => signed(n, numberText(Math.abs(n), 0) + " rps") },
];

export type Tone = "better" | "worse" | "same";
/** Better, worse or no change, using each metric's own direction. A tiny change is not called an improvement. */
export function deltaTag(row: Pick<Row, "better" | "epsilon">, from: number, delta: number): { label: string; tone: Tone } {
  if (Math.abs(delta) <= Math.max(Math.abs(from) * 0.005, row.epsilon)) return { label: "No change", tone: "same" };
  const improved = row.better === "lower" ? delta < 0 : delta > 0;
  return improved ? { label: "Better", tone: "better" } : { label: "Worse", tone: "worse" };
}

const RANK = { pass: 0, strained: 1, fail: 2 } as const;
export const verdictText = (v: Metrics["verdict"]) => (v === "pass" ? "Passes" : v === "strained" ? "Strained" : "Breaks");
export function verdictTag(from: Metrics["verdict"], to: Metrics["verdict"]): { label: string; tone: Tone } {
  if (from === to) return { label: "No change", tone: "same" };
  return RANK[to] < RANK[from] ? { label: "Better", tone: "better" } : { label: "Worse", tone: "worse" };
}

/** Older revision first, so the comparison always reads from earlier to later. */
export const orderPair = (x: number, y: number): [number, number] => (x < y ? [x, y] : [y, x]);
