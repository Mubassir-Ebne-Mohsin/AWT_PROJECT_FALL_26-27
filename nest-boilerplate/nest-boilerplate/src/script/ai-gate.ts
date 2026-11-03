import * as dotenv from "dotenv";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { GroqProvider, type GroqModel } from "@/modules/ai/groq.provider";
import { HOSTED_DIGEST } from "@/modules/ai/provider";
import { ruleBasedExplanation } from "@/modules/ai/evaluation/baseline";
import { EVALUATION_CASES } from "@/modules/ai/evaluation/cases";
import { blindSheet, evaluateGate, runGate, sampleThird, type GateProvider, type GateRun } from "@/modules/ai/evaluation/harness";
import { runFolderName, runPaced } from "@/modules/ai/evaluation/live";
import { Pacer } from "@/modules/ai/evaluation/pacer";
import { applyJudgements, sheetMarkdown } from "@/modules/ai/evaluation/review";
import { DESCRIBE_CASES } from "@/modules/ai/evaluation/describe-cases";
import { applyDescribeJudgements, describeSheet, describeSheetMarkdown, evaluateDescribeGate, runDescribeGate, runScriptedBaseline, type DescribeRun, type StructuredLike } from "@/modules/ai/evaluation/describe-gate";
import { pacerLimits } from "@/modules/ai/evaluation/pacer";
import { INTENT_CASES } from "@/modules/ai/evaluation/intent-cases";
import { INTENT_CASES_V2 } from "@/modules/ai/evaluation/intent-cases-v2";
import { differences, evaluateIntentGate, INTENT_THRESHOLDS, INTENT_THRESHOLDS_V2, replayWithGuard, runIntentBaseline, runIntentGate, type IntentRun } from "@/modules/ai/evaluation/intent-gate";
import { fixIntentTask, parseFixIntent } from "@/modules/ai/tasks/fix-intent";
import type { ProviderObservation } from "@/modules/ai/provider";
import { probingFetch } from "@/modules/ai/evaluation/refusal-probe";

/**
 * The explanation gate, from the command line (run from the backend folder):
 *   run --dry                      the rule-based baseline through the harness; no network, no key
 *   run --model=<model> --confirm-live   the real model; sends synthetic facts to Groq; needs GROQ_API_KEY in .env
 *   sheet --runs=a/run.json,b/run.json --seed=N --out=<folder>   blind review sheet, key and the third to check
 *   score --runs=a/run.json,b/run.json --key=<key.json> --judgements=<file> --out=<folder>
 * The describe-to-design gate (docs/AI-DESCRIBE-GATE-RUBRIC.md) has the same three steps:
 *   describe-run --dry | describe-run --model=<model> --confirm-live   (20 prompts, one request each)
 *   describe-sheet --runs=... --seed=N --out=<folder>
 *   describe-score --runs=... --key=<key.json> --judgements=<file> --out=<folder>
 * The fix-intent gate (docs/AI-FIX-INTENT-GATE-RUBRIC.md) is scored mechanically, so it has one step:
 *   intent-run --dry | intent-run --model=<model> --confirm-live   (17 goals, one request each)
 *   intent-run --set=v2 --dry [--guard] | intent-run --set=v2 --model=<model> --confirm-live   (the guard attempt: 23 goals, judged with the guard)
 *   intent-replay --runs=a/run.json,b/run.json   (offline: the stored replies of earlier runs through the guard; a sanity check, not a result)
 *   intent-diagnose --model=<model> --goal=<id> [--repeat=1..3] --confirm-live   (not a gate run: why were requests refused?)
 * Results go under docs/audit/ai-gate/ unless --out says otherwise. The key is read from the environment and never printed.
 */
dotenv.config({ quiet: true });

const args = process.argv.slice(2);
const command = args[0];
const flag = (name: string) => args.find((a) => a.startsWith("--" + name + "="))?.slice(name.length + 3);
const has = (name: string) => args.includes("--" + name);
const fail = (message: string): never => {
  console.error(message);
  process.exit(2);
};
const read = (path: string) => JSON.parse(readFileSync(resolve(path), "utf8"));
const write = (dir: string, name: string, value: unknown) => writeFileSync(join(dir, name), typeof value === "string" ? value : JSON.stringify(value, null, 2) + "\n");
const ensure = (dir: string) => (mkdirSync(dir, { recursive: true }), dir);
const defaultOut = join(__dirname, "../../../../docs/audit/ai-gate");
const MODELS = ["openai/gpt-oss-20b", "openai/gpt-oss-120b"];

