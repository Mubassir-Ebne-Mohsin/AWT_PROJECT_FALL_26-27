import { envSchema } from "@/config/app.config";
const base = {
  DB_USER: "test",
  DB_PASSWORD: "test",
  DB_DATABASE: "test",
  JWT_ACCESS_SECRET: "test-access-012345678901234567890123",
  JWT_REFRESH_SECRET: "test-refresh-012345678901234567890123",
};
describe("M11 experimental configuration", () => {
  it("defaults disabled and parses false literally", () => {
    expect(envSchema.parse(base).AI_ENABLED).toBe(false);
    expect(envSchema.parse({ ...base, AI_ENABLED: "false" }).AI_ENABLED).toBe(
      false,
    );
    expect(envSchema.parse({ ...base, AI_ENABLED: "true" }).AI_ENABLED).toBe(
      true,
    );
  });
  it.each([
    "https://evil.invalid",
    "http://localhost:11434@evil.invalid",
    "http://127.0.0.1:80",
    "http://localhost:11434/redirect",
    "http://localhost:11434?x=1",
  ])("rejects remote/ambiguous origin %s", (url) => {
    expect(envSchema.safeParse({ ...base, OLLAMA_BASE_URL: url }).success).toBe(
      false,
    );
  });
  it("chooses the provider by configuration: local Ollama by default, hosted Groq only when asked", () => {
    const defaults = envSchema.parse(base);
    expect(defaults.AI_PROVIDER).toBe("ollama");
    expect(defaults.GROQ_MODEL).toBe("openai/gpt-oss-20b");
    expect(defaults.GROQ_API_KEY).toBe("");
    expect(envSchema.parse({ ...base, AI_PROVIDER: "groq", GROQ_MODEL: "openai/gpt-oss-120b" })).toMatchObject({ AI_PROVIDER: "groq", GROQ_MODEL: "openai/gpt-oss-120b" });
  });
  it("rejects an unknown provider, an unapproved hosted model, and an oversized key", () => {
    for (const change of [{ AI_PROVIDER: "openai" }, { AI_PROVIDER: "" }, { GROQ_MODEL: "unapproved/model" }, { GROQ_API_KEY: "k".repeat(201) }])
      expect(envSchema.safeParse({ ...base, ...change }).success).toBe(false);
  });
  it("rejects unsafe memory floors, model names and unbounded deadline", () => {
    for (const change of [
      { AI_MIN_FREE_MIB: 512 },
      { AI_MIN_COMMIT_MIB: 1 },
      { OLLAMA_MODEL: "unapproved:70b" },
      { AI_DEADLINE_MS: 999999 },
    ])
      expect(envSchema.safeParse({ ...base, ...change }).success).toBe(false);
  });
});

describe("hosted provider settings", () => {
  const load = (env: Record<string, string>) => {
    const saved = { ...process.env };
    Object.assign(process.env, base, env);
    try {
      let result: { settings: ReturnType<typeof import("@/modules/ai/ai.settings").aiSettings>; credentials: { apiKey: string } } | undefined;
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mod = require("@/modules/ai/ai.settings") as typeof import("@/modules/ai/ai.settings");
        result = { settings: mod.aiSettings(), credentials: mod.groqCredentials() };
      });
      return result!;
    } finally {
      for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
      Object.assign(process.env, saved);
    }
  };
  it("takes the model from the selected provider", () => {
    expect(load({ AI_PROVIDER: "ollama", OLLAMA_MODEL: "llama3.2:3b", GROQ_MODEL: "openai/gpt-oss-120b" }).settings).toMatchObject({ provider: "ollama", model: "llama3.2:3b" });
    expect(load({ AI_PROVIDER: "groq", OLLAMA_MODEL: "llama3.2:3b", GROQ_MODEL: "openai/gpt-oss-120b" }).settings).toMatchObject({ provider: "groq", model: "openai/gpt-oss-120b" });
  });
  it("keeps the key out of the settings object that readiness and logs can reach", () => {
    const { settings, credentials } = load({ AI_PROVIDER: "groq", GROQ_API_KEY: "synthetic-key-for-this-test" });
    expect(credentials.apiKey).toBe("synthetic-key-for-this-test");
    expect(JSON.stringify(settings)).not.toContain("synthetic-key-for-this-test");
    expect(Object.keys(settings)).not.toEqual(expect.arrayContaining(["apiKey", "groqApiKey", "key"]));
  });
});
