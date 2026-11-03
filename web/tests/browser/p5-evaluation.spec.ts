import { test, expect, type Page } from "@playwright/test";

// P5 Evaluation, as a guest in a real browser: the proof page is public, makes no requests, and says plainly what is and
// is not known.
const TABS: Array<[string, string, string]> = [
  ["simulator", "Simulator", "Measured"],
  ["calibration", "Calibration", "Measured on one machine, one toy service"],
  ["ai", "AI", "Tested, no model passed"],
];
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const watch = (page: Page) => {
  const errors: string[] = [];
  const api: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (/\/v1\//.test(r.url()) && !/\/auth\/(refresh|me)/.test(r.url())) api.push(r.url());
  });
  return { errors, api };
};

for (const [id, label, status] of TABS) {
  test(`P5 /evaluation/${id}: a guest sees the ${label} tab with the status "${status}", at every width, with no requests`, async ({ page }) => {
    const seen = watch(page);
    await page.goto("/evaluation/" + id);
    await expect(page).toHaveTitle(`Evaluation: ${label} · StressForge`);
    await expect(page.locator("main h1")).toHaveText("Evaluation");
    await expect(page.getByTestId("tab-heading")).toHaveText(label);
    await expect(page.getByTestId("status")).toHaveText(status);
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Evaluation sections" }).locator("[aria-current='page']")).toHaveText(label);
    await expect(page.getByText(/mock data|illustrative|lorem/i)).toHaveCount(0);
    const headings = await page.locator("main h1, main h2, main h3").evaluateAll((els) => els.map((e) => Number(e.tagName[1])));
    for (let i = 1; i < headings.length; i++) expect(headings[i] - headings[i - 1], `${id} heading levels`).toBeLessThanOrEqual(1);
    for (const width of [320, 390, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await noOverflow(page), `${id} at ${width}px`).toBe(true);
    }
    expect(seen.api).toEqual([]);
    expect(seen.errors).toEqual([]);
  });
}

test("P5 /evaluation goes to the Simulator tab, and the tabs link to each other", async ({ page }) => {
  await page.goto("/evaluation");
  await expect(page).toHaveURL(/\/evaluation\/simulator$/);
  const nav = page.getByRole("navigation", { name: "Evaluation sections" });
  await nav.getByRole("link", { name: "Calibration", exact: true }).click();
  await expect(page).toHaveURL(/\/evaluation\/calibration$/);
  await nav.getByRole("link", { name: "AI", exact: true }).click();
  await expect(page).toHaveURL(/\/evaluation\/ai$/);
  await nav.getByRole("link", { name: "Simulator", exact: true }).click();
  await expect(page.getByTestId("status")).toHaveText("Measured");
});

test("P5 simulator: the measured tables are there, every check passes, and what it does not prove is stated", async ({ page }) => {
  await page.goto("/evaluation/simulator");
  await expect(page.getByTestId("one-server")).toContainText("equals the exact textbook answer");
  await expect(page.getByTestId("bands").locator("tbody tr")).toHaveCount(3);
  await expect(page.getByTestId("bands")).toContainText("15.2%");
  await expect(page.getByTestId("gap")).toContainText("0.034 of one service time");
  await expect(page.getByTestId("typical").locator("tbody tr")).toHaveCount(11);
  await expect(page.getByTestId("fidelity-text")).toContainText("4,437 numbers across 6 reference designs");
  await expect(page.getByTestId("consistency-text")).toContainText("30 of 30 checks passed");
  await expect(page.getByTestId("check-row")).toHaveCount(5);
  await expect(page.getByTestId("check-row").locator("td", { hasText: "FAIL" })).toHaveCount(0);
  await expect(page.getByTestId("not-proven")).toContainText("That the model matches real servers");
  await expect(page.getByTestId("reproduce")).toContainText("pnpm fixtures:evaluation:check");
  // The wide tables scroll inside their own box instead of widening the page.
  await page.setViewportSize({ width: 320, height: 900 });
  expect(await noOverflow(page)).toBe(true);
});

