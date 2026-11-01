import { test, expect } from "@playwright/test";

// The first breadcrumb on a public page: "Home" (landing page) for a guest, "Dashboard" for someone signed in.
test("a guest's first breadcrumb on a public page is Home, and it goes to the landing page", async ({ page }) => {
  await page.goto("/examples");
  const first = page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link").first();
  await expect(first).toHaveText("Home");
  await first.click();
  await expect(page).toHaveURL(/\/$/);
});

test("a signed-in person's first breadcrumb on a public page is Dashboard, and it goes to the dashboard", async ({ page }, info) => {
  await page.goto("/register?next=%2Fexamples");
  await page.getByLabel("Name", { exact: true }).fill("Crumb Tester");
  await page.getByLabel("Email", { exact: true }).fill("crumb-" + Date.now() + "-" + info.project.name + "@example.test");
  await page.getByLabel("Password", { exact: true }).fill("Crumb-Home-2026!");
  await page.locator("#reg-terms").check();
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page).toHaveURL(/\/examples$/);
  const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(crumbs.getByRole("link").first()).toHaveText("Dashboard");
  await expect(crumbs.getByRole("link", { name: "Home" })).toHaveCount(0);
  for (const path of ["/learn", "/evaluation/simulator"]) {
    await page.goto(path);
    await expect(crumbs.getByRole("link").first()).toHaveText("Dashboard");
  }
  await page.goto("/examples");
  await crumbs.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});
