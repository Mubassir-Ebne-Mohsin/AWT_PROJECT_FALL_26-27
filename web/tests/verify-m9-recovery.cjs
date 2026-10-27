// Real service checks: dedicated M9 labels and loopback ports only. No normal config is read.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{execFileSync}=require('node:child_process');
const api='http://localhost:5003/v1', docker='C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe';
const names=['stressforge-m9-postgres','stressforge-m9-redis'];
const mode=process.env.SF_M9_BASELINE==='1'?'baseline':'fixed';
const cmd=(...args)=>execFileSync(docker,args,{encoding:'utf8',windowsHide:true}).trim();
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function request(route,{method='GET',body,token,timeout=5500,cookie}={}){
 const started=performance.now();try{const response=await fetch(api+route,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(timeout)});const json=await response.json().catch(()=>null);return {status:response.status,json,ms:Math.round(performance.now()-started),cookie:response.headers.get('set-cookie')?.split(';')[0]};}catch{return {status:0,ms:Math.round(performance.now()-started)}}
}
async function health(status){for(let n=0;n<70;n++){const r=await request('/health',{timeout:2500});if(r.status===status)return;await pause(250);}throw Error('Audit health did not become '+status);}
(async()=>{
 if(process.env.SF_M9_REAL_OUTAGES!=='1')throw Error('Explicit opt-in SF_M9_REAL_OUTAGES=1 required');
 for(const name of names)assert.equal(cmd('inspect','--format','{{index .Config.Labels "stressforge.audit"}}',name),'m9');
 assert.match(cmd('port',names[0],'5432'),/:5552/);assert.match(cmd('port',names[1],'6379'),/:6399/);
 await health(200);
 const auth=await request('/auth/register',{method:'POST',body:{displayName:'M9 Recovery',email:'m9-recovery-'+Date.now()+'@example.test',password:'M9-Recovery-Only!'}});assert.equal(auth.status,201);const token=auth.json.data.accessToken;
 const list=await request('/templates',{token});assert.equal(list.status,200);const t=list.json.data.find(x=>x.id==='mvp');assert.ok(t);
 const created=await request('/designs',{method:'POST',token,body:{schemaVersion:1,name:'M9 recovery audit',source:'template',templateId:t.id,description:t.blurb,graph:t.graph,traffic:t.traffic}});assert.equal(created.status,201);
 const d=created.json.data,patch={expectedRevision:d.revision,traffic:{...d.traffic,rps:875}};const evidence={mode,initialRevision:d.revision};
 try{
  cmd('stop',names[1]);await health(503);
  const failed=await request('/designs/'+d.id,{method:'PATCH',token,body:patch,timeout:mode==='baseline'?Number(process.env.SF_M9_ABORT_MS??16000):5500});evidence.redisWrite={status:failed.status,ms:failed.ms};
  if(mode==='fixed'){
   assert.equal(failed.status,503);assert.ok(failed.ms<5000,'Redis-dependent save exceeded5seconds');
   const probes=[];for(const [route,method,body,withToken]of[['/auth/me','GET',undefined,true],['/auth/login','POST',{email:'missing@example.test',password:'M9-Invalid-Only!'},false],['/auth/refresh','POST',{},false],['/auth/logout','POST',{},true]]){
    const r=await request(route,{method,body,token:withToken?token:undefined,cookie:auth.cookie});probes.push({route,status:r.status,code:r.json?.error?.code,ms:r.ms});assert.equal(r.status,503);assert.equal(r.json.error.code,'UNAVAILABLE');assert.ok(r.ms<5000);
   }evidence.authDuringRedisOutage=probes;
  }
  cmd('start',names[1]);await health(200);await pause(1500);
  const recovered=await request('/designs/'+d.id,{token});assert.equal(recovered.status,200);evidence.revisionAfterRecovery=recovered.json.data.revision;
  const retry=await request('/designs/'+d.id,{method:'PATCH',token,body:patch});evidence.retry={status:retry.status,currentRevision:retry.json?.data?.revision??retry.json?.error?.details?.currentRevision};
  if(mode==='fixed'){assert.equal(evidence.revisionAfterRecovery,d.revision,'A failed save committed after recovery');assert.equal(retry.status,200);}
  cmd('stop',names[0]);await health(503);
  const pg=await request('/designs/'+d.id,{token,timeout:mode==='baseline'?7500:5500});evidence.postgresRead={status:pg.status,code:pg.json?.error?.code,ms:pg.ms};
  if(mode==='fixed'){assert.equal(pg.status,503);assert.equal(pg.json.error.code,'UNAVAILABLE');assert.ok(pg.ms<5000);}
  if(mode==='fixed'){const refresh=await request('/auth/refresh',{method:'POST',body:{},cookie:auth.cookie});evidence.refreshWhilePostgresDown={status:refresh.status,code:refresh.json?.error?.code,ms:refresh.ms};assert.equal(refresh.status,503);assert.ok(refresh.ms<5000);}
  cmd('start',names[0]);await health(200);if(mode==='fixed'){const refresh=await request('/auth/refresh',{method:'POST',body:{},cookie:auth.cookie});evidence.refreshAfterPostgresRecovery=refresh.status;assert.equal(refresh.status,200);}const after=await request('/designs/'+d.id,{token});assert.equal(after.status,200);evidence.finalRevision=after.json.data.revision;
  const output=path.resolve(__dirname,'../../docs/audit/m9-recovery-'+mode+(process.env.SF_M9_ABORT_MS?'-abort'+process.env.SF_M9_ABORT_MS:'')+'.json');fs.writeFileSync(output,JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
 }finally{for(const name of names)cmd('start',name);}
})().catch(error=>{console.error(error.stack);process.exitCode=1});
