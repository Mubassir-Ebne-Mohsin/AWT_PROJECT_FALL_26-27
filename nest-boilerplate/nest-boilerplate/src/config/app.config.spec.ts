import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { envSchema } from "@/config/app.config";

const base = {
  NODE_ENV: "test",
  DB_USER: "test",
  DB_PASSWORD: "test",
  DB_DATABASE: "test",
  JWT_ACCESS_SECRET: randomBytes(48).toString("hex"),
  JWT_REFRESH_SECRET: randomBytes(48).toString("hex"),
};
const example = Object.fromEntries(
  readFileSync(resolve(__dirname, "../../.env.example"), "utf8")
    .split(/\r?\n/)
    .filter((line) => /^JWT_(ACCESS|REFRESH)_SECRET=/.test(line))
    .map((line) => line.split("=")),
);

describe("environment configuration", () => {
  it("keeps defaults and supports empty Redis passwords", () => {
    const env = envSchema.parse({ ...base, REDIS_PASSWORD: "" });
    expect(env.PORT).toBe(5001);
    expect(env.DB_PORT).toBe(5433);
    expect(env.REDIS_PASSWORD).toBeUndefined();
    expect(env.REDIS_URL).toBe("redis://localhost:6379");
  });
  it("encodes Redis credentials without changing their value", () => {
    const password = "test-only p@ss:/?#$'quote";
    const env = envSchema.parse({
      ...base,
      REDIS_HOST: "127.0.0.1",
      REDIS_PORT: 6391,
      REDIS_PASSWORD: password,
    });
    const url = new URL(env.REDIS_URL);
    expect(decodeURIComponent(url.password) === password).toBe(true);
    expect(url.hostname).toBe("127.0.0.1");
    expect(url.port).toBe("6391");
  });
  it.each(["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"] as const)(
    "rejects the published %s in production",
    (key) => {
      const result = envSchema.safeParse({
        ...base,
        NODE_ENV: "production",
        [key]: example[key],
      });
      expect(result.success).toBe(false);
      if (!result.success)
        expect(result.error.issues.some((issue) => issue.path[0] === key)).toBe(
          true,
        );
    },
  );
  it("rejects either published placeholder even when swapped", () => {
    expect(
      envSchema.safeParse({
        ...base,
        JWT_ACCESS_SECRET: example.JWT_REFRESH_SECRET,
        JWT_REFRESH_SECRET: example.JWT_ACCESS_SECRET,
        NODE_ENV: "production",
      }).success,
    ).toBe(false);
  });
  it("rejects equal signing secrets in production", () => {
    expect(
      envSchema.safeParse({
        ...base,
        NODE_ENV: "production",
        JWT_REFRESH_SECRET: base.JWT_ACCESS_SECRET,
      }).success,
    ).toBe(false);
  });
  it("accepts distinct generated secrets in production", () => {
    expect(
      envSchema.safeParse({ ...base, NODE_ENV: "production" }).success,
    ).toBe(true);
  });
  it("keeps example secrets available for local development", () => {
    expect(
      envSchema.safeParse({ ...base, ...example, NODE_ENV: "development" })
        .success,
    ).toBe(true);
  });
  it("rejects short signing secrets in all environments", () => {
    for (const NODE_ENV of ["development", "test", "production"]) {
      expect(
        envSchema.safeParse({ ...base, NODE_ENV, JWT_ACCESS_SECRET: "short" })
          .success,
      ).toBe(false);
    }
  });
  it("fails production module startup without printing secret values", () => {
    const child = spawnSync(
      process.execPath,
      ["-r", "ts-node/register", "-e", "require('./src/config/app.config')"],
      {
        cwd: resolve(__dirname, "../.."),
        env: {
          ...process.env,
          ...base,
          ...example,
          NODE_ENV: "production",
          DOTENV_CONFIG_QUIET: "true",
        },
        encoding: "utf8",
        timeout: 15000,
      },
    );
    expect(child.status).not.toBe(0);
    expect(child.stderr).toContain("Invalid environment");
    expect(child.stderr).toContain("JWT_ACCESS_SECRET");
    for (const value of Object.values(example))
      expect(child.stderr.includes(String(value))).toBe(false);
  });
});
