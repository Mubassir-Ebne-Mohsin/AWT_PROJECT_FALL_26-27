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

(async () => {
  if (command === "describe-run") await describeRunCommand();
  else if (command === "describe-sheet") describeSheetCommand();
  else if (command === "describe-score") describeScoreCommand();
  else if (command === "run") await runCommand();
  else if (command === "sheet") sheetCommand();
  else if (command === "score") scoreCommand();
  else fail("Usage: ai-gate <run|sheet|score|describe-run|describe-sheet|describe-score> (see the comment at the top of src/script/ai-gate.ts)");
})().catch((e: { message?: string }) => fail("Failed: " + (e.message ?? "unknown error")));
