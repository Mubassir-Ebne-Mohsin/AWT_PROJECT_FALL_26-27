import { appConfig } from "@/config";
export const AI_SETTINGS = Symbol("AI_SETTINGS");
export const AI_FETCH = Symbol("AI_FETCH");
/** The hosted provider's key. Kept out of AiSettings on purpose: settings are read by readiness and may be logged. */
export const GROQ_CREDENTIALS = Symbol("GROQ_CREDENTIALS");
export interface AiSettings {
  enabled: boolean;
  /** Which provider explains results; local Ollama when absent. */
  provider?: "ollama" | "groq";
  baseUrl: string;
  /** The model of the selected provider. */
  model: string;
  deadlineMs: number;
  minFreeMiB: number;
  minCommitMiB: number;
}
export function aiSettings(): AiSettings {
  const e = appConfig.env;
  return {
    enabled: e.AI_ENABLED,
    provider: e.AI_PROVIDER,
    baseUrl: e.OLLAMA_BASE_URL,
    model: e.AI_PROVIDER === "groq" ? e.GROQ_MODEL : e.OLLAMA_MODEL,
    deadlineMs: e.AI_DEADLINE_MS,
    minFreeMiB: e.AI_MIN_FREE_MIB,
    minCommitMiB: e.AI_MIN_COMMIT_MIB,
  };
}
export const groqCredentials = () => ({ apiKey: appConfig.env.GROQ_API_KEY });
