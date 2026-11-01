import { test } from "node:test";
import assert from "node:assert/strict";
import { mean, percentile, seeded, summarize } from "../src/stats.mjs";
import { arrivalOffsets } from "../src/generator.mjs";

const hundred = Array.from({ length: 100 }, (_, i) => i + 1);

test("percentile is the nearest-rank value: the smallest value with at least p percent at or below it", () => {
  assert.equal(percentile(hundred, 50), 50);
  assert.equal(percentile(hundred, 95), 95);
  assert.equal(percentile(hundred, 99), 99);
  assert.equal(percentile(hundred, 100), 100);
  assert.equal(percentile(hundred, 1), 1);
  assert.equal(percentile([5], 99), 5);
  assert.equal(percentile([10, 20, 30, 40], 50), 20);
  assert.equal(percentile([10, 20, 30, 40], 51), 30);
});

test("percentile does not depend on input order and does not change its input", () => {
  const shuffled = [...hundred].reverse();
  const copy = [...shuffled];
  assert.equal(percentile(shuffled, 95), 95);
  assert.deepEqual(shuffled, copy);
});

test("empty input gives NaN, never a made-up zero", () => {
  assert.ok(Number.isNaN(percentile([], 95)));
  assert.ok(Number.isNaN(mean([])));
  const s = summarize([]);
  assert.equal(s.count, 0);
  for (const key of ["p50", "p95", "p99", "mean", "max"]) assert.ok(Number.isNaN(s[key]), key);
});

test("summarize reports count, percentiles, mean and max", () => {
  const s = summarize(hundred);
  assert.deepEqual(s, { count: 100, p50: 50, p95: 95, p99: 99, mean: 50.5, max: 100 });
});

test("the seeded stream repeats for the same seed, differs for another, and stays in [0, 1)", () => {
  const a = seeded(7);
  const b = seeded(7);
  const c = seeded(8);
  const first = Array.from({ length: 50 }, a);
  assert.deepEqual(first, Array.from({ length: 50 }, b));
  assert.notDeepEqual(first, Array.from({ length: 50 }, c));
  for (const x of first) assert.ok(x >= 0 && x < 1);
});

const gaps = (offsets) => offsets.slice(1).map((t, i) => t - offsets[i]);
const cv = (xs) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))) / m;
};

test("Poisson arrivals: about rps x duration of them, ascending, inside the window, with exponential gaps", () => {
  const offsets = arrivalOffsets({ rps: 1000, durationMs: 20000, arrival: "poisson", seed: 3 });
  assert.ok(Math.abs(offsets.length - 20000) / 20000 < 0.03, String(offsets.length));
  for (let i = 1; i < offsets.length; i++) assert.ok(offsets[i] >= offsets[i - 1]);
  assert.ok(offsets[0] >= 0 && offsets.at(-1) < 20000);
  assert.ok(Math.abs(mean(gaps(offsets)) - 1) < 0.05);
  // For exponential gaps the spread equals the mean (coefficient of variation 1).
  assert.ok(Math.abs(cv(gaps(offsets)) - 1) < 0.1, String(cv(gaps(offsets))));
});

test("the same seed gives the same arrivals and a different seed gives different ones", () => {
  const a = arrivalOffsets({ rps: 200, durationMs: 2000, seed: 5 });
  assert.deepEqual(a, arrivalOffsets({ rps: 200, durationMs: 2000, seed: 5 }));
  assert.notDeepEqual(a, arrivalOffsets({ rps: 200, durationMs: 2000, seed: 6 }));
});

test("evenly spaced arrivals have a constant gap", () => {
  const offsets = arrivalOffsets({ rps: 50, durationMs: 1000, arrival: "uniform" });
  assert.equal(offsets.length, 50);
  for (const g of gaps(offsets)) assert.ok(Math.abs(g - 20) < 1e-9);
  assert.ok(cv(gaps(offsets)) < 1e-9);
});

test("a rate of zero or less schedules nothing", () => {
  assert.deepEqual(arrivalOffsets({ rps: 0, durationMs: 1000 }), []);
  assert.deepEqual(arrivalOffsets({ rps: -5, durationMs: 1000, arrival: "uniform" }), []);
});
