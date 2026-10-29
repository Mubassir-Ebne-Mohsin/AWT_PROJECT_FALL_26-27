import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

type Schemas = components["schemas"];
export type AiReadiness = Schemas["AiReadiness"];
export type AiJob = Schemas["AiJob"];
export type AiEvidence = Schemas["AiEvidence"];
export type AcceptedAiJob = Schemas["AcceptedAiJob"];
export type AiRequest = Schemas["AiRequest"];

// Every call uses the local error scope: an optional AI feature must never replace the workspace with a
// system-state screen. Session expiry still reaches the global re-authentication flow.
const local = { scope: "local" } as const;

export const fetchAiReadiness = (signal?: AbortSignal) => api<AiReadiness>("/ai/readiness", { ...local, signal });
export const submitAiJob = (body: AiRequest, signal?: AbortSignal) =>
  api<AcceptedAiJob>("/ai/jobs", { ...local, method: "POST", body, signal });
export const fetchAiJob = (id: string, signal?: AbortSignal) => api<AiJob>("/ai/jobs/" + id, { ...local, signal });
export const fetchAiEvidence = (id: string, signal?: AbortSignal) =>
  api<AiEvidence>("/ai/jobs/" + id + "/evidence", { ...local, signal });
export const cancelAiJob = (id: string, signal?: AbortSignal) =>
  api<AiJob>("/ai/jobs/" + id + "/cancel", { ...local, method: "POST", signal });
