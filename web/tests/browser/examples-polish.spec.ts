import {test,expect} from '@playwright/test';
test('Examples compact glass cards retain fitted diagrams, keyboard load controls and mobile bounds',async({page},info)=>{
 const api:string[]=[];page.on('request',r=>{if(r.url().includes('/v1/')&&!/auth\/(refresh|me)/.test(r.url()))api.push(r.url());});
 await page.goto('/examples');await expect(page.getByTestId('example-panel')).toHaveCount(6);
 await page.setViewportSize({width:1440,height:1000});const first=page.locator('#three-tier');await first.scrollIntoViewIfNeeded();
 const box=await first.boundingBox();expect(box!.width).toBeLessThan(840);expect(box!.height).toBeLessThan(720);
 await expect(first.getByRole('img')).toBeVisible();
 for(const svg of await page.getByTestId('example-panel').getByRole('img').all()){expect(await svg.evaluate(el=>{const s=el as SVGSVGElement,b=s.getBBox(),v=s.viewBox.baseVal;return b.x>=v.x&&b.y>=v.y&&b.x+b.width<=v.x+v.width&&b.y+b.height<=v.y+v.height;})).toBe(true);}
 const slider=first.getByRole('slider',{name:'Load',exact:true});await slider.focus();await page.keyboard.press('End');await expect(first.getByTestId('explorer-summary')).toContainText('misses the goal');await page.keyboard.press('Home');await expect(first.getByTestId('explorer-summary')).toContainText('meets the goal');
 await page.screenshot({path:'../docs/audit/examples-refinement-2026-11-27/card-'+info.project.name+'.png',animations:'disabled'});
 for(const width of [320,390,1024,1440]){await page.setViewportSize({width,height:900});expect(await page.locator('main').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'main fits '+width).toBe(true);}
 await page.setViewportSize({width:390,height:844});await first.scrollIntoViewIfNeeded();const diagram=first.getByRole('region',{name:/diagram, scroll to inspect/});await diagram.focus();await page.keyboard.press('ArrowRight');await expect.poll(()=>diagram.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0);expect(await page.locator('main').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);await page.screenshot({path:'../docs/audit/examples-refinement-2026-11-27/mobile-'+info.project.name+'.png',animations:'disabled'});
 await page.emulateMedia({reducedMotion:'reduce'});expect(await first.evaluate(el=>getComputedStyle(el).transitionDuration)).toBe('0s');expect(api).toEqual([]);
});
