import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
const api = process.env.SF_API_URL ?? "http://localhost:5001/v1";
const PASSWORD = "Dash-Admin-2026!";

// There is deliberately no website path to a first Admin, so these journeys promote their own throwaway account in Postgres
// through the test container named in the environment (SF_PG_CONTAINER, SF_PG_USER, SF_PG_DB).
const pg = { container: process.env.SF_PG_CONTAINER, user: process.env.SF_PG_USER, db: process.env.SF_PG_DB };
const canPromote = !!(pg.container && pg.user && pg.db);
const sql = (statement: string) => execFileSync("docker", ["exec", pg.container!, "psql", "-U", pg.user!, "-d", pg.db!, "-v", "ON_ERROR_STOP=1", "-c", statement], { stdio: "pipe" });
const promote = (email: string) => sql(`INSERT INTO user_roles(user_id, role, granted_by, granted_at) SELECT id, 'admin', NULL, now() FROM users WHERE email = '${email}' ON CONFLICT DO NOTHING`);
const demote = (email: string) => sql(`DELETE FROM user_roles WHERE role = 'admin' AND user_id IN (SELECT id FROM users WHERE email = '${email}')`);

async function signUp(page: Page, tag: string) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const email = "dash-" + Date.now() + "-" + tag + "@example.test";
  await page.goto("/register");
  await page.getByLabel("Name", { exact: true }).fill("Dash " + tag);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.locator("#reg-terms").check();
  // The auth routes allow 10 requests a minute; when many sign-ups come in a row, wait it out instead of failing.
  let token = "";
  for (let attempt = 0; attempt < 4 && !token; attempt++) {
    const reply = page.waitForResponse((r) => r.url() === api + "/auth/register");
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    const res = await reply;
    if (res.status() === 201) token = (await res.json()).data.accessToken as string;
    else if (res.status() === 429) await page.waitForTimeout(20_000);
    else throw new Error("Register answered HTTP " + res.status());
  }
  expect(token).not.toBe("");
  await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();
  return { errors, email, token };
}
/** Plain fetch, not page.request: the page's cookie jar must keep the Admin's refresh cookie. */
async function registerViaApi(tag: string) {
  const email = "dash-" + Date.now() + "-" + tag + "@example.test";
  const res = await fetch(api + "/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD, displayName: "Dash " + tag }) });
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 20_000));
    return registerViaApi(tag);
  }
  expect(res.status).toBe(201);
  return email;
}
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const accounts = async (page: Page) => Number((await page.getByTestId("card-signups-value").getAttribute("title"))!.replace(/,/g, ""));
const status = (page: Page) => page.getByTestId("dash-status");

/** A signed-in Admin on the dashboard. The role is granted in Postgres, then the page is reloaded so it is read fresh. */
async function adminOnDashboard(page: Page, tag: string) {
  const who = await signUp(page, tag);
  promote(who.email);
  await page.goto("/admin/dashboard");
  await expect(page.getByTestId("admin-dashboard")).toBeVisible();
  await expect(status(page)).toHaveText(/Live/);
  await expect(page.getByTestId("dash-board")).toBeVisible();
  return who;
}

