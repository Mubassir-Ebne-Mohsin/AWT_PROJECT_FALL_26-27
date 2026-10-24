// Interactive audit harness: the operator stops/restarts only their port-5003 API.
const assert=require("node:assert/strict");
const {chromium}=require("@playwright/test");
const {createInterface}=require("node:readline");
(async()=>{
 if(process.env.SF_M4_REAL_API_OUTAGE!=="1")throw Error("Opt in with SF_M4_REAL_API_OUTAGE=1; use the isolated port-5003 API.");
 const browser=await chromium.launch({channel:"chrome",headless:true});
 const input=createInterface({input:process.stdin,output:process.stdout,terminal:false});
 const next=()=>new Promise(resolve=>input.once("line",resolve));
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 try{
  await page.goto("http://localhost:3003/register");
  await page.getByLabel("Name",{exact:true}).fill("M4 API outage");
  await page.getByLabel("Email",{exact:true}).fill("m4-api-outage-"+Date.now()+"@example.test");
  await page.getByLabel("Password",{exact:true}).fill("M4-API-Outage-2026!");
  await page.locator("#reg-terms").check();await page.getByRole("button",{name:"Create account",exact:true}).click();
  await page.getByRole("button",{name:"Account menu",exact:true}).waitFor();
  await page.goto("http://localhost:3003/new/import");
  const text=JSON.stringify({name:"Retained during API outage",nodes:[]});
  await page.getByLabel("Design JSON",{exact:true}).fill(text);
  console.log("READY_TO_STOP_AUDIT_API");await next();
  await page.getByRole("button",{name:"Check import",exact:true}).click();
  await page.locator(".sys-title").waitFor({timeout:25000});
  await page.screenshot({path:"../docs/audit/m4-api-unreachable.png"});
  console.log("WAKING_STATE_OBSERVED");await next();
  const healthy=await fetch("http://localhost:5003/v1/health");assert.equal(healthy.status,200,"Send the recovery Enter only after the audit API is healthy.");
  await page.getByLabel("Design JSON",{exact:true}).waitFor({timeout:30000});
  assert.equal(await page.getByLabel("Design JSON",{exact:true}).inputValue(),text);
  console.log(JSON.stringify({apiUnavailableState:true,recovery:true,importRetained:true}));
 }finally{input.close();await browser.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
