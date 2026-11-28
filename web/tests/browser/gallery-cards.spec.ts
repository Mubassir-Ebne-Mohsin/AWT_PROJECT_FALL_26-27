import { test, expect } from "@playwright/test";

// Isolated transport fixtures: no user account, publication or backend data is changed.
const nodes = [
  { id: "users", type: "client", label: "Clients", x: -120, y: 100 },
  { id: "lb", type: "lb", label: "Load balancer", x: 160, y: 100 },
  { id: "app", type: "app", label: "App server", x: 440, y: 100 },
  { id: "cache", type: "cache", label: "Cache", x: 720, y: 0 },
  { id: "db", type: "db", label: "Database", x: 1000, y: 0 },
  { id: "queue", type: "queue", label: "Queue", x: 720, y: 200 },
];
const edges = [["users", "lb"], ["lb", "app"], ["app", "cache"], ["cache", "db"], ["app", "queue"]].map(([from, to], i) => ({ id: "edge" + i, from, to }));
const posts = Array.from({ length: 6 }, (_, i) => ({ id: "post" + i, title: ["Bookshop with cached reads", "Background order processing", "Photo sharing platform", "A long architecture title that wraps naturally without pushing the card outside its grid", "Regional API", "Legacy published design"][i], description: "A published snapshot with cached reads and asynchronous order processing.", ownerName: i === 1 ? "Other builder" : "Gallery Tester", ownerUsername: i === 0 ? "gallery_builder" : null, isMine: i !== 1, publishedAt: "2026-11-25T10:00:00Z", revision: 12, verdict: ["pass", "strained", "fail"][i % 3], p95: 60.17 + i, p95Target: 300, nodeCount: nodes.length, tags: ["client", "lb", "app", "cache", "db", "queue"], remixCount: i, allowRemix: i !== 1, preview: i === 5 ? null : { nodes, edges } }));

test("Gallery cards: themes, responsive diagrams, filters, errors and keyboard", async ({ page, context }, info) => {
 const errors: string[] = [];
 page.on("pageerror", e => errors.push(e.message));
 let galleryRequests = 0;
 const detailRequests: string[] = [];
 page.on("request", req => { if (/\/v1\/gallery\//.test(req.url())) detailRequests.push(req.url()); });
 let fail = false;
 await context.addCookies([{ name: "sf_session", value: "1", url: new URL(info.project.use.baseURL ?? process.env.SF_WEB_URL ?? "http://localhost:3000").origin }]);
 await page.route("**/v1/**", async route => {
   const url = new URL(route.request().url());
   let data: unknown = {};
   if (url.pathname.endsWith("/auth/refresh")) data = { accessToken: "isolated-fixture", expiresIn: 900, user: { id: "test-user", email: "fixture@example.test", displayName: "Gallery Tester", role: "ROLE_USER" } };
   else if (url.pathname.endsWith("/account/roles")) data = { roles: [] };
   else if (url.pathname.endsWith("/gallery")) {
     galleryRequests++;
     if (fail) return route.fulfill({ status: 503, json: { error: { code: "UNAVAILABLE", message: "Fixture outage" } } });
     const filtered = posts.filter(p => (!url.searchParams.get("q") || p.title.includes(url.searchParams.get("q")!)) && (!url.searchParams.get("verdict") || p.verdict === url.searchParams.get("verdict")) && (url.searchParams.get("mine") !== "true" || p.isMine) && (!url.searchParams.get("tag") || p.tags.includes(url.searchParams.get("tag")!)));
     data = { items: filtered, total: filtered.length, page: 1, pageSize: 12 };
   }
   return route.fulfill({ json: { data } });
 });
 await page.goto("/gallery");
 await expect(page.getByTestId("gallery-items").locator("article")).toHaveCount(6);
 await expect(page.getByRole("img", { name: /Published architecture for Bookshop/ })).toBeVisible();
 await expect(page.getByText("Diagram preview unavailable")).toBeVisible();
 await expect(page.getByText("View only", { exact: true })).toBeVisible();
 await expect(page.getByText("@gallery_builder", { exact: true })).toBeVisible();
 expect(galleryRequests).toBeLessThanOrEqual(2); // Development Strict Mode may cancel and remount once.
 expect(detailRequests).toEqual([]);
 for (const width of [1440, 1024, 390]) {
   await page.setViewportSize({ width, height: 1000 });
   await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
   const heights = await page.locator(".gallery-card").evaluateAll(cards => cards.map(card => card.getBoundingClientRect().height));
   expect(Math.max(...heights)).toBeLessThanOrEqual(340);
   const columns = await page.locator(".gallery-grid").evaluate(el => getComputedStyle(el).gridTemplateColumns.split(" ").length);
   expect(columns).toBe(width === 1440 ? 3 : width === 1024 ? 2 : 1);
   await page.screenshot({ path: info.outputPath(`gallery-${width}.png`), fullPage: true, animations: "disabled" });
 }
 await page.getByLabel("Filter by result").selectOption("strained");
 await expect(page.getByTestId("gallery-items").locator("article")).toHaveCount(2);
 await page.getByRole("button", { name: "Clear filters", exact: true }).click();
 await expect(page.getByTestId("gallery-items").locator("article")).toHaveCount(6);
 await page.getByLabel("Search the gallery").fill("nonexistent");
 await page.getByRole("button", { name: "Search", exact: true }).click();
 await expect(page.getByTestId("gallery-empty")).toBeVisible();
 await page.getByRole("button", { name: "Clear filters", exact: true }).click();
 await page.getByLabel("Only mine").check();
 await expect(page.getByTestId("gallery-items").locator("article")).toHaveCount(5);
 await page.getByRole("button", { name: "Clear filters", exact: true }).click();
 const title = page.getByRole("link", { name: "Bookshop with cached reads", exact: true });
 await title.focus(); await expect(title).toBeFocused();
 await page.emulateMedia({ reducedMotion: "reduce" });
 expect(await page.locator(".gallery-card").first().evaluate(el => parseFloat(getComputedStyle(el).transitionDuration))).toBeLessThanOrEqual(0.001);
 fail = true;
 await page.getByRole("button", { name: "Load balancer", exact: true }).first().click();
 await expect(page.getByRole("heading", { name: "The gallery could not be loaded" })).toBeVisible();
 fail = false;
 await page.getByRole("button", { name: "Try again", exact: true }).click();
 await expect(page.getByTestId("gallery-items").locator("article")).toHaveCount(6);
 expect(errors).toEqual([]);
});
