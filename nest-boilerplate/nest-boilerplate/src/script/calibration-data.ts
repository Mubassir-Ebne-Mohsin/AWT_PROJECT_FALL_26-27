import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildFromSpec } from "@/modules/simulation/engine/builders";
import { normTraffic } from "@/modules/simulation/engine/catalog";
import { simulate } from "@/modules/simulation/engine/simulate";
import { fixturesMatch } from "@/src/script/learn-fixtures";

/**
 * Calibration analysis: compares what the real engine PREDICTS for a one-component design with what the toy service
 * MEASURED, following the rules committed before any measurement in docs/CALIBRATION-EXPECTATIONS.md. Nothing here is
 * typed in: the predictions come from the engine, the measurements from calibration/data/*.json.
 * Regenerate with `pnpm calibration:analyze`; the spec fails if the stored analysis is stale.
 */

type Summary = { count: number; p50: number | null; p95: number | null; p99: number | null; mean: number | null; max: number | null };
export type Attempt = {
  achievedRps: number;
  errorRate: number;
  latency: Summary;
  valid: boolean;
  paging: { samples: number; maxPagesPerSec: number | null; minAvailableMb: number | null };
};
export type Step = { level: number; rps: number; attempts: Attempt[]; final: number };
export type Measurements = {
  config: { workers: number; workMs: number; nominalCapacityRps: number; levels: number[] };
  repeats: Array<{ index: number; steps: Step[] }>;
};

// The rules, as committed in docs/CALIBRATION-EXPECTATIONS.md.
export const RULES = {
  maxPagesPerSec: 100,
  minAvailableMb: 1536,
  firstComparedLevel: 0.3,
  fitServiceTimeLevel: 0.1,
  breakingPointFactor: 3,
  breakingPointTolerance: 0.15,
} as const;

export type Variant = "primary" | "all";
export type Exclusion = { repeat: number; level: number; reason: string };

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const finite = (x: number | null | undefined): x is number => typeof x === "number" && Number.isFinite(x);

/** Why a step is left out of the comparison under the committed rule, or null when it stays in. */
export function exclusionReason(a: Attempt): string | null {
  if (!a.valid) return "the generator fell behind its schedule";
  if (finite(a.paging.maxPagesPerSec) && a.paging.maxPagesPerSec > RULES.maxPagesPerSec) return `paging above ${RULES.maxPagesPerSec} pages per second (${Math.round(a.paging.maxPagesPerSec)})`;
  if (finite(a.paging.minAvailableMb) && a.paging.minAvailableMb < RULES.minAvailableMb) return `available memory below ${RULES.minAvailableMb} MB (${Math.round(a.paging.minAvailableMb)})`;
  return null;
}

/** The step's final attempt (the one reported), or the attempt it names. */
const finalOf = (s: Step) => s.attempts[s.final];

export type Row = {
  level: number;
  rps: number;
  repeats: number;
  measured: { p50: number | null; p95: number | null; p99: number | null; errorRate: number | null; p95Min: number | null; p95Max: number | null };
  model: { p50: number; p95: number; p99: number; errorRate: number };
  p95DifferenceMs: number | null;
  p95DifferencePercent: number | null;
  direction: "model higher" | "model lower" | "equal" | null;
  /** True when the difference is larger than the spread of the measurement across repeats; null when that is unknown (one repeat). */
  meaningful: boolean | null;
  compared: boolean;
};

function predict(capacity: number, serviceMs: number, rps: number) {
  const design = buildFromSpec({ appReplicas: 1, db: false, appProps: { capacity, latency: serviceMs } });
  const sim = simulate(design, normTraffic({ rps, burst: 1, readRatio: 1 }));
  if (!sim.ok) throw new Error("the model could not be run for the calibration design");
  return { p50: sim.p50, p95: sim.p95, p99: sim.p99, errorRate: sim.errorRate };
}

