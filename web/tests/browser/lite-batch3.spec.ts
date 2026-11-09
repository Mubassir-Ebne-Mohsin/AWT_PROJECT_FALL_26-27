import { test, expect } from "@playwright/test";

const api = process.env.SF_API_URL ?? "http://localhost:5001/v1";

test("the full stop key toggles Concept help, and unanswered questions stay local and clearable", async ({ page }) => {
  const posts: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().startsWith(api) && !r.url().includes("/auth/")) posts.push(r.url());
  });
  await page.goto("/register");
  await page.getByLabel("Name", { exact: true }).fill("Lite Batch Three");
  await page.getByLabel("Email", { exact: true }).fill(`lite3-${crypto.randomUUID()}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("Lite-Audit-2026!");
  await page.locator("#reg-terms").check();
  const register = page.waitForResponse((r) => r.url() === api + "/auth/register" && r.status() === 201);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await register;
  await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();
  await page.goto("/dashboard");
  await expect(page.getByText("Your first design starts here")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

  const drawer = page.getByRole("complementary", { name: "Concept help" });
  await page.keyboard.press(".");
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await page.keyboard.press(".");
  await expect(drawer).toBeVisible();

  const box = drawer.getByRole("textbox", { name: "Ask a concept question" });
  await box.fill("zxqv blorp wibble");
  await box.press("Enter");
  const list = drawer.getByTestId("unanswered-list");
  await expect(list).toContainText("zxqv blorp wibble");
  await expect(list).toContainText("nothing is sent");
  const stored = await page.evaluate(() => localStorage.getItem("sf.concept-help.unanswered"));
  expect(stored).toContain("zxqv blorp wibble");

  await list.getByRole("button", { name: "Clear this list", exact: true }).click();
  await expect(list).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("sf.concept-help.unanswered"))).toBeNull();
  expect(posts).toEqual([]);
});
