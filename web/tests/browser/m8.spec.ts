import { test, expect, type Page, type Request } from "@playwright/test";
const api = process.env.SF_API_URL ?? "http://localhost:5001/v1";

async function setup(page: Page, tag: string, template = "Single-server MVP") {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/register");
  await page.getByLabel("Name", { exact: true }).fill("M8 Limits");
  await page.getByLabel("Email", { exact: true }).fill("m8-" + Date.now() + "-" + tag + "@example.test");
  await page.getByLabel("Password", { exact: true }).fill("M8-Limits-2026!");
  await page.locator("#reg-terms").check();
  const reg = page.waitForResponse((r) => r.url() === api + "/auth/register" && r.status() === 201);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  const token = (await (await reg).json()).data.accessToken;
  await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();
  await page.goto("/new/template");
  await page.getByRole("button", { name: "Use " + template, exact: true }).click();
  await expect(page.getByLabel("Component", { exact: true })).toBeVisible();
  const id = new URL(page.url()).pathname.split("/")[2],
    headers = { Authorization: "Bearer " + token };
  const dashboard = async () => (await (await page.request.get(api + "/dashboard", { headers })).json()).data;
  return { id, headers, dashboard, errors };
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}
async function findLimits(page: Page) {
  const response = page.waitForResponse((r) => r.url().endsWith("/limits") && r.request().method() === "POST" && [200, 202].includes(r.status()));
  await page.getByRole("button", { name: "Find limits", exact: true }).click();
  const accepted = (await (await response).json()).data;
  await expect(page).toHaveURL(new RegExp("/limits\\?.*limits=" + accepted.run.id));
  await expect(page.getByText("Saturation order", { exact: true })).toBeVisible({ timeout: 30_000 });
  return accepted.run;
}

test("M8 saved Limits: honest result, reload, kind-aware links and dashboard labels", async ({ page }, info) => {
  const { id, dashboard, errors } = await setup(page, "limits-" + info.project.name);
  await page.getByRole("link", { name: /^Limits/ }).click();
  await expect(page.getByText(/No saved Limits search for this design yet/)).toBeVisible();
  const run = await findLimits(page);
  expect(run.kind).toBe("limits");
  const panel = page.locator(".m8-limits");
  await expect(panel.getByText("predicted saturation under unshed demand").first()).toBeVisible();
  await expect(panel.getByText(/Misses targets between|No failure found up to|Misses targets at/).first()).toBeVisible();
  await expect(panel.getByText(/Never|∞|Any load/)).toHaveCount(0);
  await page.getByText("Read ramp data").click();
  await expect(page.getByRole("table").filter({ hasText: "Average rps" })).toBeVisible();
  await noOverflow(page);
  await page.reload();
  await expect(page.getByText("Saturation order", { exact: true })).toBeVisible();
  // A Limits id in the simulation slot is rerouted to the Limits view by its stored kind.
  await page.goto(`/designs/${id}/results?run=${run.id}`);
  await expect(page).toHaveURL(new RegExp(`/designs/${id}/limits\\?limits=${run.id}`));
  const dash = await dashboard();
  expect(dash.recentRuns.find((r: { id: string }) => r.id === run.id).kind).toBe("limits");
  await page.goto("/dashboard");
  await expect(page.getByText(/Limits search/).first()).toBeVisible();
  const link = page.getByRole("link", { name: dash.recentRuns[0].designName }).last();
  await expect(link).toHaveAttribute("href", new RegExp("/limits\\?limits="));
  expect(errors).toEqual([]);
});

