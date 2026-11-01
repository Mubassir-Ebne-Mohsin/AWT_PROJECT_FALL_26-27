import { test, expect, type Page } from "@playwright/test";

const PASSWORD = "P3-Examples-2026!";
const NAMES = ["Classic three-tier web app", "Read-heavy content site", "Write-heavy ingest pipeline", "E-commerce checkout", "Single-server MVP", "Photo sharing"];
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
async function signUp(page: Page, tag: string) {
  const email = "p3-" + Date.now() + "-" + tag + "@example.test";
  await page.goto("/register");
  await page.getByLabel("Name", { exact: true }).fill("Example Reader");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.locator("#reg-terms").check();
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();
}

test("P3 /examples: a guest sees six examples with their breaking points, no account and no requests", async ({ page }) => {
  const seen = watch(page);
  await page.goto("/examples");
  await expect(page).toHaveTitle("Examples · StressForge");
  await expect(page.locator("main h1")).toHaveText("Examples");
  await expect(page.getByTestId("example-panel")).toHaveCount(6);
  for (const name of NAMES) await expect(page.getByRole("heading", { name, level: 2 })).toBeVisible();
  await expect(page.getByTestId("breaking-point").first()).toContainText(/holds its goal up to about [\d,]+ requests a second/);
  // The two examples that miss their own goal say so.
  await expect(page.locator("#three-tier").getByTestId("own-result")).toContainText("misses its goal");
  await expect(page.locator("#three-tier").getByTestId("own-result")).toContainText("below the 1,200 it is tested at");
  await expect(page.locator("#mvp").getByTestId("own-result")).toContainText("meets its goal");
  await expect(page.getByText("Nothing here was measured on real servers")).toBeVisible();
  const headings = await page.locator("main h1, main h2, main h3").evaluateAll((els) => els.map((e) => Number(e.tagName[1])));
  for (let i = 1; i < headings.length; i++) expect(headings[i] - headings[i - 1]).toBeLessThanOrEqual(1);
  for (const width of [320, 390, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await noOverflow(page), `examples at ${width}px`).toBe(true);
  }
  expect(seen.api).toEqual([]);
  expect(seen.errors).toEqual([]);
});

test("P3 /examples: each load explorer is usable from the keyboard and changes what is written", async ({ page }) => {
  await page.goto("/examples");
  for (const id of ["three-tier", "content", "ingest", "checkout", "mvp", "media"]) {
    const panel = page.locator("#" + id);
    const summary = panel.getByTestId("explorer-summary");
    const slider = panel.getByTestId("explorer").locator("input[type=range]");
    const before = await summary.textContent();
    await slider.focus();
    await expect(slider).toBeFocused();
    await page.keyboard.press("End");
    await expect(summary).toContainText("misses the goal");
    await page.keyboard.press("Home");
    await expect(summary).toContainText("meets the goal");
    expect(await summary.textContent()).not.toBe(before);
    await expect(summary).not.toContainText(/NaN|Infinity|undefined/);
  }
});

test("P3 /examples: the jump links land on the right example, and a guest's copy button leads to sign-up and back", async ({ page }) => {
  await page.goto("/examples");
  await page.getByRole("navigation", { name: "Jump to an example" }).getByRole("link", { name: "Photo sharing" }).click();
  await expect(page).toHaveURL(/#media$/);
  await expect(page.locator("#media")).toBeInViewport();
  const copy = page.locator("#mvp").getByTestId("make-copy");
  await expect(copy).toHaveAttribute("href", "/register?next=" + encodeURIComponent("/new/template?template=mvp"));
  await copy.click();
  await expect(page).toHaveURL(/\/register\?next=/);
  await expect(page.getByRole("button", { name: "Create account", exact: true })).toBeVisible();
});

test("P3 /templates and /components ask a guest to sign in first", async ({ page }) => {
  for (const path of ["/templates", "/components"]) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp("/login\\?next=" + encodeURIComponent(path).replace(/%/g, "%")));
  }
});

test("P3 /templates: signed in, the library filters by what is inside and starts the existing flow", async ({ page }, info) => {
  const seen = watch(page);
  await signUp(page, info.project.name + "-tpl");
  await page.goto("/templates");
  await expect(page).toHaveTitle("Templates · StressForge");
  await expect(page.getByTestId("template-card")).toHaveCount(6);
  await expect(page.getByTestId("template-count")).toHaveText("Showing 6 of 6 templates");
  await page.getByLabel("Has a queue", { exact: true }).check();
  await expect(page.getByTestId("template-card")).toHaveCount(2);
  await page.getByLabel("Has a cache", { exact: true }).check();
  await expect(page.getByTestId("template-card")).toHaveCount(1);
  await expect(page.getByTestId("template-card").getByRole("heading", { level: 2 })).toHaveText("E-commerce checkout");
  await page.getByLabel("Uses object storage", { exact: true }).check();
  await expect(page.getByText("No template has all of those")).toBeVisible();
  await page.getByLabel("Uses object storage", { exact: true }).uncheck();
  await page.getByLabel("Has a queue", { exact: true }).uncheck();
  await page.getByLabel("Has a cache", { exact: true }).uncheck();
  await expect(page.getByTestId("template-card")).toHaveCount(6);
  for (const width of [320, 390, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await noOverflow(page), `templates at ${width}px`).toBe(true);
  }
  await page.locator("[data-id=mvp]").getByTestId("start-template").click();
  await expect(page).toHaveURL(/\/new\/template\?template=mvp/);
  await expect(page.getByText("Single-server MVP").first()).toBeVisible();
  expect(seen.errors).toEqual([]);
});

test("P3 /components: signed in, all twelve components with their overload behaviour, then the five traffic presets", async ({ page }, info) => {
  const seen = watch(page);
  await signUp(page, info.project.name + "-cmp");
  await page.goto("/components");
  await expect(page).toHaveTitle("Components · StressForge");
  await expect(page.getByTestId("component-card")).toHaveCount(12);
  await expect(page.getByTestId("category")).toHaveCount(7);
  await expect(page.locator("[data-type=db]").getByTestId("overload")).toContainText("wait until they time out");
  await expect(page.locator("[data-type=queue]").getByTestId("overload")).toContainText("turns away what does not fit");
  await expect(page.getByTestId("preset-row")).toHaveCount(5);
  await expect(page.getByText("They describe load, not products")).toBeVisible();
  await expect(page.getByText(/Postgres|Redis cluster|4-core/i)).toHaveCount(0);
  for (const width of [320, 390, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await noOverflow(page), `components at ${width}px`).toBe(true);
  }
  expect(seen.errors).toEqual([]);
});

test("P3 /examples: a signed-in person's button goes straight to the template", async ({ page }, info) => {
  await signUp(page, info.project.name + "-ex");
  await page.goto("/examples");
  const start = page.locator("#content").getByTestId("make-copy");
  await expect(start).toHaveText("Start from Read-heavy content site");
  await expect(start).toHaveAttribute("href", "/new/template?template=content");
  await start.click();
  await expect(page).toHaveURL(/\/new\/template\?template=content/);
});
