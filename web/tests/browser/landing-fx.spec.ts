import { expect, test, type Page } from "@playwright/test";

// Interaction and motion checks for the public page. They need no backend, account or data.
const LAYER_NAMES = ["CLIENTS", "ROUTING", "COMPUTE", "DATA"];
const cssVar = (page: Page, selector: string, name: string) => page.locator(selector).evaluate((el, n) => getComputedStyle(el).getPropertyValue(n).trim(), name);
const settle = (page: Page) => page.waitForTimeout(1200);

async function overHero(page: Page, x = 0.55, y = 0.5) {
  const box = (await page.locator(".sf-hero-object").boundingBox())!;
  await page.mouse.move(box.x + box.width * x, box.y + box.height * y);
}

test("hovering a layer inspects it, dims the others and names it", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  const hero = page.locator(".sf-specimen--hero");
  await expect(hero.locator(".sf-layer-card")).toContainText("Hover a layer to inspect it");
  await overHero(page);
  // The stack opens under the pointer, so wait for it to settle before reading which plate is under the cursor.
  await settle(page);
  await expect.poll(() => hero.getAttribute("data-active")).not.toBeNull();
  const index = Number(await hero.getAttribute("data-active"));
  expect(index).toBeGreaterThanOrEqual(0);
  expect(index).toBeLessThanOrEqual(3);
  await expect(hero.locator(".sf-layer-card")).toContainText(LAYER_NAMES[index]);
  await settle(page);
  const other = (index + 1) % 4;
  expect(Number(await hero.locator(`.sf-plate--${index}`).evaluate((el) => getComputedStyle(el).opacity))).toBe(1);
  expect(Number(await hero.locator(`.sf-plate--${other}`).evaluate((el) => getComputedStyle(el).opacity))).toBeLessThan(0.5);
  expect(await hero.locator(`.sf-plate--${index}`).evaluate((el) => getComputedStyle(el).filter)).toContain("drop-shadow");
  await page.mouse.move(2, 2);
  await expect.poll(() => hero.getAttribute("data-active")).toBeNull();
  await expect(hero.locator(".sf-layer-card")).toContainText("Hover a layer to inspect it");
  expect(errors).toEqual([]);
});

test("layers are keyboard reachable, and Enter pins a layer until it is pressed again", async ({ page }) => {
  await page.goto("/");
  const hero = page.locator(".sf-specimen--hero");
  const plate = hero.locator(".sf-plate--2");
  await expect(plate).toHaveAttribute("role", "button");
  await plate.focus();
  await expect(hero).toHaveAttribute("data-active", "2");
  await expect(hero.locator(".sf-layer-card")).toContainText("COMPUTE");
  await page.keyboard.press("Enter");
  await expect(plate).toHaveAttribute("aria-pressed", "true");
  await page.locator(".sf-login").focus();
  await expect(hero).toHaveAttribute("data-active", "2"); // pinned: stays after focus moves on
  await plate.focus();
  await page.keyboard.press("Enter");
  await expect(plate).toHaveAttribute("aria-pressed", "false");
  await page.locator(".sf-login").focus();
  await expect(hero).not.toHaveAttribute("data-active", /.+/);
});

test("the hero stack opens under the pointer and closes again, with a glide and a tilt", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  expect(Number(await cssVar(page, ".sf-specimen--hero", "--separation"))).toBeCloseTo(0.13, 2);
  await overHero(page, 0.7, 0.3);
  await expect.poll(async () => Number(await cssVar(page, ".sf-specimen--hero", "--separation"))).toBeCloseTo(0.62, 2);
  await settle(page);
  expect(Math.abs(parseFloat(await cssVar(page, ".sf-specimen--hero", "--tilt-y")))).toBeGreaterThan(0.2);
  await page.mouse.move(2, 2);
  await expect.poll(async () => Number(await cssVar(page, ".sf-specimen--hero", "--separation"))).toBeCloseTo(0.13, 2);
  await expect.poll(async () => parseFloat(await cssVar(page, ".sf-specimen--hero", "--tilt-y"))).toBeCloseTo(0, 1);
});