/** First load (in requests per second) at which the series exceeds `threshold`, interpolated between neighbouring points; null if never. */
export function crossing(points: Array<{ rps: number; value: number }>, threshold: number): number | null {
  for (let i = 0; i < points.length; i++) {
    if (points[i].value > threshold) {
      if (i === 0) return points[0].rps;
      const a = points[i - 1];
      const b = points[i];
      return a.rps + ((threshold - a.value) / (b.value - a.value)) * (b.rps - a.rps);
    }
  }
  return null;
}

export type ConfigAnalysis = {
  variant: Variant;
  workers: number;
  workMs: number;
  stepsTotal: number;
  stepsIncluded: number;
  exclusions: Exclusion[];
  fit: { serviceMs: number; capacityRps: number; repeatsForServiceTime: number; repeatsForCapacity: number };
  rows: Row[];
  breakingPoint: { thresholdMs: number; measuredRps: number | null; modelRps: number | null; relativeDifference: number | null };
  summary: { comparedLevels: number; modelHigher: number; modelLower: number; notMeaningful: number; unknownSpread: number; largestAbsoluteP95Ms: number; largestRelativeP95: number };
};

export function analyzeConfig(m: Measurements, variant: Variant): ConfigAnalysis {
  const exclusions: Exclusion[] = [];
  const kept = new Map<string, Attempt>(); // "repeat:level"
  let total = 0;
  for (const r of m.repeats) {
    for (const s of r.steps) {
      total++;
      const a = finalOf(s);
      const reason = variant === "all" ? (a.valid ? null : "the generator fell behind its schedule") : exclusionReason(a);
      if (reason) exclusions.push({ repeat: r.index, level: s.level, reason });
      else kept.set(`${r.index}:${s.level}`, a);
    }
  }
  const at = (repeat: number, level: number) => kept.get(`${repeat}:${level}`);

  // The two inputs of the model, chosen only from the committed rule.
  const serviceTimes = m.repeats.map((r) => at(r.index, RULES.fitServiceTimeLevel)?.latency.p50).filter(finite);
  const capacities = m.repeats
    .map((r) => {
      const best = r.steps.map((s) => at(r.index, s.level)?.achievedRps).filter(finite);
      return best.length ? Math.max(...best) : undefined;
    })
    .filter(finite);
  if (!serviceTimes.length || !capacities.length) throw new Error("no usable step to fit the model from");
  const serviceMs = mean(serviceTimes);
  const capacityRps = mean(capacities);

  const levels = m.config.levels;
  const stepRps = new Map(m.repeats[0].steps.map((s) => [s.level, s.rps]));
  const rows: Row[] = levels.map((level) => {
    const rps = stepRps.get(level) as number;
    const attempts = m.repeats.map((r) => at(r.index, level)).filter((a): a is Attempt => !!a);
    const pick = (f: (a: Attempt) => number | null) => {
      const xs = attempts.map(f).filter(finite);
      return xs.length ? mean(xs) : null;
    };
    const p95s = attempts.map((a) => a.latency.p95).filter(finite);
    const measured = {
      p50: pick((a) => a.latency.p50),
      p95: pick((a) => a.latency.p95),
      p99: pick((a) => a.latency.p99),
      errorRate: pick((a) => a.errorRate),
      p95Min: p95s.length ? Math.min(...p95s) : null,
      p95Max: p95s.length ? Math.max(...p95s) : null,
    };
    const model = predict(capacityRps, serviceMs, rps);
    const diff = measured.p95 === null ? null : model.p95 - measured.p95;
    const spread = measured.p95Min !== null && measured.p95Max !== null && attempts.length > 1 ? measured.p95Max - measured.p95Min : null;
    return {
      level,
      rps,
      repeats: attempts.length,
      measured,
      model,
      p95DifferenceMs: diff,
      p95DifferencePercent: diff === null || !measured.p95 ? null : (diff / measured.p95) * 100,
      direction: diff === null ? null : diff > 0 ? "model higher" : diff < 0 ? "model lower" : "equal",
      meaningful: diff === null || spread === null ? null : Math.abs(diff) > spread,
      compared: level >= RULES.firstComparedLevel && attempts.length > 0,
    };
  });

  const thresholdMs = RULES.breakingPointFactor * serviceMs;
  const measuredPoints = rows.filter((r) => r.measured.p95 !== null).map((r) => ({ rps: r.rps, value: r.measured.p95 as number }));
  const nominal = m.config.nominalCapacityRps;
  const modelPoints: Array<{ rps: number; value: number }> = [];
  for (let share = 0.05; share <= 1.3 + 1e-9; share += 0.005) modelPoints.push({ rps: nominal * share, value: predict(capacityRps, serviceMs, nominal * share).p95 });
  const measuredRps = crossing(measuredPoints, thresholdMs);
  const modelRps = crossing(modelPoints, thresholdMs);

  const compared = rows.filter((r) => r.compared && r.p95DifferenceMs !== null);
  return {
    variant,
    workers: m.config.workers,
    workMs: m.config.workMs,
    stepsTotal: total,
    stepsIncluded: kept.size,
    exclusions,
    fit: { serviceMs, capacityRps, repeatsForServiceTime: serviceTimes.length, repeatsForCapacity: capacities.length },
    rows,
    breakingPoint: { thresholdMs, measuredRps, modelRps, relativeDifference: measuredRps && modelRps ? Math.abs(modelRps - measuredRps) / measuredRps : null },
    summary: {
      comparedLevels: compared.length,
      modelHigher: compared.filter((r) => r.direction === "model higher").length,
      modelLower: compared.filter((r) => r.direction === "model lower").length,
      notMeaningful: compared.filter((r) => r.meaningful === false).length,
      unknownSpread: compared.filter((r) => r.meaningful === null).length,
      largestAbsoluteP95Ms: Math.max(...compared.map((r) => Math.abs(r.p95DifferenceMs as number))),
      largestRelativeP95: Math.max(...compared.map((r) => Math.abs(r.p95DifferencePercent as number))),
    },
  };
}

