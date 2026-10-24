const {test}=require("node:test"),assert=require("node:assert/strict");
const {world,screen,zoomAt,fit,snap,edgePath}=require("../src/lib/canvas/geometry");
const {addComponent,moveComponent,numericError,defaultValue}=require("../src/lib/canvas/model");
const {EditorSession}=require("../src/lib/editor-session");
const catalog=require("./fixtures/canvas-catalog.json");
const empty=()=>({nodes:[],edges:[]});
const design=()=>({id:"a",schemaVersion:1,name:"Design",description:"",source:"blank",templateId:null,revision:1,graph:{nodes:[{id:"n1",type:"app",label:"App",x:40,y:100,props:{}}],edges:[]},traffic:{rps:500},createdAt:"date",updatedAt:"date"});
test("world/screen round trips at every zoom and pan, including negative coordinates",()=>{
 for(const k of [.3,.5,1,1.15,2])for(const p of [{x:-500,y:120},{x:100000,y:-99999},{x:0,y:0}]){
  const view={x:73,y:-219,k},copy=world(screen(p,view),view);assert.ok(Math.abs(copy.x-p.x)<1e-8);assert.ok(Math.abs(copy.y-p.y)<1e-8);
 }
});
test("zoom anchors stay under the pointer and cannot exceed source zoom bounds",()=>{
 const view={x:-200,y:50,k:.7},p={x:400,y:180},anchor=world(p,view);
 for(const factor of [.00001,.5,1.2,999]){const next=zoomAt(p,view,factor);assert.ok(next.k>=.3&&next.k<=2);const after=world(p,next);assert.ok(Math.abs(after.x-anchor.x)<1e-9);assert.ok(Math.abs(after.y-anchor.y)<1e-9);}
});
test("fit/snap/edge geometry stay finite for empty, tiny and wide canvases",()=>{
 for(const size of [{w:0,h:0},{w:480,h:620},{w:1000,h:600}])for(const nodes of [[],[{x:-50,y:-90}],[{x:-99996,y:99996},{x:99996,y:-99996}]]){const v=fit(nodes,size);assert.ok(Object.values(v).every(Number.isFinite));assert.ok(v.k>=.3&&v.k<=1.15);}
 assert.equal(snap(100000),99996);assert.equal(snap(-100000),-99996);assert.equal(snap(25),24);
 assert.match(edgePath({x:100,y:20},{x:0,y:-40}),/^M284 52 C/);
});
test("all twelve palette types use catalog defaults and only allowed properties",()=>{
 assert.equal(catalog.components.length,12);
 let graph=empty();
 for(const entry of catalog.components){const result=addComponent(graph,entry,81,217);graph=result.graph;const n=graph.nodes.at(-1);assert.equal(n.type,entry.type);assert.equal(n.x,84);assert.equal(n.y,216);for(const key of Object.keys(n.props))assert.ok(entry.editableProperties.includes(key),entry.type+"."+key);for(const key of entry.editableProperties.filter(k=>k!=="region"))assert.ok(Number.isFinite(defaultValue(n,entry,key)));}
 assert.equal(new Set(graph.nodes.map(n=>n.id)).size,12);
 assert.ok(!("replicas" in graph.nodes.find(n=>n.type==="client").props));
 assert.ok(!("region" in graph.nodes.find(n=>n.type==="cdn").props));
});
test("palette IDs never collide with nodes/edges; bounds and nonfinite positions are enforced",()=>{
 const app=catalog.components.find(c=>c.type==="app"),g={nodes:[{id:"n1"}],edges:[{id:"n2"}]};
 assert.equal(addComponent(g,app,1,1).id,"n3");
 assert.throws(()=>addComponent({nodes:Array(50).fill({id:"x"}),edges:[]},app,1,1),/50/);
 assert.throws(()=>addComponent(empty(),app,NaN,0),/finite/);
 const original=design().graph,moved=moveComponent(original,"n1",100000,100000);assert.equal(moved.nodes[0].x,99996);assert.equal(original.nodes[0].x,40);
 assert.equal(moveComponent(original,"n1",52,100,false).nodes[0].x,52);
});
test("property validation rejects blanks, nonfinite, fractional and type-specific invalid settings",()=>{
 for(const [key,raw,type] of [["replicas","", "app"],["replicas","1.5","app"],["replicas","201","app"],["capacity","0","db"],["latency","-1","app"],["share","1.01","storage"],["maxDepth","100.5","queue"],["hitRatio","NaN","cache"]])assert.ok(numericError(key,raw,type),key);
 assert.equal(numericError("share","500","client"),"");assert.equal(numericError("replicas","200","app"),"");
});
test("dragging is unsettled but writes only its committed graph; cancel writes nothing",async()=>{
 let calls=0;const d=design(),session=new EditorSession(d,async(_id,body)=>{calls++;return {...d,...body,revision:2}});
 session.beginGesture();assert.equal(session.hasUnsettledWork,true);await assert.rejects(session.save(),/Finish moving/);assert.equal(calls,0);
 session.endGesture();await session.save();assert.equal(calls,0);
 session.beginGesture();session.endGesture(moveComponent(d.graph,"n1",240,360));await session.save();assert.equal(calls,1);assert.equal(session.dirty,false);assert.equal(session.state.saved.graph.nodes[0].x,240);
});
test("remote data cannot replace a gesture or invalid field; field errors block save and Run",async()=>{
 let submits=0;const d=design(),s=new EditorSession(d,undefined,async()=>{submits++});
 s.beginGesture();s.receiveServer({...d,revision:2,name:"remote"});assert.equal(s.state.design.name,"Design");s.endGesture();
 s.inputError("n1.replicas",true);s.receiveServer({...d,revision:3,name:"remote"});assert.equal(s.state.design.name,"Design");
 await assert.rejects(s.run(),/Finish moving/);assert.equal(submits,0);
 s.inputError("n1.replicas",false);s.receiveServer({...d,revision:3,name:"remote"});assert.equal(s.state.design.name,"remote");
});
test("layout and design-name saves preserve input equivalence; properties/labels/order still stale results",async()=>{
 const d=design(),s=new EditorSession(d,async(_id,b)=>({...d,...b,revision:2}));
 s.setRun({designRevision:1,snapshot:{graph:d.graph,traffic:d.traffic}});
 s.edit(moveComponent(d.graph,"n1",240,360));assert.equal(s.stale,false);await s.save();assert.equal(s.stale,false);
 s.rename("Another title");assert.equal(s.stale,false);
 s.edit({...s.state.design.graph,nodes:s.state.design.graph.nodes.map(n=>({...n,props:{replicas:3}}))});assert.equal(s.stale,true);
});
test("a late acknowledgement preserves a node moved during the save",async()=>{
 const d=design();let finish;const s=new EditorSession(d,(_id,body)=>new Promise(r=>finish=()=>r({...d,...body,revision:2})));
 s.rename("saving");const save=s.save();s.beginGesture();s.endGesture(moveComponent(s.state.design.graph,"n1",240,360));finish();await save;
 assert.equal(s.state.design.graph.nodes[0].x,240);assert.equal(s.dirty,true);
});
