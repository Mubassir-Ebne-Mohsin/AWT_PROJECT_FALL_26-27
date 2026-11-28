import { test, expect } from "@playwright/test";
const graph = { nodes: [{ id: "clients", type: "client", label: "Saved clients", x: -240, y: 0 }, { id: "app", type: "app", label: "Saved app", x: 100, y: 0 }], edges: [{ id: "edge1", from: "clients", to: "app" }] };

test("Designs thumbnails preserve search, sorting, duplicate, archive and undo", async ({ page, context }, info) => {
 const errors: string[] = []; const reads: string[] = [];
 page.on("pageerror", e => errors.push(e.message));
 const user = { id: "fixture-user", displayName: "Library Tester", email: "library@example.test", role: "ROLE_USER" };
 let items = [graph, { nodes: [], edges: [] }, undefined].map((preview, i) => ({ id: "design"+i, name: ["My saved architecture", "Blank draft", "Older API example"][i], description: "Long description ".repeat(35), revision: 3, createdAt: "2026-11-25T10:00:00Z", updatedAt: "2026-11-25T10:00:00Z", archivedAt: null as string|null, nodeCount: preview?.nodes.length ?? 0, edgeCount: preview?.edges.length ?? 0, latestRun: null, preview }));
 await context.addCookies([{ name: "sf_session", value: "1", url: new URL(process.env.SF_WEB_URL ?? "http://localhost:3000").origin }]);
 await page.route("**/v1/**", async route => {
   const url = new URL(route.request().url()), path = url.pathname;
   let data: unknown = {};
   if (path.endsWith("/auth/refresh")) data = { accessToken: "fixture-only", expiresIn: 900, user };
   else if (path.endsWith("/account/roles")) data = { roles: [] };
   else if (path.endsWith("/library/designs")) {
     let rows = items.filter(d => (!url.searchParams.get("q") || d.name.includes(url.searchParams.get("q")!)) && (url.searchParams.get("archived") === "archived" ? !!d.archivedAt : !d.archivedAt));
     if (url.searchParams.get("sort") === "name") rows = [...rows].sort((a,b) => a.name.localeCompare(b.name));
     return route.fulfill({ json: { data: rows, meta: { page: 1, pageSize: 12, total: rows.length } } });
   } else if (path.endsWith("/duplicate")) {
     const original = items.find(d => path.includes("/"+d.id+"/"))!;
     items = [...items, { ...original, id: "copy", name: "Copy of " + original.name }]; data = { id: "copy" };
   } else if (path.endsWith("/archive") || path.endsWith("/unarchive")) {
     const item = items.find(d => path.includes("/"+d.id+"/"))!;
     item.archivedAt = path.endsWith("/unarchive") ? null : "2026-11-25T10:00:00Z";
     data = { designId: item.id, archived: !!item.archivedAt, archivedAt: item.archivedAt };
   } else if (/\/designs\//.test(path)) reads.push(path);
   return route.fulfill({ json: { data } });
 });
 await page.goto("/designs");
 const cards = page.getByTestId("library-item");
 await expect(cards).toHaveCount(3);
 await expect(page.getByRole("img", { name: /Saved architecture for My saved architecture/ })).toBeVisible();
 await expect(page.locator(".m15-design-preview").filter({ hasText: "Empty canvas" })).toBeVisible();
 for (const width of [1440,1024,390]) {
   await page.setViewportSize({ width, height: 1000 });
   await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
   await expect(page.locator(".m15-design-preview").first()).toHaveCSS("height", "108px");
   expect(await page.locator(".m15-design-description").first().evaluate(el => el.getBoundingClientRect().height)).toBeLessThan(45);
   await page.screenshot({ path: info.outputPath(`library-preview-${width}.png`), fullPage: true, animations: "disabled" });
 }
 expect(reads).toEqual([]);
 await page.getByLabel("Sort by", { exact: true }).selectOption("name");
 await expect(page).toHaveURL(/sort=name/);
 await page.getByLabel("Search", { exact: true }).fill("My saved architecture");
 await expect(cards).toHaveCount(1);
 await expect(cards.getByRole("link", { name: "Open", exact: true })).toHaveAttribute("href", "/designs/design0/edit");
 await cards.getByRole("button", { name: "Archive", exact: true }).click();
 await expect(page.getByTestId("library-empty")).toBeVisible();
 await page.getByRole("button", { name: "Undo", exact: true }).click();
 await expect(cards).toHaveCount(1);
 await cards.getByRole("button", { name: "Duplicate", exact: true }).click();
 await expect(cards).toHaveCount(2);
 expect(reads).toEqual([]); expect(errors).toEqual([]);
});
