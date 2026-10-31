import { test, expect, type Page } from "@playwright/test";
import { ROUTES, resolveRoute, crumbsFor } from "../../src/lib/routes";
import { SYSTEM_STATES } from "../../src/lib/system-states";

const apiBase = process.env.SF_API_URL ?? "http://localhost:5001/v1";
const password = "Frontend-Audit-123!";
const devStates = process.env.SF_DEV_STATES === "1";
const samplePath = (path: string, designId = "frontend-audit") => path
  .replace(":topic", "p95").replace(":section", "profile")
  .replace(":token", "frontend-audit-share")
  .replace(":id", path.startsWith("/challenges") ? "flash-sale" : designId)
  .replace(":tab", path.startsWith("/evaluation") ? "simulator" : "results");

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}
async function logout(page: Page) {
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Log out", exact: true }).click();
  await expect(page.getByRole("button", { name: "Account menu", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.cookie.includes("sf_session="))).toBe(false);
}
async function register(page: Page, email: string) {
  await page.getByLabel("Name", { exact: true }).fill("Frontend Audit");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.locator("#reg-terms").check();
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();
}

test("36 registry routes, auth forms, palette, drawers, themes, tab restores and logout", async ({ page, context }, testInfo) => {
  const email = `web-${Date.now()}-${testInfo.project.name}@example.test`;
  const unexpected: string[] = [];
  page.on("pageerror", error => unexpected.push(error.message));
  const consoleErrors: string[] = [];
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
  const scheme = testInfo.project.use.colorScheme as "light" | "dark";

  await test.step("protected return-to, empty forms, signup and login/register links", async () => {
    await page.goto("/new/template?audit=1");
    await expect(page).toHaveURL(/\/login\?next=/);
    await page.locator("form").getByRole("button", { name: "Log in", exact: true }).click();
    await expect(page.locator("#login-email")).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#login-pw")).toHaveAttribute("aria-invalid", "true");
    await page.locator(".auth-form").getByRole("link", { name: "Sign up", exact: true }).click();
    await expect(page).toHaveURL(/\/register\?next=/);
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    for (const id of ["reg-name", "reg-email", "reg-pw", "reg-terms"]) await expect(page.locator(`#${id}`)).toHaveAttribute("aria-invalid", "true");
    await page.locator(".auth-form").getByRole("link", { name: "Log in", exact: true }).click();
    await expect(page).toHaveURL(/\/login\?next=/);
    await page.locator(".auth-form").getByRole("link", { name: "Sign up", exact: true }).click();
    await register(page, email);
    await expect(page).toHaveURL(/\/new\/template\?audit=1$/);
  });

  await test.step("all 36 registered patterns resolve with correct document titles and no overflow", async () => {
    await page.goto("/new/template");
    await page.getByRole("button", { name: "Use Single-server MVP", exact: true }).click();
    await expect(page.getByLabel("Replicas (1–200)")).toBeVisible();
    const ownedDesignId = new URL(page.url()).pathname.split("/")[2];
    expect(ROUTES).toHaveLength(36);
    for (const route of ROUTES) {
      await test.step(route.path, async () => {
        const path = samplePath(route.path, ownedDesignId);
        const navigable = ["learn-topic", "challenge", "evaluation", "settings"].includes(route.id) || (!route.path.includes(":") && !route.redirectTo);
        if (navigable) {
          await page.keyboard.press("Control+k");
          const title = resolveRoute(path).title;
          await page.getByRole("combobox", { name: "Command palette", exact: true }).fill(title);
          await page.getByRole("option").filter({ has: page.getByText(title, { exact: true }) }).last().click();
        } else {
          await page.goto(path);
        }
        if (route.redirectTo) await expect(page).toHaveURL(new RegExp(route.redirectTo(resolveRoute(path).params) + "$"));
        const expected = resolveRoute(route.redirectTo ? route.redirectTo(resolveRoute(path).params) : path);
        await expect(page).toHaveTitle(`${expected.title} · StressForge`);
        await expect(page.locator("main h1")).toBeVisible();
        if (!["login", "register"].includes(expected.route.id)) {
          const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
          await expect(crumbs).toBeVisible();
          expect((await crumbs.locator(":scope > span").allTextContents()).map(text => text.trim())).toEqual(crumbsFor(expected).map(crumb => crumb.label));
          await expect(crumbs.locator('[aria-current="page"]')).toHaveText(crumbsFor(expected).at(-1)!.label);
        }
        await expect(page.getByRole("heading", { name: /checking your session/i })).toHaveCount(0);
        await expect(page.locator("html")).toHaveAttribute("data-theme", scheme);
        await noOverflow(page);
      });
    }
    expect(consoleErrors).toEqual([]);
    expect(unexpected).toEqual([]);
  });

  await page.goto("/dashboard");
  await expect(page.getByTestId("me-card")).toContainText(email);
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toHaveText("Dashboard");
  await test.step("palette keyboard focus, action navigation, Help and AI close paths", async () => {
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("combobox", { name: "Command palette", exact: true })).toBeFocused();
    await page.getByRole("combobox", { name: "Command palette", exact: true }).fill("New design");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/new$/);
    await page.goto("/dashboard");
    for (const [opener, closer, initial] of [["Help for this screen", "Close help", "Close help"], ["AI assistant", "Close assistant", "Message the assistant"]]) {
      for (const closeWith of ["Escape", "button"]) {
        const trigger = page.getByRole("button", { name: opener, exact: true });
        await trigger.click();
        await expect(page.getByLabel(initial, { exact: true })).toBeFocused();
        if (opener === "AI assistant") {
          await expect(page.getByRole("complementary", { name: "AI assistant" }).getByText("Scripted mock", { exact: true })).toBeVisible();
          await page.getByLabel("Message the assistant", { exact: true }).fill("Explain p95");
          await page.getByRole("button", { name: "Send", exact: true }).click();
          await expect(page.locator(".ai-msg.assistant")).toBeVisible();
        }
        if (closeWith === "Escape") await page.keyboard.press("Escape");
        else await page.getByRole("button", { name: closer, exact: true }).click();
        await expect(trigger).toBeFocused();
      }
    }
  });
  await test.step("shortcuts and local feedback normal controls", async () => {
    await page.locator("#main").focus();
    await page.keyboard.press("?");
    await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
    await page.keyboard.press("Escape");
    const feedbackTrigger = page.getByRole("button", { name: "Send feedback", exact: true });
    await feedbackTrigger.click();
    const feedback = page.getByRole("dialog", { name: "Send feedback" });
    await feedback.getByRole("button", { name: "Something broke", exact: true }).click();
    await expect(feedback.getByRole("button", { name: "Something broke", exact: true })).toHaveAttribute("aria-pressed", "true");
    await feedback.getByLabel("What happened, or what would help?", { exact: true }).fill("Disposable browser audit feedback. Nothing should be sent.");
    await feedback.getByRole("button", { name: "Send feedback", exact: true }).click();
    await expect(feedback).toHaveCount(0);
    await expect(page.getByText("Thanks. Feedback is not stored yet, so nothing was sent.", { exact: true })).toBeVisible();
    await expect(feedbackTrigger).toBeFocused();
  });
  await test.step("Light/Dark/System persistence, OS changes, and palette System action", async () => {
    const selector = page.getByRole("combobox", { name: "Color theme" });
    for (const theme of ["light", "dark", "system"]) {
      await selector.selectOption(theme);
      await page.reload({waitUntil:"domcontentloaded"});
      // Settle rotating-cookie restoration before the next reload can abort it.
      await expect(page.getByTestId("me-card")).toContainText(email);
      await expect(selector).toHaveValue(theme);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme === "system" ? scheme : theme);
      expect(await page.evaluate(() => localStorage.getItem("sf-theme"))).toBe(theme);
    }
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await selector.selectOption("dark");
    await page.keyboard.press("Control+k");
    await page.getByRole("combobox", { name: "Command palette", exact: true }).fill("Use system theme");
    await page.keyboard.press("Enter");
    await expect(selector).toHaveValue("system");
    await page.emulateMedia({ colorScheme: scheme });
  });
  await test.step("concurrent tabs restore through the real rotating refresh cookie", async () => {
    const a = await context.newPage(); const b = await context.newPage();
    const statuses: number[] = [];
    for (const tab of [a, b]) tab.on("response", res => { if (res.url().endsWith("/auth/refresh")) statuses.push(res.status()); });
    await Promise.all([a.goto("/dashboard"), b.goto("/dashboard")]);
    for (const tab of [a, b]) {
      await expect(tab.getByTestId("me-card")).toContainText(email);
      expect(await tab.evaluate(() => Object.keys(localStorage).some(key => /token|session/i.test(key)))).toBe(false);
      expect(await tab.evaluate(() => Object.keys(sessionStorage).length)).toBe(0);
    }
    expect(statuses).toEqual([200, 200]);
    await a.close(); await b.close();
  });
  await test.step("logout, real login and preserved return-to", async () => {
    await logout(page);
    await page.goto("/login?next=%2Fnew%2Ftemplate%3Faudit%3D1");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.locator("form").getByRole("button", { name: "Log in", exact: true }).click();
    await expect(page).toHaveURL(/\/new\/template\?audit=1$/);
    await logout(page);
  });
  expect(unexpected).toEqual([]);
});

