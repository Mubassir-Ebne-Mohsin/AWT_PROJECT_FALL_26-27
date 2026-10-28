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
