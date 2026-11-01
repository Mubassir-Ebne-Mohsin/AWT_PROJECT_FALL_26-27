import type { AiSettings } from "@/modules/ai/ai.settings";
import { GroqProvider, type GroqModel } from "@/modules/ai/groq.provider";
import type { ExplanationProvider } from "@/modules/ai/provider";

/**
 * The provider the configuration names. Hosted Groq is used only when it is asked for, and a hosted provider with no key stays
 * hosted (and reports itself as not configured) rather than quietly falling back to the local model: the person who chose to send
 * facts to a hosted service, or not to, is the only one who changes that.
 */
export function selectProvider(settings: AiSettings, ollama: ExplanationProvider, credentials: { apiKey: string }, fetcher: typeof fetch): ExplanationProvider {
  if (settings.provider === "groq") return new GroqProvider({ apiKey: credentials.apiKey, model: settings.model as GroqModel }, fetcher);
  return ollama;
}
