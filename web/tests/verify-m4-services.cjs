// Opt-in real dependency outage check. Never points at normal services.
const assert=require("node:assert/strict");
const {execFileSync}=require("node:child_process");
const {chromium}=require("@playwright/test");
const docker="C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe";
const api="http://localhost:5003/v1",web="http://localhost:3003";
const containers=["stressforge-m4-audit-postgres","stressforge-m4-audit-redis"];
function command(...args){return execFileSync(docker,args,{encoding:"utf8",windowsHide:true}).trim();}
async function health(status){
 for(let i=0;i<30;i++){
  try{const r=await fetch(api+"/health",{signal:AbortSignal.timeout(4000)});if(r.status===status)return await r.json();}catch{}
  await new Promise(r=>setTimeout(r,500));
 }
 throw Error("Health did not become "+status);
}
(async()=>{
 if(process.env.SF_M4_REAL_OUTAGES!=="1")throw Error("Set SF_M4_REAL_OUTAGES=1 for these dedicated audit containers.");
 for(const name of containers)assert.equal(command("inspect","--format",'{{index .Config.Labels "stressforge.audit"}}',name),"m4");
 // Refuse the shared PostgreSQL mapping before any stop operation.
 assert.match(command("port",containers[0],"5432"),/:5547/);
 assert.match(command("port",containers[1],"6379"),/:6394/);
 const browser=await chromium.launch({channel:"chrome",headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 try{
  await health(200);
  await page.goto(web+"/register");await page.getByLabel("Name",{exact:true}).fill("M4 Service audit");
  await page.getByLabel("Email",{exact:true}).fill("m4-services-"+Date.now()+"@example.test");
  await page.getByLabel("Password",{exact:true}).fill("M4-Services-2026!");await page.locator("#reg-terms").check();
  await page.getByRole("button",{name:"Create account",exact:true}).click();
  await page.getByRole("button",{name:"Account menu",exact:true}).waitFor();
  await page.goto(web+"/new/blank");await page.getByLabel("Design name",{exact:true}).fill("Outage draft");
  command("stop",containers[0]);
  const down=await health(503);assert.equal(down.error.details.postgres,"down");
  await page.getByRole("button",{name:"Create blank design",exact:true}).click();
  await page.getByText(/Creation could not be confirmed/).waitFor({timeout:25000});
  assert.equal(await page.getByLabel("Design name",{exact:true}).inputValue(),"Outage draft");
  command("start",containers[0]);await health(200);
  await page.getByRole("link",{name:"Check dashboard",exact:true}).click();
  await page.getByRole("heading",{name:"Your first design starts here",exact:true}).waitFor();
  await page.goto(web+"/new/describe");
  await page.getByLabel("Your system, in your own words",{exact:true}).fill("3 app servers and Redis");
  command("stop",containers[1]);
  assert.equal((await health(503)).error.details.redis,"down");
  await page.getByRole("button",{name:"Draft the design",exact:true}).click();
  await page.locator(".sys-title").waitFor({timeout:25000});
  command("start",containers[1]);await health(200);
  await page.getByLabel("Your system, in your own words",{exact:true}).waitFor({timeout:25000});
  assert.equal(await page.getByLabel("Your system, in your own words",{exact:true}).inputValue(),"3 app servers and Redis");
  console.log(JSON.stringify({postgresOutage:503,redisOutage:503,recoveredHealth:200,blankRetained:true,descriptionRetained:true,designsCreated:0}));
 }finally{
  for(const name of containers)command("start",name);
  await browser.close();
 }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
