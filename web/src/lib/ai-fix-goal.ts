import type { operations } from "@/lib/api/phase3-schema";
import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { waitText, type AiTaskReadiness } from "@/lib/ai-describe";

/** "Say what you want from the fixes" with a hosted model: the request and the words around it. The result is only a filter the person can change. */
export type AiFixGoal = operations["interpretFixGoalWithAi"]["responses"][200]["content"]["application/json"]["data"];

/** The longest goal the server accepts. Longer text is never cut, so the person is asked to shorten it. */
export const AI_FIX_GOAL_MAX = 200;

export const AI_FIX_GOAL_NOTICE =
  "Reading your goal with AI sends the sentence you typed to Groq, a hosted AI service. Do not put secrets or personal data in it. It only sets the choices below, which you can change; every figure still comes from the model, not the AI.";

export const requestFixGoal = (goal: string, signal?: AbortSignal) =>
  api<AiFixGoal>("/ai/tasks/fix-intent", { method: "POST", body: { goal }, silent: true, scope: "local", signal });

/** The goal box is offered only when the server says the "fixes" task is switched on. */
export const fixGoalEnabled = (tasks: readonly AiTaskReadiness[] | null | undefined) => !!tasks?.find((t) => t.task === "fixes" && t.enabled);

/** One short line saying why the goal box cannot be used right now, or null when it can. */
export function fixGoalUnavailableText(tasks: readonly AiTaskReadiness[] | null | undefined): string | null {
  const readiness = tasks?.find((t) => t.task === "fixes");
  if (!readiness || !readiness.enabled || readiness.available) return null;
  if (readiness.reason === "QUOTA_EXHAUSTED") return "The free AI quota is used up for now." + waitText(readiness.retryAfterSeconds);
  if (readiness.reason === "PROVIDER_NOT_CONFIGURED") return "The AI service is not set up on this server.";
  return "Reading a goal with AI is not available right now.";
}

export function fixGoalError(error: unknown): string {
  if (!(error instanceof ApiError)) return "The goal could not be read. Use the choices below instead.";
  const details = error.details as { reason?: string; retryAfterSeconds?: number; limit?: string } | undefined;
  if (error.status === 401) return "Your session ended. Sign in again to use this.";
  if (details?.reason === "AI_DISABLED") return "Reading a goal with AI is switched off on this server. Use the choices below.";
  if (details?.reason === "PROVIDER_NOT_CONFIGURED") return "The AI service is not set up on this server. Use the choices below.";
  if (details?.reason === "AI_QUOTA" || details?.reason === "PROVIDER_RATE_LIMITED" || error.status === 429) {
    if (details?.limit === "requests per person per day") return "You have used today's AI requests. Use the choices below, or try again tomorrow.";
    return "The free AI quota is used up for now." + waitText(details?.retryAfterSeconds) + " Use the choices below meanwhile.";
  }
  if (details?.reason === "AI_QUOTA_UNAVAILABLE") return "The AI quota could not be checked, so no request was made. Try again shortly.";
  if (details?.reason === "INVALID_OUTPUT" || error.status === 422) return error.fieldErrors.goal ? "The goal " + error.fieldErrors.goal.toLowerCase() : "The AI's reading could not be used. Try rewording, or use the choices below.";
  if (error.status === 0 || error.code === "NETWORK") return "Could not reach the server. Nothing was sent to the AI.";
  return "The goal could not be read. Use the choices below instead.";
}
