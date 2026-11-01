import { test, expect, type Page } from "@playwright/test";

// P2 Learn, as a guest in a real browser: no account, no API calls, every topic usable from the keyboard.
const TOPICS: Array<[string, string]> = [
  ["utilization", "Utilization (ρ)"],
  ["queues", "Queues"],
  ["p95", "p95 latency"],
  ["caching", "Caching"],
  ["replicas", "Read replicas"],
  ["load-balancing", "Load balancing"],
  ["cdn", "CDNs"],
  ["regions", "Regions and latency"],
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

test("P2 the index lists the eight concepts, links each one, and starts with nothing opened", async ({ page }) => {
  const seen = watch(page);
  await page.goto("/learn");
  await expect(page).toHaveTitle("Learn · StressForge");
  await expect(page.locator("main h1")).toHaveText("Learn");
  await expect(page.getByTestId("learn-card")).toHaveCount(8);
  await expect(page.getByTestId("learn-tally")).toHaveText("0 of 8 opened · 0 passed");
  await expect(page.getByTestId("learn-mark").first()).toHaveText("Not opened yet");
  for (const [id, title] of TOPICS) await expect(page.getByRole("link", { name: title, exact: true })).toHaveAttribute("href", "/learn/" + id);
  for (const width of [320, 390, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await noOverflow(page), `index at ${width}px`).toBe(true);
  }
  expect(seen.api).toEqual([]);
  expect(seen.errors).toEqual([]);
});

for (const [id, title] of TOPICS) {
  test(`P2 ${id}: one heading, a working demo, a place in the app, no overflow, no requests`, async ({ page }) => {
    const seen = watch(page);
    await page.goto("/learn/" + id);
    await expect(page).toHaveTitle(`${title} · StressForge`);
    await expect(page.locator("main h1")).toHaveText(title);
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toBeVisible();
    await expect(page.getByTestId("demo")).toBeVisible();
    await expect(page.getByTestId("demo")).toContainText("Model estimate, not a measurement");
    await expect(page.getByTestId("seen")).toBeVisible();
    const headings = await page.locator("main h1, main h2, main h3").evaluateAll((els) => els.map((e) => Number(e.tagName[1])));
    for (let i = 1; i < headings.length; i++) expect(headings[i] - headings[i - 1], `${id} heading levels`).toBeLessThanOrEqual(1);

    // Operate the first control from the keyboard only, and watch the written result change.
    const summary = page.getByTestId("demo-summary");
    const before = await summary.textContent();
    const control = page.getByTestId("demo").locator("input[type=range], select").first();
    await control.focus();
    await expect(control).toBeFocused();
    if ((await control.evaluate((el) => el.tagName)) === "SELECT") await control.selectOption({ index: 1 });
    else for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowRight");
    await expect.poll(async () => summary.textContent()).not.toBe(before);
    await expect(summary).not.toContainText(/NaN|Infinity|undefined/);
    await expect(summary).toHaveAttribute("role", "status");

    for (const width of [320, 390, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await noOverflow(page), `${id} at ${width}px`).toBe(true);
    }
    expect(seen.api).toEqual([]);
    expect(seen.errors).toEqual([]);
  });
}

test("P2 a guest opens topics and passes a check, and the marks survive a reload and show on the index", async ({ page }) => {
  await page.goto("/learn/caching");
  await expect(page.getByTestId("topic-mark")).toHaveText("Opened");
  const questions = page.getByTestId("question");
  // Wrong first, then right: the verdict changes and the pass needs both.
  await questions.nth(0).getByRole("radio").nth(1).check();
  await questions.nth(0).getByTestId("check-answer").click();
  await expect(questions.nth(0).getByTestId("answer-result")).toContainText("Not quite");
  await questions.nth(0).getByRole("radio").nth(3).check();
  await questions.nth(0).getByTestId("check-answer").click();
  await expect(questions.nth(0).getByTestId("answer-result")).toContainText("Correct.");
  await expect(page.getByTestId("check-passed")).toHaveCount(0);
  await questions.nth(1).getByRole("radio").nth(0).check();
  await questions.nth(1).getByTestId("check-answer").click();
  await expect(page.getByTestId("check-passed")).toBeVisible();
  await expect(page.getByTestId("topic-mark")).toHaveText("Passed the check");

  await page.reload();
  await expect(page.getByTestId("topic-mark")).toHaveText("Passed the check");
  await expect(page.getByTestId("check")).toContainText("passed this check before");
  await page.goto("/learn/cdn");
  await expect(page.getByTestId("topic-mark")).toHaveText("Opened");
  await page.goto("/learn");
  await expect(page.getByTestId("learn-tally")).toHaveText("2 of 8 opened · 1 passed");
  const marks = await page.getByTestId("learn-card").evaluateAll((els) => els.map((e) => [e.querySelector("a")!.textContent, e.getAttribute("data-mark")]));
  expect(Object.fromEntries(marks)).toMatchObject({ Caching: "passed", CDNs: "opened", Queues: "new" });

  await page.getByTestId("learn-clear").click();
  await expect(page.getByTestId("learn-tally")).toHaveText("0 of 8 opened · 0 passed");
  await page.reload();
  await expect(page.getByTestId("learn-tally")).toHaveText("0 of 8 opened · 0 passed");
});

test("P2 two accounts in one browser keep separate marks, and a guest's marks are not given to the account", async ({ page }, info) => {
  await page.goto("/learn/queues");
  await expect(page.getByTestId("topic-mark")).toHaveText("Opened"); // as a guest
  const email = "p2-" + Date.now() + "-" + info.project.name + "@example.test";
  await page.goto("/register");
  await page.getByLabel("Name", { exact: true }).fill("Learner One");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("P2-Learn-2026!");
  await page.locator("#reg-terms").check();
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();
  await page.goto("/learn");
  await expect(page.getByTestId("learn-tally")).toHaveText("0 of 8 opened · 0 passed");
  await page.goto("/learn/cdn");
  await expect(page.getByTestId("topic-mark")).toHaveText("Opened");
  await page.goto("/learn");
  await expect(page.getByTestId("learn-tally")).toHaveText("1 of 8 opened · 0 passed");
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Log out", exact: true }).click();
  await expect(page.getByRole("button", { name: "Account menu", exact: true })).toHaveCount(0);
  await page.goto("/learn");
  await expect(page.getByTestId("learn-tally")).toHaveText("1 of 8 opened · 0 passed"); // the guest's own mark (queues)
  await expect(page.locator("[data-testid=learn-card][data-mark=opened] a")).toHaveText("Queues");
});

test("P2 anything that is not one of the eight topics is a page-not-found, and the names every object has are not topics", async ({ page }) => {
  for (const name of ["not-a-topic", "constructor", "__proto__", "toString"]) {
    await page.goto("/learn/" + name);
    await expect(page).toHaveTitle("Page not found · StressForge");
    await expect(page.getByTestId("learn-topic")).toHaveCount(0);
  }
  await page.goto("/learn");
  await expect(page.getByTestId("learn-tally")).toHaveText("0 of 8 opened · 0 passed");
});
