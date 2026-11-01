import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  analysisText,
  analyzeConfig,
  crossing,
  currentAnalysis,
  dataPath,
  exclusionReason,
  expectations,
  loadMeasurements,
  predict,
  RULES,
  type Attempt,
  type ConfigAnalysis,
  type Measurements,
} from "@/src/script/calibration-data";
import { fixturesMatch } from "@/src/script/learn-fixtures";

// The calibration analysis compares the real engine's predictions with measurements of a real running service. These tests
// check the rules it applies (written down before the measurements in docs/CALIBRATION-EXPECTATIONS.md), the arithmetic, the
// four expectations, that the stored analysis is current, and that the numbers in the written correction match the data.

const LEVELS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1.05, 1.2];

type Spec = { p50?: number; p95?: number; p99?: number; errorRate?: number; achieved?: number; served?: number; seconds?: number; pages?: number | null; avail?: number | null; valid?: boolean };
const attempt = (s: Spec = {}): Attempt => ({
  startedAt: 0,
  endedAt: (s.seconds ?? 38) * 1000,
  serviceStats: { served: s.served ?? 1900 },
  achievedRps: s.achieved ?? 40,
  errorRate: s.errorRate ?? 0,
  latency: { count: 100, p50: s.p50 ?? 21, p95: s.p95 ?? 40, p99: s.p99 ?? 60, mean: 25, max: 100 },
  valid: s.valid ?? true,
  paging: { samples: 17, maxPagesPerSec: s.pages === undefined ? 0 : s.pages, minAvailableMb: s.avail === undefined ? 2000 : s.avail },
});
function measurements(repeats: Array<Record<number, Spec>>, levels = [0.1, 0.3, 1.2]): Measurements {
  return {
    config: { workers: 1, workMs: 20, nominalCapacityRps: 50, levels },
    repeats: repeats.map((byLevel, index) => ({ index, steps: levels.map((level) => ({ level, rps: level * 50, attempts: [attempt(byLevel[level])], final: 0 })) })),
  };
}

describe("exclusion rule (as committed)", () => {
  it("keeps a clean step and excludes by each stated reason, naming it", () => {
    expect(exclusionReason(attempt())).toBeNull();
    expect(exclusionReason(attempt({ valid: false }))).toMatch(/fell behind/);
    expect(exclusionReason(attempt({ pages: 101 }))).toMatch(/paging above 100/);
    expect(exclusionReason(attempt({ avail: 1500 }))).toMatch(/available memory below 1536/);
  });
  it("applies the limits exactly at the boundary and does not exclude on a missing reading", () => {
    expect(exclusionReason(attempt({ pages: 100 }))).toBeNull();
    expect(exclusionReason(attempt({ avail: 1536 }))).toBeNull();
    expect(exclusionReason(attempt({ pages: null, avail: null }))).toBeNull();
    expect(RULES.maxPagesPerSec).toBe(100);
    expect(RULES.minAvailableMb).toBe(1536);
  });
});

