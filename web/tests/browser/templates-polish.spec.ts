import {test,expect,type Page,type BrowserContext} from '@playwright/test';
import {TEMPLATES,startPath,breakingPointText} from '../../src/lib/examples';
async function signedIn(page:Page,context:BrowserContext){const user={id:'90000000-0000-4000-8000-000000000001',email:'templates@example.test',displayName:'Template reader',role:'user'};await context.addCookies([{name:'sf_session',value:'1',url:new URL(process.env.SF_WEB_URL??'http://localhost:3000').origin}]);await page.route('**/v1/**',route=>{const p=new URL(route.request().url()).pathname;return route.fulfill({json:{data:p.endsWith('/auth/refresh')?{accessToken:'controlled-template-token',expiresIn:900,user}:p.endsWith('/auth/me')?user:p.endsWith('/account/roles')?{roles:['user']}:{}}});});}

test('Templates selectable chips preserve AND matching, keyboard selection and empty reset',async({page,context})=>{
 await signedIn(page,context);await page.goto('/templates');await expect(page.getByTestId('template-card')).toHaveCount(6);
 const cache=page.getByLabel('Has a cache',{exact:true}),queue=page.getByLabel('Has a queue',{exact:true});
 await queue.focus();await page.keyboard.press('Space');await expect(queue).toBeChecked();await expect(page.getByTestId('template-card')).toHaveCount(2);
 await cache.check();await expect(page.getByTestId('template-card')).toHaveCount(1);await expect(page.getByTestId('template-card').getByRole('heading',{level:2})).toHaveText('E-commerce checkout');
 await page.getByLabel('Uses object storage',{exact:true}).check();await expect(page.getByTestId('template-card')).toHaveCount(0);await expect(page.getByText('No template has all of those.',{exact:false})).toBeVisible();await page.getByRole('button',{name:'Clear filters',exact:true}).click();await expect(page.getByTestId('template-count')).toHaveText('Showing 6 of 6 templates');
 await page.getByLabel('Has a CDN',{exact:true}).check();await expect(page.locator('.template-filter-chip[data-selected="true"]')).toHaveCount(1);await page.getByRole('button',{name:'Reset filters',exact:true}).click();await expect(page.getByTestId('template-card')).toHaveCount(6);await expect(page.getByRole('button',{name:'Reset filters',exact:true})).toBeDisabled();
});

test('Templates diagram-first cards retain both actions, saved facts and responsive alignment',async({page,context},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await signedIn(page,context);await page.goto('/templates');await expect(page.getByTestId('template-card')).toHaveCount(6);
 for(const t of TEMPLATES){const c=page.locator('[data-id="'+t.id+'"]');await expect(c.getByRole('img')).toBeVisible();await expect(c.getByRole('link',{name:'Start from this template',exact:true})).toHaveAttribute('href',startPath(t.id));await expect(c.getByRole('link',{name:'See how it behaves',exact:true})).toHaveAttribute('href','/examples#'+t.id);await expect(c.getByTestId('template-breaking')).toHaveText(breakingPointText(t));}
 const first=page.getByTestId('template-card').first();await first.locator('summary').focus();await page.keyboard.press('Enter');await expect(first.locator('details')).toHaveAttribute('open','');await expect(first.getByTestId('template-breaking')).toBeVisible();await page.keyboard.press('Enter');
 for(const [width,columns] of [[1440,3],[1024,2],[390,1],[320,1]]){await page.setViewportSize({width,height:1000});expect(await page.locator('.templates-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(columns);expect(await page.locator('main').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'fits '+width).toBe(true);}
 await page.setViewportSize({width:1440,height:1000});await page.locator('main').evaluate(el=>el.scrollTo(0,0));await page.screenshot({path:'../docs/audit/templates-refinement-2026-11-27/desktop-'+info.project.name+'.png',animations:'disabled'});
 await page.setViewportSize({width:390,height:844});await first.scrollIntoViewIfNeeded();await page.screenshot({path:'../docs/audit/templates-refinement-2026-11-27/mobile-'+info.project.name+'.png',animations:'disabled'});
 await page.emulateMedia({reducedMotion:'reduce'});expect(await first.evaluate(el=>getComputedStyle(el).transitionDuration)).toBe('0s');expect(errors).toEqual([]);
});
