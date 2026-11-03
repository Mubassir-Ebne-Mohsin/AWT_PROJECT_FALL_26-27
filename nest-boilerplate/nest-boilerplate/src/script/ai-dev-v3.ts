import * as dotenv from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GroqProvider, type GroqModel } from "@/modules/ai/groq.provider";
import { Pacer, pacerLimits } from "@/modules/ai/evaluation/pacer";
import { INTENT_DEV_V3, scoreReading, tally, pipelineWithoutModel, type DevCase } from "@/modules/ai/evaluation/intent-dev-v3";
import { fixIntentV3Task, parseFixIntentV3, readGoal, type FixIntentV3Output } from "@/modules/ai/tasks/fix-intent-v3";

/**
 * DEVELOPMENT runs of goal box v3 (docs/AI-DEADLINE-PLAN.md, section 5). Not the acceptance run. Run from the backend folder:
 *   ai-dev-v3 repeat --confirm-live   one dev goal sent 3 times, to see whether the answers are identical (3 requests)
 *   ai-dev-v3 batch  --confirm-live   the 45 dev goals, one request each (at most 45; goals whose cleaned text is empty make none)
 *   ai-dev-v3 dry                      the no-model pipeline on the dev goals; no key, no network
 * Every run is kept under docs/audit/ai-gate/. No retry: a failed request is recorded as failed. The key comes from the environment
 * and is never printed.
 */
dotenv.config({ quiet: true });
const args = process.argv.slice(2);
const command = args[0];
const has = (n: string) => args.includes("--" + n);
const flag = (n: string) => args.find((a) => a.startsWith("--" + n + "="))?.slice(n.length + 3);
const fail = (m: string): never => (console.error(m), process.exit(2));
const MODEL = flag("model") ?? "openai/gpt-oss-120b";
const REPEAT_GOAL = "o-two";
const out = join(__dirname, "../../../../docs/audit/ai-gate");

interface Row {
  id: string;
  group: string;
  text: string;
  modelCalled: boolean;
  raw: FixIntentV3Output | null;
  status: string | null;
  filter: unknown;
  correct: boolean | null;
  unsupportedChoice: boolean | null;
  dropped: string[];
  error: string | null;
  latencyMs: number | null;
  totalTokens: number | null;
}

function groq() {
  if (!has("confirm-live")) fail("This sends invented goals to Groq. Add --confirm-live only when the owner has said go.");
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) fail("GROQ_API_KEY is not set in the backend .env.");
  return new GroqProvider({ apiKey: apiKey as string, model: MODEL as GroqModel }, fetch);
}

async function ask(provider: GroqProvider, pacer: Pacer, c: DevCase): Promise<Row> {
  const row: Row = { id: c.id, group: c.group, text: c.text, modelCalled: false, raw: null, status: null, filter: null, correct: null, unsupportedChoice: null, dropped: [], error: null, latencyMs: null, totalTokens: null };
  try {
    const reading = await readGoal(c.text, async (cleaned) => {
      await pacer.acquire();
      row.modelCalled = true;
      const started = Date.now();
      const answer = await provider.structured(
        fixIntentV3Task(cleaned),
        (v) => (row.raw = parseFixIntentV3(v)),
        AbortSignal.timeout(10_000),
        (o) => {
          if (o.usage) {
            pacer.settle(o.usage.totalTokens);
            row.totalTokens = o.usage.totalTokens;
          }
          row.latencyMs = o.latencyMs ?? Date.now() - started;
        },
      );
      return answer;
    });
    const score = scoreReading(reading, c.expected);
    Object.assign(row, { status: reading.status, filter: reading.filter, correct: score.correct, unsupportedChoice: score.unsupportedChoice, dropped: reading.dropped });
  } catch (e) {
    row.error = (e as { details?: { reason?: string } }).details?.reason ?? (e as Error).name;
    row.correct = false;
  }
  return row;
}

function save(kind: string, body: unknown) {
  const startedAt = new Date().toISOString();
  const dir = join(out, startedAt.replace(/[:.]/g, "-") + "_goalbox_v3_dev_" + kind + "_" + MODEL.replace(/[^A-Za-z0-9._+-]/g, "_"));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "run.json"), JSON.stringify(body, null, 2) + "\n");
  return dir;
}

(async () => {
  if (command === "dry") {
    const t = tally((text) => pipelineWithoutModel(text));
    console.log(JSON.stringify({ note: "no model; dev reference", ...t }, null, 2));
    return;
  }
  if (command !== "repeat" && command !== "batch") fail("Usage: ai-dev-v3 <dry|repeat|batch> [--model=...] [--confirm-live]");
  const provider = groq();
  const pacer = new Pacer(pacerLimits(), 700);
  const cases = command === "repeat" ? Array(3).fill(INTENT_DEV_V3.find((c) => c.id === REPEAT_GOAL) as DevCase) : INTENT_DEV_V3;
  console.log("Live dev run (" + command + "): " + MODEL + ", " + cases.length + " goals.");
  const rows: Row[] = [];
  for (const c of cases) rows.push(await ask(provider, pacer, c));
  const byGroup: Record<string, { correct: number; total: number }> = {};
  for (const r of rows) {
    const g = (byGroup[r.group] ??= { correct: 0, total: 0 });
    g.total++;
    if (r.correct) g.correct++;
  }
  const summary = {
    model: MODEL,
    requests: rows.filter((r) => r.modelCalled).length,
    correct: rows.filter((r) => r.correct).length,
    total: rows.length,
    unsupportedChoices: rows.filter((r) => r.unsupportedChoice).length,
    failedRequests: rows.filter((r) => r.error).length,
    slowerThan10s: rows.filter((r) => (r.latencyMs ?? 0) > 10_000).length,
    byGroup,
    tokens: pacer.tokensToday,
    ...(command === "repeat" ? { identicalAnswers: new Set(rows.map((r) => JSON.stringify(r.raw))).size === 1 } : {}),
  };
  const folder = save(command, { note: "Development run, not the acceptance run. Goals are dev-labelled.", summary, rows });
  console.log(JSON.stringify({ folder, ...summary }, null, 2));
})().catch((e: Error) => fail("Run failed: " + e.message));
