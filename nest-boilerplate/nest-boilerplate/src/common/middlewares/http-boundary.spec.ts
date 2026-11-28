import { All, Controller, Get, Module, Req } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import type { Request } from "express";
import request from "supertest";
import { configureApp } from "@/src/app.setup";
import { appConfig } from "@/config";
import { AllExceptionsFilter } from "@/common/filters/all-exceptions.filter";

let writes = 0;
@Controller()
class BoundaryFixture {
  @All("auth/:action") action(@Req() req: Request) {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) writes++;
    return { ok: true };
  }
  @Get("private") privateData() { return { ok: true }; }
}
@Module({ controllers: [BoundaryFixture] })
class BoundaryModule {}

describe("HTTP browser boundary (real Nest/Express, no dependencies)", () => {
  let app: NestExpressApplication;
  const trusted = appConfig.env.CORS_ORIGIN_LIST[0];
  beforeAll(async () => {
    app = await NestFactory.create<NestExpressApplication>(BoundaryModule, { logger: false });
    configureApp(app);
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });
  afterAll(async () => { await app.close(); });
  beforeEach(() => { writes = 0; });

  it.each(["login", "register", "refresh", "logout", "password", "oauth/complete"])(
    "blocks a foreign browser before %s can change state", async (action) => {
      const response = await request(app.getHttpServer()).post(`/v1/auth/${action}`)
        .set("Origin", "https://attacker.example").send({});
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
      expect(response.headers["set-cookie"]).toBeUndefined();
      expect(writes).toBe(0);
    },
  );
  it.each(["null", "https://attacker.example", trusted + ".attacker.example"])(
    "rejects simple form requests from %s", async (origin) => {
      await request(app.getHttpServer()).post("/v1/auth/login").set("Origin", origin)
        .type("form").send({ email: "fake@example.test" }).expect(403);
      expect(writes).toBe(0);
    },
  );
  it("refuses cross-site browser metadata even when Origin is absent", async () => {
    await request(app.getHttpServer()).post("/v1/auth/logout")
      .set("Sec-Fetch-Site", "cross-site").send({}).expect(403);
    expect(writes).toBe(0);
  });
  it("does not trust forwarded origin/host headers", async () => {
    await request(app.getHttpServer()).post("/v1/auth/login")
      .set("Origin", "https://attacker.example").set("X-Forwarded-Host", "localhost:3000")
      .set("X-Forwarded-Proto", "https").send({}).expect(403);
  });
  it("allows the configured frontend, including intentional cross-site API hosting", async () => {
    const res = await request(app.getHttpServer()).post("/v1/auth/login")
      .set("Origin", trusted).set("Sec-Fetch-Site", "cross-site").send({}).expect(200);
    expect(res.headers["access-control-allow-origin"]).toBe(trusted);
    expect(writes).toBe(1);
  });
  it("preserves same-origin Swagger browser requests", async () => {
    await request(app.getHttpServer()).post("/v1/auth/login")
      .set("Origin", "http://127.0.0.1:5001").set("Sec-Fetch-Site", "same-origin")
      .send({}).expect(200);
  });
  it("preserves CLI/Postman requests without browser headers", async () => {
    await request(app.getHttpServer()).post("/v1/auth/login").send({}).expect(200);
    expect(writes).toBe(1);
  });
  it("preserves OAuth GET callbacks and CORS preflight", async () => {
    await request(app.getHttpServer()).get("/v1/auth/callback").expect(200);
    await request(app.getHttpServer()).options("/v1/auth/login")
      .set("Origin", trusted).set("Access-Control-Request-Method", "POST").expect(204);
  });
  it.each(["/v1/private", "/v1/missing"])("does not cache %s, including failures", async (path) => {
    const res = await request(app.getHttpServer()).get(path);
    expect(res.headers["cache-control"]).toMatch(/no-store/);
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
  });
  it("keeps no-store and security headers on rejected browser writes", async () => {
    const res = await request(app.getHttpServer()).post("/v1/auth/logout")
      .set("Origin", "https://attacker.example").expect(403);
    expect(res.headers["cache-control"]).toMatch(/no-store/);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });
});