test("API error screens focus headings, refresh 429 preserves session and Try again recovers", async ({ page }, testInfo) => {
  const email = `errors-${Date.now()}-${testInfo.project.name}@example.test`;
  await page.goto("/register"); await register(page, email);
  await expect(page.getByTestId("me-card")).toBeVisible();
  for (const [status, code] of [[404, "NOT_FOUND"], [403, "FORBIDDEN"], [500, "INTERNAL"]] as const) {
    await page.route(`${apiBase}/auth/me`, route => route.fulfill({ status, json: { error: { code, message: "Audit injected failure" } } }));
    await page.reload();
    await expect(page.locator(".sys-title")).toBeFocused();
    await expect(page.locator(".sys-code")).toContainText(`HTTP ${status}`);
    await noOverflow(page);
    await page.unroute(`${apiBase}/auth/me`);
    await page.reload();
    await expect(page.getByTestId("me-card")).toBeVisible();
  }
  await page.route(`${apiBase}/auth/refresh`, route => route.fulfill({ status: 429, json: { error: { code: "RATE_LIMITED", message: "Wait" } } }));
  await page.reload();
  await expect(page.locator(".sys-title")).toBeFocused();
  await expect(page.locator(".sys-code")).toContainText("HTTP 429");
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  expect(await page.evaluate(() => document.cookie.includes("sf_session="))).toBe(true);
  await page.unroute(`${apiBase}/auth/refresh`);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByTestId("me-card")).toContainText(email);
  await page.route(`${apiBase}/auth/me`, route => route.fulfill({ status: 401, json: { error: { code: "SESSION_EXPIRED", message: "Expired" } } }));
  await page.reload();
  await expect(page.getByRole("alertdialog", { name: "Your session expired" })).toBeVisible();
  await expect(page.locator("#sess-pw")).toBeFocused();
  await page.unroute(`${apiBase}/auth/me`);
  await page.locator("#sess-pw").fill(password);
  await page.getByRole("button", { name: "Log in again", exact: true }).click();
  await expect(page.getByTestId("me-card")).toContainText(email);
  const unhandled: string[] = [];
  page.on("pageerror", error => unhandled.push(error.message));
  await page.route(`${apiBase}/auth/logout`, route => route.fulfill({ status: 503, json: { error: { code: "UNAVAILABLE", message: "Retry later" } } }));
  await logout(page);
  await expect(page.getByText("Signed out on this device. Server sign-out failed; the server session may still be active.", { exact: true })).toBeVisible();
  await page.unroute(`${apiBase}/auth/logout`);
  await expect(page.getByRole("button", { name: "Retry server sign-out", exact: true })).toHaveCount(0);
  expect(unhandled).toEqual([]);
  // The warning makes no server-revocation claim and cannot target a future session.

});

