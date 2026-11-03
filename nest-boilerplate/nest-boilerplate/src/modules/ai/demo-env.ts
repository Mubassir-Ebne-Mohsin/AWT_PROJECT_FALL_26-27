/**
 * The AI settings the demo forces (docs/DEMO-SCRIPT.md). They override whatever the environment or `.env` says, so the demo is the
 * same on every machine and cannot be started half-configured: the goal box for the fix suggestions on, nothing else AI on, and the
 * model the guard attempt was tested with.
 *
 * This file imports nothing on purpose. The application's configuration module reads the environment once, when it is first
 * imported, so these values must be in place before anything imports it.
 */
export const DEMO_AI_MODEL = "openai/gpt-oss-120b";
export const DEMO_AI_ENV = {
  AI_ENABLED: "true",
  AI_PROVIDER: "groq",
  AI_FEATURES: "fixes",
  AI_EXPLANATIONS: "false",
  GROQ_MODEL: DEMO_AI_MODEL,
} as const;

/** Sets the demo values, replacing any others. Every other variable, including the key, is left exactly as it was. */
export function applyDemoEnv(env: Record<string, string | undefined> = process.env): void {
  for (const [name, value] of Object.entries(DEMO_AI_ENV)) env[name] = value;
}
