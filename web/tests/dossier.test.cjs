const { test } = require("node:test");
const assert = require("node:assert/strict");
const zlib = require("node:zlib");
const { PDFDocument } = require("pdf-lib");
const T = require("../src/lib/dossier/text.ts");
const D = require("../src/lib/dossier/diagram.ts");
const M = require("../src/lib/dossier/model.ts");
const R = require("../src/lib/dossier/render.ts");
const F = require("./helpers/dossier-fixtures.cjs");

// The PDF dossier (docs/PDF-DOSSIER-SCOPE.md). Layout is tested in plain Node with a fixed text measure; the file is tested by
// rendering it with the real fonts, reading it back, and decoding its text.
const build = (report, options = { includeNotes: true }) => M.buildDossier(report, options, F.fake);
const textOf = (dossier) => dossier.pages.flatMap((p) => p.ops.filter((o) => o.k === "text").map((o) => o.text)).join("\n");
// A sentence that wrapped across lines reads as one when the lines are joined by a space.
const flat = (dossier) => textOf(dossier).split(String.fromCharCode(10)).join(" ");
const pageText = (page) => page.ops.filter((o) => o.k === "text").map((o) => o.text).join("\n");

async function pdfText(bytes) {
  const doc = await PDFDocument.load(bytes);
  const chunks = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!obj.contents) continue;
    let data = Buffer.from(obj.contents);
    const filter = obj.dict && obj.dict.get(doc.context.obj("Filter"));
    try {
      if (filter) data = zlib.inflateSync(data);
    } catch {
      continue;
    }
    const s = data.toString("latin1");
    for (const m of s.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) chunks.push(Buffer.from(m[1], "hex").toString("latin1"));
  }
  return chunks.join("\n");
}

// ---------- text ----------
test("characters the font cannot draw become ? and are counted; Latin text and WinAnsi punctuation are kept", () => {
  assert.deepEqual(T.encodable("Café – “quoted” 50% € ©"), { text: "Café – “quoted” 50% € ©", replaced: 0 });
  assert.deepEqual(T.encodable("বাংলা"), { text: "?????", replaced: 5 });
  assert.deepEqual(T.encodable("a\tb\nc"), { text: "a b c", replaced: 0 });
  assert.equal(T.encodable("→ 日本").replaced, 3);
});

test("wrapping never loses a character, respects the width, and breaks a word that is too long", () => {
  const text = "A load balancer in front of three application servers, plus Supercalifragilisticexpialidocious and 12345678901234567890.";
  for (const width of [40, 90, 200]) {
    const lines = T.wrap(text, width, 9, false, F.fake);
    assert.equal(lines.join("").replace(/ /g, ""), text.replace(/ /g, ""), "width " + width);
    for (const line of lines) assert.ok(F.fake(line, 9) <= width + 0.001 || line.length === 1, line);
  }
  assert.deepEqual(T.wrap("one\ntwo", 500, 9, false, F.fake), ["one", "two"]);
});

test("shortening keeps what fits, adds three dots and leaves short text alone", () => {
  assert.equal(T.shorten("App servers", 200, 8, true, F.fake), "App servers");
  const out = T.shorten("A very long component label that cannot fit", 60, 8, true, F.fake);
  assert.ok(out.endsWith("...") && F.fake(out, 8) <= 60, out);
});

test("the file name is the design name and revision, plain and short", () => {
  assert.equal(T.dossierFileName("Classic three-tier web app", 9), "classic-three-tier-web-app-rev9-report.pdf");
  assert.equal(T.dossierFileName("  ***  ", 2), "design-rev2-report.pdf");
  assert.equal(T.dossierFileName("বাংলা", 1), "design-rev1-report.pdf");
  assert.equal(T.dossierFileName("Café Münster", 3), "cafe-munster-rev3-report.pdf");
  assert.ok(T.dossierFileName("x".repeat(200), 1).length <= 60 + "-rev1-report.pdf".length);
});

test("dates are fixed UTC text, so the same report always gives the same words", () => {
  assert.equal(T.utcStamp("2026-11-04T08:30:00.000Z"), "2026-11-04 08:30 UTC");
  assert.equal(T.utcStamp("nope"), "unknown date");
});

// ---------- diagram ----------
test("the diagram fits the box, never enlarges, and says when it cannot be read", () => {
  const small = F.report();
  const fit = D.fitScale(small, { w: 515, h: 600 });
  assert.ok(fit.scale > 0.3 && fit.scale <= 1);
  assert.equal(D.fitScale(F.report({ graph: { nodes: [F.NODE("a", "A", "app", 0, 0)], edges: [] } }), { w: 515, h: 600 }).scale, 1);
  const huge = F.report({ graph: F.bigGraph(50, 25) });
  assert.ok(D.fitScale(huge, { w: 515, h: 600 }).scale < D.ILLEGIBLE_SCALE);
  const drawn = D.drawDiagram(huge, { x: 40, y: 80, w: 515, h: 600 }, F.fake);
  assert.deepEqual([drawn.legible, drawn.ops.length], [false, 0]);
});

