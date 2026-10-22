/** Phase 1 audit regressions. No application edits, network calls or stored credentials.
 * Run from the project root after building the backend:
 * node docs/audit/phase1-regressions.cjs
 * Failing assertions describe requirements that still need fixes; do not weaken them.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const root = path.resolve(__dirname, '../..');
const backend = path.join(root, 'nest-boilerplate/nest-boilerplate');
const req = createRequire(path.join(backend, 'package.json'));
process.env.NODE_ENV='test';
process.env.DB_USER='audit'; process.env.DB_PASSWORD='audit'; process.env.DB_DATABASE='audit';
process.env.JWT_ACCESS_SECRET='audit-only-access-secret-at-least-32-chars';
process.env.JWT_REFRESH_SECRET='audit-only-refresh-secret-at-least-32-chars';
const {JwtService}=req('@nestjs/jwt');
const {AuthService}=require(path.join(backend,'dist/modules/auth/auth.service.js'));
const {TokenStore}=require(path.join(backend,'dist/modules/auth/token-store.service.js'));
const {appConfig}=require(path.join(backend,'dist/config/app.config.js'));
const {RolesGuard}=require(path.join(backend,'dist/common/guard/roles.guard.js'));
const {AllExceptionsFilter}=require(path.join(backend,'dist/common/filters/all-exceptions.filter.js'));
const {BadRequestException}=req('@nestjs/common');
const results=[];
async function check(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',reason:e.message.split('\n')[0]});}}
function service(){
 const entries=new Map();
 const redis={getClient:()=>({set:async(k,v,o)=>{const e=entries.get(k);if(o.NX&&e&&e>Date.now())return null;entries.set(k,Date.now()+o.EX*1000);return 'OK';},exists:async k=>(entries.get(k)||0)>Date.now()?1:0})};
 const user={id:'11111111-1111-4111-8111-111111111111',email:'audit@example.com',displayName:'Audit',role:'user'};
 return {auth:new AuthService({findById:async()=>user},new JwtService({secret:process.env.JWT_ACCESS_SECRET}),new TokenStore(redis)),user};
}
function client(responses){
 const ts=req('typescript'); const cache=new Map(); const events=[]; let hints=0;
 const eventBus={emit:n=>events.push(n)};
 const load=file=>{if(cache.has(file))return cache.get(file).exports;const m={exports:{}};cache.set(file,m);
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const fakeRequire=n=>{if(n==='@/lib/api/events')return {apiEvents:eventBus};if(n==='@/lib/session-hint')return {setSessionHint:()=>hints++,clearSessionHint:()=>hints--};if(n.startsWith('@/'))return load(path.join(root,'web/src',n.slice(2)+'.ts'));return req(n);};
 vm.runInNewContext('(function(require,module,exports){'+code+'\n})',{process:{env:{}},AbortSignal,fetch:async()=>{const r=responses.shift();if(!r)throw Error('unexpected fetch');return r;},Map,Set,Promise})(fakeRequire,m,m.exports);return m.exports;};
 const c=load(path.join(root,'web/src/lib/api/client.ts'));
 c.adoptSession({accessToken:'audit-access',user:{id:'audit',email:'audit@example.com'},expiresIn:900});
 return {c,events,hints:()=>hints};
}
const response=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
const expired=()=>response(401,{error:{code:'SESSION_EXPIRED',message:'expired'}});
(async()=>{
 await check('roles hierarchy: ADMIN satisfies USER; USER cannot satisfy ADMIN',()=>{
  const ctx=role=>({getHandler:()=>null,getClass:()=>null,switchToHttp:()=>({getRequest:()=>({user:{role}})})});
  assert.equal(new RolesGuard({getAllAndOverride:()=>['user']}).canActivate(ctx('admin')),true);
  assert.throws(()=>new RolesGuard({getAllAndOverride:()=>['admin']}).canActivate(ctx('user')),e=>e.code==='FORBIDDEN');
 });
 await check('family revocation lasts through the latest rotated refresh expiry',async()=>{
  const saved=Date.now, ttl=appConfig.env.JWT_REFRESH_TTL_SECONDS; let now=Math.floor(saved()/1000)*1000;
  Date.now=()=>now; appConfig.env.JWT_REFRESH_TTL_SECONDS=10;
  try{const {auth,user}=service();const original=await auth.issue(user,'audit-family');now+=9000;const rotated=await auth.refresh(original.refreshToken);
  await assert.rejects(()=>auth.refresh(original.refreshToken));now+=2000;
  await assert.rejects(()=>auth.refresh(rotated.refreshToken),'revoked family became usable after original token expired');
  }finally{Date.now=saved;appConfig.env.JWT_REFRESH_TTL_SECONDS=ttl;}
 });
 await check('logout reports a Redis revocation failure instead of success',async()=>{
  const {auth,user}=service();const session=await auth.issue(user,'logout-family');
  auth.tokens.revokeFamily=async()=>{throw new Error('simulated Redis outage');};
  await assert.rejects(()=>auth.logout(session.refreshToken),'logout silently swallowed storage failure');
 });
 await check('a 401 after the one permitted retry opens session-expired',async()=>{
  const {c,events}=client([expired(),response(200,{data:{accessToken:'new',expiresIn:900,user:{id:'audit'}}}),expired()]);
  await assert.rejects(()=>c.api('/auth/me'));assert.ok(events.includes('session-expired'),'no session-expired event on retry 401');
 });
 await check('refresh 429 preserves credentials and announces rate-limited',async()=>{
  const {c,events}=client([response(429,{error:{code:'RATE_LIMITED',message:'slow down'}})]);
  await c.refreshSession();assert.ok(c.getAccessToken(),'refresh 429 discarded existing access token');assert.ok(events.includes('rate-limited'));
 });
 await check('API NOT_FOUND announces a not-found system state',async()=>{
  const {c,events}=client([response(404,{error:{code:'NOT_FOUND',message:'missing'}})]);
  await assert.rejects(()=>c.api('/missing'));assert.ok(events.includes('not-found'),'no NOT_FOUND event mapping');
 });
 await check('validation error code consistently uses HTTP 422',()=>{
  const r=new AllExceptionsFilter().toResponse(new BadRequestException('malformed JSON'));
  assert.equal(r.body.error.code,'VALIDATION_FAILED');assert.equal(r.status,422);
 });
 console.log(JSON.stringify({results,passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length},null,2));
 process.exitCode=results.some(r=>r.status==='FAIL')?1:0;
})();
