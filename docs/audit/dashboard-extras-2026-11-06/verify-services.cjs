// Real HTTP/Postgres/Redis checks. Credentials are public throwaway values; access tokens stay in memory.
const assert=require("node:assert/strict"),{execFileSync}=require("node:child_process"),{randomUUID}=require("node:crypto"),fs=require("node:fs"),path=require("node:path");
const identity=require("./runtime.json"),api="http://localhost:5003/v1";
if(!/^sf_dashboard_extras_[a-z0-9_]+$/.test(identity.database))throw Error("Unsafe audit target");
const docker=(...args)=>execFileSync("docker",args,{encoding:"utf8",stdio:["ignore","pipe","pipe"]});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const redis=(...args)=>docker("exec","stressforge-m9-redis","redis-cli","--raw",...args).trim();
const evidence={};
async function call(route,token,body){const res=await fetch(api+route,{headers:{"content-type":"application/json",...(token?{Authorization:"Bearer "+token}:{})},...(body?{method:"POST",body:JSON.stringify(body)}:{})});return {status:res.status,body:await res.json()};}
async function account(){const email="extras-service-"+randomUUID()+"@example.test",r=await call("/auth/register",null,{email,password:"Extras-Audit-2026!",displayName:"PRIVATE SERVICE CANARY"});assert.equal(r.status,201);return {...r.body.data,email};}
(async()=>{
 const admin=await account();assert.match(admin.user.id,/^[a-f0-9-]{36}$/);
 docker("exec","stressforge-m9-postgres","psql","-U","sf_audit","-d",identity.database,"-v","ON_ERROR_STOP=1","-c",`INSERT INTO user_roles(user_id,role,granted_by,granted_at) VALUES('${admin.user.id}','admin',NULL,now())`);
 const token=admin.accessToken,first=(await call("/admin/metrics",token)).body.data;
 assert.equal((await call("/admin/metrics",token)).body.data.snapshotKey,first.snapshotKey);
 await account();await pause(3200);const newer=(await call("/admin/metrics",token)).body.data;assert.equal(newer.totals.users,first.totals.users+1);assert.notEqual(newer.snapshotKey,first.snapshotKey);
 const query=(format,purpose="download",key=first.snapshotKey)=>`/admin/metrics/export?${new URLSearchParams({format,purpose,snapshot:key})}`;
 const json=await call(query("json"),token);assert.equal(json.status,200);assert.deepEqual(JSON.parse(json.body.data.content),first);
 const csv=await call(query("csv"),token);assert.equal(csv.status,200);assert.ok(csv.body.data.content.includes(`totals.users,${first.totals.users}`));
 assert.equal((await call(query("json","pdf"),token)).status,200);
 for(const data of [json.body.data.content,csv.body.data.content]){assert.ok(!data.includes(admin.email));assert.ok(!data.includes(admin.user.id));assert.ok(!data.includes("PRIVATE SERVICE CANARY"));}
 const counter="stressforge:admin-metrics:exports:"+new Date().toISOString().slice(0,10),fields=redis("HGETALL",counter).split(/\r?\n/);
 assert.ok(fields.length>=6);for(let i=0;i<fields.length;i+=2){assert.ok(["csv","json","pdf"].includes(fields[i]));assert.ok(Number(fields[i+1])>=1);}
 assert.ok(Number(redis("TTL",counter))>89*86400);
 const plain=await account(),before=redis("HGETALL",counter);
 assert.equal((await call(query("json"),plain.accessToken)).status,403);assert.equal(redis("HGETALL",counter),before);
 evidence.snapshot={cached:true,oldExportMatches:true,newerSnapshotDifferent:true};evidence.audit={closedFormatsOnly:true,ttlOver89Days:true,deniedNotCounted:true};
 try {
  docker("stop","stressforge-m9-redis");const start=Date.now();const down=await call(query("json","download",newer.snapshotKey),token);
  assert.equal(down.status,503);assert.equal(down.body.error.code,"UNAVAILABLE");assert.ok(!down.body.data);assert.ok(Date.now()-start<5000);
  evidence.redisOutage={status:503,elapsedMs:Date.now()-start,noFile:true};
 }finally{docker("start","stressforge-m9-redis");}
 for(let i=0;i<30;i++){try{if(redis("PING")==="PONG")break;}catch{}await pause(250);}
 for(let i=0;i<20;i++){const retry=await call(query("json"),token);if(retry.status===200){evidence.recovered=true;break;}await pause(250);}
 assert.equal(evidence.recovered,true);assert.equal((await call("/health")).status,200);
 assert.equal((await fetch("http://localhost:5003/docs")).status,200);
 const doc=await (await fetch("http://localhost:5003/docs-json")).json();assert.ok(doc.paths["/v1/admin/metrics/export"].get.parameters.length===3);
 evidence.health=200;evidence.swagger=200;
 fs.writeFileSync(path.join(__dirname,"services.json"),JSON.stringify(evidence,null,2)+"\n");console.log(JSON.stringify(evidence));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
