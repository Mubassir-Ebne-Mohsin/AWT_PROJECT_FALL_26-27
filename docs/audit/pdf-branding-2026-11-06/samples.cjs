const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../../..'),web=path.join(root,'web');
require(path.join(web,'tests/register.cjs'));
const {renderDossier,renderPdfDocument}=require(path.join(web,'src/lib/dossier/render.ts'));
const F=require(path.join(web,'tests/helpers/dossier-fixtures.cjs'));
const {sample}=require(path.join(web,'tests/helpers/admin-extras-fixture.cjs'));
const {buildAdminSummary}=require(path.join(web,'src/lib/admin-summary.ts'));
const React=require(path.join(web,'node_modules/react'));
const {renderToStaticMarkup}=require(path.join(web,'node_modules/react-dom/server'));
const {ReportDocument}=require(path.join(web,'src/components/report/report-document.tsx'));
const {chromium}=require(path.join(web,'node_modules/@playwright/test'));
(async()=>{
 const cases=[['report',F.report()],['landscape',F.report({graph:F.bigGraph(8,8),run:null})],['long',F.report({name:'Long architecture report '.repeat(10),description:'Full description preserved. '.repeat(700)})]];
 const evidence=[];
 for(const [name,report] of cases){const out=await renderDossier(report,{includeNotes:true});fs.writeFileSync(path.join(__dirname,name+'.pdf'),out.bytes);evidence.push({name,pages:out.dossier.pages.length,landscapePages:out.dossier.pages.filter(p=>p.width>p.height).length});}
 const m=sample(),admin=await renderPdfDocument(()=>buildAdminSummary(m),m.generatedAt,'Aggregate snapshot');fs.writeFileSync(path.join(__dirname,'admin.pdf'),admin.bytes);evidence.push({name:'admin',pages:1});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage();
  const report=F.report({description:'Full printed description. '.repeat(400)});
  const css=['proto.css','m15.css','m16.css'].map(n=>fs.readFileSync(path.join(web,'src/styles',n),'utf8')).join('\n');
  await page.setContent('<!doctype html><html><head><style>'+css+'</style></head><body>'+renderToStaticMarkup(React.createElement(ReportDocument,{report}))+'</body></html>');
  await page.emulateMedia({media:'print'});
  await page.pdf({path:path.join(__dirname,'print-shared.pdf'),format:'A4',preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false});
  evidence.push({name:'print-shared',printStyles:await page.locator('style[media=print]').count()});
 }finally{await browser.close();}
 fs.writeFileSync(path.join(__dirname,'samples.json'),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
})().catch(e=>{console.error(e);process.exitCode=1});
