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
import { reviewCommentSchema } from "@/common/contracts/phase3/reviews.schema";
import { AccountRolesService, OPERATOR } from "@/modules/roles/account-roles.service";

jest.setTimeout(240000);
const PASSWORD = "R4-comments-2026!";
type Account = { id: string; email: string; token: string };

describe("R4 Reviewer feedback (isolated Postgres, no AI involved)", () => {
  let app: NestExpressApplication, db: DataSource, http: ReturnType<typeof request>, roles: AccountRolesService;
  let owner: Account, otherOwner: Account, reviewer: Account, otherReviewer: Account, plain: Account, admin: Account;
  const as = (a: Account) => ({ Authorization: "Bearer " + a.token });

  async function register(name: string): Promise<Account> {
    const email = `${name.replace(/\s+/g, "-").toLowerCase()}-${randomUUID()}@example.test`;
    const res = await http.post("/v1/auth/register").send({ email, password: PASSWORD, displayName: name }).expect(201);
    return { id: res.body.data.user.id, email, token: res.body.data.accessToken };
  }
  async function withRole(name: string, role: "reviewer" | "admin") {
    const a = await register(name);
    await roles.grant(OPERATOR, a.id, { role });
    return a;
  }
  async function newDesign(who: Account) {
    const t = getTemplates().find((x) => x.id === "mvp")!;
    return (await http.post("/v1/designs").set(as(who)).send({ schemaVersion: 1, name: t.name, description: t.blurb, source: "template", templateId: t.id, graph: t.graph, traffic: t.traffic }).expect(201)).body.data;
  }
  /** A fresh design and an active grant to `reviewer`, so every test starts with an empty thread. */
  async function newGrant(to: Account = reviewer) {
    const design = await newDesign(owner);
    const grant = (await http.post(`/v1/designs/${design.id}/reviews`).set(as(owner)).send({ email: to.email }).expect(201)).body.data;
    return { designId: design.id as string, grantId: grant.id as string };
  }
  const say = (who: Account, grantId: string, text: unknown) => http.post(`/v1/reviews/${grantId}/comments`).set(as(who)).send({ text } as object);
  const thread = (who: Account, grantId: string) => http.get(`/v1/reviews/${grantId}/comments`).set(as(who));
  const ownerThread = (who: Account, designId: string, grantId: string) => http.get(`/v1/designs/${designId}/reviews/${grantId}/comments`).set(as(who));
  const reply = (who: Account, designId: string, grantId: string, parentId: string, text: unknown) => http.post(`/v1/designs/${designId}/reviews/${grantId}/comments`).set(as(who)).send({ parentId, text } as object);
  const edit = (who: Account, grantId: string, commentId: string, text: unknown) => http.patch(`/v1/reviews/${grantId}/comments/${commentId}`).set(as(who)).send({ text } as object);
  const remove = (who: Account, grantId: string, commentId: string) => http.delete(`/v1/reviews/${grantId}/comments/${commentId}`).set(as(who));
  const stop = (designId: string, grantId: string) => http.post(`/v1/designs/${designId}/reviews/${grantId}/revoke`).set(as(owner)).expect(200);

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
    owner = await register("Olivia Owner");
    otherOwner = await register("Omar Otherowner");
    reviewer = await withRole("Rhea Reviewer", "reviewer");
    otherReviewer = await withRole("Rob Otherreviewer", "reviewer");
    plain = await register("Pat Plain");
    admin = await withRole("Ada Admin", "admin");
  });
  afterAll(async () => {
    await app?.close();
  });

  it("lets the Reviewer comment, shows the thread to both sides by display name only, and trims and cleans the text", async () => {
    const { designId, grantId } = await newGrant();
    const first = reviewCommentSchema.parse((await say(reviewer, grantId, "  The cache looks too small.\r\nWhat happens at peak?  ").expect(201)).body.data);
    expect(first).toMatchObject({ parentId: null, author: { role: "reviewer", displayName: "Rhea Reviewer" }, text: "The cache looks too small.\nWhat happens at peak?", removed: false, editedAt: null });
    await say(reviewer, grantId, "Second point: no queue in front of the worker.").expect(201);

    const mine = (await thread(reviewer, grantId).expect(200)).body.data;
    const theirs = (await ownerThread(owner, designId, grantId).expect(200)).body.data;
    expect(mine).toHaveLength(2);
    expect(theirs).toEqual(mine);
    expect(mine.map((c: { text: string }) => c.text)[0]).toContain("too small");
    const everything = JSON.stringify([mine, theirs]);
    expect(everything).not.toContain(reviewer.email);
    expect(everything).not.toContain(owner.email);
    expect(everything).not.toContain(reviewer.id);
    expect(everything).not.toContain(owner.id);
    expect(Object.keys(mine[0]).sort()).toEqual(["author", "createdAt", "editedAt", "id", "parentId", "removed", "text"]);
  });

  it("lets the owner reply to a Reviewer's comment, and only to a Reviewer's live top-level comment", async () => {
    const { designId, grantId } = await newGrant();
    const c = (await say(reviewer, grantId, "Question about the database.").expect(201)).body.data;
    const r = reviewCommentSchema.parse((await reply(owner, designId, grantId, c.id, "It is a single primary for now.").expect(201)).body.data);
    expect(r).toMatchObject({ parentId: c.id, author: { role: "owner", displayName: "Olivia Owner" }, removed: false });
    // Not to a reply, not to an unknown comment, not to another review's comment, not to a removed one.
    await reply(owner, designId, grantId, r.id, "Replying to myself.").expect(404);
    await reply(owner, designId, grantId, randomUUID(), "Nobody there.").expect(404);
    const elsewhere = await newGrant();
    const foreign = (await say(reviewer, elsewhere.grantId, "A comment on a different review.").expect(201)).body.data;
    await reply(owner, designId, grantId, foreign.id, "Wrong thread.").expect(404);
    const gone = (await say(reviewer, grantId, "Will be removed.").expect(201)).body.data;
    await remove(reviewer, grantId, gone.id).expect(200);
    await reply(owner, designId, grantId, gone.id, "To a removed comment.").expect(404);
    expect((await ownerThread(owner, designId, grantId).expect(200)).body.data).toHaveLength(3);
  });

  it("lets a Reviewer edit only their own live comment, and marks it edited", async () => {
    const { designId, grantId } = await newGrant();
    const c = (await say(reviewer, grantId, "First draft.").expect(201)).body.data;
    const r = (await reply(owner, designId, grantId, c.id, "Thanks.").expect(201)).body.data;
    const changed = reviewCommentSchema.parse((await edit(reviewer, grantId, c.id, "Better wording.").expect(200)).body.data);
    expect(changed.text).toBe("Better wording.");
    expect(changed.editedAt).not.toBeNull();
    expect(changed.createdAt).toBe(c.createdAt);
    await edit(reviewer, grantId, r.id, "Rewriting the owner's reply.").expect(404); // not theirs
    await edit(otherReviewer, grantId, c.id, "Someone else's edit.").expect(404);
    await edit(reviewer, grantId, randomUUID(), "Nothing here.").expect(404);
    await remove(reviewer, grantId, c.id).expect(200);
    await edit(reviewer, grantId, c.id, "Editing after removal.").expect(404);
    const stored = (await ownerThread(owner, designId, grantId).expect(200)).body.data;
    expect(stored.find((x: { id: string }) => x.id === r.id).text).toBe("Thanks."); // the owner's words were never touched
  });

  it("removes a Reviewer's comment by erasing its text and keeping a placeholder, idempotently, with the replies intact", async () => {
    const { designId, grantId } = await newGrant();
    const c = (await say(reviewer, grantId, "Please remove this later.").expect(201)).body.data;
    const r = (await reply(owner, designId, grantId, c.id, "Understood.").expect(201)).body.data;
    const first = (await remove(reviewer, grantId, c.id).expect(200)).body.data;
    expect(first).toMatchObject({ id: c.id, removed: true, text: null });
    const second = (await remove(reviewer, grantId, c.id).expect(200)).body.data;
    expect(second).toEqual(first);
    await remove(reviewer, grantId, r.id).expect(404); // cannot remove the owner's reply
    await remove(otherReviewer, grantId, c.id).expect(404);
    const seen = (await ownerThread(owner, designId, grantId).expect(200)).body.data;
    expect(seen).toHaveLength(2);
    expect(seen.find((x: { id: string }) => x.id === c.id)).toMatchObject({ removed: true, text: null });
    expect(JSON.stringify(seen)).not.toContain("Please remove this later.");
    expect((await db.query("SELECT text, removed_at FROM review_comments WHERE id = $1", [c.id]))[0].text).toBe(""); // gone from the database too
    expect(seen.find((x: { id: string }) => x.id === r.id).parentId).toBe(c.id);
  });

  it("never lets the owner change or remove what a Reviewer wrote", async () => {
    const { grantId } = await newGrant();
    const c = (await say(reviewer, grantId, "My honest opinion.").expect(201)).body.data;
    expect((await edit(owner, grantId, c.id, "Edited by the owner.")).status).toBe(403);
    expect((await remove(owner, grantId, c.id)).status).toBe(403);
    expect((await db.query("SELECT text, edited_at, removed_at FROM review_comments WHERE id = $1", [c.id]))[0]).toMatchObject({ text: "My honest opinion.", edited_at: null, removed_at: null });
  });

  it("holds comments to 1 to 2,000 characters of plain text, with nothing extra", async () => {
    const { grantId } = await newGrant();
    await say(reviewer, grantId, "x".repeat(2000)).expect(201);
    for (const bad of ["x".repeat(2001), "", "   \n\t  ", "bad\u0000text", 42, null, { a: 1 }]) await say(reviewer, grantId, bad).expect(422);
    await http.post(`/v1/reviews/${grantId}/comments`).set(as(reviewer)).send({ text: "ok", extra: true }).expect(422);
    await http.post(`/v1/reviews/${grantId}/comments`).set(as(reviewer)).send({}).expect(422);
    expect((await thread(reviewer, grantId).expect(200)).body.data).toHaveLength(1);
    const c = (await thread(reviewer, grantId)).body.data[0];
    await edit(reviewer, grantId, c.id, "y".repeat(2001)).expect(422);
    await edit(reviewer, grantId, c.id, "").expect(422);
    expect((await thread(reviewer, grantId)).body.data[0].text).toBe("x".repeat(2000));
  });

  it("stores markup as plain text and returns it unchanged, never as HTML", async () => {
    const { designId, grantId } = await newGrant();
    const payload = `<script>alert("x")</script> <img src=x onerror=alert(1)> [link](javascript:alert(1)) & "quotes" 'single' é 日本語 😀`;
    const c = (await say(reviewer, grantId, payload).expect(201)).body.data;
    expect(c.text).toBe(payload);
    const res = await ownerThread(owner, designId, grantId).expect(200);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body.data[0].text).toBe(payload);
  });

  it("stops at 50 comments per review, counts owner replies and removed comments, and cannot be passed by parallel requests", async () => {
    const { designId, grantId } = await newGrant();
    const first = (await say(reviewer, grantId, "Comment 1").expect(201)).body.data;
    for (let i = 2; i <= 40; i++) await say(reviewer, grantId, `Comment ${i}`).expect(201);
    for (let i = 0; i < 5; i++) await reply(owner, designId, grantId, first.id, `Reply ${i}`).expect(201);
    // 45 so far; fire 15 at once: exactly 5 can still be saved.
    const burst = await Promise.all(Array.from({ length: 15 }, (_, i) => say(reviewer, grantId, `Burst ${i}`)));
    expect(burst.filter((r) => r.status === 201)).toHaveLength(5);
    const refused = burst.find((r) => r.status === 422)!;
    expect(refused.body.error.details).toMatchObject({ reason: "COMMENT_LIMIT_REACHED", limit: 50 });
    expect((await db.query("SELECT count(*)::int AS n FROM review_comments WHERE grant_id = $1", [grantId]))[0].n).toBe(50);
    await reply(owner, designId, grantId, first.id, "One more reply").expect(422);
    await remove(reviewer, grantId, first.id).expect(200);
    await say(reviewer, grantId, "After removal").expect(422); // a removed comment still counts, so churn cannot free room
    expect((await ownerThread(owner, designId, grantId).expect(200)).body.data).toHaveLength(50);
  });

  it("ends the Reviewer's access when the owner stops sharing, while the owner keeps the whole thread", async () => {
    const { designId, grantId } = await newGrant();
    const c = (await say(reviewer, grantId, "Feedback to keep.").expect(201)).body.data;
    await reply(owner, designId, grantId, c.id, "Thanks, noted.").expect(201);
    await stop(designId, grantId);
    await thread(reviewer, grantId).expect(404);
    await say(reviewer, grantId, "Too late.").expect(404);
    await edit(reviewer, grantId, c.id, "Edit too late.").expect(404);
    await remove(reviewer, grantId, c.id).expect(404);
    const kept = (await ownerThread(owner, designId, grantId).expect(200)).body.data;
    expect(kept).toHaveLength(2);
    expect(kept[0]).toMatchObject({ text: "Feedback to keep.", author: { role: "reviewer", displayName: "Rhea Reviewer" } });
    const closed = await reply(owner, designId, grantId, c.id, "A reply after stopping.").expect(409);
    expect(closed.body.error.details).toMatchObject({ reason: "REVIEW_STOPPED" });
    // Sharing again is a new review with a new, empty thread; the old thread stays with the owner.
    const again = (await http.post(`/v1/designs/${designId}/reviews`).set(as(owner)).send({ email: reviewer.email }).expect(201)).body.data;
    expect((await thread(reviewer, again.id).expect(200)).body.data).toEqual([]);
    expect((await ownerThread(owner, designId, grantId).expect(200)).body.data).toHaveLength(2);
  });

  it("lets only the Reviewer role write, only the grantee, and only the design's owner read or reply as owner", async () => {
    const { designId, grantId } = await newGrant();
    const c = (await say(reviewer, grantId, "A comment.").expect(201)).body.data;
    await http.get(`/v1/reviews/${grantId}/comments`).expect(401);
    await http.post(`/v1/reviews/${grantId}/comments`).send({ text: "x" }).expect(401);
    await http.get(`/v1/designs/${designId}/reviews/${grantId}/comments`).expect(401);
    for (const refused of [plain, admin, owner]) {
      expect((await thread(refused, grantId)).status).toBe(403);
      expect((await say(refused, grantId, "Nope.")).status).toBe(403);
    }
    await thread(otherReviewer, grantId).expect(404);
    await say(otherReviewer, grantId, "Not mine.").expect(404);
    await ownerThread(otherOwner, designId, grantId).expect(403);
    await reply(otherOwner, designId, grantId, c.id, "Not my design.").expect(403);
    await ownerThread(reviewer, designId, grantId).expect(403); // the Reviewer is not the owner
    const elsewhere = await newDesign(owner);
    await ownerThread(owner, elsewhere.id, grantId).expect(404); // right owner, wrong design for this review
    await reply(owner, elsewhere.id, grantId, c.id, "Wrong design.").expect(404);
    await ownerThread(owner, designId, randomUUID()).expect(404);
    expect((await ownerThread(admin, designId, grantId)).status).toBe(403); // an Admin never reads feedback
    expect((await thread(reviewer, grantId).expect(200)).body.data).toHaveLength(1);
  });

  it("ends a Reviewer's comment access at once when the Reviewer role is removed, with the same token", async () => {
    const lone = await withRole("Rina Lone", "reviewer");
    const { grantId } = await newGrant(lone);
    await say(lone, grantId, "Before.").expect(201);
    await roles.revoke(OPERATOR, lone.id, "reviewer");
    await thread(lone, grantId).expect(403);
    await say(lone, grantId, "After.").expect(403);
    await roles.grant(OPERATOR, lone.id, { role: "reviewer" });
    expect((await thread(lone, grantId).expect(200)).body.data).toHaveLength(1);
  });

  it("shows the owner how many comments each review holds, and deletes the thread with the review", async () => {
    const { designId, grantId } = await newGrant();
    const c = (await say(reviewer, grantId, "One.").expect(201)).body.data;
    await reply(owner, designId, grantId, c.id, "Two.").expect(201);
    const row = (await http.get(`/v1/designs/${designId}/reviews`).set(as(owner)).expect(200)).body.data.find((g: { id: string }) => g.id === grantId);
    expect(row.commentCount).toBe(2);
    expect((await stop(designId, grantId)).body.data.commentCount).toBe(2);
    await http.delete(`/v1/designs/${designId}`).set(as(owner)).expect((res) => expect([200, 204]).toContain(res.status));
    expect((await db.query("SELECT count(*)::int AS n FROM review_comments WHERE grant_id = $1", [grantId]))[0].n).toBe(0);
  });

  it("keeps the database honest: a removed comment has no text and a live one has some", async () => {
    const { grantId } = await newGrant();
    const c = (await say(reviewer, grantId, "Live.").expect(201)).body.data;
    await expect(db.query("UPDATE review_comments SET removed_at = now() WHERE id = $1", [c.id])).rejects.toThrow();
    await expect(db.query("UPDATE review_comments SET text = '' WHERE id = $1", [c.id])).rejects.toThrow();
    await expect(db.query("UPDATE review_comments SET text = $2 WHERE id = $1", [c.id, "x".repeat(2001)])).rejects.toThrow();
  });

  it("answers thread reads with no-store, and publishes the new operations identically to the canonical contract", async () => {
    const { designId, grantId } = await newGrant();
    await say(reviewer, grantId, "For the contract.").expect(201);
    expect((await thread(reviewer, grantId).expect(200)).headers["cache-control"]).toMatch(/no-store/);
    expect((await ownerThread(owner, designId, grantId).expect(200)).headers["cache-control"]).toMatch(/no-store/);
    const live = (await http.get("/docs-json").expect(200)).body;
    const canonical = phase3OpenApi().paths as Record<string, unknown>;
    for (const path of ["/v1/reviews/{id}/comments", "/v1/reviews/{id}/comments/{commentId}", "/v1/designs/{id}/reviews/{grantId}/comments"]) {
      expect(canonical[path]).toBeDefined();
      expect(live.paths[path]).toEqual(canonical[path]);
    }
  });
});
