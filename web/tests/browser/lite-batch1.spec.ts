import { test, expect, type Page } from "@playwright/test";

const api = process.env.SF_API_URL ?? "http://localhost:5001/v1";

async function openDesign(page: Page) {
  await page.goto("/register");
  await page.getByLabel("Name", { exact: true }).fill("Lite Features Audit");
  await page.getByLabel("Email", { exact: true }).fill(`lite-${crypto.randomUUID()}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("Lite-Audit-2026!");
  await page.locator("#reg-terms").check();
  const register = page.waitForResponse((r) => r.url() === api + "/auth/register" && r.status() === 201);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  const { data } = await (await register).json();
  const headers = { Authorization: "Bearer " + data.accessToken };
  await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();
  await page.goto("/new/template");
  await page.getByRole("button", { name: "Use Single-server MVP", exact: true }).click();
  await expect(page).toHaveURL(/\/designs\/[^/]+\/edit$/);
  const path = new URL(page.url()).pathname.replace(/\/edit$/, "");
  return { path, headers };
}

async function saved(page: Page) {
  await expect(page.getByRole("status").filter({ hasText: /^Saved ·/ })).toBeVisible();
}

async function run(page: Page, path: string) {
  const accepted = page.waitForResponse((r) => r.url() === api + path + "/simulate" && [200, 202].includes(r.status()));
  await page.getByRole("button", { name: "Run test", exact: true }).click();
  const { data } = await (await accepted).json();
  await expect(page).toHaveURL(new RegExp("/results\\?run=" + data.run.id + "$"));
  await expect(page.getByRole("heading", { name: "Model results", exact: true })).toBeVisible();
  return data.run.id as string;
}

test("Results opens the exact written verdict and bottleneck topics", async ({ page }, info) => {
  const modelRequests: string[] = [];
  const explainAvailable = info.project.name === "1440-dark";
  if (explainAvailable) {
    await page.route(api + "/ai/readiness", (route) => route.fulfill({
      json: { data: { enabled: true, ready: true, model: "test-only", reason: "AVAILABLE" } },
    }));
  }
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().startsWith(api + "/ai/")) modelRequests.push(r.url());
  });
  const { path } = await openDesign(page);
  await page.goto(path + "/traffic");
  const rps = page.getByLabel("Average requests per second", { exact: true });
  await rps.fill("4000");
  await rps.blur();
  await saved(page);
  await run(page, path);
  if (explainAvailable) await expect(page.getByRole("button", { name: "Explain this result", exact: true })).toBeVisible();
  const drawer = page.getByRole("complementary", { name: "Concept help" });
  for (const [label, title] of [
    ["Ask about this verdict", "Verdicts: pass, strained, fail"],
    ["Ask about this bottleneck", "How the bottleneck is chosen"],
    ["Ask about this verdict", "Verdicts: pass, strained, fail"],
  ]) {
    const trigger = page.getByRole("button", { name: label, exact: true });
    await trigger.focus();
    await trigger.press("Enter");
    await expect(drawer.getByText("Scripted mock", { exact: true })).toBeVisible();
    await expect(drawer.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await expect(drawer.getByRole("textbox", { name: "Ask a concept question" })).toBeFocused();
    if (label.includes("verdict")) await page.screenshot({ animations: "disabled", path: info.outputPath("concept-help.png") });
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
  expect(modelRequests).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test("Copy results uses the selected historical run and provides a manual fallback", async ({ page }, info) => {
  await page.addInitScript(() => {
    const state = { text: "", denied: false };
    Object.assign(window, { liteClipboard: state });
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: async (text: string) => {
        if (state.denied) throw new Error("Clipboard blocked for test");
        state.text = text;
      } },
    });
  });
  const { path, headers } = await openDesign(page);
  await page.goto(path + "/results");
  const copy = page.getByRole("button", { name: "Copy results as text", exact: true });
  await expect(copy).toHaveCount(0);
  await page.goto(path + "/traffic");
  const rps = page.getByLabel("Average requests per second", { exact: true });
  await rps.fill("4000");
  await rps.blur();
  await saved(page);
  const historical = await run(page, path);
  const recorded = await page.request.get(api + path + "/runs/" + historical, { headers });
  expect(recorded.ok()).toBe(true);
  const { data: old } = await recorded.json();
  expect(old.result.summary.verdict).toBe("fail");
  await page.getByRole("link", { name: "Traffic", exact: true }).click();
  await page.getByRole("button", { name: /^Quiet night/ }).click();
  await saved(page);
  const recent = await run(page, path);
  expect(recent).not.toBe(historical);
  await copy.click();
  const latestText = await page.evaluate(() => (window as unknown as { liteClipboard: { text: string } }).liteClipboard.text);
  expect(latestText).toContain("Verdict: pass");
  expect(latestText).not.toContain("Bottleneck:");
  await page.goto(path + "/results?run=" + historical);
  await copy.click();
  await expect(page.getByText("Results copied.", { exact: true })).toBeVisible();
  const copied = await page.evaluate(() => (window as unknown as { liteClipboard: { text: string } }).liteClipboard.text);
  expect(copied).toContain("Recorded revision " + old.designRevision + " · " + old.engineVersion);
  expect(copied).toContain("Verdict: fail");
  expect(copied).toContain("p95 latency:");
  expect(copied).toContain("Stale result.");
  const bottleneck = old.result.summary.nodes.find((node: { id: string }) => node.id === old.result.summary.bottleneckId);
  expect(copied).toContain("Bottleneck: " + bottleneck.label);
  await page.evaluate(() => { (window as unknown as { liteClipboard: { denied: boolean } }).liteClipboard.denied = true; });
  await copy.click();
  const fallback = page.getByRole("textbox", { name: "Recorded results text" });
  await expect(fallback).toHaveValue(copied);
  await expect(fallback).toHaveAttribute("readonly", "");
  await fallback.focus();
  expect(await fallback.evaluate((element: HTMLTextAreaElement) => element.selectionEnd - element.selectionStart)).toBe(copied.length);
  await page.screenshot({ animations: "disabled", path: info.outputPath("copy-fallback.png") });
});

test("Quiet night persists one undoable change and preserves targets", async ({ page }, info) => {
  const { path, headers } = await openDesign(page);
  const traffic = async () => {
    const response = await page.request.get(api + path, { headers });
    expect(response.ok()).toBe(true);
    return (await response.json()).data.traffic;
  };
  await page.goto(path + "/traffic");
  await page.getByRole("button", { name: /^Launch day/ }).click();
  await page.getByLabel("p95 target", { exact: true }).fill("450");
  await page.getByLabel("p95 target", { exact: true }).blur();
  await page.getByLabel("Error budget", { exact: true }).selectOption("0.02");
  await page.getByLabel("Test length", { exact: true }).selectOption("30");
  await saved(page);
  const before = await traffic();
  expect(before.rps).toBe(5000);
  expect(before.sloP95).toBe(450);
  await page.getByRole("button", { name: /^Quiet night/ }).click();
  await expect(page.getByLabel("Average requests per second", { exact: true })).toHaveValue("100");
  await saved(page);
  await expect.poll(traffic).toEqual({ ...before, preset: "custom", rps: 100, burst: 1.1, shape: "steady" });
  await page.screenshot({ animations: "disabled", path: info.outputPath("quiet-night.png") });
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel("Average requests per second", { exact: true })).toHaveValue("5000");
  await saved(page);
  await expect.poll(traffic).toEqual(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

