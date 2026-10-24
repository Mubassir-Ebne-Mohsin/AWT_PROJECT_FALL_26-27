import {test,expect,type Page} from "@playwright/test";
const api=process.env.SF_API_URL??"http://localhost:5001/v1";
type Node={id:string;type:string;label:string;x:number;y:number};
async function setup(page:Page,tag:string,blank=false){
 await page.goto("/register");await page.getByLabel("Name",{exact:true}).fill("M6 Editing");
 await page.getByLabel("Email",{exact:true}).fill("m6-"+Date.now()+"-"+tag+"@example.test");await page.getByLabel("Password",{exact:true}).fill("M6-Editing-2026!");
 await page.locator("#reg-terms").check();const registered=page.waitForResponse(r=>r.url()===api+"/auth/register"&&r.status()===201);
 await page.getByRole("button",{name:"Create account",exact:true}).click();const token=(await(await registered).json()).data.accessToken;
 await expect(page.getByRole("button",{name:"Account menu",exact:true})).toBeVisible();
 if(blank){await page.goto("/new/blank");await page.getByLabel("Start with",{exact:true}).selectOption("empty");await page.getByRole("button",{name:"Create blank design",exact:true}).click();}
 else {await page.goto("/new/template");await page.getByRole("button",{name:"Use Single-server MVP",exact:true}).click();}
 await expect(page.getByRole("button",{name:"Add App server",exact:true})).toBeEnabled();
 const id=new URL(page.url()).pathname.split("/")[2],headers={Authorization:"Bearer "+token};
 const read=async()=>(await(await page.request.get(api+"/designs/"+id,{headers})).json()).data;
 return {id,headers,read};
}
async function saved(page:Page){await expect(page.getByRole("status").filter({hasText:/^Saved ·/})).toBeVisible();}
async function addEdge(page:Page,from:string,to:string){
 await page.getByLabel("Source component",{exact:true}).selectOption(from);await page.getByLabel("Destination component",{exact:true}).selectOption(to);
 await page.getByRole("button",{name:"Add connection",exact:true}).click();
}
async function check(page:Page){await page.getByRole("button",{name:"Check graph",exact:true}).click();await expect(page.getByRole("button",{name:"Check graph",exact:true})).toBeEnabled();}
const canvas=(page:Page)=>page.getByRole("region",{name:"Architecture canvas",exact:true});
test("M6 blank design becomes a saved connected runnable graph; validation gives a repair action",async({page},info)=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
 const {read}=await setup(page,"blank-"+info.project.name,true);
 await check(page);
 await expect(page.getByRole("heading",{name:"Graph check",exact:true})).toBeVisible();
 await expect(page.getByText("The canvas is empty.",{exact:true})).toBeVisible();
 for(const name of ["Clients","App server","Database"])await page.getByRole("button",{name:"Add "+name,exact:true}).click();
 await saved(page);let d=await read();const client=d.graph.nodes.find((n:Node)=>n.type==="client"),app=d.graph.nodes.find((n:Node)=>n.type==="app"),db=d.graph.nodes.find((n:Node)=>n.type==="db");
 await check(page);await expect(page.getByRole("button",{name:"Start connection",exact:true})).toBeVisible();
 await addEdge(page,client.id,app.id);await addEdge(page,app.id,db.id);await check(page);
 await expect(page.getByText("Ready to run",{exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Run test",exact:true}).click();await expect(page.getByRole("heading",{name:"Model results",exact:true})).toBeVisible();
 await page.getByRole("link",{name:"Edit",exact:true}).click();await page.reload();d=await read();expect(d.graph.edges).toHaveLength(2);
 await expect(page.getByLabel("Connection",{exact:true}).locator("option")).toHaveCount(3);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(errors).toEqual([]);
});
test("M6 cycle saves but blocks Run with actionable issues; deleting the cycle repairs it",async({page},info)=>{
 const {read}=await setup(page,"cycle-"+info.project.name),d=await read(),app=d.graph.nodes.find((n:Node)=>n.type==="app"),db=d.graph.nodes.find((n:Node)=>n.type==="db");
 await addEdge(page,db.id,app.id);await saved(page);const cyclic=await read();expect(cyclic.graph.edges.length).toBe(d.graph.edges.length+1);
 const rejected=page.waitForResponse(r=>r.url().endsWith("/simulate")&&r.status()===422);
 await page.getByRole("button",{name:"Run test",exact:true}).click();await rejected;
 await expect(page.getByText(/Cycle found:/).first()).toBeVisible();await expect(page.getByRole("button",{name:"Select "+app.label,exact:true})).toBeVisible();
 await page.getByLabel("Connection",{exact:true}).selectOption(cyclic.graph.edges.at(-1).id);await page.getByRole("button",{name:"Delete connection",exact:true}).click();
 await check(page);await expect(page.getByText("Ready to run",{exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Undo",exact:true}).click();await expect(page.getByText("Outdated check",{exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Redo",exact:true}).click();await check(page);await expect(page.getByText("Ready to run",{exact:true})).toBeVisible();
});
test("M6 duplicate/delete/undo restores a component and all incident arrows; keyboard respects inputs",async({page},info)=>{
 const {read}=await setup(page,"history-"+info.project.name),d=await read(),app=d.graph.nodes.find((n:Node)=>n.type==="app");
 await page.getByLabel("Component",{exact:true}).selectOption(app.id);await page.getByRole("button",{name:"Delete selection",exact:true}).click();await saved(page);
 expect((await read()).graph.edges.every((e:{from:string;to:string})=>e.from!==app.id&&e.to!==app.id)).toBe(true);
 await page.getByRole("button",{name:"Undo",exact:true}).click();await saved(page);expect((await read()).graph).toEqual(d.graph);
 await page.getByLabel("Component",{exact:true}).selectOption(app.id);await canvas(page).focus();await page.keyboard.press("Control+d");await saved(page);
 let current=await read();expect(current.graph.nodes).toHaveLength(d.graph.nodes.length+1);expect(current.graph.edges).toEqual(d.graph.edges);
 const copy=current.graph.nodes.at(-1);await page.getByLabel("Component name",{exact:true}).fill("Copy renamed");
 await page.getByLabel("Component name",{exact:true}).press("Control+z");expect((await read()).graph.nodes).toHaveLength(d.graph.nodes.length+1);
 await canvas(page).focus();await page.keyboard.press("Delete");await saved(page);current=await read();expect(current.graph.nodes.some((n:Node)=>n.id===copy.id)).toBe(false);
 await page.keyboard.press("Control+z");await saved(page);expect((await read()).graph.nodes.some((n:Node)=>n.id===copy.id)).toBe(true);
});
test("M6 arrows support selection/reversal and zoomed port drag; Escape cancels without writes",async({page},info)=>{
 const {read}=await setup(page,"pointer-"+info.project.name),d=await read(),edge=d.graph.edges.find((e:{from:string})=>d.graph.nodes.find((n:Node)=>n.id===e.from)?.type==="app");
 await page.getByLabel("Connection",{exact:true}).selectOption(edge.id);await page.getByRole("button",{name:"Reverse connection",exact:true}).click();await saved(page);
 expect((await read()).graph.edges.find((e:{id:string})=>e.id===edge.id).from).toBe(edge.to);
 await page.getByRole("button",{name:"Undo",exact:true}).click();await saved(page);
 await page.getByLabel("Connection",{exact:true}).selectOption(edge.id);await page.getByRole("button",{name:"Delete connection",exact:true}).click();await saved(page);
 await page.getByRole("button",{name:"Zoom out",exact:true}).click();
 const source=page.locator('[data-output="'+edge.from+'"]'),target=page.locator('[data-node="'+edge.to+'"]');
 await source.scrollIntoViewIfNeeded();const a=(await source.boundingBox())!,b=(await target.boundingBox())!;
 await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:8});await page.mouse.up();await saved(page);
 expect((await read()).graph.edges.some((e:{from:string;to:string})=>e.from===edge.from&&e.to===edge.to)).toBe(true);
 const before=await read();await page.getByRole("button",{name:"Connect tool",exact:true}).click();
 await page.locator('[data-node="'+edge.from+'"]').click();await page.keyboard.press("Escape");await page.waitForTimeout(850);expect((await read()).revision).toBe(before.revision);
 await page.screenshot({path:"../docs/audit/m6-editor-"+info.project.name+".png",fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
test("M6 failed connection save retains graph and history; retry then undo persists safely",async({page},info)=>{
 const {id,read}=await setup(page,"failure-"+info.project.name),d=await read();
 await page.route(api+"/designs/"+id,async route=>{if(route.request().method()==="PATCH")await route.fulfill({status:429,json:{error:{code:"RATE_LIMITED",message:"M6 retry later"}}});else await route.continue();});
 const app=d.graph.nodes.find((n:Node)=>n.type==="app"),db=d.graph.nodes.find((n:Node)=>n.type==="db");
 await addEdge(page,db.id,app.id);await expect(page.getByText("M6 retry later",{exact:true})).toBeVisible();
 expect((await read()).graph.edges).toEqual(d.graph.edges);await expect(page.getByRole("button",{name:"Undo",exact:true})).toBeEnabled();
 await page.unroute(api+"/designs/"+id);await page.getByRole("button",{name:"Save",exact:true}).click();await saved(page);
 expect((await read()).graph.edges).toHaveLength(d.graph.edges.length+1);await page.getByRole("button",{name:"Undo",exact:true}).click();await saved(page);expect((await read()).graph.edges).toEqual(d.graph.edges);
});

test("M6 undo during a delayed connection save survives the acknowledgement and re-saves",async({page},info)=>{
 const {id,read}=await setup(page,"slow-"+info.project.name),d=await read(),app=d.graph.nodes.find((n:Node)=>n.type==="app"),db=d.graph.nodes.find((n:Node)=>n.type==="db");
 let release!:()=>void,entered!:()=>void;const gate=new Promise<void>(r=>release=r),started=new Promise<void>(r=>entered=r);let held=false;
 await page.route(api+"/designs/"+id,async route=>{if(route.request().method()==="PATCH"&&!held){held=true;entered();await gate;}await route.continue();});
 await addEdge(page,db.id,app.id);await started;
 await page.getByRole("button",{name:"Undo",exact:true}).click();release();await saved(page);
 expect((await read()).graph).toEqual(d.graph);await expect(page.getByRole("button",{name:"Redo",exact:true})).toBeEnabled();
 await page.unroute(api+"/designs/"+id);
});
test("M6 connection conflict keeps local draft; deliberate reapply resets old history safely",async({page},info)=>{
 const {id,headers,read}=await setup(page,"conflict-"+info.project.name),d=await read(),app=d.graph.nodes.find((n:Node)=>n.type==="app"),db=d.graph.nodes.find((n:Node)=>n.type==="db");
 let release!:()=>void,entered!:()=>void;const gate=new Promise<void>(r=>release=r),started=new Promise<void>(r=>entered=r);let held=false;
 await page.route(api+"/designs/"+id,async route=>{if(route.request().method()==="PATCH"&&!held){held=true;entered();await gate;}await route.continue();});
 await addEdge(page,db.id,app.id);await started;
 const remote=await page.request.patch(api+"/designs/"+id,{headers,data:{expectedRevision:d.revision,name:"Other tab title"}});expect(remote.status()).toBe(200);release();
 await expect(page.getByRole("button",{name:"Inspect current saved version",exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Inspect current saved version",exact:true}).click();page.once("dialog",dialog=>dialog.accept());
 await page.getByRole("button",{name:"Reapply my draft deliberately",exact:true}).click();await saved(page);
 expect((await read()).graph.edges).toHaveLength(d.graph.edges.length+1);await expect(page.getByRole("button",{name:"Undo",exact:true})).toBeDisabled();
 await page.unroute(api+"/designs/"+id);
});
test("M6 click-to-connect and repair action choose actual endpoints; Clients input rejection writes nothing",async({page},info)=>{
 const {read}=await setup(page,"click-"+info.project.name),d=await read(),entry=d.graph.nodes.find((n:Node)=>n.type==="client"),edge=d.graph.edges.find((e:{from:string})=>e.from===entry.id);
 await page.getByLabel("Connection",{exact:true}).selectOption(edge.id);await page.getByRole("button",{name:"Delete connection",exact:true}).click();await check(page);
 await page.getByRole("button",{name:"Start connection",exact:true}).click();
 await page.locator('[data-node="'+edge.to+'"]').click();await saved(page);
 expect((await read()).graph.edges.some((e:{from:string;to:string})=>e.from===edge.from&&e.to===edge.to)).toBe(true);
 const before=await read();await addEdge(page,edge.to,entry.id);await expect(page.getByText(/Clients only send traffic; connections cannot/)).toBeVisible();
 await page.waitForTimeout(850);expect((await read()).revision).toBe(before.revision);
 await page.getByRole("button",{name:"Connect tool",exact:true}).click(); // leave connect mode
 const normal=before.graph.edges.find((e:{from:string})=>e.from!==entry.id);await page.getByLabel("Connection",{exact:true}).selectOption(normal.id);await page.getByRole("button",{name:"Delete connection",exact:true}).click();await saved(page);
 await page.getByRole("button",{name:"Connect tool",exact:true}).click();
 await page.locator('[data-node="'+normal.from+'"]').click();await page.locator('[data-node="'+normal.to+'"]').click();await saved(page);
 expect((await read()).graph.edges.some((e:{from:string;to:string})=>e.from===normal.from&&e.to===normal.to)).toBe(true);
});

test("M6 unreachable-component warnings are informative and do not block an otherwise valid run",async({page},info)=>{
 await setup(page,"warning-"+info.project.name);await page.getByRole("button",{name:"Add Worker",exact:true}).click();await check(page);
 await expect(page.getByText("Ready to run",{exact:true})).toBeVisible();await expect(page.getByText("Worker receives no traffic.",{exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Run test",exact:true}).click();await expect(page.getByRole("heading",{name:"Model results",exact:true})).toBeVisible();
});

test("M6 connection history survives reauthentication but clears after failed logout and account switch",async({page},info)=>{
 const {id,headers,read}=await setup(page,"session-"+info.project.name),d=await read(),app=d.graph.nodes.find((n:Node)=>n.type==="app"),db=d.graph.nodes.find((n:Node)=>n.type==="db");
 const owner=(await(await page.request.get(api+"/auth/me",{headers})).json()).data;
 await page.route(api+"/designs/"+id,async route=>{if(route.request().method()==="PATCH")await route.fulfill({status:401,json:{error:{code:"SESSION_EXPIRED",message:"M6 session expired"}}});else await route.continue();});
 await page.route(api+"/auth/refresh",route=>route.fulfill({status:401,json:{error:{code:"SESSION_EXPIRED",message:"M6 session expired"}}}));
 await addEdge(page,db.id,app.id);await expect(page.getByRole("alertdialog",{name:"Your session expired",exact:true})).toBeVisible();
 await page.unroute(api+"/designs/"+id);await page.unroute(api+"/auth/refresh");await page.locator("#sess-pw").fill("M6-Editing-2026!");
 await page.getByRole("button",{name:"Log in again",exact:true}).click();await expect(page.getByRole("alertdialog",{name:"Your session expired",exact:true})).toHaveCount(0);
 await page.getByRole("button",{name:"Save",exact:true}).click();await saved(page);const persisted=await read();expect(persisted.graph.edges).toHaveLength(d.graph.edges.length+1);
 await page.route(api+"/designs/"+id,async route=>{if(route.request().method()==="PATCH")await route.fulfill({status:503,json:{error:{code:"UNAVAILABLE",message:"Keep logout draft unsaved"}}});else await route.continue();});
 await page.getByRole("button",{name:"Undo",exact:true}).click();
 await page.route(api+"/auth/logout",route=>route.fulfill({status:503,json:{error:{code:"UNAVAILABLE",message:"M6 logout unavailable"}}}));
 await page.getByRole("button",{name:"Account menu",exact:true}).click();await page.getByRole("menuitem",{name:"Log out",exact:true}).click();
 await expect(page.getByRole("button",{name:"Account menu",exact:true})).toHaveCount(0);await page.unroute(api+"/auth/logout");await page.unroute(api+"/designs/"+id);
 await page.goto("/login");await page.getByLabel("Email",{exact:true}).fill(owner.email);await page.getByLabel("Password",{exact:true}).fill("M6-Editing-2026!");
 await page.locator("form").getByRole("button",{name:"Log in",exact:true}).click();await expect(page.getByRole("button",{name:"Account menu",exact:true})).toBeVisible();
 await page.goto("/designs/"+id+"/edit");await expect(page.getByRole("button",{name:"Undo",exact:true})).toBeDisabled();expect((await read()).graph).toEqual(persisted.graph);
 await page.getByRole("button",{name:"Account menu",exact:true}).click();await page.getByRole("menuitem",{name:"Log out",exact:true}).click();await expect(page.getByRole("button",{name:"Account menu",exact:true})).toHaveCount(0);
 await page.goto("/register");await page.getByLabel("Name",{exact:true}).fill("Other M6 user");await page.getByLabel("Email",{exact:true}).fill("m6-other-"+Date.now()+"@example.test");await page.getByLabel("Password",{exact:true}).fill("M6-Editing-2026!");await page.locator("#reg-terms").check();await page.getByRole("button",{name:"Create account",exact:true}).click();await expect(page.getByRole("button",{name:"Account menu",exact:true})).toBeVisible();
 const forbidden=page.waitForResponse(r=>r.url()===api+"/designs/"+id&&r.status()===403);await page.goto("/designs/"+id+"/edit");await forbidden;await expect(page.getByLabel("Component",{exact:true})).toHaveCount(0);
});
