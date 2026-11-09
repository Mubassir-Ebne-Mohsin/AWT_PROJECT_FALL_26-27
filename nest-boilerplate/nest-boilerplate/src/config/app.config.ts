import { z, ZodError } from "zod";
import * as dotenv from "dotenv";
import { fromZodError } from "zod-validation-error";

dotenv.config({ quiet: true });

const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().positive().default(5001),
    // Number of reverse proxies in front of the app (0 = none). Used for client IP detection.
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
    CORS_ORIGINS: z.string().default("http://localhost:3000"),
    FRONTEND_URL: z.string().default("http://localhost:3000"),

    DB_HOST: z.string().default("localhost"),
    DB_PORT: z.coerce.number().int().default(5433),
    DB_USER: z.string().min(1),
    DB_PASSWORD: z.string().min(1),
    DB_DATABASE: z.string().min(1),

    REDIS_HOST: z.string().default("localhost"),
    REDIS_PORT: z.coerce.number().int().default(6379),
    REDIS_PASSWORD: z.preprocess(emptyToUndefined, z.string().optional()),

    JWT_ACCESS_SECRET: z.string().min(32, "must be at least 32 characters"),
    JWT_REFRESH_SECRET: z.string().min(32, "must be at least 32 characters"),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    JWT_REFRESH_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(7 * 86400),

    // Requests per minute for the global throttler and for /auth/login|register|refresh.
    THROTTLE_LIMIT: z.coerce.number().int().positive().default(120),
    AUTH_THROTTLE_LIMIT: z.coerce.number().int().positive().default(10),

    // M10 did not pass its quality/resource gate. Enabling is an explicit local experiment.
    AI_ENABLED: z.enum(["true", "false"]).default("false").transform(v => v === "true"),
    OLLAMA_BASE_URL: z.enum(["http://127.0.0.1:11434", "http://localhost:11434"]).default("http://127.0.0.1:11434"),
    OLLAMA_MODEL: z.enum(["qwen2.5:1.5b", "llama3.2:3b"]).default("qwen2.5:1.5b"),
    // The older "explain this result" feature failed its quality gate (docs/AI-RESUME-SCOPE.md), so AI_ENABLED alone no longer switches
    // it on: it needs this explicit opt-in. The design tasks (AI_FEATURES) are unaffected by it.
    AI_EXPLANATIONS: z.enum(["true", "false"]).default("false").transform(v => v === "true"),
    // Which provider explains results. Hosted inference sends the bounded facts of one run to Groq; the key stays server-side.
    AI_PROVIDER: z.enum(["ollama", "groq"]).default("ollama"),
    // Design tasks that use the hosted model (docs/AI-COPILOT-SCOPE.md). Comma separated, empty by default: each is its own switch.
    AI_FEATURES: z
      .string()
      .max(60)
      .default("")
      .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean))
      .pipe(z.array(z.enum(["describe", "whatif", "fixes"])).max(3)),
    GROQ_API_KEY: z.string().max(200).default(""),
    GROQ_MODEL: z.enum(["openai/gpt-oss-20b", "openai/gpt-oss-120b"]).default("openai/gpt-oss-20b"),
    // The account's published free limits for the chosen model (as shown on its Groq limits page) and how much of them to use.
    GROQ_LIMIT_RPM: z.coerce.number().int().min(1).max(100000).default(30),
    GROQ_LIMIT_RPD: z.coerce.number().int().min(1).max(10000000).default(1000),
    GROQ_LIMIT_TPM: z.coerce.number().int().min(1).max(100000000).default(8000),
    GROQ_LIMIT_TPD: z.coerce.number().int().min(1).max(1000000000).default(200000),
    GROQ_QUOTA_MARGIN: z.coerce.number().min(0.1).max(1).default(0.8),
    AI_USER_DAILY_LIMIT: z.coerce.number().int().min(1).max(100000).default(50),
    AI_DEADLINE_MS: z.coerce.number().int().min(1000).max(65000).default(60000),
    AI_MIN_FREE_MIB: z.coerce.number().int().min(1536).default(1536),
    AI_MIN_COMMIT_MIB: z.coerce.number().int().min(4096).default(4096),
    DEMO_USER_PASSWORD: z.string().min(8).default("Demo-Pass-123!"),

    // Optional email (docs/MAILER-SCOPE.md). Off by default: nothing is registered and nothing is sent.
    MAIL_ENABLED: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
    SMTP_HOST: z.string().max(200).default(""),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(2525),
    SMTP_USER: z.string().max(200).default(""),
    SMTP_PASS: z.string().max(200).default(""),
    MAIL_FROM: z.string().max(200).default("StressForge <no-reply@stressforge.local>"),
    MAIL_HOURLY_LIMIT: z.coerce.number().int().min(1).max(1000).default(10),
  })
  .superRefine((envs, ctx) => {
    if (envs.MAIL_ENABLED && !envs.SMTP_HOST) {
      ctx.addIssue({ code: "custom", path: ["SMTP_HOST"], message: "is required when MAIL_ENABLED=true" });
    }
    if (envs.NODE_ENV !== "production") return;
    const placeholders = new Set([
      "change-me-access-secret-at-least-32-chars",
      "change-me-refresh-secret-at-least-32-chars",
    ]);
    for (const key of ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"] as const) {
      if (placeholders.has(envs[key])) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "must replace the example secret in production",
        });
      }
    }
    if (envs.JWT_ACCESS_SECRET === envs.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: "custom",
        path: ["JWT_REFRESH_SECRET"],
        message: "must differ from JWT_ACCESS_SECRET in production",
      });
    }
  })
  .transform((envs) => ({
    ...envs,
    IS_PRODUCTION: envs.NODE_ENV === "production",
    CORS_ORIGIN_LIST: envs.CORS_ORIGINS.split(",")
      .map((o) => o.trim())
      .filter(Boolean),
    REDIS_URL: envs.REDIS_PASSWORD
      ? `redis://:${encodeURIComponent(envs.REDIS_PASSWORD)}@${envs.REDIS_HOST}:${envs.REDIS_PORT}`
      : `redis://${envs.REDIS_HOST}:${envs.REDIS_PORT}`,
  }));

// Fail fast with a readable message instead of a stack trace deep inside Nest.
const parseEnv = () => {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new Error(
        `Invalid environment (check .env against .env.example): ${fromZodError(error).message}`,
      );
    }
    throw error;
  }
};

export const appConfig = {
  env: parseEnv(),
};
