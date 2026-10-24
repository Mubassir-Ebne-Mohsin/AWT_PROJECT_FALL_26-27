import { test, expect, type Page } from "@playwright/test";
const api = process.env.SF_API_URL ?? "http://localhost:5001/v1";
async function ownedDesign(page: Page, tag: string) {
  await page.goto("/register");
  await page.getByLabel("Name", {exact:true}).fill("M3 Deep Audit");
  await page.getByLabel("Email", {exact:true}).fill(`deep-${tag}-${Date.now()}@example.test`);
  await page.getByLabel("Password", {exact:true}).fill("Deep-Audit-2026!");
  await page.locator("#reg-terms").check();
  const registered=page.waitForResponse(r=>r.url().endsWith("/auth/register")&&r.status()===201);
  await page.getByRole("button",{name:"Create account",exact:true}).click();
  const token=(await (await registered).json()).data.accessToken;
  await expect(page.getByRole("button",{name:"Account menu",exact:true})).toBeVisible();
  await page.goto("/new/template");
  await page.getByRole("button",{name:"Use Single-server MVP",exact:true}).click();
  await expect(page.getByLabel("Replicas (1–200)")).toBeVisible();
  const id=new URL(page.url()).pathname.split("/")[2];
  return {id,token};
}
async function run(page: Page) {
  const response=page.waitForResponse(r=>r.url().endsWith("/simulate") && [200,202].includes(r.status()));
  await page.getByRole("button",{name:"Run test",exact:true}).click();
  const id=(await (await response).json()).data.run.id;
  await expect(page).toHaveURL(new RegExp("run="+id+"$"));
  await expect(page.getByRole("heading",{name:"Model results"})).toBeVisible();
  return id;
}
test("stored result navigation uses the selected URL, not a cached newer run",async({page},info)=>{
  await ownedDesign(page,info.project.name);
  const first=await run(page);
  await page.getByRole("link",{name:"Edit",exact:true}).click();
  await page.getByLabel("Replicas (1–200)").fill("3");
  await expect(page.getByRole("status").filter({hasText:/^Saved/})).toBeVisible();
  const second=await run(page);expect(second).not.toBe(first);
  await page.getByRole("navigation",{name:"Breadcrumb",exact:true}).getByRole("link",{name:"Dashboard",exact:true}).click();
  await page.locator(`table a[href$="run=${first}"]`).click();
  await expect(page).toHaveURL(new RegExp("run="+first+"$"));
  await expect(page.getByText(/Revision 1 ·/)).toBeVisible();
});
test("a clean reopened draft adopts a server edit from another tab",async({page},info)=>{
  const {id,token}=await ownedDesign(page,info.project.name);
  await page.getByRole("navigation",{name:"Breadcrumb",exact:true}).getByRole("link",{name:"Dashboard",exact:true}).click();
  const original=(await (await page.request.get(api+"/designs/"+id,{headers:{Authorization:"Bearer "+token}})).json()).data;
  original.graph.nodes.find((n:{type:string})=>n.type==="app").props.replicas=7;
  const updated=await page.request.patch(api+"/designs/"+id,{headers:{Authorization:"Bearer "+token},data:{expectedRevision:original.revision,graph:original.graph}});
  expect(updated.status()).toBe(200);
  await page.getByRole("link").filter({has:page.getByRole("heading",{name:"Single-server MVP",exact:true})}).click();
  await expect(page.getByLabel("Replicas (1–200)")).toHaveValue("7");
  await expect(page.getByRole("status").filter({hasText:/^Saved/})).toContainText("revision 2");
});
test("adding replicas to a default database saves once and then stays idle",async({page},info)=>{
  const {id}=await ownedDesign(page,info.project.name);
  let patches=0;
  page.on("request",request=>{if(request.method()==="PATCH"&&request.url()===api+"/designs/"+id)patches++;});
  await page.getByLabel("Component",{exact:true}).selectOption({label:"Database"});
  await page.getByLabel("Replicas (1–200)").fill("4");
  await expect(page.getByRole("status").filter({hasText:/^Saved/})).toBeVisible();
  // Observe multiple complete 750ms debounce windows; this is the regression itself.
  await page.waitForTimeout(2500);
  expect(patches).toBe(1);
  await run(page);
  expect(patches).toBe(1);
});
test("unknown acceptance survives an HTTP 429 and recovers the original run",async({page},info)=>{
  const {id,token}=await ownedDesign(page,info.project.name);
  const submitted: string[]=[];
  await page.route(api+"/designs/"+id+"/simulate",async route=>{
    submitted.push(route.request().postDataJSON().requestId);
    if(submitted.length===1){await route.fetch();await route.abort("connectionreset");}
    else if(submitted.length===2)await route.fulfill({status:429,json:{error:{code:"RATE_LIMITED",message:"Audit throttle"}}});
    else await route.continue();
  });
  await page.getByRole("button",{name:"Run test",exact:true}).click();
  await expect(page.getByRole("button",{name:"Retry same request"})).toBeVisible({timeout:20000});
  await page.getByRole("button",{name:"Retry same request"}).click();
  await expect(page.getByRole("alert").filter({hasText:"Audit throttle"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Retry same request"})).toBeVisible();
  await page.getByRole("button",{name:"Retry same request"}).click();
  await expect(page.getByRole("heading",{name:"Model results"})).toBeVisible();
  expect(new Set(submitted).size).toBe(1);
  const dashboard=await page.request.get(api+"/dashboard",{headers:{Authorization:"Bearer "+token}});
  expect((await dashboard.json()).data.counts.retainedRuns).toBe(1);
});

test("dirty replicas survive real session-modal reauthentication",async({page},info)=>{
  const {id}=await ownedDesign(page,info.project.name);
  await page.route(api+"/designs/"+id,async route=>{
    if(route.request().method()==="PATCH")await route.fulfill({status:401,json:{error:{code:"SESSION_EXPIRED",message:"Audit expiry"}}});
    else await route.continue();
  });
  await page.route(api+"/auth/refresh",route=>route.fulfill({status:401,json:{error:{code:"SESSION_EXPIRED",message:"Audit expiry"}}}));
  await page.getByLabel("Replicas (1–200)").fill("8");
  await expect(page.getByRole("alertdialog",{name:"Your session expired"})).toBeVisible();
  await page.unroute(api+"/designs/"+id);await page.unroute(api+"/auth/refresh");
  await page.locator("#sess-pw").fill("Deep-Audit-2026!");
  await page.getByRole("button",{name:"Log in again",exact:true}).click();
  await expect(page.getByRole("alertdialog",{name:"Your session expired"})).toHaveCount(0);
  await expect(page.getByLabel("Replicas (1–200)")).toHaveValue("8");
  await page.getByRole("button",{name:"Save",exact:true}).click();
  await expect(page.getByRole("status").filter({hasText:/^Saved/})).toBeVisible();
});
test("late run acceptance does not pull the user back after leaving the workspace",async({page},info)=>{
  const {id}=await ownedDesign(page,info.project.name);
  await run(page);
  await page.getByRole("link",{name:"Edit",exact:true}).click();
  let release!:()=>void, seen!:()=>void;
  const held=new Promise<void>(resolve=>{release=resolve}), accepted=new Promise<void>(resolve=>{seen=resolve});
  await page.route(api+"/designs/"+id+"/simulate",async route=>{const response=await route.fetch();seen();await held;await route.fulfill({response});});
  await page.getByRole("button",{name:"Run test",exact:true}).click();await accepted;
  page.once("dialog",dialog=>dialog.accept());
  await page.getByRole("navigation",{name:"Breadcrumb",exact:true}).getByRole("link",{name:"Dashboard",exact:true}).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  release();
  // Allow the held async event handler to finish before checking that navigation stays put.
  await page.waitForTimeout(800);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goBack();
  await expect(page.getByLabel("Replicas (1–200)")).toBeVisible();
  await expect(page.getByRole("button",{name:"Run test",exact:true})).toBeEnabled();
});
test("late template creation does not navigate away from the chosen destination",async({page},info)=>{
  await ownedDesign(page,info.project.name);await page.goto("/new/template");
  let release!:()=>void,seen!:()=>void;
  const held=new Promise<void>(resolve=>{release=resolve}),accepted=new Promise<void>(resolve=>{seen=resolve});
  await page.route(api+"/designs",async route=>{if(route.request().method()!=="POST")return route.continue();const response=await route.fetch();seen();await held;await route.fulfill({response});});
  await page.getByRole("button",{name:"Use Classic three-tier web app",exact:true}).click();await accepted;
  await page.getByRole("navigation",{name:"Breadcrumb",exact:true}).getByRole("link",{name:"Dashboard",exact:true}).click();
  await expect(page).toHaveURL(/\/dashboard$/);release();await page.waitForTimeout(800);
  await expect(page).toHaveURL(/\/dashboard$/);
});