import { test, expect } from "@playwright/test";

const api = process.env.SF_API_URL ?? "http://localhost:5001/v1";

// Regression: hidden screen-reader text (position: absolute) inside the scrolling workspace used to stretch the outer main element,
// so scrolling it left a large blank band under clipped panels. The workspace must have one scroll area, with no blank overflow.
test("Results has no extra blank scroll area under the workspace", async ({ page }) => {
  await page.setViewportSize({ width: 1905, height: 890 });
  await page.goto("/register");
  await page.getByLabel("Name", { exact: true }).fill("Scroll Check");
  await page.getByLabel("Email", { exact: true }).fill(`scroll-${crypto.randomUUID()}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("Lite-Audit-2026!");
  await page.locator("#reg-terms").check();
  const register = page.waitForResponse((r) => r.url() === api + "/auth/register" && r.status() === 201);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await register;
  await page.goto("/new/template");
  await page.getByRole("button", { name: "Use Single-server MVP", exact: true }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/designs/") && u.pathname.endsWith("/edit"));
  const path = new URL(page.url()).pathname.replace(/\/edit$/, "");
  const accepted = page.waitForResponse((r) => r.url() === api + path + "/simulate" && [200, 202].includes(r.status()));
  await page.getByRole("button", { name: "Run test", exact: true }).click();
  await accepted;
  await expect(page.getByRole("heading", { name: "Model results", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Component inspection" })).toBeVisible();
  await page.mouse.move(900, 600);
  await page.mouse.wheel(0, 3000);
  await page.waitForTimeout(500);
  const sizes = await page.evaluate(() => {
    const main = document.querySelector("main.main") as HTMLElement;
    return { scroll: main.scrollHeight, client: main.clientHeight };
  });
  expect(sizes.scroll).toBeLessThanOrEqual(sizes.client + 1);
});
