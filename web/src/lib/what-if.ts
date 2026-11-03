import type { operations } from "@/lib/api/phase3-schema";
import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { numberText } from "@/lib/result-presentation";
import { waitText, type AiTaskReadiness } from "@/lib/ai-describe";

/** "What if the traffic changed?": the saved design under another load. Every figure is the server's; the words here only describe them. */
export type WhatIf = operations["askDesignWhatIf"]["responses"][200]["content"]["application/json"]["data"];
export type WhatIfSide = WhatIf["after"];
export type WhatIfChange = WhatIf["change"];
export type TrafficMode = WhatIfChange["trafficMode"];
export type ShapeChoice = WhatIfChange["shape"];
export type ReadShareChoice = WhatIfChange["readShare"];

/** The bounds the server enforces. A value outside them is refused there; here they only let the form say so before sending. */
export const WHATIF_LIMITS = { multiply: { min: 0.1, max: 20 }, set: { min: 1, max: 10_000_000 } } as const;

export const NO_CHANGE: WhatIfChange = { trafficMode: "keep", value: 0, shape: "keep", readShare: "keep" };

export const requestWhatIf = (designId: string, expectedRevision: number, runId: string, change: WhatIfChange, signal?: AbortSignal) =>
  api<WhatIf>("/designs/" + designId + "/what-if", { method: "POST", body: { expectedRevision, runId, change }, silent: true, scope: "local", signal });

export const WHATIF_NOTE =
  "The second column is the same design under the changed traffic, calculated by the same model as a test run. These are estimates from a model, not measurements of real infrastructure. Nothing is saved.";

export const TRAFFIC_CHOICES: { mode: TrafficMode; label: string }[] = [
  { mode: "keep", label: "Keep the request rate" },
  { mode: "multiply", label: "Multiply the request rate by" },
  { mode: "set", label: "Set the request rate to" },
];
export const SHAPE_CHOICES: { shape: ShapeChoice; label: string }[] = [
  { shape: "keep", label: "Keep the shape" },
  { shape: "steady", label: "Steady" },
  { shape: "ramp", label: "Ramp up" },
  { shape: "spike", label: "Spike" },
];
export const READ_SHARE_CHOICES: { share: ReadShareChoice; label: string }[] = [
  { share: "keep", label: "Keep the read share" },
  { share: "mostly_reads", label: "Mostly reads (90%)" },
  { share: "balanced", label: "Half and half (50%)" },
  { share: "mostly_writes", label: "Mostly writes (10%)" },
];

export const isNoChange = (c: WhatIfChange) => c.trafficMode === "keep" && c.shape === "keep" && c.readShare === "keep";

/** A plain sentence about why the form cannot be sent yet, or null when it can. */
export function changeProblem(c: WhatIfChange): string | null {
  if (isNoChange(c)) return "Choose something to change: the traffic, its shape or the read share.";
  if (c.trafficMode === "keep") return null;
  const { min, max } = WHATIF_LIMITS[c.trafficMode];
  if (!Number.isFinite(c.value) || c.value < min || c.value > max)
    return c.trafficMode === "multiply" ? "Multiply by a number from " + min + " to " + max + "." : "Set a rate from " + numberText(min, 0) + " to " + numberText(max, 0) + " requests per second.";
  return null;
}

/** Keeps the value field meaningful: when the mode is keep the value is not sent as anything but 0. */
export const normalised = (c: WhatIfChange): WhatIfChange => (c.trafficMode === "keep" ? { ...c, value: 0 } : c);

/** One sentence saying what was changed, worded here from the form. */
export function changeSentence(c: WhatIfChange): string {
  const parts: string[] = [];
  if (c.trafficMode === "multiply") parts.push("the request rate multiplied by " + numberText(c.value, 3));
  if (c.trafficMode === "set") parts.push("the request rate set to " + numberText(c.value, 3) + " per second");
  if (c.shape !== "keep") parts.push("a " + c.shape + " shape");
  if (c.readShare !== "keep") parts.push(READ_SHARE_CHOICES.find((x) => x.share === c.readShare)!.label.toLowerCase());
  return parts.length ? "Changed: " + parts.join(", ") + "." : "Nothing changed.";
}

type Verdict = "pass" | "strained" | "fail";
const WORD: Record<Verdict, string> = { pass: "passes", strained: "is strained", fail: "fails" };
export const verdictWord = (v: Verdict) => WORD[v];

/** What a side's result cell says. A side the server could not calculate is never read as a pass. */
export function resultText(s: WhatIfSide): string {
  if (s.status === "TOO_LARGE") return "Beyond the model's limit";
  if (s.status === "UNAVAILABLE" || !s.measure) return "Could not be checked";
  return verdictWord(s.measure.verdict);
}

