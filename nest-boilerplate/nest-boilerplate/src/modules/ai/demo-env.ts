/**
 * The AI settings the demo forces (docs/DEMO-SCRIPT.md). They override whatever the environment or `.env` says, so the demo is the
 * same on every machine and cannot be started half-configured: exactly the three design tasks on (the goal box for the fix
 * suggestions, describe-to-design, and the what-if in words), the explain-this-result feature off, and the model they were tested with.
 *
 * This file imports nothing on purpose. The application's configuration module reads the environment once, when it is first
 * imported, so these values must be in place before anything imports it.
 */
export const DEMO_AI_MODEL = "openai/gpt-oss-120b";
/** The three design tasks the demo switches on, in the order they are shown. Nothing else is ever on. */
export const DEMO_AI_TASKS = ["fixes", "describe", "whatif"] as const;
export const DEMO_AI_ENV = {
  AI_ENABLED: "true",
  AI_PROVIDER: "groq",
  AI_FEATURES: DEMO_AI_TASKS.join(","),
  AI_EXPLANATIONS: "false",
  GROQ_MODEL: DEMO_AI_MODEL,
} as const;

/** Sets the demo values, replacing any others. Every other variable, including the key, is left exactly as it was. */
export function applyDemoEnv(env: Record<string, string | undefined> = process.env): void {
  for (const [name, value] of Object.entries(DEMO_AI_ENV)) env[name] = value;
}