test("every component is drawn with its name and a text status, and every connection ends on the boxes", () => {
  const r = F.report();
  const drawn = D.drawDiagram(r, { x: 40, y: 80, w: 515, h: 600 }, F.fake);
  assert.equal(drawn.legible, true);
  const texts = drawn.ops.filter((o) => o.k === "text").map((o) => o.text);
  for (const n of r.graph.nodes) assert.ok(texts.some((t) => t.startsWith(n.label.slice(0, 5))), n.label);
  assert.ok(texts.includes("over limit 167%"));
  assert.ok(texts.includes("near limit 84%"));
  assert.ok(texts.includes("ok 40%"));
  assert.ok(texts.includes("idle 0%"));
  const rects = drawn.ops.filter((o) => o.k === "rect");
  // fail is a double border (two rectangles), warn is dashed, idle is dotted.
  assert.ok(rects.some((o) => o.dash && o.dash[0] === 4), "dashed");
  assert.ok(rects.some((o) => o.dash && o.dash[0] === 1), "dotted");
  const lines = drawn.ops.filter((o) => o.k === "line");
  assert.ok(lines.length >= r.graph.edges.length * 3, "each connection has a line and an arrowhead");
  const inside = (x, y) => rects.some((o) => x >= o.x - 0.6 && x <= o.x + o.w + 0.6 && y >= o.y - 0.6 && y <= o.y + o.h + 0.6);
  for (const l of lines.filter((o) => o.width === 0.8 && o.gray === 0.25).slice(0, 5)) assert.ok(inside(l.x1, l.y1) || inside(l.x2, l.y2));
});

test("results are never drawn for a run recorded for another revision, and a shared label is matched by id", () => {
  const other = F.report();
  other.run.matchesRevision = false;
  other.run.designRevision = 3;
  assert.equal(D.statusesFor(other), null);
  const texts = D.drawDiagram(other, { x: 0, y: 0, w: 515, h: 600 }, F.fake).ops.filter((o) => o.k === "text").map((o) => o.text);
  assert.ok(!texts.some((t) => /limit|ok \d/.test(t)));
  assert.ok(texts.includes("no result"));
  const dup = F.report({ graph: { nodes: [F.NODE("a", "Servers", "app", 0, 0), F.NODE("b", "Servers", "app", 300, 0)], edges: [{ id: "e", from: "a", to: "b" }] } });
  dup.run.simulation.components = [F.component({ id: "a", label: "Servers", type: "app" }, { status: "fail", rho: 1.2 }), F.component({ id: "b", label: "Servers", type: "app" }, { status: "ok", rho: 0.2 })];
  const map = D.statusesFor(dup);
  assert.deepEqual([map.get("a").status, map.get("b").status], ["fail", "ok"]);
  // Without ids, two components sharing a label cannot be told apart, so neither is given a status.
  dup.run.simulation.components = dup.run.simulation.components.map(({ id, ...rest }) => rest);
  assert.equal(D.statusesFor(dup).size, 0);
});

// ---------- model ----------
test("the layout is a pure function: the same report gives identical pages", () => {
  assert.equal(JSON.stringify(build(F.report())), JSON.stringify(build(F.report())));
});

