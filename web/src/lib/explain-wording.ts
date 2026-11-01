import type { AiJob, AiReadiness } from "@/lib/api/ai";

// Wording that depends on WHERE an explanation is generated. A local model keeps everything on this computer; a hosted one
// (Groq) receives the verified facts of one saved run. Anything that does not say which provider it is keeps the local wording,
// so responses from before the provider was reported read exactly as they always did.

export const isHosted = (provider: string | null | undefined) => provider === "groq";

/** Exactly what is sent to the hosted provider (the server's verified facts for one saved run), and what the provider may keep. */
export const SENT_TO_HOSTED =
  "Sent to Groq (hosted): the verdict, the p95 and its target, the error rate and its budget, and the bottleneck's label and utilization for this saved run. Nothing else from your design or your account. Groq may keep inputs and outputs for up to 30 days unless Zero Data Retention is turned on for the account.";

/** "less than a minute", "about 3 minutes", "about 2 hours": how long until a hosted quota or back-off allows another request. */
export function waitText(seconds: number | undefined): string {
  if (!seconds || seconds < 1) return "a moment";
  if (seconds < 60) return "less than a minute";
  if (seconds < 3600) {
    const minutes = Math.ceil(seconds / 60);
    return `about ${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  const hours = Math.ceil(seconds / 3600);
  return `about ${hours} hour${hours === 1 ? "" : "s"}`;
}

/** Readiness messages that differ for a hosted provider. Reasons not listed here read the same as for a local one. */
export const HOSTED_READINESS_TEXT: Partial<Record<AiReadiness["reason"], string>> = {
  DISABLED: "AI is not enabled. Your numerical results are unaffected.",
  AVAILABLE: "Hosted AI (Groq) is ready.",
  BUSY: "AI is busy with another request. Try again when it finishes.",
  MODEL_MISSING: "The configured hosted model is not available. Check the model name set on the server.",
  MEMORY_PRESSURE: "AI is not available right now. Try again later.",
  PROVIDER_UNAVAILABLE: "The hosted AI service is not available. Check that its key is set on the server, then try again.",
  INSTANCE_BUSY: "Another StressForge server instance owns AI. Core features are unaffected.",
};

/** Failure messages that differ for a hosted provider. */
export const HOSTED_FAILURE_TEXT: Record<string, string> = {
  PROVIDER_UNAVAILABLE: "The hosted service did not respond or rejected the request, so this explanation did not finish.",
  MODEL_CHANGED: "The hosted model reported a different name than the one configured, so the answer was discarded.",
  PROVIDER_RATE_LIMITED: "Groq's free quota was reached, so this explanation did not finish. Nothing was retried. Try again later.",
};

/** The provenance lines for a job. Absent figures are not shown, never filled in. */
export const digestText = (job: Pick<AiJob, "provider" | "modelDigest">) => (isHosted(job.provider) ? "no digest (hosted model)" : job.modelDigest.slice(0, 12));

export const usageText = (usage: AiJob["usage"]) => (usage ? `${usage.promptTokens} in · ${usage.completionTokens} out · ${usage.totalTokens} total` : null);

export function latencyText(ms: AiJob["latencyMs"]): string | null {
  if (ms === null || ms === undefined) return null;
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}
