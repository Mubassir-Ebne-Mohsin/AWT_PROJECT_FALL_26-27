import {test,expect,type Page,type BrowserContext} from '@playwright/test';
import data from '../../src/lib/examples-data.json';
const id='90000000-0000-4000-8000-000000000020';
async function fixture(page:Page,context:BrowserContext){
 const user={id:'90000000-0000-4000-8000-000000000001',email:'history@example.test',displayName:'History reader',role:'user'};
 const t=data.templates[0],date='2026-11-27T07:00:00Z';
 const design={id,name:'History layout rehearsal',description:'Controlled browser fixture',source:'template',templateId:t.id,revision:3,createdAt:date,updatedAt:date,graph:t.graph,traffic:t.traffic};
 const versions=[3,2,1].map(revision=>({id:`version-${revision}`,designId:id,revision,origin:'edit',restoredFromRevision:null,createdAt:date,snapshot:{...design,revision,graph:{...t.graph,nodes:t.graph.nodes.map((n,i)=>({...n,x:n.x+(revision===3&&i===0?20:0)}))}}}));
 const runs=[3,2].map(revision=>({id:`run-${revision}`,kind:'simulation',status:'completed',designRevision:revision,createdAt:date,verdict:'pass',p95:77.42}));
 const metrics={verdict:'pass',p50:24.67,p95:77.42,p99:252.98,errorRate:0,throughput:1000,p95Target:300,errorBudget:0.01,bottleneckLabel:'Payments API'};
 let mode='normal';let restoreRequests=0;
 await context.addCookies([{name:'sf_session',value:'1',url:new URL(process.env.SF_WEB_URL??'http://localhost:3000').origin}]);
 await page.route('**/v1/**',route=>{
  const url=new URL(route.request().url()),p=url.pathname;
  let result:unknown={};
  if(p.endsWith('/auth/refresh'))result={accessToken:'controlled-history-token',expiresIn:900,user};
  else if(p.endsWith('/auth/me'))result=user;
  else if(p.endsWith('/account/roles'))result={roles:['user']};
  else if(p.endsWith('/compare')){
   if(mode==='outage')return route.fulfill({status:503,json:{error:{code:'UNAVAILABLE',message:'Controlled outage'}}});
   const a=Number(url.searchParams.get('a')),b=Number(url.searchParams.get('b'));
   const side=(r:number)=>({revision:r,run:r===1?null:{...runs.find(run=>run.designRevision===r),engineVersion:'fixture-v1',metrics}});
   result={designId:id,a:side(a),b:side(b),comparable:a!==1&&mode!=='traffic',reasons:a===1?['RUN_MISSING_A']:mode==='traffic'?['TRAFFIC_DIFFERS']:[],deltas:a===1||mode==='traffic'?null:{p50:0,p95:0,p99:0,errorRate:0,throughput:0}};
  }
  else if(p.endsWith('/versions'))result=versions;
  else if(p.endsWith('/runs'))result=runs;
  else if(p.endsWith('/restore')){restoreRequests++;return route.fulfill({status:409,json:{error:{code:'CONFLICT',message:'Controlled conflict'}}});}
  else if(p.endsWith('/designs/'+id))result=design;
  return route.fulfill({json:{data:result}});
 });
 return {setMode:(value:string)=>{mode=value;},restoreRequests:()=>restoreRequests};
}
test('History split layout keeps selection, saved metrics, run pickers and responsive bounds',async({page,context},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await fixture(page,context);await page.goto(`/designs/${id}/history`);
 if(process.env.SF_HISTORY_LAYOUT_FAULT)await page.addStyleTag({content: `.m15-history-layout { grid-template-columns: 1fr !important; }`});
 const history=page.getByRole('region',{name:'Version history'});await expect(history).toBeVisible();
 const pick=(r:number)=>history.getByLabel(`Select revision ${r} to compare`);
 await pick(2).check();await pick(3).check();await expect(pick(1)).toBeDisabled();
 const compare=page.getByRole('region',{name:'Comparison of revision 2 and revision 3'});await expect(compare.getByRole('row',{name:/^p95 latency/})).toContainText('77.42 ms');await expect(compare.getByRole('row',{name:/^p95 latency/})).toContainText('No change');
 await expect(compare.getByText('Moves 1 component (layout only)')).toBeVisible();
 const disclosure=history.locator('.m15-recorded-runs').first();await disclosure.locator('summary').focus();await page.keyboard.press('Enter');await expect(disclosure).not.toHaveAttribute('open','');await page.keyboard.press('Enter');await expect(disclosure).toHaveAttribute('open','');
 const request=page.waitForRequest(r=>r.url().includes('/compare?')&&r.url().includes('runA=run-2'));await compare.getByLabel('Run for revision 2').selectOption('run-2');await request;
 for(const width of [1440,1024,390,320]){
  await page.setViewportSize({width,height:1000});
  const rail=await page.locator('.m15-revision-list').boundingBox(),panel=await page.locator('.m15-comparison-workspace').boundingBox();expect(rail&&panel).toBeTruthy();
  if(width>=1024)expect(panel!.x).toBeGreaterThan(rail!.x+rail!.width);else expect(panel!.y).toBeGreaterThan(rail!.y);
  if(width<=390){const scroll=compare.getByRole('region',{name:'Comparison metrics'});await scroll.focus();await page.keyboard.press('End');expect(await scroll.evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(true);await scroll.evaluate(el=>{el.scrollLeft=0;});}
  expect(await page.locator('main').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'main fits '+width).toBe(true);
 }
 await page.setViewportSize({width:1440,height:1000});await history.scrollIntoViewIfNeeded();await page.screenshot({path:`../docs/audit/history-refinement-2026-11-27/desktop-${info.project.name}.png`,animations:'disabled'});
 await page.setViewportSize({width:390,height:844});await compare.scrollIntoViewIfNeeded();await page.screenshot({path:`../docs/audit/history-refinement-2026-11-27/mobile-${info.project.name}.png`,animations:'disabled'});
 await compare.getByRole('button',{name:'Close comparison'}).click();await expect(pick(1)).toBeEnabled();await expect(history.getByText('0 of 2 revisions selected')).toBeVisible();expect(errors).toEqual([]);
});
test('History retains missing, incompatible, outage and safe restore states',async({page,context})=>{
 const f=await fixture(page,context);await page.goto(`/designs/${id}/history`);const h=page.getByRole('region',{name:'Version history'}),pick=(r:number)=>h.getByLabel(`Select revision ${r} to compare`);
 await pick(1).check();await pick(3).check();await expect(h.getByText('Revision 1 has no completed test run to compare.')).toBeVisible();await expect(h.getByRole('row',{name:/^Verdict/})).toContainText('No result');
 await h.getByRole('button',{name:'Close comparison'}).click();f.setMode('traffic');await pick(2).check();await pick(3).check();await expect(h.getByText(/different traffic settings/)).toBeVisible();await expect(h.getByText('No change',{exact:true})).toHaveCount(0);
 await h.getByRole('button',{name:'Close comparison'}).click();f.setMode('outage');await pick(1).check();await pick(2).check();await expect(h.getByText('The comparison could not be loaded. Your design is unaffected.')).toBeVisible();
 f.setMode('normal');await h.getByRole('button',{name:'Try again',exact:true}).click();await expect(h.getByText('Revision 1 has no completed test run to compare.')).toBeVisible();
 await h.getByRole('button',{name:'Restore revision 2',exact:true}).click();const confirm=h.getByRole('group',{name:'Confirm restoring revision 2'});await expect(confirm.getByText(/Revision 3 stays in History/)).toBeVisible();await confirm.getByRole('button',{name:'Cancel',exact:true}).click();expect(f.restoreRequests()).toBe(0);
});

test('History revision rail scrolls with keyboard while its heading and comparison stay in place',async({page,context},info)=>{
 await fixture(page,context);await page.goto('/designs/'+id+'/history');
 if(process.env.SF_HISTORY_SCROLL_FAULT)await page.addStyleTag({content:'.m15-revision-scroll { max-height: none !important; overflow: visible !important; }'});
 const scroll=page.getByRole('region',{name:'Scrollable saved revisions'});
 const heading=page.getByRole('heading',{name:'Revisions',exact:true});
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:900});await scroll.scrollIntoViewIfNeeded();
  expect(await scroll.evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);
  const before=await heading.boundingBox();await scroll.focus();await page.keyboard.press('End');
  await expect.poll(()=>scroll.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
  expect((await heading.boundingBox())!.y).toBeCloseTo(before!.y,0);
  await expect(page.getByRole('button',{name:'Restore revision 1',exact:true})).toBeVisible();
  await scroll.evaluate(el=>{el.scrollTop=0;});
  expect(await page.locator('main').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 }
 await page.setViewportSize({width:1440,height:900});await scroll.scrollIntoViewIfNeeded();
 await page.screenshot({path:'../docs/audit/history-scroller-2026-11-27/rail-'+info.project.name+'.png',animations:'disabled'});
});
