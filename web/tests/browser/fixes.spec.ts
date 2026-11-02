import { test, expect, type Page } from "@playwright/test";
const api = process.env.SF_API_URL ?? "http://localhost:5001/v1";

// Suggested fixes on the real backend. The model is deterministic, so the strongest check is end to end: the figure on a fix card is
// exactly what a real test run reports once the fix is applied, saved and run.
type Headers = { Authorization: string };
async function setup(page: Page, tag: string) {
  await page.goto("/register");
  await page.getByLabel("Name", { exact: true }).fill("Fixes");
  await page.getByLabel("Email", { exact: true }).fill("fx-" + Date.now() + "-" + tag + "@example.test");
  await page.getByLabel("Password", { exact: true }).fill("Fixes-Journey-2026!");
  await page.locator("#reg-terms").check();
  const reg = page.waitForResponse((r) => r.url() === api + "/auth/register" && r.status() === 201);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  const token = (await (await reg).json()).data.accessToken as string;
  await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();
  return { Authorization: "Bearer " + token } as Headers;
}
async function openTemplate(page: Page) {
  await page.goto("/new/template");
  await page.getByRole("button", { name: "Use Single-server MVP", exact: true }).click();
  await expect(page.getByLabel("Component", { exact: true })).toBeVisible();
  return new URL(page.url()).pathname.split("/")[2];
}
const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
const getDesign = async (page: Page, headers: Headers, id: string) => (await (await page.request.get(api + "/designs/" + id, { headers })).json()).data;
async function patch(page: Page, headers: Headers, id: string, body: Record<string, unknown>) {
  const current = await getDesign(page, headers, id);
  const r = await page.request.patch(api + "/designs/" + id, { headers, data: { expectedRevision: current.revision, ...body } });
  expect(r.status()).toBe(200);
  return (await r.json()).data;
}
async function simulate(page: Page, headers: Headers, id: string, revision: number) {
  const accepted = await page.request.post(api + "/designs/" + id + "/simulate", { headers, data: { expectedRevision: revision, requestId: crypto.randomUUID() } });
  expect(accepted.status()).toBe(202);
  const statusUrl = (await accepted.json()).data.statusUrl as string;
  for (let i = 0; i < 150; i++) {
    const run = (await (await page.request.get(statusUrl.startsWith("http") ? statusUrl : api.replace(/\/v1$/, "") + statusUrl, { headers })).json()).data;
    if (run.status !== "pending") return run;
    await page.waitForTimeout(50);
  }
  throw new Error("run stayed pending");
}
/** A design under a load that makes it fail, and its recorded run. */
async function failingDesign(page: Page, headers: Headers, id: string) {
  const d = await getDesign(page, headers, id);
  const saved = await patch(page, headers, id, { traffic: { ...d.traffic, rps: d.traffic.rps * 3 } });
  const run = await simulate(page, headers, id, saved.revision);
  expect(run.result.summary.verdict).not.toBe("pass");
  return { design: saved, run };
}
const results = (page: Page, id: string, runId: string) => page.goto("/designs/" + id + "/results?run=" + runId);
const number = (text: string) => Number(text.replace(/,/g, ""));

test("a failing result offers fixes on request, each with the model's before and after, and says no AI was used", async ({ page }, info) => {
  const headers = await setup(page, "show-" + info.project.name);
  const id = await openTemplate(page);
  const { run } = await failingDesign(page, headers, id);
  await results(page, id, run.id);
  const panel = page.getByTestId("fixes-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Verified by the model, no AI");
  await expect(page.getByTestId("fix-card")).toHaveCount(0);
  const ask = page.getByTestId("fixes-button");
  await ask.focus();
  await expect(ask).toBeFocused();
  await page.keyboard.press("Enter");
  const cards = page.getByTestId("fix-card");
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeLessThanOrEqual(3);
  await expect(cards.first()).toContainText("p95");
  await expect(cards.first()).toContainText("Errors");
  await expect(cards.first().getByTestId("fix-change")).toHaveText(/^(The design would pass|It would still (fail|be strained), but less badly|The design would be strained instead of failing)\./);
  await expect(panel).toContainText("These figures come from the same model as your test runs");
  await expect(panel).toContainText("estimates from a model, not measurements of real infrastructure");
  await expect(ask).toHaveText("Try again");
  await noOverflow(page);
});