test("M8 lost Limits response retries the same Limits request and creates one run", async ({ page }, info) => {
  const { dashboard } = await setup(page, "lost-" + info.project.name);
  await page.getByRole("link", { name: /^Limits/ }).click();
  let first = true;
  await page.route("**/limits", async (route) => {
    if (route.request().method() !== "POST" || !first) return route.continue();
    first = false;
    await route.fetch(); // the server accepts, but the browser never sees the response
    await route.abort("failed");
  });
  await page.getByRole("button", { name: "Find limits", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry same Limits request", exact: true })).toBeVisible();
  await expect(page.getByText(/never resubmitted as a test run/)).toBeVisible();
  const retry = page.waitForResponse((r) => r.url().endsWith("/limits") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Retry same Limits request", exact: true }).click();
  expect([200, 202]).toContain((await retry).status());
  await expect(page.getByText("Saturation order", { exact: true })).toBeVisible({ timeout: 30_000 });
  const dash = await dashboard();
  expect(dash.recentRuns.filter((r: { kind: string }) => r.kind === "limits")).toHaveLength(1);
  expect(dash.recentRuns.filter((r: { kind: string }) => r.kind === "simulation")).toHaveLength(0);
});

test("M8 live preview: Load overlay, debounced requests, no saved rows, layout-only moves ignored", async ({ page }, info) => {
  const { dashboard, errors } = await setup(page, "preview-" + info.project.name);
  const previews: Request[] = [];
  page.on("request", (r) => {
    if (r.url().endsWith("/simulation/preview")) previews.push(r);
  });
  await expect(page.getByRole("button", { name: "Load (L)" })).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Load (L)" }).click();
  await expect(page.getByText("Live preview — unsaved inputs").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".cv-node.overlay").first()).toBeVisible();
  await expect(page.getByLabel("Load overlay legend")).toContainText("failing at or above 100%");
  const before = previews.length;
  const slider = page.getByLabel("Traffic", { exact: true });
  await slider.focus();
  for (let i = 0; i < 15; i++) await page.keyboard.press("ArrowRight");
  await expect(page.getByText("Live preview — unsaved inputs").first()).toBeVisible({ timeout: 15_000 });
  expect(previews.length - before).toBeLessThanOrEqual(2);
  // Layout-only: keyboard-nudge a component; no new preview request.
  const settled = previews.length;
  await page.locator(".cv-node").nth(1).focus();
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(1500);
  expect(previews.length).toBe(settled);
  // Overload: overlay shows numeric utilization above 100% and the bottleneck tag.
  await slider.focus();
  await page.keyboard.press("End");
  await expect(page.locator(".cv-pct.s-fail").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("BOTTLENECK")).toBeVisible();
  const dash = await dashboard();
  expect(dash.counts.retainedRuns).toBe(0);
  await page.getByLabel("Design name").focus();
  await page.keyboard.press("l");
  await expect(page.getByRole("button", { name: "Load (L)" })).toHaveAttribute("aria-pressed", "true");
  await noOverflow(page);
  expect(errors).toEqual([]);
});

test("M8 stale preview reply never overwrites newer inputs; superseded request is aborted", async ({ page }, info) => {
  await setup(page, "stale-" + info.project.name);
  let calls = 0;
  const failed: string[] = [];
  page.on("requestfailed", (r) => {
    if (r.url().endsWith("/simulation/preview")) failed.push(r.failure()?.errorText ?? "failed");
  });
  await page.route("**/simulation/preview", async (route) => {
    calls++;
    if (calls === 2) await new Promise((r) => setTimeout(r, 2500)); // hold the second request
    await route.continue().catch(() => undefined);
  });
  await page.getByRole("button", { name: "Load (L)" }).click();
  await expect(page.getByText("Live preview — unsaved inputs").first()).toBeVisible({ timeout: 15_000 });
  const slider = page.getByLabel("Traffic", { exact: true });
  await slider.focus();
  await page.keyboard.press("PageUp");
  await page.waitForTimeout(900);
  await page.keyboard.press("PageUp");
  await page.waitForTimeout(3500);
  await expect(page.getByText("Live preview — unsaved inputs").first()).toBeVisible({ timeout: 15_000 });
  expect(calls).toBeGreaterThanOrEqual(3);
  expect(failed.length).toBeGreaterThanOrEqual(1);
  await expect(page.locator(".m8-readouts.is-stale")).toHaveCount(0);
});

test("M8 Results topology uses the saved snapshot; deleted components keep recorded metrics without Edit", async ({ page }) => {
  await setup(page, "topology");
  const response = page.waitForResponse((r) => r.url().endsWith("/simulate") && [200, 202].includes(r.status()));
  await page.getByRole("button", { name: "Run test", exact: true }).click();
  const run = (await (await response).json()).data.run;
  await expect(page).toHaveURL(new RegExp("/results\\?run=" + run.id));
  await expect(page.getByRole("heading", { name: "Topology under load" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("group", { name: /Recorded topology under load/ }).locator(".cv-node.overlay")).toHaveCount(3);
  await page.getByRole("link", { name: "Edit", exact: true }).click();
  await page.getByLabel("Component", { exact: true }).selectOption({ label: "Database" });
  await page.getByRole("button", { name: "Delete selection" }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Saved ·/ })).toBeVisible();
  await page.getByRole("link", { name: "Results", exact: true }).click();
  await page.getByRole("group", { name: /Recorded topology under load/ }).getByRole("button", { name: /^Database/ }).focus();
  await expect(page.getByText(/Database no longer exists in the current draft/)).toBeVisible();
  await expect(page.getByText(/Stale result/)).toBeVisible();
});

test("M8 logout stops live preview requests", async ({ page }, info) => {
  await setup(page, "logout-" + info.project.name);
  let count = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/simulation/preview")) count++;
  });
  await page.getByRole("button", { name: "Load (L)" }).click();
  await expect(page.getByText("Live preview — unsaved inputs").first()).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  await page.getByRole("menuitem", { name: /Log out/ }).click();
  await expect(page).toHaveURL(/\/login|\/$/);
  const after = count;
  await page.waitForTimeout(2000);
  expect(count).toBe(after);
});

