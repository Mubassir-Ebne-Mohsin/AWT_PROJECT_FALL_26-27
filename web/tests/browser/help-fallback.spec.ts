import { test, expect } from "@playwright/test";

// The Help drawer must not call a built page "a placeholder that arrives in phase N". Only the pages that really are
// placeholders say so.
const drawer = (page: import("@playwright/test").Page) => page.getByRole("complementary", { name: "Help" });
const open = async (page: import("@playwright/test").Page) => {
  await page.getByRole("button", { name: "Help for this screen", exact: true }).click();
  await expect(drawer(page)).toBeVisible();
};

test("built pages without their own help text describe themselves and never claim to be placeholders", async ({ page }, info) => {
  await page.goto("/register?next=%2Fwelcome");
  await page.getByLabel("Name", { exact: true }).fill("Help Tester");
  await page.getByLabel("Email", { exact: true }).fill("help-" + Date.now() + "-" + info.project.name + "@example.test");
  await page.getByLabel("Password", { exact: true }).fill("Help-Drawer-2026!");
  await page.locator("#reg-terms").check();
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page).toHaveURL(/\/welcome$/);
  for (const path of ["/welcome", "/progress", "/learn", "/evaluation/simulator", "/designs", "/settings/profile", "/about"]) {
    await page.goto(path);
    await open(page);
    await expect(drawer(page).getByText("What this screen is for"), path).toBeVisible();
    await expect(drawer(page), path).not.toContainText(/arrives in phase|placeholder/i);
    await page.getByRole("button", { name: "Close help", exact: true }).click();
  }
  // A page with concept chips no longer promises concept pages "in phase 4".
  await page.goto("/dashboard");
  await open(page);
  await expect(drawer(page).getByRole("link", { name: "p95 latency" })).toBeVisible();
  await expect(drawer(page)).not.toContainText("Concept pages arrive");
});

test("a page that really is a placeholder still says so", async ({ page }, info) => {
  await page.goto("/register?next=%2Fdev%2Fai-logs");
  await page.getByLabel("Name", { exact: true }).fill("Help Placeholder");
  await page.getByLabel("Email", { exact: true }).fill("help-ph-" + Date.now() + "-" + info.project.name + "@example.test");
  await page.getByLabel("Password", { exact: true }).fill("Help-Drawer-2026!");
  await page.locator("#reg-terms").check();
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page).toHaveURL(/\/dev\/ai-logs$/);
  await open(page);
  await expect(drawer(page)).toContainText("arrives in phase 5");
  await expect(drawer(page)).toContainText("placeholder");
});
