const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EditorSession } = require("../src/lib/editor-session");
const { ApiError } = require("../src/lib/api/errors");
const design = () => ({id:"a",name:"MVP",description:"",source:"template",templateId:"mvp",schemaVersion:1,revision:1,graph:{nodes:[{id:"a",type:"app",label:"App",x:0,y:0,props:{replicas:1}}],edges:[]},traffic:{rps:500},createdAt:"2026-10-24",updatedAt:"2026-10-24"});
test("save acknowledges its submitted baseline and preserves newer edits",async()=>{
  let finish;
  const s=new EditorSession(design(),async(_id,body)=>new Promise(resolve=>{finish=()=>resolve({...design(),...body,revision:2})}));
  s.rename("submitted");const saving=s.save();s.rename("newer");finish();await saving;
  assert.equal(s.state.saved.name,"submitted");assert.equal(s.state.design.name,"newer");assert.equal(s.state.saved.revision,2);assert.equal(s.dirty,true);
});
test("serialized saves use the acknowledged revision",async()=>{
  const revisions=[];let release;
  const s=new EditorSession(design(),async(_id,b)=>{revisions.push(b.expectedRevision);if(revisions.length===1)await new Promise(r=>{release=r});return {...design(),...b,revision:b.expectedRevision+1}});
  s.rename("one");const one=s.save();s.rename("two");const two=s.save();release();await Promise.all([one,two]);
  assert.deepEqual(revisions,[1,2]);assert.equal(s.dirty,false);
});
test("conflict keeps draft and requires deliberate resolution",async()=>{
  const s=new EditorSession(design(),async()=>{throw new ApiError("CONFLICT","stale",409)});
  s.rename("mine");await assert.rejects(s.save());assert.equal(s.state.design.name,"mine");assert.equal(s.state.conflict,true);
  s.reapply({...design(),revision:7,name:"theirs"});assert.equal(s.state.saved.revision,7);assert.equal(s.state.design.name,"mine");assert.equal(s.dirty,true);
});
test("lost acceptance retries exactly the same id and revision despite newer edits",async()=>{
  const bodies=[];const s=new EditorSession(design(),undefined,async(_id,b)=>{bodies.push(b);if(bodies.length===1)throw new ApiError("NETWORK","lost",0);return {run:{id:"run",status:"pending"},statusUrl:""}});
  await assert.rejects(s.run());s.rename("newer");await s.run();
  assert.deepEqual(bodies[0],bodies[1]);assert.equal(s.state.intent,undefined);assert.equal(s.state.design.name,"newer");assert.equal(s.dirty,true);
});
test("failed save blocks run submission",async()=>{
  let runs=0;const s=new EditorSession(design(),async()=>{throw new Error("offline")},async()=>{runs++});s.rename("draft");
  await assert.rejects(s.run());assert.equal(runs,0);assert.equal(s.dirty,true);
});
test("old result stays stale after a semantic edit",()=>{
  const d=design(),s=new EditorSession(d);s.setRun({designRevision:1,snapshot:{graph:d.graph,traffic:d.traffic}});
  assert.equal(s.stale,false);s.edit({...d.graph,nodes:d.graph.nodes.map(n=>({...n,props:{replicas:2}}))});assert.equal(s.stale,true);
});
test("unknown acceptance is not retried after the 24h guarantee",async()=>{
  let calls=0;const s=new EditorSession(design(),undefined,async()=>{calls++;throw new ApiError("NETWORK","lost",0)});
  await assert.rejects(s.run());s.state.intent.startedAt=Date.now()-25*3600000;await assert.rejects(s.run(),/24-hour/);assert.equal(calls,1);
});
test("disposed account session ignores a late save response",async()=>{
  let finish;const s=new EditorSession(design(),async()=>new Promise(r=>{finish=r}));s.rename("draft");const pending=s.save();s.dispose();finish({...design(),revision:2,name:"draft"});await pending;assert.equal(s.state.saved.revision,1);
});