async function runCommand() {
  let provider: GateProvider;
  let run: GateRun;
  if (has("dry")) {
    provider = { generate: async (facts) => ruleBasedExplanation(facts as never) };
    run = await runGate(provider, EVALUATION_CASES, { provider: "rule-based", model: "none" });
  } else {
    const model = flag("model") ?? fail("Choose a model: --model=openai/gpt-oss-20b (or --dry).");
    if (!MODELS.includes(model)) fail("Unknown model. Allowed: " + MODELS.join(", "));
    if (!has("confirm-live")) fail("This sends synthetic facts to Groq. Add --confirm-live only when the owner has said go.");
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) fail("GROQ_API_KEY is not set in the backend .env.");
    console.log("Live run: " + model + ", 6 cases x 3 generations = 18 requests, paced to 80% of the account limits.");
    provider = new GroqProvider({ apiKey: apiKey as string, model: model as GroqModel });
    const pacer = new Pacer();
    run = await runPaced(provider, { provider: "groq", model, digest: HOSTED_DIGEST, pacer });
    console.log("Requests made: " + pacer.requestsToday + ", tokens counted: " + pacer.tokensToday);
  }
  const report = evaluateGate(run);
  const dir = ensure(join(flag("out") ?? defaultOut, runFolderName(run)));
  write(dir, "run.json", { run, report });
  console.log(JSON.stringify({ folder: dir, provider: run.provider, model: run.model, stoppedBy: run.stoppedBy ?? null, ...report }, null, 2));
}

function sheetCommand() {
  const runs = (flag("runs") ?? fail("--runs=a/run.json,b/run.json")).split(",").map((p) => read(p).run as GateRun);
  const seed = Number(flag("seed") ?? fail("--seed=<number> (note it down so the order can be reproduced)"));
  const out = ensure(resolve(flag("out") ?? fail("--out=<folder>")));
  const { items, key } = blindSheet(runs, EVALUATION_CASES, seed);
  write(out, "sheet.md", sheetMarkdown(items));
  write(out, "key.json", key);
  write(out, "third.json", sampleThird(items.map((i) => i.sheetId), seed + 1));
  console.log(items.length + " answers on the sheet; the key stays with the scorer; third.json lists the ids for the owner to check blind.");
}

function scoreCommand() {
  const files = (flag("runs") ?? fail("--runs=a/run.json,b/run.json")).split(",");
  const runs = files.map((p) => read(p).run as GateRun);
  const byRun = applyJudgements(read(flag("key") ?? fail("--key=<key.json>")), read(flag("judgements") ?? fail("--judgements=<file>")), runs.length);
  const reports = runs.map((run, i) => ({ provider: run.provider, model: run.model, ...evaluateGate(run, byRun[i]) }));
  write(ensure(resolve(flag("out") ?? fail("--out=<folder>"))), "report.json", reports);
  console.log(JSON.stringify(reports, null, 2));
}

async function describeRunCommand() {
  let run: DescribeRun;
  if (has("dry")) run = runScriptedBaseline(DESCRIBE_CASES);
  else {
    const model = flag("model") ?? fail("Choose a model: --model=openai/gpt-oss-20b (or --dry for the keyword-rules baseline).");
    if (!MODELS.includes(model)) fail("Unknown model. Allowed: " + MODELS.join(", "));
    if (!has("confirm-live")) fail("This sends 20 invented descriptions to Groq. Add --confirm-live only when the owner has said go.");
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) fail("GROQ_API_KEY is not set in the backend .env.");
    console.log("Live run: " + model + ", 20 prompts, one request each, paced to 80% of the account limits.");
    const groq = new GroqProvider({ apiKey: apiKey as string, model: model as GroqModel });
    const pacer = new Pacer(pacerLimits(), 1300);
    const paced: StructuredLike = {
      structured: (task, parse, signal, observe) =>
        groq.structured(task, parse, signal, (o) => {
          if (o.usage) pacer.settle(o.usage.totalTokens);
          observe?.(o);
        }),
    };
    run = await runDescribeGate(paced, DESCRIBE_CASES, { provider: "groq", model, beforeEach: () => pacer.acquire() });
    console.log("Requests made: " + pacer.requestsToday + ", tokens counted: " + pacer.tokensToday);
  }
  const report = evaluateDescribeGate(run);
  const dir = ensure(join(flag("out") ?? defaultOut, run.startedAt.replace(/[:.]/g, "-") + "_describe_" + run.model.replace(/[^A-Za-z0-9._-]/g, "_")));
  write(dir, "run.json", { run, report });
  console.log(JSON.stringify({ folder: dir, provider: run.provider, model: run.model, stoppedBy: run.stoppedBy ?? null, ...report }, null, 2));
}

