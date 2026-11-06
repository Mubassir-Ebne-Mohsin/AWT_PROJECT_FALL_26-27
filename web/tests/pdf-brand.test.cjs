const {test}=require("node:test");
const assert=require("node:assert/strict");
const React=require("react");
const {renderToStaticMarkup}=require("react-dom/server");
const {PDFDocument}=require("pdf-lib");
const {pdfBrandOps,sourceCredit,BRAND_NAME,printBrandCss}=require("../src/lib/pdf-brand.ts");
const {renderDossier,renderPdfDocument}=require("../src/lib/dossier/render.ts");
const {buildAdminSummary}=require("../src/lib/admin-summary.ts");
const {ReportDocument}=require("../src/components/report/report-document.tsx");
const F=require("./helpers/dossier-fixtures.cjs");
const {sample}=require("./helpers/admin-extras-fixture.cjs");

test("monochrome vector logo fits the top-right of both orientations and attribution fits below existing footers",()=>{
 for(const page of [{width:595,height:842},{width:842,height:595}]){
  const ops=pdfBrandOps(page,F.fake,"2026-11-06T12:00:00Z");
  const logo=ops.find(o=>o.text===BRAND_NAME),credit=ops.find(o=>o.text?.startsWith("©"));
  assert.equal(logo.x+F.fake(logo.text,logo.size,true),page.width-40);
  assert.equal(logo.gray,0);assert.equal(logo.bold,true);
  const segments=ops.filter(o=>o.k==="line");assert.equal(segments.length,8);
  assert.ok(segments.every(o=>o.gray===0&&o.x1>page.width/2&&o.y1<32&&o.y2<32));
  assert.equal(credit.y,page.height-14);assert.ok(credit.x+F.fake(credit.text,credit.size)<page.width-40);
 }
});
test("source year is snapshot-based rather than today's clock, with a stable invalid-date fallback",()=>{
 assert.match(sourceCredit("2030-01-01T00:30:00+02:00"),/^© 2029 STRESSFORGE/);
 assert.match(sourceCredit("bad date"),/^© 2026 STRESSFORGE/);
});
test("every actual dossier page is branded without covering titles or changing recorded figures",async()=>{
 const report=F.report({name:"A very long report name ".repeat(12),description:"Description ".repeat(800)});
 const {dossier,bytes}=await renderDossier(report,{includeNotes:true});
 assert.ok(dossier.pages.length>2);
 for(const page of dossier.pages){
  assert.equal(page.ops.filter(o=>o.text===BRAND_NAME).length,1);
  assert.equal(page.ops.filter(o=>o.text===sourceCredit(report.generatedAt)).length,1);
  for(const op of page.ops.filter(o=>o.k==="text"&&o.text!==BRAND_NAME&&!o.text.startsWith("©"))){
   assert.ok(op.y-op.size>=32,"report text intrudes into logo band");
  }
 }
 const doc=await PDFDocument.load(bytes);assert.equal(doc.getAuthor(),"StressForge");
 assert.equal(doc.getPageCount(),dossier.pages.length);
 assert.ok(dossier.pages.flatMap(p=>p.ops).some(o=>o.text==="1,842.07 ms"));
});
test("Admin summary uses the shared branding and repeated rendering never mutates a retained source layout",async()=>{
 const m=sample(),layout=buildAdminSummary(m),before=JSON.stringify(layout);
 const one=await renderPdfDocument(()=>layout,m.generatedAt,"Admin snapshot");
 const two=await renderPdfDocument(()=>layout,m.generatedAt,"Admin snapshot");
 assert.equal(JSON.stringify(layout),before);assert.deepEqual(one.bytes,two.bytes);
 assert.equal(one.dossier.pages.length,1);
 assert.equal(one.dossier.pages[0].ops.filter(o=>o.text===BRAND_NAME).length,1);
});
test("owner and design-only shared print views have the same vector mark and source without adding private content",()=>{
 for(const designOnly of [false,true]){
  const html=renderToStaticMarkup(React.createElement(ReportDocument,{report:F.report(),designOnly}));
  assert.match(html,/<style media="print">/);assert.ok(html.includes(printBrandCss(F.report().generatedAt)));
  assert.match(html,/@top-right/);assert.match(html,/@bottom-left/);
  assert.ok(html.includes(BRAND_NAME));assert.ok(html.includes(sourceCredit(F.report().generatedAt)));
  assert.doesNotMatch(html,/All rights reserved|ownership transferred/i);
 }
});
