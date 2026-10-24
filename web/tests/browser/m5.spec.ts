import {test,expect,Page} from "@playwright/test";
const api=process.env.SF_API_URL??"http://localhost:5001/v1";
async function setup(page:Page,tag:string,blank=false){
 await page.goto("/register");await page.getByLabel("Name",{exact:true}).fill("M5 Canvas");
 await page.getByLabel("Email",{exact:true}).fill("m5-"+Date.now()+"-"+tag+"@example.test");await page.getByLabel("Password",{exact:true}).fill("M5-Canvas-2026!");
 await page.locator("#reg-terms").check();const response=page.waitForResponse(r=>r.url()===api+"/auth/register"&&r.status()===201);
 await page.getByRole("button",{name:"Create account",exact:true}).click();const token=(await(await response).json()).data.accessToken;
 await expect(page.getByRole("button",{name:"Account menu",exact:true})).toBeVisible();
 if(blank){await page.goto("/new/blank");await page.getByLabel("Start with",{exact:true}).selectOption("empty");await page.getByRole("button",{name:"Create blank design",exact:true}).click();}
 else{await page.goto("/new/template");await page.getByRole("button",{name:"Use Single-server MVP",exact:true}).click();}
 await expect(page.getByRole("region",{name:"Architecture canvas",exact:true})).toBeVisible();
 await expect(page.getByRole("button",{name:"Add App server",exact:true})).toBeEnabled();
 const id=new URL(page.url()).pathname.split("/")[2],headers={Authorization:"Bearer "+token};
 const read=async()=>(await(await page.request.get(api+"/designs/"+id,{headers})).json()).data;
 return {id,headers,read};
}
async function saved(page:Page){await expect(page.getByRole("status").filter({hasText:/^Saved/})).toBeVisible();}
test("M5 zoomed drag commits once, keyboard movement persists and layout preserves model inputs",async({page},info)=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
 const {id,read}=await setup(page,info.project.name);
 await page.getByRole("button",{name:"Run test",exact:true}).click();await expect(page.getByRole("heading",{name:"Model results",exact:true})).toBeVisible();
 await page.getByRole("link",{name:"Edit",exact:true}).click();await expect(page.getByRole("region",{name:"Architecture canvas",exact:true})).toBeVisible();
 const before=await read(),app=before.graph.nodes.find((n:{type:string})=>n.type==="app");
 let writes=0;page.on("request",r=>{if(r.url()===api+"/designs/"+id&&r.method()==="PATCH")writes++;});
 const surface=page.getByRole("region",{name:"Architecture canvas",exact:true});await surface.scrollIntoViewIfNeeded();const surfaceBox=(await surface.boundingBox())!;
 await page.mouse.move(surfaceBox.x+surfaceBox.width*.5,surfaceBox.y+90);await page.mouse.down();await page.mouse.move(surfaceBox.x+surfaceBox.width*.5+65,surfaceBox.y+115,{steps:10});await page.mouse.up();
 await page.getByRole("button",{name:"Zoom out",exact:true}).click();await page.getByRole("button",{name:"Zoom out",exact:true}).click();
 await page.getByRole("button",{name:"Fit to screen",exact:true}).click();await page.getByRole("button",{name:"Zoom out",exact:true}).click();
 await page.waitForTimeout(850);expect(writes).toBe(0);
 const zoom=Number((await page.getByLabel("Canvas zoom",{exact:true}).textContent())!.replace("%",""))/100;
 const element=page.locator('[data-node="'+app.id+'"]');await element.scrollIntoViewIfNeeded();const box=(await element.boundingBox())!;
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
 await page.mouse.move(box.x+box.width/2+72,box.y+box.height/2+36,{steps:16});await page.waitForTimeout(1000);
 expect(writes).toBe(0);await expect(page.getByRole("button",{name:"Run test",exact:true})).toBeDisabled();
 await page.mouse.up();await saved(page);expect(writes).toBe(1);
 const moved=await read(),node=moved.graph.nodes.find((n:{id:string})=>n.id===app.id);
 expect(Math.abs(node.x-(app.x+72/zoom))).toBeLessThanOrEqual(8);expect(node.x%12).toBe(0);
 await expect(page.getByText(/Stale result/)).toHaveCount(0);
 await page.getByRole("region",{name:"Architecture canvas",exact:true}).focus();await page.keyboard.press("Shift+ArrowRight");await saved(page);
 expect((await read()).graph.nodes.find((n:{id:string})=>n.id===app.id).x).toBe(node.x+48);
 await page.reload();await expect(page.getByTestId("node-position")).toContainText("x "+(node.x+48));
 await expect(page.getByText(/Stale result/)).toHaveCount(0);
 await page.getByLabel("Replicas (1–200)",{exact:true}).fill("3");await saved(page);await expect(page.getByText(/Stale result/)).toBeVisible();
 await page.getByRole("button",{name:"Fit to screen",exact:true}).click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:"../docs/audit/m5-canvas-"+info.project.name+".png",fullPage:true});
 expect(errors).toEqual([]);
});
test("M5 all twelve types persist with their allowed property controls",async({page},info)=>{
 const {read}=await setup(page,"types-"+info.project.name,true);
 const names=["Clients","CDN","Load balancer","API gateway","App server","Worker","Cache","Database","Read replica","Queue","Object storage","Third-party API"];
 for(const name of names)await page.getByRole("button",{name:"Add "+name,exact:true}).click();
 await saved(page);expect((await read()).graph.nodes).toHaveLength(12);
 await page.getByLabel("Component",{exact:true}).selectOption({label:"CDN"});
 await expect(page.getByLabel("Region",{exact:true})).toHaveCount(0);
 await page.getByLabel("Hit rate (%)",{exact:true}).fill("75");await saved(page);
 expect((await read()).graph.nodes.find((n:{type:string})=>n.type==="cdn").props.hitRatio).toBe(.75);
 await page.getByLabel("Component",{exact:true}).selectOption({label:"Clients"});
 await expect(page.getByLabel("Replicas (1–200)",{exact:true})).toHaveCount(0);
 await page.getByLabel("Region",{exact:true}).selectOption("ap-south");await page.getByLabel("Traffic weight",{exact:true}).fill("2.5");await saved(page);
 await page.getByLabel("Component",{exact:true}).selectOption({label:"Queue"});await page.getByLabel("Max messages",{exact:true}).fill("12345");await saved(page);
 await page.getByLabel("Component",{exact:true}).selectOption({label:"App server"});
 const previous=(await read()).revision;await page.getByLabel("Replicas (1–200)",{exact:true}).fill("1.5");
 await expect(page.getByLabel("Replicas (1–200)",{exact:true})).toHaveAttribute("aria-invalid","true");
 await expect(page.getByRole("button",{name:"Save",exact:true})).toBeDisabled();await expect(page.getByRole("button",{name:"Run test",exact:true})).toBeDisabled();
 await page.waitForTimeout(900);expect((await read()).revision).toBe(previous);
 await page.getByLabel("Replicas (1–200)",{exact:true}).fill("200");await saved(page);
 const graph=(await read()).graph;expect(graph.nodes.find((n:{type:string})=>n.type==="client").props.share).toBe(2.5);expect(graph.nodes.find((n:{type:string})=>n.type==="queue").props.maxDepth).toBe(12345);
 await page.reload();await expect(page.getByLabel("Component",{exact:true}).locator("option")).toHaveCount(13);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
test("M5 cancelled drag and view changes do not save; failed move remains recoverable",async({page},info)=>{
 const {id,read}=await setup(page,"cancel-"+info.project.name),before=await read(),app=before.graph.nodes.find((n:{type:string})=>n.type==="app");
 const element=page.locator('[data-node="'+app.id+'"]');await element.scrollIntoViewIfNeeded();const box=(await element.boundingBox())!;
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+50,box.y+box.height/2+40,{steps:8});
 await page.keyboard.press("Escape");await page.mouse.up();await page.waitForTimeout(900);expect((await read()).revision).toBe(before.revision);
 const again=(await element.boundingBox())!;await page.mouse.move(again.x+again.width/2,again.y+again.height/2);await page.mouse.down();await page.mouse.move(again.x+again.width/2+40,again.y+again.height/2+24,{steps:5});
 await page.keyboard.press("Control+k");await expect(page.getByRole("combobox",{name:"Command palette",exact:true})).toBeVisible();await page.mouse.up();await page.keyboard.press("Escape");await page.waitForTimeout(850);expect((await read()).revision).toBe(before.revision);
 const canvas=page.getByRole("region",{name:"Architecture canvas",exact:true});await canvas.focus();await page.keyboard.press("f");await page.keyboard.press("+");await page.waitForTimeout(850);expect((await read()).revision).toBe(before.revision);
 await page.route(api+"/designs/"+id,async route=>{if(route.request().method()==="PATCH")await route.fulfill({status:503,json:{error:{code:"UNAVAILABLE",message:"M5 save outage"}}});else await route.continue();});
 await page.getByRole("button",{name:"Move Right",exact:true}).click();await expect(page.locator("main [role=alert]").filter({hasText:"M5 save outage"})).toBeVisible();await expect(page.getByTestId("node-position")).toContainText("x "+(app.x+12));
 await page.unroute(api+"/designs/"+id);await page.getByRole("button",{name:"Save",exact:true}).click();await saved(page);expect((await read()).graph.nodes.find((n:{id:string})=>n.id===app.id).x).toBe(app.x+12);
});

test("M5 palette drag respects the zoomed viewport and cancelled drops create nothing",async({page},info)=>{
 const {id,read}=await setup(page,"drop-"+info.project.name,true);
 const canvas=page.getByRole("region",{name:"Architecture canvas",exact:true});await canvas.scrollIntoViewIfNeeded();
 const surface=page.getByRole("region",{name:"Architecture canvas",exact:true});await surface.scrollIntoViewIfNeeded();const surfaceBox=(await surface.boundingBox())!;
 await page.mouse.move(surfaceBox.x+surfaceBox.width*.5,surfaceBox.y+90);await page.mouse.down();await page.mouse.move(surfaceBox.x+surfaceBox.width*.5+65,surfaceBox.y+115,{steps:10});await page.mouse.up();
 await page.getByRole("button",{name:"Zoom out",exact:true}).click();await page.getByRole("button",{name:"Zoom out",exact:true}).click();
 const cb=(await canvas.boundingBox())!,transform=(await page.locator(".cv-svg > g").getAttribute("transform"))!;
 const values=transform.match(/-?[\d.]+/g)!.map(Number),target={x:cb.x+cb.width*.55,y:cb.y+cb.height*.45};
 const expected={x:Math.round(((target.x-cb.x-values[0])/values[2])/12)*12,y:Math.round(((target.y-cb.y-values[1])/values[2])/12)*12};
 let writes=0;page.on("request",r=>{if(r.url()===api+"/designs/"+id&&r.method()==="PATCH")writes++;});
 const source=page.getByRole("button",{name:"Add Clients",exact:true});await source.scrollIntoViewIfNeeded();const sb=(await source.boundingBox())!;
 await page.mouse.move(sb.x+sb.width/2,sb.y+sb.height/2);await page.mouse.down();await page.mouse.move(target.x,target.y,{steps:12});await page.waitForTimeout(900);expect(writes).toBe(0);await page.mouse.up();await saved(page);
 const one=(await read()).graph.nodes;expect(one).toHaveLength(1);expect(one[0].x).toBe(expected.x);expect(one[0].y).toBe(expected.y);expect(writes).toBe(1);
 const app=page.getByRole("button",{name:"Add App server",exact:true});await app.scrollIntoViewIfNeeded();const ab=(await app.boundingBox())!;
 await page.mouse.move(ab.x+ab.width/2,ab.y+ab.height/2);await page.mouse.down();await page.mouse.move(500,10,{steps:10});await page.mouse.up();await page.waitForTimeout(850);
 expect((await read()).graph.nodes).toHaveLength(1);
 await page.mouse.move(ab.x+ab.width/2,ab.y+ab.height/2);await page.mouse.down();await page.mouse.move(target.x,target.y,{steps:10});await page.keyboard.press("Escape");await page.mouse.up();await page.waitForTimeout(850);
 expect((await read()).graph.nodes).toHaveLength(1);
 await app.focus();await page.keyboard.press("Enter");await saved(page);expect((await read()).graph.nodes).toHaveLength(2);
});
test("M5 50-node/200-edge graph stays navigable without view-triggered requests",async({page},info)=>{
 const {headers}=await setup(page,"bounds-"+info.project.name);
 const catalog=(await(await page.request.get(api+"/simulation/catalog",{headers})).json()).data;
 const nodes=Array.from({length:50},(_,i)=>({id:"node"+i,type:i===0?"client":"app",label:"Node "+i,x:(i%10)*240-480,y:Math.floor(i/10)*110-220,props:{}}));
 const edges=[];for(let a=0;a<50&&edges.length<200;a++)for(let b=0;b<50&&edges.length<200;b++)if(a!==b)edges.push({id:"edge"+edges.length,from:"node"+a,to:"node"+b});
 const response=await page.request.post(api+"/designs",{headers,data:{schemaVersion:1,name:"M5 bounded graph",description:"",source:"blank",templateId:null,graph:{nodes,edges},traffic:catalog.trafficDefaults}});
 expect(response.status()).toBe(201);const id=(await response.json()).data.id;
 await page.goto("/designs/"+id+"/edit");await expect(page.locator("[data-node]")).toHaveCount(50);await expect(page.locator(".cv-edge")).toHaveCount(200);
 await expect(page.getByRole("button",{name:"Add App server",exact:true})).toBeDisabled();
 let writes=0;page.on("request",r=>{if(r.url()===api+"/designs/"+id&&r.method()==="PATCH")writes++;});
 await page.getByLabel("Component",{exact:true}).selectOption({label:"Node 49"});
 await page.getByRole("button",{name:"Focus selected component",exact:true}).click();
 const selected=(await page.locator('[data-node="node49"]').boundingBox())!,canvas=(await page.getByRole("region",{name:"Architecture canvas",exact:true}).boundingBox())!;
 expect(selected.x).toBeGreaterThanOrEqual(canvas.x);expect(selected.x+selected.width).toBeLessThanOrEqual(canvas.x+canvas.width+1);
 for(let i=0;i<4;i++)await page.getByRole("button",{name:"Zoom out",exact:true}).click();
 await page.getByRole("button",{name:"Fit to screen",exact:true}).click();
 const sample=await page.evaluate(()=>new Promise<{frames:number;maxGapMs:number}>(resolve=>{let frames=0,previous=performance.now(),maxGapMs=0;const tick=(now:number)=>{maxGapMs=Math.max(maxGapMs,now-previous);previous=now;if(++frames>=12)resolve({frames,maxGapMs});else requestAnimationFrame(tick);};requestAnimationFrame(tick);}));
 await info.attach("bounded-canvas-frame-sample",{body:JSON.stringify(sample),contentType:"application/json"});
 expect(sample.frames).toBe(12);expect(sample.maxGapMs).toBeLessThan(1000);
 await page.waitForTimeout(850);expect(writes).toBe(0);expect((await page.request.get(api+"/health")).status()).toBe(200);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

test("M5 a remote revision held during dragging is adopted after cancellation",async({page},info)=>{
 const {id,headers,read}=await setup(page,"remote-"+info.project.name),initial=await read(),app=initial.graph.nodes.find((n:{type:string})=>n.type==="app");
 const node=page.locator('[data-node="'+app.id+'"]');await node.scrollIntoViewIfNeeded();const b=(await node.boundingBox())!;
 await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2+48,b.y+b.height/2+24,{steps:8});
 const changed=await page.request.patch(api+"/designs/"+id,{headers,data:{expectedRevision:initial.revision,name:"Remote while dragging"}});expect(changed.status()).toBe(200);
 const refetched=page.waitForResponse(r=>r.url()===api+"/designs/"+id&&r.request().method()==="GET"&&r.status()===200);
 await page.evaluate(()=>window.dispatchEvent(new Event("visibilitychange")));await refetched;
 await expect(page.getByLabel("Design name",{exact:true})).toHaveValue(initial.name);
 await page.keyboard.press("Escape");await page.mouse.up();
 await expect(page.getByLabel("Design name",{exact:true})).toHaveValue("Remote while dragging");await saved(page);
 expect((await read()).revision).toBe(initial.revision+1);
});