// ---------- the four written expectations ----------

export type Expectation = { id: number; text: string; held: boolean | null; evidence: string };

const rowAt = (c: ConfigAnalysis, level: number) => c.rows.find((r) => r.level === level);
const ms = (x: number | null | undefined) => (x === null || x === undefined ? "n/a" : x.toFixed(1));

export function expectations(oneWorker: ConfigAnalysis, fourWorkers: ConfigAnalysis): Expectation[] {
  const out: Expectation[] = [];

  // 1. One worker, light load: the model's p95 is above the measured p95.
  const light = [0.1, 0.2].map((l) => rowAt(oneWorker, l)).filter((r): r is Row => !!r && r.measured.p95 !== null);
  out.push({
    id: 1,
    text: "With one worker, the model's p95 at light load (10% and 20% busy) is above the measured p95.",
    held: light.length ? light.every((r) => r.model.p95 > (r.measured.p95 as number)) : null,
    evidence: light.map((r) => `${Math.round(r.level * 100)}%: model ${ms(r.model.p95)} ms, measured ${ms(r.measured.p95)} ms`).join("; "),
  });

  // 2. One worker, 50 to 80% busy: the model's waiting time (p50 minus the service time) is above the measured one.
  const mid = [0.5, 0.6, 0.7, 0.8].map((l) => rowAt(oneWorker, l)).filter((r): r is Row => !!r && r.measured.p50 !== null);
  const s = oneWorker.fit.serviceMs;
  out.push({
    id: 2,
    text: "With one worker at 50 to 80% busy, the model's waiting time (its p50 minus the service time) is above the measured waiting time.",
    held: mid.length ? mid.every((r) => r.model.p50 - s > (r.measured.p50 as number) - s) : null,
    evidence: mid.map((r) => `${Math.round(r.level * 100)}%: model wait ${ms(r.model.p50 - s)} ms, measured wait ${ms((r.measured.p50 as number) - s)} ms`).join("; "),
  });

  // 3. Above 90% busy, the measured p95 rises at least as fast as the model's (ratio of p95 between successive steps from 90%).
  const levels = [0.9, 0.95, 1.05, 1.2];
  const rows3 = levels.map((l) => rowAt(oneWorker, l));
  const ratios: Array<{ from: number; to: number; measured: number; model: number }> = [];
  for (let i = 1; i < rows3.length; i++) {
    const a = rows3[i - 1];
    const b = rows3[i];
    if (a && b && a.measured.p95 && b.measured.p95) ratios.push({ from: a.level, to: b.level, measured: b.measured.p95 / a.measured.p95, model: b.model.p95 / a.model.p95 });
  }
  out.push({
    id: 3,
    text: "Above 90% busy, the measured p95 rises at least as fast as the model's.",
    held: ratios.length === 3 ? ratios.every((r) => r.measured >= r.model) : null,
    evidence: ratios.map((r) => `${Math.round(r.from * 100)}% to ${Math.round(r.to * 100)}%: measured x${r.measured.toFixed(2)}, model x${r.model.toFixed(2)}`).join("; "),
  });

  // 4. Four workers: the load at which the p95 first exceeds three times the service time agrees within 15%.
  const b = fourWorkers.breakingPoint;
  out.push({
    id: 4,
    text: "With four workers, the load at which the p95 first exceeds three times the service time is within 15% of the model's.",
    held: b.relativeDifference === null ? null : b.relativeDifference <= RULES.breakingPointTolerance,
    evidence: `measured ${b.measuredRps === null ? "never" : b.measuredRps.toFixed(1) + " rps"}, model ${b.modelRps === null ? "never" : b.modelRps.toFixed(1) + " rps"}${b.relativeDifference === null ? "" : `, difference ${(b.relativeDifference * 100).toFixed(1)}%`}`,
  });
  return out;
}

