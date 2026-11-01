import data from "@/lib/calibration-data.json";

// The Calibration tab. Every number on it comes from calibration-data.json, which is produced by running the real engine over
// the stored measurements (`pnpm calibration:analyze` in the API) and checked against them by a backend spec. When that file
// has no data the tab says "Not yet measured" and shows no figure. The wording of the headline was approved by the user; a
// test ties each claim in it to the data, so it cannot stay true on the page after the data stops supporting it.

export type CalRow = {
  level: number;
  rps: number;
  compared: boolean;
  censored: boolean;
  meaningful: boolean | null;
  direction: "model higher" | "model lower" | "equal" | null;
  measuredP50: number | null;
  measuredP95: number | null;
  measuredP95Min: number | null;
  measuredP95Max: number | null;
  measuredErrorRate: number | null;
  modelP50: number;
  modelP95: number;
  modelErrorRate: number;
  differencePercent: number | null;
};
export type CalConfig = {
  workers: number;
  workMs: number;
  fit: { serviceMs: number; capacityRps: number };
  rows: CalRow[];
  breakingPoint: { thresholdMs: number; measuredRps: number | null; modelRps: number | null; relativeDifference: number | null };
  repeats: number;
};
export type CalExpectation = { id: number; text: string; held: boolean | null; evidence: string; byVariant: { committed: boolean | null; noExclusions: boolean | null; corrected: boolean | null } };
export type CalibrationData = {
  machine: { cpu: string | null; logicalProcessors: number | null; totalMb: number | null; powerScheme: string | null; onAcPower: boolean | null; node: string | null; osVersion: string | null; timerTickMs: [number, number] | null };
  experiment: { workMs: number; levels: number[]; repeats: number | null; stepSeconds: number | null; warmupSeconds: number | null; arrival: string | null; timeoutSeconds: number; workerCounts: number[] };
  configs: CalConfig[];
  expectations: CalExpectation[];
  correction: { stepsTotal: number; stepsExcludedByCommittedRule: number; committedFourWorkerCapacityRps: number; committedFourWorkerServers: number };
};

/** The stored data, or null when there is none. */
export const CAL: CalibrationData | null = data && (data as { configs?: unknown[] }).configs?.length ? (data as unknown as CalibrationData) : null;

// ---------- formatting ----------

const round = (x: number) => Math.round(x);
export const ms1 = (x: number) => x.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const msWhole = (x: number) => Math.round(x).toLocaleString("en-US");
export const pctWhole = (x: number) => `${Math.round(x).toLocaleString("en-US")}%`;
export const signedPct = (x: number) => `${x >= 0 ? "+" : "−"}${Math.round(Math.abs(x)).toLocaleString("en-US")}%`;
export const rate1 = (x: number) => (Math.round(x * 10) / 10).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const share = (level: number) => `${Math.round(level * 100)}%`;
export const verdictWord = (held: boolean | null) => (held === null ? "undetermined" : held ? "held" : "did not hold");

export const calibrationStatus = (d: CalibrationData | null) => (d ? "Measured on one machine, one toy service" : "Not yet measured");

const config = (d: CalibrationData, workers: number) => d.configs.find((c) => c.workers === workers);
const rowAt = (c: CalConfig | undefined, level: number) => c?.rows.find((r) => r.level === level);

/** The headline the user approved, with every figure taken from the data. */
export function headline(d: CalibrationData): string {
  const one = config(d, 1);
  const four = config(d, 4);
  const hi = rowAt(four, 1.2);
  if (!one || !four || !hi) return "";
  const o = one.breakingPoint;
  const f = four.breakingPoint;
  return (
    "Measured on one laptop against one simple service. For this service the model was cautious: it predicted slower responses than were measured at nearly every load, " +
    `and put the breaking point earlier for one server (${rate1(o.modelRps as number)} against ${rate1(o.measuredRps as number)} requests a second) ` +
    `and within ${round((f.relativeDifference as number) * 100)}% for four servers (${round(f.modelRps as number)} against ${round(f.measuredRps as number)}). ` +
    `At 120% of capacity with four servers it predicted a much lower error rate than was measured (${rate1(hi.modelErrorRate * 100)}% against ${rate1((hi.measuredErrorRate as number) * 100)}%). ` +
    "This shows how the formula behaves for a service with a fixed cost per request. It does not show how accurate the model is for real applications."
  );
}

export const CALIBRATION_WHY =
  "Calibration means measuring a real service as load grows and checking how closely the model predicts those measurements. This page shows the first such comparison, made against one simple test service on one laptop. It shows how the model's formulas behave for that kind of service; it is not a verdict on the model.";

export const noteFor = (r: CalRow): string => {
  if (!r.compared) return "used to fit the service time";
  if (r.censored) return "requests timed out: not like for like";
  if (r.meaningful === false) return "within the spread between repeats";
  return "";
};

export const differenceText = (r: CalRow): string => (r.censored || r.differencePercent === null ? "not comparable" : signedPct(r.differencePercent));

export const rangeText = (r: CalRow): string => (r.measuredP95 === null ? "n/a" : `${msWhole(r.measuredP95)} (${msWhole(r.measuredP95Min as number)} to ${msWhole(r.measuredP95Max as number)})`);

