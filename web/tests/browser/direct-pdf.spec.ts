import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { PDFDocument } from "pdf-lib";
const api = process.env.SF_API_URL ?? "http://localhost:5001/v1";
type Headers = { Authorization: string };
async function setup(page: Page, tag: string) {
  await page.goto("/register");
  await page.getByLabel("Name", { exact: true }).fill("Direct PDF");
  await page.getByLabel("Email", { exact: true }).fill("directpdf-" + Date.now() + "-" + tag + "@example.test");
  await page.getByLabel("Password", { exact: true }).fill("Direct-Pdf-Only-2026!");
  await page.locator("#reg-terms").check();
  const response = page.waitForResponse(r => r.url() === api + "/auth/register" && r.status() === 201);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  const headers = { Authorization: "Bearer " + (await (await response).json()).data.accessToken };
  await page.goto("/new/template");
  await page.getByRole("button", { name: "Use Single-server MVP", exact: true }).click();
  await page.waitForURL(/\/designs\/[0-9a-f-]{36}\//);
  const id = new URL(page.url()).pathname.split("/")[2];
  const design = (await (await page.request.get(api + "/designs/" + id, { headers })).json()).data;
  return { headers, id, design };
}
async function run(page: Page, headers: Headers, id: string, revision: number) {
  const accepted = await page.request.post(api + "/designs/" + id + "/simulate", { headers, data: { expectedRevision: revision, requestId: crypto.randomUUID() } });
  expect(accepted.status()).toBe(202);
  const url = (await accepted.json()).data.statusUrl as string;
  for (let i = 0; i < 150; i++) {
    const current = (await (await page.request.get(url.startsWith("http") ? url : api.replace(/\/v1$/, "") + url, { headers })).json()).data;
    if (current.status !== "pending") { expect(current.status).toBe("completed"); return current; }
    await page.waitForTimeout(50);
  }
  throw Error("Simulation remained pending");
}
async function prepared(page: Page, tag: string) {
  const state = await setup(page, tag);
  const result = await run(page, state.headers, state.id, state.design.revision);
  await page.goto("/designs/" + state.id + "/results?run=" + result.id);
  await expect(page.getByTestId("quick-pdf-download-header")).toBeEnabled();
  await expect(page.getByTestId("quick-pdf-download-results")).toBeEnabled();
  return { ...state, result };
}
async function pdf(bytes: Buffer) {
  const doc = await PDFDocument.load(bytes); const lines: string[] = [];
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    const stream = object as unknown as { contents?: Uint8Array; dict?: { get(key: unknown): unknown } };
    if (!stream.contents) continue;
    let data: Buffer = Buffer.from(stream.contents);
    try { if (stream.dict?.get(doc.context.obj("Filter"))) data = inflateSync(data); } catch { continue; }
    for (const match of data.toString("latin1").matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) lines.push(Buffer.from(match[1], "hex").toString("latin1"));
  }
  return { doc, text: lines.join("\n"), bytes };
}
async function download(page: Page, testId: string) {
  const event = page.waitForEvent("download");
  await page.getByTestId(testId).click();
  const file = await event; const path = await file.path();
  expect(file.suggestedFilename()).toMatch(/-rev\d+-report\.pdf$/);
  return pdf(readFileSync(path!));
}

