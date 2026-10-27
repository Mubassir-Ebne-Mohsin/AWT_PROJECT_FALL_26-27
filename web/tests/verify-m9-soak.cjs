const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const api='http://localhost:5003/v1',duration=600000,pause=ms=>new Promise(r=>setTimeout(r,ms));
async function request(route,token,method='GET',body){const r=await fetch(api+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(6000)});const data=await r.json();return {status:r.status,data:data.data,error:data.error};}
(async()=>{
 if(process.env.SF_M9_SOAK!=='1')throw Error('Explicit SF_M9_SOAK=1 required');
 const actors=[];for(let n=0;n<2;n++){
  const a=await request('/auth/register',undefined,'POST',{displayName:'M9 Soak',email:'m9-soak-'+Date.now()+'-'+n+'@example.test',password:'M9-Soak-Only!'});assert.equal(a.status,201);const token=a.data.accessToken;
  const ts=await request('/templates',token),t=ts.data.find(x=>x.id==='mvp');const d=await request('/designs',token,'POST',{schemaVersion:1,name:'M9 soak '+n,description:t.blurb,source:'template',templateId:t.id,graph:t.graph,traffic:t.traffic});assert.equal(d.status,201);
  actors.push({token,design:d.data,editor:randomUUID(),sequence:0,jobs:0,previews:0,saves:0,pressure:0});
 }
 const started=Date.now();let tick=0;while(Date.now()-started<duration){
  await Promise.all(actors.map(async(a,n)=>{
   const traffic={...a.design.traffic,rps:300+((tick+n)%5)*50};
   if(tick%4===0){const saved=await request('/designs/'+a.design.id,a.token,'PATCH',{expectedRevision:a.design.revision,traffic});assert.equal(saved.status,200);a.design=saved.data;a.saves++;}
   const preview=await request('/simulation/preview',a.token,'POST',{schemaVersion:1,graph:a.design.graph,traffic,editorSessionId:a.editor,sequence:++a.sequence});
   if(preview.status===429)a.pressure++;else{assert.equal(preview.status,200);assert.equal(preview.data.sequence,a.sequence);a.previews++;}
   if(tick%10===0){const kind=(tick/10)%2===0?'simulate':'limits';const accepted=await request('/designs/'+a.design.id+'/'+kind,a.token,'POST',{expectedRevision:a.design.revision,requestId:randomUUID()});assert.ok([200,202].includes(accepted.status));a.jobs++;
    let run=accepted.data.run;for(let i=0;run.status==='pending'&&i<65;i++){await pause(100);const polled=await request('/designs/'+a.design.id+'/runs/'+run.id,a.token);assert.equal(polled.status,200);run=polled.data;}assert.equal(run.status,'completed');
   }
  }));
  tick++;if(tick%20===0)console.log(JSON.stringify({elapsedSeconds:Math.round((Date.now()-started)/1000),ticks:tick,actors:actors.map(a=>({jobs:a.jobs,previews:a.previews,saves:a.saves,pressure:a.pressure}))}));await pause(3000);
 }
 for(const a of actors){const dash=await request('/dashboard',a.token);assert.equal(dash.status,200);assert.equal(dash.data.counts.retainedRuns,a.jobs,'Preview polluted saved run counts');}
 await pause(31000); // Check lazy expiry on the next admission, rather than pretending idle TTL is a timer.
 const a=actors[0];const final=await request('/simulation/preview',a.token,'POST',{schemaVersion:1,graph:a.design.graph,traffic:a.design.traffic,editorSessionId:randomUUID(),sequence:0});assert.equal(final.status,200);await pause(2500);
 const samples=fs.readFileSync(path.resolve(__dirname,'../../docs/audit/m9-runtime-stats.log'),'utf8').trim().split(/\r?\n/).map(JSON.parse).filter(s=>s.at>=started);assert.ok(samples.length>200);
 assert.ok(samples.every(s=>s.active<=1&&s.queued<=4&&s.reservations<=5&&s.previewEntries<=128));const last=samples.at(-1);assert.equal(last.previewEntries,1);assert.equal(last.expiredPreviewEntries,0);assert.equal(last.active+last.queued+last.reservations,0);
 const result={durationSeconds:Math.round((Date.now()-started)/1000),ticks:tick,actors:actors.map(a=>({previews:a.previews,saves:a.saves,durableJobs:a.jobs,pressure:a.pressure})),samples:samples.length,maxActive:Math.max(...samples.map(s=>s.active)),maxQueued:Math.max(...samples.map(s=>s.queued)),maxReservations:Math.max(...samples.map(s=>s.reservations)),maxPreviewEntries:Math.max(...samples.map(s=>s.previewEntries)),rssStart:samples[0].rss,rssEnd:samples.at(-1).rss,rssPeak:Math.max(...samples.map(s=>s.rss)),noPreviewRows:true,maxExpiredPreviewEntriesObserved:Math.max(...samples.map(s=>s.expiredPreviewEntries)),postExpiryAdmissionPreviewEntries:last.previewEntries,postExpiryAdmissionExpiredEntries:last.expiredPreviewEntries,capacityReleasedAfterSoak:true};
 fs.writeFileSync(path.resolve(__dirname,'../../docs/audit/m9-soak.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
})().catch(e=>{console.error(e.stack);process.exitCode=1});