test("a server-normalized key order acknowledges the edit without repeated saves", async () => {
  const d=design(); d.graph.nodes[0].props={region:"us-east",capacity:800};
  let calls=0;
  const normalize=value=>Array.isArray(value)?value.map(normalize):value&&typeof value==="object"?Object.fromEntries(Object.keys(value).sort().map(k=>[k,normalize(value[k])])):value;
  const s=new EditorSession(d,async(_id,b)=>{calls++;return normalize({...d,...b,revision:b.expectedRevision+1})});
  s.edit({...d.graph,nodes:d.graph.nodes.map(n=>({...n,props:{...n.props,replicas:2}}))});
  await s.save();
  assert.equal(s.dirty,false,"normalized object-key order must not remain dirty");
  await s.save();
  assert.equal(calls,1,"an acknowledged edit must not issue a second PATCH");
});
test("result staleness ignores object-key order while preserving graph array order",()=>{
  const d=design(),s=new EditorSession(d);
  s.setRun({designRevision:1,snapshot:{graph:{edges:[],nodes:d.graph.nodes.map(n=>({props:n.props,y:n.y,x:n.x,label:n.label,type:n.type,id:n.id}))},traffic:d.traffic}});
  assert.equal(s.stale,false);
});
test("Run flushes a normalized replica edit once before submitting", async()=>{
  const d=design(); d.graph.nodes[0].props={region:"us-east",capacity:800};
  let saves=0,runs=0;
  const normalize=value=>Array.isArray(value)?value.map(normalize):value&&typeof value==="object"?Object.fromEntries(Object.keys(value).sort().map(k=>[k,normalize(value[k])])):value;
  const s=new EditorSession(d,async(_id,b)=>{assert.ok(++saves<=1,"Run must not loop over already acknowledged saves");return normalize({...d,...b,revision:2})},async()=>{runs++;return {run:{id:"run",status:"pending"},statusUrl:""}});
  s.edit({...d.graph,nodes:d.graph.nodes.map(n=>({...n,props:{...n.props,replicas:3}}))});
  await s.run();assert.equal(saves,1);assert.equal(runs,1);assert.equal(s.dirty,false);
});
test("meaningful graph array ordering is still detected as an edit",()=>{
  const d=design();d.graph.nodes.push({...d.graph.nodes[0],id:"b",label:"Second"});
  const s=new EditorSession(d);s.setRun({designRevision:1,snapshot:{graph:d.graph,traffic:d.traffic}});
  s.edit({...d.graph,nodes:[...d.graph.nodes].reverse()});assert.equal(s.dirty,true);assert.equal(s.stale,true);
});
test("server-trimmed names acknowledge only the submitted value",async()=>{
  const d=design();let release;
  const s=new EditorSession(d,async(_id,b)=>({...d,...b,name:b.name.trim(),revision:2}));
  s.rename("MVP  ");await s.save();assert.equal(s.state.design.name,"MVP");assert.equal(s.dirty,false);
  const newer=new EditorSession(d,async(_id,b)=>{await new Promise(r=>{release=r});return {...d,...b,name:b.name.trim(),revision:2}});
  newer.rename("submitted  ");const pending=newer.save();newer.rename("newer  ");release();await pending;
  assert.equal(newer.state.design.name,"newer  ");assert.equal(newer.state.saved.name,"submitted");assert.equal(newer.dirty,true);
});
test("uncertain acceptance retains its identity after a rate-limit response",async()=>{
  const bodies=[];
  const s=new EditorSession(design(),undefined,async(_id,b)=>{bodies.push(b);if(bodies.length===1)throw new ApiError("NETWORK","lost",0);if(bodies.length===2)throw new ApiError("RATE_LIMITED","slow down",429);return {run:{id:"original",status:"pending"},statusUrl:""}});
  await assert.rejects(s.run());const key=s.state.intent.requestId;await assert.rejects(s.run());
  assert.equal(s.state.intent?.requestId,key);await s.run();assert.deepEqual(bodies,[bodies[0],bodies[0],bodies[0]]);
});
test("discarding a draft conflict does not discard uncertain calculation acceptance",async()=>{
  const s=new EditorSession(design(),undefined,async()=>{throw new ApiError("NETWORK","lost",0)});
  await assert.rejects(s.run());const intent=s.state.intent;
  s.reload({...design(),revision:2});assert.deepEqual(s.state.intent,intent);
});
test("clean drafts adopt only newer server revisions and dirty drafts stay untouched",()=>{
  const s=new EditorSession(design());s.receiveServer({...design(),revision:2,name:"remote"});assert.equal(s.state.design.name,"remote");
  s.receiveServer({...design(),revision:1,name:"old response"});assert.equal(s.state.design.name,"remote");
  s.rename("mine");s.receiveServer({...design(),revision:3,name:"new remote"});assert.equal(s.state.design.name,"mine");assert.equal(s.state.saved.revision,2);
});
test("an incoming server snapshot cannot overwrite an in-flight submitted edit",async()=>{
  let release;const s=new EditorSession(design(),async(_id,b)=>{await new Promise(r=>{release=r});return {...design(),...b,revision:2}});
  s.rename("mine");const saving=s.save();s.receiveServer({...design(),revision:3,name:"remote"});assert.equal(s.state.design.name,"mine");release();await saving;
  s.receiveServer({...design(),revision:3,name:"remote"});assert.equal(s.state.design.name,"remote");
});
test("unconfirmed calculation acceptance is unsettled even when the draft is saved",async()=>{
  const s=new EditorSession(design(),undefined,async()=>{throw new ApiError("NETWORK","lost",0)});assert.equal(s.hasUnsettledWork,false);
  await assert.rejects(s.run());assert.equal(s.dirty,false);assert.equal(s.hasUnsettledWork,true);
});
test("authentication failure on an uncertain retry preserves the request id",async()=>{
  let attempts=0;const s=new EditorSession(design(),undefined,async()=>{if(++attempts===1)throw new ApiError("NETWORK","lost",0);throw new ApiError("SESSION_EXPIRED","login",401)});
  await assert.rejects(s.run());const intent=s.state.intent;await assert.rejects(s.run());assert.deepEqual(s.state.intent,intent);
});
test("a disposed account cannot return a late acceptance to its navigation handler",async()=>{
  let finish;const s=new EditorSession(design(),undefined,async()=>new Promise(resolve=>{finish=resolve}));
  const pending=s.run();await new Promise(resolve=>setImmediate(resolve));s.dispose();finish({run:{id:"old-account-run",status:"pending"},statusUrl:""});
  await assert.rejects(pending,/session has ended/);assert.equal(s.state.run,undefined);
});