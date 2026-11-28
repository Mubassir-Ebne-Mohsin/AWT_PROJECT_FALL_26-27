import { Test } from "@nestjs/testing";
import { NestExpressApplication } from "@nestjs/platform-express";
import { DataSource } from "typeorm";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { AppModule } from "@/src/app.module";
import { configureApp,setupSwagger } from "@/src/app.setup";
import { dataSourceOptions } from "@/config/database.config";
import { RedisCacheService } from "@/providers/cache/redis/redis-cache.service";
import { FakeRedisCacheService } from "../test/fake-redis";
import { getTemplates } from "@/modules/simulation/engine/templates";
import { progressActivitySchema,progressDaySchema } from "@/common/contracts/phase3/progress.schema";
// Fresh isolated audit DB migrations need longer than the application's outage timeout on this laptop.
Object.assign(dataSourceOptions.extra,{statement_timeout:30000,query_timeout:32000});
jest.setTimeout(120000);
describe("Private Progress HTTP",()=>{
 let app:NestExpressApplication,db:DataSource,http:ReturnType<typeof request>;
 beforeAll(async()=>{const mod=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(RedisCacheService).useValue(new FakeRedisCacheService()).compile();app=mod.createNestApplication<NestExpressApplication>();configureApp(app);db=app.get(DataSource);await db.runMigrations();setupSwagger(app);await app.init();http=request(app.getHttpServer());});
 afterAll(async()=>{if(db?.isInitialized)await db.query("DELETE FROM design_runs WHERE payload ? 'privateGraph'");await app?.close();});
 async function account(){const r=await http.post("/v1/auth/register").send({email:randomUUID()+"@example.test",password:"Progress-test-2026!",displayName:"Progress Tester"}).expect(201);return {id:r.body.data.user.id,headers:{Authorization:"Bearer "+r.body.data.accessToken}};}
 async function design(a:Awaited<ReturnType<typeof account>>,name="Audit architecture"){const t=getTemplates().find(t=>t.id==="mvp")!;return (await http.post("/v1/designs").set(a.headers).send({schemaVersion:1,name,description:t.blurb,source:"template",templateId:t.id,graph:t.graph,traffic:t.traffic}).expect(201)).body.data;}
 async function seedRun(id:string,kind="simulation",status="completed",at=new Date().toISOString()){const runId=randomUUID();await db.query("INSERT INTO design_runs(id,design_id,request_id,status,created_at,completed_at,payload) VALUES($1,$2,$3,$4,$5,$5,$6)",[runId,id,randomUUID(),status,at,{kind,privateGraph:"must-not-leak"}]);return runId;}
 const read=(headers:Record<string,string>)=>http.get("/v1/progress/activity").set(headers);
 it("requires authentication for both reads and exposes canonical Swagger",async()=>{await http.get("/v1/progress/activity").expect(401);await http.get("/v1/progress/activity/day?date=2026-01-01").expect(401);const doc=(await http.get("/docs-json").expect(200)).body;expect(doc.paths["/v1/progress/activity"].get.security).toBeDefined();expect(doc.components.schemas.ProgressActivity).toBeDefined();});
 it("reports an empty account honestly",async()=>{const a=await account();expect(progressActivitySchema.parse((await read(a.headers).expect(200)).body.data)).toMatchObject({days:[],recent:[],designsTested:0,timeZone:"UTC"});});
 it("counts actual completed simulation and Limits runs once, including replayed admission",async()=>{
  const a=await account(),d=await design(a);
  for(const endpoint of ["simulate","limits"]){const body={expectedRevision:1,requestId:randomUUID()};const r=await http.post(`/v1/designs/${d.id}/${endpoint}`).set(a.headers).send(body).expect(202);let completed=false;for(let i=0;i<200;i++){const run=await http.get(r.body.data.statusUrl).set(a.headers).expect(200);if(run.body.data.status!=="pending"){expect(run.body.data.status).toBe("completed");completed=true;break;}await new Promise(r=>setTimeout(r,30));}expect(completed).toBe(true);await http.post(`/v1/designs/${d.id}/${endpoint}`).set(a.headers).send(body).expect(200);}
  const data=progressActivitySchema.parse((await read(a.headers).expect(200)).body.data);expect(data.designsTested).toBe(1);expect(data.days.reduce((n,d)=>n+d.simulation+d.limits,0)).toBe(2);expect(data.recent.map(e=>e.kind).sort()).toEqual(["limits","simulation"]);
 });
 it("enforces owner scope, completion/window rules and UTC day boundaries without content leaks",async()=>{
  const a=await account(),b=await account(),d=await design(a),other=await design(b,"Foreign secret title");
  const yesterday=new Date();yesterday.setUTCDate(yesterday.getUTCDate()-1);const date=yesterday.toISOString().slice(0,10);
  await seedRun(d.id,"simulation","completed",date+"T00:00:00.000Z");await seedRun(d.id,"limits","completed",date+"T23:59:59.999Z");await seedRun(d.id,"simulation","failed");await seedRun(d.id,"simulation","pending");await seedRun(d.id,"preview");await seedRun(d.id,"simulation","completed","2020-01-01T00:00:00Z");await seedRun(other.id);
  const data=progressActivitySchema.parse((await read(a.headers).expect(200)).body.data);expect(data.days).toEqual([{date,simulation:1,limits:1,challenge:0}]);expect(data.designsTested).toBe(1);expect(JSON.stringify(data)).not.toMatch(/Foreign secret|must-not-leak|privateGraph/);
  const day=progressDaySchema.parse((await http.get("/v1/progress/activity/day?date="+date).set(a.headers).expect(200)).body.data);expect(day.events).toHaveLength(2);expect(day.events.every(e=>e.at.startsWith(date))).toBe(true);
  expect((await read(b.headers).expect(200)).body.data.recent.every((e:{label:string})=>e.label==="Foreign secret title")).toBe(true);
 });
 it("counts evaluated challenge submissions but not pending work, even when the goal was not met",async()=>{
  const a=await account(),b=await account(),id=randomUUID(),attempt=randomUUID();
  await db.query("INSERT INTO challenges(id,instructor_id,title,summary,goal_p95_ms,goal_error_rate,traffic,starting_graph,status,created_at,updated_at) VALUES($1,$2,'Challenge practice','Test',300,0.01,'{}','{}','draft',now(),now())",[id,b.id]);
  await db.query("INSERT INTO challenge_attempts(id,challenge_id,learner_id) VALUES($1,$2,$3)",[attempt,id,a.id]);
  for(const status of ["completed","pending","failed"]){await db.query("INSERT INTO challenge_submissions(id,attempt_id,request_id,design_revision,snapshot,goal,status,result,created_at,completed_at) VALUES($1,$2,$3,1,'{}','{}',$4,$5,now(),now())",[randomUUID(),attempt,randomUUID(),status,{passes:false}]);}
  const data=(await read(a.headers).expect(200)).body.data;expect(data.days[0].challenge).toBe(1);expect(data.recent[0]).toMatchObject({kind:"challenge",label:"Challenge practice",href:`/challenges/${id}?attempt=${attempt}`});expect((await read(b.headers).expect(200)).body.data.days).toEqual([]);
 });
 it("bounds day details at 100, preserves full counts and rejects invalid date queries",async()=>{
  const a=await account(),d=await design(a);await db.query("INSERT INTO design_runs(id,design_id,request_id,status,created_at,completed_at,payload) SELECT gen_random_uuid(),$1,gen_random_uuid(),'completed',now(),now(),jsonb_build_object('kind','simulation') FROM generate_series(1,102)",[d.id]);
  const date=new Date().toISOString().slice(0,10);const day=progressDaySchema.parse((await http.get("/v1/progress/activity/day?date="+date).set(a.headers).expect(200)).body.data);expect(day.events).toHaveLength(100);expect(day.hasMore).toBe(true);expect((await read(a.headers).expect(200)).body.data.days[0].simulation).toBe(102);
  for(const date of ["2026-02-30","9999-01-01","2020-01-01","bad"]){await http.get("/v1/progress/activity/day?date="+date).set(a.headers).expect(422);}await http.get("/v1/progress/activity/day").set(a.headers).expect(422);
 });
});
