import { test, expect, Page } from "@playwright/test";
const api=process.env.SF_API_URL??"http://localhost:5001/v1";
async function signup(page:Page,tag:string){
 await page.goto("/register");await page.getByLabel("Name",{exact:true}).fill("M4 Reviewer");
 await page.getByLabel("Email",{exact:true}).fill("m4-"+Date.now()+"-"+tag+"@example.test");
 await page.getByLabel("Password",{exact:true}).fill("M4-Review-2026!");
 await page.locator("#reg-terms").check();
 const response=page.waitForResponse(r=>r.url()===api+"/auth/register"&&r.status()===201);
 await page.getByRole("button",{name:"Create account",exact:true}).click();
 const token=(await(await response).json()).data.accessToken;
 await expect(page.getByRole("button",{name:"Account menu",exact:true})).toBeVisible();
 return token as string;
}
async function saved(page:Page){
 await expect(page).toHaveURL(/\/designs\/[^/]+\/edit$/);
 await expect(page.getByRole("button",{name:"Run test",exact:true})).toBeVisible();
 return new URL(page.url()).pathname.split("/")[2];
}
test("M4 four creation paths, previews, assumptions, dashboard and confirmed deletion",async({page},info)=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error" && !(m.text().includes("422") && m.location().url.endsWith("/simulate")))errors.push(m.text());});
 const token=await signup(page,info.project.name),headers={Authorization:"Bearer "+token};
 await page.goto("/new");await expect(page.getByRole("heading",{name:"Start a design",exact:true})).toBeVisible();
 await page.getByRole("link",{name:/Start from a template/}).click();
 const templates=(await(await page.request.get(api+"/templates",{headers})).json()).data;
 for(const t of templates){await page.getByRole("button",{name:"Preview "+t.name,exact:true}).click();await expect(page.getByLabel("Name for your copy")).toHaveValue(t.name);}
 await page.getByRole("button",{name:"Preview Single-server MVP",exact:true}).click();
 await page.screenshot({path:"../docs/audit/m4-templates-"+info.project.name+".png"});
 await page.getByLabel("Name for your copy").fill("My renamed template");
 await page.getByRole("button",{name:"Use this template",exact:true}).click();
 const templateId=await saved(page);
 expect((await(await page.request.get(api+"/designs/"+templateId,{headers})).json()).data.name).toBe("My renamed template");
 await page.getByRole("button",{name:"Run test",exact:true}).click();await expect(page.getByRole("heading",{name:"Model results",exact:true})).toBeVisible();

 await page.goto("/new/blank");await page.getByLabel("Design name",{exact:true}).fill("My blank");
 await page.getByLabel("Region",{exact:true}).selectOption("ap-south");
 await page.getByLabel("Traffic preset",{exact:true}).selectOption("flash");
 await page.getByRole("button",{name:"Create blank design",exact:true}).click();
 const blank=await saved(page);const blankData=(await(await page.request.get(api+"/designs/"+blank,{headers})).json()).data;
 expect(blankData.graph.nodes).toHaveLength(1);expect(blankData.graph.nodes[0].props.region).toBe("ap-south");expect(blankData.traffic.preset).toBe("flash");
 await page.getByRole("button",{name:"Run test",exact:true}).click();await expect(page.locator("main [role=alert]")).toBeVisible();

 await page.goto("/new/import");await page.getByRole("button",{name:"Load an example",exact:true}).click();
 await page.getByRole("button",{name:"Check import",exact:true}).click();await expect(page.getByRole("heading",{name:"Ready to import"})).toBeVisible();
 await page.getByLabel("Design name",{exact:true}).fill("My imported architecture");
 await page.getByRole("button",{name:"Import and open editor",exact:true}).click();const imported=await saved(page);
 await page.reload();await expect(page.getByLabel("Design name",{exact:true})).toHaveValue("My imported architecture");

 await page.goto("/new/describe");await expect(page.getByText(/Local keyword rules stand in for AI/)).toBeVisible();
 await page.getByRole("button",{name:/Online store with a flash sale/}).click();
 await page.getByRole("button",{name:"Draft the design",exact:true}).click();await expect(page.getByRole("heading",{name:"Assumptions to review"})).toBeVisible();
 await page.getByLabel("Design name",{exact:true}).fill("Reviewed store");
 await page.getByRole("button",{name:"Open in the editor",exact:true}).click();await saved(page);
 await page.getByText("Design description and assumptions",{exact:true}).click();await expect(page.getByText(/Scripted mock assumptions:/)).toBeVisible();
 await page.reload();await page.getByText("Design description and assumptions",{exact:true}).click();await expect(page.getByText(/Scripted mock assumptions:/)).toBeVisible();

 await page.goto("/dashboard");await expect(page.getByRole("heading",{name:"Your designs",exact:true})).toBeVisible();
 await expect(page.getByRole("heading",{name:"Reviewed store",exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Delete My imported architecture",exact:true}).click();
 await expect(page.getByRole("alertdialog",{name:"Delete design"})).toBeVisible();
 await page.getByRole("button",{name:"Cancel",exact:true}).click();
 expect((await page.request.get(api+"/designs/"+imported,{headers})).status()).toBe(200);
 await page.getByRole("button",{name:"Delete My imported architecture",exact:true}).click();
 await page.getByRole("button",{name:"Delete design",exact:true}).click();
 await expect(page.getByRole("heading",{name:"My imported architecture",exact:true})).toHaveCount(0);
 expect((await page.request.get(api+"/designs/"+imported,{headers})).status()).toBe(404);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:"../docs/audit/m4-dashboard-"+info.project.name+".png"});
 expect(errors).toEqual([]);
});

