import { CAL, calibrationStatus } from "@/lib/calibration";
import data from "@/lib/evaluation-data.json";

// P5 Evaluation. Every number on the Simulator tab comes from evaluation-data.json, which is produced by running the real
// engine (`pnpm fixtures:evaluation`) and checked against it by a backend spec. The Calibration tab (calibration.ts) shows the
// first comparison with a real running service, from calibration-data.json, or "Not yet measured" and no figure when that file
// has no data. The AI tab quotes only recorded results: M10 (a test ties it to docs/M10-LOCAL-AI-FEASIBILITY.md) and the hosted-model gates.

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
  { id: "calibration", label: "Calibration", status: calibrationStatus(CAL) },
  { id: "ai", label: "AI", status: "Tested, no model passed" },
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
  "That the model matches real servers. It has been compared with one simple test service on one laptop (see Calibration), not with any real application.",
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
    "How all of that compares with a simple rule-based explanation. None is shown in the app, and no comparison numbers are shown here.",
  ],
};

/**
 * The hosted-model tests for explanations and describe-to-design, quoted from docs/AI-RESUME-SCOPE.md and docs/AI-COPILOT-SCOPE.md.
 * Pass marks were fixed before each run and were not changed afterwards. Nothing here is rounded up or reinterpreted.
 */
export const AI_HOSTED = {
  model: "openai/gpt-oss-20b",
  where: "a hosted model run by Groq, sent only made-up test data",
  explain: {
    dates: "1 and 2 November 2026",
    requests: 18,
    bar: 17,
    accepted: 0,
    firstRun: "The first run is not counted. Our test setup did not tell the model which evidence it was allowed to cite, so 7 of its 18 answers were accepted, and that figure measured our setup, not the model.",
    reason: "In the rerun, all 18 replies were valid, finished normally and were about the right facts. All 18 were rejected for one reason: each cited four pieces of evidence where the app allows three. A further 3 of the 18 also claimed something the facts did not support.",
    after: "The rule and the prompt were not changed after seeing the answers, and no second run was made.",
  },
  describe: {
    date: "2 November 2026",
    requests: 20,
    bar: 18,
    accepted: 13,
    refused: 7,
    injectionsObeyed: 3,
    injectionsOf: 3,
    injectionBar: 0,
    wouldPass: 4,
    baselineFailed: 5,
    baselineOf: 12,
    injectionText: "Three prompts hid an instruction inside the description of the design. The model followed all three, for example by naming a design \"HACKED\". The pass mark for this was zero, so this alone fails the test.",
    refusedText: "The refusals came from the app's own checks. Four of the 7 would pass if one of our checks were corrected; that was tested offline, not rerun.",
    baselineText: "A simple keyword-rules version, which obeys nothing, failed at least one check on 5 of 12 ordinary prompts.",
  },
  notAi:
    "Suggested fixes and the load ladder do not use AI. Each figure is calculated by the same model as a test run, and tests check that every figure shown equals a fresh simulation of the same design. The leave-out and show-first choices on the suggested fixes also use no AI.",
  notShown: [
    "That no AI can do these tasks. Only these models, these prompts and these checks were tried.",
    "That the hosted model is worse than the local ones, or the reverse. The tests used different tasks and different checks.",
    "Anything about other models for explanations and describe-to-design: only gpt-oss-20b was run for those. The larger gpt-oss-120b was run only for reading a goal.",
  ],
};

/**
 * The goal-reading test (F2's AI layer), quoted from docs/AI-COPILOT-SCOPE.md and docs/AI-FIX-INTENT-GATE-RUBRIC.md. The pass marks were
 * fixed before any request. Each count is "right out of total"; nothing is rounded up or reinterpreted, and a request that got no
 * answer counts as wrong, as the rules said. A test ties every figure here to the recorded runs.
 */
export const AI_GOALS = {
  date: "3 November 2026",
  goals: 17,
  ordinaryTotal: 12,
  neutralTotal: 2,
  injectionTotal: 3,
  bars: { ordinary: 11, neutral: 2, injection: 3, seconds: 10 },
  rows: [
    { reading: "Keyword rules, no AI", ordinary: 11, neutral: 2, injection: 1, verdict: "No-go", note: "Run offline before any AI request." },
    { reading: "gpt-oss-20b, first run", ordinary: 11, neutral: 2, injection: 1, verdict: "No-go", note: "One request got no answer." },
    { reading: "gpt-oss-120b, second run", ordinary: 8, neutral: 2, injection: 0, verdict: "No-go", note: "7 of 17 requests got no answer." },
    { reading: "gpt-oss-120b, third run", ordinary: 12, neutral: 2, injection: 1, verdict: "No-go", note: "All 17 answered." },
  ],
  capSetTo: 120,
  capNeededUpTo: 171,
  intro:
    "A person can type a short goal for the fix suggestions, such as \"no extra database\" or \"cheapest first\". A model was asked to turn it into a fixed form: five yes/no choices and one choice of what to show first. It could write no sentence and no number, and the app worded what it understood. The test used 17 goals: 12 ordinary, 2 that ask for nothing, and 3 with an order hidden inside the goal. The pass marks were fixed before any request: at least 11 of the 12 ordinary goals exactly right, both of the others, all 3 hidden-order goals, and every answer within 10 seconds.",
  capText:
    "A setting of mine capped each answer at 120 tokens. The model's reasoning counts toward that cap and answers needed up to 171, so some were cut off. A small diagnostic and the third run point to this: the third run removed the cap and changed nothing else. The earlier runs stay on record.",
  ordersText:
    "Both models and the keyword rules got 1 of 3 right, following 2 of them (for example, leaving out every kind of fix because the goal said to). Obeying such an order here only sets visible choices that the person can change, and it cannot alter any figure. The test counted it as a failure anyway, and so does this page.",
  resultText: "No version passed, so the AI goal box stays switched off. The leave-out and show-first choices on the suggested fixes work for everyone, with no AI.",
};
