import { randomBytes } from "node:crypto";
import { envSchema } from "@/config/app.config";
import { hostingIssues, assertHostedConfiguration } from "@/config/hosting.config";
import { databaseTls } from "@/config/database-tls";
const base = { NODE_ENV: "production", HOSTED_MODE: "true", HOSTED_PUBLIC_HOST: "stressforge.test", HOSTED_PRIVATE_NETWORK: "true",
  FRONTEND_URL: "https://stressforge.test", CORS_ORIGINS: "https://stressforge.test", TRUST_PROXY_HOPS: 1,
  DB_HOST: "postgres", DB_USER: "sf_app", DB_PASSWORD: randomBytes(24).toString("hex"), DB_DATABASE: "stressforge",
  REDIS_HOST: "redis", REDIS_PASSWORD: randomBytes(24).toString("hex"), JWT_ACCESS_SECRET: randomBytes(48).toString("hex"), JWT_REFRESH_SECRET: randomBytes(48).toString("hex") };
describe("H2 hosting configuration", () => {
  it("accepts the declared single-proxy/private-data topology", () => expect(hostingIssues(envSchema.parse(base))).toEqual([]));
  it.each(["https://*.stressforge.test", "http://stressforge.test", "https://user:password@stressforge.test", "https://stressforge.test/path", "https://stressforge.test?x=1", "*"])("rejects a non-origin frontend %s", FRONTEND_URL => {
    expect(hostingIssues(envSchema.parse({ ...base, FRONTEND_URL })).some(s => s.startsWith("FRONTEND_URL"))).toBe(true);
  });
  it("rejects wildcard/mismatched origins, proxy hops and unencrypted external dependencies without echoing values", () => {
    const issues = hostingIssues(envSchema.parse({ ...base, CORS_ORIGINS: "*", TRUST_PROXY_HOPS: 2, DB_HOST: "outside.invalid", REDIS_HOST: "outside.invalid" }));
    expect(issues).toHaveLength(4); expect(issues.join()).not.toContain("outside.invalid");
  });
  it("supports verified TLS and rediss credentials", () => {
    const env = envSchema.parse({ ...base, DB_HOST: "managed.invalid", DB_TLS: "true", REDIS_HOST: "managed.invalid", REDIS_TLS: "true" });
    expect(hostingIssues(env)).toEqual([]); expect(env.REDIS_URL).toMatch(/^rediss:/);
    expect(databaseTls(true)).toEqual({ rejectUnauthorized: true });
    expect(() => databaseTls(true, "missing-h2-certificate.pem")).toThrow("Cannot load DB_TLS_CA_FILE");
    expect(databaseTls(false)).toBe(false);
  });
  it("refuses a CA with TLS disabled and preserves ordinary local startup", () => {
    expect(envSchema.safeParse({ ...base, DB_TLS_CA_FILE: "ca.pem" }).success).toBe(false);
    expect(() => assertHostedConfiguration(envSchema.parse({ ...base, HOSTED_MODE: "false", FRONTEND_URL: "http://localhost:3000" }))).not.toThrow();
    expect(() => assertHostedConfiguration(envSchema.parse({ ...base, TRUST_PROXY_HOPS: 0 }))).toThrow("TRUST_PROXY_HOPS");
  });
});
