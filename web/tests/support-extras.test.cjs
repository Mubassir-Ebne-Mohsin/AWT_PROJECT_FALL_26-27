const {test,afterEach}=require("node:test"),assert=require("node:assert/strict");
const {JSDOM}=require("jsdom");const dom=new JSDOM('<!doctype html><body></body>',{url:'http://localhost',pretendToBeVisual:true});
global.window=dom.window;global.document=dom.window.document;global.IS_REACT_ACT_ENVIRONMENT=true;
const React=require("react"),{act}=React,{createRoot}=require("react-dom/client");
const {QueryClient,QueryClientProvider}=require("@tanstack/react-query");
const {appendSavedReply}=require("../src/lib/support-extras.ts");
const {ApiError}=require("../src/lib/api/errors.ts");
let root,client,rows,sendCount,previewCount,preview,mergeCount,uid='staff';
const at='2026-11-07T01:00:00.000Z';
const detail=()=>({id:'ticket',ref:1001,code:'SF-1001',category:'bug',title:'Private report',status:'open',priority:'normal',body:'Private body',expected:null,context:{},messages:[],createdAt:at,updatedAt:at,resolvedAt:null,reopenUntil:null,mergedInto:null,duplicates:[],authorName:'Reporter',assigneeId:null,assigneeName:null,unread:false});
const mock=(file,exports)=>require.cache[require.resolve(file)]={exports};
mock('../src/components/auth/auth-provider.tsx',{useAuth:()=>({user:{id:uid,displayName:'Staff'}})});
mock('../src/components/auth/role-gate.tsx',{RoleGate:({children})=>children});
mock('../src/components/shell/crumbs.tsx',{Crumbs:()=>null});
mock('../src/lib/use-now.ts',{useNow:()=>Date.parse(at)});
mock('next/link',{__esModule:true,default:({children,href})=>React.createElement('a',{href},children)});
mock('../src/lib/api/support.ts',{
 getInboxReport:async()=>detail(),listSupportAgents:async()=>[],markInboxRead:async()=>({read:true}),
 replyInbox:async()=>{sendCount++;return detail();},updateInbox:async()=>detail(),
 listInbox:async()=>({items:[{...detail(),id:'target',code:'SF-1002',title:'Target'}],next:null}),
});
mock('../src/lib/api/support-extras.ts',{
 getSavedReplies:async()=>rows,
 previewSavedReply:(...args)=>{previewCount++;return preview(...args);},
 createSavedReply:async value=>{const row={id:'new',...value,createdAt:at,updatedAt:at};rows=[...rows,row];return row;},
 editSavedReply:async(id,value)=>{const row={...rows.find(r=>r.id===id),...value};rows=rows.map(r=>r.id===id?row:r);return row;},
 deleteSavedReply:async id=>{rows=rows.filter(r=>r.id!==id);return{deleted:true};},
 mergeReport:async()=>{mergeCount++;return {...detail(),status:'resolved',mergedInto:{id:'target',code:'SF-1002'}};},
 unmergeReport:async()=>detail(),
});
const {SupportTicket}=require('../src/components/support/ticket-detail.tsx');
const {useSupportAction}=require('../src/components/support/use-support-action.ts');
const tick=()=>new Promise(r=>setTimeout(r,15));
async function settle(){await act(async()=>{await tick();await tick();});}
async function mount(){sendCount=previewCount=mergeCount=0;uid='staff';rows=[{id:'answer',title:'Example answer',scope:'personal',body:'Hello {name}',createdAt:at,updatedAt:at}];preview=async()=>({body:'Hello Reporter about SF-1001'});document.body.innerHTML='<div id="root"></div>';client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0},mutations:{retry:false,gcTime:0}}});root=createRoot(document.querySelector('#root'));await act(async()=>root.render(React.createElement(QueryClientProvider,{client},React.createElement(SupportTicket,{id:'ticket'}))));await settle();}
const button=name=>[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===name);
async function click(e){assert.ok(e);await act(async()=>e.click());await settle();}
async function value(e,text){assert.ok(e);await act(async()=>{const type=e.tagName==='TEXTAREA'?'HTMLTextAreaElement':e.tagName==='SELECT'?'HTMLSelectElement':'HTMLInputElement';Object.getOwnPropertyDescriptor(window[type].prototype,'value').set.call(e,text);e.dispatchEvent(new window.Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));});await settle();}
afterEach(async()=>{if(root){await act(async()=>root.unmount());root=null;}client?.clear();});
test('append preserves existing draft and refuses overflow without truncation',()=>{assert.equal(appendSavedReply('Draft','Answer'),'Draft\n\nAnswer');assert.equal(appendSavedReply('','Answer'),'Answer');assert.throws(()=>appendSavedReply('x'.repeat(3999),'Too long'),/4000/);});
test('real ticket integration inserts into editable text but only explicit Send reply sends',async()=>{
 await mount();await value(document.querySelector('[data-testid=reply-box]'),'Existing draft');
 await value(document.querySelector('select')?.closest('.support-extras')?.querySelector('select')||document.querySelector('.support-extras select'),'answer');
 await click(button('Insert reply'));assert.equal(previewCount,1);assert.equal(sendCount,0);assert.equal(document.querySelector('[data-testid=reply-box]').value,'Existing draft\n\nHello Reporter about SF-1001');
 await click(document.querySelector('[data-testid=reply-send]'));assert.equal(sendCount,1);
});
test('create and edit a saved reply never submit the current report',async()=>{
 await mount();const form=document.querySelector('form[aria-label="Saved reply editor"]');
 await value(form.querySelector('input'),'Reusable answer');await value(form.querySelector('textarea'),'Plain <b>text</b>');
 await act(async()=>form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));await settle();assert.equal(sendCount,0);assert.equal(rows.length,2);
 assert.equal(document.querySelector('.support-extras select').value,'new');await click(button('Edit selected reply'));assert.equal(form.querySelector('input').value,'Reusable answer');
});
test('an overlong insert preserves the draft and gives a useful local error',async()=>{
 await mount();await value(document.querySelector('[data-testid=reply-box]'),'x'.repeat(3995));await value(document.querySelector('.support-extras select'),'answer');await click(button('Insert reply'));
 assert.equal(document.querySelector('[data-testid=reply-box]').value.length,3995);assert.match(document.body.textContent,/exceed 4000/);assert.equal(sendCount,0);
});
test('stale template errors remain local and preserve draft text',async()=>{
 await mount();preview=async()=>{throw new ApiError('CONFLICT','Saved reply changed. Refresh it.',409);};await value(document.querySelector('.support-extras select'),'answer');await click(button('Insert reply'));assert.match(document.body.textContent,/Saved reply changed/);assert.equal(sendCount,0);
});
test('merge requires choosing and reviewing a target before the explicit final action',async()=>{
 await mount();assert.equal(button('Confirm merge'),undefined);const input=[...document.querySelectorAll('input')].find(e=>e.placeholder==='SF-1042 or a title');await value(input,'SF-1002');await click(button('Search merge targets'));
 const select=[...document.querySelectorAll('select')].find(e=>e.parentElement.textContent.startsWith('Surviving report'));await value(select,'target');assert.equal(mergeCount,0);assert.match(document.body.textContent,/No messages, names or internal notes are copied/);await click(button('Confirm merge'));assert.equal(mergeCount,1);assert.equal(sendCount,0);assert.equal(document.activeElement.textContent,'Duplicate reports');
});
test('pending actions cannot double-submit and unmount aborts/ignores a late result',async()=>{
 let handle,resolve,calls=0,signal,completed=0;function Harness(){handle=useSupportAction();return null;}
 document.body.innerHTML='<div id="root"></div>';root=createRoot(document.querySelector('#root'));await act(async()=>root.render(React.createElement(Harness)));
 const work=s=>{calls++;signal=s;return new Promise(r=>resolve=r);};await act(async()=>{void handle.run(work,()=>completed++);void handle.run(work,()=>completed++);});assert.equal(calls,1);
 await act(async()=>root.unmount());root=null;assert.equal(signal.aborted,true);await act(async()=>resolve('late'));assert.equal(completed,0);
});

test('a delayed insertion appends to text typed while the request was pending',async()=>{
 await mount();let resolve;preview=()=>new Promise(r=>resolve=r);await value(document.querySelector('.support-extras select'),'answer');
 await act(async()=>button('Insert reply').click());await value(document.querySelector('[data-testid=reply-box]'),'Latest typed draft');
 await act(async()=>resolve({body:'Saved answer'}));await settle();assert.equal(document.querySelector('[data-testid=reply-box]').value,'Latest typed draft\n\nSaved answer');assert.equal(sendCount,0);
});
