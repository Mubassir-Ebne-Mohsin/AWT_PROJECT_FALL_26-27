import { test, expect, type Browser, type Page, type TestInfo } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
const api = process.env.SF_API_URL ?? "http://localhost:5001/v1";
const origin = new URL(api).origin;
const PASSWORD = "R3-Review-2026!";

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
  const email = "r3-" + Date.now() + "-" + tag + "@example.test";
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
  const email = "r3-" + Date.now() + "-" + tag + "@example.test";
  const res = await fetch(api + "/auth/register", { method: "POST", headers: json, body: JSON.stringify({ email, password: PASSWORD, displayName: name }) });
  expect(res.status).toBe(201);
  return { email };
}
async function seedDesign(token: string, name: string) {
  const headers = { ...json, Authorization: "Bearer " + token };
  const templates = ((await (await fetch(api + "/templates", { headers })).json()) as { data: Array<{ id: string; graph: unknown; traffic: unknown }> }).data;
  const t = templates[0];
  const res = await fetch(api + "/designs", { method: "POST", headers, body: JSON.stringify({ schemaVersion: 1, name, description: "Review journey design", source: "template", templateId: t.id, graph: t.graph, traffic: t.traffic }) });
  expect(res.status).toBe(201);
  const design = ((await res.json()) as { data: { id: string; revision: number } }).data;
  const accepted = await fetch(`${api}/designs/${design.id}/simulate`, { method: "POST", headers, body: JSON.stringify({ expectedRevision: design.revision, requestId: randomUUID() }) });
  expect(accepted.status).toBe(202);
  const statusUrl = ((await accepted.json()) as { data: { statusUrl: string } }).data.statusUrl;
  for (let i = 0; i < 100; i++) {
    const run = ((await (await fetch(origin + statusUrl, { headers })).json()) as { data: { status: string } }).data;
    if (run.status !== "pending") break;
    await new Promise((r) => setTimeout(r, 100));
  }
  return design;
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

test.describe("R3 Review grants", () => {
  test("a plain account is shown a denial at /reviews, never the list, and the server refuses it too", async ({ page }) => {
    const { errors, token } = await signUp(page, "R3 Plain", "plain");
    await page.goto("/reviews");
    await expect(page.getByTestId("role-gate-denied")).toBeVisible();
    await expect(page.getByTestId("shared-with-me")).toHaveCount(0);
    await expect(page).toHaveTitle("Shared with me · StressForge");
    expect((await fetch(api + "/reviews/shared-with-me", { headers: { Authorization: "Bearer " + token } })).status).toBe(403);
    expect(await noOverflow(page)).toBe(true);
    expect(errors).toEqual([]);
    // No "Shared with me" shortcut for an account that cannot use it.
    await page.getByRole("button", { name: "Account menu", exact: true }).click();
    await expect(page.getByRole("menuitem", { name: /Shared with me/ })).toHaveCount(0);
  });

  test("an owner shares a revision with a Reviewer by email, the Reviewer reads it, and stopping it ends their access", async ({ page, browser }, info) => {
    test.skip(!canPromote, "Set SF_PG_CONTAINER, SF_PG_USER and SF_PG_DB to run the Reviewer journeys.");
    const owner = await signUp(page, "R3 Owner", "owner");
    const design = await seedDesign(owner.token, "R3 Checkout service");
    const reviewer = await registerViaApi("R3 Reviewer", "reviewer");
    makeReviewer(reviewer.email);

    await page.goto(`/designs/${design.id}/share`);
    const section = page.getByTestId("review-shares");
    await section.getByLabel("Reviewer's email").fill(reviewer.email);
    await section.getByRole("button", { name: "Share with Reviewer", exact: true }).click();
    await expect(page.getByTestId("review-notice")).toContainText("Shared revision 1 with R3 Reviewer");
    const row = section.getByTestId("review-grant");
    await expect(row).toContainText("R3 Reviewer");
    await expect(row).toContainText(reviewer.email);

    const person = await reviewerSession(browser, info, reviewer.email);
    await person.page.goto("/reviews");
    const item = person.page.getByTestId("shared-item");
    await expect(item).toHaveCount(1);
    await expect(item).toContainText("R3 Checkout service");
    await expect(item).toContainText("From R3 Owner");
    expect(await person.page.getByTestId("shared-with-me").innerText()).not.toContain(owner.email);
    await person.page.getByRole("link", { name: "Open R3 Checkout service" }).click();
    await expect(person.page.getByTestId("review-banner")).toContainText("Shared by R3 Owner");
    await expect(person.page.getByRole("article", { name: "Design report" })).toBeVisible();
    expect(await person.page.locator("main").innerText()).not.toContain(owner.email);
    // Read-only: nothing to press on the design itself. The only buttons are inside the feedback panel (R4).
    expect(await person.page.locator("main button").evaluateAll((els) => els.filter((el) => !el.closest("[data-testid=reviewer-comments]")).length)).toBe(0);
    expect(await noOverflow(person.page)).toBe(true);

    // The owner stops sharing; the Reviewer's very next read is refused.
    await section.getByRole("button", { name: "Stop sharing with R3 Reviewer" }).click();
    await section.getByRole("button", { name: "Confirm stop", exact: true }).click();
    await expect(page.getByTestId("review-notice")).toContainText("can no longer open it");
    await expect(row).toContainText("Stopped");
    await person.page.reload();
    await expect(person.page.getByTestId("review-gone")).toBeVisible();
    await person.page.goto("/reviews");
    await expect(person.page.getByTestId("shared-item")).toHaveCount(0);
    expect(person.errors).toEqual([]);
    expect(owner.errors).toEqual([]);
    await person.context.close();
  });

  test("sharing with an account that is not a Reviewer is refused with an explanation", async ({ page }) => {
    const owner = await signUp(page, "R3 Careful Owner", "careful");
    const design = await seedDesign(owner.token, "R3 Careful design");
    const plain = await registerViaApi("R3 Plain Person", "plainperson");
    await page.goto(`/designs/${design.id}/share`);
    const section = page.getByTestId("review-shares");
    await section.getByLabel("Reviewer's email").fill(plain.email);
    await section.getByRole("button", { name: "Share with Reviewer", exact: true }).click();
    const notice = page.getByTestId("review-notice");
    await expect(notice).toContainText("No Reviewer account matches that email");
    await expect(section.getByTestId("review-grant")).toHaveCount(0);
    await expect(section.getByLabel("Reviewer's email")).toHaveValue(plain.email);
    await section.getByLabel("Reviewer's email").fill(owner.email);
    await section.getByRole("button", { name: "Share with Reviewer", exact: true }).click();
    await expect(notice).toContainText("cannot share a design with yourself");
  });
});
