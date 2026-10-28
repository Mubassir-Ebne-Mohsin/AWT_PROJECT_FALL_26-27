import { appConfig } from "@/config";
export const AI_SETTINGS = Symbol("AI_SETTINGS");
export const AI_FETCH = Symbol("AI_FETCH");
export interface AiSettings {
  enabled: boolean;
  baseUrl: string;
  model: string;
  deadlineMs: number;
  minFreeMiB: number;
  minCommitMiB: number;
}
export function aiSettings(): AiSettings {
  const e = appConfig.env;
  return {
    enabled: e.AI_ENABLED,
    baseUrl: e.OLLAMA_BASE_URL,
    model: e.OLLAMA_MODEL,
    deadlineMs: e.AI_DEADLINE_MS,
    minFreeMiB: e.AI_MIN_FREE_MIB,
    minCommitMiB: e.AI_MIN_COMMIT_MIB,
  };
}
