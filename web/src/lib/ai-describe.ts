import type { operations } from "@/lib/api/phase3-schema";
import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";

/** Describe-to-design with a hosted model: the request, the readiness and the words around them. Nothing here saves anything. */
export type AiDescribePrepared =
  operations["describeDesignWithAi"]["responses"][200]["content"]["application/json"]["data"];
export type AiTaskReadiness =
  operations["getAiTasksReadiness"]["responses"][200]["content"]["application/json"]["data"]["tasks"][number];

/** The longest description the server accepts for an AI draft. Longer text is never cut, so the person is asked to shorten it. */
export const AI_DESCRIBE_MAX = 500;

export const AI_DESCRIBE_NOTICE =
  "Draft with AI sends the description you typed to Groq, a hosted AI service, to suggest a starting design. Do not put secrets or personal data in it. Groq may keep it for up to 30 days unless Zero Data Retention is on for the account. Nothing is saved until you create the design.";

/** One short line saying why the AI draft cannot be used right now, or null when it can. */
export function describeUnavailableText(readiness: AiTaskReadiness | null | undefined): string | null {
  if (!readiness || !readiness.enabled) return null;
  if (readiness.available) return null;
  if (readiness.reason === "QUOTA_EXHAUSTED") return "The free AI quota is used up for now." + waitText(readiness.retryAfterSeconds);
  if (readiness.reason === "PROVIDER_NOT_CONFIGURED") return "The AI service is not set up on this server.";
  return "AI drafts are not available right now.";
}

export function waitText(seconds?: number) {
  if (!seconds || seconds < 1) return "";
  if (seconds < 90) return " You can try again in about " + seconds + " seconds.";
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 120) return " You can try again in about " + minutes + " minutes.";
  return " You can try again in about " + Math.ceil(minutes / 60) + " hours.";
}

/** Why an AI draft failed, in plain words, with what to do next. */
export function aiDescribeError(error: unknown): string {
  if (!(error instanceof ApiError)) return "The AI draft could not be made. Try again, or use keyword rules.";
  const details = error.details as { reason?: string; retryAfterSeconds?: number; limit?: string } | undefined;
  if (error.status === 401) return "Your session ended. Sign in again to use AI drafts.";
  if (details?.reason === "AI_DISABLED") return "AI drafts are switched off on this server. Use keyword rules instead.";
  if (details?.reason === "PROVIDER_NOT_CONFIGURED") return "The AI service is not set up on this server. Use keyword rules instead.";
  if (details?.reason === "AI_QUOTA" || details?.reason === "PROVIDER_RATE_LIMITED" || error.status === 429) {
    if (details?.limit === "requests per person per day") return "You have used today's AI drafts. Use keyword rules, or try again tomorrow.";
    return "The free AI quota is used up for now." + waitText(details?.retryAfterSeconds) + " You can use keyword rules meanwhile.";
  }
  if (details?.reason === "AI_QUOTA_UNAVAILABLE") return "The AI quota could not be checked, so no request was made. Try again shortly.";
  if (details?.reason === "NOT_A_SYSTEM") return "That did not read as a description of a web system, so no draft was made. Describe what the system does, or use keyword rules.";
  if (details?.reason === "INVALID_OUTPUT" || error.status === 422)
    return error.fieldErrors.text
      ? "The description " + error.fieldErrors.text.toLowerCase()
      : "The AI's suggestion could not be used. Try rewording your description, or use keyword rules.";
  if (error.status === 0 || error.code === "NETWORK") return "Could not reach the server. Nothing was sent to the AI.";
  return "The AI draft could not be made. Try again, or use keyword rules.";
}

export const fetchAiTasksReadiness = () =>
  api<{ tasks: AiTaskReadiness[] }>("/ai/tasks/readiness", { silent: true, scope: "local" });

export const requestAiDescribe = (text: string, signal?: AbortSignal) =>
  api<AiDescribePrepared>("/ai/tasks/describe", { method: "POST", body: { text }, silent: true, scope: "local", signal });
