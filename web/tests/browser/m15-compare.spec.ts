import { test, expect, type Page } from "@playwright/test";
const api = process.env.SF_API_URL ?? "http://localhost:5001/v1";

type Headers = { Authorization: string };
async function setup(page: Page, tag: string) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/register");
  await page.getByLabel("Name", { exact: true }).fill("M15 Compare");
  await page.getByLabel("Email", { exact: true }).fill("m15c-" + Date.now() + "-" + tag + "@example.test");
  await page.getByLabel("Password", { exact: true }).fill("M15-Compare-2026!");
  await page.locator("#reg-terms").check();
  const reg = page.waitForResponse((r) => r.url() === api + "/auth/register" && r.status() === 201);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  const token = (await (await reg).json()).data.accessToken as string;
  await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();
  return { errors, headers: { Authorization: "Bearer " + token } as Headers };
}
async function openTemplate(page: Page) {
  await page.goto("/new/template");
  await page.getByRole("button", { name: "Use Single-server MVP", exact: true }).click();
  await expect(page.getByLabel("Component", { exact: true })).toBeVisible();
  return new URL(page.url()).pathname.split("/")[2];
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}
// Recorded results are created through the API so each journey stays fast; the screens under test are the UI.
const getDesign = async (page: Page, headers: Headers, id: string) => (await (await page.request.get(api + "/designs/" + id, { headers })).json()).data;
async function patch(page: Page, headers: Headers, id: string, body: Record<string, unknown>) {
  const current = await getDesign(page, headers, id);
  const r = await page.request.patch(api + "/designs/" + id, { headers, data: { expectedRevision: current.revision, ...body } });
  expect(r.status()).toBe(200);
  return (await r.json()).data;
}
async function simulate(page: Page, headers: Headers, id: string, revision: number) {
  const accepted = await page.request.post(api + "/designs/" + id + "/simulate", { headers, data: { expectedRevision: revision, requestId: crypto.randomUUID() } });
  expect(accepted.status()).toBe(202);
  const statusUrl = (await accepted.json()).data.statusUrl as string;
  for (let i = 0; i < 150; i++) {
    const run = (await (await page.request.get(statusUrl.startsWith("http") ? statusUrl : api.replace(/\/v1$/, "") + statusUrl, { headers })).json()).data;
    if (run.status !== "pending") return run;
    await page.waitForTimeout(50);
  }
  throw new Error("run stayed pending");
}
const strongerApp = (design: { graph: { nodes: { type: string; props: Record<string, unknown> }[] } }) => ({
  graph: { ...design.graph, nodes: design.graph.nodes.map((n) => (n.type === "app" ? { ...n, props: { ...n.props, replicas: 6 } } : n)) },
});
const history = (page: Page) => page.getByRole("region", { name: "Version history" });
const compareRegion = (page: Page, a: number, b: number) => page.getByRole("region", { name: `Comparison of revision ${a} and revision ${b}` });
const pick = (page: Page, revision: number) => history(page).getByLabel(`Select revision ${revision} to compare`);
async function openHistory(page: Page) {
  await page.reload();
  await page.getByRole("link", { name: /^History/ }).click();
  await expect(history(page)).toBeVisible();
}

test("M15.4 two versions at identical traffic compare with honest better, worse and no-change labels", async ({ page }, info) => {
  const { headers, errors } = await setup(page, "same-" + info.project.name);
  const id = await openTemplate(page);
  await simulate(page, headers, id, 1);
  await patch(page, headers, id, strongerApp(await getDesign(page, headers, id)));
  await simulate(page, headers, id, 2);
  await openHistory(page);
  await pick(page, 1).check();
  await pick(page, 2).check();
  const panel = compareRegion(page, 1, 2);
  await expect(panel).toBeVisible();
  await expect(panel.getByText("What changed from revision 1 to revision 2")).toBeVisible();
  await expect(panel.getByText("Changes settings of 1 component")).toBeVisible();
  await expect(panel.getByText("Revision 1 to revision 2, same traffic and model version")).toBeVisible();
  const expected = (await (await page.request.get(`${api}/designs/${id}/compare?a=1&b=2`, { headers })).json()).data;
  expect(expected.comparable).toBe(true);
  const delta: number = expected.deltas.p95;
  const from: number = expected.a.run.metrics.p95;
  const want = Math.abs(delta) <= Math.max(Math.abs(from) * 0.005, 0.01) ? "No change" : delta < 0 ? "Better" : "Worse";
  const row = panel.getByRole("row", { name: /^p95 latency/ });
  await expect(row.getByText(want, { exact: true })).toBeVisible();
  await expect(panel.getByRole("row", { name: /^Verdict/ })).toBeVisible();
  await expect(panel.getByText(/Predicted by the model, not measured/)).toBeVisible();
  await expect(panel.getByRole("link", { name: "Open revision 1's run" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Explain this result/ })).toHaveCount(0); // AI stays out of Compare
  await noOverflow(page);
  expect(errors).toEqual([]);
});

test("M15.4 different traffic is never subtracted: the reason is explained and each result stands alone", async ({ page }, info) => {
  const { headers } = await setup(page, "traffic-" + info.project.name);
  const id = await openTemplate(page);
  const design = await getDesign(page, headers, id);
  await simulate(page, headers, id, 1);
  await patch(page, headers, id, { traffic: { ...design.traffic, rps: design.traffic.rps + 150 } });
  await simulate(page, headers, id, 2);
  await openHistory(page);
  await pick(page, 1).check();
  await pick(page, 2).check();
  const panel = compareRegion(page, 1, 2);
  await expect(panel.getByText("These results cannot be compared.")).toBeVisible();
  await expect(panel.getByText(/different traffic settings/)).toBeVisible();
  await expect(panel.getByText(/Nothing was subtracted/)).toBeVisible();
  await expect(panel.getByText("Each result on its own (not subtracted)")).toBeVisible();
  await expect(panel.getByRole("row", { name: /^p95 latency/ })).toBeVisible();
  for (const label of ["Better", "Worse", "No change"]) await expect(panel.getByText(label, { exact: true })).toHaveCount(0);
});

