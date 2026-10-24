// Opt-in against dedicated M6 containers only; never targets normal services.
const assert=require("node:assert/strict"),{execFileSync}=require("node:child_process"),{chromium,expect}=require("@playwright/test");
const docker="C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe",api="http://localhost:5003/v1",names=["stressforge-m6-postgres","stressforge-m6-redis"];
const command=(...args)=>execFileSync(docker,args,{encoding:"utf8",windowsHide:true}).trim();
async function health(status){for(let i=0;i<40;i++){try{if((await fetch(api+"/health",{signal:AbortSignal.timeout(4000)})).status===status)return;}catch{}await new Promise(r=>setTimeout(r,500));}throw Error("Health did not become "+status);}
(async()=>{
 if(process.env.SF_M6_REAL_OUTAGES!=="1")throw Error("Set SF_M6_REAL_OUTAGES=1 for dedicated M6 services.");
 for(const name of names)assert.equal(command("inspect","--format",'{{index .Config.Labels "stressforge.audit"}}',name),"m6");
 assert.match(command("port",names[0],"5432"),/:5549/);assert.match(command("port",names[1],"6379"),/:6396/);
 const browser=await chromium.launch({channel:"chrome",headless:true}),page=await browser.newPage({viewport:{width:1440,height:900}});
 try{
  await health(200);await page.goto("http://localhost:3003/register");
  await page.getByLabel("Name",{exact:true}).fill("M6 Outage");await page.getByLabel("Email",{exact:true}).fill("m6-outage-"+Date.now()+"@example.test");
  await page.getByLabel("Password",{exact:true}).fill("M6-Outage-2026!");await page.locator("#reg-terms").check();
  const reg=page.waitForResponse(r=>r.url()===api+"/auth/register"&&r.status()===201);await page.getByRole("button",{name:"Create account",exact:true}).click();
  const token=(await(await reg).json()).data.accessToken,headers={Authorization:"Bearer "+token};
  await expect(page.getByRole("button",{name:"Account menu",exact:true})).toBeVisible();await page.goto("http://localhost:3003/new/template");await page.getByRole("button",{name:"Use Single-server MVP",exact:true}).click();
  await expect(page.getByLabel("Source component",{exact:true})).toBeVisible();
  const id=new URL(page.url()).pathname.split("/")[2],read=async()=>(await(await page.request.get(api+"/designs/"+id,{headers})).json()).data;
  const initial=await read(),app=initial.graph.nodes.find(n=>n.type==="app"),db=initial.graph.nodes.find(n=>n.type==="db");
  const saved=()=>expect(page.getByRole("status").filter({hasText:/^Saved ·/})).toBeVisible();
  command("stop",names[0]);await health(503);
  await page.getByLabel("Source component",{exact:true}).selectOption(db.id);await page.getByLabel("Destination component",{exact:true}).selectOption(app.id);await page.getByRole("button",{name:"Add connection",exact:true}).click();
  await expect(page.getByRole("status").filter({hasText:/Save failed/})).toBeVisible({timeout:25000});await expect(page.getByRole("button",{name:"Undo",exact:true})).toBeEnabled();
  command("start",names[0]);await health(200);await page.getByRole("button",{name:"Save",exact:true}).click();await saved();assert.equal((await read()).graph.edges.length,initial.graph.edges.length+1);
  await page.getByRole("button",{name:"Undo",exact:true}).click();await saved();assert.deepEqual((await read()).graph.edges,initial.graph.edges);
  await page.getByLabel("Component",{exact:true}).selectOption(app.id);
  command("stop",names[1]);await health(503);await page.getByRole("button",{name:"Duplicate component",exact:true}).click();
  await page.waitForFunction(()=>document.querySelector(".sys-title")||document.querySelector("main [role=alert]"),undefined,{timeout:25000});
  command("start",names[1]);await health(200);await expect(page.getByLabel("Component",{exact:true}).locator("option")).toHaveCount(initial.graph.nodes.length+2,{timeout:30000});
  const save=page.getByRole("button",{name:"Save",exact:true});if(await save.isEnabled())await save.click();await saved();assert.equal((await read()).graph.nodes.length,initial.graph.nodes.length+1);
  await page.getByRole("button",{name:"Undo",exact:true}).click();await saved();assert.deepEqual((await read()).graph,initial.graph);
  console.log(JSON.stringify({postgresHealthDown:503,redisHealthDown:503,recoveredHealth:200,connectionRetained:true,historyRetained:true,undoRecoveredOriginalGraph:true}));
 }finally{for(const name of names)command("start",name);await browser.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
