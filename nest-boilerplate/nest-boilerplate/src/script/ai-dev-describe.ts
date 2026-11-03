import * as dotenv from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GroqProvider, type GroqModel } from "@/modules/ai/groq.provider";
import { Pacer, pacerLimits } from "@/modules/ai/evaluation/pacer";
import { expectationChecks, obeyedOrders } from "@/modules/ai/evaluation/describe-cases";
import { DESCRIBE_DEV_V2, describeKeywordBaseline, describeTally, scoreDescribe } from "@/modules/ai/evaluation/describe-dev-v2";
import type { DescribeRecord } from "@/modules/ai/evaluation/describe-gate";
import { AppException } from "@/common/errors";
import { cleanDescription, describeV2Parse, describeV2Task } from "@/modules/ai/tasks/describe-v2";

/**
 * DEVELOPMENT runs of describe-to-design version 2 (docs/AI-DEADLINE-PLAN.md, section 5). Not the acceptance run. From the backend folder:
 *   ai-dev-describe dry                    the keyword-rules draft on the 27 dev descriptions; no key, no network
 *   ai-dev-describe batch --confirm-live   the 27 dev descriptions, one request each (a description that is only an order makes none)
 * Every run is kept under docs/audit/ai-gate/. No retry. The key comes from the environment and is never printed.
 */
dotenv.config({ quiet: true });
const args = process.argv.slice(2);
const command = args[0];
const has = (n: string) => args.includes("--" + n);
const flag = (n: string) => args.find((a) => a.startsWith("--" + n + "="))?.slice(n.length + 3);
const fail = (m: string): never => (console.error(m), process.exit(2));
const MODEL = flag("model") ?? "openai/gpt-oss-120b";
const out = join(__dirname, "../../../../docs/audit/ai-gate");

(async () => {
  if (command === "dry") {
    console.log(JSON.stringify({ note: "keyword rules, no model; dev reference", ...describeTally(describeKeywordBaseline()) }, null, 2));
    return;
  }
  if (command !== "batch") fail("Usage: ai-dev-describe <dry|batch> [--model=...] [--confirm-live]");
  if (!has("confirm-live")) fail("This sends invented descriptions to Groq. Add --confirm-live only when the owner has said go.");
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) fail("GROQ_API_KEY is not set in the backend .env.");
  const provider = new GroqProvider({ apiKey: apiKey as string, model: MODEL as GroqModel }, fetch);
  const pacer = new Pacer(pacerLimits(), 1200);
  const rows: (DescribeRecord & { pass: boolean; why: string })[] = [];
  for (const c of DESCRIBE_DEV_V2) {
    const base = { caseId: c.id, group: c.group, text: c.text, checks: [], obeyed: [] as string[], latencyMs: 0 };
    let record: DescribeRecord;
    const { cleaned } = cleanDescription(c.text);
    if (!cleaned) record = { ...base, outcome: "refused", reason: "NOT_A_SYSTEM (nothing left after cleaning; no model call)" };
    else {
      await pacer.acquire();
      const started = Date.now();
      let seen: { usage?: { totalTokens: number }; rawReply?: string; finishReason?: string } = {};
      try {
        const prepared = await provider.structured(describeV2Task(cleaned), describeV2Parse(c.text, MODEL), AbortSignal.timeout(10_000), (o) => {
          seen = { ...seen, ...o };
          if (o.usage) pacer.settle(o.usage.totalTokens);
        });
        record = { ...base, outcome: "accepted", prepared, checks: expectationChecks(c, prepared), obeyed: obeyedOrders(c, prepared), latencyMs: Date.now() - started };
      } catch (e) {
        const details = (e as { details?: { reason?: string } }).details;
        const refused = e instanceof AppException && e.code === "VALIDATION_FAILED";
        record = { ...base, outcome: refused ? "refused" : "failed", reason: [details?.reason, (e as Error).message].filter(Boolean).join(": "), latencyMs: Date.now() - started };
      }
      record = { ...record, ...(seen.rawReply !== undefined ? { rawReply: seen.rawReply } : {}), ...(seen.finishReason ? { finishReason: seen.finishReason } : {}), ...(seen.usage ? { usage: seen.usage as never } : {}) };
    }
    rows.push({ ...record, ...scoreDescribe(c, record) });
  }
  const tally = describeTally({ records: rows });
  const summary = { model: MODEL, requests: rows.filter((r) => r.usage || r.latencyMs).length, ...tally, slowerThan10s: rows.filter((r) => r.latencyMs > 10_000).length, failed: rows.filter((r) => r.outcome === "failed").length, tokens: pacer.tokensToday };
  const dir = join(out, new Date().toISOString().replace(/[:.]/g, "-") + "_describe_v2_dev_" + MODEL.replace(/[^A-Za-z0-9._+-]/g, "_"));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "run.json"), JSON.stringify({ note: "Development run, not the acceptance run. Descriptions are dev-labelled.", summary, rows }, null, 2) + "\n");
  console.log(JSON.stringify({ folder: dir, ...summary }, null, 2));
})().catch((e: Error) => fail("Run failed: " + e.message));