function describeSheetCommand() {
  const runs = (flag("runs") ?? fail("--runs=a/run.json,b/run.json")).split(",").map((p) => read(p).run as DescribeRun);
  const seed = Number(flag("seed") ?? fail("--seed=<number> (note it down so the order can be reproduced)"));
  const out = ensure(resolve(flag("out") ?? fail("--out=<folder>")));
  const { items, key } = describeSheet(runs, seed);
  write(out, "sheet.md", describeSheetMarkdown(items));
  write(out, "key.json", key);
  write(out, "third.json", sampleThird(items.map((i) => i.sheetId), seed + 1));
  console.log(items.length + " answers on the sheet; the key stays with the scorer; third.json lists the ids for the owner to check blind.");
}

function describeScoreCommand() {
  const runs = (flag("runs") ?? fail("--runs=a/run.json,b/run.json")).split(",").map((p) => read(p).run as DescribeRun);
  const byRun = applyDescribeJudgements(read(flag("key") ?? fail("--key=<key.json>")), read(flag("judgements") ?? fail("--judgements=<file>")), runs.length);
  const reports = runs.map((run, i) => ({ provider: run.provider, model: run.model, ...evaluateDescribeGate(run, byRun[i]) }));
  write(ensure(resolve(flag("out") ?? fail("--out=<folder>"))), "report.json", reports);
  console.log(JSON.stringify(reports, null, 2));
}

async function intentRunCommand() {
  let run: IntentRun;
  // --set=v2 is the guard attempt (docs/AI-FIX-INTENT-GUARD-RUBRIC.md): its 23 goals, its pass marks, the model judged together with the guard.
  const v2 = flag("set") === "v2";
  if (flag("set") && !v2) fail("Unknown --set. Use --set=v2 for the guard attempt, or leave it out for the first 17 goals.");
  const cases = v2 ? INTENT_CASES_V2 : INTENT_CASES;
  const thresholds = v2 ? INTENT_THRESHOLDS_V2 : INTENT_THRESHOLDS;
  // A live run of the guard attempt is always judged with the guard; a dry run applies it only when asked, so both readings can be recorded.
  const guard = has("dry") ? has("guard") : v2 || has("guard");
  if (has("dry")) run = runIntentBaseline(cases, Date.now, guard);
  else {
    const model = flag("model") ?? fail("Choose a model: --model=openai/gpt-oss-20b (or --dry for the keyword-rules baseline).");
    if (!MODELS.includes(model)) fail("Unknown model. Allowed: " + MODELS.join(", "));
    if (!has("confirm-live")) fail("This sends " + cases.length + " invented goals to Groq. Add --confirm-live only when the owner has said go.");
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) fail("GROQ_API_KEY is not set in the backend .env.");
    console.log("Live run: " + model + ", " + cases.length + " goals, one request each, paced to 80% of the account limits" + (guard ? ", judged with the grounding guard." : "."));
    // The probe only notes why a refused request was refused (status and a plain error identifier); it changes no request and no verdict.
    const probe = probingFetch();
    const groq = new GroqProvider({ apiKey: apiKey as string, model: model as GroqModel }, probe.fetch);
    const pacer = new Pacer(pacerLimits(), 700);
    const paced: StructuredLike = {
      structured: (task, parse, signal, observe) =>
        groq.structured(task, parse, signal, (o) => {
          if (o.usage) pacer.settle(o.usage.totalTokens);
          observe?.(o);
        }),
    };
    run = await runIntentGate(paced, cases, { provider: "groq", model, beforeEach: () => pacer.acquire(), refusal: probe.take, guard });
    console.log("Requests made: " + pacer.requestsToday + ", tokens counted: " + pacer.tokensToday);
  }
  const report = evaluateIntentGate(run, thresholds.deadlineMs, thresholds);
  const dir = ensure(join(flag("out") ?? defaultOut, run.startedAt.replace(/[:.]/g, "-") + (v2 ? "_intent_v2_" : "_intent_") + run.model.replace(/[^A-Za-z0-9._+-]/g, "_")));
  write(dir, "run.json", { run, report });
  console.log(JSON.stringify({ folder: dir, provider: run.provider, model: run.model, stoppedBy: run.stoppedBy ?? null, ...report }, null, 2));
}

