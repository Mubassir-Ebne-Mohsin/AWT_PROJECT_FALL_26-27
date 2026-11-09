import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const api = process.env.SF_API_URL ?? "http://localhost:5001/v1";

async function openDesign(page: Page) {
  await page.goto("/register");
  await page.getByLabel("Name", { exact: true }).fill("Lite Batch Two");
  await page.getByLabel("Email", { exact: true }).fill(`lite2-${crypto.randomUUID()}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("Lite-Audit-2026!");
  await page.locator("#reg-terms").check();
  const register = page.waitForResponse((r) => r.url() === api + "/auth/register" && r.status() === 201);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await register;
  await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();
  await page.goto("/new/template");
  await page.getByRole("button", { name: "Use Single-server MVP", exact: true }).click();
  await expect(page).toHaveURL(/\/designs\/[^/]+\/edit$/);
  return new URL(page.url()).pathname.replace(/\/edit$/, "");
}

async function runTest(page: Page, path: string) {
  const accepted = page.waitForResponse((r) => r.url() === api + path + "/simulate" && [200, 202].includes(r.status()));
  await page.getByRole("button", { name: "Run test", exact: true }).click();
  await accepted;
  await expect(page.getByRole("heading", { name: "Model results", exact: true })).toBeVisible();
}

test("definition cards, compare link, empty-tab tips and a JSON download that imports back", async ({ page }, info) => {
  const path = await openDesign(page);

  // Empty tabs show their tips.
  await page.goto(path + "/notes");
  await expect(page.getByText(/notes are included in the report/)).toBeVisible();
  await page.goto(path + "/history");
  await expect(page.getByText(/Restoring one creates a new version/)).toBeVisible();

  // Download JSON from the header: a real file, in the import format.
  await page.goto(path + "/edit");
  const download = page.waitForEvent("download");
  await page.getByTestId("ws-export-json").click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^[a-z0-9-]+\.json$/);
  const text = readFileSync(await file.path()!, "utf8");
  const doc = JSON.parse(text);
  expect(doc.schemaVersion).toBe(1);
  expect(doc.nodes.length).toBeGreaterThan(1);

  // Results: definition cards (keyboard) and the Compare link.
  await page.goto(path + "/traffic");
  await runTest(page, path);
  const term = page.getByRole("button", { name: "p95 latency", exact: true });
  await term.focus();
  await term.press("Enter");
  await expect(term).toHaveAttribute("aria-expanded", "true");
  const card = page.getByRole("note").filter({ hasText: "p95" }).first();
  await expect(card).toBeVisible();
  const box = await card.boundingBox();
  const vw = page.viewportSize()!.width;
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(vw);
  await page.screenshot({ animations: "disabled", path: info.outputPath("term-card.png") });
  await page.keyboard.press("Escape");
  await expect(term).toHaveAttribute("aria-expanded", "false");
  await expect(card).toHaveCount(0);
  await page.getByTestId("results-compare-link").click();
  await expect(page).toHaveURL(/\/history$/);

  // The downloaded file imports back through the real Import screen.
  await page.goto("/new/import");
  await page.getByRole("textbox", { name: "Design JSON" }).fill(text);
  await page.getByRole("button", { name: "Check import", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ready to import", exact: true })).toBeVisible();
});