export type Analysis = {
  rules: typeof RULES;
  generatedFrom: string[];
  oneWorker: { primary: ConfigAnalysis; all: ConfigAnalysis };
  fourWorkers: { primary: ConfigAnalysis; all: ConfigAnalysis };
  expectations: { primary: Expectation[]; all: Expectation[] };
};

export function buildAnalysis(one: Measurements, four: Measurements): Analysis {
  const o = { primary: analyzeConfig(one, "primary"), all: analyzeConfig(one, "all") };
  const f = { primary: analyzeConfig(four, "primary"), all: analyzeConfig(four, "all") };
  return { rules: RULES, generatedFrom: ["calibration/data/w1.json", "calibration/data/w4.json"], oneWorker: o, fourWorkers: f, expectations: { primary: expectations(o.primary, f.primary), all: expectations(o.all, f.all) } };
}

const root = resolve(__dirname, "../../../..");
export const dataPath = (name: string) => resolve(root, "calibration/data", name);
export const analysisText = (a: Analysis) => JSON.stringify(a, null, 2) + "\n";
export const loadMeasurements = (name: string): Measurements => JSON.parse(readFileSync(dataPath(name), "utf8")) as Measurements;
export const currentAnalysis = () => buildAnalysis(loadMeasurements("w1.json"), loadMeasurements("w4.json"));

if (require.main === module) {
  const fresh = currentAnalysis();
  const file = dataPath("analysis.json");
  if (process.argv.includes("--check")) {
    const stored = JSON.parse(readFileSync(file, "utf8"));
    if (!fixturesMatch(stored, JSON.parse(analysisText(fresh)))) throw new Error("calibration analysis is stale: run `pnpm calibration:analyze`");
    console.log("calibration analysis is current");
  } else {
    writeFileSync(file, analysisText(fresh));
    console.log(`wrote ${file}`);
  }
}
