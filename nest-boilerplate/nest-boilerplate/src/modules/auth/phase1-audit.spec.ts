/**
 * Phase 1 QA audit tests (added by the audit; see docs/STRESSFORGE-PROGRESS-REPORT.md).
 *
 * Audit regressions are ordinary tests: a green suite now requires the fixes.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ExecutionContext,
  Logger,
  BadRequestException,
  HttpException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { ThrottlerException } from "@nestjs/throttler";
import { lastValueFrom, of } from "rxjs";
import { appConfig, envSchema } from "@/config";
import {
  SnakeNamingStrategy,
  dataSourceOptions,
} from "@/config/database.config";
import { Role } from "@/common/enums/role.enum";
import { AppException } from "@/common/errors";
import { AllExceptionsFilter } from "@/common/filters/all-exceptions.filter";
import { AuthGuard } from "@/common/guard/auth.guard";
import { RolesGuard } from "@/common/guard/roles.guard";
import {
  ResponseEnvelopeInterceptor,
  WithMeta,
} from "@/common/interceptors/response-envelope.interceptor";
import { RequestLoggerMiddleware } from "@/common/middlewares/request-logger.middleware";
import { AuthService } from "@/modules/auth/auth.service";
import { TokenStore } from "@/modules/auth/token-store.service";
import { User } from "@/modules/users/entities/user.entity";
import { UsersService } from "@/modules/users/users.service";
import { FakeRedisCacheService } from "../../../test/fake-redis";

const { env } = appConfig;

const ctxFor = (req: unknown) =>
  ({
    getHandler: () => null,
    getClass: () => null,
    switchToHttp: () => ({ getRequest: () => req }),
  }) as unknown as ExecutionContext;

const reflectorReturning = (value: unknown) =>
  ({ getAllAndOverride: () => value }) as unknown as Reflector;

describe("RolesGuard (requirement: Role USER/ADMIN with hierarchy)", () => {
  const run = (required: Role[] | undefined, user?: { role: Role }) =>
    new RolesGuard(reflectorReturning(required)).canActivate(ctxFor({ user }));

  it("allows a route that declares no roles", () => {
    expect(run(undefined, { role: Role.USER })).toBe(true);
  });
  it("ADMIN satisfies a USER route (hierarchy)", () => {
    expect(run([Role.USER], { role: Role.ADMIN })).toBe(true);
  });
  it("USER is refused on an ADMIN route with FORBIDDEN", () => {
    expect(() => run([Role.ADMIN], { role: Role.USER })).toThrow(
      expect.objectContaining({ code: "FORBIDDEN" }),
    );
  });
  it("a guarded route without a user is UNAUTHENTICATED", () => {
    expect(() => run([Role.USER], undefined)).toThrow(
      expect.objectContaining({ code: "UNAUTHENTICATED" }),
    );
  });
  it("an unknown role string gets rank 0 and is refused", () => {
    expect(() => run([Role.USER], { role: "superuser" as Role })).toThrow(
      expect.objectContaining({ code: "FORBIDDEN" }),
    );
  });
});

describe("AuthGuard (requirement: real JWT verification, @Public)", () => {
  const jwt = new JwtService({ secret: env.JWT_ACCESS_SECRET });
  const store = new TokenStore(new FakeRedisCacheService() as never);
  const guard = (isPublic = false) =>
    new AuthGuard(reflectorReturning(isPublic), jwt, store);
  const access = (
    over: Record<string, unknown> = {},
    opts: Record<string, unknown> = { expiresIn: 60 },
  ) =>
    jwt.signAsync(
      {
        typ: "access",
        sub: "u1",
        email: "a@b.co",
        role: Role.USER,
        jti: `j-${Math.random()}`,
        ...over,
      },
      opts,
    );
  const call = (g: AuthGuard, header?: string) =>
    g.canActivate(ctxFor({ headers: { authorization: header } }));

  it("lets a @Public route through without a token", async () => {
    await expect(call(guard(true))).resolves.toBe(true);
  });
  it("rejects a missing token", async () => {
    await expect(call(guard())).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });
  it("rejects a non-Bearer scheme", async () => {
    await expect(
      call(guard(), `Basic ${await access()}`),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
  it("accepts a valid token and attaches the user", async () => {
    const req: { headers: { authorization: string }; user?: unknown } = {
      headers: { authorization: `Bearer ${await access()}` },
    };
    await expect(guard().canActivate(ctxFor(req))).resolves.toBe(true);
    expect(req.user).toMatchObject({
      id: "u1",
      email: "a@b.co",
      role: Role.USER,
    });
  });
  it("an expired token is SESSION_EXPIRED", async () => {
    await expect(
      call(guard(), `Bearer ${await access({}, { expiresIn: -10 })}`),
    ).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
  });
  it("a token signed with a different secret is UNAUTHENTICATED", async () => {
    const forged = await new JwtService({ secret: "x".repeat(40) }).signAsync(
      { typ: "access", sub: "u1", jti: "j", role: Role.ADMIN },
      { expiresIn: 60 },
    );
    await expect(call(guard(), `Bearer ${forged}`)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });
  it("a token with typ=refresh is refused as an access token", async () => {
    await expect(
      call(guard(), `Bearer ${await access({ typ: "refresh" })}`),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
  it("a revoked access jti is refused", async () => {
    await store.revokeAccess("revoked-jti", 60);
    await expect(
      call(guard(), `Bearer ${await access({ jti: "revoked-jti" })}`),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});

describe("AllExceptionsFilter (requirement: stable error codes and statuses)", () => {
  const capture = (exception: unknown) => {
    let status = 0;
    let body: any;
    const res = {
      status: (s: number) => (
        (status = s),
        { json: (b: unknown) => (body = b) }
      ),
    };
    new AllExceptionsFilter().catch(exception, {
      switchToHttp: () => ({ getResponse: () => res }),
    } as never);
    return { status, body };
  };

  it.each([
    ["VALIDATION_FAILED", 422],
    ["UNAUTHENTICATED", 401],
    ["SESSION_EXPIRED", 401],
    ["FORBIDDEN", 403],
    ["NOT_FOUND", 404],
    ["RATE_LIMITED", 429],
    ["INTERNAL", 500],
    ["UNAVAILABLE", 503],
  ] as const)("AppException %s maps to HTTP %i", (code, status) => {
    const out = capture(new AppException(code, "m", { a: 1 }));
    expect(out.status).toBe(status);
    expect(out.body).toEqual({
      error: { code, message: "m", details: { a: 1 } },
    });
  });
  it("ThrottlerException -> 429 RATE_LIMITED", () => {
    expect(capture(new ThrottlerException()).body.error.code).toBe(
      "RATE_LIMITED",
    );
  });
  it("an unknown Error never leaks its message (500 INTERNAL)", () => {
    const log = jest
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);
    try {
      const out = capture(new Error("secret db password in message"));
      expect(out.status).toBe(500);
      expect(JSON.stringify(out.body)).not.toContain("secret");
      expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
    } finally {
      log.mockRestore();
    }
  });
  it("redis/ioredis outage errors map to 503 UNAVAILABLE", () => {
    for (const name of [
      "ClientOfflineError",
      "ClientClosedError",
      "MaxRetriesPerRequestError",
    ]) {
      const e = new Error("x");
      e.name = name;
      expect(capture(e).status).toBe(503);
    }
  });
  it("a plain 400 BadRequestException normalizes status 400 to 422 VALIDATION_FAILED", () => {
    const out = capture(new BadRequestException("bad"));
    expect([out.status, out.body.error.code]).toEqual([
      422,
      "VALIDATION_FAILED",
    ]);
  });
  // QA-005: body-parser's PayloadTooLargeError is a plain Error with status 413, not an HttpException.
  it("QA-005 a 413 from body-parser is a client error, not 500 INTERNAL", () => {
    const e = Object.assign(new Error("request entity too large"), {
      status: 413,
      type: "entity.too.large",
    });
    expect(capture(e).status).toBe(422);
  });
  // QA-006: malformed JSON arrives as a 400 HttpException; the spec fixes VALIDATION_FAILED at 422.
  it("QA-006 VALIDATION_FAILED is always HTTP 422", () => {
    expect(capture(new HttpException("Unexpected token", 400)).status).toBe(
      422,
    );
  });
});

describe("ResponseEnvelopeInterceptor (requirement: success is { data, meta? })", () => {
  const wrap = (v: unknown) =>
    lastValueFrom(
      new ResponseEnvelopeInterceptor().intercept(ctxFor({}), {
        handle: () => of(v),
      } as never),
    );
  it("wraps a value", async () =>
    expect(await wrap({ a: 1 })).toEqual({ data: { a: 1 } }));
  it("turns undefined into data:null", async () =>
    expect(await wrap(undefined)).toEqual({ data: null }));
  it("carries meta from WithMeta", async () =>
    expect(await wrap(new WithMeta([1], { total: 1 }))).toEqual({
      data: [1],
      meta: { total: 1 },
    }));
});

describe("RequestLoggerMiddleware (requirement: logging must not leak secrets)", () => {
  it("logs method, path, status only: no query string, headers, cookies or body", () => {
    const log = jest
      .spyOn(Logger.prototype, "log")
      .mockImplementation(() => undefined);
    let finish: () => void = () => undefined;
    const req = {
      method: "POST",
      originalUrl: "/v1/auth/login?token=SECRET_QUERY",
      headers: {
        authorization: "Bearer SECRET_HEADER",
        cookie: "sf_refresh=SECRET_COOKIE",
      },
      body: { password: "SECRET_BODY" },
    };
    const res = {
      statusCode: 401,
      on: (_e: string, fn: () => void) => (finish = fn),
    };
    new RequestLoggerMiddleware().use(
      req as never,
      res as never,
      () => undefined,
    );
    finish();
    const logged = log.mock.calls.map((c) => String(c[0])).join("\n");
    log.mockRestore();
    expect(logged).toMatch(/POST \/v1\/auth\/login 401/);
    expect(logged).not.toMatch(/SECRET/);
  });
});

describe("Environment validation (requirement: validate env at boot, fail fast, readable)", () => {
  const base = {
    DB_USER: "u",
    DB_PASSWORD: "p",
    DB_DATABASE: "d",
    JWT_ACCESS_SECRET: "a".repeat(32),
    JWT_REFRESH_SECRET: "b".repeat(32),
  };

  it("applies defaults: PORT 5001, CORS localhost:3000, 15 min access TTL", () => {
    const r = envSchema.parse(base);
    expect([r.PORT, r.CORS_ORIGIN_LIST, r.JWT_ACCESS_TTL_SECONDS]).toEqual([
      5001,
      ["http://localhost:3000"],
      900,
    ]);
  });
  it("rejects a missing database user with the field name in the error", () => {
    const { DB_USER: _u, ...rest } = base;
    const r = envSchema.safeParse(rest);
    expect(r.success).toBe(false);
    expect(JSON.stringify((r as any).error.issues)).toContain("DB_USER");
  });
  it("rejects a JWT secret shorter than 32 characters", () => {
    expect(
      envSchema.safeParse({ ...base, JWT_ACCESS_SECRET: "short" }).success,
    ).toBe(false);
  });
  it("rejects an unknown NODE_ENV", () => {
    expect(envSchema.safeParse({ ...base, NODE_ENV: "staging" }).success).toBe(
      false,
    );
  });
  it("keeps a numeric-looking DB password as a string", () => {
    expect(
      envSchema.parse({ ...base, DB_PASSWORD: "123456" }).DB_PASSWORD,
    ).toBe("123456");
  });
  it("builds REDIS_URL with an encoded password", () => {
    expect(
      envSchema.parse({ ...base, REDIS_PASSWORD: "p@ss/w" }).REDIS_URL,
    ).toBe("redis://:p%40ss%2Fw@localhost:6379");
  });
  // QA-007: .env.example ships placeholder secrets that satisfy the 32-character rule.
  it("QA-007 refuses the placeholder JWT secrets from .env.example when NODE_ENV=production", () => {
    const example = readFileSync(
      join(__dirname, "../../../.env.example"),
      "utf8",
    );
    const pick = (k: string) =>
      new RegExp(`^${k}=([^\\s#]+)`, "m").exec(example)?.[1] ?? "";
    const r = envSchema.safeParse({
      ...base,
      NODE_ENV: "production",
      JWT_ACCESS_SECRET: pick("JWT_ACCESS_SECRET"),
      JWT_REFRESH_SECRET: pick("JWT_REFRESH_SECRET"),
    });
    expect(r.success).toBe(false);
  });
});

describe("TypeORM config (requirements: SnakeNamingStrategy fix, migrations glob for ts and dist)", () => {
  const n = new SnakeNamingStrategy();
  it("tableName pluralises a class name", () =>
    expect(n.tableName("User", undefined as never)).toBe("users"));
  it("tableName applies the status -> statuses rule (was dead code)", () =>
    expect(n.tableName("UserStatus", undefined as never)).toBe(
      "user_statuses",
    ));
  it("a custom table name wins", () =>
    expect(n.tableName("X", "custom")).toBe("custom"));
  it("globs use a single extension so .d.ts files are never matched", () => {
    const ext = __filename.endsWith(".ts") ? "ts" : "js";
    expect(String((dataSourceOptions.migrations as string[])[0])).toMatch(
      new RegExp(`migrations/\\*\\.${ext}$`),
    );
    expect(String((dataSourceOptions.entities as string[])[0])).toMatch(
      new RegExp(`\\*\\.entity\\.${ext}$`),
    );
  });
});

describe("Auth service defects found by the audit", () => {
  // Reuses the unit-test doubles of auth.service.spec.ts.
  const build = () => {
    const users = new Map<string, User>();
    const stub = {
      findByEmail: async (e: string) =>
        [...users.values()].find((u) => u.email === e.toLowerCase()) ?? null,
      findById: async (id: string) => users.get(id) ?? null,
      create: async (i: Partial<User>) => {
        const u = {
          id: `id-${users.size + 1}`,
          role: Role.USER,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...i,
          email: i.email!.toLowerCase(),
        } as User;
        users.set(u.id, u);
        return u;
      },
    } as unknown as UsersService;
    const jwt = new JwtService({ secret: env.JWT_ACCESS_SECRET });
    const store = new TokenStore(new FakeRedisCacheService() as never);
    return { service: new AuthService(stub, jwt, store), store };
  };

  // QA-001: revokeFamily() uses the REPLAYED token's remaining life as TTL, which is shorter
  // than the life of the newest rotated token, so the revocation marker can expire first.
  it("QA-001 a revoked token family stays revoked until its newest token expires", async () => {
    const realNow = Date.now;
    const ttl = env.JWT_REFRESH_TTL_SECONDS;
    let now = Math.floor(realNow() / 1000) * 1000;
    jest.spyOn(Date, "now").mockImplementation(() => now);
    env.JWT_REFRESH_TTL_SECONDS = 10;
    try {
      const { service } = build();
      const first = await service.register({
        email: "qa1@example.test",
        password: "qa-password-1",
        displayName: "q",
      });
      now += 9_000;
      const second = await service.refresh(first.refreshToken); // newest token: valid until t+19s
      expect(new JwtService().decode(second.refreshToken).exp).toBe(
        new JwtService().decode(first.refreshToken).exp,
      );
      now += 500;
      await expect(service.refresh(first.refreshToken)).rejects.toBeDefined(); // replay -> family marked revoked
      // Prove revocation while the descendant JWT is still cryptographically valid.
      await expect(
        new JwtService().verifyAsync(second.refreshToken, {
          secret: env.JWT_REFRESH_SECRET,
        }),
      ).resolves.toBeDefined();
      await expect(service.refresh(second.refreshToken)).rejects.toMatchObject({
        code: "SESSION_EXPIRED",
      });
      now += 2_000; // t+11.5s: the marker (ttl = replayed token's remaining ~0.5s) is gone
      await expect(service.refresh(second.refreshToken)).rejects.toBeDefined(); // must still be revoked
    } finally {
      env.JWT_REFRESH_TTL_SECONDS = ttl;
      jest.restoreAllMocks();
    }
  });

  // QA-002: AuthService.logout swallows every error, including a failed Redis write, and still resolves.
  it("QA-002 logout does not report success when the revocation could not be stored", async () => {
    const { service, store } = build();
    const s = await service.register({
      email: "qa2@example.test",
      password: "qa-password-1",
      displayName: "q",
    });
    jest
      .spyOn(store, "revokeFamily")
      .mockRejectedValue(new Error("redis down"));
    jest
      .spyOn(store, "revokeAccess")
      .mockRejectedValue(new Error("redis down"));
    await expect(
      service.logout(s.refreshToken, s.accessToken),
    ).rejects.toBeDefined();
  });
});
