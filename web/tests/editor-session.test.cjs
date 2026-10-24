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