test("direct Results and Report page give identical bytes for the identical real report document", async ({ page }, info) => {
  const { headers, id, design, result } = await prepared(page, "equal-" + info.project.name);
  const payload = await (await page.request.get(api + "/designs/" + id + "/report?revision=" + design.revision + "&run=" + result.id, { headers })).json();
  const requests: string[] = [];
  // Freeze only this real server document (including generatedAt) to test byte identity, not changing timestamps.
  await page.route(api + "/designs/" + id + "/report**", route => { requests.push(route.request().url()); return route.fulfill({ status: 200, json: payload }); });
  const direct = await download(page, "quick-pdf-download-results");
  expect(direct.text).toContain("run " + result.id);
  expect(requests.some(url => new URL(url).searchParams.get("revision") === String(design.revision) && new URL(url).searchParams.get("run") === result.id)).toBe(true);
  await page.getByTestId("results-report-link").click();
  const report = await download(page, "report-download-pdf");
  expect(direct.bytes.equals(report.bytes)).toBe(true); expect(direct.text).toBe(report.text);
});
test("an older selected run downloads its own revision, while the header uses the saved latest result and excludes drafts", async ({ page }, info) => {
  const { headers, id, design, result: old } = await prepared(page, "history-" + info.project.name);
  const changed = await page.request.patch(api + "/designs/" + id, { headers, data: { expectedRevision: design.revision, name: "Newest saved PDF", traffic: { ...design.traffic, rps: 9000 } } });
  expect(changed.status()).toBe(200); const current = (await changed.json()).data;
  const latest = await run(page, headers, id, current.revision);
  await page.goto("/designs/" + id + "/results?run=" + old.id);
  await expect(page.getByTestId("quick-pdf-download-header")).toBeEnabled();
  // Autosave is real; hold the draft unsaved by simulating a failed save, never changing its saved revision.
  await page.route(api + "/designs/" + id, route => route.request().method() === "PATCH"
    ? route.fulfill({ status: 503, json: { error: { code: "UNAVAILABLE", message: "Audit autosave failure" } } })
    : route.continue());
  await page.locator("#design-name").fill("PRIVATE UNSAVED DRAFT TITLE");
  await expect(page.getByTestId("quick-pdf-header")).toContainText("Unsaved changes are not included");
  const earlier = await download(page, "quick-pdf-download-results");
  expect(earlier.text).toContain(design.name); expect(earlier.text).toContain("run " + old.id);
  expect(earlier.text).not.toContain(latest.id); expect(earlier.text).not.toContain("PRIVATE UNSAVED DRAFT TITLE");
  const newest = await download(page, "quick-pdf-download-header");
  expect(newest.text).toContain("Newest saved PDF"); expect(newest.text).toContain("run " + latest.id);
  expect(newest.text).not.toContain(old.id); expect(newest.text).not.toContain("PRIVATE UNSAVED DRAFT TITLE");
  const stillSaved = (await (await page.request.get(api + "/designs/" + id, { headers })).json()).data;
  expect(stillSaved.revision).toBe(current.revision); expect(stillSaved.name).toBe("Newest saved PDF");
  await expect(page.locator("#design-name")).toHaveValue("PRIVATE UNSAVED DRAFT TITLE");
  const prompt = page.waitForEvent("dialog");
  const navigating = page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Dashboard", exact: true }).click();
  const dialog = await prompt; expect(dialog.type()).toBe("confirm"); expect(dialog.message()).toContain("unsaved changes");
  await dialog.dismiss(); await navigating;
  expect(new URL(page.url()).pathname).toBe("/designs/" + id + "/results");

});
test("no-result downloads are disabled; finishing a run enables them, while saving a new revision disables the header again", async ({ page }, info) => {
  const { id } = await setup(page, "ready-" + info.project.name);
  await expect(page.getByTestId("quick-pdf-header")).toContainText("Run a simulation for this saved revision first.");
  await expect(page.getByTestId("quick-pdf-download-header")).toBeDisabled();
  await expect(page.getByTestId("ws-report-link")).toBeVisible();
  await page.getByRole("button", { name: "Run test", exact: true }).click();
  await page.getByRole("link", { name: "Results", exact: true }).click();
  await expect(page.getByTestId("quick-pdf-download-header")).toBeEnabled();
  await expect(page.getByTestId("quick-pdf-download-results")).toBeEnabled();
  await page.locator("#design-name").fill("New saved revision without a run");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("quick-pdf-header")).toContainText("Run a simulation for this saved revision first.");
  await expect(page.getByTestId("quick-pdf-download-header")).toBeDisabled();
  await expect(page.getByTestId("quick-pdf-download-results")).toBeEnabled();
  expect(new URL(page.url()).pathname).toBe("/designs/" + id + "/results");
});
test("API and PDF-save failures stay inline with an exact fallback, then an explicit retry downloads", async ({ page }, info) => {
  const { id, design, result } = await prepared(page, "fail-" + info.project.name);
  await page.route(api + "/designs/" + id + "/report**", route => route.fulfill({ status: 503, json: { error: { code: "UNAVAILABLE", message: "Audit failure" } } }));
  await page.getByTestId("quick-pdf-download-results").click();
  const error = page.getByTestId("quick-pdf-error-results");
  await expect(error).toBeVisible();
  await expect(error.getByRole("link", { name: "Open the Report page" })).toHaveAttribute("href", "/designs/" + id + "/report?revision=" + design.revision + "&run=" + result.id);
  await expect(page.getByRole("heading", { name: "Model results", exact: true })).toBeVisible();
  await page.unroute(api + "/designs/" + id + "/report**");
  await page.evaluate(() => {
    const Real = window.Blob;
    (window as unknown as { restorePdfBlob: () => void }).restorePdfBlob = () => { window.Blob = Real; };
    window.Blob = class extends Real {
      constructor(parts?: BlobPart[], options?: BlobPropertyBag) { if (options?.type === "application/pdf") throw Error("Audit PDF save failure"); super(parts, options); }
    } as typeof Blob;
  });
  await page.getByTestId("quick-pdf-download-results").click();
  await expect(error).toContainText("PDF could not be made");
  await page.evaluate(() => (window as unknown as { restorePdfBlob: () => void }).restorePdfBlob());
  expect((await download(page, "quick-pdf-download-results")).text).toContain(result.id);
  await expect(error).toHaveCount(0);
});
test("notes selection is keyboard accessible and shared with Report after reload", async ({ page }, info) => {
  const { headers, id, result } = await prepared(page, "notes-" + info.project.name);
  const note = "Direct PDF note must respect my choice";
  expect((await page.request.post(api + "/designs/" + id + "/notes", { headers, data: { kind: "decision", text: note } })).status()).toBe(201);
  const header = page.getByTestId("quick-pdf-notes-header");
  await header.focus(); await page.keyboard.press("Space");
  await expect(header).not.toBeChecked(); await expect(page.getByTestId("quick-pdf-notes-results")).not.toBeChecked();
  await page.reload(); await expect(page.getByTestId("quick-pdf-notes-results")).not.toBeChecked();
  expect((await download(page, "quick-pdf-download-results")).text).not.toContain(note);
  await page.getByTestId("results-report-link").click();
  await expect(page.getByTestId("report-pdf-notes")).not.toBeChecked();
  await page.getByTestId("report-pdf-notes").check();
  expect((await download(page, "report-download-pdf")).text).toContain(note);
  await page.goto("/designs/" + id + "/results?run=" + result.id);
  await expect(page.getByTestId("quick-pdf-notes-results")).toBeChecked();
});
test("leaving Results while the report request is pending never starts a late download", async ({ page }, info) => {
  const { id } = await prepared(page, "late-" + info.project.name);
  let release!: () => void; const wait = new Promise<void>(resolve => { release = resolve; });
  let started!: () => void; const incoming = new Promise<void>(resolve => { started = resolve; });
  let downloads = 0; page.on("download", () => downloads++);
  await page.route(api + "/designs/" + id + "/report**", async route => {
    started(); await wait;
    try { await route.continue(); } catch { /* Navigation may already have cancelled the browser request. */ }
  });
  await page.getByTestId("quick-pdf-download-results").click(); await incoming;
  await expect(page.getByTestId("quick-pdf-download-results")).toHaveText("Making the PDF…");
  await page.goto("/dashboard"); release();
  await expect(page.getByTestId("me-card")).toBeVisible(); await page.waitForTimeout(300);
  expect(downloads).toBe(0);
});
test("direct controls fit narrow screens and preserve keyboard operation with reduced motion", async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" }); await prepared(page, "fit-" + info.project.name);
  for (const width of [320,390,1024,1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByTestId("quick-pdf-download-header")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath("direct-pdf-" + width + ".png") });
  }
  const button = page.getByTestId("quick-pdf-download-results");
  await button.focus(); const event = page.waitForEvent("download"); await page.keyboard.press("Enter");
  expect((await event).suggestedFilename().endsWith(".pdf")).toBe(true); expect(errors).toEqual([]);
});
