import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
const api = process.env.SF_API_URL ?? "http://localhost:5001/v1";
const origin = new URL(api).origin;

async function setup(page: Page, tag: string) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/register");
  await page.getByLabel("Name", { exact: true }).fill("M16 Report");
  await page.getByLabel("Email", { exact: true }).fill("m16r-" + Date.now() + "-" + tag + "@example.test");
  await page.getByLabel("Password", { exact: true }).fill("M16-Report-2026!");
  await page.locator("#reg-terms").check();
  const reg = page.waitForResponse((r) => r.url() === api + "/auth/register" && r.status() === 201);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  const token = (await (await reg).json()).data.accessToken as string;
  await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();
  return { errors, headers: { Authorization: "Bearer " + token } };
}

type Headers = Record<string, string>;
async function seedDesign(page: Page, headers: Headers, name: string) {
  const templates = (await (await page.request.get(api + "/templates", { headers })).json()).data as Array<{ id: string; graph: unknown; traffic: unknown }>;
  const t = templates[0];
  const res = await page.request.post(api + "/designs", {
    headers,
    data: { schemaVersion: 1, name, description: "Report journey design", source: "template", templateId: t.id, graph: t.graph, traffic: t.traffic },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).data as { id: string; revision: number };
}
async function simulate(page: Page, headers: Headers, id: string, revision: number) {
  const accepted = await page.request.post(`${api}/designs/${id}/simulate`, { headers, data: { expectedRevision: revision, requestId: randomUUID() } });
  expect(accepted.status()).toBe(202);
  const statusUrl = (await accepted.json()).data.statusUrl as string;
  for (let i = 0; i < 100; i++) {
    const run = (await (await page.request.get(origin + statusUrl, { headers })).json()).data;
    if (run.status !== "pending") return run as { id: string; status: string };
    await page.waitForTimeout(100);
  }
  throw new Error("run stayed pending");
}
async function rename(page: Page, headers: Headers, id: string, expectedRevision: number, name: string) {
  const res = await page.request.patch(`${api}/designs/${id}`, { headers, data: { expectedRevision, name } });
  expect(res.status()).toBe(200);
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}
const doc = (page: Page) => page.getByRole("article", { name: "Design report" });

test("M16.1 the report shows the recorded result, the traffic tested, components and an honest Limits disclosure", async ({ page }, info) => {
  const { errors, headers } = await setup(page, "show-" + info.project.name);
  const d = await seedDesign(page, headers, "Checkout platform");
  await simulate(page, headers, d.id, 1);
  await page.goto(`/designs/${d.id}/report`);
  await expect(page.getByRole("heading", { level: 1, name: "Report" })).toBeVisible();
  await expect(doc(page).getByRole("heading", { level: 2, name: "Checkout platform" })).toBeVisible();
  await expect(doc(page)).toContainText("Revision 1 (current)");
  await expect(page.getByTestId("report-verdict")).toHaveText(/Meets its targets|Strained|Misses its targets/);
  await expect(page.getByTestId("report-run-statement")).toContainText("Recorded for revision 1");
  await expect(doc(page).getByRole("table", { name: "Predicted figures at the traffic tested" })).toBeVisible();
  await expect(doc(page).getByRole("table", { name: "Traffic settings" })).toContainText("Requests per second");
  await expect(doc(page).getByRole("table", { name: "Load on each component" }).getByRole("row")).not.toHaveCount(1);
  await expect(page.getByTestId("report-limits")).toContainText("was not run for this revision");
  await expect(doc(page).getByText("What these numbers are")).toBeVisible();
  await expect(doc(page)).toContainText("simplified queueing model");
  await expect(page.getByRole("button", { name: /Explain/ })).toHaveCount(0); // AI stays out of the report
  await noOverflow(page);
  expect(errors).toEqual([]);
});

test("M16.1 the picker chooses a revision and a result, keeps the choice in the URL, and never disguises a mismatch", async ({ page }, info) => {
  const { errors, headers } = await setup(page, "pick-" + info.project.name);
  const d = await seedDesign(page, headers, "Orders service");
  const first = await simulate(page, headers, d.id, 1);
  await rename(page, headers, d.id, 1, "Orders service v2");
  await page.goto(`/designs/${d.id}/report`);
  // Revision 2 is current and has no result of its own: nothing is borrowed from revision 1.
  await expect(doc(page).getByRole("heading", { level: 2, name: "Orders service v2" })).toBeVisible();
  await expect(page.getByTestId("report-run-statement")).toContainText("No test result has been recorded for revision 2");
  await expect(page.getByTestId("report-verdict")).toHaveCount(0);
  // Pick the earlier revision: its own result and its own name.
  await page.getByLabel("Revision", { exact: true }).selectOption("1");
  await expect(page).toHaveURL(/revision=1/);
  await expect(doc(page).getByRole("heading", { level: 2, name: "Orders service", exact: true })).toBeVisible();
  await expect(doc(page)).toContainText("(an earlier revision)");
  await expect(page.getByTestId("report-run-statement")).toContainText("Recorded for revision 1");
  await page.reload();
  await expect(page.getByLabel("Revision", { exact: true })).toHaveValue("1");
  // Back to the current revision but with revision 1's result: allowed, and said plainly.
  await page.getByLabel("Revision", { exact: true }).selectOption("");
  await expect(page).not.toHaveURL(/revision=/);
  await page.getByRole("form", { name: "Choose what the report covers" }).getByLabel("Result", { exact: true }).selectOption(first.id);
  await expect(page).toHaveURL(new RegExp("run=" + first.id));
  await expect(page.getByTestId("report-run-statement")).toContainText("recorded for revision 1, not revision 2");
  expect(errors).toEqual([]);
});

test("M16.1 the owner's report lists decisions and assumptions, and says when there are none", async ({ page }, info) => {
  const { headers } = await setup(page, "notes-" + info.project.name);
  const d = await seedDesign(page, headers, "Notes design");
  await page.goto(`/designs/${d.id}/report`);
  await expect(doc(page)).toContainText("No notes were written for this design.");
  for (const [kind, text] of [["decision", "Keep one database."], ["assumption", "Reads are 80% of traffic."]] as const) {
    const res = await page.request.post(`${api}/designs/${d.id}/notes`, { headers, data: { kind, text } });
    expect(res.status()).toBe(201);
  }
  await page.reload();
  const notes = doc(page).getByRole("list", { name: "Notes" });
  await expect(notes).toContainText("Decision (revision 1): Keep one database.");
  await expect(notes).toContainText("Assumption (revision 1): Reads are 80% of traffic.");
  await expect(doc(page)).toContainText("All notes for this design.");
});

test("M16.1 print shows only the report: controls and navigation are hidden, and nothing overflows", async ({ page }, info) => {
  const { headers } = await setup(page, "print-" + info.project.name);
  const d = await seedDesign(page, headers, "Print design");
  await simulate(page, headers, d.id, 1);
  await page.goto(`/designs/${d.id}/report`);
  await expect(doc(page)).toBeVisible();
  await expect(page.getByRole("button", { name: "Print or save as PDF" })).toBeEnabled();
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("button", { name: "Print or save as PDF" })).toBeHidden();
  await expect(page.getByLabel("Revision", { exact: true })).toBeHidden();
  await expect(page.getByRole("heading", { level: 1, name: "Report" })).toBeHidden();
  await expect(doc(page)).toBeVisible();
  expect(await page.locator("nav:visible").count()).toBe(0);
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toMatch(/rgb\(255, 255, 255\)|rgba\(0, 0, 0, 0\)/);
  await noOverflow(page);
  await page.emulateMedia({ media: "screen" });
  await expect(page.getByRole("button", { name: "Print or save as PDF" })).toBeVisible();
});

test("M16.1 a failing report shows a local error with a retry, and an unavailable design is explained", async ({ page }, info) => {
  const { headers } = await setup(page, "fail-" + info.project.name);
  const d = await seedDesign(page, headers, "Failing report");
  let mode: "fail" | "forbidden" | "ok" = "fail";
  // Only the API call: the page route itself ends in /report too.
  await page.route(/\/v1\/designs\/[^/]+\/report/, (route) =>
    mode === "ok"
      ? route.continue()
      : route.fulfill({
          status: mode === "fail" ? 500 : 403,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: mode === "fail" ? "INTERNAL" : "FORBIDDEN", message: "x" } }),
        }),
  );
  await page.goto(`/designs/${d.id}/report`);
  await expect(page.getByRole("heading", { name: "The report could not be made" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Report" })).toBeVisible();
  mode = "forbidden";
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "The report could not be made" })).toContainText("belongs to another account");
  mode = "ok";
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(doc(page)).toBeVisible();
});
