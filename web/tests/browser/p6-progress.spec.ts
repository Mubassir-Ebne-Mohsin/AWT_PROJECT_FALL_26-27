import { test, expect, type Page } from "@playwright/test";

// P6 Progress, in a real browser: the concepts section follows what is opened and passed on Learn, the suggestion moves on
// and gives its reason, marks belong to one account, the challenge section is unchanged, and nothing invents a streak.
const PASSWORD = "P6-Progress-2026!";
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

async function register(page: Page, tag: string) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/register?next=%2Fprogress");
  await page.getByLabel("Name", { exact: true }).fill("Progress Tester");
  await page.getByLabel("Email", { exact: true }).fill("p6p-" + Date.now() + "-" + tag + "@example.test");
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.locator("#reg-terms").check();
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/progress$/);
  return errors;
}
async function passCaching(page: Page) {
  await page.goto("/learn/caching");
  const questions = page.getByTestId("question");
  await questions.nth(0).getByRole("radio").nth(3).check();
  await questions.nth(0).getByTestId("check-answer").click();
  await questions.nth(1).getByRole("radio").nth(0).check();
  await questions.nth(1).getByTestId("check-answer").click();
  await expect(page.getByTestId("check-passed")).toBeVisible();
}

test("P6 a new account sees its concepts, a first suggestion with its reason, and the unchanged challenge counts", async ({ page }, info) => {
  const errors = await register(page, info.project.name + "-new");
  await expect(page.locator("main h1")).toHaveText("Progress");
  await expect(page.getByTestId("concepts-tally")).toHaveText("0 of 8 opened · 0 passed the check");
  await expect(page.getByTestId("concept-row")).toHaveCount(8);
  await expect(page.getByTestId("concept-row").first()).toContainText("Not opened yet");
  await expect(page.getByTestId("concepts")).toContainText("Kept in this browser, not on your account");
  await expect(page.getByTestId("next-step").getByRole("link")).toHaveAttribute("href", "/learn/utilization");
  await expect(page.getByTestId("next-reason")).toContainText("first concept you have not opened");
  await expect(page.getByText(/0 passed · 0 attempted/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Browse challenges to begin" })).toBeVisible();
  await expect(page.getByText(/streak/i)).toHaveCount(0);
  const headings = await page.locator("main h1, main h2, main h3").evaluateAll((els) => els.map((e) => Number(e.tagName[1])));
  expect(headings.filter((n) => n === 1)).toHaveLength(1);
  for (let i = 1; i < headings.length; i++) expect(headings[i] - headings[i - 1]).toBeLessThanOrEqual(1);
  for (const width of [320, 390, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await noOverflow(page), `${width}px`).toBe(true);
  }
  expect(errors).toEqual([]);
});

test("P6 opening and passing on Learn changes the counts, the marks and the suggestion here", async ({ page }, info) => {
  await register(page, info.project.name + "-marks");
  await page.goto("/learn/utilization");
  await expect(page.getByTestId("topic-mark")).toHaveText("Opened");
  await passCaching(page);
  await page.goto("/progress");
  await expect(page.getByTestId("concepts-tally")).toHaveText("2 of 8 opened · 1 passed the check");
  await expect(page.locator('[data-testid="concept-row"][data-topic="utilization"]')).toHaveAttribute("data-mark", "opened");
  await expect(page.locator('[data-testid="concept-row"][data-topic="caching"]')).toHaveAttribute("data-mark", "passed");
  await expect(page.locator('[data-testid="concept-row"][data-topic="queues"]')).toHaveAttribute("data-mark", "new");
  // Utilization is opened, so the first unopened topic is the next one in order.
  await expect(page.getByTestId("next-step").getByRole("link")).toHaveAttribute("href", "/learn/queues");
  await page.locator('[data-testid="concept-row"][data-topic="caching"] a').click();
  await expect(page).toHaveURL(/\/learn\/caching$/);
});

test("P6 marks stay after a reload, and a different account in another browser profile starts empty", async ({ page, browser }, info) => {
  await register(page, info.project.name + "-own");
  await passCaching(page);
  await page.goto("/progress");
  // Let the page finish restoring the session before reloading it, or the reload can race the token refresh.
  await expect(page.getByTestId("concepts-tally")).toHaveText("1 of 8 opened · 1 passed the check");
  await page.reload();
  await expect(page.getByTestId("concepts-tally")).toHaveText("1 of 8 opened · 1 passed the check");
  const use = info.project.use;
  const context = await browser.newContext({ baseURL: use.baseURL, viewport: use.viewport ?? undefined, colorScheme: use.colorScheme ?? undefined });
  const other = await context.newPage();
  await register(other, info.project.name + "-other");
  await expect(other.getByTestId("concepts-tally")).toHaveText("0 of 8 opened · 0 passed the check");
  await context.close();
});

test("P6 after every check is passed with no challenge attempted, the suggestion points to the challenges and does not say all is done", async ({ page }, info) => {
  await register(page, info.project.name + "-all");
  await passCaching(page);
  // Mark every topic passed by writing what the quiz writes, in this account's own bucket.
  const topics = ["utilization", "queues", "p95", "caching", "replicas", "load-balancing", "cdn", "regions"];
  const key = await page.evaluate(() => Object.keys(localStorage).find((x) => x.startsWith("sf:learn:v1:user:")) ?? "");
  expect(key).not.toBe("");
  await page.evaluate(([k, ids]) => localStorage.setItem(k, JSON.stringify({ opened: ids, passed: ids })), [key, topics] as [string, string[]]);
  await page.goto("/progress");
  await expect(page.getByTestId("concepts-tally")).toHaveText("8 of 8 opened · 8 passed the check");
  await expect(page.getByTestId("next-step")).toHaveAttribute("data-kind", "browse");
  await expect(page.getByTestId("next-step").getByRole("link")).toHaveAttribute("href", "/challenges");
  await expect(page.getByTestId("next-reason")).toContainText("not attempted a challenge yet");
  await expect(page.getByText("You have covered everything here")).toHaveCount(0);
});

test("P6 a guest is sent to log in first", async ({ page }) => {
  await page.goto("/progress");
  await expect(page).toHaveURL(/\/login\?next=%2Fprogress/);
});