test("a passing result has no fixes panel", async ({ page }, info) => {
  const headers = await setup(page, "pass-" + info.project.name);
  const id = await openTemplate(page);
  const d = await getDesign(page, headers, id);
  const run = await simulate(page, headers, id, d.revision);
  expect(run.result.summary.verdict).toBe("pass");
  await results(page, id, run.id);
  await expect(page.getByRole("heading", { name: "Topology under load" })).toBeVisible();
  await expect(page.getByTestId("fixes-panel")).toHaveCount(0);
});

test("applying a fix puts it in the draft without saving, blocks a second fix, and the saved result matches the card", async ({ page }, info) => {
  const headers = await setup(page, "apply-" + info.project.name);
  const id = await openTemplate(page);
  const { design, run } = await failingDesign(page, headers, id);
  await results(page, id, run.id);
  await page.getByTestId("fixes-button").click();
  const first = page.getByTestId("fix-card").first();
  await expect(first).toBeVisible();
  // What the card promises, read from the page.
  const promised = number(((await first.locator("dd").nth(1).innerText()).match(/to ([\d,.]+) ms/) as RegExpMatchArray)[1]);
  const promisedErrors = ((await first.locator("dd").nth(2).innerText()).match(/to ([\d.]+)%/) as RegExpMatchArray)[1];
  await first.getByTestId("fix-apply").click();
  await expect(page.getByTestId("fix-applied")).toContainText("Applied to your draft as an unsaved change");
  await expect(first.getByTestId("fix-apply")).toHaveText("Applied to your draft");
  await expect(first.getByTestId("fix-apply")).toBeDisabled();
  const others = page.getByTestId("fix-card");
  if ((await others.count()) > 1) {
    await expect(others.nth(1).getByTestId("fix-apply")).toBeDisabled();
    await expect(others.nth(1)).toContainText("A fix is already in your draft");
  }
  // Nothing is saved yet.
  expect((await getDesign(page, headers, id)).revision).toBe(design.revision);
  await page.getByRole("link", { name: "Open the editor" }).click();
  const saveResponse = page.waitForResponse((r) => r.url() === api + "/designs/" + id && r.request().method() === "PATCH" && r.status() === 200);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const savedBody = (await (await saveResponse).json()).data;
  expect(savedBody.revision).toBe(design.revision + 1);
  // The real test run on the saved fix reports what the card promised.
  const after = await simulate(page, headers, id, savedBody.revision);
  expect(Math.abs(after.result.summary.p95 - promised)).toBeLessThan(0.01);
  expect((after.result.summary.errorRate * 100).toFixed(1)).toBe(Number(promisedErrors).toFixed(1));
});

test("an unsaved edit blocks applying a fix, so a fix cannot overwrite work in progress", async ({ page }, info) => {
  const headers = await setup(page, "dirty-" + info.project.name);
  const id = await openTemplate(page);
  const { run } = await failingDesign(page, headers, id);
  await results(page, id, run.id);
  await page.getByTestId("fixes-button").click();
  await expect(page.getByTestId("fix-card").first()).toBeVisible();
  await page.getByRole("link", { name: /^Edit/ }).first().click();
  await page.getByLabel("Design name", { exact: true }).fill("Renamed, not saved");
  await page.getByRole("link", { name: /^Results/ }).first().click();
  await expect(page.getByRole("heading", { name: "Suggested fixes" })).toBeVisible();
  await page.getByTestId("fixes-button").click();
  const card = page.getByTestId("fix-card").first();
  await expect(card).toBeVisible();
  await expect(card.getByTestId("fix-apply")).toBeDisabled();
  await expect(card).toContainText("You have unsaved changes. Save or undo them first");
});

