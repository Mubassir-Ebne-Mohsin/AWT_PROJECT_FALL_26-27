const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base='http://localhost:5003',api=base+'/v1';
async function call(route,method='GET',body,token,cookie){const r=await fetch(api+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});const text=await r.text();return {status:r.status,body:text?JSON.parse(text):null,cookie:r.headers.get('set-cookie')?.split(';')[0]};}
(async()=>{
 const evidence={health:(await call('/health')).status};assert.equal(evidence.health,200);
 const docs=await fetch(base+'/docs'),schema=await(await fetch(base+'/docs-json')).json();assert.equal(docs.status,200);assert.ok(schema.paths['/v1/auth/me']);assert.ok(schema.paths['/v1/simulation/preview']);evidence.swagger=200;
 const preflight=await fetch(api+'/auth/login',{method:'OPTIONS',headers:{Origin:'http://localhost:3003','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type,authorization'}});assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),'http://localhost:3003');assert.equal(preflight.headers.get('access-control-allow-credentials'),'true');evidence.preflight=204;
 const creds={email:'m9-walkthrough-'+Date.now()+'@example.test',password:'M9-Walkthrough-Only!',displayName:'M9 Walkthrough'};
 const reg=await call('/auth/register','POST',creds);assert.equal(reg.status,201);assert.ok(!JSON.stringify(reg.body.data.user).includes('password'));evidence.register=reg.status;
 const login=await call('/auth/login','POST',creds);assert.equal(login.status,200);evidence.login=login.status;
 const me=await call('/auth/me','GET',null,login.body.data.accessToken);assert.equal(me.status,200);assert.equal(me.body.data.email,creds.email);evidence.me=me.status;
 const refresh=await call('/auth/refresh','POST',null,null,login.cookie);assert.equal(refresh.status,200);assert.notEqual(refresh.cookie,login.cookie);evidence.refresh=refresh.status;
 const logout=await call('/auth/logout','POST',null,refresh.body.data.accessToken,refresh.cookie);assert.equal(logout.status,204);evidence.logout=logout.status;
 const revoked=await call('/auth/refresh','POST',null,null,refresh.cookie);assert.equal(revoked.status,401);evidence.revokedRefresh=401;
 const none=await call('/auth/me');assert.equal(none.status,401);evidence.protectedWithoutToken=401;
 const wrongA=await call('/auth/login','POST',{email:creds.email,password:'Wrong-password!'}),wrongB=await call('/auth/login','POST',{email:'unknown-'+Date.now()+'@example.test',password:'Wrong-password!'});assert.equal(wrongA.status,401);assert.equal(wrongA.body.error.message,wrongB.body.error.message);evidence.indistinguishableCredentials=true;
 const demo=await call('/auth/login','POST',{email:'demo@stressforge.dev',password:'M9-Demo-Local-Only!'});assert.equal(demo.status,200);evidence.seededDemoLogin=200;
 fs.writeFileSync(path.resolve(__dirname,'../../docs/audit/m9-foundation.json'),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
})().catch(e=>{console.error(e.stack);process.exitCode=1});