test("P5 calibration: the first comparison, with the approved headline, two tables of twelve loads, the expectations and the limits", async ({ page }) => {
  await page.goto("/evaluation/calibration");
  const headline = page.getByTestId("calibration-headline");
  await expect(headline).toContainText("the model was cautious");
  await expect(headline).toContainText("17.5 against 25.4 requests a second");
  await expect(headline).toContainText("within 9% for four servers (149 against 164)");
  await expect(headline).toContainText("20.5% against 56.6%");
  await expect(headline).toContainText("It does not show how accurate the model is for real applications.");
  await expect(page.getByTestId("calibration-table-1").getByTestId("calibration-row")).toHaveCount(12);
  await expect(page.getByTestId("calibration-table-4").getByTestId("calibration-row")).toHaveCount(12);
  await expect(page.getByTestId("calibration-table-1").locator("[data-censored='true']")).toHaveCount(2);
  await expect(page.getByTestId("expectation-row")).toHaveCount(4);
  await expect(page.getByTestId("expectation-row").nth(2)).toContainText("did not hold");
  await expect(page.getByTestId("calibration-trust")).toContainText("A rule was changed after the first analysis");
  await expect(page.getByTestId("calibration-trust")).toContainText("42 of 72 steps");
  await expect(page.getByTestId("calibration-not-shown")).toContainText("not a validation of the model");
  await expect(page.getByTestId("method").locator("ol li")).toHaveCount(7);
  await expect(page.getByTestId("reproduce-cal")).toContainText("pnpm calibration:analyze:check");
  await expect(page.getByTestId("calibration-result")).toHaveCount(0);
  await expect(page.getByText(/validated|proven/i)).toHaveCount(0);
  // The wide tables scroll inside their own box instead of widening the page.
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await noOverflow(page), `${width}px`).toBe(true);
  }
});

test("P5 ai: three recorded tests, none passed, every AI feature off, and nothing compared", async ({ page }) => {
  await page.goto("/evaluation/ai");
  await expect(page.getByTestId("ai-lede")).toContainText("switched off");
  await expect(page.getByTestId("hosted-explain-result")).toContainText("Accepted: 0 of 18");
  await expect(page.getByTestId("hosted-describe-table").locator("tbody tr")).toHaveCount(2);
  await expect(page.getByTestId("hosted-describe-table")).toContainText("13 of 20");
  await expect(page.getByTestId("hosted-describe-table")).toContainText("3 of 3");
  await expect(page.getByTestId("not-ai")).toContainText("do not use AI");
  await expect(page.getByTestId("ai-not-shown").locator("li")).toHaveCount(3);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await noOverflow(page), `${width}px`).toBe(true);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.getByTestId("m10-row")).toHaveCount(2);
  await expect(page.getByTestId("m10-row").first()).toContainText("qwen2.5:1.5b");
  await expect(page.getByTestId("m10").locator("tbody").first()).toContainText("0 of 8");
  await expect(page.getByText("No comparison with a rule-based explanation has been made")).toBeVisible();
});

test("P5 an unknown tab, or a name every object has, is a page-not-found", async ({ page }) => {
  for (const name of ["nope", "constructor", "__proto__", "toString"]) {
    await page.goto("/evaluation/" + name);
    await expect(page).toHaveTitle("Page not found · StressForge");
    await expect(page.getByTestId("evaluation-page")).toHaveCount(0);
  }
});

test("P5 How it works leads to the evidence", async ({ page }) => {
  await page.goto("/how-it-works");
  await page.getByRole("link", { name: "See what has been checked", exact: true }).click();
  await expect(page).toHaveURL(/\/evaluation\/simulator$/);
  await expect(page.getByTestId("status")).toHaveText("Measured");
});

test("P5 ai: the goal-reading test is shown with its four readings, the cap mistake, the hidden orders and the result, with no request", async ({ page }) => {
  const api: string[] = [];
  page.on("request", (r) => {
    if (/\/v1\//.test(r.url()) && !/\/auth\/(refresh|me)/.test(r.url())) api.push(r.url());
  });
  await page.goto("/evaluation/ai");
  const section = page.getByTestId("hosted-goal");
  await expect(section).toContainText("The hosted model reading a goal for the fix suggestions (3 November 2026)");
  await expect(page.getByTestId("hosted-goal-row")).toHaveCount(4);
  await expect(page.getByTestId("hosted-goal-row").nth(3)).toContainText("gpt-oss-120b, third run");
  await expect(page.getByTestId("hosted-goal-row").nth(3)).toContainText("12");
  await expect(page.getByTestId("hosted-goal-table")).toContainText("Hidden orders (bar 3 of 3)");
  await expect(page.getByTestId("hosted-goal-row").locator("td", { hasText: "No-go" })).toHaveCount(4);
  await expect(page.getByTestId("hosted-goal-cap")).toContainText("capped each answer at 120 tokens");
  await expect(page.getByTestId("hosted-goal-orders")).toContainText("counted it as a failure anyway");
  await expect(page.getByTestId("hosted-goal-result")).toContainText("the AI goal box stays switched off");
  await expect(page.getByTestId("ai-lede")).toContainText("Four tests of AI were run");
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await noOverflow(page), `${width}px`).toBe(true);
  }
  expect(api).toEqual([]);
});
