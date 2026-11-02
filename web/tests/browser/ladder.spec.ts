import { test, expect, type Page } from "@playwright/test";
const api = process.env.SF_API_URL ?? "http://localhost:5001/v1";

// The load ladder on the real backend. The model is deterministic, so the page is compared with what the API itself reports for the
// same design, and the words are checked against the rows they describe.
type Headers = { Authorization: string };
async function setup(page: Page, tag: string) {
  await page.goto("/register");
  await page.getByLabel("Name", { exact: true }).fill("Ladder");
  await page.getByLabel("Email", { exact: true }).fill("ld-" + Date.now() + "-" + tag + "@example.test");
  await page.getByLabel("Password", { exact: true }).fill("Ladder-Journey-2026!");
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
const results = (page: Page, id: string, runId: string) => page.goto("/designs/" + id + "/results?run=" + runId);
const ms = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 }) + " ms";
const pct = (n: number) => (n * 100).toLocaleString("en-US", { maximumFractionDigits: 3 }) + "%";
const askApi = async (page: Page, headers: Headers, id: string, revision: number, runId: string) =>
  (await (await page.request.post(api + "/designs/" + id + "/ladder", { headers, data: { expectedRevision: revision, runId } })).json()).data;

test("a passing result shows where it breaks, and every cell is what the API reports for the same design", async ({ page }, info) => {
  const headers = await setup(page, "table-" + info.project.name);
  const id = await openTemplate(page);
  const d = await getDesign(page, headers, id);
  const run = await simulate(page, headers, id, d.revision);
  expect(run.result.summary.verdict).toBe("pass");
  const expected = await askApi(page, headers, id, d.revision, run.id);
  await results(page, id, run.id);
  const panel = page.getByTestId("ladder-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Calculated by the model, no AI");
  await expect(page.getByTestId("ladder-row")).toHaveCount(0);
  const ask = page.getByTestId("ladder-button");
  await ask.focus();
  await expect(ask).toBeFocused();
  await page.keyboard.press("Enter");
  const rows = page.getByTestId("ladder-row");
  await expect(rows).toHaveCount(4);
  for (const [i, rung] of (expected.rungs as { multiplier: number; rps: number; measure: { verdict: string; p95: number; errorRate: number }; limiter: { label: string } | null }[]).entries()) {
    const cells = rows.nth(i).locator("th, td");
    await expect(cells.nth(0)).toHaveText(rung.multiplier === 1 ? "Now" : rung.multiplier + "× load");
    await expect(cells.nth(1)).toHaveText(rung.rps.toLocaleString("en-US", { maximumFractionDigits: 2 }));
    await expect(cells.nth(2)).toHaveText({ pass: "passes", strained: "is strained", fail: "fails" }[rung.measure.verdict] as string);
    await expect(cells.nth(2).locator(".pill")).toHaveClass("pill " + { pass: "ok", strained: "warn", fail: "fail" }[rung.measure.verdict]);
    await expect(cells.nth(3)).toHaveText(ms(rung.measure.p95));
    await expect(cells.nth(4)).toHaveText(pct(rung.measure.errorRate));
    await expect(cells.nth(5)).toHaveText(rung.limiter ? rung.limiter.label : "None named");
  }
  await expect(page.getByTestId("ladder-headline")).not.toBeEmpty();
  await expect(panel).toContainText("only the average request rate changes");
  await expect(panel).toContainText("estimates from a model, not measurements of real infrastructure");
  await expect(panel.getByRole("table", { name: "The recorded run and the same design at higher load" })).toBeVisible();
  await expect(panel.locator("th[scope=col]")).toHaveCount(6);
  await expect(ask).toHaveText("Calculate again");
  await noOverflow(page);
});