export function whatIfError(error: unknown): string {
  if (!(error instanceof ApiError)) return "The what-if could not be calculated. Try again.";
  const reason = (error.details as { reason?: string } | undefined)?.reason;
  if (error.status === 401) return "Your session ended. Sign in again to use this.";
  if (reason === "WHATIF_OUT_OF_RANGE") return "That value is outside the allowed range, so nothing was calculated. " + (error.message ?? "");
  if (reason === "WHATIF_NOTHING_TO_CHANGE") return "Choose something to change: the traffic, its shape or the read share.";
  if (reason === "RUN_NOT_CURRENT") return "This result is not for the saved design any more. Save, then run the test again first.";
  if (reason === "RUN_NOT_USABLE") return "This needs a completed test run.";
  if (error.status === 409) return "The design changed since this result. Reload it, then run the test again.";
  if (error.status === 429) return "Calculation capacity is busy. Try again in a moment.";
  if (error.status === 0 || error.code === "NETWORK") return "Could not reach the server.";
  return "The what-if could not be calculated. Try again.";
}

// ---- "Say it in words": a hosted model only fills the controls above; the person applies it, then runs the what-if ----

export type AiWhatIf = operations["interpretWhatIfWithAi"]["responses"][200]["content"]["application/json"]["data"];
/** The longest sentence the server accepts. Longer text is never cut, so the person is asked to shorten it. */
export const AI_WHATIF_MAX = 300;
export const AI_WHATIF_NOTICE =
  "Reading your sentence with AI sends the text you typed to Groq, a hosted AI service. Do not put secrets or personal data in it. It only fills the controls above, which you can change; every figure still comes from the model, not the AI.";
/** Said wherever the box is shown. The measured comparison is on the Evaluation page; until a run passes, the label stays experimental. */
export const AI_WHATIF_EXPERIMENTAL = "Experimental: it has not passed an acceptance run, and plain keyword rules read most of these sentences just as well.";

export const requestAiWhatIf = (text: string, signal?: AbortSignal) => api<AiWhatIf>("/ai/tasks/what-if", { method: "POST", body: { text }, silent: true, scope: "local", signal });

/** The box is offered only when the server says the "whatif" task is switched on. */
export const whatIfAiEnabled = (tasks: readonly AiTaskReadiness[] | null | undefined) => !!tasks?.find((t) => t.task === "whatif" && t.enabled);

/** One short line saying why the box cannot be used right now, or null when it can. */
export function whatIfAiUnavailableText(tasks: readonly AiTaskReadiness[] | null | undefined): string | null {
  const readiness = tasks?.find((t) => t.task === "whatif");
  if (!readiness || !readiness.enabled || readiness.available) return null;
  if (readiness.reason === "QUOTA_EXHAUSTED") return "The free AI quota is used up for now." + waitText(readiness.retryAfterSeconds);
  if (readiness.reason === "PROVIDER_NOT_CONFIGURED") return "The AI service is not set up on this server.";
  return "Reading a sentence with AI is not available right now.";
}

export function aiWhatIfError(error: unknown): string {
  if (!(error instanceof ApiError)) return "The sentence could not be read. Use the controls above.";
  const details = error.details as { reason?: string; retryAfterSeconds?: number; limit?: string } | undefined;
  if (error.status === 401) return "Your session ended. Sign in again to use this.";
  if (details?.reason === "AI_DISABLED") return "Reading a sentence with AI is switched off on this server. Use the controls above.";
  if (details?.reason === "PROVIDER_NOT_CONFIGURED") return "The AI service is not set up on this server. Use the controls above.";
  if (details?.reason === "AI_QUOTA" || details?.reason === "PROVIDER_RATE_LIMITED" || error.status === 429) {
    if (details?.limit === "requests per person per day") return "You have used today's AI requests. Use the controls above, or try again tomorrow.";
    return "The free AI quota is used up for now." + waitText(details?.retryAfterSeconds) + " Use the controls above meanwhile.";
  }
  if (details?.reason === "AI_QUOTA_UNAVAILABLE") return "The AI quota could not be checked, so no request was made. Try again shortly.";
  if (details?.reason === "INVALID_OUTPUT" || error.status === 422) return error.fieldErrors.text ? "The sentence " + error.fieldErrors.text.toLowerCase() : "The AI's reading could not be used. Try rewording, or use the controls above.";
  if (error.status === 0 || error.code === "NETWORK") return "Could not reach the server. Nothing was sent to the AI.";
  return "The sentence could not be read. Use the controls above.";
}
