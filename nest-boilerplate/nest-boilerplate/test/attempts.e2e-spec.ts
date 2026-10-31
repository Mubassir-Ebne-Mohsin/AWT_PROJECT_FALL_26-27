import { Test } from "@nestjs/testing";
import { NestExpressApplication } from "@nestjs/platform-express";
import { DataSource } from "typeorm";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { AppModule } from "@/src/app.module";
import { configureApp, setupSwagger } from "@/src/app.setup";
import { RedisCacheService } from "@/providers/cache/redis/redis-cache.service";
import { FakeRedisCacheService } from "../test/fake-redis";
import { getTemplates } from "@/modules/simulation/engine/templates";
import { SimulationService } from "@/modules/simulation/simulation.service";
import {
  AccountRolesService,
  OPERATOR,
} from "@/modules/roles/account-roles.service";

jest.setTimeout(240000);
const PASSWORD = "R5-challenges-2026!";
type Account = { id: string; email: string; token: string };
const TRAFFIC = {
  preset: "steady",
  rps: 500,
  burst: 1.5,
  readRatio: 0.8,
  durationMin: 10,
  shape: "steady",
};

describe("R5.2 learner attempts (isolated Postgres, no AI involved)", () => {
  let app: NestExpressApplication,
    db: DataSource,
    http: ReturnType<typeof request>,
    roles: AccountRolesService;
  let teacher: Account,
    _otherTeacher: Account,
    learner: Account,
    reviewer: Account,
    admin: Account;
  const as = (a: Account) => ({ Authorization: "Bearer " + a.token });

  async function register(name: string): Promise<Account> {
    const email = `${name.replace(/\s+/g, "-").toLowerCase()}-${randomUUID()}@example.test`;
    const res = await http
      .post("/v1/auth/register")
      .send({ email, password: PASSWORD, displayName: name })
      .expect(201);
    return {
      id: res.body.data.user.id,
      email,
      token: res.body.data.accessToken,
    };
  }
  async function withRole(
    name: string,
    role: "instructor" | "reviewer" | "admin",
  ) {
    const a = await register(name);
    await roles.grant(OPERATOR, a.id, { role });
    return a;
  }
  async function newDesign(who: Account, name = "Starting design") {
    const t = getTemplates().find((x) => x.id === "mvp")!;
    return (
      await http
        .post("/v1/designs")
        .set(as(who))
        .send({
          schemaVersion: 1,
          name,
          description: t.blurb,
          source: "template",
          templateId: t.id,
          graph: t.graph,
          traffic: t.traffic,
        })
        .expect(201)
    ).body.data;
  }
  const body = (designId: string, over: Record<string, unknown> = {}) => ({
    title: "Survive the flash sale",
    summary: "Keep p95 under budget while traffic spikes.",
    goal: { p95Ms: 300, errorRate: 0.01 },
    traffic: TRAFFIC,
    from: { designId },
    ...over,
  });
  const create = (who: Account, b: unknown) =>
    http
      .post("/v1/instructor/challenges")
      .set(as(who))
      .send(b as object);
  async function made(
    who: Account = teacher,
    over: Record<string, unknown> = {},
  ) {
    const d = await newDesign(who);
    return (await create(who, body(d.id, over)).expect(201)).body.data as {
      id: string;
      [k: string]: any;
    };
  }
  const publish = (who: Account, id: string) =>
    http.post(`/v1/instructor/challenges/${id}/publish`).set(as(who));
  const archive = (who: Account, id: string) =>
    http.post(`/v1/instructor/challenges/${id}/archive`).set(as(who));

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RedisCacheService)
      .useValue(new FakeRedisCacheService())
      .compile();
    app = mod.createNestApplication<NestExpressApplication>();
    configureApp(app);
    db = app.get(DataSource);
    await db.runMigrations();
    setupSwagger(app);
    await app.init();
    http = request(app.getHttpServer());
    roles = app.get(AccountRolesService);
    teacher = await withRole("Tess Teacher", "instructor");
    _otherTeacher = await withRole("Tom Otherteacher", "instructor");
    learner = await register("Lena Learner");
    reviewer = await withRole("Rhea Reviewer", "reviewer");
    admin = await withRole("Ada Admin", "admin");
  });
  afterAll(async () => {
    await app?.close();
  });

  const begin = (a: Account, id: string) =>
    http.post(`/v1/challenges/${id}/attempt`).set(as(a));
  const submit = (
    a: Account,
    id: string,
    requestId = randomUUID(),
    expectedRevision = 1,
  ) =>
    http
      .post(`/v1/attempts/${id}/submissions`)
      .set(as(a))
      .send({ requestId, expectedRevision });
  async function settled(a: Account, id: string) {
    for (let n = 0; n < 100; n++) {
      const r = await http.get(`/v1/attempts/${id}`).set(as(a)).expect(200);
      if (!r.body.data.submissions.some((s: any) => s.status === "pending"))
        return r.body.data;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error("Judging did not settle");
  }
  it("public list exposes only published metadata and no private graph", async () => {
    const c = await made();
    await http.get(`/v1/challenges/${c.id}`).expect(404);
    await publish(teacher, c.id).expect(200);
    const r = await http.get(`/v1/challenges/${c.id}`).expect(200);
    expect(Object.keys(r.body.data).sort()).toEqual([
      "goal",
      "id",
      "summary",
      "title",
    ]);
    expect(
      (await http.get("/v1/challenges").expect(200)).body.data.map(
        (c: any) => c.id,
      ),
    ).toContain(c.id);
    await http.post(`/v1/challenges/${c.id}/attempt`).expect(401);
  });
  it("concurrent starts make one private copy and foreign users cannot read or submit", async () => {
    const c = await made();
    await publish(teacher, c.id).expect(200);
    const rr = await Promise.all([begin(learner, c.id), begin(learner, c.id)]);
    expect(rr.map((r) => r.status)).toEqual([200, 200]);
    expect(rr[0].body.data.id).toBe(rr[1].body.data.id);
    const a = rr[0].body.data;
    await http.get(`/v1/designs/${a.designId}`).set(as(learner)).expect(200);
    await http.get(`/v1/attempts/${a.id}`).set(as(admin)).expect(404);
    await submit(reviewer, a.id).expect(404);
  });
  it("judges server traffic, records immutable metrics, replays identity and preserves a pass", async () => {
    const c = await made(teacher, {
      goal: { p95Ms: 60000, errorRate: 1 },
      traffic: { ...TRAFFIC, rps: 1, burst: 1 },
    });
    await publish(teacher, c.id).expect(200);
    const a = (await begin(learner, c.id).expect(200)).body.data;
    const saved=(await http.get(`/v1/designs/${a.designId}`).set(as(learner)).expect(200)).body.data;
    await http.patch(`/v1/designs/${a.designId}`).set(as(learner)).send({expectedRevision:1,traffic:{...saved.traffic,rps:99999,sloP95:1,errorBudget:0}}).expect(200);
    const key = randomUUID();
    const r = await submit(learner, a.id, key, 2).expect(202);
    const done = await settled(learner, a.id);
    expect(done.submissions[0].status).toBe("completed");
    expect(done.submissions[0].passes).toBe(true);
    const replay = await submit(learner, a.id, key, 2).expect(202);
    expect(replay.body.data.id).toBe(r.body.data.id);
    await submit(learner, a.id, key, 1).expect(409);
    const [stored] = await db.query(
      "SELECT snapshot,result FROM challenge_submissions WHERE id=$1",
      [r.body.data.id],
    );
    expect(stored.snapshot.traffic.rps).toBe(1);
    expect(stored.result.output.kind).toBe("simulation");
    expect(stored.result.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    await archive(teacher, c.id).expect(200);
    await submit(learner, a.id).expect(409);
    await submit(learner, a.id, key, 2).expect(202);
    const progress = (
      await http.get("/v1/progress/challenges").set(as(learner)).expect(200)
    ).body.data;
    expect(progress.items.find((i: any) => i.attemptId === a.id)).toMatchObject(
      { passed: true, archived: true },
    );
  });
  it("refuses forged metrics and stale revisions", async () => {
    const c = await made();
    await publish(teacher, c.id).expect(200);
    const a = (await begin(learner, c.id).expect(200)).body.data;
    await http
      .post(`/v1/attempts/${a.id}/submissions`)
      .set(as(learner))
      .send({ requestId: randomUUID(), expectedRevision: 1, passes: true })
      .expect(422);
    await submit(learner, a.id, randomUUID(), 2).expect(409);
  });
  it("keeps worker failure ungraded and allows a later explicit request", async () => {
    const c = await made();
    await publish(teacher, c.id).expect(200);
    const a = (await begin(learner, c.id).expect(200)).body.data;
    const spy = jest
      .spyOn(app.get(SimulationService), "run")
      .mockRejectedValueOnce(new Error("controlled worker failure"));
    const key = randomUUID();
    await submit(learner, a.id, key).expect(202);
    let result = await settled(learner, a.id);
    expect(result.submissions[0]).toMatchObject({
      status: "failed",
      passes: null,
      p95: null,
    });
    spy.mockRestore();
    await submit(learner, a.id, key).expect(202);
    expect((await settled(learner, a.id)).submissions).toHaveLength(1);
    await submit(learner, a.id).expect(202);
    result = await settled(learner, a.id);
    expect(result.submissions).toHaveLength(2);
    expect(
      result.submissions.filter((s: any) => s.status === "completed"),
    ).toHaveLength(1);
  });
  it("concurrent submissions cannot cross the twenty graded-record limit",async()=>{
    const c=await made();await publish(teacher,c.id).expect(200);const a=(await begin(learner,c.id).expect(200)).body.data;
    await submit(learner,a.id).expect(202);await settled(learner,a.id);
    await db.query(`INSERT INTO challenge_submissions(attempt_id,request_id,design_revision,snapshot,goal,status,result,completed_at)
      SELECT attempt_id,gen_random_uuid(),design_revision,snapshot,goal,status,result,completed_at FROM challenge_submissions CROSS JOIN generate_series(1,18) WHERE attempt_id=$1`,[a.id]);
    const rr=await Promise.all([submit(learner,a.id),submit(learner,a.id)]);expect(rr.map(r=>r.status).sort()).toEqual([202,422]);
    const rows=await settled(learner,a.id);expect(rows.submissions.filter((s:any)=>s.status==='completed')).toHaveLength(20);
  });});