test("the scroll glide is visual only: separation stays exact while the eased offset decays to zero", async ({ page }) => {
  await page.goto("/");
  const story = ".sf-specimen--scroll";
  const jump = (fraction: number) =>
    page.locator("#main").evaluate((el, f) => {
      const s = document.querySelector<HTMLElement>("[data-architecture-story]")!;
      const top = el.scrollTop + s.getBoundingClientRect().top - el.getBoundingClientRect().top;
      el.scrollTo({ top: top - 100 + (s.offsetHeight - innerHeight) * f, behavior: "instant" });
    }, fraction);
  await jump(0);
  await expect.poll(async () => Number(await cssVar(page, story, "--delta"))).toBe(0);
  await jump(0.5);
  // The target is exact at once; the eased value lags it, so the offset is non-zero right after a jump.
  await expect.poll(async () => Number(await cssVar(page, story, "--separation"))).toBe(1);
  await expect.poll(async () => Math.abs(Number(await cssVar(page, story, "--delta")))).toBeGreaterThan(0.01);
  // It always settles exactly on the target: nothing drifts, and the plate itself carries the exact value.
  await expect.poll(async () => Number(await cssVar(page, story, "--delta")), { timeout: 8000 }).toBe(0);
  expect(Number(await cssVar(page, story, "--shown"))).toBe(1);
  expect(await page.locator(`${story} .sf-plate--0`).evaluate((el) => getComputedStyle(el).transform)).toBe("matrix(1, 0, 0, 1, 0, 0)");
});

test("sections reveal as they are reached, the header tracks progress and navigation follows the story", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".sf-landing")).toHaveClass(/sf-fx/);
  const heading = page.locator("#sf-premise-title");
  expect(Number(await heading.evaluate((el) => getComputedStyle(el).opacity))).toBe(0);
  expect(Number(await cssVar(page, ".sf-landing", "--progress"))).toBe(0);
  await page.locator("#main").evaluate(() => document.getElementById("the-idea")!.scrollIntoView({ behavior: "instant" }));
  await expect(heading).toHaveClass(/is-in/);
  await expect.poll(async () => Number(await heading.evaluate((el) => getComputedStyle(el).opacity))).toBe(1);
  await expect(page.locator('[data-nav="the-idea"]')).toHaveAttribute("data-active", "");
  await page.locator("#main").evaluate(() => document.getElementById("inside")!.scrollIntoView({ behavior: "instant" }));
  await expect(page.locator('[data-nav="inside"]')).toHaveAttribute("data-active", "");
  await expect(page.locator('[data-nav="the-idea"]')).not.toHaveAttribute("data-active", "");
  await expect(page.locator(".sf-story-step.is-active")).toHaveCount(1);
  await page.locator("#main").evaluate((el) => el.scrollTo({ top: el.scrollHeight, behavior: "instant" }));
  await expect.poll(async () => Number(await cssVar(page, ".sf-landing", "--progress"))).toBeGreaterThan(0.99);
});

test("a cursor lamp, plotter crosshair and magnetic buttons follow the pointer, then let go", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  await expect(page.locator(".sf-landing")).not.toHaveAttribute("data-pointer", "true");
  await overHero(page, 0.4, 0.6);
  await expect(page.locator(".sf-landing")).toHaveAttribute("data-pointer", "true");
  const lamp = await page.locator(".sf-spotlight").evaluate((el) => (el as HTMLElement).style.transform);
  expect(lamp).toMatch(/translate3d/);
  await overHero(page, 0.6, 0.4);
  await expect.poll(() => page.locator(".sf-spotlight").evaluate((el) => (el as HTMLElement).style.transform)).not.toBe(lamp);
  await expect(page.locator(".sf-hero-object")).toHaveAttribute("data-hover", "true");
  await expect(page.locator("[data-readout]")).toHaveText(/^X \d{4} · Y \d{4}$/);
  const first = await page.locator("[data-readout]").textContent();
  await overHero(page, 0.3, 0.3);
  await expect.poll(() => page.locator("[data-readout]").textContent()).not.toBe(first);
  const button = page.locator(".sf-hero .sf-button");
  const box = (await button.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.8);
  await expect.poll(async () => parseFloat(await button.evaluate((el) => (el as HTMLElement).style.getPropertyValue("--bx") || "0"))).toBeGreaterThan(1);
  await page.mouse.move(2, 400);
  await expect.poll(() => button.evaluate((el) => (el as HTMLElement).style.getPropertyValue("--bx"))).toBe("");
});

