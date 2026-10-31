import { test, expect, type Page } from "@playwright/test";

// P1 public pages: a guest (no account, no cookies) reads them. Each page must be real text, not a placeholder,
// must not call the API, and must fit narrow screens.
const PAGES: Array<{ path: string; title: string; mustSay: RegExp[] }> = [
  { path: "/how-it-works", title: "How it works", mustSay: [/not a measurement of real infrastructure/, /Sakasegawa/, /50 components and 200 connections/, /no real application has been load-tested/] },
  { path: "/about", title: "About", mustSay: [/Advanced Web Technologies/, /Admins cannot read anyone's designs/, /Open the source repository/] },
  { path: "/privacy", title: "Privacy", mustSay: [/salted hash of your password/, /switched off/, /download everything you have stored and delete your account/] },
  { path: "/terms", title: "Terms", mustSay: [/Results are estimates/, /20 graded submissions/, /No warranty/] },
];
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

for (const p of PAGES) {
  test(`P1 ${p.path} reads as real content for a guest, with no API calls, at every width`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const apiCalls: string[] = [];
    page.on("request", (r) => {
      if (/\/v1\//.test(r.url())) apiCalls.push(r.url());
    });
    await page.goto(p.path);
    await expect(page).toHaveTitle(`${p.title} · StressForge`);
    await expect(page.locator("main h1")).toHaveCount(1);
    await expect(page.locator("main h1")).toHaveText(p.title);
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toBeVisible();
    for (const text of p.mustSay) await expect(page.getByTestId("public-page")).toContainText(text);
    await expect(page.getByText("Planned for this screen")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
    // Headings never skip a level (h1 then h2, h3 only below an h2).
    const levels = await page.locator("main h1, main h2, main h3, main h4").evaluateAll((els) => els.map((e) => Number(e.tagName[1])));
    for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
    for (const width of [320, 390, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await noOverflow(page), `${p.path} at ${width}px`).toBe(true);
    }
    expect(apiCalls.filter((u) => !/\/auth\/(refresh|me)/.test(u))).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test("P1 the pages link to each other and to sign-up, and the register form's terms links open the real pages", async ({ page }) => {
  await page.goto("/how-it-works");
  await page.getByRole("link", { name: "Create an account", exact: true }).click();
  await expect(page).toHaveURL(/\/register/);
  await page.getByRole("link", { name: "terms", exact: true }).click();
  await expect(page.locator("main h1")).toHaveText("Terms");
  await expect(page.getByTestId("public-section").first()).toBeVisible();
  await page.goto("/register");
  await page.getByRole("link", { name: "privacy notes", exact: true }).click();
  await expect(page.locator("main h1")).toHaveText("Privacy");
  await expect(page.getByTestId("privacy-row")).toHaveCount(7);
});

test("P1 the about page's source link opens in a new tab safely", async ({ page }) => {
  await page.goto("/about");
  const link = page.getByRole("link", { name: "Open the source repository", exact: true });
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /noopener/);
  await expect(link).toHaveAttribute("href", "https://github.com/Mubassir-Ebne-Mohsin/AWT_PROJECT_FALL_26-27");
});