test("all ten developer demo states render and recover @dev", async ({ page }) => {
  test.skip(!devStates, "Run against next dev with SF_DEV_STATES=1; demo controls are excluded from production.");
  // Demo controls are UI-only: leaving the anonymous session demo must not depend on API uptime.
  await page.route(`${apiBase}/auth/logout`, route => route.fulfill({ status: 204 }));
  await page.goto("/login");
  // Prove a client handler is active before sending a window shortcut on a cold dev load.
  await page.locator("form").getByRole("button", {name:"Log in",exact:true}).click();
  await expect(page.locator("#login-email")).toHaveAttribute("aria-invalid","true");
  for (const state of SYSTEM_STATES) {
    await test.step(state.id, async () => {
      await page.keyboard.press("Control+Shift+d");
      await page.getByRole("menuitem", { name: `${state.label} ${state.code}`, exact: true }).click();
      if (state.id === "session") {
        await expect(page.getByRole("alertdialog", { name: "Your session expired" })).toBeVisible();
        await page.getByRole("button", { name: "Use another account", exact: true }).click();
      } else {
        await expect(page.locator(".sys-title")).toBeFocused();
        await expect(page.locator(".sys-code")).toContainText(state.code);
        if (state.id === "aiinvalid") {
          await page.getByRole("button", { name: "Show the raw output", exact: true }).click();
          await expect(page.locator("pre.codeblock")).toBeVisible();
        }
        await noOverflow(page);
        await page.getByRole("button", { name: "Leave this demo state", exact: true }).click();
      }
      await expect(page.locator(".sys-title")).toHaveCount(0);
    });
  }
});