test("reduced motion removes pointer effects, glides and hidden reveal states", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await settle(page);
  await overHero(page);
  await expect(page.locator(".sf-landing")).not.toHaveAttribute("data-pointer", "true");
  expect(Number(await cssVar(page, ".sf-specimen--hero", "--separation"))).toBeCloseTo(0.13, 2); // no hover-open
  expect(await cssVar(page, ".sf-specimen--hero", "--tilt-y")).toBe("0deg");
  expect(Number(await page.locator("#sf-premise-title").evaluate((el) => getComputedStyle(el).opacity))).toBe(1);
  expect(await page.locator(".sf-spotlight").evaluate((el) => getComputedStyle(el).display)).toBe("none");
  expect(await page.locator(".sf-specimen--hero").evaluate((el) => getComputedStyle(el.querySelector(".sf-float")!).animationName)).toBe("none");
  expect(await page.locator(".sf-hero h1").evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  expect(await page.locator(".sf-story-step").nth(2).evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
});

test("on a touch screen there is no hover machinery, and tapping a layer inspects it", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await settle(page);
  const hero = page.locator(".sf-specimen--hero");
  await expect(hero.locator(".sf-hint-coarse")).toBeVisible();
  await expect(hero.locator(".sf-hint-fine")).toBeHidden();
  await expect(page.locator(".sf-landing")).not.toHaveAttribute("data-pointer", "true");
  expect(Number(await cssVar(page, ".sf-specimen--hero", "--separation"))).toBeCloseTo(0.13, 2);
  const box = (await hero.locator("svg").boundingBox())!;
  await page.touchscreen.tap(box.x + box.width * 0.5, box.y + box.height * 0.45);
  await expect.poll(() => hero.getAttribute("data-active")).not.toBeNull();
  expect(await page.locator("#main").evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  expect(errors).toEqual([]);
  await context.close();
});

// ---- The pressure core: the story figure ----
const core = ".sf-core";
const jumpStory = (page: Page, fraction: number) =>
  page.locator("#main").evaluate((el, f) => {
    const s = document.querySelector<HTMLElement>("[data-architecture-story]")!;
    const top = el.scrollTop + s.getBoundingClientRect().top - el.getBoundingClientRect().top;
    el.scrollTo({ top: top - 100 + (s.offsetHeight - innerHeight) * f, behavior: "instant" });
  }, fraction);
const num = async (page: Page, name: string) => Number(await cssVar(page, core, name));
const replicaOpacity = (page: Page) => page.locator(`${core} .sf-node.sf-replica`).first().evaluate((el) => Number(getComputedStyle(el).opacity));

test("the story figure is a different illustration, not a second copy of the hero", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".sf-specimen--hero .sf-plate-top")).toHaveCount(4); // the isometric layers stay in the hero
  await expect(page.locator(`${core} .sf-plate-top`)).toHaveCount(0);
  await expect(page.locator(`${core} .sf-ring`)).toHaveCount(4); // rings, not stacked plates
  await expect(page.locator(`${core} .sf-pkt`)).toHaveCount(36); // 12 spokes, 3 packets each
  await expect(page.locator(`${core} .sf-hud`)).toContainText("THE PRESSURE CORE");
});

