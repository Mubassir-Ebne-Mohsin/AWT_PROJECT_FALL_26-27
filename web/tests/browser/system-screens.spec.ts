import { test, expect, type Page } from "@playwright/test";
const api = process.env.SF_API_URL ?? "http://localhost:5001/v1";
const PASSWORD = "System-Screens-2026!";

/** Click the visible menu link to a page: in the top bar on a wide screen, or in the menu on a narrow one. */
async function menuLink(page: Page, href: string) {
  const visible = page.locator(`a[href="${href}"]:visible`);
  if ((await visible.count()) === 0) await page.getByRole("button", { name: "Open navigation" }).click();
  await page.locator(`a[href="${href}"]:visible`).first().click();
}

// An error screen belongs to the page that raised it. These journeys check that it tells the truth (who is signed in, which page),
// never names a design it does not know, and goes away when the person navigates, so it can no longer cover the login form.
async function signUp(page: Page, tag: string) {
  const email = `sys-${Date.now()}-${tag}@example.test`.toLowerCase();
  await page.goto("/register");
  await page.getByLabel("Name", { exact: true }).fill("Sys " + tag);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.locator("#reg-terms").check();
  const reply = page.waitForResponse((r) => r.url() === api + "/auth/register");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  expect((await reply).status()).toBe(201);
  await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();
  return email;
}
/** Another account owns a design: made with plain fetch so this browser keeps its own session. */
async function otherAccountsDesign() {
  const email = `sys-owner-${Date.now()}@example.test`;
  const reg = await fetch(api + "/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD, displayName: "Owner" }) });
  expect(reg.status).toBe(201);
  const token = ((await reg.json()) as { data: { accessToken: string } }).data.accessToken;
  const templates = ((await (await fetch(api + "/templates", { headers: { authorization: "Bearer " + token } })).json()) as { data: Array<{ id: string; name: string; blurb: string; graph: unknown; traffic: unknown }> }).data;
  const t = templates.find((x) => x.id === "mvp")!;
  const made = await fetch(api + "/designs", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + token },
    body: JSON.stringify({ schemaVersion: 1, name: "Owner private design", description: t.blurb, source: "template", templateId: t.id, graph: t.graph, traffic: t.traffic }),
  });
  expect(made.status).toBe(201);
  return ((await made.json()) as { data: { id: string } }).data.id;
}

test.describe("Error screens", () => {
  test("opening someone else's design says who you are and which page, names no design, and has a way out", async ({ page }) => {
    const id = await otherAccountsDesign();
    const email = await signUp(page, "viewer");
    const refused = page.waitForResponse((r) => r.url() === api + "/designs/" + id && r.status() === 403);
    await page.goto(`/designs/${id}/edit`);
    await refused;
    await expect(page.locator(".sys-code")).toContainText("HTTP 403");
    await expect(page.locator(".sys-title")).toHaveText("You do not have access to this.");
    await expect(page.getByTestId("forbidden-body")).toContainText(`You are signed in as ${email}`);
    await expect(page.getByTestId("forbidden-page")).toHaveText(`/designs/${id}/edit`);
    const text = await page.locator("main").innerText();
    expect(text).not.toMatch(/Legacy billing|Owner private design|logged in as a guest/);
    // The way out works and the screen is gone. Leaving must not ask the server about the design again: closing the screen too early put
    // the old page back for a moment, which requested the design again, got the same 403 and opened the screen again.
    const again: string[] = [];
    page.on("request", (r) => r.url() === `${api}/designs/${id}` && again.push(r.url()));
    await page.getByRole("link", { name: "Back to your designs" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await page.waitForTimeout(1500);
    expect(again, "no second request for the design after leaving").toEqual([]);
    await expect(page.locator(".sys-title")).toHaveCount(0);
  });

  test("Go back returns to the previous page and clears the screen", async ({ page }) => {
    const id = await otherAccountsDesign();
    await signUp(page, "back");
    await page.goto("/dashboard");
    await page.goto(`/designs/${id}/edit`);
    await expect(page.locator(".sys-code")).toContainText("HTTP 403");
    await page.getByRole("button", { name: "Go back", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator(".sys-title")).toHaveCount(0);
  });

  for (const status of [403, 404, 500] as const) {
    test(`an HTTP ${status} screen goes away when you move to another page`, async ({ page }) => {
      await signUp(page, "nav" + status);
      // No reload: the dashboard request is made to fail, then the dashboard is opened from the menu, so the error comes from a normal
      // page change and the test does not depend on the sign-in surviving a reload.
      await menuLink(page, "/templates");
      await expect(page).toHaveURL(/\/templates/);
      const code = { 403: "FORBIDDEN", 404: "NOT_FOUND", 500: "INTERNAL" }[status];
      await page.route(`${api}/dashboard`, (route) => route.fulfill({ status, json: { error: { code, message: "Injected failure" } } }));
      await menuLink(page, "/dashboard");
      await expect(page.locator(".sys-code")).toContainText(`HTTP ${status}`);
      await page.unroute(`${api}/dashboard`);
      // A menu link: the screen must not stay on top of the page it leads to.
      await menuLink(page, "/templates");
      await expect(page).toHaveURL(/\/templates/);
      await expect(page.locator(".sys-title")).toHaveCount(0);
      await expect(page.getByRole("heading", { name: /Templates/i }).first()).toBeVisible();
    });
  }

  test("logging out from an error screen leaves a usable page, not the error over the login form", async ({ page }) => {
    const id = await otherAccountsDesign();
    await signUp(page, "logout");
    await page.goto(`/designs/${id}/edit`);
    await expect(page.locator(".sys-code")).toContainText("HTTP 403");
    await page.getByRole("button", { name: "Account menu", exact: true }).click();
    await page.getByRole("menuitem", { name: "Log out", exact: true }).click();
    await expect(page.getByRole("button", { name: "Account menu", exact: true })).toHaveCount(0);
    await page.goto("/login");
    await expect(page.locator(".sys-title")).toHaveCount(0);
    await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  });

  test("Waking up is not dismissed by navigation, because it recovers by itself", async ({ page }) => {
    await signUp(page, "wake");
    await page.goto("/dashboard");
    await page.route(`${api}/auth/me`, (route) => route.abort());
    await page.route(`${api}/health`, (route) => route.abort());
    await page.reload();
    await expect(page.locator(".sys-title")).toBeVisible({ timeout: 20_000 });
    await menuLink(page, "/templates").catch(() => undefined);
    await expect(page.locator(".sys-title")).toBeVisible();
    await page.unroute(`${api}/auth/me`);
    await page.unroute(`${api}/health`);
  });
});
