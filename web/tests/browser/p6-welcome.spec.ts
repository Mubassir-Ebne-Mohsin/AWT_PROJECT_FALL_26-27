import { test, expect, type Page } from "@playwright/test";

// P6 Welcome, in a real browser: a new person lands on the tour, a page they asked for still wins, Skip and the sample
// button do what they say, the sample is created once, and the tour is reachable later.
const PASSWORD = "P6-Welcome-2026!";
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

async function register(page: Page, tag: string, path = "/register", name = "Welcome Tester") {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const email = "p6-" + Date.now() + "-" + tag + "@example.test";
  await page.goto(path);
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.locator("#reg-terms").check();
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();
  return { errors, email };
}
const sampleCards = (page: Page) => page.getByRole("article").getByRole("heading", { name: "Single-server MVP", exact: true });

test("P6 a new account lands on the tour, which reads in order and fits at every width", async ({ page }, info) => {
  const { errors } = await register(page, info.project.name + "-land");
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.locator("main h1")).toHaveText("Welcome, Welcome");
  await expect(page.getByTestId("tour-step")).toHaveText("Draw your system");
  await expect(page.getByTestId("tour-counter")).toHaveText("Step 1 of 3");
  await expect(page.getByTestId("tour-back")).toBeDisabled();
  await page.getByTestId("tour-next").click();
  await expect(page.getByTestId("tour-step")).toHaveText("Run it and read the result");
  await page.getByTestId("tour-back").click();
  await expect(page.getByTestId("tour-step")).toHaveText("Draw your system");
  await page.getByTestId("tour-next").click();
  await page.getByTestId("tour-next").click();
  await expect(page.getByTestId("tour-step")).toHaveText("Change one thing and run again");
  await expect(page.getByTestId("tour-finish")).toBeVisible();
  await expect(page.getByTestId("tour-skip")).toHaveCount(0);
  await expect(page.getByTestId("learn-links").getByRole("link")).toHaveCount(9);
  const headings = await page.locator("main h1, main h2, main h3").evaluateAll((els) => els.map((e) => Number(e.tagName[1])));
  for (let i = 1; i < headings.length; i++) expect(headings[i] - headings[i - 1]).toBeLessThanOrEqual(1);
  for (const width of [320, 390, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await noOverflow(page), `${width}px`).toBe(true);
  }
  expect(errors).toEqual([]);
});

test("P6 a page the person asked for still comes first, with no tour in the way", async ({ page }, info) => {
  await register(page, info.project.name + "-next", "/register?next=%2Flearn");
  await expect(page).toHaveURL(/\/learn$/);
});

test("P6 Skip goes to the dashboard and the tour then says it has been seen, for that account only", async ({ page, browser }, info) => {
  await register(page, info.project.name + "-skip");
  await expect(page.getByTestId("tour-done-note")).toHaveCount(0);
  await page.getByTestId("tour-skip").click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/welcome");
  await expect(page.getByTestId("tour-done-note")).toBeVisible();
  // A second new account in a fresh browser profile sees the tour as new.
  const use = info.project.use;
  const context = await browser.newContext({ baseURL: use.baseURL, viewport: use.viewport ?? undefined, colorScheme: use.colorScheme ?? undefined });
  const other = await context.newPage();
  await register(other, info.project.name + "-skip2");
  await expect(other.getByTestId("tour-done-note")).toHaveCount(0);
  await context.close();
});

test("P6 the sample button creates one design, opens it, and a second visit does not make another", async ({ page }, info) => {
  await register(page, info.project.name + "-sample");
  await page.getByTestId("start-sample").click();
  await expect(page).toHaveURL(/\/designs\/[^/]+\/edit$/);
  await expect(page.getByLabel("Replicas (1–200)")).toBeVisible();
  await page.goto("/dashboard");
  await expect(sampleCards(page)).toHaveCount(1);
  await page.goto("/welcome");
  await expect(page.getByTestId("tour-done-note")).toBeVisible();
  await page.goto("/dashboard");
  await expect(sampleCards(page)).toHaveCount(1);
});

test("P6 when creating the sample fails, the page says so, makes nothing, and a retry works", async ({ page }, info) => {
  await register(page, info.project.name + "-fail");
  // The server answers with an error. (A dropped connection is handled by the app-wide "cannot reach the server" screen.)
  await page.route(
    "**/v1/designs",
    (route) => (route.request().method() === "POST" ? route.fulfill({ status: 422, contentType: "application/json", headers: { "access-control-allow-origin": new URL(page.url()).origin, "access-control-allow-credentials": "true" }, body: JSON.stringify({ error: { code: "VALIDATION_FAILED", message: "Rejected" } }) }) : route.continue()),
    { times: 1 },
  );
  await page.getByTestId("start-sample").click();
  await expect(page.getByTestId("sample-error")).toContainText("could not be created");
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByTestId("start-sample")).toBeEnabled();
  await page.getByTestId("start-sample").click();
  await expect(page).toHaveURL(/\/designs\/[^/]+\/edit$/);
});

test("P6 the tour is reachable later from the dashboard and from Help", async ({ page }, info) => {
  await register(page, info.project.name + "-links");
  await page.goto("/dashboard");
  await page.getByRole("link", { name: "New here? Take the one-minute tour", exact: true }).click();
  await expect(page).toHaveURL(/\/welcome$/);
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Help for this screen", exact: true }).click();
  await page.getByRole("complementary", { name: "Help" }).getByRole("link", { name: "Take the one-minute tour", exact: true }).click();
  await expect(page).toHaveURL(/\/welcome$/);
});

test("P6 a guest is sent to log in first", async ({ page }) => {
  await page.goto("/welcome");
  await expect(page).toHaveURL(/\/login\?next=%2Fwelcome/);
});
