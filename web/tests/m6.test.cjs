const {test}=require("node:test"),assert=require("node:assert/strict");
const {connectNodes,reverseConnection,deleteSelection,duplicateComponent}=require("../src/lib/canvas/commands");
const {EditorHistory}=require("../src/lib/editor-history");
const {EditorSession}=require("../src/lib/editor-session");
const {ApiError}=require("../src/lib/api/errors");
const graph=()=>({nodes:[{id:"n1",type:"client",label:"Users",x:0,y:0,props:{}},{id:"n2",type:"app",label:"App",x:240,y:0,props:{replicas:1}},{id:"n3",type:"db",label:"DB",x:480,y:0,props:{}}],edges:[]});
const design=()=>({id:"design",name:"Draft",schemaVersion:1,description:"",source:"blank",templateId:null,revision:1,graph:graph(),traffic:{rps:500},createdAt:"date",updatedAt:"date"});
const ok={ok:true,errors:[],warnings:[]};
const tick=()=>new Promise(r=>setImmediate(r));
test("connections reject invalid endpoints, self, Clients inputs, duplicates and limits without mutation",()=>{
 const g=graph();for(const [a,b]of[["missing","n2"],["n2","n2"],["n2","n1"]])assert.throws(()=>connectNodes(g,a,b));
 const added=connectNodes(g,"n1","n2");assert.equal(g.edges.length,0);assert.equal(added.graph.edges[0].from,"n1");assert.throws(()=>connectNodes(added.graph,"n1","n2"),/already/);
 assert.throws(()=>connectNodes({...g,edges:Array.from({length:200},(_,i)=>({id:"e"+i,from:"x",to:"y"}))},"n2","n3"),/200/);
 assert.equal(connectNodes({...g,edges:[{id:"e1",from:"n1",to:"n3"}]},"n1","n2").id,"e2");
});
test("reversals preserve edge identity/order and reject Clients and duplicate reverse pairs",()=>{
 let g=connectNodes(graph(),"n2","n3").graph;const id=g.edges[0].id;
 assert.deepEqual(reverseConnection(g,id).edges,[{id,from:"n3",to:"n2"}]);
 assert.throws(()=>reverseConnection(connectNodes(graph(),"n1","n2").graph,"e1"),/Clients/);
 g=connectNodes(g,"n3","n2").graph;assert.throws(()=>reverseConnection(g,id),/already/);
});
test("cycles remain editable drafts; deletion removes incident edges; duplication clones props without edges",()=>{
 let g=connectNodes(graph(),"n2","n3").graph;g=connectNodes(g,"n3","n2").graph;assert.equal(g.edges.length,2);
 assert.equal(deleteSelection(g,"node","n2").edges.length,0);assert.equal(deleteSelection(g,"edge","e1").edges.length,1);
 const result=duplicateComponent(g,"n2");assert.equal(result.graph.edges.length,2);assert.equal(result.graph.nodes.at(-1).label,"App copy");
 result.graph.nodes.at(-1).props.replicas=8;assert.equal(g.nodes[1].props.replicas,1);
 assert.throws(()=>duplicateComponent({...g,nodes:Array(50).fill(g.nodes[0])},"n1"),/50/);
});
test("history coalesces same-field changes, limits 60 steps and branches after undo",()=>{
 const h=new EditorHistory();let d=design();for(let i=0;i<3;i++){const after={...d,name:"Name"+i};h.record(d,after,"name",100+i);d=after;}assert.equal(h.past.length,1);
 const first=h.undo(d);assert.equal(first.name,"Draft");assert.equal(h.redo(first).name,"Name2");
 for(let i=0;i<90;i++){const after={...d,name:"Step"+i};h.record(d,after,undefined,10000+i);d=after;}assert.equal(h.past.length,60);
 const before=h.undo(d);h.record(before,{...before,name:"branch"});assert.equal(h.future.length,0);
});
test("node and incident edge deletion is one undo; save does not clear history",async()=>{
 const d=design();d.graph=connectNodes(d.graph,"n1","n2").graph;
 const s=new EditorSession(d,async(_,b)=>({...d,...b,revision:2}));
 s.edit(deleteSelection(d.graph,"node","n2"));await s.save();assert.equal(s.state.canUndo,true);
 s.undo();assert.deepEqual(s.state.design.graph,d.graph);assert.equal(s.state.design.revision,2);assert.equal(s.dirty,true);
 s.redo();assert.equal(s.state.design.graph.nodes.length,2);
});
test("undo during slow save is retained; subsequent save uses returned revision",async()=>{
 const d=design();let finish;const revisions=[];const s=new EditorSession(d,(_,b)=>{revisions.push(b.expectedRevision);return revisions.length===1?new Promise(r=>finish=()=>r({...d,...b,revision:2})):Promise.resolve({...d,...b,revision:3});});
 s.rename("Changed");const pending=s.save();s.undo();finish();await pending;assert.equal(s.state.design.name,"Draft");assert.equal(s.dirty,true);
 await s.save();assert.deepEqual(revisions,[1,2]);assert.equal(s.state.canRedo,true);
});
test("check saves first, checks latest saved revision, and ignores late validation after edits",async()=>{
 const d=design(),calls=[];let finish;
 const s=new EditorSession(d,async(_,b)=>{calls.push("save");return {...d,...b,revision:2}},undefined,(_,r)=>{calls.push(r);return new Promise(resolve=>finish=resolve)});
 s.rename("new");const pending=s.check();await tick();assert.deepEqual(calls,["save",2]);
 s.edit({...s.state.design.graph,edges:[{id:"e1",from:"n1",to:"n2"}]});finish(ok);await pending;assert.equal(s.state.validation,undefined);
});
test("failed save blocks validation and preserves draft/history for retry",async()=>{
 const d=design();let checks=0;const s=new EditorSession(d,async()=>{throw new ApiError("RATE_LIMITED","Slow down",429)},undefined,async()=>{checks++;return ok});
 s.rename("keep");await assert.rejects(s.check(),/Slow down/);assert.equal(checks,0);assert.equal(s.state.design.name,"keep");assert.equal(s.state.canUndo,true);
});
test("run rejection exposes repair details, warning-only checks stay ready and edits stale checks",async()=>{
 const d=design(),invalid={ok:false,errors:[{code:"ENTRY_UNCONNECTED",message:"Users disconnected",repair:"Connect Users",nodeIds:["n1"],severity:"error"}],warnings:[]};
 const s=new EditorSession(d,undefined,async()=>{throw new ApiError("VALIDATION_FAILED","Fix the graph",422,{validation:invalid})},async()=>ok);
 await assert.rejects(s.run());assert.deepEqual(s.state.validation.result,invalid);assert.equal(s.state.intent,undefined);
 await s.check();assert.equal(s.state.validation.result.ok,true);s.edit(connectNodes(s.state.design.graph,"n1","n2").graph);assert.equal(s.validationStale,true);
});
test("remote reload, conflict rebase and disposal clear history; disposed replies cannot restore it",async()=>{
 const d=design(),s=new EditorSession(d);s.rename("local");s.reload({...d,revision:2});assert.equal(s.state.canUndo,false);
 s.rename("again");s.reapply({...d,revision:3});assert.equal(s.state.canUndo,false);assert.equal(s.state.design.name,"again");
 s.rename("last");s.dispose();s.undo();s.edit(graph());assert.equal(s.state.canUndo,false);
});
test("history and graph checks stay isolated by editor instance",async()=>{
 const a=new EditorSession(design(),async(_,body)=>({...design(),...body,revision:2}),undefined,async()=>ok),b=new EditorSession({...design(),id:"other"});
 a.rename("A");await a.check();assert.equal(b.state.canUndo,false);assert.equal(b.state.validation,undefined);
});
test("gesture and invalid-input guards prevent history travel and validation writes",async()=>{
 const s=new EditorSession(design());s.rename("edit");s.beginGesture();s.undo();assert.equal(s.state.design.name,"edit");await assert.rejects(s.check(),/Finish moving/);s.endGesture();
 s.inputError("bad",true);s.undo();assert.equal(s.state.design.name,"edit");s.inputError("bad",false);s.undo();assert.equal(s.state.design.name,"Draft");
});

test("a late validation reply after account disposal cannot restore validation or history",async()=>{
 let finish;const s=new EditorSession(design(),undefined,undefined,()=>new Promise(resolve=>finish=resolve));
 const pending=s.check();await tick();s.dispose();finish(ok);await pending;
 assert.equal(s.state.validation,undefined);assert.equal(s.state.canUndo,false);assert.equal(s.state.canRedo,false);
});
