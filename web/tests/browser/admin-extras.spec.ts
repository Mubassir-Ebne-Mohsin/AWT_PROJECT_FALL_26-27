import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { PDFDocument } from "pdf-lib";
const api=process.env.SF_API_URL ?? "http://localhost:5001/v1";
const pg={container:process.env.SF_PG_CONTAINER,user:process.env.SF_PG_USER,db:process.env.SF_PG_DB};
const available=!!(pg.container&&pg.user&&pg.db);
const sql=(s:string)=>execFileSync("docker",["exec",pg.container!,"psql","-U",pg.user!,"-d",pg.db!,"-v","ON_ERROR_STOP=1","-c",s],{stdio:"pipe"});
async function setup(page:Page,tag:string,admin=true){
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
 const email=`extras-${Date.now()}-${tag}@example.test`;
 await page.goto("/register");await page.getByLabel("Name",{exact:true}).fill("Private Export Canary");
 await page.getByLabel("Email",{exact:true}).fill(email);await page.getByLabel("Password",{exact:true}).fill("Extras-Audit-2026!");await page.locator("#reg-terms").check();
 const response=page.waitForResponse(r=>r.url()===api+"/auth/register"&&r.status()===201);
 await page.getByRole("button",{name:"Create account",exact:true}).click();
 const token=(await (await response).json()).data.accessToken;
 await expect(page.getByRole("button",{name:"Account menu",exact:true})).toBeVisible();
 if(admin)sql(`INSERT INTO user_roles(user_id,role,granted_by,granted_at) SELECT id,'admin',NULL,now() FROM users WHERE email='${email}' ON CONFLICT DO NOTHING`);
 await page.goto("/admin/dashboard");
 if(admin) { await expect(page.getByTestId("activity-heatmap")).toBeVisible();await page.getByTestId("dash-pause").click(); }
 return {email,token,errors};
}
async function download(page:Page,kind:string){const pending=page.waitForEvent("download");await page.getByRole("button",{name:`Download ${kind}`,exact:true}).click();const file=await pending;return {name:file.suggestedFilename(),bytes:readFileSync((await file.path())!)};}
async function pdfText(bytes:Buffer){
 const doc=await PDFDocument.load(bytes), lines:string[]=[];
 for(const [,obj] of doc.context.enumerateIndirectObjects()){
  const stream=obj as unknown as {contents?:Uint8Array;dict?:{get(k:unknown):unknown}};if(!stream.contents)continue;
  let data:Buffer=Buffer.from(stream.contents);try{if(stream.dict?.get(doc.context.obj("Filter")))data=inflateSync(data);}catch{continue;}
  for(const m of data.toString("latin1").matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g))lines.push(Buffer.from(m[1],"hex").toString("latin1"));
 }return {pages:doc.getPageCount(),text:lines.join("\n")};
}

