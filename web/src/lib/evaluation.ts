import data from "@/lib/evaluation-data.json";

// P5 Evaluation. Every number on the Simulator tab comes from evaluation-data.json, which is produced by running the real
// engine (`pnpm fixtures:evaluation`) and checked against it by a backend spec. The Calibration tab shows no numbers at all
// (none exist) and the AI tab quotes only the recorded M10 results, which a test ties to docs/M10-LOCAL-AI-FEASIBILITY.md.

export type Band = { minWaitShare: number; points: number; worstRelativeError: number };
export type TypicalRow = { rho: number; exactMs: number; modelMs: number; gapMs: number };
export type Typical = { type: string; label: string; serviceMs: number; servers: number; rows: TypicalRow[] };
export type Check = { id: string; text: string; passed: boolean; results: Array<{ template: string; passed: boolean; detail: string }> };
export type EvaluationData = {
  engineVersion: string;
  erlang: {
    servers: number[];
    loads: number[];
    oneServerWorstRelativeError: number;
    maxAbsoluteGap: { value: number; servers: number; rho: number; exact: number; model: number };
    bands: Band[];
    typical: Typical[];
  };
  fidelity: { fixtures: number; valuesCompared: number; largestAbsoluteDifference: number; largestRelativeDifference: number; tolerance: { absolute: number; relative: number } };
  consistency: Check[];
};
export const EVAL = data as unknown as EvaluationData;

// ---------- formatting ----------

export const n0 = (x: number) => Math.round(x).toLocaleString("en-US");
export const pct = (x: number) => `${Math.round(x * 100).toLocaleString("en-US")}%`;
export const pct1 = (x: number) => `${(Math.round(x * 1000) / 10).toLocaleString("en-US")}%`;
/** Very small numbers in scientific notation, so "0.00000000000000011" is never printed. */
export const sci = (x: number) => (x === 0 ? "0" : x.toExponential(1).replace("e-", "e−"));
export const gapUnits = (x: number) => (Math.round(x * 1000) / 1000).toLocaleString("en-US", { minimumFractionDigits: 3 });
export const ms = (x: number) => (x < 0.0005 ? "under 0.001" : x < 1 ? x.toFixed(3) : x.toFixed(2));

// ---------- the Simulator tab, in words ----------

export const TAB_LIST: Array<{ id: "simulator" | "calibration" | "ai"; label: string; status: string }> = [
  { id: "simulator", label: "Simulator", status: "Measured" },
  { id: "calibration", label: "Calibration", status: "Not yet measured" },
  { id: "ai", label: "AI", status: "Parked, not evaluated" },
];

export const oneServerText = () => `With one server the model's waiting time equals the exact textbook answer (worst difference ${sci(EVAL.erlang.oneServerWorstRelativeError)} of the value).`;

export const bandRows = () => EVAL.erlang.bands.map((b) => ({ share: pct(b.minWaitShare), points: n0(b.points), worst: pct1(b.worstRelativeError) }));

export function gapText(): string {
  const g = EVAL.erlang.maxAbsoluteGap;
  const app = EVAL.erlang.typical.find((t) => t.type === "app");
  const inMs = app ? ` On the ${app.serviceMs} ms app tier that is about ${(g.value * app.serviceMs).toFixed(1)} ms.` : "";
  return `The largest gap anywhere is ${gapUnits(g.value)} of one service time (${g.servers} servers, ${pct(g.rho)} busy).${inMs}`;
}

export const LOADS_SHOWN = [0.5, 0.7, 0.8, 0.9, 0.95];
export const typicalCell = (row: TypicalRow) => `${ms(row.exactMs)} / ${ms(row.modelMs)}`;

export const fidelityText = () =>
  `${n0(EVAL.fidelity.valuesCompared)} numbers across ${EVAL.fidelity.fixtures} reference designs (simulation, request paths, timeline, breaking point and load curve) were compared. The largest difference was ${sci(EVAL.fidelity.largestAbsoluteDifference)}, against a tolerance of ${sci(EVAL.fidelity.tolerance.absolute)}.`;

export function consistencySummary() {
  const total = EVAL.consistency.reduce((n, c) => n + c.results.length, 0);
  const passed = EVAL.consistency.reduce((n, c) => n + c.results.filter((r) => r.passed).length, 0);
  return { total, passed, text: `${passed} of ${total} checks passed (${EVAL.consistency.length} checks on each of ${EVAL.consistency[0]?.results.length ?? 0} designs).` };
}

/** What none of the Simulator evidence shows. */
export const NOT_PROVEN = [
  "That the model matches real servers. No real application has been load-tested and compared with it (see Calibration).",
  "That the final p95 and p99 are right. The comparison above checks one part of the model, the waiting time of one component.",
  "That the original prototype's maths is right. The fidelity check shows the app reproduces the prototype, not that the prototype is correct.",
  "Anything about what the model leaves out: pauses, cold caches, retry storms, and differences between real machines and networks.",
];

/** The commands that regenerate or re-run this evidence. Each `script` is checked against package.json by a test. */
export const COMMANDS: Array<{ dir: string; command: string; script: string; says: string }> = [
  { dir: "nest-boilerplate/nest-boilerplate", command: "pnpm fixtures:evaluation:check", script: "fixtures:evaluation:check", says: "Re-runs the engine and checks the stored evidence is current." },
  { dir: "nest-boilerplate/nest-boilerplate", command: "pnpm fixtures:evaluation", script: "fixtures:evaluation", says: "Recomputes and rewrites the evidence file." },
  { dir: "nest-boilerplate/nest-boilerplate", command: "pnpm test", script: "test", says: "Runs all the backend unit tests, including the model's own." },
];

// ---------- the Calibration tab ----------

export const CALIBRATION_WHY =
  "Calibration means building a real, small service, measuring how it behaves as load grows, and checking how closely the model predicts those measurements. Until that is done there is no accuracy figure for the model against real systems, and this page shows none.";
export const CALIBRATION_STEPS = [
  "Choose one small real service and write down its hardware and software versions.",
  "Fix the load-testing tool and its settings, and run a stepped test: hold each load level long enough to settle, from light load to past the breaking point.",
  "Record p50, p95 and the error rate at every step, and repeat the whole test to see how much it varies by itself.",
  "Use some of the steps to work out the service's capacity and the time it takes per request.",
  "Describe the same service as a StressForge design with those numbers, and let the model predict the steps that were held back.",
  "Report the difference between predicted and measured p95 and errors at each held-back step, including where the model is far off.",
  "Keep the raw measurements in the repository so anyone can recheck the comparison.",
];

// ---------- the AI tab: what was recorded in M10, and nothing more ----------

export const AI_RECORD = {
  date: "28 October 2026",
  setup: "Two small models run locally on this laptop, one request at a time.",
  models: [
    { name: "qwen2.5:1.5b", shape: "1 of 8", passed: "0 of 8", note: "7 of 8 replies were cut off at the length limit." },
    { name: "llama3.2:3b", shape: "8 of 8", passed: "0 of 8", note: "Only 4 of 8 replies cited just the allowed evidence, and it wrongly said current results were out of date." },
  ],
  resource: "A repeat run of the larger model failed with an error that the machine had insufficient resources.",
  verdict: "The tested setup was judged not good enough to build on (a no-go). That is not a claim that AI cannot work, only that this setup did not.",
  later: [
    "Whether the explanation agrees with the facts the engine produced (no contradictions, no invented references).",
    "Whether replies have the required shape and complete without being cut off.",
    "How long it takes and how much memory it uses.",
    "How all of that compares with a simple rule-based explanation, which does not exist yet.",
  ],
};
