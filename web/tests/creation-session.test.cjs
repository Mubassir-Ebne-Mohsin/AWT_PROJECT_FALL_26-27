const { test } = require("node:test");
const assert = require("node:assert/strict");
const { CreationSession } = require("../src/lib/creation-session");
const { ApiError } = require("../src/lib/api/errors");
const { designStatus } = require("../src/lib/design-status");
const draft={schemaVersion:1,name:"Mine",description:"",source:"blank",templateId:null,graph:{nodes:[],edges:[]},traffic:{}};
test("M4 concurrent clicks create exactly once and retain the returned identity",async()=>{
 let finish,calls=0;const session=new CreationSession(undefined,()=>{calls++;return new Promise(r=>finish=r)});
 const pending=session.create(draft);await session.create(draft);assert.equal(calls,1);
 finish({...draft,id:"saved"});await pending;await session.create(draft);
 assert.equal(calls,1);assert.equal(session.state.created.id,"saved");
});
test("M4 unknown creation acceptance prevents automatic retry until deliberate intent",async()=>{
 let calls=0;const session=new CreationSession(undefined,async()=>{calls++;throw new ApiError("NETWORK","lost",0)});
 await session.create(draft);assert.equal(session.state.uncertain,true);
 await session.create(draft);assert.equal(calls,1);
 session.clearForNewIntent();await session.create(draft);assert.equal(calls,2);
});
test("M4 definitive validation or rate rejection allows a corrected retry",async()=>{
 for(const [code,status] of [["VALIDATION_FAILED",422],["RATE_LIMITED",429],["SESSION_EXPIRED",401]]){
   const session=new CreationSession(undefined,async()=>{throw new ApiError(code,"try later",status)});
   await session.create(draft);assert.equal(session.state.uncertain,false);assert.equal(session.state.pending,false);
 }
});
test("M4 disposed account ignores both preparation and creation responses",async()=>{
 let finish;const session=new CreationSession(()=>new Promise(r=>finish=r));
 const p=session.prepare({source:"scripted",text:"app"});session.dispose();finish({design:draft,assumptions:[]});
 assert.equal(await p,undefined);assert.equal(session.state.prepared,undefined);
 let accept;const other=new CreationSession(undefined,()=>new Promise(r=>accept=r));
 const creating=other.create(draft);other.dispose();accept({...draft,id:"old-owner"});assert.equal(await creating,undefined);assert.equal(other.state.created,undefined);
});
test("M4 changing input invalidates a preview; naming a checked draft preserves it",async()=>{
 const session=new CreationSession(async()=>({design:draft,assumptions:["default"]}));
 session.update({text:"app"});await session.prepare({source:"scripted",text:"app"});
 session.update({name:"Renamed"});assert.equal(session.state.prepared.design.name,"Mine");
 session.update({text:"database"});assert.equal(session.state.prepared,undefined);
});
test("M4 5xx can follow commit and remains uncertain; blank names never submit",async()=>{
 let calls=0;const session=new CreationSession(undefined,async()=>{calls++;throw new ApiError("INTERNAL","failed",500)});
 await session.create({...draft,name:" "});assert.equal(calls,0);
 await session.create(draft);assert.equal(session.state.uncertain,true);
});
test("M4 status distinguishes old verdicts, calculation failure and missing results",()=>{
 assert.equal(designStatus({revision:2,latestRun:null}).label,"Not run");
 assert.equal(designStatus({revision:2,latestRun:{designRevision:1,status:"completed",verdict:"fail"}}).label,"Stale · Missing target");
 assert.equal(designStatus({revision:1,latestRun:{designRevision:1,status:"failed",verdict:null}}).label,"Calculation failed");
 assert.equal(designStatus({revision:1,latestRun:{designRevision:1,status:"pending",verdict:null}}).label,"Test running");
});
