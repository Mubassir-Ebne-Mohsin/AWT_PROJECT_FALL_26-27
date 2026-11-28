import {test,expect,type Page,type BrowserContext} from '@playwright/test';
import examples from '../../src/lib/examples-data.json';
import computed from '../fixtures/passing-template-runs.json';
async function auth(page:Page,context:BrowserContext){const user={id:'90000000-0000-4000-8000-000000000001',email:'starter@example.test',displayName:'Starter tester',role:'user'};await context.addCookies([{name:'sf_session',value:'1',url:new URL(process.env.SF_WEB_URL??'http://localhost:3000').origin}]);return user;}
test('Templates offer six passing starters without verdict badges and keep filters and actions',async({page,context},info)=>{
 const user=await auth(page,context);await page.route('**/v1/**',r=>{const p=new URL(r.request().url()).pathname;return r.fulfill({json:{data:p.endsWith('/auth/refresh')?{accessToken:'controlled-starter',expiresIn:900,user}:p.endsWith('/auth/me')?user:p.endsWith('/account/roles')?{roles:['user']}:{}}});});
 await page.goto('/templates');await expect(page.getByTestId('template-card')).toHaveCount(6);
 if(process.env.SF_STARTER_BADGE_FAULT)await page.getByTestId('template-card').first().evaluate(el=>{const span=document.createElement('span');span.textContent='MISSES GOAL';el.append(span);});
 await expect(page.getByText(/MISSES GOAL|MEETS GOAL|NEAR LIMIT/)).toHaveCount(0);
 for(const item of computed){const card=page.locator('[data-id="'+item.template.id+'"]');await expect(card).toHaveAttribute('data-verdict','pass');await expect(card.getByRole('img')).toBeVisible();await expect(card.getByRole('link',{name:'Start from this template'})).toHaveAttribute('href','/new/template?template='+item.template.id);await expect(card.getByRole('link',{name:'See how it behaves'})).toHaveAttribute('href','/examples#'+item.template.id);}
 await page.getByLabel('Has a queue',{exact:true}).check();await expect(page.getByTestId('template-card')).toHaveCount(2);await page.getByRole('button',{name:'Reset filters'}).click();
 await page.screenshot({path:'../docs/audit/passing-templates-2026-11-27/cards-'+info.project.name+'.png',fullPage:true,animations:'disabled'});
});
for(const item of computed)test('Starter copy and first run: '+item.template.id,async({page,context})=>{
 const user=await auth(page,context),id='90000000-0000-4000-8000-000000000020',runId='90000000-0000-4000-8000-000000000030',date='2026-11-27T07:00:00Z';
 let created=false,simulated=false;
 const design={...item.template,id,revision:1,name:item.template.name,description:item.template.blurb,source:'template',templateId:item.template.id,createdAt:date,updatedAt:date};
 const run={id:runId,designId:id,requestId:runId,designRevision:1,fingerprint:item.result.fingerprint,engineVersion:item.result.engineVersion,kind:'simulation',snapshot:item.snapshot,createdAt:date,status:'completed',completedAt:date,result:item.result.output,failure:null};
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/v1/**',route=>{const request=route.request(),p=new URL(request.url()).pathname;let data:unknown={};let status=200;
  if(p.endsWith('/auth/refresh'))data={accessToken:'controlled-starter',expiresIn:900,user};else if(p.endsWith('/auth/me'))data=user;else if(p.endsWith('/account/roles'))data={roles:['user']};
  else if(p.endsWith('/templates'))data=computed.map(v=>v.template);
  else if(p.endsWith('/simulation/catalog'))data=examples.catalog;
  else if(p.endsWith('/designs')&&request.method()==='POST'){const body=request.postDataJSON();expect(body.templateId).toBe(item.template.id);expect(body.graph).toEqual(item.template.graph);expect(body.traffic).toEqual(item.template.traffic);created=true;data=design;status=201;}
  else if(p.endsWith('/simulate')){expect(request.postDataJSON().expectedRevision).toBe(1);simulated=true;data={run,statusUrl:'/v1/designs/'+id+'/runs/'+runId};status=202;}
  else if(p.endsWith('/runs/'+runId))data=run;
  else if(p.endsWith('/designs/'+id))data=design;
  else if(p.endsWith('/runs')||p.endsWith('/versions')||p.endsWith('/notes'))data=[];
  return route.fulfill({status,json:{data}});
 });
 await page.goto('/templates');await page.locator('[data-id="'+item.template.id+'"]').getByRole('link',{name:'Start from this template'}).click();await expect(page.getByLabel('Name for your copy')).toHaveValue(item.template.name);
 await page.getByRole('button',{name:'Use this template',exact:true}).click();await expect(page).toHaveURL(new RegExp('/designs/'+id+'/edit'));expect(created).toBe(true);
 await page.getByRole('button',{name:'Run test',exact:true}).click();const result=page.getByRole('region',{name:'Recorded model results'});await expect(result.getByRole('heading',{name:'Passes comfortably',exact:true})).toBeVisible();expect(simulated).toBe(true);await expect(page.getByText(/Stale result — inputs changed/)).toHaveCount(0);expect(errors).toEqual([]);
});