export function setupText(d: CalibrationData): string {
  const e = d.experiment;
  return `A test service that does ${e.workMs} ms of work per request, with ${e.workerCounts.join(" and ")} worker threads, was driven through ${e.levels.length} load levels from ${share(e.levels[0])} to ${share(e.levels[e.levels.length - 1])} of its capacity, ${e.stepSeconds} seconds per level after a ${e.warmupSeconds} second warm-up, ${e.repeats} times for each worker count. Requests arrived at random times (a Poisson process) and were given ${e.timeoutSeconds} seconds to answer.`;
}

export function machineText(d: CalibrationData): string {
  const m = d.machine;
  const tick = m.timerTickMs ? `${Math.round(m.timerTickMs[0])} to ${Math.round(m.timerTickMs[1])} ms` : "unknown";
  return `${m.cpu ?? "unknown processor"}, ${m.logicalProcessors ?? "?"} threads, ${m.totalMb ? (m.totalMb / 1024).toFixed(1) : "?"} GB of memory, Windows ${m.osVersion ?? ""}, Node ${m.node ?? ""}, ${m.onAcPower ? "on mains power" : "power source unknown"}, power plan "${m.powerScheme ?? "unknown"}", system timer tick ${tick}. Other programs were running.`;
}

export function fitText(c: CalConfig): string {
  return `The model was given a service time of ${ms1(c.fit.serviceMs)} ms (from the lightest step) and a capacity of ${rate1(c.fit.capacityRps)} requests a second (what the service actually completed at the heaviest load).`;
}

export function breakingText(c: CalConfig): string {
  const b = c.breakingPoint;
  if (b.measuredRps === null || b.modelRps === null) return "The p95 did not exceed three times the service time at any load in one of the two.";
  return `The first load at which the p95 exceeds three times the service time (${msWhole(b.thresholdMs)} ms) was about ${rate1(b.measuredRps)} requests a second when measured and ${rate1(b.modelRps)} in the model, a difference of ${pctWhole((b.relativeDifference as number) * 100)}.`;
}

export const CALIBRATION_STEPS = [
  "Wrote a small test service: each request does 20 ms of work on one of N worker threads, first come first served (N was 1, then 4). It has no database, no cache and no network.",
  "Drove it with a load generator that sends requests at random times at a set average rate whatever the service does, and times each request from when it was due to be sent. The generator was checked first against fake servers with known delays.",
  "Stepped the load from 10% to 120% of the service's capacity in twelve steps of 30 seconds (after a 5 second warm-up that is discarded), three times for each worker count.",
  "Fitted the model's two inputs from the measurements: the service time from the lightest step, and the capacity from how many requests the service completed per second at the heaviest load.",
  "Ran the model on a one-component design with those inputs at each step's load, and compared its p50, p95 and error rate with what was measured.",
  "Wrote down four expectations, and the rules for choosing the inputs, before any measurement was taken, and recorded below whether each held.",
  "Kept the raw measurements in the repository (the calibration folder) so anyone can recheck the comparison.",
];

/** The commands that check or repeat this. `script` is checked against the package.json named in `file`, or `file` itself must exist. */
export const CAL_COMMANDS: Array<{ dir: string; command: string; check: { kind: "script"; file: string; script: string } | { kind: "file"; file: string }; says: string }> = [
  { dir: "nest-boilerplate/nest-boilerplate", command: "pnpm calibration:analyze:check", check: { kind: "script", file: "nest-boilerplate/nest-boilerplate/package.json", script: "calibration:analyze:check" }, says: "Runs the engine over the stored measurements and checks the data behind this page is current." },
  { dir: "calibration", command: "pnpm test", check: { kind: "script", file: "calibration/package.json", script: "test" }, says: "Checks the load generator and the test service against known behaviour (on a quiet machine)." },
  { dir: "calibration", command: "node src/run.mjs --workers 1 --repeats 3 --out w1", check: { kind: "file", file: "calibration/src/run.mjs" }, says: "Repeats the measurements for one worker (about 25 minutes; Windows, with the laptop otherwise idle and at least 2 GB of memory free)." },
];

export const TRUST = (d: CalibrationData): string[] => {
  const c = d.correction;
  return [
    `A rule was changed after the first analysis. The rules for choosing the model's two inputs were written down before measuring. Applying them as written left out ${c.stepsExcludedByCommittedRule} of ${c.stepsTotal} steps because of a memory-paging counter, and fitted the four-worker capacity at ${rate1(c.committedFourWorkerCapacityRps)} requests a second (the service's real capacity is about 200), so the model ran with ${c.committedFourWorkerServers} servers instead of 4. The capacity is now taken from what the service itself completed at the heaviest load. This correction was chosen after the first results were seen; the original rules, the results under them and the correction are all kept in the repository. Expectations 1 and 2 held under the original rules as well; for expectations 3 and 4 the original rules gave no answer (3) and a result caused by the broken fit (4), so those two depend on the correction.`,
    "Three repeats per worker count. Differences smaller than the spread between repeats are marked as such.",
    "Above the limit, requests start timing out after 3 seconds, so the measured latencies cover only the requests that were answered in time. Those rows are marked and are not a precise comparison.",
    "One laptop, one service, one day. The service does fixed work with no database, cache or network, the laptop had other programs running, and its timer resolution and free memory varied during the runs.",
  ];
};

export const NOT_SHOWN =
  "That the model is accurate for any real application, for services whose work varies (a database query, a call to another service), for caches or databases, across regions, on other hardware, or under traffic that is not random arrivals. This is not a validation of the model.";
