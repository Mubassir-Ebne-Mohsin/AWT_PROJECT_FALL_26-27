import { test, expect } from "@playwright/test";

test("How walkthrough: native steps, model detail, responsive layout and screenshots", async ({ page }, info) => {
 const errors: string[]=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto("/how-it-works");
 await expect(page.getByRole("heading",{name:"How it works",exact:true})).toBeVisible();
 const main=page.locator("main"),jump=page.getByRole("navigation",{name:"Walkthrough steps"});
 for(const [id,label] of [["draw","Draw the system"],["demand","Define demand"],["interpret","Read the results"],["iterate","Test a change"]]) {
  await jump.getByRole("link",{name:new RegExp(label)}).click();
  const target=page.locator('#'+id+'-title');await expect(target).toBeInViewport();
  await expect.poll(()=>target.evaluate(el=>getComputedStyle(el.closest('.how-reveal')!).opacity)).toBe("1");
 }
 const detail=page.locator('[data-model-note="utilization"]');
 await detail.locator("summary").scrollIntoViewIfNeeded();await detail.locator("summary").focus();await page.keyboard.press("Enter");
 await expect(detail).toHaveAttribute("open","");await expect(detail).toContainText("Sakasegawa");
 for(const width of [320,390,1024,1440]) {
  await page.setViewportSize({width,height:900});
  expect(await main.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'main fits '+width).toBe(true);
 }
 await page.emulateMedia({reducedMotion:"reduce"});await main.evaluate(el=>el.scrollTo(0,0));
 await page.screenshot({path:'../docs/audit/how-2026-11-27/hero-'+info.project.name+'.png',animations:"disabled"});
 await page.setViewportSize({width:390,height:844});await page.locator('#demand-title').scrollIntoViewIfNeeded();
 await page.screenshot({path:'../docs/audit/how-2026-11-27/traffic-mobile-'+info.project.name+'.png',animations:"disabled"});
 expect(errors).toEqual([]);
});

test("How walkthrough: reversible scroll reveal, reduced-motion and CSS-free readable fallback",async({page})=>{
 await page.goto('/how-it-works');const main=page.locator('main'),section=page.locator('#demand');
 const supported=await page.evaluate(()=>CSS.supports('animation-timeline','view()'));
 if(supported){
  await main.evaluate(el=>{el.style.scrollBehavior='auto';el.scrollTo(0,0);});
  const before=await section.evaluate(el=>Number(getComputedStyle(el).opacity));
  await page.locator('#demand-title').scrollIntoViewIfNeeded();
  await expect.poll(()=>section.evaluate(el=>Number(getComputedStyle(el).opacity))).toBe(1);
  await main.evaluate(el=>el.scrollTo(0,0));
  await expect.poll(()=>section.evaluate(el=>Number(getComputedStyle(el).opacity))).toBe(before);
 }
 await page.emulateMedia({reducedMotion:'reduce'});
 expect(await section.evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
 expect(await section.evaluate(el=>getComputedStyle(el).opacity)).toBe('1');
 expect(await page.locator('.how-request').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
 await page.evaluate(()=>{for(const style of Array.from(document.querySelectorAll('link[rel="stylesheet"],style')))style.remove();});
 await expect(page.locator('[data-model-note="bounds"]')).toContainText('50 components and 200 connections');
 await expect(page.getByRole('link',{name:'Create an account',exact:true})).toHaveAttribute('href','/register');
});
