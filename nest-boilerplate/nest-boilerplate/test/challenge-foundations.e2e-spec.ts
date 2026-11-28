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
  AccountRolesService,
  OPERATOR,
} from "@/modules/roles/account-roles.service";
import { seedFoundationPack } from "@/modules/challenges/foundation-pack";
import { FOUNDATION_PACK } from "@/modules/challenges/foundation-fixtures";
import { ChallengeLearning1795400000000 } from "@/database/migrations/1795400000000-ChallengeLearning";
Object.assign(dataSourceOptions.extra, {
  connectionTimeoutMillis: 15000,
  statement_timeout: 30000,
  query_timeout: 32000,
});
jest.setTimeout(180000);
describe("Foundation challenges: private attempts, frozen rules and migration", () => {
  let app: NestExpressApplication,
    db: DataSource,
    http: ReturnType<typeof request>,
    teacher: { id: string; token: string },
    learner: { id: string; token: string },
    stranger: { id: string; token: string };
  const auth = (u: { token: string }) => ({
    Authorization: "Bearer " + u.token,
  });
  async function user() {
    const r = await http
      .post("/v1/auth/register")
      .send({
        email: randomUUID() + "@example.test",
        password: "Challenge-2026!",
        displayName: "Foundation tester",
      })
      .expect(201);
    return { id: r.body.data.user.id, token: r.body.data.accessToken };
  }
  beforeAll(async () => {
    const m = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RedisCacheService)
      .useValue(new FakeRedisCacheService())
      .compile();
    app = m.createNestApplication<NestExpressApplication>();
    configureApp(app);
    db = app.get(DataSource);
    await db.runMigrations();
    // Only this labelled disposable test database is used by this suite.
    await db.query('TRUNCATE TABLE "users" CASCADE');
    setupSwagger(app);
    await app.init();
    http = request(app.getHttpServer());
    teacher = await user();
    learner = await user();
    stranger = await user();
    await app
      .get(AccountRolesService)
      .grant(OPERATOR, teacher.id, { role: "instructor" });
  });
  afterAll(async () => {
    await app?.close();
  });
  it("adds six once without overwriting published content and exposes only bounded starter metadata", async () => {
    expect(await seedFoundationPack(db, teacher.id)).toBe(6);
    await db.query("UPDATE challenges SET title='Owner wording' WHERE id=$1", [
      FOUNDATION_PACK[0].id,
    ]);
    expect(await seedFoundationPack(db, teacher.id)).toBe(0);
    const c = (
      await http.get("/v1/challenges/" + FOUNDATION_PACK[0].id).set(auth(learner)).expect(200)
    ).body.data;
    expect(c.title).toBe("Owner wording");
    expect(c.learning.difficulty).toBe("beginner");
    expect(c.rules.version).toBe(1);
    expect(c.traffic.rps).toBe(600);
    expect(
      c.preview.nodes.every(
        (n: Record<string, unknown>) => !Object.hasOwn(n, "props"),
      ),
    ).toBe(true);
    expect(c).not.toHaveProperty("reference");
    expect(Object.keys(c).sort()).toEqual(["baseline","goal","id","learning","preview","rules","summary","title","traffic"]);
    expect(JSON.stringify(c)).not.toMatch(/passwordHash|provider_subject/);
    const schema = (await http.get("/docs-json").expect(200)).body;
    expect(
      schema.components.schemas.PublicChallenge.properties.rules,
    ).toBeDefined();
  });
  it("refuses another pack owner and freezes rules/metadata on publication", async () => {
    await app
      .get(AccountRolesService)
      .grant(OPERATOR, stranger.id, { role: "instructor" });
    await expect(seedFoundationPack(db, stranger.id)).rejects.toThrow(
      /collision/,
    );
    await http
      .patch("/v1/instructor/challenges/" + FOUNDATION_PACK[0].id)
      .set(auth(teacher))
      .send({ policy: null })
      .expect(409);
    await http
      .patch("/v1/instructor/challenges/" + FOUNDATION_PACK[0].id)
      .set(auth(teacher))
      .send({ learning: null })
      .expect(409);
    await http
      .get("/v1/instructor/challenges/" + FOUNDATION_PACK[0].id)
      .set(auth(learner))
      .expect(403);
  });
  it("does not allocate a graded slot for shortcuts; grades saved graph with fixed challenge traffic and records rules", async () => {
    const c = FOUNDATION_PACK[0],
      a = (
        await http
          .post("/v1/challenges/" + c.id + "/attempt")
          .set(auth(learner))
          .expect(200)
      ).body.data;
    await http
      .get("/v1/attempts/" + a.id)
      .set(auth(stranger))
      .expect(404);
    const cheated = structuredClone(c.start);
    cheated.nodes.find((n) => n.type === "app")!.props.capacity = 1e9;
    const first = (
      await http
        .patch("/v1/designs/" + a.designId)
        .set(auth(learner))
        .send({ expectedRevision: 1, graph: cheated })
        .expect(200)
    ).body.data;
    const invalid = await http
      .post("/v1/attempts/" + a.id + "/submissions")
      .set(auth(learner))
      .send({ requestId: randomUUID(), expectedRevision: first.revision })
      .expect(422);
    expect(invalid.body.error.details.reason).toBe("EXERCISE_RULES");
    expect(
      (
        await db.query(
          "SELECT id FROM challenge_submissions WHERE attempt_id=$1",
          [a.id],
        )
      ).length,
    ).toBe(0);
    const fixed = (
        await http
          .patch("/v1/designs/" + a.designId)
          .set(auth(learner))
          .send({
            expectedRevision: first.revision,
            graph: c.reference,
            traffic: { ...c.traffic, rps: 1 },
          })
          .expect(200)
      ).body.data,
      requestId = randomUUID();
    const submitted = (
      await http
        .post("/v1/attempts/" + a.id + "/submissions")
        .set(auth(learner))
        .send({ requestId, expectedRevision: fixed.revision })
        .expect(202)
    ).body.data;
    const replay = (
      await http
        .post("/v1/attempts/" + a.id + "/submissions")
        .set(auth(learner))
        .send({ requestId, expectedRevision: fixed.revision })
        .expect(202)
    ).body.data;
    expect(replay.id).toBe(submitted.id);
    let view;
    for (let n = 0; n < 100; n++) {
      view = (
        await http
          .get("/v1/attempts/" + a.id)
          .set(auth(learner))
          .expect(200)
      ).body.data;
      if (view.submissions[0].status !== "pending") break;
      await new Promise((r) => setTimeout(r, 80));
    }
    expect(view.submissions[0]).toMatchObject({
      status: "completed",
      passes: true,
      rulesVersion: 1,
      modelVerdict: "pass",
    });
    const [row] = await db.query(
      "SELECT snapshot,rule_snapshot FROM challenge_submissions WHERE id=$1",
      [submitted.id],
    );
    expect(row.snapshot.traffic.rps).toBe(600);
    expect(row.rule_snapshot.profile).toBe("scale-app");
    const progress = (
      await http.get("/v1/progress/challenges").set(auth(learner)).expect(200)
    ).body.data;
    expect(
      progress.items.some(
        (i: { challengeId: string; passed: boolean }) =>
          i.challengeId === c.id && i.passed,
      ),
    ).toBe(true);
  });
  it("copies metadata and rules into a new owned draft and validates policy inputs", async () => {
    const c = FOUNDATION_PACK[1],
      copy = (
        await http
          .post("/v1/instructor/challenges/" + c.id + "/duplicate")
          .set(auth(teacher))
          .expect(201)
      ).body.data;
    expect(copy.status).toBe("draft");
    expect(copy.rules.profile).toBe("add-cache");
    expect(copy.learning.objective).toBe(c.learning.objective);
    await http
      .patch("/v1/instructor/challenges/" + copy.id)
      .set(auth(teacher))
      .send({ policy: "invented" })
      .expect(422);
    await http
      .patch("/v1/instructor/challenges/" + copy.id)
      .set(auth(teacher))
      .send({ policy: null, learning: null })
      .expect(200);
  });
  it("migration is reversible before use and refuses dropping populated learning/rule history", async () => {
    const q = db.createQueryRunner(),
      schema = "sf_challenge_migration_" + randomUUID().replace(/-/g, "");
    await q.connect();
    try {
      await q.query(`CREATE SCHEMA "${schema}"`);
      await q.query(`SET search_path TO "${schema}"`);
      await q.query("CREATE TABLE challenges(id int,title text)");
      await q.query("CREATE TABLE challenge_submissions(id int)");
      await q.query("INSERT INTO challenges VALUES(1,'Keep me')");
      const m = new ChallengeLearning1795400000000();
      await m.up(q);
      await m.down(q);
      expect((await q.query("SELECT title FROM challenges"))[0].title).toBe(
        "Keep me",
      );
      await m.up(q);
      await q.query("UPDATE challenges SET learning='{}'::jsonb");
      await expect(m.down(q)).rejects.toThrow(/rollback refused/);
      expect((await q.query("SELECT title FROM challenges"))[0].title).toBe(
        "Keep me",
      );
    } finally {
      await q.query("SET search_path TO public");
      await q.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await q.release();
    }
  });
});