test("the headline matches the rows it describes", async ({ page }, info) => {
  const headers = await setup(page, "headline-" + info.project.name);
  const id = await openTemplate(page);
  const d = await getDesign(page, headers, id);
  const run = await simulate(page, headers, id, d.revision);
  const expected = await askApi(page, headers, id, d.revision, run.id);
  const verdicts = (expected.rungs as { measure: { verdict: string } }[]).map((r) => r.measure.verdict);
  await results(page, id, run.id);
  await page.getByTestId("ladder-button").click();
  const text = await page.getByTestId("ladder-headline").innerText();
  const firstWorse = verdicts.findIndex((v) => v !== "pass");
  if (firstWorse === -1) expect(text).toMatch(/^Passes at every load checked, up to 10× load/);
  else if (firstWorse === 0) expect(text).toMatch(/^Already (fails|strained) at the recorded load\./);
  else expect(text).toMatch(new RegExp("then (fails|is strained) at " + [1, 2, 5, 10][firstWorse] + "× load"));
});

test("a failing result shows both the ladder and the fixes, and each works on its own", async ({ page }, info) => {
  const headers = await setup(page, "both-" + info.project.name);
  const id = await openTemplate(page);
  const d = await getDesign(page, headers, id);
  const saved = await patch(page, headers, id, { traffic: { ...d.traffic, rps: d.traffic.rps * 3 } });
  const run = await simulate(page, headers, id, saved.revision);
  expect(run.result.summary.verdict).not.toBe("pass");
  await results(page, id, run.id);
  await expect(page.getByTestId("fixes-panel")).toBeVisible();
  await expect(page.getByTestId("ladder-panel")).toBeVisible();
  await page.getByTestId("ladder-button").click();
  await expect(page.getByTestId("ladder-row")).toHaveCount(4);
  await expect(page.getByTestId("ladder-headline")).toContainText("Already");
  await page.getByTestId("fixes-button").click();
  await expect(page.getByTestId("fix-card").first()).toBeVisible();
  await expect(page.getByTestId("ladder-row")).toHaveCount(4);
});

test("a rate beyond the model's limit is named as such and the others are still shown", async ({ page }, info) => {
  const headers = await setup(page, "large-" + info.project.name);
  const id = await openTemplate(page);
  const d = await getDesign(page, headers, id);
  const saved = await patch(page, headers, id, { traffic: { ...d.traffic, rps: 4_000_000 } });
  const run = await simulate(page, headers, id, saved.revision);
  await results(page, id, run.id);
  await page.getByTestId("ladder-button").click();
  const rows = page.getByTestId("ladder-row");
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(2)).toContainText("Beyond the model's limit");
  await expect(rows.nth(3)).toContainText("Beyond the model's limit");
  await expect(rows.nth(2).locator("td").nth(2)).not.toContainText("passes");
  await expect(page.getByTestId("ladder-headline")).toContainText("would be beyond the largest rate the model accepts");
});

test("a row that could not be checked is shown as such and never counted as a pass", async ({ page }, info) => {
  const headers = await setup(page, "gap-" + info.project.name);
  const id = await openTemplate(page);
  const d = await getDesign(page, headers, id);
  const run = await simulate(page, headers, id, d.revision);
  await page.route(api + "/designs/*/ladder", async (route) => {
    const real = await route.fetch();
    const body = await real.json();
    const rungs = body.data.rungs.map((r: { multiplier: number }) => (r.multiplier === 5 ? { ...r, status: "UNAVAILABLE", measure: null, limiter: null } : r));
    await route.fulfill({ response: real, json: { data: { ...body.data, rungs } } });
  });
  await results(page, id, run.id);
  await page.getByTestId("ladder-button").click();
  const rows = page.getByTestId("ladder-row");
  await expect(rows.nth(2)).toContainText("Could not be checked");
  await expect(rows.nth(2)).not.toContainText("passes");
  await expect(page.getByTestId("ladder-headline")).toContainText("5× load could not be checked, so nothing is said about it.");
});

