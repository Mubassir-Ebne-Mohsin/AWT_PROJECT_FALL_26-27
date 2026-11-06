const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../../..'),kind=process.env.SF_PDF_BRAND_MUTATION;
const changes={missing:['web/src/lib/dossier/render.ts','...pdfBrandOps(page, measure, generatedAt)','...[]'],placement:['web/src/lib/pdf-brand.ts','const x = page.width - 40 - (22 + measure(BRAND_NAME, size, true));','const x = 40;'],print:['web/src/components/report/report-document.tsx','{printBrandCss(report.generatedAt)}','{""}']};
const change=changes[kind];if(!change)throw Error('Invalid fault');const read=fs.readFileSync;let n=0;
fs.readFileSync=function(file,...args){let value=read.call(this,file,...args);if(typeof file==='string'&&path.resolve(file).toLowerCase()===path.resolve(root,change[0]).toLowerCase()){
 const text=String(value);if(text.includes(change[1])){n++;const out=text.replace(change[1],change[2]);value=typeof value==='string'?out:Buffer.from(out);}}
 return value;};
process.on('exit',()=>console.log('MUTATION_APPLIED',kind,n));
