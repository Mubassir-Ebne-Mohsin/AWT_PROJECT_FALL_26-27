import { envSchema } from "@/config/app.config";
const base = {
  NODE_ENV: "test",
  DB_USER: "unit",
  DB_PASSWORD: "unit",
  DB_DATABASE: "unit",
  JWT_ACCESS_SECRET: "test-access-secret-at-least-32-characters",
  JWT_REFRESH_SECRET: "test-refresh-secret-at-least-32-characters",
};
const enabled = {
  ...base,
  GOOGLE_AUTH_ENABLED: "true",
  GOOGLE_CLIENT_ID: "unit-client",
  GOOGLE_CLIENT_SECRET: "unit-secret",
  GOOGLE_REDIRECT_URI: "http://localhost:5001/v1/auth/google/callback",
};
describe("Social provider configuration", () => {
  it("is disabled by default and requires complete enabled credentials", () => {
    expect(envSchema.parse(base).GOOGLE_AUTH_ENABLED).toBe(false);
    expect(envSchema.parse(base).GITHUB_AUTH_ENABLED).toBe(false);
    expect(
      envSchema.safeParse({ ...base, GOOGLE_AUTH_ENABLED: "true" }).success,
    ).toBe(false);
    expect(envSchema.safeParse(enabled).success).toBe(true);
  });
  it("restricts callback paths and the frontend to trusted origins", () => {
    for (const GOOGLE_REDIRECT_URI of [
      "https://example.test/evil",
      "https://example.test/v1/auth/google/callback?next=evil",
      "http://example.test/v1/auth/google/callback",
    ]) {
      expect(
        envSchema.safeParse({ ...enabled, GOOGLE_REDIRECT_URI }).success,
      ).toBe(false);
    }
    for (const FRONTEND_URL of [
      "https://user:pass@example.test",
      "https://example.test/extra",
      "https://example.test?next=evil",
      "http://example.test",
    ]) {
      expect(envSchema.safeParse({ ...enabled, FRONTEND_URL }).success).toBe(
        false,
      );
    }
  });
  it("requires HTTPS for production providers and frontend", () => {
    expect(
      envSchema.safeParse({ ...enabled, NODE_ENV: "production" }).success,
    ).toBe(false);
    expect(
      envSchema.safeParse({
        ...enabled,
        NODE_ENV: "production",
        FRONTEND_URL: "https://app.example.test",
        GOOGLE_REDIRECT_URI: "https://api.example.test/v1/auth/google/callback",
      }).success,
    ).toBe(true);
  });
});
