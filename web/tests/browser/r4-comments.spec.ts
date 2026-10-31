import { test, expect, type Browser, type Page, type TestInfo } from "@playwright/test";
import { execFileSync } from "node:child_process";
const api = process.env.SF_API_URL ?? "http://localhost:5001/v1";
const PASSWORD = "R4-Comments-2026!";

// There is deliberately no website path to the Reviewer role. These journeys give their own throwaway account the
// role straight in Postgres, through the test container named in the environment (SF_PG_CONTAINER, SF_PG_USER, SF_PG_DB).
const pg = { container: process.env.SF_PG_CONTAINER, user: process.env.SF_PG_USER, db: process.env.SF_PG_DB };
const canPromote = !!(pg.container && pg.user && pg.db);
function makeReviewer(email: string) {
  execFileSync("docker", ["exec", pg.container!, "psql", "-U", pg.user!, "-d", pg.db!, "-v", "ON_ERROR_STOP=1", "-c", `INSERT INTO user_roles(user_id, role, granted_by, granted_at) SELECT id, 'reviewer', NULL, now() FROM users WHERE email = '${email}'`], { stdio: "pipe" });
}
const json = { "content-type": "application/json" };

async function signUp(page: Page, name: string, tag: string) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const email = "r4-" + Date.now() + "-" + tag + "@example.test";
  await page.goto("/register");
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.locator("#reg-terms").check();
  const reg = page.waitForResponse((r) => r.url() === api + "/auth/register" && r.status() === 201);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  const token = (await (await reg).json()).data.accessToken as string;
  await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();
  return { errors, email, token };
}
// Plain fetch, not page.request: the browser's request context shares cookies with the page, and registering here
// would replace the signed-in owner's refresh cookie with the new account's.
async function registerViaApi(name: string, tag: string) {
  const email = "r4-" + Date.now() + "-" + tag + "@example.test";
  const res = await fetch(api + "/auth/register", { method: "POST", headers: json, body: JSON.stringify({ email, password: PASSWORD, displayName: name }) });
  expect(res.status).toBe(201);
  return { email };
}
async function seedDesignAndShare(ownerToken: string, designName: string, reviewerEmail: string) {
  const headers = { ...json, Authorization: "Bearer " + ownerToken };
  const templates = ((await (await fetch(api + "/templates", { headers })).json()) as { data: Array<{ id: string; graph: unknown; traffic: unknown }> }).data;
  const t = templates[0];
  const made = await fetch(api + "/designs", { method: "POST", headers, body: JSON.stringify({ schemaVersion: 1, name: designName, description: "Feedback journey design", source: "template", templateId: t.id, graph: t.graph, traffic: t.traffic }) });
  expect(made.status).toBe(201);
  const designId = ((await made.json()) as { data: { id: string } }).data.id;
  const shared = await fetch(`${api}/designs/${designId}/reviews`, { method: "POST", headers, body: JSON.stringify({ email: reviewerEmail }) });
  expect(shared.status).toBe(201);
  return { designId, grantId: ((await shared.json()) as { data: { id: string } }).data.id };
}
/** A separate signed-in person: a brand-new browser context shares nothing with the owner's session. */
async function reviewerSession(browser: Browser, info: TestInfo, email: string) {
  const use = info.project.use;
  const context = await browser.newContext({ baseURL: use.baseURL, viewport: use.viewport ?? undefined, colorScheme: use.colorScheme ?? undefined });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.locator("form").getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();
  return { page, context, errors };
}
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

