import { appConfig } from "@/config";
export const AI_SETTINGS = Symbol("AI_SETTINGS");
export const AI_FETCH = Symbol("AI_FETCH");
/** The hosted provider's key. Kept out of AiSettings on purpose: settings are read by readiness and may be logged. */
export const GROQ_CREDENTIALS = Symbol("GROQ_CREDENTIALS");
/** The hosted account's limits and how much of them this application may use. */
export interface QuotaSettings {
  requestsPerMinute: number;
  requestsPerDay: number;
  tokensPerMinute: number;
  tokensPerDay: number;
  /** Share of each limit to use, so another client of the same account never meets a wall. */
  margin: number;
  /** Explanations one person may request per UTC day. */
  userPerDay: number;
}
export interface AiSettings {
  enabled: boolean;
  /** Hosted quota limits; the account's published free limits when absent. */
  quota?: QuotaSettings;
  /** Design tasks that may use the hosted model; none when absent. */
  features?: ("describe" | "whatif" | "fixes")[];
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
    features: e.AI_FEATURES,
    baseUrl: e.OLLAMA_BASE_URL,
    model: e.AI_PROVIDER === "groq" ? e.GROQ_MODEL : e.OLLAMA_MODEL,
    quota: {
      requestsPerMinute: e.GROQ_LIMIT_RPM,
      requestsPerDay: e.GROQ_LIMIT_RPD,
      tokensPerMinute: e.GROQ_LIMIT_TPM,
      tokensPerDay: e.GROQ_LIMIT_TPD,
      margin: e.GROQ_QUOTA_MARGIN,
      userPerDay: e.AI_USER_DAILY_LIMIT,
    },
    deadlineMs: e.AI_DEADLINE_MS,
    minFreeMiB: e.AI_MIN_FREE_MIB,
    minCommitMiB: e.AI_MIN_COMMIT_MIB,
  };
}
export const groqCredentials = () => ({ apiKey: appConfig.env.GROQ_API_KEY });
