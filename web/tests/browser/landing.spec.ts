import { expect, test } from "@playwright/test";

// Public-page checks require no backend, account creation or production data.
test("landing entry, reversible anatomy and existing auth routes", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Good on paper.");
  await expect(page.getByRole("link", { name: "Log in", exact: false }).first()).toHaveAttribute("href", "/login");
  const root = page.locator("#main");
  const specimen = page.locator(".sf-specimen--scroll");
  const move = async (fraction: number) => {
    await root.evaluate((el, fraction) => {
      const story = document.querySelector<HTMLElement>("[data-architecture-story]")!;
      const top = el.scrollTop + story.getBoundingClientRect().top - el.getBoundingClientRect().top;
      el.scrollTo({ top: top - 100 + (story.offsetHeight - innerHeight) * fraction, behavior: "instant" });
    }, fraction);
  };
  await move(0);
  await expect.poll(() => specimen.evaluate(el => Number(getComputedStyle(el).getPropertyValue("--separation")))).toBeLessThan(.05);
  const assembled = await page.locator(".sf-specimen--scroll .sf-plate--0").evaluate(el => getComputedStyle(el).transform);
  await move(.5);
  await expect.poll(() => specimen.evaluate(el => Number(getComputedStyle(el).getPropertyValue("--separation")))).toBeGreaterThan(.95);
  const exploded = await page.locator(".sf-specimen--scroll .sf-plate--0").evaluate(el => getComputedStyle(el).transform);
  expect(exploded).not.toBe(assembled);
  await move(1);
  await expect.poll(() => specimen.evaluate(el => Number(getComputedStyle(el).getPropertyValue("--separation")))).toBeLessThan(.05);

  await move(.5);
  await expect.poll(() => page.locator(".sf-specimen--scroll .sf-plate--0").evaluate(el => getComputedStyle(el).transform)).toBe(exploded);
  for (const fraction of [.1, .8, .3, .9, .5]) await move(fraction);
  await expect(specimen).toHaveAttribute("data-phase", "inspect");
  expect(await root.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.getByRole("link", { name: "Log in", exact: false }).first().click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Log in", exact: true })).toBeVisible();
  await expect(page.locator(".sf-public-header")).toHaveCount(0);
  await page.goto("/");
  await page.getByRole("link", { name: "Build your first system" }).click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.getByLabel("Name", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("mobile layout, keyboard entry and reduced motion", async ({ page }) => {
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    expect(await page.locator("#main").evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await expect(page.getByRole("heading", { level: 1 })).toBeInViewport();
    await page.locator(".sf-login").focus();
    await expect(page.locator(".sf-login")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/login$/);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".sf-story-visual")).toHaveCSS("position", "relative");
  await expect.poll(() => page.locator(".sf-specimen--scroll").evaluate(el => Number(getComputedStyle(el).getPropertyValue("--separation")))).toBe(1);
  await expect(page.locator("#main")).toHaveCSS("scroll-behavior", "auto");
  await expect(page.getByText("Real AI assistance is planned.", { exact: false })).toBeAttached();
  await page.getByRole("link", { name: "Create your account" }).click();
  await expect(page).toHaveURL(/\/register$/);
});

test("public story remains readable without JavaScript or the API", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(baseURL!);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Good on paper.");
  await expect(page.getByRole("heading", { name: "Look past the boxes." })).toBeAttached();
  await expect(page.getByRole("link", { name: "Create your account" })).toHaveAttribute("href", "/register");
  expect(await page.locator("#main").evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.locator(".sf-login").click();
  await expect(page).toHaveURL(/\/login$/);
  await context.close();
});

test("API outage cannot hide the public entry; protected return-to remains intact", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "sf_session", value: "1", url: baseURL! }]);
  await page.route("**/v1/auth/refresh", route => route.abort("failed"));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Good on paper.");
  await expect(page.locator(".sf-login")).toBeVisible();
  await context.clearCookies();
  await page.goto("/new/template?landing-check=1");
  await expect(page).toHaveURL(/\/login\?next=%2Fnew%2Ftemplate%3Flanding-check%3D1$/);
  await expect(page.getByRole("heading", { name: "Log in", exact: true })).toBeVisible();
});
