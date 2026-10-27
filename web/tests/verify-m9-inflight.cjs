// Pause rather than stop dependencies: exercises commands on sockets still marked connected.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const api='http://localhost:5003/v1',docker='C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe',names=['stressforge-m9-postgres','stressforge-m9-redis'];
const command=(...args)=>execFileSync(docker,args,{encoding:'utf8',windowsHide:true}).trim();
async function call(route,token,method='GET',body,cookie){const started=Date.now();try{const r=await fetch(api+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(7000)});const text=await r.text(),value=text?JSON.parse(text):null;return {status:r.status,ms:Date.now()-started,value,cookie:r.headers.get('set-cookie')?.split(';')[0]};}catch{return {status:0,ms:Date.now()-started};}}
async function healthy(){for(let i=0;i<40;i++){if((await call('/health')).status===200)return;await new Promise(r=>setTimeout(r,300));}throw Error('M9 did not recover');}
const timing=r=>({status:r.status,ms:r.ms,code:r.value?.error?.code});
(async()=>{
 if(process.env.SF_M9_REAL_OUTAGES!=='1')throw Error('Explicit isolated-outage opt-in required');
 for(const n of names)assert.equal(command('inspect','--format','{{index .Config.Labels "stressforge.audit"}}',n),'m9');assert.match(command('port',names[0],'5432'),/:5552/);assert.match(command('port',names[1],'6379'),/:6399/);
 const a=await call('/auth/register',null,'POST',{displayName:'M9 paused services',email:'m9-paused-'+Date.now()+'@example.test',password:'M9-Paused-Only!'});assert.equal(a.status,201);const token=a.value.data.accessToken;
 const t=(await call('/templates',token)).value.data.find(t=>t.id==='mvp'),d=(await call('/designs',token,'POST',{schemaVersion:1,name:'M9 paused request',description:t.blurb,source:'template',templateId:t.id,graph:t.graph,traffic:t.traffic})).value.data;
 const evidence={};
 try{command('pause',names[1]);evidence.redisHealth=timing(await call('/health'));evidence.redisPatch=timing(await call('/designs/'+d.id,token,'PATCH',{expectedRevision:1,name:'Must not commit after pause'}));evidence.redisRefresh=timing(await call('/auth/refresh',null,'POST',null,a.cookie));}finally{command('unpause',names[1]);}
 await healthy();assert.equal((await call('/designs/'+d.id,token)).value.data.revision,1);const refresh=await call('/auth/refresh',null,'POST',null,a.cookie);assert.equal(refresh.status,200);evidence.refreshAfterRedisPause=200;
 try{command('pause',names[0]);evidence.postgresRead=timing(await call('/designs/'+d.id,token));evidence.postgresPatch=timing(await call('/designs/'+d.id,token,'PATCH',{expectedRevision:1,name:'Must not commit after pause'}));evidence.postgresHealth=timing(await call('/health'));}finally{command('unpause',names[0]);}
 await healthy();const recovered=await call('/designs/'+d.id,token);assert.equal(recovered.status,200);evidence.revisionAfterAllRecovery=recovered.value.data.revision;assert.equal(evidence.revisionAfterAllRecovery,1);
 fs.writeFileSync(path.resolve(__dirname,'../../docs/audit/m9-inflight.json'),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence,null,2));
 for(const [name,r] of Object.entries(evidence))if(r&&typeof r==='object'){assert.equal(r.status,503,name+' should fail controlled');assert.equal(r.code,'UNAVAILABLE');assert.ok(r.ms<5000,name+' exceeded the approved five-second target');}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
