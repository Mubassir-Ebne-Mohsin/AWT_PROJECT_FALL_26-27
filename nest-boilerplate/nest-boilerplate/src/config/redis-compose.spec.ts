import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { createClient } from "redis";
import Redis from "ioredis";
import { envSchema } from "@/config/app.config";

// Opt-in integration check: creates and removes only its unique Compose project.
const integration =
  process.env.TEST_REDIS_COMPOSE === "1" ? describe : describe.skip;
integration("development Compose Redis authentication", () => {
  const project = `stressforge-config-${process.pid}-${Date.now()}`;
  const cwd = resolve(__dirname, "../..");
  let environment: NodeJS.ProcessEnv;
  const compose = (...args: string[]) => {
    const result = spawnSync(
      "docker",
      [
        "compose",
        "--env-file",
        ".env.example",
        "-p",
        project,
        "-f",
        "docker-compose.dev.yml",
        ...args,
      ],
      {
        cwd,
        env: environment,
        encoding: "utf8",
        timeout: 45000,
      },
    );
    // Keep captured command output private: it may contain configuration values.
    if (result.status !== 0)
      throw new Error("Disposable Redis Compose command failed");
    return result.stdout;
  };
  afterAll(() => {
    compose("down", "--volumes", "--remove-orphans", "--timeout", "5");
  }, 50000);
  it.each([false, true])(
    "supports password enabled=%s with a healthy server and API clients",
    async (enabled) => {
      const password = enabled
        ? `${randomBytes(24).toString("hex")} @:/?#$'quote`
        : "";
      environment = {
        ...process.env,
        REDIS_PORT: "0",
        REDIS_PASSWORD: password,
      };
      compose(
        "up",
        "-d",
        "--wait",
        "--wait-timeout",
        "30",
        "--force-recreate",
        "redis",
      );
      const port = Number(
        compose("port", "redis", "6379").trim().split(":").pop(),
      );
      const env = envSchema.parse({
        NODE_ENV: "test",
        DB_USER: "test",
        DB_PASSWORD: "test",
        DB_DATABASE: "test",
        JWT_ACCESS_SECRET: randomBytes(48).toString("hex"),
        JWT_REFRESH_SECRET: randomBytes(48).toString("hex"),
        REDIS_HOST: "127.0.0.1",
        REDIS_PORT: port,
        REDIS_PASSWORD: password,
      });
      const client = createClient({
        url: env.REDIS_URL,
        socket: { connectTimeout: 3000, reconnectStrategy: false },
      });
      client.on("error", () => undefined);
      const limiter = new Redis(env.REDIS_URL, {
        lazyConnect: true,
        connectTimeout: 3000,
        retryStrategy: () => null,
      });
      limiter.on("error", () => undefined);
      try {
        await client.connect();
        await limiter.connect();
        expect(await client.ping()).toBe("PONG");
        expect(await limiter.ping()).toBe("PONG");
        const unauthenticated = compose(
          "exec",
          "-T",
          "redis",
          "redis-cli",
          "ping",
        );
        expect(unauthenticated.includes(enabled ? "NOAUTH" : "PONG")).toBe(
          true,
        );
        const service = JSON.parse(
          compose("ps", "--format", "json", "redis"),
        ) as { Health: string };
        expect(service.Health).toBe("healthy");
      } finally {
        if (client.isOpen) client.destroy();
        limiter.disconnect();
      }
    },
    55000,
  );
});
