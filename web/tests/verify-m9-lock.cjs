const path=require('node:path'),assert=require('node:assert/strict'),fs=require('node:fs');
const {Client}=require(path.resolve(__dirname,'../../nest-boilerplate/nest-boilerplate/node_modules/pg'));
const api='http://localhost:5003/v1',baseline=process.env.SF_M9_BASELINE==='1';
const client=new Client({host:'127.0.0.1',port:5552,user:'sf_audit',password:'sf_m9_disposable',database:'sf_m9_audit'});
async function req(route,method='GET',body,token){const t=performance.now();try{const r=await fetch(api+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(5500)});return {status:r.status,body:await r.json(),ms:Math.round(performance.now()-t)}}catch{return {status:0,ms:Math.round(performance.now()-t)}}}
(async()=>{
 if(process.env.SF_M9_REAL_OUTAGES!=='1')throw Error('Explicit audit opt-in required');
 const auth=await req('/auth/register','POST',{displayName:'M9 Lock',email:'m9-lock-'+Date.now()+'@example.test',password:'M9-Lock-Only!'});assert.equal(auth.status,201);const token=auth.body.data.accessToken;
 const templates=await req('/templates','GET',undefined,token),t=templates.body.data.find(t=>t.id==='mvp');const created=await req('/designs','POST',{schemaVersion:1,name:'M9 locked save',description:t.blurb,source:'template',templateId:t.id,graph:t.graph,traffic:t.traffic},token);assert.equal(created.status,201);const d=created.body.data;
 await client.connect();try{
  await client.query('BEGIN');await client.query('LOCK TABLE designs IN ACCESS EXCLUSIVE MODE');
  const write=await req('/designs/'+d.id,'PATCH',{expectedRevision:1,name:'M9 submitted during lock'},token);
  await client.query('ROLLBACK');await new Promise(r=>setTimeout(r,500));
  const current=await req('/designs/'+d.id,'GET',undefined,token);const retry=await req('/designs/'+d.id,'PATCH',{expectedRevision:1,name:'M9 submitted during lock'},token);
  const evidence={mode:baseline?'baseline':'fixed',write:{status:write.status,code:write.body?.error?.code,ms:write.ms},revisionAfterUnlock:current.body.data.revision,retryStatus:retry.status};
  fs.writeFileSync(path.resolve(__dirname,'../../docs/audit/m9-lock-'+evidence.mode+'.json'),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
  if(!baseline){assert.equal(write.status,503);assert.ok(write.ms<5000);assert.equal(current.body.data.revision,1);assert.equal(retry.status,200);}
 }finally{await client.query('ROLLBACK').catch(()=>undefined);await client.end();}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
