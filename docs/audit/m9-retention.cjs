// Opt-in disposable-data acceptance check; invokes the production pruning method.
const assert = require('node:assert/strict'), path = require('node:path'), fs = require('node:fs'), {randomUUID} = require('node:crypto');
const backend = path.resolve(__dirname, '../../nest-boilerplate/nest-boilerplate');
if(process.env.DB_DATABASE !== 'sf_m9_audit' || process.env.DB_PORT !== '5552') throw Error('M9 target mismatch');
const {DataSource} = require(path.join(backend, 'node_modules/typeorm'));
const {RunsService} = require(path.join(backend, 'dist/modules/designs/runs.service'));
const db = new DataSource(require(path.join(backend,'dist/config/database.config')).default);
async function api(route, token, method='GET', body){const r=await fetch('http://localhost:5003/v1'+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});assert.ok(r.ok);return (await r.json()).data;}
(async()=>{
 const auth=await api('/auth/register',null,'POST',{displayName:'M9 Retention',email:'m9-retention-'+Date.now()+'@example.test',password:'M9-Retention-Only!'}),token=auth.accessToken;
 const t=(await api('/templates',token)).find(t=>t.id==='mvp');
 const d=await api('/designs',token,'POST',{schemaVersion:1,name:'M9 aged retention',description:t.blurb,source:'template',templateId:t.id,graph:t.graph,traffic:t.traffic});
 let run=(await api('/designs/'+d.id+'/simulate',token,'POST',{expectedRevision:d.revision,requestId:randomUUID()})).run;
 for(let i=0;run.status==='pending'&&i<60;i++){await new Promise(r=>setTimeout(r,100));run=await api('/designs/'+d.id+'/runs/'+run.id,token);}assert.equal(run.status,'completed');
 await db.initialize();
 // Only this newly-created fixture design is altered; normal/other audit records are untouched.
 await db.query('DELETE FROM design_runs WHERE design_id=$1',[d.id]);
 let pendingId,recentId;
 for(let i=0;i<62;i++){
  const id=randomUUID(),requestId=randomUUID(),pending=i===61,recent=i===60,createdAt=new Date(Date.now()-(pending||recent?0:48*3600000+i*1000)).toISOString();
  const payload={...run,id,requestId,createdAt,status:pending?'pending':'completed',completedAt:pending?null:createdAt,result:pending?null:run.result};
  await db.query('INSERT INTO design_runs(id,design_id,request_id,status,created_at,completed_at,payload) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,d.id,requestId,payload.status,createdAt,payload.completedAt,payload]);
  if(pending)pendingId=id;if(recent)recentId=id;
 }
 await new RunsService(db,{},{}).prune(d.id);
 const rows=await db.query('SELECT id,status,created_at FROM design_runs WHERE design_id=$1',[d.id]);
 assert.equal(rows.length,51);assert.ok(rows.some(r=>r.id===pendingId&&r.status==='pending'));assert.ok(rows.some(r=>r.id===recentId));
 const evidence={seeded:62,terminalBefore:61,terminalAfter:50,protectedPending:true,protectedRecent:true,removedAged:11,method:'Production RunsService.prune on dedicated aged fixtures'};
 fs.writeFileSync(path.join(__dirname,'m9-retention.json'),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
})().catch(e=>{console.error(e.stack);process.exitCode=1}).finally(async()=>{if(db.isInitialized)await db.destroy()});
