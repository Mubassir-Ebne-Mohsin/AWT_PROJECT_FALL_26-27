import { test, expect, type Browser, type Page, type TestInfo } from "@playwright/test";
import { readFileSync } from "node:fs";

const api = process.env.SF_API_URL ?? "http://localhost:5001/v1";
const PASSWORD = "P4-Settings-2026!";
const NEXT = "P4-Changed-2027!";
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

async function signUp(page: Page, name: string, tag: string) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const email = "p4-" + Date.now() + "-" + tag + "@example.test";
  await page.goto("/register");
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.locator("#reg-terms").check();
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();
  return { errors, email };
}
async function logInInNewContext(browser: Browser, info: TestInfo, email: string, password: string) {
  const use = info.project.use;
  const context = await browser.newContext({ baseURL: use.baseURL, viewport: use.viewport ?? undefined, colorScheme: use.colorScheme ?? undefined });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.locator("form").getByRole("button", { name: "Log in", exact: true }).click();
  return { page, context };
}

test("P4 a guest is sent to log in, and every section has one heading, a marked link and no overflow at any width", async ({ page }, info) => {
  await page.goto("/settings/security");
  await expect(page).toHaveURL(/\/login\?next=/);
  const { errors } = await signUp(page, "Settings Tour", info.project.name + "-tour");
  const sections: Array<[string, string]> = [["profile", "Profile"], ["security", "Security"], ["ai-usage", "AI usage"], ["data", "Data"], ["appearance", "Appearance"], ["preferences", "Preferences"]];
  for (const [id, label] of sections) {
    await page.goto(`/settings/${id}`);
    await expect(page).toHaveTitle(`Settings: ${label} · StressForge`);
    await expect(page.locator("main h1")).toHaveText("Settings");
    await expect(page.getByTestId("settings-heading")).toHaveText(label);
    await expect(page.getByRole("navigation", { name: "Settings sections" }).locator("[aria-current='page']")).toHaveText(label);
    for (const width of [320, 390, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await noOverflow(page), `${id} at ${width}px`).toBe(true);
    }
  }
  expect(errors).toEqual([]);
});

test("P4 profile: a new display name is saved, shown at once in the app, and survives a reload", async ({ page }, info) => {
  const { errors } = await signUp(page, "Old Name", info.project.name + "-profile");
  await page.goto("/settings/profile");
  const input = page.getByLabel("Display name", { exact: true });
  const save = page.getByRole("button", { name: "Save name", exact: true });
  await expect(save).toBeDisabled();
  await input.fill("   ");
  await input.press("Enter");
  await expect(page.getByText("Enter a display name")).toBeVisible();
  await input.fill("  New <b>Name</b>  ");
  await save.click();
  await expect(page.getByTestId("profile-notice")).toContainText("Saved");
  await page.reload();
  await expect(page.getByLabel("Display name", { exact: true })).toHaveValue("New <b>Name</b>");
  await expect(page.locator("main b")).toHaveCount(0);
  await page.goto("/dashboard");
  await expect(page.getByTestId("me-card")).toContainText("New <b>Name</b>");
  expect(errors).toEqual([]);
});

test("P4 security: changing the password signs out the other device at once, keeps this one, and only the new password works", async ({ page, browser }, info) => {
  const { errors, email } = await signUp(page, "Pw Changer", info.project.name + "-pw");
  const other = await logInInNewContext(browser, info, email, PASSWORD);
  await expect(other.page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();

  await page.goto("/settings/security");
  await page.getByRole("button", { name: "Change password", exact: true }).click();
  await expect(page.getByText("Enter your current password")).toBeVisible();
  await page.getByLabel("Current password", { exact: true }).fill("wrong-pass-1");
  await page.getByLabel("New password", { exact: true }).fill(NEXT);
  await page.getByLabel("Confirm new password", { exact: true }).fill(NEXT);
  await page.getByRole("button", { name: "Change password", exact: true }).click();
  await expect(page.getByText("Incorrect password")).toBeVisible();
  await page.getByLabel("Current password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Change password", exact: true }).click();
  await expect(page.getByTestId("password-notice")).toContainText("every other device has been signed out");

  // This device: still signed in, before and after a reload, and the app still works.
  await page.reload();
  await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();
  await page.goto("/dashboard");
  await expect(page.getByTestId("me-card")).toContainText(email);

  // The other device: its next request finds the session gone.
  await other.page.goto("/dashboard");
  await expect(other.page).toHaveURL(/\/login/);
  await other.context.close();

  // Only the new password logs in.
  const old = await logInInNewContext(browser, info, email, PASSWORD);
  await expect(old.page.getByText(/don.t match an account/)).toBeVisible();
  await old.context.close();
  const fresh = await logInInNewContext(browser, info, email, NEXT);
  await expect(fresh.page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();
  await fresh.context.close();
  expect(errors).toEqual([]);
});

test("P4 data: the export downloads a real file with this account's data and no secrets", async ({ page }, info) => {
  const { errors, email } = await signUp(page, "Exporter", info.project.name + "-export");
  await page.goto("/settings/data");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download my data", exact: true }).click()]);
  expect(download.suggestedFilename()).toMatch(/^stressforge-export-\d{4}-\d{2}-\d{2}\.json$/);
  const file = JSON.parse(readFileSync((await download.path())!, "utf8"));
  expect(file.format).toBe("stressforge-export-v1");
  expect(file.account.email).toBe(email);
  expect(file.account.displayName).toBe("Exporter");
  expect(JSON.stringify(file)).not.toMatch(/passwordHash|\$argon2|token_hash/);
  await expect(page.getByTestId("export-notice")).toContainText("Saved 0 designs");
  expect(errors).toEqual([]);
});

test("P4 data: deleting needs the right password and the exact words, then the account is gone for good", async ({ page, browser }, info) => {
  const { errors, email } = await signUp(page, "Delete Me", info.project.name + "-delete");
  await page.goto("/settings/data");
  await expect(page.getByRole("form", { name: "Confirm account deletion" })).toHaveCount(0);
  await page.getByTestId("delete-open").click();
  const confirm = page.getByTestId("delete-confirm");
  await expect(confirm).toBeDisabled();
  await page.getByLabel("Your password", { exact: true }).fill("wrong-pass-1");
  await page.getByLabel('Type "delete my account" to confirm', { exact: true }).fill("delete my account");
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(page.getByText("Incorrect password")).toBeVisible();
  await expect(page.getByTestId("delete-notice")).toContainText("Nothing was deleted");
  await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();

  await page.getByLabel("Your password", { exact: true }).fill(PASSWORD);
  await confirm.click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: "Account menu", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.cookie.includes("sf_session="))).toBe(false);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);

  const again = await logInInNewContext(browser, info, email, PASSWORD);
  await expect(again.page.getByText(/don.t match an account/)).toBeVisible();
  await again.context.close();
  // The email is free to use again.
  const res = await fetch(api + "/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD, displayName: "Back Again" }) });
  expect(res.status).toBe(201);
  expect(errors).toEqual([]);
});

test("P4 appearance: the chosen theme applies at once and is still there after a reload", async ({ page }, info) => {
  const { errors } = await signUp(page, "Theme Picker", info.project.name + "-theme");
  await page.goto("/settings/appearance");
  const dark = page.getByRole("radio", { name: "Dark", exact: true });
  const light = page.getByRole("radio", { name: "Light", exact: true });
  await dark.check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.getByRole("radio", { name: "Dark", exact: true })).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await light.check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.goto("/settings/ai-usage");
  await expect(page.getByTestId("ai-off")).toContainText("switched off");
  expect(errors).toEqual([]);
});