test("a result for an earlier version cannot ask for fixes, and says to run the test again", async ({ page }, info) => {
  const headers = await setup(page, "stale-" + info.project.name);
  const id = await openTemplate(page);
  const { design, run } = await failingDesign(page, headers, id);
  await patch(page, headers, id, { traffic: { ...design.traffic, rps: design.traffic.rps + 1 } });
  await results(page, id, run.id);
  await expect(page.getByTestId("fixes-panel")).toBeVisible();
  await expect(page.getByTestId("fixes-button")).toBeDisabled();
  await expect(page.getByTestId("fixes-stale")).toContainText("This result is not for the saved design. Save, then run the test again to get fixes.");
});

test("a busy calculation service is explained, and a failed request leaves the panel usable", async ({ page }, info) => {
  const headers = await setup(page, "busy-" + info.project.name);
  const id = await openTemplate(page);
  const { run } = await failingDesign(page, headers, id);
  let busy = true;
  await page.route(api + "/designs/*/fixes", (route) => (busy ? route.fulfill({ status: 429, json: { error: { code: "RATE_LIMITED", message: "busy" } } }) : route.continue()));
  await results(page, id, run.id);
  await page.getByTestId("fixes-button").click();
  await expect(page.getByTestId("fixes-error")).toHaveText("Calculation capacity is busy. Try again in a moment.");
  await expect(page.getByTestId("fix-card")).toHaveCount(0);
  busy = false;
  await page.getByTestId("fixes-button").click();
  await expect(page.getByTestId("fix-card").first()).toBeVisible();
  await expect(page.getByTestId("fixes-error")).toHaveCount(0);
});

test("when no fix helps, the panel says so plainly and offers nothing to apply", async ({ page }, info) => {
  const headers = await setup(page, "none-" + info.project.name);
  const id = await openTemplate(page);
  const { run } = await failingDesign(page, headers, id);
  await page.route(api + "/designs/*/fixes", async (route) => {
    const real = await route.fetch();
    const body = await real.json();
    await route.fulfill({ response: real, json: { data: { ...body.data, status: "NO_IMPROVEMENT_FOUND", suggestions: [], tried: 4 } } });
  });
  await results(page, id, run.id);
  await page.getByTestId("fixes-button").click();
  await expect(page.getByTestId("fixes-status")).toContainText("None of the 4 fixes tried for");
  await expect(page.getByTestId("fixes-status")).toContainText("improved this design");
  await expect(page.getByTestId("fix-card")).toHaveCount(0);
  await expect(page.getByTestId("fix-apply")).toHaveCount(0);
});

test("an unsaved change to the traffic makes the result stale, so fixes are not offered until the person saves and runs again", async ({ page }, info) => {
  const headers = await setup(page, "traffic-" + info.project.name);
  const id = await openTemplate(page);
  const { run } = await failingDesign(page, headers, id);
  await results(page, id, run.id);
  await expect(page.getByTestId("fixes-button")).toBeEnabled();
  // Hold the save back, so the change stays unsaved at the same saved revision (the editor would otherwise save it in a moment).
  await page.route(api + "/designs/" + id, (route) => (route.request().method() === "PATCH" ? route.abort() : route.continue()));
  await page.getByRole("link", { name: /^Traffic/ }).first().click();
  const rps = page.getByLabel("Average requests per second", { exact: true });
  await rps.fill("1234");
  await rps.blur();
  await page.getByRole("link", { name: /^Results/ }).first().click();
  await expect(page.getByTestId("fixes-panel")).toBeVisible();
  await expect(page.getByTestId("fixes-button")).toBeDisabled();
  await expect(page.getByTestId("fixes-stale")).toContainText("This result is not for the saved design");
});