test("a result for an earlier version cannot ask for the ladder, and says to run the test again", async ({ page }, info) => {
  const headers = await setup(page, "stale-" + info.project.name);
  const id = await openTemplate(page);
  const d = await getDesign(page, headers, id);
  const run = await simulate(page, headers, id, d.revision);
  await patch(page, headers, id, { traffic: { ...d.traffic, rps: d.traffic.rps + 1 } });
  await results(page, id, run.id);
  await expect(page.getByTestId("ladder-button")).toBeDisabled();
  await expect(page.getByTestId("ladder-stale")).toContainText("This result is not for the saved design. Save, then run the test again to see the ladder.");
});

test("a busy calculation service is explained, and a failed request leaves the panel usable", async ({ page }, info) => {
  const headers = await setup(page, "busy-" + info.project.name);
  const id = await openTemplate(page);
  const d = await getDesign(page, headers, id);
  const run = await simulate(page, headers, id, d.revision);
  let busy = true;
  await page.route(api + "/designs/*/ladder", (route) => (busy ? route.fulfill({ status: 429, json: { error: { code: "RATE_LIMITED", message: "busy" } } }) : route.continue()));
  await results(page, id, run.id);
  await page.getByTestId("ladder-button").click();
  await expect(page.getByTestId("ladder-error")).toHaveText("Calculation capacity is busy. Try again in a moment.");
  await expect(page.getByTestId("ladder-row")).toHaveCount(0);
  busy = false;
  await page.getByTestId("ladder-button").click();
  await expect(page.getByTestId("ladder-row")).toHaveCount(4);
  await expect(page.getByTestId("ladder-error")).toHaveCount(0);
});

test("changing nothing: asking for the ladder leaves the design as it was", async ({ page }, info) => {
  const headers = await setup(page, "pure-" + info.project.name);
  const id = await openTemplate(page);
  const d = await getDesign(page, headers, id);
  const run = await simulate(page, headers, id, d.revision);
  await results(page, id, run.id);
  await page.getByTestId("ladder-button").click();
  await expect(page.getByTestId("ladder-row")).toHaveCount(4);
  const after = await getDesign(page, headers, id);
  expect(after.revision).toBe(d.revision);
  expect(after.traffic).toEqual(d.traffic);
  expect(after.graph).toEqual(d.graph);
});

test("the ladder belongs to the results page only", async ({ page }, info) => {
  const headers = await setup(page, "tab-" + info.project.name);
  const id = await openTemplate(page);
  const d = await getDesign(page, headers, id);
  const run = await simulate(page, headers, id, d.revision);
  await results(page, id, run.id);
  await expect(page.getByTestId("ladder-panel")).toBeVisible();
  await page.getByRole("link", { name: /^Edit/ }).first().click();
  await expect(page.getByLabel("Component", { exact: true })).toBeVisible();
  await expect(page.getByTestId("ladder-panel")).toHaveCount(0);
  await page.getByRole("link", { name: /^Traffic/ }).first().click();
  await expect(page.getByTestId("ladder-panel")).toHaveCount(0);
});

test("an unsaved change to the traffic makes the result stale, so the ladder is not offered until the person saves and runs again", async ({ page }, info) => {
  const headers = await setup(page, "unsaved-" + info.project.name);
  const id = await openTemplate(page);
  const d = await getDesign(page, headers, id);
  const run = await simulate(page, headers, id, d.revision);
  await results(page, id, run.id);
  await expect(page.getByTestId("ladder-button")).toBeEnabled();
  // Hold the save back, so the change stays unsaved at the same saved revision (the editor would otherwise save it in a moment).
  await page.route(api + "/designs/" + id, (route) => (route.request().method() === "PATCH" ? route.abort() : route.continue()));
  await page.getByRole("link", { name: /^Traffic/ }).first().click();
  const rps = page.getByLabel("Average requests per second", { exact: true });
  await rps.fill("1234");
  await rps.blur();
  await page.getByRole("link", { name: /^Results/ }).first().click();
  await expect(page.getByTestId("ladder-panel")).toBeVisible();
  await expect(page.getByTestId("ladder-button")).toBeDisabled();
  await expect(page.getByTestId("ladder-stale")).toContainText("This result is not for the saved design");
});