test.describe("Admin live dashboard", () => {
  test("a plain account sees a denial, never the numbers, and the server refuses it too", async ({ page }) => {
    const { errors, token } = await signUp(page, "plain");
    await page.goto("/admin/dashboard");
    await expect(page.getByTestId("role-gate-denied")).toBeVisible();
    await expect(page.getByTestId("dash-board")).toHaveCount(0);
    await expect(page).toHaveTitle("Admin: Live dashboard · StressForge");
    expect((await page.request.get(api + "/admin/metrics", { headers: { Authorization: "Bearer " + token } })).status()).toBe(403);
    expect(errors).toEqual([]);
  });

  test("an Admin sees real numbers that match the server, with a table behind every chart", async ({ page }) => {
    test.skip(!canPromote, "Set SF_PG_CONTAINER, SF_PG_USER and SF_PG_DB to run the Admin journeys.");
    const { errors, token } = await adminOnDashboard(page, "numbers");
    const server = (await (await page.request.get(api + "/admin/metrics", { headers: { Authorization: "Bearer " + token } })).json()).data;
    expect(await accounts(page)).toBeGreaterThanOrEqual(1);
    expect(Math.abs((await accounts(page)) - server.totals.users)).toBeLessThanOrEqual(3);
    await expect(page.getByTestId("card-signups")).toContainText(/\+\d+ in 24 h/);
    await expect(page.getByTestId("dash-alerts")).toBeVisible();
    await expect(page.getByTestId("panel-queue")).toBeVisible();
    await expect(page.getByTestId("panel-ai-usage")).toContainText("allowed");
    await expect(page.getByTestId("system")).toContainText("Database");
    // Every chart is also a table with 24 hourly rows.
    const first = page.getByTestId("card-signups");
    await first.getByText("Show as table").click();
    await expect(first.locator("tbody tr")).toHaveCount(24);
    await expect(first.getByRole("img")).toHaveAttribute("aria-label", /Accounts: \d+ in the last 24 hours/);
    expect(await noOverflow(page)).toBe(true);
    expect(errors).toEqual([]);
  });

  test("a new registration appears on its own within a few polls, with no reload", async ({ page }) => {
    test.skip(!canPromote, "Set SF_PG_CONTAINER, SF_PG_USER and SF_PG_DB to run the Admin journeys.");
    await adminOnDashboard(page, "live");
    const before = await accounts(page);
    await registerViaApi("newcomer");
    await expect.poll(() => accounts(page), { timeout: 20_000, intervals: [500] }).toBeGreaterThanOrEqual(before + 1);
  });

  test("Pause freezes the numbers and Resume brings them up to date", async ({ page }) => {
    test.skip(!canPromote, "Set SF_PG_CONTAINER, SF_PG_USER and SF_PG_DB to run the Admin journeys.");
    await adminOnDashboard(page, "pause");
    await page.getByTestId("dash-pause").click();
    await expect(status(page)).toHaveText(/Paused/);
    await expect(page.getByTestId("dash-detail")).toContainText("not changing");
    const frozen = await accounts(page);
    await registerViaApi("whilepaused");
    let requests = 0;
    page.on("request", (r) => r.url().endsWith("/admin/metrics") && (requests += 1));
    await page.waitForTimeout(8000);
    expect(requests).toBe(0);
    expect(await accounts(page)).toBe(frozen);
    await page.getByTestId("dash-pause").click();
    await expect(status(page)).toHaveText(/Live/);
    await expect.poll(() => accounts(page), { timeout: 15_000 }).toBeGreaterThanOrEqual(frozen + 1);
  });

  test("when the server stops answering it says Reconnecting, keeps the old numbers, and recovers by itself", async ({ page }) => {
    test.skip(!canPromote, "Set SF_PG_CONTAINER, SF_PG_USER and SF_PG_DB to run the Admin journeys.");
    await adminOnDashboard(page, "down");
    const kept = await accounts(page);
    await page.route("**/admin/metrics", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "UNAVAILABLE", message: "down" } }) }));
    await expect(status(page)).toHaveText(/Reconnecting/, { timeout: 15_000 });
    await expect(page.getByTestId("dash-detail")).toContainText("Showing numbers from");
    await expect(page.getByTestId("dash-board")).toBeVisible();
    expect(await accounts(page)).toBe(kept);
    // It never opens a full-page error screen over the dashboard.
    await expect(page.getByTestId("dash-pause")).toBeVisible();
    await page.unroute("**/admin/metrics");
    await page.getByRole("button", { name: "Try now" }).click();
    await expect(status(page)).toHaveText(/Live/);
  });

  test("after a minute of silence the numbers are called out of date", async ({ page }) => {
    test.skip(!canPromote, "Set SF_PG_CONTAINER, SF_PG_USER and SF_PG_DB to run the Admin journeys.");
    await page.clock.install();
    await adminOnDashboard(page, "stale");
    await page.route("**/admin/metrics", (route) => route.abort());
    await page.clock.fastForward(8000);
    await expect(status(page)).toHaveText(/Reconnecting/);
    await page.clock.fastForward(70_000);
    await expect(status(page)).toHaveText(/Out of date/);
    await expect(page.getByTestId("dash-detail")).toContainText("may be wrong");
  });

  test("a background tab stops asking, and asks again as soon as it is shown", async ({ page }) => {
    test.skip(!canPromote, "Set SF_PG_CONTAINER, SF_PG_USER and SF_PG_DB to run the Admin journeys.");
    await adminOnDashboard(page, "hidden");
    const setHidden = (hidden: boolean) =>
      page.evaluate((h) => {
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (h ? "hidden" : "visible") });
        document.dispatchEvent(new Event("visibilitychange"));
      }, hidden);
    await setHidden(true);
    await expect(status(page)).toHaveText(/Paused/);
    await expect(page.getByTestId("dash-detail")).toContainText("background");
    let requests = 0;
    page.on("request", (r) => r.url().endsWith("/admin/metrics") && (requests += 1));
    await page.waitForTimeout(7000);
    expect(requests).toBe(0);
    await setHidden(false);
    await expect(status(page)).toHaveText(/Live/);
    await expect.poll(() => requests, { timeout: 8000 }).toBeGreaterThanOrEqual(1);
  });

  test("taking the Admin role away stops the dashboard on its next update", async ({ page }) => {
    test.skip(!canPromote, "Set SF_PG_CONTAINER, SF_PG_USER and SF_PG_DB to run the Admin journeys.");
    const { email } = await adminOnDashboard(page, "revoked");
    demote(email);
    await expect(page.getByTestId("dash-denied")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("dash-denied")).toContainText("Your Admin access was removed");
  });

  test("alerts show their level and a sentence, and the page carries no personal data", async ({ page }) => {
    test.skip(!canPromote, "Set SF_PG_CONTAINER, SF_PG_USER and SF_PG_DB to run the Admin journeys.");
    const { email } = await signUp(page, "alerts");
    promote(email);
    await page.route("**/admin/metrics", async (route) => {
      const res = await route.fetch();
      const body = await res.json();
      body.data.alerts = [
        { key: "cache_down", level: "warning" },
        { key: "queue_backlog", level: "critical" },
      ];
      await route.fulfill({ response: res, json: body });
    });
    await page.goto("/admin/dashboard");
    const list = page.getByTestId("dash-alerts").getByRole("listitem");
    await expect(list).toHaveCount(2);
    await expect(list.first()).toContainText("Critical");
    await expect(list.first()).toContainText("waiting longer than they should");
    await expect(list.nth(1)).toContainText("Warning");
    const text = await page.locator("main").innerText();
    expect(text).not.toContain(email);
    expect(text).not.toContain("example.test");
  });

  test("the new panels are on the page: where designs break, and what happened to the AI calls", async ({ page }) => {
    test.skip(!canPromote, "Set SF_PG_CONTAINER, SF_PG_USER and SF_PG_DB to run the Admin journeys.");
    await page.route("**/admin/metrics", async (route) => {
      const res = await route.fetch();
      const body = await res.json();
      body.data.runs.bottlenecks.db = 7;
      body.data.runs.bottlenecks.cache = 2;
      body.data.ai.byOutcome = { completed: 5, rate_limited: 2, invalid_output: 1, unavailable: 0, cancelled: 0, other: 0 };
      await route.fulfill({ response: res, json: body });
    });
    const { email } = await signUp(page, "panels");
    promote(email);
    await page.goto("/admin/dashboard");
    const breaks = page.getByTestId("panel-bottlenecks");
    await expect(breaks).toContainText("Database");
    await expect(breaks.getByTestId("bar-Database")).toContainText("7");
    await expect(breaks.getByTestId("bar-Cache")).toContainText("2");
    await expect(breaks.getByTestId("bar-Workers")).toHaveCount(0);
    const outcomes = page.getByTestId("ai-usage");
    await expect(outcomes.getByTestId("bar-Held back by a limit")).toContainText("2");
    await expect(outcomes.getByTestId("bar-Model answer rejected")).toContainText("1");
  });

  test("the wall display shows big numbers, changes its lower panel every ten seconds, and is for Admins only", async ({ page }) => {
    test.skip(!canPromote, "Set SF_PG_CONTAINER, SF_PG_USER and SF_PG_DB to run the Admin journeys.");
    await page.clock.install();
    await adminOnDashboard(page, "wall");
    await page.getByTestId("dash-wall-link").click();
    await expect(page.getByTestId("admin-wall")).toBeVisible();
    await expect(page.getByTestId("wall-status")).toHaveText(/Live/);
    await expect(page.getByTestId("wall-users")).toContainText(/\d/);
    await expect(page.getByTestId("wall-panel")).toHaveAttribute("data-panel", "Run queue");
    await page.clock.fastForward(10_500);
    await expect(page.getByTestId("wall-panel")).toHaveAttribute("data-panel", "AI use");
    await page.clock.fastForward(10_000);
    await expect(page.getByTestId("wall-panel")).toHaveAttribute("data-panel", "How far people get");
    await page.clock.fastForward(10_000);
    await expect(page.getByTestId("wall-panel")).toHaveAttribute("data-panel", "Run queue");
    expect(await noOverflow(page)).toBe(true);
  });

  test("the wall display stands still when the person asks for reduced motion", async ({ page }) => {
    test.skip(!canPromote, "Set SF_PG_CONTAINER, SF_PG_USER and SF_PG_DB to run the Admin journeys.");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.clock.install();
    await adminOnDashboard(page, "calm");
    await page.goto("/admin/dashboard/wall");
    await expect(page.getByTestId("admin-wall")).toBeVisible();
    await page.clock.fastForward(35_000);
    await expect(page.getByTestId("wall-panel")).toHaveAttribute("data-panel", "Run queue");
    await expect(page.getByTestId("wall-panel")).toContainText("reduced motion");
  });

  test("a plain account is denied the wall display too", async ({ page }) => {
    await signUp(page, "wallplain");
    await page.goto("/admin/dashboard/wall");
    await expect(page.getByTestId("role-gate-denied")).toBeVisible();
    await expect(page.getByTestId("admin-wall")).toHaveCount(0);
  });

  for (const width of [320, 390]) {
    test(`fits a ${width}px phone without sideways scrolling`, async ({ page }) => {
      test.skip(!canPromote, "Set SF_PG_CONTAINER, SF_PG_USER and SF_PG_DB to run the Admin journeys.");
      await page.setViewportSize({ width, height: 800 });
      await adminOnDashboard(page, "phone" + width);
      expect(await noOverflow(page)).toBe(true);
      await page.getByTestId("card-signups").getByText("Show as table").click();
      expect(await noOverflow(page)).toBe(true);
    });
  }
});