test("heatmap and all three real downloads match the clicked aggregate snapshot, with no personal text",async({page},info)=>{
 test.skip(!available,"Requires the explicitly labelled disposable database");
 const {email,errors,token}=await setup(page,info.project.name);
 const headers={Authorization:"Bearer "+token};
 const templates=(await (await page.request.get(api+"/templates",{headers})).json()).data;
 const template=templates.find((x:{id:string})=>x.id==="mvp");
 const created=await page.request.post(api+"/designs",{headers,data:{schemaVersion:1,name:"Private Export Canary",description:"Private contents",source:"template",templateId:template.id,graph:template.graph,traffic:template.traffic}});
 expect(created.status()).toBe(201);const design=(await created.json()).data;
 const accepted=await page.request.post(api+`/designs/${design.id}/simulate`,{headers,data:{expectedRevision:design.revision,requestId:crypto.randomUUID()}});
 expect(accepted.status()).toBe(202);const statusUrl=(await accepted.json()).data.statusUrl;
 await expect.poll(async()=>{const r=await page.request.get(api.replace(/\/v1$/,"")+statusUrl,{headers});return (await r.json()).data.status;}).toBe("completed");
 await page.waitForTimeout(3100);await page.reload();await expect(page.getByTestId("activity-heatmap")).toBeVisible();await page.getByTestId("dash-pause").click();
 const key=await page.getByTestId("metrics-exports").getAttribute("data-snapshot");
 await expect(page.getByTestId("activity-cell")).toHaveCount(168);
 await page.getByText("Show activity as table",{exact:true}).click();
 await expect(page.getByRole("table",{name:"Activity by UTC weekday and hour"}).locator("tbody tr")).toHaveCount(168);
 const tableRegion=page.getByRole("region",{name:"Scrollable UTC activity table"});await tableRegion.focus();await expect(tableRegion).toBeFocused();await page.keyboard.press("PageDown");
 const json=await download(page,"JSON"),body=JSON.parse(json.bytes.toString());
 expect(body.heatmap.designsCreated).toBeGreaterThan(0);expect(body.heatmap.runsCreated).toBeGreaterThan(0);
 expect(body.snapshotKey).toBe(key);expect(body.heatmap.cells.reduce((a:number,b:number)=>a+b,0)).toBe(body.heatmap.total);
 await expect(page.getByTestId("activity-total")).toHaveText(String(body.heatmap.total));
 const csv=await download(page,"CSV");expect(csv.bytes.toString()).toContain(`snapshotKey.${key},1`);
 for(const row of csv.bytes.toString().trim().split(/\r?\n/).slice(1))expect(row).toMatch(/^[A-Za-z][A-Za-z0-9_.-]*,\d+(\.\d+)?$/);
 const pdf=await download(page,"PDF"),decoded=await pdfText(pdf.bytes);
 expect(decoded.pages).toBe(1);expect(decoded.text).toContain(key!);expect(decoded.text).toContain(body.generatedAt);
 for(const content of [json.bytes.toString(),csv.bytes.toString(),decoded.text]){expect(content).not.toContain(email);expect(content).not.toContain(design.id);expect(content).not.toContain("Private Export Canary");}
 for(const file of [json,csv,pdf])expect(file.name).toMatch(/^stressforge-metrics-[0-9TZ.\-]+\.(csv|json|pdf)$/);
 for(const width of [320,390,1024,1440]){
  await page.setViewportSize({width,height:900});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
  const screenshot=`../docs/audit/dashboard-extras-2026-11-06/${info.project.name}-${width}.png`;
  if(width<1024){await page.getByTestId("activity-heatmap").getByRole("heading").scrollIntoViewIfNeeded();await page.screenshot({path:screenshot});}
  else await page.getByTestId("activity-heatmap").screenshot({path:screenshot});
 }
 expect(errors).toEqual([]);
});

test("expired snapshot and unavailable export auditing give local failures and an explicit refresh",async({page},info)=>{
 test.skip(!available,"Requires disposable database");await setup(page,"failure-"+info.project.name);
 let mode="expired";
 await page.route(api+"/admin/metrics/export**",route=>route.fulfill({status:mode==="expired"?404:503,json:{error:{code:mode==="expired"?"NOT_FOUND":"UNAVAILABLE",message:mode==="expired"?"This dashboard snapshot expired. Refresh the dashboard before exporting.":"Export auditing is unavailable. Please try again shortly."}}}));
 await page.getByRole("button",{name:"Download JSON",exact:true}).click();await expect(page.getByTestId("metrics-export-message")).toContainText("expired");
 await expect(page.getByRole("button",{name:"Refresh dashboard",exact:true})).toBeVisible();
 mode="down";await page.getByRole("button",{name:"Download CSV",exact:true}).click();await expect(page.getByTestId("metrics-export-message")).toContainText("auditing is unavailable");
 await expect(page.getByTestId("admin-dashboard")).toBeVisible();
 await page.unroute(api+"/admin/metrics/export**");
 const response=page.waitForResponse(r=>r.url()===api+"/admin/metrics"&&r.status()===200);
 await page.getByRole("button",{name:"Refresh dashboard",exact:true}).click();await response;
 expect((await download(page,"JSON")).bytes.length).toBeGreaterThan(100);
});

test("plain account gets neither aggregate UI nor exports",async({page},info)=>{
 const {token}=await setup(page,"denied-"+info.project.name,false);
 await expect(page.getByTestId("role-gate-denied")).toBeVisible();await expect(page.getByTestId("metrics-exports")).toHaveCount(0);
 expect((await page.request.get(api+"/admin/metrics/export?format=json&snapshot="+"a".repeat(64),{headers:{Authorization:"Bearer "+token}})).status()).toBe(403);
});