test("M4 import file/invalid inputs and scripted invalid output never create a design",async({page},info)=>{
 const token=await signup(page,"validation-"+info.project.name),headers={Authorization:"Bearer "+token};
 await page.goto("/new/import");
 for(const text of ["{",'{"nodes":[],"schemaVersion":2}','{"nodes":[{"id":"a","type":"app"}],"ownerId":"forged"}']){
   await page.getByLabel("Design JSON",{exact:true}).fill(text);
   await page.getByRole("button",{name:"Check import",exact:true}).click();
   await expect(page.locator("main [role=alert]")).toBeVisible();
   await expect(page.getByRole("button",{name:"Import and open editor",exact:true})).toHaveCount(0);
 }
 await page.getByLabel("Load a JSON file").setInputFiles({name:"large.json",mimeType:"application/json",buffer:Buffer.from(" ".repeat(65537))});
 await expect(page.locator("main [role=alert]")).toContainText("64 KiB");
 const file={name:"graph.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify({name:"File imported",nodes:[{id:"a",type:"app"}]}))};
 await page.getByLabel("Load a JSON file").setInputFiles(file);
 await page.getByRole("button",{name:"Check import",exact:true}).click();
 await expect(page.getByRole("heading",{name:"Ready to import"})).toBeVisible();
 await page.getByRole("button",{name:"Import and open editor",exact:true}).click();await saved(page);
 await page.goto("/new/describe");
 await page.getByRole("button",{name:"Show invalid scripted output",exact:true}).click();
 await expect(page.locator("main [role=alert]")).toBeVisible();
 await expect(page.getByRole("button",{name:"Open in the editor",exact:true})).toHaveCount(0);
 await page.getByRole("button",{name:"Draft the design",exact:true}).click();await expect(page.locator("main [role=alert]")).toBeVisible();
 const data=(await(await page.request.get(api+"/dashboard",{headers})).json()).data;
 expect(data.counts.designs).toBe(1);expect(data.counts.retainedRuns).toBe(0);
});

test("M4 lost creation response retains inputs and prevents duplicate submission",async({page},info)=>{
 const token=await signup(page,"lost-"+info.project.name),headers={Authorization:"Bearer "+token};
 await page.goto("/new/template");let calls=0;
 await page.route(api+"/designs",async route=>{
   if(route.request().method()!=="POST")return route.continue();
   calls++;await route.fetch();await route.abort("connectionreset");
 });
 await page.getByRole("button",{name:"Use Single-server MVP",exact:true}).click();
 // Real waking-up recovery remounts the form; its session remains above that screen.
 await expect(page.getByText(/Creation could not be confirmed/)).toBeVisible({timeout:20000});
 await expect(page.getByRole("button",{name:"Use Single-server MVP",exact:true})).toBeDisabled();
 expect(calls).toBe(1);
 await page.getByRole("link",{name:"Check dashboard",exact:true}).click();
 await expect(page.getByRole("heading",{name:"Single-server MVP",exact:true})).toBeVisible();
 expect((await(await page.request.get(api+"/dashboard",{headers})).json()).data.counts.designs).toBe(1);
});