describe("variants and the model's two inputs", () => {
  const data = measurements([
    { 0.1: { p50: 20, achieved: 5, served: 100, pages: 5 }, 0.3: { p50: 21 }, 1.2: { p50: 2900, achieved: 36, served: 1900, seconds: 38 } },
    { 0.1: { p50: 22, achieved: 5, pages: 5000 }, 0.3: { p50: 21 }, 1.2: { p50: 2900, achieved: 44, served: 1938, seconds: 38 } },
  ]);

  it("committed: leaves out steps with paging, lists them, and fits only from what is left", () => {
    const c = analyzeConfig(data, "committed");
    expect(c.stepsTotal).toBe(6);
    expect(c.exclusions).toEqual([{ repeat: 1, level: 0.1, reason: expect.stringMatching(/paging above 100/) }]);
    expect(c.stepsIncluded).toBe(5);
    // Service time from the 10% step of the repeats that remain (only the first), not the mean of both.
    expect(c.fit.serviceMs).toBe(20);
    expect(c.fit.repeatsForServiceTime).toBe(1);
  });

  it("noExclusions: keeps every valid step but still takes capacity as the highest throughput the generator counted", () => {
    const c = analyzeConfig(data, "noExclusions");
    expect(c.exclusions).toEqual([]);
    expect(c.fit.serviceMs).toBe(21); // mean of 20 and 22
    // Per repeat the highest "achieved" (40 default at 0.3, 36 or 44 at 1.2), then the mean across repeats: (40 + 44) / 2.
    expect(c.fit.capacityRps).toBe(42);
  });

  it("corrected: capacity is what the service completed in the heaviest step, served divided by the time taken", () => {
    const c = analyzeConfig(data, "corrected");
    expect(c.exclusions).toEqual([]);
    expect(c.fit.capacityRps).toBeCloseTo((1900 / 38 + 1938 / 38) / 2, 10);
    expect(c.fit.capacityRps).toBeCloseTo(50.5, 10);
  });

  it("a step where the generator fell behind is left out in every variant", () => {
    const bad = measurements([{ 0.1: { p50: 20 }, 0.3: {}, 1.2: { valid: false } }, { 0.1: { p50: 20 }, 0.3: {}, 1.2: {} }]);
    for (const v of ["committed", "noExclusions", "corrected"] as const) expect(analyzeConfig(bad, v).exclusions).toEqual([{ repeat: 0, level: 1.2, reason: expect.stringMatching(/fell behind/) }]);
  });

  it("refuses to fit when no usable step is left", () => {
    const none = measurements([{ 0.1: { pages: 900 } }]);
    expect(() => analyzeConfig(none, "committed")).toThrow(/no usable step/);
  });
});

describe("rows", () => {
  const data = measurements([
    { 0.1: { p50: 21, p95: 35 }, 0.3: { p50: 22, p95: 40 }, 1.2: { p95: 2995, errorRate: 0.3, served: 1900 } },
    { 0.1: { p50: 21, p95: 35 }, 0.3: { p50: 22, p95: 60 }, 1.2: { p95: 2995, errorRate: 0.3, served: 1900 } },
  ]);
  const c = analyzeConfig(data, "corrected");
  const row = (level: number) => c.rows.find((r) => r.level === level)!;

  it("compares only from 30% load; the light steps are for the fit", () => {
    expect(row(0.1).compared).toBe(false);
    expect(row(0.3).compared).toBe(true);
    expect(row(1.2).compared).toBe(true);
  });
  it("the model's side is the real engine run with the fitted inputs at the step's nominal rate", () => {
    for (const r of c.rows) {
      expect(r.model).toEqual(predict(c.fit.capacityRps, c.fit.serviceMs, r.rps));
      expect(r.model.p95).toBeGreaterThan(0);
    }
  });
  it("measured values are the mean over repeats, with the spread, and the difference has the right sign", () => {
    const r = row(0.3);
    expect(r.measured.p95).toBe(50);
    expect(r.measured.p95Min).toBe(40);
    expect(r.measured.p95Max).toBe(60);
    expect(r.p95DifferenceMs).toBeCloseTo(r.model.p95 - 50, 10);
    expect(r.p95DifferencePercent).toBeCloseTo(((r.model.p95 - 50) / 50) * 100, 10);
    expect(r.direction).toBe(r.model.p95 > 50 ? "model higher" : "model lower");
  });
  it("calls a difference meaningful only when it is larger than the spread across repeats", () => {
    // At 30% the spread of the measured p95 across the two repeats is 20 ms.
    expect(row(0.3).meaningful).toBe(Math.abs(row(0.3).p95DifferenceMs!) > 20);
    // At 120% both repeats measured the same p95, so any difference at all is larger than the spread.
    expect(row(1.2).meaningful).toBe(Math.abs(row(1.2).p95DifferenceMs!) > 0);
    const one = analyzeConfig(measurements([{ 0.1: {}, 0.3: {}, 1.2: {} }]), "corrected");
    expect(one.rows.find((r) => r.level === 0.3)!.meaningful).toBeNull();
  });
  it("marks a row censored when requests timed out, because the measured latencies then cover only answered requests", () => {
    expect(row(1.2).censored).toBe(true);
    expect(row(0.3).censored).toBe(false);
  });
});

