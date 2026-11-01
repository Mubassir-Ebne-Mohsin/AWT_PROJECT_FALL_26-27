// Small statistics helpers for the calibration experiment. No dependencies.

/** Nearest-rank percentile of a list of numbers (p from 0 to 100): the smallest value with at least p percent of the data at or below it. */
export function percentile(values, p) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil((p / 100) * sorted.length)));
  return sorted[rank - 1];
}

export const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN);

/** p50, p95, p99, mean, max and count of a list of latencies (ms). Empty input gives NaN, never a made-up zero. */
export function summarize(values) {
  return {
    count: values.length,
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    p99: percentile(values, 99),
    mean: mean(values),
    max: values.length ? Math.max(...values) : NaN,
  };
}

/** A small seeded random stream (mulberry32), so a run's arrival times can be repeated exactly. */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
