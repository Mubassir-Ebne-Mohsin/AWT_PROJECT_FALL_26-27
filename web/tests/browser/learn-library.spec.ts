import { test, expect } from "@playwright/test";
import { TOPICS, CORE_TOPICS } from "../../src/lib/learn-content";

test("Learn library: icons, categories, search, guide check and legacy progress", async ({ page }, info) => {
 const errors: string[] = [], calls: string[] = [];
 page.on("pageerror", e => errors.push(e.message));
 page.on("request", r => { if (/\/v1\//.test(r.url())) calls.push(r.url()); });
 await page.addInitScript(() => localStorage.setItem("sf:learn:v1:guest",JSON.stringify({ opened:["caching"],passed:["caching"] })));
 await page.goto("/learn");
 await expect(page.getByTestId("learn-card")).toHaveCount(41);
 await expect(page.getByTestId("learn-tally")).toHaveText("1 of 41 opened · 1 passed");
 await page.getByRole("button", { name: "Components 12", exact:true }).click();
 await expect(page.getByTestId("learn-card")).toHaveCount(12);
 await expect(page.locator("[data-testid=learn-card] .learn-logo svg")).toHaveCount(12);
 await expect(page.locator("[data-testid=learn-card] .learn-logo svg").first()).toBeVisible();
 for (const width of [1440,1024,390,320]) {
  await page.setViewportSize({width,height:1000});
  await expect.poll(() => page.locator(".learn-library-grid").evaluate(el => getComputedStyle(el).gridTemplateColumns.split(" ").length)).toBe(width>1100?3:width>680?2:1);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath(`learn-library-${width}.png`),fullPage:true,animations:"disabled"});
 }
 await page.getByTestId("learn-card").first().scrollIntoViewIfNeeded();
 await page.screenshot({path:info.outputPath("learn-mobile-cards.png"),animations:"disabled"});
 await page.getByLabel("Find a lesson", {exact:true}).fill("no-such-learning-topic");
 await expect(page.getByTestId("learn-empty")).toBeVisible();
 await page.getByRole("button",{name:"Clear filters",exact:true}).click();
 await expect(page.getByTestId("learn-card")).toHaveCount(41);
 const link=page.getByRole("link",{name:"Clients",exact:true});
 await link.focus();await expect(link).toBeFocused();await link.click();
 await expect(page.locator("main h1")).toHaveText("Clients");
 await expect(page.getByRole("table")).toContainText("Traffic weight");
 await page.getByRole("table").scrollIntoViewIfNeeded();
 await page.screenshot({path:info.outputPath("learn-client-properties.png"),animations:"disabled"});
 await expect(page.getByTestId("demo")).toHaveCount(0);
 const topic=TOPICS.find(t=>t.id==="clients")!;
 for (const [i,q] of topic.quiz.entries()) {
  const block=page.getByTestId("question").nth(i);
  await block.getByRole("radio").nth(q.answer).check();
  await block.getByRole("button",{name:"Check answer",exact:true}).click();
 }
 await expect(page.getByTestId("check-passed")).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem("sf:learn:v1:guest")!).passed.includes("clients"))).toBe(true);
 await page.emulateMedia({reducedMotion:"reduce"});
 await expect(page.locator("main h1")).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(calls).toEqual([]);expect(errors).toEqual([]);
});

test("All 41 lesson URLs have the right heading, working related links and a check", async ({page},info) => {
 test.skip(info.project.name!=="1440-dark","Complete route inventory once; responsive coverage runs in every project.");
 const errors:string[]=[];const calls:string[]=[];
 page.on("pageerror",e=>errors.push(e.message));page.on("request",r=>{if(/\/v1\//.test(r.url()))calls.push(r.url());});
 const demos=new Set(CORE_TOPICS.map(t=>t.id));
 for(const topic of TOPICS){
  await page.goto("/learn/"+topic.id);
  await expect(page.locator("main h1")).toHaveText(topic.title);
  await expect(page.getByTestId("question")).toHaveCount(2);
  await expect(page.getByTestId("demo")).toHaveCount(demos.has(topic.id)?1:0);
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(topic.component) await expect(page.getByRole("table")).toBeVisible();
  await page.setViewportSize({width:390,height:900});
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.setViewportSize({width:1440,height:900});
  for(const id of topic.related??[]) await expect(page.locator(`a[href="/learn/${id}"]`).first()).toHaveAttribute("href","/learn/"+id);
 }
 expect(errors).toEqual([]);expect(calls).toEqual([]);
});
