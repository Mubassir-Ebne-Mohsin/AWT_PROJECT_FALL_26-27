import { INestApplication } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { DataSource } from "typeorm";
import request from "supertest";
import { AppModule } from "@/src/app.module";
import { configureApp } from "@/src/app.setup";
import { RedisCacheService } from "@/providers/cache/redis/redis-cache.service";
import { FakeRedisCacheService } from "../test/fake-redis";

const creds = {
  email: "Ada@Example.com",
  password: "correct-horse-1",
  displayName: "Ada",
};

const cookieOf = (res: request.Response) =>
  (res.headers["set-cookie"] as unknown as string[] | undefined)?.find((c) =>
    c.startsWith("sf_refresh="),
  );
const cookieValue = (c: string) => c.split(";")[0];

describe("StressForge API (e2e)", () => {
  let app: INestApplication;
  let redis: FakeRedisCacheService;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    redis = new FakeRedisCacheService();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RedisCacheService)
      .useValue(redis)
      .compile();
    const nest = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(nest);
    await nest.init();
    app = nest;
    await app.get(DataSource).runMigrations();
    http = request(app.getHttpServer());
  });

  beforeEach(async () => {
    await app.get(DataSource).query(`TRUNCATE TABLE "users"`);
  });

  afterAll(async () => {
    await app?.close();
  });

  const register = () => http.post("/v1/auth/register").send(creds);

  describe("health", () => {
    it("GET /v1/health is 200 with both dependencies up", async () => {
      const res = await http.get("/v1/health").expect(200);
      expect(res.body.data).toMatchObject({
        status: "ok",
        postgres: "up",
        redis: "up",
      });
    });

    it("returns 503 UNAVAILABLE with details when redis is down", async () => {
      redis.client.isOpen = false;
      const res = await http.get("/v1/health").expect(503);
      redis.client.isOpen = true;
      expect(res.body.error.code).toBe("UNAVAILABLE");
      expect(res.body.error.details).toMatchObject({
        redis: "down",
        postgres: "up",
      });
    });
  });

  describe("register", () => {
    it("creates a user, lowercases the email, sets an httpOnly refresh cookie", async () => {
      const res = await register().expect(201);
      expect(res.body.data.user.email).toBe("ada@example.com");
      expect(res.body.data.accessToken).toEqual(expect.any(String));
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/);
      const cookie = cookieOf(res)!;
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Lax/i);
      expect(cookie).toMatch(/Path=\/v1\/auth/);
    });

    it("rejects a duplicate email with VALIDATION_FAILED", async () => {
      await register().expect(201);
      const res = await http
        .post("/v1/auth/register")
        .send({ ...creds, email: "ADA@example.com" })
        .expect(422);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
      expect(res.body.error.details.fields[0].path).toBe("email");
    });

    it("rejects a weak password with field details", async () => {
      const res = await http
        .post("/v1/auth/register")
        .send({ ...creds, password: "short" })
        .expect(422);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
      expect(
        res.body.error.details.fields.some((f: any) => f.path === "password"),
      ).toBe(true);
    });
  });

  describe("login / me", () => {
    it("logs in (case-insensitive email) and reads /me with the access token", async () => {
      await register();
      const login = await http
        .post("/v1/auth/login")
        .send({ email: "ADA@example.com", password: creds.password })
        .expect(200);
      const me = await http
        .get("/v1/auth/me")
        .set("Authorization", `Bearer ${login.body.data.accessToken}`)
        .expect(200);
      expect(me.body.data).toMatchObject({
        email: "ada@example.com",
        displayName: "Ada",
        role: "user",
      });
      expect(me.body.data.passwordHash).toBeUndefined();
    });

    it("gives the same error for a wrong password and an unknown email", async () => {
      await register();
      const wrongPw = await http
        .post("/v1/auth/login")
        .send({ email: creds.email, password: "wrong-pass-9" })
        .expect(401);
      const unknown = await http
        .post("/v1/auth/login")
        .send({ email: "nobody@example.com", password: "wrong-pass-9" })
        .expect(401);
      expect(wrongPw.body).toEqual(unknown.body);
      expect(wrongPw.body.error.code).toBe("UNAUTHENTICATED");
    });

    it("protected route without a token is 401 UNAUTHENTICATED", async () => {
      const res = await http.get("/v1/auth/me").expect(401);
      expect(res.body.error.code).toBe("UNAUTHENTICATED");
    });

    it("rejects a garbage token", async () => {
      await http
        .get("/v1/auth/me")
        .set("Authorization", "Bearer nope")
        .expect(401);
    });
  });

  describe("refresh / logout", () => {
    it("rotates the refresh token and rejects reuse of the old one", async () => {
      const reg = await register();
      const first = cookieValue(cookieOf(reg)!);

      const refreshed = await http
        .post("/v1/auth/refresh")
        .set("Cookie", first)
        .expect(200);
      const second = cookieValue(cookieOf(refreshed)!);
      expect(second).not.toBe(first);
      expect(refreshed.body.data.accessToken).toEqual(expect.any(String));

      // Replaying the spent token is a theft signal: it fails and kills the family.
      const replay = await http
        .post("/v1/auth/refresh")
        .set("Cookie", first)
        .expect(401);
      expect(replay.body.error.code).toBe("SESSION_EXPIRED");
      await http.post("/v1/auth/refresh").set("Cookie", second).expect(401);
    });

    it("refresh without a cookie is 401 UNAUTHENTICATED", async () => {
      const res = await http.post("/v1/auth/refresh").expect(401);
      expect(res.body.error.code).toBe("UNAUTHENTICATED");
    });

    it("logout revokes the refresh token and the access token", async () => {
      const reg = await register();
      const cookie = cookieValue(cookieOf(reg)!);
      const access = reg.body.data.accessToken;

      await http
        .post("/v1/auth/logout")
        .set("Cookie", cookie)
        .set("Authorization", `Bearer ${access}`)
        .expect(204);

      await http.post("/v1/auth/refresh").set("Cookie", cookie).expect(401);
      await http
        .get("/v1/auth/me")
        .set("Authorization", `Bearer ${access}`)
        .expect(401);
    });

    it("logout without credentials still succeeds", async () => {
      await http.post("/v1/auth/logout").expect(204);
    });
  });

  describe("cross-cutting", () => {
    it("unknown route is 404 NOT_FOUND in the error envelope", async () => {
      const res = await http.get("/v1/nope").expect(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });

    it("answers the CORS preflight for the frontend origin with credentials", async () => {
      const res = await http
        .options("/v1/auth/login")
        .set("Origin", "http://localhost:3000")
        .set("Access-Control-Request-Method", "POST")
        .set("Access-Control-Request-Headers", "content-type,authorization")
        .expect(204);
      expect(res.headers["access-control-allow-origin"]).toBe(
        "http://localhost:3000",
      );
      expect(res.headers["access-control-allow-credentials"]).toBe("true");
    });

    // Keep last: it exhausts the auth rate limit for this app instance.
    it("rate limits auth routes with RATE_LIMITED", async () => {
      let limited: request.Response | undefined;
      for (let i = 0; i < 80 && !limited; i++) {
        const r = await http
          .post("/v1/auth/login")
          .send({ email: "x@y.com", password: "pw" });
        if (r.status === 429) limited = r;
      }
      expect(limited?.body.error.code).toBe("RATE_LIMITED");
    });
  });
});
