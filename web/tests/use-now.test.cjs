const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require("react");
const { act } = React;
const { createRoot } = require("react-dom/client");
const { useNow } = require("../src/lib/use-now.ts");
const realNow = Date.now, realSet = global.setInterval, realClear = global.clearInterval;
let root;
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; Date.now=realNow; global.setInterval=realSet; global.clearInterval=realClear; document.body.innerHTML=""; });
function Probe({ every }) { return React.createElement("output", null, String(useNow(every))); }
function setup() {
  let clock=1000, next=0; const timers=new Map();
  Date.now=()=>clock;
  global.setInterval=(fn,ms)=>{ const id=++next; timers.set(id,{fn,ms}); return id; };
  global.clearInterval=id=>timers.delete(id);
  const host=document.createElement("div");document.body.append(host);root=createRoot(host);
  return {host,timers,setClock:value=>{clock=value;}};
}
test("relative-age clock advances without a query result or user action and stops on unmount", async () => {
  const s=setup(); await act(async()=>root.render(React.createElement(Probe,{every:30000})));
  assert.equal(s.host.textContent,"1000"); assert.equal(s.timers.size,1);
  s.setClock(31000); await act(async()=>[...s.timers.values()][0].fn());
  assert.equal(s.host.textContent,"31000");
  await act(async()=>root.unmount());root=null;assert.equal(s.timers.size,0);
});
test("relative-age clock changes interval without leaving a second subscription", async () => {
  const s=setup();await act(async()=>root.render(React.createElement(Probe,{every:30000})));
  const old=[...s.timers.keys()][0];
  await act(async()=>root.render(React.createElement(Probe,{every:1000})));
  assert.equal(s.timers.size,1);assert.equal(s.timers.has(old),false);assert.equal([...s.timers.values()][0].ms,1000);
});