test.describe("R4 Reviewer feedback", () => {
  test("a Reviewer writes, edits and deletes comments, the owner reads and replies, and stopping ends the Reviewer's access but not the owner's", async ({ page, browser }, info) => {
    test.skip(!canPromote, "Set SF_PG_CONTAINER, SF_PG_USER and SF_PG_DB to run the Reviewer journeys.");
    const owner = await signUp(page, "R4 Owner", "owner");
    const reviewer = await registerViaApi("R4 Reviewer", "reviewer");
    makeReviewer(reviewer.email);
    const { designId, grantId } = await seedDesignAndShare(owner.token, "R4 Payments service", reviewer.email);

    // The Reviewer opens the review and writes.
    const person = await reviewerSession(browser, info, reviewer.email);
    await person.page.goto(`/reviews/${grantId}`);
    const panel = person.page.getByTestId("reviewer-comments");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("No feedback yet");
    const box = panel.getByRole("textbox", { name: "Add a comment" });
    await box.fill("The database is a single point of failure.");
    await expect(person.page.getByTestId("comment-counter")).toContainText("/ 2000");
    await panel.getByRole("button", { name: "Post comment", exact: true }).click();
    const first = panel.getByTestId("comment").first();
    await expect(first).toContainText("The database is a single point of failure.");
    await expect(first).toContainText("You");

    await first.getByRole("button", { name: "Edit", exact: true }).click();
    await first.getByLabel("Edit your comment").fill("The database is a single point of failure at peak.");
    await first.getByRole("button", { name: "Save", exact: true }).click();
    await expect(first).toContainText("at peak.");
    await expect(first).toContainText("edited");

    await box.fill("<b>Markup test</b> <img src=x onerror=alert(1)> and a second point.");
    await panel.getByRole("button", { name: "Post comment", exact: true }).click();
    const second = panel.getByTestId("comment").nth(1);
    await expect(second).toContainText("<b>Markup test</b>"); // shown literally, as text
    await expect(panel.locator("img, b")).toHaveCount(0);

    await second.getByRole("button", { name: "Delete", exact: true }).click();
    await second.getByRole("button", { name: "Confirm delete", exact: true }).click();
    await expect(second).toContainText("Comment removed");
    await expect(second.getByRole("button")).toHaveCount(0);
    expect(await noOverflow(person.page)).toBe(true);

    // The owner reads the thread and replies.
    await page.goto(`/designs/${designId}/share`);
    const feedback = page.getByTestId("owner-feedback");
    await expect(feedback).toContainText("Feedback (2)");
    await feedback.getByRole("button", { name: "Feedback from R4 Reviewer" }).click();
    const comments = feedback.getByTestId("owner-comment");
    await expect(comments).toHaveCount(2);
    await expect(comments.first()).toContainText("at peak.");
    await expect(comments.first()).toContainText("R4 Reviewer");
    await expect(comments.nth(1)).toContainText("Comment removed");
    await expect(comments.nth(1).getByRole("button", { name: "Reply", exact: true })).toHaveCount(0);
    expect(await feedback.innerText()).not.toContain("@"); // display names only in the thread
    await comments.first().getByRole("button", { name: "Reply", exact: true }).click();
    await comments.first().getByLabel("Your reply").fill("We plan to add a replica next month.");
    await comments.first().getByRole("button", { name: "Send reply", exact: true }).click();
    await expect(feedback.getByTestId("owner-reply")).toContainText("We plan to add a replica next month.");
    await expect(page.getByTestId("reply-notice")).toContainText("Reply sent");

    // The Reviewer sees the reply.
    await person.page.reload();
    await expect(person.page.getByTestId("reply")).toContainText("R4 Owner (owner)");
    await expect(person.page.getByTestId("reply")).toContainText("We plan to add a replica next month.");

    // The owner stops sharing: the Reviewer loses everything, the owner keeps the thread and replies close.
    await page.getByRole("button", { name: "Stop sharing with R4 Reviewer" }).click();
    await page.getByRole("button", { name: "Confirm stop", exact: true }).click();
    await expect(page.getByTestId("review-notice")).toContainText("can no longer open it");
    await person.page.reload();
    await expect(person.page.getByTestId("review-gone")).toBeVisible();
    await expect(person.page.getByTestId("reviewer-comments")).toHaveCount(0);
    const stillOpen = page.getByTestId("owner-feedback");
    if ((await stillOpen.getByTestId("owner-comment").count()) === 0) await stillOpen.getByRole("button", { name: "Feedback from R4 Reviewer" }).click();
    await expect(stillOpen.getByTestId("owner-comment").first()).toContainText("at peak.");
    await expect(stillOpen.getByTestId("replies-closed")).toBeVisible();
    await expect(stillOpen.getByRole("button", { name: "Reply", exact: true })).toHaveCount(0);
    expect(person.errors).toEqual([]);
    expect(owner.errors).toEqual([]);
    await person.context.close();
  });

  test("a plain account cannot reach the comment API, and the server refuses it", async ({ page }) => {
    const plain = await signUp(page, "R4 Plain", "plain");
    const res = await fetch(api + "/reviews/00000000-0000-4000-8000-000000000000/comments", { headers: { Authorization: "Bearer " + plain.token } });
    expect(res.status).toBe(403);
    await page.goto("/reviews/00000000-0000-4000-8000-000000000000");
    await expect(page.getByTestId("role-gate-denied")).toBeVisible();
    await expect(page.getByTestId("reviewer-comments")).toHaveCount(0);
    expect(plain.errors).toEqual([]);
  });
});