test("scrolling tells the story: rings build, load rises, the core heats, replicas appear and the core stays hot", async ({ page }) => {
  await page.goto("/");
  await jumpStory(page, 0.02);
  await expect.poll(async () => await num(page, "--load")).toBeLessThan(0.05);
  expect(await num(page, "--scale-out")).toBe(0);
  await expect(page.locator(core)).toHaveAttribute("data-phase", "assemble");
  expect(await replicaOpacity(page)).toBe(0);
  await jumpStory(page, 0.5);
  await expect.poll(async () => await num(page, "--load"), { timeout: 8000 }).toBeGreaterThan(0.95);
  await expect.poll(async () => await num(page, "--heat"), { timeout: 8000 }).toBeGreaterThan(0.4);
  expect(await num(page, "--heat")).toBeLessThan(0.7);
  expect(await num(page, "--scale-out")).toBe(0);
  await expect(page.locator(core)).toHaveAttribute("data-phase", "inspect");
  await jumpStory(page, 0.9);
  await expect.poll(async () => await num(page, "--scale-out"), { timeout: 8000 }).toBe(1);
  await expect.poll(async () => await num(page, "--heat"), { timeout: 8000 }).toBeGreaterThan(0.99);
  await expect(page.locator(core)).toHaveAttribute("data-phase", "rethink");
  expect(await replicaOpacity(page)).toBe(1);
  expect(await num(page, "--separation")).toBeLessThan(0.5); // the system closes up again, still hot
  // Reversible: scrolling back removes the replicas and cools the core.
  await jumpStory(page, 0.5);
  await expect.poll(async () => await num(page, "--scale-out"), { timeout: 8000 }).toBe(0);
  await expect.poll(async () => await num(page, "--heat"), { timeout: 8000 }).toBeLessThan(0.7);
});

test("a ring can be inspected, and holding the core stresses it until it is released", async ({ page }) => {
  await page.goto("/");
  await jumpStory(page, 0.5);
  await settle(page);
  const svg = (await page.locator(`${core} svg`).boundingBox())!;
  const k = svg.width / 680;
  await page.mouse.move(svg.x + (340 + 118) * k, svg.y + 300 * k); // on the compute ring
  await expect(page.locator(core)).toHaveAttribute("data-active", "2");
  await expect(page.locator(`${core} .sf-layer-card`)).toContainText("COMPUTE");
  await expect.poll(async () => Number(await page.locator(`${core} .sf-plate--0`).evaluate((el) => getComputedStyle(el).opacity))).toBeLessThan(0.5);
  await page.mouse.move(2, 2);
  await jumpStory(page, 0.05);
  await expect.poll(async () => await num(page, "--load"), { timeout: 8000 }).toBeLessThan(0.1);
  const box = (await page.locator(`${core} svg`).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect.poll(async () => await num(page, "--load"), { timeout: 8000 }).toBeGreaterThan(0.4);
  await expect.poll(async () => await num(page, "--heat"), { timeout: 8000 }).toBeGreaterThan(0.45);
  await page.mouse.up();
  await expect.poll(async () => await num(page, "--load"), { timeout: 8000 }).toBeLessThan(0.1);
  await expect.poll(async () => await num(page, "--heat"), { timeout: 8000 }).toBeLessThan(0.1);
});

test("reduced motion shows the finished core as a still diagram", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await settle(page);
  expect(await num(page, "--separation")).toBe(1);
  expect(await num(page, "--scale-out")).toBe(1);
  expect(await num(page, "--load")).toBeCloseTo(0.7, 2);
  expect(await num(page, "--heat")).toBeCloseTo(0.75, 2);
  expect(await page.locator(`${core} .sf-ray`).first().evaluate((el) => getComputedStyle(el).display)).toBe("none");
  expect(await page.locator(`${core} .sf-sweep`).evaluate((el) => getComputedStyle(el).display)).toBe("none");
  expect(await page.locator(`${core} .sf-spin`).first().evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
});
