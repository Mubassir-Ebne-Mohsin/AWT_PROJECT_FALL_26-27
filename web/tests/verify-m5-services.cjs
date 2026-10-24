// Explicit opt-in audit against task-owned containers only. Never uses normal data.
const assert=require("node:assert/strict");
const {execFileSync}=require("node:child_process");
const {chromium,expect}=require("@playwright/test");
const docker="C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe",api="http://localhost:5003/v1";
const names=["stressforge-m5-postgres","stressforge-m5-redis"];
function command(...args){return execFileSync(docker,args,{encoding:"utf8",windowsHide:true}).trim();}
async function health(status){
 for(let i=0;i<30;i++){try{const r=await fetch(api+"/health",{signal:AbortSignal.timeout(4000)});if(r.status===status)return;}catch{}await new Promise(r=>setTimeout(r,500));}
 throw Error("Health did not become "+status);
}
(async()=>{
 if(process.env.SF_M5_REAL_OUTAGES!=="1")throw Error("Set SF_M5_REAL_OUTAGES=1 for the dedicated M5 containers.");
 for(const name of names)assert.equal(command("inspect","--format",'{{index .Config.Labels "stressforge.audit"}}',name),"m5");
 assert.match(command("port",names[0],"5432"),/:5548/);assert.match(command("port",names[1],"6379"),/:6395/);
 const browser=await chromium.launch({channel:"chrome",headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 try{
  await health(200);await page.goto("http://localhost:3003/register");
  await page.getByLabel("Name",{exact:true}).fill("M5 Outage");
  await page.getByLabel("Email",{exact:true}).fill("m5-outage-"+Date.now()+"@example.test");
  await page.getByLabel("Password",{exact:true}).fill("M5-Outage-2026!");await page.locator("#reg-terms").check();
  const registered=page.waitForResponse(r=>r.url()===api+"/auth/register"&&r.status()===201);
  await page.getByRole("button",{name:"Create account",exact:true}).click();const token=(await(await registered).json()).data.accessToken;
  const headers={Authorization:"Bearer "+token};
  await expect(page.getByRole("button",{name:"Account menu",exact:true})).toBeVisible();
  await page.goto("http://localhost:3003/new/template");await page.getByRole("button",{name:"Use Single-server MVP",exact:true}).click();
  await expect(page.getByRole("button",{name:"Move Right",exact:true})).toBeVisible();
  const id=new URL(page.url()).pathname.split("/")[2];
  const read=async()=>(await(await page.request.get(api+"/designs/"+id,{headers})).json()).data;
  const initial=await read(),app=initial.graph.nodes.find(n=>n.type==="app"),start=app.x;
  command("stop",names[0]);await health(503);
  await page.getByRole("button",{name:"Move Right",exact:true}).click();
  await expect(page.getByRole("status").filter({hasText:/Save failed/})).toBeVisible({timeout:25000});
  await expect(page.getByTestId("node-position")).toContainText("x "+(start+12));
  command("start",names[0]);await health(200);await page.getByRole("button",{name:"Save",exact:true}).click();
  await expect(page.getByRole("status").filter({hasText:/^Saved/})).toBeVisible();
  assert.equal((await read()).graph.nodes.find(n=>n.id===app.id).x,start+12);
  command("stop",names[1]);await health(503);
  await page.getByRole("button",{name:"Move Right",exact:true}).click();
  await page.waitForFunction(()=>document.querySelector(".sys-title")||document.querySelector("main [role=alert]"),undefined,{timeout:25000});
  command("start",names[1]);await health(200);
  await expect(page.getByTestId("node-position")).toContainText("x "+(start+24),{timeout:30000});
  if(await page.getByRole("button",{name:"Save",exact:true}).isEnabled())await page.getByRole("button",{name:"Save",exact:true}).click();
  await expect(page.getByRole("status").filter({hasText:/^Saved/})).toBeVisible();
  assert.equal((await read()).graph.nodes.find(n=>n.id===app.id).x,start+24);
  console.log(JSON.stringify({postgresHealthDown:503,redisHealthDown:503,recoveredHealth:200,nodePositionsRetained:true,explicitSaveRecovered:true}));
 }finally{for(const name of names)command("start",name);await browser.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
