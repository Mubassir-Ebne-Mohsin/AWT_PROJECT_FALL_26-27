import { test, expect } from "@playwright/test";
const preview = { nodes: [{ id: "clients", type: "client", label: "Saved clients", x: -240, y: 0 }, { id: "app", type: "app", label: "Saved app", x: 100, y: 0 }], edges: [{ id: "edge1", from: "clients", to: "app" }] };

test("Dashboard cards show saved thumbnails without changing links or delete confirmation", async ({ page, context }, info) => {
 const errors: string[] = []; const detailRequests: string[] = [];
 page.on("pageerror", e => errors.push(e.message));
 page.on("request", req => { if (/\/v1\/designs\//.test(req.url())) detailRequests.push(req.url()); });
 const user = { id: "fixture-user", displayName: "Dashboard Tester", email: "dashboard@example.test", role: "ROLE_USER" };
 await context.addCookies([{ name: "sf_session", value: "1", url: new URL(process.env.SF_WEB_URL ?? "http://localhost:3000").origin }]);
 await page.route("**/v1/**", async route => {
   const path = new URL(route.request().url()).pathname;
   let data: unknown = {};
   if (path.endsWith("/auth/refresh")) data = { accessToken: "fixture-only", expiresIn: 900, user };
   else if (path.endsWith("/auth/me")) data = user;
   else if (path.endsWith("/account/roles")) data = { roles: [] };
   else if (path.endsWith("/dashboard")) data = { designs: [preview, { nodes: [], edges: [] }, undefined].map((graph, i) => ({ id: "design" + i, name: ["My saved architecture", "Blank draft", "Older API example"][i], description: "", source: "blank", templateId: null, revision: 3, createdAt: "2026-11-25T10:00:00Z", updatedAt: "2026-11-25T10:00:00Z", nodeCount: graph?.nodes.length ?? 0, edgeCount: graph?.edges.length ?? 0, latestRun: null, preview: graph })), recentRuns: [], counts: { designs: 3, retainedRuns: 0 }, countsLabel: "Runs in the retained window" };
   return route.fulfill({ json: { data } });
 });
 await page.goto("/dashboard");
 await expect(page.locator(".dashboard-design-card")).toHaveCount(3);
 await expect(page.getByRole("img", { name: /Saved architecture for My saved architecture/ })).toBeVisible();
 await expect(page.locator(".dashboard-preview").filter({ hasText: "Empty canvas" })).toBeVisible();
 await expect(page.locator(".dashboard-preview").filter({ hasText: "Diagram preview unavailable" })).toBeVisible();
 expect(detailRequests).toEqual([]);
 for (const width of [1440, 1024, 390]) {
   await page.setViewportSize({ width, height: 1000 });
   await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
   await expect(page.locator(".dashboard-preview").first()).toHaveCSS("height", "108px");
   await page.screenshot({ path: info.outputPath(`dashboard-preview-${width}.png`), fullPage: true, animations: "disabled" });
 }
 const link = page.locator(".dashboard-design-card .m4-design-link").first();
 await expect(link).toHaveAttribute("href", "/designs/design0/edit");
 await link.focus(); await expect(link).toBeFocused();
 await page.getByRole("button", { name: "Delete My saved architecture", exact: true }).click();
 await expect(page.getByRole("alertdialog")).toBeVisible();
 await page.keyboard.press("Escape");
 await expect(page.getByRole("alertdialog")).toHaveCount(0);
 expect(detailRequests).toEqual([]);
 expect(errors).toEqual([]);
});
