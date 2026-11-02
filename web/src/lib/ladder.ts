import type { operations } from "@/lib/api/phase3-schema";
import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { numberText } from "@/lib/result-presentation";

/** The load ladder: the same design at higher request rates. Every figure is the server's; the words below only describe them. */
export type Ladder = operations["climbDesignLadder"]["responses"][200]["content"]["application/json"]["data"];
export type Rung = Ladder["rungs"][number];

export const requestLadder = (designId: string, expectedRevision: number, runId: string, signal?: AbortSignal) =>
  api<Ladder>("/designs/" + designId + "/ladder", { method: "POST", body: { expectedRevision, runId }, silent: true, scope: "local", signal });

export const LADDER_NOTE =
  "Each row is the same design with the same traffic shape, bursts and targets; only the average request rate changes. These are estimates from a model, not measurements of real infrastructure. Nothing is saved.";

type Verdict = "pass" | "strained" | "fail";
const WORD: Record<Verdict, string> = { pass: "passes", strained: "is strained", fail: "fails" };
export const verdictWord = (v: Verdict) => WORD[v];

export const loadLabel = (multiplier: number) => (multiplier === 1 ? "Now" : numberText(multiplier, 2) + "× load");
export const rate = (rps: number) => numberText(rps, 2);

/** What a row's result cell says. */
export function resultText(r: Rung): string {
  if (r.status === "TOO_LARGE") return "Beyond the model's limit";
  if (r.status === "UNAVAILABLE" || !r.measure) return "Could not be checked";
  return verdictWord(r.measure.verdict);
}

/**
 * One honest sentence about the whole ladder, from the verdicts the server reported and nothing else. It says where the design
 * stops passing and where it fails, and says so when a row could not be checked, so a gap is never read as a pass.
 */
export function headline(rungs: readonly Rung[]): string {
  // A row has a measure exactly when the server calculated it, so this is the rows that can be talked about.
  const known = rungs.filter((r) => r.measure);
  if (!known.length) return "No load could be checked.";
  const firstWorse = known.find((r) => r.measure!.verdict !== "pass");
  const firstFail = known.find((r) => r.measure!.verdict === "fail");
  let text: string;
  if (!firstWorse) {
    const top = known[known.length - 1];
    text = top.multiplier === 1 ? "Passes at the recorded load." : "Passes at every load checked, up to " + loadLabel(top.multiplier) + " (" + rate(top.rps) + " rps).";
  } else if (firstWorse.multiplier === 1) {
    text = (firstWorse.measure!.verdict === "fail" ? "Already fails" : "Already strained") + " at the recorded load.";
  } else {
    const held = [...known].reverse().find((r) => r.multiplier < firstWorse.multiplier && r.measure!.verdict === "pass")!;
    text = "Passes up to " + (held.multiplier === 1 ? "the recorded load" : loadLabel(held.multiplier) + " (" + rate(held.rps) + " rps)") + ", then " + (firstWorse.measure!.verdict === "fail" ? "fails" : "is strained") + " at " + loadLabel(firstWorse.multiplier) + " (" + rate(firstWorse.rps) + " rps)";
    text += firstFail && firstFail !== firstWorse ? ", and fails at " + loadLabel(firstFail.multiplier) + "." : ".";
  }
  const large = rungs.filter((r) => r.status === "TOO_LARGE").map((r) => loadLabel(r.multiplier));
  const missing = rungs.filter((r) => r.status === "UNAVAILABLE").map((r) => loadLabel(r.multiplier));
  if (large.length) text += " " + large.join(" and ") + " would be beyond the largest rate the model accepts.";
  if (missing.length) text += " " + missing.join(" and ") + " could not be checked, so nothing is said about " + (missing.length > 1 ? "them" : "it") + ".";
  return text;
}

export function ladderError(error: unknown): string {
  if (!(error instanceof ApiError)) return "The load ladder could not be made. Try again.";
  const reason = (error.details as { reason?: string } | undefined)?.reason;
  if (error.status === 401) return "Your session ended. Sign in again to see the ladder.";
  if (reason === "RUN_NOT_CURRENT") return "This result is not for the saved design any more. Save, then run the test again first.";
  if (reason === "RUN_NOT_USABLE") return "The ladder needs a completed test run.";
  if (error.status === 409) return "The design changed since this result. Reload it, then run the test again.";
  if (error.status === 429) return "Calculation capacity is busy. Try again in a moment.";
  if (error.status === 0 || error.code === "NETWORK") return "Could not reach the server.";
  return "The load ladder could not be made. Try again.";
}
