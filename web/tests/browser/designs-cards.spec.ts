import { test, expect } from "@playwright/test";

// The design cards on /designs: the text sits inside the box with room around it, the buttons line up at the bottom, and
// hovering gives a smooth change instead of a jump.
test("design cards have inner spacing, aligned actions and a smooth hover", async ({ page }, info) => {
  await page.goto("/register?next=%2Fwelcome");
  await page.getByLabel("Name", { exact: true }).fill("Card Tester");
  await page.getByLabel("Email", { exact: true }).fill("cards-" + Date.now() + "-" + info.project.name + "@example.test");
  await page.getByLabel("Password", { exact: true }).fill("Cards-Layout-2026!");
  await page.locator("#reg-terms").check();
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByTestId("start-sample").click();
  await expect(page).toHaveURL(/\/designs\/[^/]+\/edit$/);
  await page.goto("/designs");
  const card = page.getByTestId("library-item").first();
  await expect(card).toBeVisible();

  const box = await card.evaluate((el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const title = el.querySelector("h2")!.getBoundingClientRect();
    const actions = el.querySelector(".m15-actions")!.getBoundingClientRect();
    return { padLeft: parseFloat(s.paddingLeft), padTop: parseFloat(s.paddingTop), padBottom: parseFloat(s.paddingBottom), transition: s.transitionProperty, duration: s.transitionDuration, gapLeft: title.left - r.left, gapTop: title.top - r.top, gapBottom: r.bottom - actions.bottom };
  });
  expect(box.padLeft).toBeGreaterThanOrEqual(16);
  expect(box.padTop).toBeGreaterThanOrEqual(16);
  expect(box.padBottom).toBeGreaterThanOrEqual(16);
  // The text really is inset from the edge of the box, not just padded on paper.
  expect(box.gapLeft).toBeGreaterThanOrEqual(16);
  expect(box.gapTop).toBeGreaterThanOrEqual(16);
  expect(box.gapBottom).toBeGreaterThanOrEqual(16);
  for (const prop of ["border-color", "box-shadow", "transform"]) expect(box.transition).toContain(prop);
  expect(parseFloat(box.duration)).toBeGreaterThan(0.1);

  const before = await card.evaluate((el) => ({ shadow: getComputedStyle(el).boxShadow, border: getComputedStyle(el).borderTopColor }));
  await card.hover();
  await expect.poll(() => card.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe(before.shadow);
  await expect.poll(() => card.evaluate((el) => getComputedStyle(el).borderTopColor)).not.toBe(before.border);
  await page.screenshot({ path: info.outputPath("designs-cards-hover.png") });

  const width = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  expect(width).toBe(true);
});

test("with reduced motion the hover does not move the card", async ({ browser }, info) => {
  const use = info.project.use;
  const context = await browser.newContext({ baseURL: use.baseURL, viewport: use.viewport ?? undefined, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/register?next=%2Fwelcome");
  await page.getByLabel("Name", { exact: true }).fill("Motion Tester");
  await page.getByLabel("Email", { exact: true }).fill("cards-rm-" + Date.now() + "-" + info.project.name + "@example.test");
  await page.getByLabel("Password", { exact: true }).fill("Cards-Layout-2026!");
  await page.locator("#reg-terms").check();
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByTestId("start-sample").click();
  await expect(page).toHaveURL(/\/designs\/[^/]+\/edit$/);
  await page.goto("/designs");
  const card = page.getByTestId("library-item").first();
  await card.hover();
  await expect.poll(() => card.evaluate((el) => getComputedStyle(el).transform)).toBe("none");
  await context.close();
});