describe("crossing", () => {
  const pts = [
    { rps: 10, value: 20 },
    { rps: 20, value: 40 },
    { rps: 30, value: 100 },
    { rps: 40, value: 30 },
  ];
  it("interpolates between the last point below and the first above, and uses the first crossing", () => {
    expect(crossing(pts, 70)).toBeCloseTo(20 + ((70 - 40) / (100 - 40)) * 10, 10);
    // 30 is exceeded first between the 10 and 20 points (value 20 to 40), not by the later fall back to 30.
    expect(crossing(pts, 30)).toBeCloseTo(15, 10);
  });
  it("is the first load when the first point already exceeds, and null when it never does", () => {
    expect(crossing(pts, 5)).toBe(10);
    expect(crossing(pts, 100)).toBeNull();
    expect(crossing([], 1)).toBeNull();
  });
});

describe("the four expectations", () => {
  const cfg = (rows: Array<{ level: number; measured?: Record<string, number>; model?: Record<string, number> }>, extra: Partial<ConfigAnalysis> = {}) =>
    ({
      fit: { serviceMs: 20, capacityRps: 50, repeatsForServiceTime: 3, repeatsForCapacity: 3 },
      breakingPoint: { thresholdMs: 60, measuredRps: 100, modelRps: 110, relativeDifference: 0.1 },
      rows: rows.map((r) => ({ censored: false, measured: { p50: 20, p95: 30, ...r.measured }, model: { p50: 25, p95: 40, ...r.model }, level: r.level })),
      ...extra,
    }) as unknown as ConfigAnalysis;
  const light = (mp: number, ap: number) => [
    { level: 0.1, model: { p95: mp }, measured: { p95: ap } },
    { level: 0.2, model: { p95: mp }, measured: { p95: ap } },
  ];

  it("1: held only when the model's p95 is above the measured p95 at both light steps", () => {
    const four = cfg([]);
    expect(expectations(cfg(light(40, 30)), four)[0].held).toBe(true);
    expect(expectations(cfg(light(30, 30)), four)[0].held).toBe(false);
    expect(expectations(cfg([{ level: 0.1, model: { p95: 40 }, measured: { p95: 30 } }, { level: 0.2, model: { p95: 20 }, measured: { p95: 30 } }]), four)[0].held).toBe(false);
    expect(expectations(cfg([]), four)[0].held).toBeNull();
  });
  it("2: compares the waiting time (p50 minus the service time) from 50 to 80%", () => {
    const rows = (mp50: number, ap50: number) => [0.5, 0.6, 0.7, 0.8].map((level) => ({ level, model: { p50: mp50 }, measured: { p50: ap50 } }));
    const four = cfg([]);
    expect(expectations(cfg(rows(40, 25)), four)[1].held).toBe(true);
    expect(expectations(cfg(rows(25, 40)), four)[1].held).toBe(false);
    expect(expectations(cfg(rows(30, 30)), four)[1].held).toBe(false);
    expect(expectations(cfg([]), four)[1].held).toBeNull();
    // Every step from 50 to 80% counts: one failing step at either end is enough to fail it.
    for (const failing of [0.5, 0.8]) {
      const mixed = [0.5, 0.6, 0.7, 0.8].map((level) => ({ level, model: { p50: level === failing ? 20 : 40 }, measured: { p50: 25 } }));
      expect(expectations(cfg(mixed), four)[1].held).toBe(false);
    }
  });
  it("3: needs all three steps from 90% and the measured p95 to grow at least as fast at each", () => {
    const rows = (m: number[], mo: number[]) => [0.9, 0.95, 1.05, 1.2].slice(0, m.length).map((level, i) => ({ level, measured: { p95: m[i] }, model: { p95: mo[i] } }));
    const four = cfg([]);
    expect(expectations(cfg(rows([100, 200, 400, 800], [100, 150, 300, 500])), four)[2].held).toBe(true);
    expect(expectations(cfg(rows([100, 200, 400, 800], [100, 150, 300, 1600])), four)[2].held).toBe(false);
    expect(expectations(cfg(rows([100, 200, 400, 800], [100, 400, 300, 500])), four)[2].held).toBe(false);
    expect(expectations(cfg(rows([100, 200, 400], [100, 150, 300])), four)[2].held).toBeNull();
  });
  it("4: held when the breaking points are within 15%, not at 15.1%, and undetermined when either is missing", () => {
    const one = cfg([]);
    const bp = (relativeDifference: number | null) => cfg([], { breakingPoint: { thresholdMs: 60, measuredRps: 100, modelRps: 115, relativeDifference } });
    expect(expectations(one, bp(0.149))[3].held).toBe(true);
    expect(expectations(one, bp(0.15))[3].held).toBe(true);
    expect(expectations(one, bp(0.151))[3].held).toBe(false);
    expect(expectations(one, bp(null))[3].held).toBeNull();
  });
});

