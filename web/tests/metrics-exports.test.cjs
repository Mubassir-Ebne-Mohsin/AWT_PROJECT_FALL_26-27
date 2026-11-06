const {test,afterEach}=require("node:test");const assert=require("node:assert/strict");
const {JSDOM}=require("jsdom");const dom=new JSDOM("<!doctype html><html><body></body></html>",{url:"http://localhost"});
global.window=dom.window;global.document=dom.window.document;global.IS_REACT_ACT_ENVIRONMENT=true;
const React=require("react"),{act}=React,{createRoot}=require("react-dom/client");
const {sample}=require("./helpers/admin-extras-fixture.cjs");
let owner="first",fetcher,requests=[],saved=[],root;
require.cache[require.resolve("../src/components/auth/auth-provider.tsx")]={exports:{useAuth:()=>({user:{id:owner}})}};
require.cache[require.resolve("../src/lib/api/admin.ts")]={exports:{exportMetrics:(...args)=>{requests.push(args);return fetcher(...args);}}};
const {MetricsExports}=require("../src/components/admin/metrics-exports.tsx");
URL.createObjectURL=()=>"blob:http://localhost/audit";URL.revokeObjectURL=()=>{};
dom.window.HTMLAnchorElement.prototype.click=function(){saved.push(this.download);};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const file=m=>({snapshotKey:m.snapshotKey,content:JSON.stringify(m),contentType:"application/json;charset=utf-8",fileName:"snapshot.json"});
const button=()=>[...document.querySelectorAll("button")].find(b=>b.textContent==="Download JSON");
async function mount(m=sample()) {const host=document.createElement("div");document.body.append(host);root=createRoot(host);await act(async()=>root.render(React.createElement(MetricsExports,{m,refresh:()=>{}})));}
afterEach(async()=>{if(root)await act(async()=>root.unmount());root=null;document.body.innerHTML="";owner="first";requests=[];saved=[];});

test("captures clicked snapshot, ignores double click and retains it across live polls",async()=>{
 await mount();const wait=deferred();fetcher=()=>wait.promise;
 await act(async()=>{button().click();button()?.click();});assert.equal(requests.length,1);assert.equal(requests[0][0],sample().snapshotKey);
 await act(async()=>root.render(React.createElement(MetricsExports,{m:{...sample(),snapshotKey:"b".repeat(64)},refresh:()=>{}})));
 await act(async()=>{wait.resolve(file(sample()));await new Promise(r=>setImmediate(r));});
 assert.deepEqual(saved,["snapshot.json"]);assert.match(document.body.textContent,/Downloaded JSON/);
});
test("an account change aborts pending export and suppresses late saving; the next owner can export",async()=>{
 await mount();const wait=deferred();fetcher=()=>wait.promise;await act(async()=>button().click());const signal=requests[0][3];
 owner="second";await act(async()=>root.render(React.createElement(MetricsExports,{m:sample(),refresh:()=>{}})));
 assert.equal(signal.aborted,true);assert.equal(button().disabled,false);
 await act(async()=>{wait.resolve(file(sample()));await new Promise(r=>setImmediate(r));});assert.equal(saved.length,0);
 fetcher=async()=>file(sample());await act(async()=>{button().click();await new Promise(r=>setImmediate(r));});assert.equal(saved.length,1);
});
test("wrong snapshot and service errors save nothing and leave explicit refresh/retry available",async()=>{
 await mount();fetcher=async()=>file({...sample(),snapshotKey:"b".repeat(64)});
 await act(async()=>{button().click();await new Promise(r=>setImmediate(r));});assert.equal(saved.length,0);assert.match(document.body.textContent,/did not match/);
 fetcher=async()=>{throw Error("snapshot expired");};await act(async()=>{button().click();await new Promise(r=>setImmediate(r));});
 assert.equal(saved.length,0);assert.match(document.body.textContent,/snapshot expired/);assert.match(document.body.textContent,/Refresh dashboard/);assert.equal(button().disabled,false);
});
test("unmount aborts pending export without saving",async()=>{
 await mount();const wait=deferred();fetcher=()=>wait.promise;await act(async()=>button().click());const signal=requests[0][3];
 await act(async()=>root.unmount());root=null;assert.equal(signal.aborted,true);
 await act(async()=>{wait.resolve(file(sample()));await new Promise(r=>setImmediate(r));});assert.equal(saved.length,0);
});
