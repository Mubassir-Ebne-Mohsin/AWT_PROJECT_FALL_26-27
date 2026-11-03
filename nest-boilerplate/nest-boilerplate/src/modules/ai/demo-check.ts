import { envSchema } from "@/config/app.config";
import { DEMO_AI_MODEL, DEMO_AI_TASKS } from "@/modules/ai/demo-env";

/**
 * Why the demo is not ready, from the environment alone, as plain sentences. Nothing here ever includes a value from the environment
 * (the key in particular): only the names of the settings that are wrong.
 */
export function demoProblems(env: Record<string, string | undefined>): string[] {
  const problems: string[] = [];
  if (!env.GROQ_API_KEY || !env.GROQ_API_KEY.trim()) problems.push("GROQ_API_KEY is not set in the backend .env, so the AI features cannot work.");
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    problems.push("These settings are missing or not valid: " + [...new Set(parsed.error.issues.map((i) => i.path.join(".") || "(whole configuration)"))].join(", ") + ".");
    return problems;
  }
  const e = parsed.data;
  if (!e.AI_ENABLED) problems.push("AI_ENABLED is not true.");
  if (e.AI_PROVIDER !== "groq") problems.push("AI_PROVIDER is not groq.");
  const tasks = [...e.AI_FEATURES].sort().join(",");
  if (tasks !== [...DEMO_AI_TASKS].sort().join(",")) problems.push("AI_FEATURES is not exactly the three demo tasks (" + DEMO_AI_TASKS.join(", ") + "), so a task could be missing or another one on.");
  if (e.AI_EXPLANATIONS) problems.push("The explain-this-result feature is on, and it failed its test.");
  if (e.GROQ_MODEL !== DEMO_AI_MODEL) problems.push("The model is not " + DEMO_AI_MODEL + ", the one the demo tasks were tested with.");
  return problems;
}

/** The effective demo settings as lines to print. Never includes the key, only whether it is set. */
export function demoSummary(env: Record<string, string | undefined>): string[] {
  const parsed = envSchema.safeParse(env);
  const key = env.GROQ_API_KEY?.trim() ? "set" : "NOT SET";
  if (!parsed.success) return ["Settings: not valid", "Groq key: " + key];
  const e = parsed.data;
  return [
    "AI on: " + e.AI_ENABLED + ", provider: " + e.AI_PROVIDER + ", model: " + e.GROQ_MODEL,
    "AI design tasks on: " + (e.AI_FEATURES.join(", ") || "none"),
    "Explain-this-result on: " + e.AI_EXPLANATIONS,
    "Groq key: " + key,
  ];
}