test("M8 Traffic tab live panel is opt-in and separate from the recorded run", async ({ page }, info) => {
  const { errors } = await setup(page, "traffic-" + info.project.name);
  await page.getByRole("link", { name: /^Traffic/ }).click();
  const panel = page.getByRole("region", { name: "Live preview" });
  await expect(panel.getByRole("checkbox", { name: "Live preview" })).not.toBeChecked();
  await expect(panel.getByText("Live preview off")).toBeVisible();
  await panel.getByRole("checkbox", { name: "Live preview" }).check();
  await expect(panel.locator(".m8-readouts")).toBeVisible({ timeout: 15_000 });
  await expect(panel.getByText(/never replaces a recorded run/)).toBeVisible();
  await noOverflow(page);
  expect(errors).toEqual([]);
});

test("M8 two tabs keep independent preview identities and never supersede each other", async ({ page, context }, info) => {
  const { id } = await setup(page, "tabs-" + info.project.name);
  const second = await context.newPage();
  await second.goto(`/designs/${id}/edit`);
  const bodies: { editorSessionId: string; status: number }[] = [];
  for (const p of [page, second])
    p.on("response", async (r) => {
      if (r.url().endsWith("/simulation/preview")) bodies.push({ editorSessionId: r.request().postDataJSON().editorSessionId, status: r.status() });
    });
  await page.getByRole("button", { name: "Load (L)" }).click();
  await second.getByRole("button", { name: "Load (L)" }).click();
  for (const p of [page, second]) await expect(p.getByText("Live preview — unsaved inputs").first()).toBeVisible({ timeout: 15_000 });
  expect(new Set(bodies.map((b) => b.editorSessionId)).size).toBe(2);
  expect(bodies.every((b) => b.status === 200)).toBe(true);
  await second.close();
});

