import { test, expect, type Page } from "@playwright/test";

const api = process.env.SF_API_URL ?? "http://localhost:5001/v1";
const PASSWORD = "Lite-Audit-2026!";

// The newer screens at phone width (390 px): nothing may force a sideways scroll, and floating cards stay on screen.
test.use({ viewport: { width: 390, height: 844 } });

async function noSidewaysScroll(page: Page, where: string) {
  const sizes = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
  expect(sizes.doc, `${where}: page is wider than the screen`).toBeLessThanOrEqual(sizes.win + 1);
}

test("gallery, post, publish form, Improve tab and definition cards fit a phone", async ({ page }, info) => {
  const title = "Phone check " + crypto.randomUUID().slice(0, 8);
  await page.goto("/register");
  await page.getByLabel("Name", { exact: true }).fill("Phone Tester");
  await page.getByLabel("Email", { exact: true }).fill(`phone-${crypto.randomUUID()}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.locator("#reg-terms").check();
  const registered = page.waitForResponse((r) => r.url() === api + "/auth/register" && r.status() === 201);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await registered;
  await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();

  await page.goto("/new/template");
  await page.getByRole("button", { name: "Use Single-server MVP", exact: true }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/designs/") && u.pathname.endsWith("/edit"));
  const path = new URL(page.url()).pathname.replace(/\/edit$/, "");
  await noSidewaysScroll(page, "Edit tab");
  await page.screenshot({ animations: "disabled", path: info.outputPath("phone-edit.png") });

  await page.goto(path + "/traffic");
  const rps = page.getByLabel("Average requests per second", { exact: true });
  await rps.fill("700");
  await rps.blur();
  await expect(page.getByRole("status").filter({ hasText: /^Saved ·/ })).toBeVisible();
  const accepted = page.waitForResponse((r) => r.url() === api + path + "/simulate" && [200, 202].includes(r.status()));
  await page.getByRole("button", { name: "Run test", exact: true }).click();
  const runId = (await (await accepted).json()).data.run.id as string;
  await expect(page.getByRole("heading", { name: "Model results", exact: true })).toBeVisible();
  await noSidewaysScroll(page, "Results tab");

  // A definition card opens and stays inside the screen.
  const term = page.getByRole("button", { name: "p95 latency", exact: true });
  await term.scrollIntoViewIfNeeded();
  await term.click();
  const card = page.getByRole("note").filter({ hasText: "p95" }).first();
  await expect(card).toBeVisible();
  const box = (await card.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await page.screenshot({ animations: "disabled", path: info.outputPath("phone-term-card.png") });
  await page.keyboard.press("Escape");

  // The publish form.
  await page.getByTestId("gallery-publish-open").scrollIntoViewIfNeeded();
  await page.getByTestId("gallery-publish-open").click();
  const form = page.getByRole("form", { name: "Publish to the gallery" });
  await form.getByLabel("Title").fill(title);
  await form.getByLabel("This design is mine to publish").check();
  await noSidewaysScroll(page, "Publish form");
  await form.scrollIntoViewIfNeeded();
  await page.screenshot({ animations: "disabled", path: info.outputPath("phone-publish.png") });
  await form.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByTestId("gallery-published")).toBeVisible();

  // Gallery list and post page.
  await page.goto("/gallery");
  await expect(page.getByTestId("gallery-items").getByRole("link", { name: title })).toBeVisible();
  await noSidewaysScroll(page, "Gallery list");
  await page.screenshot({ animations: "disabled", path: info.outputPath("phone-gallery.png") });
  await page.getByTestId("gallery-items").getByRole("link", { name: title }).click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await noSidewaysScroll(page, "Gallery post");
  await page.screenshot({ animations: "disabled", path: info.outputPath("phone-post.png") });

  // The Improve tab.
  await page.goto(path + "/improve?run=" + runId);
  await expect(page.getByTestId("improve-header")).toBeVisible();
  await noSidewaysScroll(page, "Improve tab");
  await page.screenshot({ animations: "disabled", path: info.outputPath("phone-improve.png") });
});