test("M15.4 a version without a completed run says so and still shows the other side", async ({ page }, info) => {
  const { headers } = await setup(page, "missing-" + info.project.name);
  const id = await openTemplate(page);
  await simulate(page, headers, id, 1);
  await patch(page, headers, id, { name: "No run for this version" });
  await openHistory(page);
  await pick(page, 1).check();
  await pick(page, 2).check();
  const panel = compareRegion(page, 1, 2);
  await expect(panel.getByText("Revision 2 has no completed test run to compare.")).toBeVisible();
  await expect(panel.getByRole("row", { name: /^Verdict/ })).toContainText("No result");
  await expect(panel.getByText("No run for revision 2")).toBeVisible();
});

test("M15.4 you can choose which recorded run represents each version", async ({ page }, info) => {
  const { headers } = await setup(page, "picker-" + info.project.name);
  const id = await openTemplate(page);
  await simulate(page, headers, id, 1);
  await simulate(page, headers, id, 1);
  await patch(page, headers, id, strongerApp(await getDesign(page, headers, id)));
  await simulate(page, headers, id, 2);
  await openHistory(page);
  await pick(page, 1).check();
  await pick(page, 2).check();
  const panel = compareRegion(page, 1, 2);
  await expect(panel.getByRole("row", { name: /^p95 latency/ })).toBeVisible();
  const picker = panel.getByLabel("Run for revision 1");
  await expect(picker.locator("option")).toHaveCount(3); // default plus the two recorded runs
  const request = page.waitForRequest((r) => r.url().includes("/compare?") && r.url().includes("runA="));
  await picker.selectOption({ index: 2 });
  await request;
  await expect(panel.getByRole("row", { name: /^p95 latency/ })).toBeVisible();
});

test("M15.4 selection rules: at most two versions, easy to clear, and closing leaves History untouched", async ({ page }, info) => {
  const { headers } = await setup(page, "select-" + info.project.name);
  const id = await openTemplate(page);
  await patch(page, headers, id, { name: "Second" });
  await patch(page, headers, id, { name: "Third" });
  await openHistory(page);
  await expect(history(page).getByText(/Select two versions below to compare them side by side/)).toBeVisible();
  await pick(page, 1).check();
  await pick(page, 2).check();
  await expect(pick(page, 3)).toBeDisabled();
  await expect(compareRegion(page, 1, 2)).toBeVisible();
  await pick(page, 2).uncheck();
  await expect(pick(page, 3)).toBeEnabled();
  await expect(history(page).getByRole("region", { name: /^Comparison of/ })).toHaveCount(0);
  await pick(page, 3).check();
  await expect(compareRegion(page, 1, 3)).toBeVisible();
  await compareRegion(page, 1, 3).getByRole("button", { name: "Close comparison" }).click();
  await expect(history(page).getByRole("region", { name: /^Comparison of/ })).toHaveCount(0);
  await expect(pick(page, 1)).not.toBeChecked();
  await expect(history(page).getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Revision 3", exact: true }) })).toBeVisible();
});

test("M15.4 a comparison outage stays inside the panel and can be retried", async ({ page }, info) => {
  const { headers } = await setup(page, "outage-" + info.project.name);
  const id = await openTemplate(page);
  await simulate(page, headers, id, 1);
  await patch(page, headers, id, strongerApp(await getDesign(page, headers, id)));
  await simulate(page, headers, id, 2);
  await openHistory(page);
  await page.route("**/designs/*/compare*", (route) => route.abort("failed"));
  await pick(page, 1).check();
  await pick(page, 2).check();
  const panel = compareRegion(page, 1, 2);
  await expect(panel.getByText(/The comparison could not be loaded\. Your design is unaffected/)).toBeVisible();
  await expect(page.locator(".sys-title")).toHaveCount(0);
  await expect(panel.getByText("What changed from revision 1 to revision 2")).toBeVisible();
  await page.unroute("**/designs/*/compare*");
  await panel.getByRole("button", { name: "Try again" }).click();
  await expect(panel.getByRole("row", { name: /^p95 latency/ })).toBeVisible();
});

test("M15.4 Compare works by keyboard and at 390 px without horizontal overflow", async ({ page }, info) => {
  const { headers } = await setup(page, "a11y-" + info.project.name);
  const id = await openTemplate(page);
  await simulate(page, headers, id, 1);
  await patch(page, headers, id, strongerApp(await getDesign(page, headers, id)));
  await simulate(page, headers, id, 2);
  await page.setViewportSize({ width: 390, height: 844 });
  await openHistory(page);
  await pick(page, 1).focus();
  await page.keyboard.press("Space");
  await pick(page, 2).focus();
  await page.keyboard.press("Space");
  await expect(compareRegion(page, 1, 2).getByRole("row", { name: /^p95 latency/ })).toBeVisible();
  await noOverflow(page);
  await compareRegion(page, 1, 2).getByRole("button", { name: "Close comparison" }).focus();
  await page.keyboard.press("Enter");
  await expect(history(page).getByRole("region", { name: /^Comparison of/ })).toHaveCount(0);
});