describe("the stored analysis, and the measurements it comes from", () => {
  const w1 = loadMeasurements("w1.json");
  const w4 = loadMeasurements("w4.json");
  const analysis = currentAnalysis();
  const doc = readFileSync(resolve(__dirname, "../../../../../docs/CALIBRATION-EXPECTATIONS.md"), "utf8");

  it("is current: the stored file equals a fresh run of the engine over the stored measurements", () => {
    const stored = JSON.parse(readFileSync(dataPath("analysis.json"), "utf8"));
    expect(fixturesMatch(stored, JSON.parse(analysisText(analysis)))).toBe(true);
  });

  it("the measurements are complete: three repeats of the twelve levels, every step valid, one attempt reported per step", () => {
    for (const m of [w1, w4]) {
      expect(m.config.levels).toEqual(LEVELS);
      expect(m.repeats).toHaveLength(3);
      for (const r of m.repeats) {
        expect(r.steps.map((s) => s.level)).toEqual(LEVELS);
        for (const s of r.steps) expect(s.attempts[s.final].valid).toBe(true);
      }
    }
    expect([w1.config.workers, w4.config.workers]).toEqual([1, 4]);
  });

  it("the committed rule leaves out exactly the steps with paging above the limit (42 of 72), and the other variants leave out none", () => {
    const count = (m: Measurements) => m.repeats.flatMap((r) => r.steps).filter((s) => exclusionReason(s.attempts[s.final]) !== null).length;
    expect(analysis.oneWorker.committed.exclusions).toHaveLength(count(w1));
    expect(analysis.fourWorkers.committed.exclusions).toHaveLength(count(w4));
    expect(count(w1) + count(w4)).toBe(42);
    for (const v of ["noExclusions", "corrected"] as const) {
      expect(analysis.oneWorker[v].exclusions).toEqual([]);
      expect(analysis.fourWorkers[v].exclusions).toEqual([]);
    }
  });

  it("the corrected capacity is within 2% of the service's nominal 50 and 200, and infers 1 and 4 servers; the committed fit for four workers infers 3", () => {
    const servers = (c: ConfigAnalysis) => Math.max(1, Math.round((c.fit.capacityRps * c.fit.serviceMs) / 1000));
    expect(Math.abs(analysis.oneWorker.corrected.fit.capacityRps / 50 - 1)).toBeLessThan(0.02);
    expect(Math.abs(analysis.fourWorkers.corrected.fit.capacityRps / 200 - 1)).toBeLessThan(0.02);
    expect(servers(analysis.oneWorker.corrected)).toBe(1);
    expect(servers(analysis.fourWorkers.corrected)).toBe(4);
    expect(servers(analysis.fourWorkers.committed)).toBe(3);
  });

  it("the verdicts in the written correction match the data, variant by variant", () => {
    const held = (v: "committed" | "noExclusions" | "corrected") => analysis.expectations[v].map((e) => e.held);
    expect(held("committed")).toEqual([true, true, null, false]);
    expect(held("noExclusions")).toEqual([true, true, false, true]);
    expect(held("corrected")).toEqual([true, true, false, true]);
    expect(doc).toMatch(/\| 1\. .*\| held \| held \| held \|/);
    expect(doc).toMatch(/\| 2\. .*\| held \| held \| held \|/);
    expect(doc).toMatch(/\| 3\. .*\| undetermined \(steps missing\) \| not held \| not held \|/);
    expect(doc).toMatch(/\| 4\. .*\| not held \(fit artifact\) \| held \| held \|/);
  });

  it("the written expectations in the document are the ones the analysis tests", () => {
    for (const phrase of ["model's p95 at light load", "waiting time", "measured p95 rises at least as fast", "within 15%"]) expect(doc).toContain(phrase);
    expect(analysis.expectations.corrected.map((e) => e.id)).toEqual([1, 2, 3, 4]);
  });
});
