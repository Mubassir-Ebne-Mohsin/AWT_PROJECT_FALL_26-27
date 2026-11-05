import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
const api = process.env.SF_API_URL ?? "http://localhost:5001/v1";

// The Report and Share pages used to be reachable only by typing their address. These journeys check the real routes to them: the
// header on every workspace tab, and the "Save or share this result" panel on Results. No AI is involved.
type Headers = { Authorization: string };
async function setup(page: Page, tag: string) {
  await page.goto("/register");
  await page.getByLabel("Name", { exact: true }).fill("Linker");
  await page.getByLabel("Email", { exact: true }).fill("lnk-" + Date.now() + "-" + tag + "@example.test");
  await page.getByLabel("Password", { exact: true }).fill("Linker-Journey-2026!");
  await page.locator("#reg-terms").check();
  const reg = page.waitForResponse((r) => r.url() === api + "/auth/register" && r.status() === 201);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  const token = (await (await reg).json()).data.accessToken as string;
  await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();
  return { Authorization: "Bearer " + token } as Headers;
}
async function openTemplate(page: Page) {
  await page.goto("/new/template");
  await page.getByRole("button", { name: "Use Single-server MVP", exact: true }).click();
  // The canvas controls are hidden on a phone, so wait for the design itself rather than for one of them.
  await page.waitForURL(/\/designs\/[0-9a-f-]{36}\//);
  await expect(page.getByTestId("ws-report-link")).toBeVisible();
  return new URL(page.url()).pathname.split("/")[2];
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
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

test.describe("Reaching the report and the PDF from the workspace", () => {
  test("after a test run, Results offers the report, and the PDF really downloads from there", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await setup(page, "flow");
    const id = await openTemplate(page);
    // The person's own path: run the test in the page, then open the Results tab.
    await page.getByRole("button", { name: "Run test", exact: true }).click();
    await page.getByRole("link", { name: "Results", exact: true }).click();
    const panel = page.getByTestId("results-report-panel");
    await expect(panel).toBeVisible({ timeout: 30_000 });
    await expect(panel).toContainText("passed, was strained or failed");
    const link = page.getByTestId("results-report-link");
    await expect(link).toHaveText("Open report and download PDF");
    await expect(link).toHaveAttribute("href", new RegExp(`^/designs/${id}/report\\?run=[0-9a-f-]{36}$`));
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/designs/${id}/report\\?run=`));
    const button = page.getByTestId("report-download-pdf");
    await expect(button).toBeEnabled();
    const download = page.waitForEvent("download");
    await button.click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.pdf$/i);
    const path = await file.path();
    const pdf = await PDFDocument.load(readFileSync(path!));
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(errors).toEqual([]);
  });

  test("the panel appears for a failed or strained result too, not only a pass", async ({ page }) => {
    const headers = await setup(page, "verdict");
    const id = await openTemplate(page);
    const design = (await (await page.request.get(api + "/designs/" + id, { headers })).json()).data;
    const heavy = { ...design.traffic, rps: 9_000_000 };
    const patched = await page.request.patch(api + "/designs/" + id, { headers, data: { expectedRevision: design.revision, traffic: heavy } });
    expect(patched.status()).toBe(200);
    const revision = (await patched.json()).data.revision as number;
    const run = await simulate(page, headers, id, revision);
    expect(run.status).toBe("completed");
    expect(["strained", "fail"]).toContain(run.result.summary.verdict);
    await page.goto(`/designs/${id}/results?run=${run.id}`);
    await expect(page.getByTestId("results-report-panel")).toBeVisible();
    await expect(page.getByTestId("results-report-link")).toHaveAttribute("href", `/designs/${id}/report?run=${run.id}`);
  });

  test("there is no report panel before any run, and the header links are still there", async ({ page }) => {
    await setup(page, "norun");
    const id = await openTemplate(page);
    await page.goto(`/designs/${id}/results`);
    await expect(page.getByText("Run the saved design to see model estimates.")).toBeVisible();
    await expect(page.getByTestId("results-report-panel")).toHaveCount(0);
    await expect(page.getByTestId("ws-report-link")).toBeVisible();
  });

  test("every workspace tab has Report & PDF and Share in the header, and they open the right pages", async ({ page }) => {
    await setup(page, "tabs");
    const id = await openTemplate(page);
    for (const tab of ["edit", "traffic", "results", "limits"]) {
      await page.goto(`/designs/${id}/${tab}`);
      await expect(page.getByTestId("ws-report-link")).toBeVisible();
      await expect(page.getByTestId("ws-report-link")).toHaveAttribute("href", `/designs/${id}/report`);
      await expect(page.getByTestId("ws-share-link")).toHaveAttribute("href", `/designs/${id}/share`);
    }
    await page.getByTestId("ws-report-link").click();
    await expect(page).toHaveURL(new RegExp(`/designs/${id}/report$`));
    await expect(page.getByTestId("report-download-pdf")).toBeVisible();
    await page.getByRole("link", { name: "Back to the design" }).click();
    await page.getByTestId("ws-share-link").click();
    await expect(page).toHaveURL(new RegExp(`/designs/${id}/share$`));
  });

  test("with unsaved changes the link says the report covers the saved revision", async ({ page }) => {
    await setup(page, "dirty");
    await openTemplate(page);
    await expect(page.getByTestId("ws-report-link")).toHaveAttribute("title", /Open the report/);
    await page.locator("#design-name").fill("Renamed and not yet saved " + Date.now());
    await expect(page.getByTestId("ws-report-link")).toHaveAttribute("title", /saved revision, not your unsaved changes/);
  });

  for (const width of [320, 390]) {
    test(`the header and the Results panel fit a ${width}px phone`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      const headers = await setup(page, "phone" + width);
      const id = await openTemplate(page);
      const design = (await (await page.request.get(api + "/designs/" + id, { headers })).json()).data;
      const run = await simulate(page, headers, id, design.revision);
      await page.goto(`/designs/${id}/results?run=${run.id}`);
      await expect(page.getByTestId("results-report-panel")).toBeVisible();
      expect(await noOverflow(page)).toBe(true);
      await expect(page.getByTestId("ws-report-link")).toBeVisible();
    });
  }
});
