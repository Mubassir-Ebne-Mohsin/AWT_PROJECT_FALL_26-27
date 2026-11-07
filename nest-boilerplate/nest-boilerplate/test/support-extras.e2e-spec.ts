import { Test } from "@nestjs/testing";
import { NestExpressApplication } from "@nestjs/platform-express";
import { DataSource } from "typeorm";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { AppModule } from "@/src/app.module";
import { configureApp } from "@/src/app.setup";
import { RedisCacheService } from "@/providers/cache/redis/redis-cache.service";
import { FakeRedisCacheService } from "../test/fake-redis";
import { AccountRolesService,OPERATOR } from "@/modules/roles/account-roles.service";
import { NotificationsService } from "@/modules/notifications/notifications.service";
import { SupportExtras1794900000000 } from "@/database/migrations/1794900000000-SupportExtras";
jest.setTimeout(120000);
type User={id:string;token:string;email:string};
describe("E saved replies and strictly private duplicate reports",()=>{
 let app:NestExpressApplication,db:DataSource,http:ReturnType<typeof request>,roles:AccountRolesService;
 let a:User,b:User,s:User,t:User,admin:User;
 const headers=(u:User)=>({Authorization:'Bearer '+u.token});
 const detail=async(id:string)=>(await http.get('/v1/support/inbox/'+id).set(headers(s)).expect(200)).body.data;
 async function account(role?:'support'|'admin'){const email='extras-'+randomUUID()+'@example.test';const res=await http.post('/v1/auth/register').send({email,password:'Support-E-Only-2026!',displayName:role?'PRIVATE STAFF':'PRIVATE REPORTER '+email.slice(0,16)}).expect(201);const u={id:res.body.data.user.id,token:res.body.data.accessToken,email};if(role)await roles.grant(OPERATOR,u.id,{role});return u;}
 async function report(u:User){const [r]=await db.query("INSERT INTO support_tickets(author_id,category,title,body,context,created_at,updated_at,last_user_activity_at) VALUES($1,'bug',$2,$3,'{}',date_trunc('milliseconds',now()),date_trunc('milliseconds',now()),date_trunc('milliseconds',now())) RETURNING *",[u.id,'PRIVATE TITLE '+randomUUID(),'PRIVATE BODY '+u.email]);return r;}
 async function saved(u:User,scope='personal',body='Hello {name}, about {code}. {unknown}'){return(await http.post('/v1/support/saved-replies').set(headers(u)).send({scope,title:'Saved answer '+randomUUID().slice(0,6),body}).expect(201)).body.data;}
 async function merge(source:string,target:string){const x=await detail(source),y=await detail(target);return http.post('/v1/support/inbox/'+source+'/merge').set(headers(s)).send({targetId:target,expectedUpdatedAt:x.updatedAt,targetUpdatedAt:y.updatedAt});}
 beforeAll(async()=>{const mod=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(RedisCacheService).useValue(new FakeRedisCacheService()).compile();app=mod.createNestApplication<NestExpressApplication>();configureApp(app);db=app.get(DataSource);await db.runMigrations();await app.listen(0,"127.0.0.1");http=request(app.getHttpServer());roles=app.get(AccountRolesService);a=await account();b=await account();s=await account('support');t=await account('support');admin=await account('admin');});
 afterAll(async()=>{if(app)await app.close();});
 it('denies anonymous, normal and Admin-only saved/merge access, including when a Support role is revoked',async()=>{
  await http.get('/v1/support/saved-replies').expect(401);
  for(const u of [a,b,admin]){await http.get('/v1/support/saved-replies').set(headers(u)).expect(403);await http.post('/v1/support/inbox/'+randomUUID()+'/merge').set(headers(u)).send({}).expect(403);}
  const revoked=await account('support');await db.query("DELETE FROM user_roles WHERE user_id=$1 AND role='support'",[revoked.id]);await http.get('/v1/support/saved-replies').set(headers(revoked)).expect(403);
 });
 it('keeps personal templates private and allows another Support agent to edit/delete a team template with append-only metadata audit',async()=>{
  const own=await saved(s),team=await saved(s,'team');
  const list=(await http.get('/v1/support/saved-replies').set(headers(t)).expect(200)).body.data;expect(list.some((x:any)=>x.id===own.id)).toBe(false);expect(list.some((x:any)=>x.id===team.id)).toBe(true);
  await http.patch('/v1/support/saved-replies/'+own.id).set(headers(t)).send({title:'Stolen',body:'No',expectedUpdatedAt:own.updatedAt}).expect(404);
  const edit=(await http.patch('/v1/support/saved-replies/'+team.id).set(headers(t)).send({title:'Updated team',body:'Plain <script>text</script>',expectedUpdatedAt:team.updatedAt}).expect(200)).body.data;
  await http.delete('/v1/support/saved-replies/'+team.id).set(headers(t)).send({expectedUpdatedAt:edit.updatedAt}).expect(200);
  const logs=await db.query("SELECT * FROM support_activity WHERE to_value=$1 ORDER BY seq",[team.id]);expect(logs.map((x:any)=>x.action)).toEqual(['saved_create','saved_update','saved_delete']);expect(JSON.stringify(logs)).not.toContain('Plain <script>');await expect(db.query('DELETE FROM support_activity WHERE id=$1',[logs[0].id])).rejects.toThrow('append-only');
 });
 it('expands only code/name non-recursively, never sends, refuses stale expansion and overlong results',async()=>{
  const r=await report(a),tpl=await saved(s);await db.query('UPDATE users SET display_name=$2 WHERE id=$1',[a.id,'$& {code}']);
  const count=(await db.query('SELECT count(*)::int AS n FROM support_messages WHERE ticket_id=$1',[r.id]))[0].n;
  const preview=(await http.post('/v1/support/saved-replies/'+tpl.id+'/preview').set(headers(s)).send({ticketId:r.id,expectedUpdatedAt:tpl.updatedAt}).expect(200)).body.data;
  expect(preview.body).toBe(`Hello $& {code}, about SF-${r.ref}. {unknown}`);expect((await db.query('SELECT count(*)::int AS n FROM support_messages WHERE ticket_id=$1',[r.id]))[0].n).toBe(count);
  await http.post('/v1/support/saved-replies/'+tpl.id+'/preview').set(headers(t)).send({ticketId:r.id,expectedUpdatedAt:tpl.updatedAt}).expect(404);
  const gone=await account(),orphan=await report(gone);await db.query('DELETE FROM users WHERE id=$1',[gone.id]);const fallback=await http.post('/v1/support/saved-replies/'+tpl.id+'/preview').set(headers(s)).send({ticketId:orphan.id,expectedUpdatedAt:tpl.updatedAt}).expect(200);expect(fallback.body.data.body).toBe(`Hello there, about SF-${orphan.ref}. {unknown}`);
  const long=await saved(s,'personal','{name}'.repeat(650));await db.query('UPDATE users SET display_name=$2 WHERE id=$1',[a.id,'x'.repeat(60)]);await http.post('/v1/support/saved-replies/'+long.id+'/preview').set(headers(s)).send({ticketId:r.id,expectedUpdatedAt:long.updatedAt}).expect(422);
 });
 it('validates all fields and preserves the first edit when two agents save the same team revision',async()=>{
  await http.post('/v1/support/saved-replies').set(headers(s)).send({scope:'team',title:'Valid',body:'x',ownerId:a.id}).expect(422);
  await http.post('/v1/support/saved-replies').set(headers(s)).send({scope:'team',title:'Valid',body:'bad\u0000text'}).expect(422);
  const tpl=await saved(s,'team');await http.patch('/v1/support/saved-replies/'+tpl.id).set(headers(s)).send({title:'Scope theft',body:'No',scope:'personal',expectedUpdatedAt:tpl.updatedAt}).expect(422);const results=await Promise.all([s,t].map(u=>http.patch('/v1/support/saved-replies/'+tpl.id).set(headers(u)).send({title:'Race winner',body:u.id,expectedUpdatedAt:tpl.updatedAt})));expect(results.map(x=>x.status).sort()).toEqual([200,409]);
  await http.delete('/v1/support/saved-replies/'+tpl.id).set(headers(s)).send({expectedUpdatedAt:tpl.updatedAt}).expect(409);
 });
 it('serializes personal/team capacity limits even for simultaneous creates',async()=>{
  const u=await account('support');await db.query("INSERT INTO support_saved_replies(owner_id,scope,title,body) SELECT $1,'personal','Seed','Body' FROM generate_series(1,49)",[u.id]);
  const req=()=>http.post('/v1/support/saved-replies').set(headers(u)).send({scope:'personal',title:'Last slot',body:'body'});const got=await Promise.all([req(),req()]);expect(got.map(x=>x.status).sort()).toEqual([201,409]);
  const [{n}]=await db.query("SELECT count(*)::int AS n FROM support_saved_replies WHERE scope='team'");await db.query("INSERT INTO support_saved_replies(owner_id,scope,title,body) SELECT $1,'team','Seed','Body' FROM generate_series(1,$2::int)",[u.id,99-n]);
  const results=await Promise.all([s,t].map(v=>http.post('/v1/support/saved-replies').set(headers(v)).send({scope:'team',title:'Last team slot',body:'body'})));expect(results.map(x=>x.status).sort()).toEqual([201,409]);
  await db.query('DELETE FROM users WHERE id=$1',[u.id]);expect((await db.query('SELECT count(*)::int AS n FROM support_saved_replies WHERE owner_id=$1',[u.id]))[0].n).toBe(0);
 });
 it('merges without copying bodies/names/notes; survivor links and writes resolve only the caller’s private conversation',async()=>{
  const x=await report(a),y=await report(b);
  for(const [id,body,internal] of [[x.id,'PRIVATE SOURCE NOTE',true],[y.id,'PRIVATE TARGET NOTE',true],[y.id,'PRIVATE TARGET REPLY',false]] as const){await http.post('/v1/support/inbox/'+id+'/messages').set(headers(s)).send({body,internal}).expect(201);}
  await merge(x.id,y.id).then(r=>expect(r.status).toBe(200));
  expect((await db.query('SELECT first_response_at FROM support_tickets WHERE id=$1',[x.id]))[0].first_response_at).toBeNull();
  const own=(await http.get('/v1/support/reports/'+x.id).set(headers(a)).expect(200)).body.data;expect(own.status).toBe('resolved');expect(own.mergedInto).toEqual({id:y.id,code:`SF-${y.ref}`});expect(JSON.stringify(own)).not.toContain(b.email);expect(JSON.stringify(own)).not.toContain('PRIVATE TARGET');expect(JSON.stringify(own)).not.toContain('PRIVATE SOURCE NOTE');
  const alias=(await http.get('/v1/support/reports/'+y.id).set(headers(a)).expect(200)).body.data;expect(alias.id).toBe(x.id);expect(alias.body).toBe(x.body);
  await http.post('/v1/support/reports/'+y.id+'/messages').set(headers(a)).send({body:'PRIVATE FOLLOWUP FROM A'}).expect(201);
  const target=(await http.get('/v1/support/reports/'+y.id).set(headers(b)).expect(200)).body.data;expect(JSON.stringify(target)).not.toContain('PRIVATE FOLLOWUP FROM A');expect(JSON.stringify(target)).not.toContain(a.email);expect(JSON.stringify(target)).not.toContain(x.title);expect(JSON.stringify(target)).not.toContain('PRIVATE TARGET NOTE');
  expect((await detail(y.id)).duplicates).toContainEqual({id:x.id,code:`SF-${x.ref}`});expect((await detail(x.id)).status).toBe('resolved');
  await http.patch('/v1/support/inbox/'+x.id).set(headers(s)).send({status:'open'}).expect(409);
  const latest=await detail(x.id);await http.post('/v1/support/inbox/'+x.id+'/unmerge').set(headers(t)).send({expectedUpdatedAt:latest.updatedAt}).expect(200);await http.get('/v1/support/reports/'+y.id).set(headers(a)).expect(404);expect((await detail(x.id)).status).toBe('open');
  const events=await db.query("SELECT action FROM support_activity WHERE ticket_id=$1 AND action IN ('merge','unmerge') ORDER BY seq",[x.id]);expect(events.map((e:any)=>e.action)).toEqual(['merge','unmerge']);
 });
 it('forbids self, missing targets, both chain directions, stale proposals and direct database cycles',async()=>{
  const x=await report(a),y=await report(b),z=await report(a);expect((await merge(x.id,x.id)).status).toBe(409);
  const d=await detail(x.id);await http.post('/v1/support/inbox/'+x.id+'/merge').set(headers(s)).send({targetId:randomUUID(),expectedUpdatedAt:d.updatedAt,targetUpdatedAt:d.updatedAt}).expect(404);
  await http.post('/v1/support/inbox/'+x.id+'/merge').set(headers(s)).send({targetId:y.id,expectedUpdatedAt:'2000-01-01T00:00:00.000Z',targetUpdatedAt:(await detail(y.id)).updatedAt}).expect(409);
  expect((await merge(x.id,y.id)).status).toBe(200);expect((await merge(y.id,z.id)).status).toBe(409);expect((await merge(z.id,x.id)).status).toBe(409);
  await expect(db.query("UPDATE support_tickets SET merged_into_id=$2,status='resolved',resolved_at=now() WHERE id=$1",[y.id,x.id])).rejects.toThrow();
 });
 it('serializes opposite concurrent merge requests so at most one succeeds and no cycle can exist',async()=>{
  const x=await report(a),y=await report(b),dx=await detail(x.id),dy=await detail(y.id);
  const results=await Promise.all([http.post('/v1/support/inbox/'+x.id+'/merge').set(headers(s)).send({targetId:y.id,expectedUpdatedAt:dx.updatedAt,targetUpdatedAt:dy.updatedAt}),http.post('/v1/support/inbox/'+y.id+'/merge').set(headers(t)).send({targetId:x.id,expectedUpdatedAt:dy.updatedAt,targetUpdatedAt:dx.updatedAt})]);expect(results.map(r=>r.status).sort()).toEqual([200,409]);
  const [{n}]=await db.query('SELECT count(*)::int AS n FROM support_tickets WHERE id=ANY($1::uuid[]) AND merged_into_id IS NOT NULL',[[x.id,y.id]]);expect(n).toBe(1);
 });
 it('rolls back merge, system message and audit when the transactional notification insert fails',async()=>{
  const x=await report(a),y=await report(b);const fault=jest.spyOn(app.get(NotificationsService),'emit').mockRejectedValueOnce(new Error('deliberate event failure'));
  try{expect((await merge(x.id,y.id)).status).toBe(500);}finally{fault.mockRestore();}
  expect((await detail(x.id)).mergedInto).toBeNull();expect((await db.query('SELECT count(*)::int AS n FROM support_messages WHERE ticket_id=$1',[x.id]))[0].n).toBe(0);expect((await db.query("SELECT count(*)::int AS n FROM support_activity WHERE ticket_id=$1 AND action='merge'",[x.id]))[0].n).toBe(0);
 });
 it('exports only owned personal replies and own report content, never shared/private-other conversations',async()=>{
  const own=await saved(s),other=await saved(t);const out=(await http.get('/v1/account/export').set(headers(s)).expect(200)).body.data;
  expect(out.personalSavedReplies.some((r:any)=>r.id===own.id)).toBe(true);expect(out.personalSavedReplies.some((r:any)=>r.id===other.id)).toBe(false);expect(out.personalSavedReplies.every((r:any)=>r.scope==='personal')).toBe(true);
 });
 it('refuses a populated rollback, and empty migration goes down/up in a guarded temporary schema',async()=>{
  const migration=new SupportExtras1794900000000(),qr=db.createQueryRunner();await qr.connect();try{await qr.startTransaction();await expect(migration.down(qr)).rejects.toThrow('Cannot undo SupportExtras');await qr.rollbackTransaction();}finally{await qr.release();}
  const name='sf_support_e_mig_'+randomUUID().replace(/-/g,'').slice(0,10),q=db.createQueryRunner();await q.connect();
  try{
   await q.query('CREATE SCHEMA '+name);await q.query('SET search_path TO '+name+',public');
   await q.query('CREATE TABLE users(id uuid PRIMARY KEY)');
   await q.query('CREATE TABLE support_tickets(id uuid PRIMARY KEY,status varchar(12) NOT NULL)');
   await q.query("CREATE TABLE support_activity(id uuid PRIMARY KEY,ticket_id uuid NOT NULL,ticket_ref integer NOT NULL,action varchar(12) NOT NULL CONSTRAINT support_activity_action_check CHECK(action IN ('create','reply','note','status','priority','assign','reopen')))");
   await migration.up(q);expect((await q.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema=$1 AND table_name='support_saved_replies'",[name]))[0].n).toBe(1);
   await migration.down(q);expect((await q.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema=$1 AND table_name='support_saved_replies'",[name]))[0].n).toBe(0);
   await migration.up(q);expect((await q.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema=$1 AND table_name='support_tickets' AND column_name='merged_into_id'",[name]))[0].n).toBe(1);
   await q.query("INSERT INTO support_activity(id,ticket_id,ticket_ref,action) VALUES($1,NULL,NULL,'saved_update')",[randomUUID()]);await expect(migration.down(q)).rejects.toThrow('Cannot undo SupportExtras');
  }finally{await q.query('SET search_path TO public');await q.query('DROP SCHEMA IF EXISTS '+name+' CASCADE');await q.release();}
 });
});
