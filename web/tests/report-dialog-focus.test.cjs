const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/dashboard" });
global.window=dom.window;global.document=dom.window.document;global.IS_REACT_ACT_ENVIRONMENT=true;
const React=require("react");const {act}=React;const {createRoot}=require("react-dom/client");
let status="loading", open=true, root;
require.cache[require.resolve("next/link")]={exports:{__esModule:true,default:({children,...props})=>React.createElement("a",props,children)}};
require.cache[require.resolve("../src/components/auth/auth-provider.tsx")]={exports:{useAuth:()=>({status})}};
require.cache[require.resolve("../src/components/shell/ui-provider.tsx")]={exports:{useUi:()=>({ui:{reportRef:null},setUI:patch=>{if(patch.feedback===false){open=false;root.render(React.createElement(Harness));}}})}};
const {ReportDialog}=require("../src/components/support/report-dialog.tsx");
function Harness(){return open?React.createElement(ReportDialog,{path:"/dashboard"}):null;}
afterEach(async()=>{if(root)await act(async()=>root.unmount());root=null;document.body.innerHTML="";status="loading";open=true;});
test("report dialog focuses the form after delayed authentication and restores the original opener on Escape", async()=>{
 const opener=document.createElement("button");opener.textContent="Report a problem";document.body.append(opener);opener.focus();
 const host=document.createElement("div");document.body.append(host);root=createRoot(host);
 await act(async()=>root.render(React.createElement(Harness)));
 assert.ok(host.querySelector('[data-testid="report-signin"]'));
 status="authed";await act(async()=>root.render(React.createElement(Harness)));
 const title=host.querySelector('[data-testid="report-title"]');assert.ok(title);assert.equal(document.activeElement,title);
 await act(async()=>title.dispatchEvent(new window.KeyboardEvent("keydown",{key:"Escape",bubbles:true})));
 assert.equal(host.querySelector('[data-testid="report-dialog"]'),null);assert.equal(document.activeElement,opener);
});
