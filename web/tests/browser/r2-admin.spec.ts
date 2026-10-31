import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
const api = process.env.SF_API_URL ?? "http://localhost:5001/v1";
const PASSWORD = "R2-Admin-2026!";

// There is deliberately no website path to a first Admin. These journeys promote their own throwaway account straight
// in Postgres, through the test container named in the environment (SF_PG_CONTAINER, SF_PG_USER, SF_PG_DB).
const pg = { container: process.env.SF_PG_CONTAINER, user: process.env.SF_PG_USER, db: process.env.SF_PG_DB };
const canPromote = !!(pg.container && pg.user && pg.db);
function promote(email: string) {
  execFileSync("docker", ["exec", pg.container!, "psql", "-U", pg.user!, "-d", pg.db!, "-v", "ON_ERROR_STOP=1", "-c", `INSERT INTO user_roles(user_id, role, granted_by, granted_at) SELECT id, 'admin', NULL, now() FROM users WHERE email = '${email}'`], { stdio: "pipe" });
}
const escaped = (text: string) => new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

async function signUp(page: Page, tag: string) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const email = "r2-" + Date.now() + "-" + tag + "@example.test";
  await page.goto("/register");
  await page.getByLabel("Name", { exact: true }).fill("R2 " + tag);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.locator("#reg-terms").check();
  const reg = page.waitForResponse((r) => r.url() === api + "/auth/register" && r.status() === 201);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  const token = (await (await reg).json()).data.accessToken as string;
  await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();
  return { errors, email, token };
}
async function registerViaApi(page: Page, tag: string) {
  const email = "r2-" + Date.now() + "-" + tag + "@example.test";
  // Plain fetch, not page.request: the browser's request context shares cookies with the page, and registering here
  // would replace the signed-in Admin's refresh cookie with the new account's.
  const res = await fetch(api + "/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD, displayName: "R2 " + tag }) });
  expect(res.status).toBe(201);
  return { email, id: ((await res.json()) as { data: { user: { id: string } } }).data.user.id };
}
const loginAs = (email: string) => fetch(api + "/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD }) });
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
async function findAccount(page: Page, email: string) {
  await page.getByLabel("Email or name").fill(email);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("button", { name: escaped(email) }).click();
  return page.getByTestId("admin-account");
}

test.describe("R2 Admin tools", () => {
  test("a plain account is shown a denial at /admin/users, never the tools, and the server refuses it too", async ({ page }) => {
    const { errors, token } = await signUp(page, "plain");
    await page.goto("/admin/users");
    await expect(page.getByTestId("role-gate-denied")).toBeVisible();
    await expect(page.getByRole("form", { name: "Find an account" })).toHaveCount(0);
    await expect(page).toHaveTitle("Admin: Accounts · StressForge");
    expect((await page.request.get(api + "/admin/audit", { headers: { Authorization: "Bearer " + token } })).status()).toBe(403);
    expect(await noOverflow(page)).toBe(true);
    expect(errors).toEqual([]);
  });

  test("an Admin finds an account, changes its roles with a confirmation, and sees it in the audit log", async ({ page }) => {
    test.skip(!canPromote, "Set SF_PG_CONTAINER, SF_PG_USER and SF_PG_DB to run the Admin journeys.");
    const { errors, email: adminEmail } = await signUp(page, "admin");
    promote(adminEmail);
    const target = await registerViaApi(page, "target");
    await page.goto("/admin/users");
    await expect(page.getByRole("form", { name: "Find an account" })).toBeVisible();
    const panel = await findAccount(page, target.email);
    await expect(panel).toContainText(target.email);
    await expect(panel.getByTestId("role-reviewer")).toContainText("not held");

    await panel.getByRole("button", { name: "Give Reviewer role" }).click();
    await expect(page.getByTestId("admin-notice")).toContainText("Reviewer role given");
    await expect(panel.getByTestId("role-reviewer")).toContainText("held");
    await expect(page.getByTestId("admin-audit")).toContainText(`gave the Reviewer role to ${target.email}`);

    await panel.getByRole("button", { name: "Remove Reviewer role" }).click();
    await expect(panel.getByTestId("role-reviewer")).toContainText("held"); // asked, not yet removed
    await panel.getByRole("button", { name: "Confirm remove Reviewer" }).click();
    await expect(page.getByTestId("admin-notice")).toContainText("Reviewer role removed");
    await expect(panel.getByTestId("role-reviewer")).toContainText("not held");
    await expect(page.getByTestId("admin-audit")).toContainText(`removed the Reviewer role from ${target.email}`);
    expect(await noOverflow(page)).toBe(true);
    expect(errors).toEqual([]);
  });

  test("an Admin suspends and restores an account: sign-in stops and then works again, and nothing is deleted", async ({ page }) => {
    test.skip(!canPromote, "Set SF_PG_CONTAINER, SF_PG_USER and SF_PG_DB to run the Admin journeys.");
    const { email: adminEmail } = await signUp(page, "suspender");
    promote(adminEmail);
    const target = await registerViaApi(page, "suspendee");
    await page.goto("/admin/users");
    const panel = await findAccount(page, target.email);

    await panel.getByRole("button", { name: "Suspend account" }).click();
    await panel.getByRole("button", { name: "Confirm suspend" }).click();
    await expect(page.getByTestId("admin-notice")).toContainText("Account suspended");
    await expect(panel).toContainText("Suspended");
    const refused = await loginAs(target.email);
    expect(refused.status).toBe(403);
    expect(((await refused.json()) as { error: { details: { reason: string } } }).error.details.reason).toBe("ACCOUNT_SUSPENDED");
    await expect(page.getByTestId("admin-audit")).toContainText(`suspended ${target.email}`);

    await panel.getByRole("button", { name: "Restore account" }).click();
    await expect(page.getByTestId("admin-notice")).toContainText("Account restored");
    await expect(panel).toContainText("Active");
    expect((await loginAs(target.email)).status).toBe(200);
    await expect(page.getByTestId("admin-audit")).toContainText(`restored ${target.email}`);
  });

  test("an Admin's own account cannot be suspended from the screen", async ({ page }) => {
    test.skip(!canPromote, "Set SF_PG_CONTAINER, SF_PG_USER and SF_PG_DB to run the Admin journeys.");
    const { email: adminEmail } = await signUp(page, "self");
    promote(adminEmail);
    await page.goto("/admin/users");
    const panel = await findAccount(page, adminEmail);
    await expect(panel).toContainText("cannot be suspended here");
    await expect(panel.getByRole("button", { name: "Suspend account" })).toHaveCount(0);
  });
});