test("M8 50-node/200-edge graph: preview stays bounded and the canvas stays usable", async ({ page }, info) => {
  const { headers, errors } = await setup(page, "bounds-" + info.project.name);
  const catalog = (await (await page.request.get(api + "/simulation/catalog", { headers })).json()).data;
  const nodes = Array.from({ length: 50 }, (_, i) => ({ id: "node" + i, type: i === 0 ? "client" : "app", label: "Node " + i, x: (i % 10) * 240 - 480, y: Math.floor(i / 10) * 110 - 220, props: {} }));
  const edges: { id: string; from: string; to: string }[] = [];
  for (let a = 0; a < 50 && edges.length < 200; a++) for (let b = a + 1; b < 50 && edges.length < 200; b++) edges.push({ id: "edge" + edges.length, from: "node" + a, to: "node" + b });
  const created = await page.request.post(api + "/designs", { headers, data: { schemaVersion: 1, name: "M8 bounded graph", description: "", source: "blank", templateId: null, graph: { nodes, edges }, traffic: catalog.trafficDefaults } });
  expect(created.status()).toBe(201);
  await page.goto("/designs/" + (await created.json()).data.id + "/edit");
  await expect(page.locator("[data-node]")).toHaveCount(50);
  const reply = page.waitForResponse((r) => r.url().endsWith("/simulation/preview"));
  const started = Date.now();
  await page.getByRole("button", { name: "Load (L)" }).click();
  const status = (await reply).status();
  await info.attach("bounded-preview", { body: JSON.stringify({ status, ms: Date.now() - started }), contentType: "application/json" });
  // Either a modeled overlay or an inline, honest budget message; never a hang or a system screen.
  expect([200, 422, 503]).toContain(status);
  if (status === 200) await expect(page.locator(".cv-node.overlay")).toHaveCount(50);
  else await expect(page.locator(".m8-live [role=status]")).toContainText(/budget|did not finish|unavailable/);
  const sample = await page.evaluate(() => new Promise<number>((resolve) => { let frames = 0, prev = performance.now(), gap = 0; const tick = (now: number) => { gap = Math.max(gap, now - prev); prev = now; if (++frames >= 12) resolve(gap); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); }));
  expect(sample).toBeLessThan(1000);
  await page.getByRole("button", { name: "Fit to screen", exact: true }).click();
  await noOverflow(page);
  expect(errors).toEqual([]);
});

test("M8 preview blocked by the owner's pending saved calculation pauses inline with explicit retry", async ({ page }, info) => {
  await setup(page, "durable-" + info.project.name);
  let block = true;
  // Server-side DURABLE_PENDING is verified in test/m8.e2e-spec.ts; here the UI mapping is checked.
  await page.route("**/simulation/preview", (route) =>
    block
      ? route.fulfill({ status: 429, json: { error: { code: "RATE_LIMITED", message: "pending", details: { reason: "DURABLE_PENDING" } } } })
      : route.continue(),
  );
  await page.getByRole("button", { name: "Load (L)" }).click();
  await expect(page.locator(".m8-live [role=status]")).toHaveText("Live preview pauses while your saved calculation runs.");
  block = false;
  await page.waitForTimeout(1200);
  await expect(page.locator(".m8-live [role=status]")).toHaveText("Live preview pauses while your saved calculation runs.");
  await page.getByRole("button", { name: "Retry preview" }).click();
  await expect(page.getByText("Live preview — unsaved inputs").first()).toBeVisible({ timeout: 15_000 });
});

test("M8 session-modal reauthentication keeps the draft and renews the preview identity", async ({ page }, info) => {
  const { id } = await setup(page, "reauth-" + info.project.name);
  const ids: string[] = [];
  page.on("request", (r) => {
    if (r.url().endsWith("/simulation/preview")) ids.push(r.postDataJSON().editorSessionId);
  });
  await page.getByRole("button", { name: "Load (L)" }).click();
  await expect(page.getByText("Live preview — unsaved inputs").first()).toBeVisible({ timeout: 15_000 });
  const before = ids.at(-1);
  await page.route(api + "/designs/" + id, (route) => (route.request().method() === "PATCH" ? route.fulfill({ status: 401, json: { error: { code: "SESSION_EXPIRED", message: "M8 expiry" } } }) : route.continue()));
  await page.route(api + "/auth/refresh", (route) => route.fulfill({ status: 401, json: { error: { code: "SESSION_EXPIRED", message: "M8 expiry" } } }));
  const slider = page.getByLabel("Traffic", { exact: true });
  await slider.focus();
  await page.keyboard.press("PageUp");
  const drafted = await slider.inputValue();
  await expect(page.getByRole("alertdialog", { name: "Your session expired" })).toBeVisible();
  await page.unroute(api + "/designs/" + id);
  await page.unroute(api + "/auth/refresh");
  await page.locator("#sess-pw").fill("M8-Limits-2026!");
  await page.getByRole("button", { name: "Log in again", exact: true }).click();
  await expect(page.getByRole("alertdialog", { name: "Your session expired" })).toHaveCount(0);
  await expect(slider).toHaveValue(drafted);
  await expect(page.getByText("Live preview — unsaved inputs").first()).toBeVisible({ timeout: 15_000 });
  expect(ids.at(-1)).not.toBe(before);
});
