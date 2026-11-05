import { test, expect, type Page } from "@playwright/test";
import { inflateSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
const api = process.env.SF_API_URL ?? "http://localhost:5001/v1";

// The Report page's "Download PDF", against the real server: a real file is downloaded, it parses, it is named after the design and
// revision, and its text carries the same figures the page shows. No AI is involved.
type Headers = { Authorization: string };
async function setup(page: Page, tag: string) {
  await page.goto("/register");
  await page.getByLabel("Name", { exact: true }).fill("Dossier");
  await page.getByLabel("Email", { exact: true }).fill("pdf-" + Date.now() + "-" + tag + "@example.test");
  await page.getByLabel("Password", { exact: true }).fill("Dossier-Journey-2026!");
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
  await expect(page.getByLabel("Component", { exact: true })).toBeVisible();
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
async function pdfText(path: string) {
  const bytes = readFileSync(path);
  const doc = await PDFDocument.load(bytes);
  const chunks: string[] = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    const contents = (obj as unknown as { contents?: Uint8Array; dict?: { get(k: unknown): unknown } }).contents;
    if (!contents) continue;
    let data = Buffer.from(contents);
    try {
      if ((obj as unknown as { dict: { get(k: unknown): unknown } }).dict.get(doc.context.obj("Filter"))) data = inflateSync(data);
    } catch {
      continue;
    }
    for (const m of data.toString("latin1").matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) chunks.push(Buffer.from(m[1], "hex").toString("latin1"));
  }
  return { doc, bytes, text: chunks.join("\n") };
}
async function withRun(page: Page, tag: string) {
  const headers = await setup(page, tag);
  const id = await openTemplate(page);
  const design = (await (await page.request.get(api + "/designs/" + id, { headers })).json()).data;
  const run = await simulate(page, headers, id, design.revision);
  await page.goto("/designs/" + id + "/report?run=" + run.id);
  await expect(page.getByTestId("report-verdict")).toBeVisible();
  return { headers, id, design, run };
}

test("Download PDF gives a real file named after the design and revision, whose text matches the page", async ({ page }, info) => {
  const { design, run } = await withRun(page, "dl-" + info.project.name);
  const shown = await page.getByTestId("report-verdict").innerText();
  const download = page.waitForEvent("download");
  await page.getByTestId("report-download-pdf").click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^[a-z0-9-]+-rev\d+-report\.pdf$/);
  expect(file.suggestedFilename()).toBe(design.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") + "-rev" + design.revision + "-report.pdf");
  const path = await file.path();
  const { doc, bytes, text } = await pdfText(path!);
  expect(bytes.length).toBeGreaterThan(1500);
  expect(doc.getPageCount()).toBeGreaterThanOrEqual(2);
  expect(doc.getTitle()).toBe(design.name + " - revision " + design.revision + " report");
  const s = run.result.summary;
  // The verdict sentence and the figures on the page are in the file.
  expect(text).toContain(shown.trim());
  expect(text).toContain(design.name);
  expect(text).toContain("Model estimate, not a measurement of real infrastructure.");
  expect(text).toContain(s.p95.toLocaleString("en-US", { maximumFractionDigits: 2 }) + " ms");
  for (const node of s.nodes) expect(text).toContain(node.label.slice(0, 12));
  expect(text).toContain("run " + run.id);
  expect(text).not.toMatch(/NaN|undefined|\[object/);
  await expect(page.getByTestId("report-pdf-error")).toHaveCount(0);
});

test("the diagram in the file carries each component's settings, and the table lists them in full", async ({ page }, info) => {
  const headers = await setup(page, "settings-" + info.project.name);
  const id = await openTemplate(page);
  const design = (await (await page.request.get(api + "/designs/" + id, { headers })).json()).data;
  const graph = { ...design.graph, nodes: design.graph.nodes.map((n: { type: string; props: Record<string, unknown> }) => (n.type === "app" ? { ...n, props: { ...n.props, replicas: 3, capacity: 250, latency: 40 } } : n)) };
  const patched = await page.request.patch(api + "/designs/" + id, { headers, data: { expectedRevision: design.revision, graph } });
  expect(patched.status()).toBe(200);
  const revision = (await patched.json()).data.revision as number;
  const run = await simulate(page, headers, id, revision);
  await page.goto("/designs/" + id + "/report?run=" + run.id);
  await expect(page.getByTestId("report-verdict")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByTestId("report-download-pdf").click();
  const { text } = await pdfText((await (await download).path())!);
  // In the diagram box (short form) and in the Components table (full wording): the same three numbers.
  expect(text).toContain("3x  cap 250  40ms");
  // The table cell wraps onto two lines, so compare with the line breaks turned into spaces.
  expect(text.split("\n").join(" ")).toContain("3 copies, capacity 250, latency 40 ms");
  expect(text).toContain("cap = capacity");
  expect(text).toContain("The Components table lists every setting in full.");
  expect(text).not.toMatch(/NaN|undefined|\[object/);
});

test("the notes tick-box decides whether decisions and assumptions are in the file", async ({ page }, info) => {
  const { headers, id } = await withRun(page, "notes-" + info.project.name);
  const note = await page.request.post(api + "/designs/" + id + "/notes", { headers, data: { kind: "decision", text: "Keep it simple for the demo." } });
  expect([200, 201]).toContain(note.status());
  await page.reload();
  await expect(page.getByTestId("report-verdict")).toBeVisible();
  for (const withNotes of [true, false]) {
    const box = page.getByTestId("report-pdf-notes");
    if ((await box.isChecked()) !== withNotes) await box.setChecked(withNotes);
    const download = page.waitForEvent("download");
    await page.getByTestId("report-download-pdf").click();
    const { text } = await pdfText((await (await download).path())!);
    if (withNotes) expect(text).toContain("Keep it simple for the demo.");
    else expect(text).not.toContain("Keep it simple for the demo.");
  }
});

test("when the PDF cannot be made the page says so plainly and Print still works", async ({ page }, info) => {
  await page.addInitScript(() => {
    const Real = window.Blob;
    window.Blob = class extends Real {
      constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
        if (options?.type === "application/pdf") throw new Error("forced failure");
        super(parts, options);
      }
    } as typeof Blob;
  });
  await withRun(page, "fail-" + info.project.name);
  await page.getByTestId("report-download-pdf").click();
  await expect(page.getByTestId("report-pdf-error")).toHaveText("The PDF could not be made. You can still print this page.");
  await expect(page.getByRole("button", { name: "Print or save as PDF", exact: true })).toBeEnabled();
  await expect(page.getByTestId("report-download-pdf")).toBeEnabled();
});

test("the controls fit at every width and the Print path is unchanged", async ({ page }, info) => {
  await withRun(page, "fit-" + info.project.name);
  for (const width of [320, 390, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  }
  await page.evaluate(() => {
    (window as unknown as { __printed: number }).__printed = 0;
    window.print = () => void ((window as unknown as { __printed: number }).__printed += 1);
  });
  await page.getByRole("button", { name: "Print or save as PDF", exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1);
});
