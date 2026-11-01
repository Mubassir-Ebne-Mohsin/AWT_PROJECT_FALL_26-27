import { z } from "zod";
import { answerKey, type GateRun, type Judgement, type SheetItem } from "@/modules/ai/evaluation/harness";

/** The three questions a reviewer answers for every accepted answer. Mirrors docs/AI-GATE-RUBRIC.md. */
export const RUBRIC_QUESTIONS = [
  "Is it about this result? (it describes the verdict, latency, errors or bottleneck of the facts shown, not something generic)",
  "Does it name the real bottleneck, or say there is none? (and does not name a different component, or invent one)",
  "Is every number in it one of the supplied facts, in the right unit?",
] as const;

export const judgementsFileSchema = z.record(z.string(), z.strictObject({ useful: z.boolean(), fabricated: z.boolean() }));

/** A page a human can read: the facts and the answer for each sheet id, and the questions. No provider, model or run name. */
export function sheetMarkdown(items: readonly SheetItem[]): string {
  const lines = [
    "# Blind review sheet",
    "",
    "For every answer, decide two things and write them in judgements.json as `\"A001\": { \"useful\": true, \"fabricated\": false }`:",
    "",
    ...RUBRIC_QUESTIONS.map((q, i) => i + 1 + ". " + q),
    "",
    "- **useful** is true only if all three answers are yes.",
    "- **fabricated** is true if the answer states a figure or a bottleneck the facts do not support, even if it looks plausible.",
    "",
  ];
  for (const item of items) {
    lines.push("---", "", "## " + item.sheetId, "", "Facts:", "```json", JSON.stringify(item.facts, null, 2), "```", "", "Answer:", "```json", JSON.stringify(item.answer, null, 2), "```", "");
  }
  return lines.join("\n");
}

/**
 * Turns a judgements file back into per-run judgements using the key, refusing a file that names an unknown sheet id or
 * leaves any out, so a partial or mistyped file can never be scored as if it were complete.
 */
export function applyJudgements(
  key: Record<string, { runIndex: number; answer: string }>,
  file: unknown,
  runCount: number,
): Record<string, Judgement>[] {
  const parsed = judgementsFileSchema.parse(file);
  const unknown = Object.keys(parsed).filter((id) => !key[id]);
  if (unknown.length) throw new Error("Judgements for unknown sheet ids: " + unknown.join(", "));
  const missing = Object.keys(key).filter((id) => !parsed[id]);
  if (missing.length) throw new Error(missing.length + " sheet ids have no judgement, for example " + missing.slice(0, 3).join(", "));
  const byRun: Record<string, Judgement>[] = Array.from({ length: runCount }, () => ({}));
  for (const [id, where] of Object.entries(key)) byRun[where.runIndex][where.answer] = parsed[id];
  return byRun;
}

/** The record an answer key points at, to show a reviewer's disagreement in context. */
export const recordFor = (run: GateRun, key: string) => run.records.find((r) => answerKey(r) === key);