test("every figure in the dossier is the report's own, and the honesty lines are there", () => {
  const r = F.report();
  const text = textOf(build(r));
  for (const part of [
    "Classic three-tier web app",
    "Misses its targets",
    "1,842.07 ms",
    "300 ms",
    "2,210.4 ms",
    "40.918%",
    "1%",
    "1,182 requests per second",
    "The most loaded component is App servers (app) at 167% utilisation.",
    "Model estimate, not a measurement of real infrastructure.",
    "Recorded for revision 4 on 2026-11-03 10:20 UTC.",
    "Revision 4 (current)",
    "A Limits search was not run for this revision, so this report states no breaking point.",
    "These figures come from a queueing model, not from real servers.",
    "Started from a template.",
  ]) assert.ok(text.includes(part), part);
  for (const n of r.graph.nodes) assert.ok(text.includes(n.label), n.label);
  assert.ok(text.includes("3 copies") && text.includes("hit ratio 80%"));
  assert.doesNotMatch(text, /NaN|undefined|\[object|null/);
});

test("a design with no run says so and shows no figures; a run for another revision is stated plainly", () => {
  const none = flat(build(F.report({ run: null })));
  assert.match(none, /No test result has been recorded for revision 4/);
  assert.doesNotMatch(none, /Predicted|Misses its targets|Meets its targets/);
  const other = F.report();
  other.run.matchesRevision = false;
  other.run.designRevision = 3;
  const t = flat(build(other));
  assert.match(t, /This result was recorded for revision 3, not revision 4/);
  assert.match(t, /Results are not drawn: the recorded run is for revision 3, not revision 4\./);
});

test("an AI-drafted design and a keyword-rules draft are marked as such, and the figures are said not to be AI output", () => {
  assert.match(flat(build(F.report({ source: "ai" }))), /AI-drafted by a hosted model, then reviewed and created by the owner\. The simulation figures below are not AI output\./);
  assert.match(textOf(build(F.report({ source: "scripted" }))), /Keyword-rules draft \(no AI\)/);
});

test("notes appear only when asked for, with the report's own scope wording", () => {
  assert.match(textOf(build(F.report(), { includeNotes: true })), /Decision \(revision 3, on Cache\): Keep the cache: reads dominate\./);
  assert.doesNotMatch(textOf(build(F.report(), { includeNotes: false })), /Keep the cache/);
});

test("every page has a footer with the design, revision, run, engine and page numbers", () => {
  const d = build(F.report());
  d.pages.forEach((p, i) => {
    const t = pageText(p);
    assert.ok(t.includes("Design 11111111-1111-4111-8111-111111111111 · revision 4 · run 22222222-2222-4222-8222-222222222222 · engine reference-port-v1"), "footer " + i);
    assert.ok(t.includes(`Page ${i + 1} of ${d.pages.length}`), "page number " + i);
    if (i > 0) assert.ok(t.includes("Classic three-tier web app"), "running header " + i);
  });
});

test("characters the font cannot draw are replaced, counted, and the page says so", () => {
  const d = build(F.report({ name: "বাংলা design", description: "Café ok" }));
  assert.ok(d.replaced >= 5);
  assert.ok(pageText(d.pages[0]).includes("Some characters could not be shown on this page."));
  assert.ok(!pageText(d.pages[1]).includes("Some characters could not be shown on this page.") || d.replaced > 5);
  assert.equal(build(F.report()).replaced, 0);
  assert.doesNotMatch(textOf(build(F.report())), /could not be shown/);
});

test("a long table continues on the next page with its header repeated, and no row is lost", () => {
  const graph = F.bigGraph(60, 6);
  const r = F.report({ graph, run: null });
  const d = build(r);
  const t = textOf(d);
  for (const n of graph.nodes) assert.ok(t.includes(n.label), n.label);
  assert.ok(d.pages.length >= 3);
  assert.ok(d.pages.filter((p) => pageText(p).includes("Component\n")).length >= 2, "header repeats");
});

test("a wide graph gets a landscape page; a huge one says so and leaves the details to the tables", () => {
  const wide = build(F.report({ graph: F.bigGraph(30, 8), run: null }));
  assert.ok(wide.pages.some((p) => p.width > p.height), "a landscape page");
  const huge = build(F.report({ graph: F.bigGraph(50, 25), run: null }));
  assert.match(textOf(huge), /Too many components to draw legibly on one page; see the component and connection tables that follow\./);
  assert.ok(huge.pages.every((p) => p.width < p.height), "no landscape page is made for something that cannot be read");
  assert.ok(!huge.pages.some((p) => p.ops.filter((o) => o.k === "text").length < 8), "no nearly empty page");
});

test("a design with no components is stated, not drawn", () => {
  assert.match(textOf(build(F.report({ graph: { nodes: [], edges: [] }, run: null }))), /The design has no components\./);
});

// ---------- the file ----------
test("the file parses, has the right pages and metadata, and its text contains the report's figures", async () => {
  const r = F.report();
  const { bytes, dossier } = await R.renderDossier(r, { includeNotes: true });
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), dossier.pages.length);
  assert.equal(doc.getTitle(), "Classic three-tier web app - revision 4 report");
  assert.equal(doc.getAuthor(), "StressFORGE".replace("FORGE", "Forge"));
  assert.match(doc.getSubject(), /not a measurement of real infrastructure/);
  assert.equal(dossier.fileName, "classic-three-tier-web-app-rev4-report.pdf");
  const text = await pdfText(bytes);
  for (const part of ["Classic three-tier web app", "Misses its targets", "1,842.07 ms", "40.918%", "App servers", "Page 1 of " + dossier.pages.length, "Model estimate, not a measurement of real infrastructure."]) assert.ok(text.includes(part), part);
  assert.doesNotMatch(text, /NaN|undefined|\[object/);
  assert.ok(bytes.length > 1500);
});

test("the same report gives the same file, byte for byte", async () => {
  const a = await R.renderDossier(F.report(), { includeNotes: true });
  const b = await R.renderDossier(F.report(), { includeNotes: true });
  assert.equal(Buffer.compare(Buffer.from(a.bytes), Buffer.from(b.bytes)), 0);
});

test("a name the font cannot draw still gives a valid file", async () => {
  const { bytes } = await R.renderDossier(F.report({ name: "বাংলা system → ok" }), { includeNotes: true });
  await PDFDocument.load(bytes);
  assert.match(await pdfText(bytes), /\?{5} system \? ok/);
});