test("Support metrics show real aggregate counts, update after a report and reveal no report details", async ({ page }, info) => {
  test.skip(!canPromote, "Set the disposable PostgreSQL environment to run the Admin journey.");
  const { errors, token } = await adminOnDashboard(page, "support-" + info.project.name);
  const headers = { Authorization: "Bearer " + token };
  const before = (await (await page.request.get(api + "/admin/metrics", { headers })).json()).data.support;
  const canary = "Private support canary " + Date.now();
  const report = await page.request.post(api + "/support/reports", { headers, data: { category: "bug", title: canary, body: "A private issue which must not appear on the dashboard." } });
  expect(report.status()).toBe(201);
  const panel = page.getByTestId("panel-support");
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("support-unresolved")).toHaveText((before.unresolved + 1).toLocaleString("en-US"), { timeout: 20000 });
  await page.getByTestId("dash-pause").click();
  const current = (await (await page.request.get(api + "/admin/metrics", { headers })).json()).data.support;
  await expect(panel.getByTestId("support-total")).toHaveText(current.total.toLocaleString("en-US"));
  if (current.medianFirstResponseMs === null) await expect(panel.getByTestId("support-first-response")).toHaveText("No replies yet");
  else await expect(panel.getByTestId("support-first-response")).not.toHaveText("No replies yet");
  await panel.screenshot({ path: info.outputPath("support-metrics.png") });
  await expect(panel.getByTestId("support-response-samples")).toContainText(`${current.responded.toLocaleString("en-US")} of ${current.total.toLocaleString("en-US")} reports`);
  await expect(panel.getByRole("table", { name: "Reports by category" }).getByRole("row", { name: /^Bug or error/ })).toContainText(current.byCategory.bug.toLocaleString("en-US"));
  await expect(page.getByTestId("panel-roles").getByTestId("bar-Support")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(canary);
  expect((await page.request.get(api + "/support/inbox", { headers })).status()).toBe(403);
  for (const width of [1024, 390, 320]) { await page.setViewportSize({ width, height: 900 }); expect(await noOverflow(page), `${width}px`).toBe(true); }
  expect(errors).toEqual([]);
});
