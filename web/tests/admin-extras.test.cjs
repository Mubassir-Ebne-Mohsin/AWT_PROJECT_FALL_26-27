const {test} = require("node:test");
const assert = require("node:assert/strict");
const {PDFDocument} = require("pdf-lib");
const {buildAdminSummary} = require("../src/lib/admin-summary.ts");
const {renderPdfDocument} = require("../src/lib/dossier/render.ts");
const {renderToStaticMarkup} = require("react-dom/server");
const React = require("react");
const {ActivityHeatmap} = require("../src/components/admin/activity-heatmap.tsx");
const {sample} = require("./helpers/admin-extras-fixture.cjs");

test("heatmap has 168 numeric cells, Monday/Sunday boundaries, UTC window totals and an accessible table",()=>{
 const html=renderToStaticMarkup(React.createElement(ActivityHeatmap,{m:sample()}));
 assert.equal((html.match(/data-testid="activity-cell"/g)||[]).length,168);
 assert.match(html,/Monday 0:00 UTC: 2/);assert.match(html,/Sunday 23:00 UTC: 3/);
 assert.match(html,/Show activity as table/);assert.match(html,/end excluded/);assert.match(html,/data-testid="activity-total">5/);
 assert.equal((html.match(/<tr>/g)||[]).length,169);
});
test("Admin PDF is one A4 page with exact UTC source, digest and aggregate headlines; no extra fields are rendered",async()=>{
 const m={...sample(),name:"PRIVATE NAME",email:"private@example.test",notes:"PRIVATE NOTE"};
 const layout=buildAdminSummary(m);
 assert.equal(layout.pages.length,1);assert.equal(layout.pages[0].height,842);
 const lines=layout.pages[0].ops.filter(o=>o.k==="text").map(o=>o.text);
 assert.ok(lines.includes("42")); assert.ok(lines.includes(m.snapshotKey));
 assert.ok(lines.some(s=>s.includes(m.generatedAt)));
 assert.ok(lines.every(s=>!s.includes("PRIVATE")&&!s.includes("private@example")));
 assert.ok(layout.pages[0].ops.every(o=>o.y>0&&o.y<842));
 const first=await renderPdfDocument(()=>layout,m.generatedAt,"Aggregate Admin dashboard snapshot");
 const again=await renderPdfDocument(()=>buildAdminSummary(m),m.generatedAt,"Aggregate Admin dashboard snapshot");
 assert.deepEqual(first.bytes,again.bytes);
 const doc=await PDFDocument.load(first.bytes);assert.equal(doc.getPageCount(),1);
 assert.equal(doc.getTitle(),"StressForge Admin snapshot"); assert.equal(doc.getCreationDate().toISOString(),m.generatedAt);
 assert.match(layout.fileName,/2026-11-06T12-34-56.000Z.pdf$/);
});
