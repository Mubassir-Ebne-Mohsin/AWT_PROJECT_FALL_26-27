import { Test } from "@nestjs/testing";
import { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { DataSource } from "typeorm";
import { randomUUID } from "node:crypto";
import { AppModule } from "@/src/app.module";
import { configureApp, setupSwagger } from "@/src/app.setup";
import { dataSourceOptions } from "@/config/database.config";
import { RedisCacheService } from "@/providers/cache/redis/redis-cache.service";
import { FakeRedisCacheService } from "../test/fake-redis";
import {
  ProviderClient,
  ProviderTransaction,
} from "@/modules/social/provider-client";

import { Provider, VerifiedIdentity } from "@/modules/social/social.types";
import { SocialIdentities1795300000000 } from "@/database/migrations/1795300000000-SocialIdentities";
import { AppException } from "@/common/errors";
Object.assign(dataSourceOptions.extra, {
  statement_timeout: 30000,
  query_timeout: 32000,
});
jest.setTimeout(120000);
const origin = "http://localhost:3000",
  password = "Social-test-2026!";
describe("Social authentication controlled providers / isolated PostgreSQL", () => {
  let app: NestExpressApplication, db: DataSource;
  const identities = new Map<string, VerifiedIdentity>();
  const provider = {
    enabled: () => true,
    authorize: async (t: ProviderTransaction) =>
      `https://provider.example/authorize?state=${t.state}`,
    exchange: async (t: ProviderTransaction, q: Record<string, unknown>) => {
      const i = identities.get(String(q.code));
      if (!i || i.provider !== t.provider)
        throw new AppException(
          "UNAUTHENTICATED",
          "Controlled provider rejection",
        );
      return i;
    },
  };
  const agent = () => request.agent(app.getHttpServer());
  beforeAll(async () => {
    const m = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RedisCacheService)
      .useValue(new FakeRedisCacheService())
      .overrideProvider(ProviderClient)
      .useValue(provider)
      .compile();
    app = m.createNestApplication<NestExpressApplication>();
    configureApp(app);
    db = app.get(DataSource);
    await db.runMigrations();
    setupSwagger(app);
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
  });
  type Agent = ReturnType<typeof agent>;
  function identity(
    p: Provider = "google",
    over: Partial<VerifiedIdentity> = {},
  ) {
    const code = randomUUID(),
      i = {
        provider: p,
        subject: randomUUID(),
        email: randomUUID() + "@example.test",
        verified: true,
        name: "Social Tester",
        ...over,
      };
    identities.set(code, i);
    return { code, i };
  }
  async function callback(
    a: Agent,
    x: ReturnType<typeof identity>,
    next = "/designs",
  ) {
    const start = await a
      .get(`/v1/auth/${x.i.provider}/start`)
      .query({ next })
      .expect(303);
    const state = new URL(start.headers.location).searchParams.get("state");
    return a
      .get(`/v1/auth/${x.i.provider}/callback`)
      .query({ state, code: x.code })
      .expect(303);
  }
  async function signup(p: Provider = "google") {
    const a = agent(),
      x = identity(p);
    expect((await callback(a, x)).headers.location).toContain(
      "/register?social=1",
    );
    const pending = (await a.get("/v1/auth/oauth/pending").expect(200)).body
      .data;
    const registered = await a
      .post("/v1/auth/oauth/register")
      .set("Origin", origin)
      .send({ displayName: "Social Tester", terms: true, csrf: pending.csrf })
      .expect(201);
    return {
      a,
      x,
      session: registered.body.data,
      token: registered.body.data.accessToken as string,
      id: registered.body.data.user.id as string,
    };
  }
  async function local() {
    const a = agent(),
      r = await a
        .post("/v1/auth/register")
        .send({
          email: randomUUID() + "@example.test",
          password,
          displayName: "Local Tester",
        })
        .expect(201);
    return {
      a,
      token: r.body.data.accessToken,
      id: r.body.data.user.id,
      email: r.body.data.user.email,
    };
  }
  const bearer = (token: string) => ({
    Authorization: "Bearer " + token,
    Origin: origin,
  });
  async function reauth(s: Awaited<ReturnType<typeof signup>>, action: string) {
    const r = await s.a
      .post(`/v1/auth/oauth/${s.x.i.provider}/reauth`)
      .set(bearer(s.token))
      .send({ action })
      .expect(200);
    const state = new URL(r.body.data.url).searchParams.get("state");
    await s.a
      .get(`/v1/auth/${s.x.i.provider}/callback`)
      .query({ state, code: s.x.code })
      .expect(303);
    return (await s.a.get("/v1/auth/oauth/completion").expect(200)).body.data
      .proof as string;
  }
  it("migrates up/down safely before enrollment and preserves existing password hashes", async () => {
    const q = db.createQueryRunner(),
      schema = "sf_social_migration_" + randomUUID().replace(/-/g, "");
    await q.connect();
    try {
      await q.query(`CREATE SCHEMA "${schema}"`);
      await q.query(`SET search_path TO "${schema}"`);
      await q.query(
        "CREATE TABLE users(id uuid PRIMARY KEY,password_hash varchar(255) NOT NULL)",
      );
      const id = randomUUID();
      await q.query("INSERT INTO users VALUES($1,'known-test-hash')", [id]);
      const migration = new SocialIdentities1795300000000();
      await migration.up(q);
      await migration.down(q);
      expect(
        (
          await q.query(
            "SELECT password_hash='known-test-hash' AS intact FROM users WHERE id=$1",
            [id],
          )
        )[0].intact,
      ).toBe(true);
      await migration.up(q);
      await q.query("INSERT INTO users VALUES($1,NULL)", [randomUUID()]);
      await expect(migration.down(q)).rejects.toThrow(/rollback refused/);
    } finally {
      await q.query("SET search_path TO public");
      await q.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await q.release();
    }
  });
  it("publishes no-store availability and protects identity management", async () => {
    const r = await request(app.getHttpServer())
      .get("/v1/auth/providers")
      .expect(200);
    expect(r.body.data).toEqual({ google: true, github: true });
    expect(r.headers["cache-control"]).toBe("no-store");
    await request(app.getHttpServer())
      .get("/v1/auth/oauth/identities")
      .expect(401);
    await request(app.getHttpServer()).get("/v1/auth/evil/start").expect(422);
  });
  for (const p of ["google", "github"] as const)
    it(`${p}: explicit signup, JWT refresh, returning identity and logout`, async () => {
      const s = await signup(p);
      expect(s.session.user.hasPassword).toBe(false);
      expect(s.session.user.role).toBe("user");
      expect(s.session.next).toBe("/designs");
      const [u] = await db.query(
        "SELECT password_hash FROM users WHERE id=$1",
        [s.id],
      );
      expect(u.password_hash).toBeNull();
      await s.a.get("/v1/auth/me").set(bearer(s.token)).expect(200);
      await s.a.post("/v1/auth/refresh").expect(200);
      identities.set(s.x.code, {
        ...s.x.i,
        email: "changed@example.test",
        name: "Changed",
      });
      expect(
        (await callback(s.a, s.x, "//evil.example")).headers.location,
      ).toMatch(/\/auth\/complete\?oauth=1$/);
      const complete = (await s.a.get("/v1/auth/oauth/completion").expect(200))
        .body.data;
      expect(complete).toMatchObject({ kind: "login", next: "/dashboard" });
      const refreshed = (await s.a.post("/v1/auth/refresh").expect(200)).body
        .data;
      expect(refreshed.user.id).toBe(s.id);
      expect(refreshed.user.email).toBe(s.x.i.email);
      await s.a
        .post("/v1/auth/logout")
        .set(bearer(refreshed.accessToken))
        .expect(204);
      await s.a.post("/v1/auth/refresh").expect(401);
    });
  it("requires consent and a correct pending CSRF token, with no account before final submission", async () => {
    const a = agent(),
      x = identity();
    await callback(a, x);
    expect(
      (await db.query("SELECT id FROM users WHERE email=$1", [x.i.email]))
        .length,
    ).toBe(0);
    const p = (await a.get("/v1/auth/oauth/pending").expect(200)).body.data;
    await a
      .post("/v1/auth/oauth/register")
      .set("Origin", origin)
      .send({ displayName: "X", terms: false, csrf: p.csrf })
      .expect(422);
    await a
      .post("/v1/auth/oauth/register")
      .set("Origin", origin)
      .send({ displayName: "X", terms: true, csrf: "wrong" })
      .expect(403);
    await a
      .post("/v1/auth/oauth/register")
      .set("Origin", "https://evil.example")
      .send({ displayName: "X", terms: true, csrf: p.csrf })
      .expect(403);
    await a
      .post("/v1/auth/oauth/register")
      .set("Origin", origin)
      .send({ displayName: "X", terms: true, csrf: p.csrf })
      .expect(201);
    await a
      .post("/v1/auth/oauth/register")
      .set("Origin", origin)
      .send({ displayName: "X", terms: true, csrf: p.csrf })
      .expect(401);
  });
  it("never auto-links a matching email and rejects missing verified email", async () => {
    const u = await local(),
      a = agent();
    const x = identity("github", { email: u.email });
    expect((await callback(a, x)).headers.location).toContain(
      "email-or-identity-conflict",
    );
    expect(
      (
        await db.query("SELECT * FROM external_identities WHERE user_id=$1", [
          u.id,
        ])
      ).length,
    ).toBe(0);
    const missing = identity("github", { email: null, verified: false });
    expect((await callback(a, missing)).headers.location).toContain(
      "verified-email-required",
    );
  });
  it("rejects foreign browser, provider mixup, cancellation and state replay", async () => {
    const a = agent(),
      b = agent(),
      x = identity();
    const start = await a.get("/v1/auth/google/start").expect(303),
      state = new URL(start.headers.location).searchParams.get("state");
    expect(
      (
        await b
          .get("/v1/auth/google/callback")
          .query({ state, code: x.code })
          .expect(303)
      ).headers.location,
    ).toContain("sign-in-failed");
    expect(
      (
        await a
          .get("/v1/auth/github/callback")
          .query({ state, code: x.code })
          .expect(303)
      ).headers.location,
    ).toContain("sign-in-failed");
    await a
      .get("/v1/auth/google/callback")
      .query({ state, error: "access_denied" })
      .expect(303);
    expect(
      (
        await a
          .get("/v1/auth/google/callback")
          .query({ state, code: x.code })
          .expect(303)
      ).headers.location,
    ).toContain("sign-in-failed");
  });
  it("handles nullable passwords with a normal credential error", async () => {
    const s = await signup();
    await s.a
      .post("/v1/auth/login")
      .send({ email: s.x.i.email, password })
      .expect(401);
    await s.a
      .post("/v1/auth/login")
      .send({ email: s.x.i.email, password: "not-a-real-password" })
      .expect(401);
    await s.a
      .post("/v1/auth/password")
      .set(bearer(s.token))
      .send({ currentPassword: password, newPassword: "Another-pass-2026!" })
      .expect(422);
    await s.a
      .post("/v1/account/delete")
      .set(bearer(s.token))
      .send({ password, confirmation: "delete my account" })
      .expect(422);
  });
  it("requires fresh purpose-bound proof and prevents unlinking the final provider", async () => {
    const s = await signup();
    await s.a
      .post("/v1/auth/oauth/google/unlink")
      .set(bearer(s.token))
      .send({ proof: "x".repeat(43) })
      .expect(403);
    const proof = await reauth(s, "unlink:google");
    await s.a
      .post("/v1/auth/oauth/password")
      .set(bearer(s.token))
      .send({ proof, newPassword: password })
      .expect(403);
    await s.a
      .post("/v1/auth/oauth/google/unlink")
      .set(bearer(s.token))
      .send({ proof })
      .expect(409);
    await s.a
      .post("/v1/auth/oauth/google/unlink")
      .set(bearer(s.token))
      .send({ proof })
      .expect(403);
    await s.a.get("/v1/auth/me").set(bearer(s.token)).expect(200);
  });
  it("sets a first real password then allows provider removal, retaining email login", async () => {
    const s = await signup(),
      proof = await reauth(s, "set-password");
    const r = await s.a
      .post("/v1/auth/oauth/password")
      .set(bearer(s.token))
      .send({ proof, newPassword: password })
      .expect(200);
    const token = r.body.data.accessToken;
    const fresh = (
      await s.a
        .post("/v1/auth/reauthenticate")
        .set(bearer(token))
        .send({ password, action: "unlink:google" })
        .expect(200)
    ).body.data.proof;
    await s.a
      .post("/v1/auth/oauth/google/unlink")
      .set(bearer(token))
      .send({ proof: fresh })
      .expect(200);
    await s.a
      .post("/v1/auth/login")
      .send({ email: s.x.i.email, password })
      .expect(200);
  });
  it("links only by explicit authenticated action and refuses cross-account transfer", async () => {
    const a = await local(),
      x = identity("github");
    await a.a
      .post("/v1/auth/reauthenticate")
      .set(bearer(a.token))
      .send({ password: "wrong-password", action: "link:github" })
      .expect(403);
    await a.a.get("/v1/auth/me").set(bearer(a.token)).expect(200);
    const proof = (
      await a.a
        .post("/v1/auth/reauthenticate")
        .set(bearer(a.token))
        .send({ password, action: "link:github" })
        .expect(200)
    ).body.data.proof;
    const start = await a.a
        .post("/v1/auth/oauth/github/link")
        .set(bearer(a.token))
        .send({ proof })
        .expect(200),
      state = new URL(start.body.data.url).searchParams.get("state");
    await a.a
      .get("/v1/auth/github/callback")
      .query({ state, code: x.code })
      .expect(303);
    expect(
      (
        await a.a
          .get("/v1/auth/oauth/identities")
          .set(bearer(a.token))
          .expect(200)
      ).body.data.providers[0].provider,
    ).toBe("github");
    const b = await signup("google");
    const other = await reauth(b, "link:github");
    const r = await b.a
      .post("/v1/auth/oauth/github/link")
      .set(bearer(b.token))
      .send({ proof: other })
      .expect(200);
    expect(
      (
        await b.a
          .get("/v1/auth/github/callback")
          .query({
            state: new URL(r.body.data.url).searchParams.get("state"),
            code: x.code,
          })
          .expect(303)
      ).headers.location,
    ).toContain("email-or-identity-conflict");
    expect(
      (
        await db.query(
          "SELECT user_id FROM external_identities WHERE provider_subject=$1",
          [x.i.subject],
        )
      )[0].user_id,
    ).toBe(a.id);
  });
  it("exports safe identities and deletes social-only accounts with a single-use proof", async () => {
    const s = await signup(),
      exported = (
        await s.a.get("/v1/account/export").set(bearer(s.token)).expect(200)
      ).body.data;
    expect(exported.connectedProviders).toEqual([
      { provider: "google", linkedAt: expect.any(String) },
    ]);
    expect(JSON.stringify(exported)).not.toContain(s.x.i.subject);
    const proof = await reauth(s, "delete");
    await s.a
      .post("/v1/auth/oauth/delete")
      .set(bearer(s.token))
      .send({ proof, confirmation: "delete my account" })
      .expect(204);
    expect(
      (await db.query("SELECT id FROM users WHERE id=$1", [s.id])).length,
    ).toBe(0);
    expect(
      (
        await db.query("SELECT id FROM external_identities WHERE user_id=$1", [
          s.id,
        ])
      ).length,
    ).toBe(0);
    await s.a.get("/v1/auth/me").set(bearer(s.token)).expect(401);
  });
  it("keeps last-Admin protection for social-only deletion", async () => {
    const s = await signup(),
      others: { id: string; account_status: string }[] = await db.query(
        "SELECT DISTINCT u.id,u.account_status FROM users u JOIN user_roles r ON r.user_id=u.id WHERE r.role='admin' AND u.id<>$1",
        [s.id],
      );
    try {
      for (const u of others)
        await db.query(
          "UPDATE users SET account_status='suspended' WHERE id=$1",
          [u.id],
        );
      await db.query(
        "INSERT INTO user_roles(user_id,role,granted_at) VALUES($1,'admin',now())",
        [s.id],
      );
      const proof = await reauth(s, "delete");
      await s.a
        .post("/v1/auth/oauth/delete")
        .set(bearer(s.token))
        .send({ proof, confirmation: "delete my account" })
        .expect(409);
    } finally {
      await db.query(
        "DELETE FROM user_roles WHERE user_id=$1 AND role='admin'",
        [s.id],
      );
      for (const u of others)
        await db.query("UPDATE users SET account_status=$2 WHERE id=$1", [
          u.id,
          u.account_status,
        ]);
    }
  });
  it("does not let proof cross accounts or refresh families", async () => {
    const a = await signup(),
      proof = await reauth(a, "set-password"),
      b = await signup("github");
    await b.a
      .post("/v1/auth/oauth/password")
      .set(bearer(b.token))
      .send({ proof, newPassword: password })
      .expect(403);
    await a.a.post("/v1/auth/logout").set(bearer(a.token)).expect(204);
    await callback(a.a, a.x);
    await a.a.get("/v1/auth/oauth/completion").expect(200);
    const session = (await a.a.post("/v1/auth/refresh").expect(200)).body.data;
    await a.a
      .post("/v1/auth/oauth/password")
      .set(bearer(session.accessToken))
      .send({ proof, newPassword: password })
      .expect(403);
  });
  it("atomically admits one of two racing social registrations", async () => {
    const a = agent(),
      b = agent(),
      x = identity();
    await callback(a, x);
    await callback(b, x);
    const pa = (await a.get("/v1/auth/oauth/pending").expect(200)).body.data,
      pb = (await b.get("/v1/auth/oauth/pending").expect(200)).body.data;
    const results = await Promise.all([
      a
        .post("/v1/auth/oauth/register")
        .set("Origin", origin)
        .send({ displayName: "A", terms: true, csrf: pa.csrf }),
      b
        .post("/v1/auth/oauth/register")
        .set("Origin", origin)
        .send({ displayName: "B", terms: true, csrf: pb.csrf }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(
      (await db.query("SELECT id FROM users WHERE email=$1", [x.i.email]))
        .length,
    ).toBe(1);
    expect(
      (
        await db.query(
          "SELECT id FROM external_identities WHERE provider_subject=$1",
          [x.i.subject],
        )
      ).length,
    ).toBe(1);
  });
  it("serializes parallel unlinks so one usable provider always remains", async () => {
    const s = await signup(),
      github = identity("github"),
      linkProof = await reauth(s, "link:github"),
      start = await s.a
        .post("/v1/auth/oauth/github/link")
        .set(bearer(s.token))
        .send({ proof: linkProof })
        .expect(200);
    await s.a
      .get("/v1/auth/github/callback")
      .query({
        state: new URL(start.body.data.url).searchParams.get("state"),
        code: github.code,
      })
      .expect(303);
    const a = await reauth(s, "unlink:google"),
      b = await reauth(s, "unlink:github");
    const results = await Promise.all([
      s.a
        .post("/v1/auth/oauth/google/unlink")
        .set(bearer(s.token))
        .send({ proof: a }),
      s.a
        .post("/v1/auth/oauth/github/unlink")
        .set(bearer(s.token))
        .send({ proof: b }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      (
        await db.query("SELECT id FROM external_identities WHERE user_id=$1", [
          s.id,
        ])
      ).length,
    ).toBe(1);
  });
  it("refuses suspended identities and malformed sensitive requests", async () => {
    const s = await signup();
    await db.query("UPDATE users SET account_status='suspended' WHERE id=$1", [
      s.id,
    ]);
    expect((await callback(s.a, s.x)).headers.location).toContain(
      "account-unavailable",
    );
    await s.a.post("/v1/auth/refresh").expect(401);
    const a = await local();
    await a.a
      .post("/v1/auth/reauthenticate")
      .set(bearer(a.token))
      .send({ password, action: "grant-admin" })
      .expect(422);
    await a.a
      .post("/v1/auth/oauth/google/link")
      .set(bearer(a.token))
      .send({ proof: "x".repeat(43), owner: "other" })
      .expect(422);
  });

  it("serializes concurrent Admin deletions so one working Admin remains", async () => {
    const a = await signup(),
      b = await signup("github"),
      others: { id: string; account_status: string }[] = await db.query(
        "SELECT DISTINCT u.id,u.account_status FROM users u JOIN user_roles r ON r.user_id=u.id WHERE r.role='admin'",
      );
    try {
      for (const u of others)
        await db.query(
          "UPDATE users SET account_status='suspended' WHERE id=$1",
          [u.id],
        );
      await db.query(
        "INSERT INTO user_roles(user_id,role,granted_at) VALUES($1,'admin',now()),($2,'admin',now())",
        [a.id, b.id],
      );
      const pa = await reauth(a, "delete"),
        pb = await reauth(b, "delete"),
        results = await Promise.all([
          a.a
            .post("/v1/auth/oauth/delete")
            .set(bearer(a.token))
            .send({ proof: pa, confirmation: "delete my account" }),
          b.a
            .post("/v1/auth/oauth/delete")
            .set(bearer(b.token))
            .send({ proof: pb, confirmation: "delete my account" }),
        ]);
      expect(results.map((r) => r.status).sort()).toEqual([204, 409]);
      expect(
        (
          await db.query("SELECT id FROM users WHERE id=ANY($1::uuid[])", [
            [a.id, b.id],
          ])
        ).length,
      ).toBe(1);
    } finally {
      await db.query("DELETE FROM user_roles WHERE user_id=ANY($1::uuid[])", [
        [a.id, b.id],
      ]);
      for (const u of others)
        await db.query("UPDATE users SET account_status=$2 WHERE id=$1", [
          u.id,
          u.account_status,
        ]);
    }
  });
  it("rate limits public social entry without exposing configuration secrets", async () => {
    let limited: request.Response | undefined;
    for (let n = 0; n < 52; n++) {
      const res = await agent().get("/v1/auth/providers");
      if (res.status === 429) {
        limited = res;
        break;
      }
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ google: true, github: true });
    }
    expect(limited?.body.error.code).toBe("RATE_LIMITED");
  });
  it("refuses destructive rollback with social-only users or linked identities", async () => {
    const runner = db.createQueryRunner();
    await runner.connect();
    try {
      await expect(
        new SocialIdentities1795300000000().down(runner),
      ).rejects.toThrow(/rollback refused/);
    } finally {
      await runner.release();
    }
    expect(
      (await db.query("SELECT to_regclass('external_identities') AS tab"))[0]
        .tab,
    ).toBe("external_identities");
  });
});