/** Offline, no request: re-scores the stored raw replies of earlier runs through the guard. A sanity check, never a result. */
function intentReplayCommand() {
  const files = (flag("runs") ?? fail("--runs=a/run.json,b/run.json")).split(",");
  for (const file of files) {
    const stored = read(file).run as IntentRun;
    const replayed = replayWithGuard(stored, INTENT_CASES);
    const report = evaluateIntentGate(replayed);
    console.log(JSON.stringify({ run: file, model: stored.model, aloneBefore: evaluateIntentGate(stored).ordinaryCorrect + "/" + evaluateIntentGate(stored).neutralCorrect + "/" + evaluateIntentGate(stored).injectionCorrect, withGuard: report.ordinaryCorrect + "/" + report.neutralCorrect + "/" + report.injectionCorrect, note: "ordinary/neutral/hidden orders right; designed after these replies were seen, so not a result" }));
  }
}

/** Not a gate run: re-sends one goal up to three times to learn why requests were refused. It judges nothing and gives no verdict. */
async function intentDiagnoseCommand() {
  const model = flag("model") ?? fail("Choose a model: --model=openai/gpt-oss-120b");
  if (!MODELS.includes(model)) fail("Unknown model. Allowed: " + MODELS.join(", "));
  const id = flag("goal") ?? fail("Choose one goal id from the 17, for example --goal=no-servers");
  const chosen = INTENT_CASES.find((c) => c.id === id) ?? fail("Unknown goal id. Known: " + INTENT_CASES.map((c) => c.id).join(", "));
  const repeat = Number(flag("repeat") ?? 1);
  if (!Number.isInteger(repeat) || repeat < 1 || repeat > 3) fail("--repeat must be 1, 2 or 3");
  if (!has("confirm-live")) fail("This sends " + repeat + " request(s) to Groq. Add --confirm-live only when the owner has said go.");
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) fail("GROQ_API_KEY is not set in the backend .env.");
  const probe = probingFetch();
  const groq = new GroqProvider({ apiKey: apiKey as string, model: model as GroqModel }, probe.fetch);
  const pacer = new Pacer(pacerLimits(), 700);
  const attempts: Record<string, unknown>[] = [];
  for (let i = 0; i < repeat; i++) {
    await pacer.acquire();
    let seen: ProviderObservation = {};
    const started = Date.now();
    let outcome = "answered";
    let detail: string | undefined;
    try {
      const answer = await groq.structured(fixIntentTask(chosen.text), parseFixIntent, AbortSignal.timeout(10_000), (o) => {
        if (o.usage) pacer.settle(o.usage.totalTokens);
        seen = { ...seen, ...o };
      });
      detail = differences(answer, chosen.expected).join("; ") || "exactly the expected answer";
    } catch (e) {
      const details = (e as { details?: { reason?: string } }).details;
      outcome = "failed";
      detail = details?.reason ?? (e as Error).name;
    }
    const note = probe.take();
    attempts.push({ attempt: i + 1, outcome, detail, httpStatus: note?.httpStatus ?? null, errorCode: note?.errorCode ?? null, finishReason: seen.finishReason ?? null, latencyMs: seen.latencyMs ?? Date.now() - started, totalTokens: seen.usage?.totalTokens ?? null });
  }
  const startedAt = new Date().toISOString();
  const dir = ensure(join(flag("out") ?? defaultOut, startedAt.replace(/[:.]/g, "-") + "_intent_diagnose_" + model.replace(/[^A-Za-z0-9._-]/g, "_")));
  write(dir, "run.json", { note: "Diagnostic only, not a gate run. No verdict.", model, goal: chosen.id, attempts });
  console.log(JSON.stringify({ folder: dir, model, goal: chosen.id, attempts }, null, 2));
}

(async () => {
  if (command === "intent-replay") intentReplayCommand();
  else if (command === "intent-diagnose") await intentDiagnoseCommand();
  else if (command === "intent-run") await intentRunCommand();
  else if (command === "describe-run") await describeRunCommand();
  else if (command === "describe-sheet") describeSheetCommand();
  else if (command === "describe-score") describeScoreCommand();
  else if (command === "run") await runCommand();
  else if (command === "sheet") sheetCommand();
  else if (command === "score") scoreCommand();
  else fail("Usage: ai-gate <run|sheet|score|describe-run|describe-sheet|describe-score|intent-run|intent-diagnose|intent-replay> (see the comment at the top of src/script/ai-gate.ts)");
})().catch((e: { message?: string }) => fail("Failed: " + (e.message ?? "unknown error")));
