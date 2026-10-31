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
import { phase3OpenApi } from "@/common/contracts/phase3/openapi";
import { reviewGrantSchema, reviewItemSchema, reviewViewSchema } from "@/common/contracts/phase3/reviews.schema";
import { AccountRolesService, OPERATOR } from "@/modules/roles/account-roles.service";

jest.setTimeout(180000);
const PASSWORD = "R3-review-2026!";
type Account = { id: string; email: string; token: string };

describe("R3 Review grants (isolated Postgres, no AI involved)", () => {
  let app: NestExpressApplication, db: DataSource, http: ReturnType<typeof request>, roles: AccountRolesService;
  const as = (a: Account) => ({ Authorization: "Bearer " + a.token });

  async function register(name: string): Promise<Account> {
    const email = `${name.replace(/\s+/g, "-").toLowerCase()}-${randomUUID()}@example.test`;
    const res = await http.post("/v1/auth/register").send({ email, password: PASSWORD, displayName: name }).expect(201);
    return { id: res.body.data.user.id, email, token: res.body.data.accessToken };
  }
  async function withRole(name: string, role: "reviewer" | "admin" | "instructor") {
    const account = await register(name);
    await roles.grant(OPERATOR, account.id, { role });
    return account;
  }
  async function newDesign(owner: Account, name?: string) {
    const t = getTemplates().find((x) => x.id === "mvp")!;
    return (
      await http
        .post("/v1/designs")
        .set(as(owner))
        .send({ schemaVersion: 1, name: name ?? t.name, description: t.blurb, source: "template", templateId: t.id, graph: t.graph, traffic: t.traffic })
        .expect(201)
    ).body.data;
  }
  async function simulate(owner: Account, id: string, revision: number) {
    const url = (await http.post(`/v1/designs/${id}/simulate`).set(as(owner)).send({ expectedRevision: revision, requestId: randomUUID() }).expect(202)).body.data.statusUrl;
    for (let i = 0; i < 150; i++) {
      const r = (await http.get(url).set(as(owner)).expect(200)).body.data;
      if (r.status !== "pending") return r;
      await new Promise((res) => setTimeout(res, 50));
    }
    throw new Error("run stayed pending");
  }
  const share = (owner: Account, designId: string, body: Record<string, unknown>) => http.post(`/v1/designs/${designId}/reviews`).set(as(owner)).send(body);
  const owned = (owner: Account, designId: string) => http.get(`/v1/designs/${designId}/reviews`).set(as(owner));
  const revoke = (owner: Account, designId: string, grantId: string) => http.post(`/v1/designs/${designId}/reviews/${grantId}/revoke`).set(as(owner));
  const inbox = (a: Account) => http.get("/v1/reviews/shared-with-me").set(as(a));
  const open = (a: Account, id: string) => http.get(`/v1/reviews/${id}`).set(as(a));

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(RedisCacheService).useValue(new FakeRedisCacheService()).compile();
    app = mod.createNestApplication<NestExpressApplication>();
    configureApp(app);
    db = app.get(DataSource);
    await db.runMigrations();
    setupSwagger(app);
    await app.init();
    http = request(app.getHttpServer());
    roles = app.get(AccountRolesService);
  });
  afterAll(async () => {
    await app?.close();
  });

  it("shares one frozen revision with one named Reviewer, who sees it by display name only", async () => {
    const owner = await register("Olivia Owner");
    const reviewer = await withRole("Rhea Reviewer", "reviewer");
    const design = await newDesign(owner, "Checkout service");
    const made = await share(owner, design.id, { email: reviewer.email }).expect(201);
    const grant = reviewGrantSchema.parse(made.body.data);
    expect(grant).toMatchObject({ designId: design.id, revision: design.revision, status: "active", revokedAt: null, reviewer: { email: reviewer.email, displayName: "Rhea Reviewer" } });

    const items = (await inbox(reviewer).expect(200)).body.data.map((i: unknown) => reviewItemSchema.parse(i));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: grant.id, designName: "Checkout service", ownerDisplayName: "Olivia Owner", revision: design.revision, verdict: null });
    const view = reviewViewSchema.parse((await open(reviewer, grant.id).expect(200)).body.data);
    expect(view.ownerDisplayName).toBe("Olivia Owner");
    expect(view.report.name).toBe("Checkout service");
    expect(view.report.noteScope).toBe("none");
    expect(view.report.notes).toEqual([]);

    // Nothing in what the Reviewer receives identifies the owner beyond the display name, or exposes internal ids.
    const everything = JSON.stringify([items, view]);
    expect(everything).not.toContain(owner.email);
    expect(everything).not.toContain(owner.id);
    expect(everything).not.toContain(design.id);
    expect(Object.keys(view).sort()).toEqual(["id", "ownerDisplayName", "report", "sharedAt"]);
  });

  it("freezes the document at grant time: later edits and notes never reach the Reviewer", async () => {
    const owner = await register("Fred Frozen");
    const reviewer = await withRole("Frances Reviewer", "reviewer");
    const design = await newDesign(owner, "Original name");
    await http.post(`/v1/designs/${design.id}/notes`).set(as(owner)).send({ kind: "decision", text: "PRIVATE-DECISION-TEXT" }).expect(201);
    const grant = (await share(owner, design.id, { email: reviewer.email }).expect(201)).body.data;
    await http.patch(`/v1/designs/${design.id}`).set(as(owner)).send({ expectedRevision: design.revision, name: "Renamed afterwards" }).expect(200);
    await http.post(`/v1/designs/${design.id}/notes`).set(as(owner)).send({ kind: "assumption", text: "PRIVATE-ASSUMPTION-TEXT" }).expect(201);
    const view = (await open(reviewer, grant.id).expect(200)).body.data;
    expect(view.report.name).toBe("Original name");
    expect(view.report.revision).toBe(design.revision);
    const text = JSON.stringify(view);
    expect(text).not.toContain("PRIVATE-DECISION-TEXT");
    expect(text).not.toContain("PRIVATE-ASSUMPTION-TEXT");
    expect(text).not.toContain("Renamed afterwards");
  });

  it("includes the recorded result for the shared revision, and the list shows its verdict", async () => {
    const owner = await register("Rita Results");
    const reviewer = await withRole("Ravi Reviewer", "reviewer");
    const design = await newDesign(owner);
    const run = await simulate(owner, design.id, design.revision);
    expect(run.status).toBe("completed");
    const grant = (await share(owner, design.id, { email: reviewer.email, run: run.id }).expect(201)).body.data;
    expect(grant.runId).toBe(run.id);
    const view = (await open(reviewer, grant.id).expect(200)).body.data;
    expect(view.report.run.id).toBe(run.id);
    expect(view.report.run.simulation.verdict).toMatch(/pass|strained|fail/);
    const [item] = (await inbox(reviewer).expect(200)).body.data;
    expect(item.verdict).toBe(view.report.run.simulation.verdict);
  });

  it("shares the chosen older revision, not the current one", async () => {
    const owner = await register("Oscar Older");
    const reviewer = await withRole("Rosa Reviewer", "reviewer");
    const design = await newDesign(owner, "Version one");
    const second = (await http.patch(`/v1/designs/${design.id}`).set(as(owner)).send({ expectedRevision: design.revision, name: "Version two" }).expect(200)).body.data;
    expect(second.revision).toBe(design.revision + 1);
    const grant = (await share(owner, design.id, { email: reviewer.email, revision: design.revision }).expect(201)).body.data;
    expect(grant.revision).toBe(design.revision);
    expect((await open(reviewer, grant.id).expect(200)).body.data.report.name).toBe("Version one");
  });

  it("names a Reviewer only if the account exists, holds the Reviewer role and is not suspended: one answer for all other cases", async () => {
    const owner = await register("Nora Names");
    const design = await newDesign(owner);
    const reviewer = await withRole("Rex Eligible", "reviewer");
    const plain = await register("Plain Person");
    const adminOnly = await withRole("Adam Admin", "admin");
    const instructor = await withRole("Ian Instructor", "instructor");
    const suspended = await withRole("Sue Suspended", "reviewer");
    await db.query("UPDATE users SET account_status = 'suspended' WHERE id = $1", [suspended.id]);

    const answers = [] as unknown[];
    for (const email of [`nobody-${randomUUID()}@example.test`, plain.email, adminOnly.email, instructor.email, suspended.email]) {
      const res = await share(owner, design.id, { email }).expect(404);
      expect(res.body.error.details).toMatchObject({ reason: "NO_REVIEWER" });
      answers.push(res.body.error.message);
    }
    expect(new Set(answers).size).toBe(1);
    // Case does not matter for the one who qualifies.
    await share(owner, design.id, { email: reviewer.email.toUpperCase() }).expect(201);
    expect((await owned(owner, design.id).expect(200)).body.data).toHaveLength(1);
  });

  it("refuses to share with yourself, even for an owner who is also a Reviewer", async () => {
    const owner = await withRole("Selma Self", "reviewer");
    const design = await newDesign(owner);
    const res = await share(owner, design.id, { email: owner.email }).expect(409);
    expect(res.body.error.details).toMatchObject({ reason: "SELF" });
    expect((await db.query("SELECT count(*)::int AS n FROM review_grants WHERE design_id = $1", [design.id]))[0].n).toBe(0);
  });

  it("lets only the Reviewer role read reviews: guests 401, others 403, and an Admin cannot read content", async () => {
    const owner = await register("Pam Permissions");
    const reviewer = await withRole("Paul Reviewer", "reviewer");
    const design = await newDesign(owner);
    const grant = (await share(owner, design.id, { email: reviewer.email }).expect(201)).body.data;
    const admin = await withRole("Ada Admin", "admin");
    const plain = await register("Pete Plain");
    const bothAdminAndReviewer = await withRole("Bea Both", "reviewer");
    await roles.grant(OPERATOR, bothAdminAndReviewer.id, { role: "admin" });

    await http.get("/v1/reviews/shared-with-me").expect(401);
    await http.get(`/v1/reviews/${grant.id}`).expect(401);
    for (const refused of [admin, plain, owner]) {
      expect((await inbox(refused)).status).toBe(403);
      expect((await open(refused, grant.id)).status).toBe(403);
    }
    // A Reviewer who is also an Admin still sees only what was granted to them.
    expect((await inbox(bothAdminAndReviewer).expect(200)).body.data).toEqual([]);
    await open(bothAdminAndReviewer, grant.id).expect(404);
    await open(reviewer, grant.id).expect(200);
  });

  it("gives a Reviewer 'not found' for anyone else's grant, and keeps reviewer lists apart", async () => {
    const owner = await register("Otto Owner");
    const first = await withRole("Fay First", "reviewer");
    const second = await withRole("Sam Second", "reviewer");
    const design = await newDesign(owner);
    const grant = (await share(owner, design.id, { email: first.email }).expect(201)).body.data;
    await open(second, grant.id).expect(404);
    await open(second, randomUUID()).expect(404);
    expect((await inbox(second).expect(200)).body.data).toEqual([]);
    expect((await inbox(first).expect(200)).body.data).toHaveLength(1);
    expect([400, 422]).toContain((await http.get("/v1/reviews/not-a-uuid").set(as(first))).status);
  });

  it("stops the Reviewer's access the moment the owner revokes, keeps revoking idempotent, and lets the owner share again", async () => {
    const owner = await register("Rob Revoker");
    const reviewer = await withRole("Rue Reviewer", "reviewer");
    const design = await newDesign(owner);
    const grant = (await share(owner, design.id, { email: reviewer.email }).expect(201)).body.data;
    await open(reviewer, grant.id).expect(200);
    const first = (await revoke(owner, design.id, grant.id).expect(200)).body.data;
    expect(first.status).toBe("revoked");
    await open(reviewer, grant.id).expect(404);
    expect((await inbox(reviewer).expect(200)).body.data).toEqual([]);
    await new Promise((res) => setTimeout(res, 20));
    const again = (await revoke(owner, design.id, grant.id).expect(200)).body.data;
    expect(again.revokedAt).toBe(first.revokedAt);
    const listed = (await owned(owner, design.id).expect(200)).body.data;
    expect(listed).toHaveLength(1);
    expect(listed[0].status).toBe("revoked");
    // Sharing the same revision again is a new grant with a new id.
    const renewed = (await share(owner, design.id, { email: reviewer.email }).expect(201)).body.data;
    expect(renewed.id).not.toBe(grant.id);
    await open(reviewer, renewed.id).expect(200);
    await open(reviewer, grant.id).expect(404);
  });

  it("refuses a second active grant for the same revision and Reviewer, but allows a different revision", async () => {
    const owner = await register("Dana Duplicate");
    const reviewer = await withRole("Dev Reviewer", "reviewer");
    const design = await newDesign(owner);
    await share(owner, design.id, { email: reviewer.email }).expect(201);
    const dup = await share(owner, design.id, { email: reviewer.email }).expect(409);
    expect(dup.body.error.details).toMatchObject({ reason: "ALREADY_SHARED" });
    await http.patch(`/v1/designs/${design.id}`).set(as(owner)).send({ expectedRevision: design.revision, name: "Second revision" }).expect(200);
    await share(owner, design.id, { email: reviewer.email }).expect(201);
    expect((await owned(owner, design.id).expect(200)).body.data).toHaveLength(2);
  });

  it("limits a design to 10 active reviews, and a revoked one frees a place", async () => {
    const owner = await register("Lena Limit");
    const design = await newDesign(owner);
    const grants: Array<{ id: string }> = [];
    // These Reviewers never sign in, so they are inserted directly instead of using up the sign-up rate limit.
    const bareReviewer = async (label: string) => {
      const email = `${label}-${randomUUID()}@example.test`;
      const [{ id }] = await db.query("INSERT INTO users(id, email, password_hash, display_name, role) VALUES (gen_random_uuid(), $1, 'not-a-real-hash', $2, 'user') RETURNING id", [email, label]);
      await db.query("INSERT INTO user_roles(user_id, role, granted_by, granted_at) VALUES ($1, 'reviewer', NULL, now())", [id]);
      return { id, email };
    };
    for (let i = 0; i < 10; i++) {
      const r = await bareReviewer(`limit-reviewer-${i}`);
      grants.push((await share(owner, design.id, { email: r.email }).expect(201)).body.data);
    }
    const extra = await bareReviewer("limit-reviewer-extra");
    const refused = await share(owner, design.id, { email: extra.email }).expect(422);
    expect(refused.body.error.details).toMatchObject({ reason: "REVIEW_LIMIT_REACHED" });
    await revoke(owner, design.id, grants[0].id).expect(200);
    await share(owner, design.id, { email: extra.email }).expect(201);
  });

  it("lets only the design's owner create, list or revoke grants", async () => {
    const owner = await register("Owen Owner");
    const intruder = await register("Ivy Intruder");
    const reviewer = await withRole("Ron Reviewer", "reviewer");
    const design = await newDesign(owner);
    const grant = (await share(owner, design.id, { email: reviewer.email }).expect(201)).body.data;
    await share(intruder, design.id, { email: reviewer.email }).expect(403);
    await owned(intruder, design.id).expect(403);
    await revoke(intruder, design.id, grant.id).expect(403);
    await http.post(`/v1/designs/${design.id}/reviews`).send({ email: reviewer.email }).expect(401);
    await open(reviewer, grant.id).expect(200); // still active: the intruder changed nothing
    // A grant id from one design never works under another.
    const second = await newDesign(owner);
    await revoke(owner, second.id, grant.id).expect(404);
    await open(reviewer, grant.id).expect(200);
  });

  it("rejects bad requests with no side effect", async () => {
    const owner = await register("Val Validator");
    const reviewer = await withRole("Vic Reviewer", "reviewer");
    const design = await newDesign(owner);
    const foreignRunOwner = await newDesign(owner);
    const foreignRun = await simulate(owner, foreignRunOwner.id, foreignRunOwner.revision);
    for (const body of [{}, { email: "" }, { email: "ab" }, { email: reviewer.email, extra: true }, { email: reviewer.email, revision: 0 }, { email: reviewer.email, revision: 1.5 }, { email: reviewer.email, run: "nope" }]) {
      await share(owner, design.id, body).expect(422);
    }
    await share(owner, design.id, { email: reviewer.email, revision: 99 }).expect(404);
    await share(owner, design.id, { email: reviewer.email, run: foreignRun.id }).expect(404); // another design's result
    await share(owner, randomUUID(), { email: reviewer.email }).expect(404);
    expect([400, 422]).toContain((await share(owner, "not-a-uuid", { email: reviewer.email })).status);
    expect((await db.query("SELECT count(*)::int AS n FROM review_grants WHERE design_id = $1", [design.id]))[0].n).toBe(0);
  });

  it("ends a Reviewer's access at once when their Reviewer role is removed, with the same token", async () => {
    const owner = await register("Rolf Roles");
    const reviewer = await withRole("Rina Reviewer", "reviewer");
    const design = await newDesign(owner);
    const grant = (await share(owner, design.id, { email: reviewer.email }).expect(201)).body.data;
    await open(reviewer, grant.id).expect(200);
    await roles.revoke(OPERATOR, reviewer.id, "reviewer");
    await open(reviewer, grant.id).expect(403);
    await inbox(reviewer).expect(403);
    await roles.grant(OPERATOR, reviewer.id, { role: "reviewer" });
    await open(reviewer, grant.id).expect(200); // the grant itself was never touched
  });

  it("removes grants when the design or an account is deleted", async () => {
    const owner = await register("Del Owner");
    const reviewer = await withRole("Del Reviewer", "reviewer");
    const keep = await newDesign(owner);
    const gone = await newDesign(owner);
    const a = (await share(owner, keep.id, { email: reviewer.email }).expect(201)).body.data;
    const b = (await share(owner, gone.id, { email: reviewer.email }).expect(201)).body.data;
    await http.delete(`/v1/designs/${gone.id}`).set(as(owner)).expect((res) => expect([200, 204]).toContain(res.status));
    await open(reviewer, b.id).expect(404);
    await open(reviewer, a.id).expect(200);
    await db.query("DELETE FROM users WHERE id = $1", [owner.id]);
    expect((await db.query("SELECT count(*)::int AS n FROM review_grants WHERE id = $1", [a.id]))[0].n).toBe(0);
  });

  it("never lets the database hold a self-grant or two active grants for one revision", async () => {
    const owner = await register("Db Owner");
    const reviewer = await withRole("Db Reviewer", "reviewer");
    const design = await newDesign(owner);
    const insert = (reviewerId: string) =>
      db.query("INSERT INTO review_grants(design_id, owner_id, reviewer_id, revision, report, created_at) VALUES ($1,$2,$3,1,'{}',now())", [design.id, owner.id, reviewerId]);
    await expect(insert(owner.id)).rejects.toThrow();
    await insert(reviewer.id);
    await expect(insert(reviewer.id)).rejects.toThrow();
  });

  it("answers Reviewer reads with no-store, and publishes the new operations identically to the canonical contract", async () => {
    const owner = await register("Cal Contract");
    const reviewer = await withRole("Cleo Reviewer", "reviewer");
    const design = await newDesign(owner);
    const grant = (await share(owner, design.id, { email: reviewer.email }).expect(201)).body.data;
    expect((await inbox(reviewer).expect(200)).headers["cache-control"]).toMatch(/no-store/);
    expect((await open(reviewer, grant.id).expect(200)).headers["cache-control"]).toMatch(/no-store/);
    const live = (await http.get("/docs-json").expect(200)).body;
    const canonical = phase3OpenApi().paths as Record<string, unknown>;
    for (const path of ["/v1/designs/{id}/reviews", "/v1/designs/{id}/reviews/{grantId}/revoke", "/v1/reviews/shared-with-me", "/v1/reviews/{id}"]) {
      expect(canonical[path]).toBeDefined();
      expect(live.paths[path]).toEqual(canonical[path]);
    }
  });
});
