// Explicit integration harness: creates and removes ONLY its unique Compose project.
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { randomBytes } = require("node:crypto"), { spawn } = require("node:child_process");
const { createRequire } = require("node:module");
const https = require("node:https");
const root = path.resolve(__dirname, ".."), api = path.join(root, "nest-boilerplate/nest-boilerplate");
const required = createRequire(path.join(api, "package.json"));
const { Client } = required("pg"), { createClient } = required("redis");
const project = `stressforge-h2-qa-${Date.now()}`;
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "stressforge-h2-qa-"));
const secret = () => randomBytes(32).toString("hex");
const values = { PUBLIC_HOST: "localhost", PUBLIC_ORIGIN: "https://localhost:15443", API_IMAGE: "stressforge-h2-api:local", WEB_IMAGE: "stressforge-h2-web:local", PROXY_IMAGE: "stressforge-h2-proxy:local", POSTGRES_ADMIN_PASSWORD: secret(), APP_DB_PASSWORD: secret(), MIGRATION_DB_PASSWORD: secret(), REDIS_PASSWORD: secret(), JWT_ACCESS_SECRET: secret(), JWT_REFRESH_SECRET: secret() };
const environment = { ...process.env, ...values, COMPOSE_PROJECT_NAME: project, DB_PASSWORD: values.MIGRATION_DB_PASSWORD };
const result = { project, checks: [], status: "running" };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let ca, resourcesStarted=false;
function check(name) { result.checks.push(name); console.log("PASS " + name); }
function run(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, { cwd: root, env: environment, windowsHide: true });
    let stdout = "", stderr = "";
    child.stdout.on("data", x => stdout += x); child.stderr.on("data", x => stderr += x);
    const timer = setTimeout(() => { child.kill(); reject(new Error("Docker operation timed out: " + args[0])); }, options.timeout ?? 180000);
    child.on("error", e => { clearTimeout(timer); reject(e); });
    child.on("close", code => { clearTimeout(timer); if (code !== 0 && !options.failure) {
      for (const value of Object.values(values)) stderr = stderr.split(value).join("[redacted]");
      reject(new Error("Docker " + args[0] + " failed: " + stderr.slice(-1400)));
    } else resolve({ code, stdout, stderr }); });
  });
}
const composeArgs = ["compose", "--env-file", path.join(temporary, "empty.conf"), "-p", project, "-f", path.join(__dirname, "compose.yml"), "-f", path.join(temporary, "qa.yml")];
const compose = (...args) => run([...composeArgs, ...args]);
async function database(user = "sf_app", database = "stressforge") {
  const client = new Client({ host: "127.0.0.1", port: 5552, database, user,
    password: user === "postgres" ? values.POSTGRES_ADMIN_PASSWORD : user === "sf_app" ? values.APP_DB_PASSWORD : values.MIGRATION_DB_PASSWORD,
    connectionTimeoutMillis: 15000 });
  await client.connect(); return client;
}
async function call(route, body, headers = {}) {
  const data = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: "localhost", port: 15443, path: route, ca,
      method: data === undefined ? "GET" : "POST", headers: { ...(data ? { "content-type": "application/json", "content-length": Buffer.byteLength(data), Origin: values.PUBLIC_ORIGIN } : {}), ...headers }, timeout: 30000 }, res => {
      let raw = ""; res.on("data", x => raw += x); res.on("end", () => { let json; try { json = JSON.parse(raw); } catch {} resolve({ status: res.statusCode, headers: res.headers, json }); });
    });
    req.on("timeout", () => req.destroy(new Error("HTTPS operation timed out"))); req.on("error", reject); if (data) req.write(data); req.end();
  });
}
async function main() {
  assert.match(project, /^stressforge-h2-qa-\d+$/);
  if(os.freemem()<2*1024**3)throw new Error("Hosting rehearsal requires about 2 GiB of free RAM; close unused apps before retrying");
  fs.writeFileSync(path.join(temporary, "empty.conf"), "");
  const qaCaddy = path.join(temporary, "Caddyfile").replaceAll("\\", "/");
  fs.writeFileSync(qaCaddy,fs.readFileSync(path.join(__dirname,"caddy/Caddyfile"),"utf8").replace("{","{\n local_certs\n skip_install_trust"));
  fs.writeFileSync(path.join(temporary, "qa.yml"), `services:
  postgres:
    ports: ['127.0.0.1:5552:5432']
  redis:
    ports: ['127.0.0.1:6392:6379']
  api:
    ports: ['127.0.0.1:5014:5001']
  proxy:
    ports: !override ['127.0.0.1:15443:8443', '127.0.0.1:15080:8080']
    volumes: !override ['${qaCaddy}:/etc/caddy/Caddyfile:ro', 'caddy-data:/data', 'caddy-config:/config']
`);
  await compose("config", "--quiet"); check("production and isolated Compose validate without printing configuration");
  resourcesStarted=true;
  await compose("run", "--rm", "--no-deps", "validate"); check("private deployment validator accepts generated configuration");
  await compose("up", "-d", "--wait", "--wait-timeout", "90", "postgres", "redis"); check("isolated data services healthy as non-root users");
  await compose("run", "--rm", "--no-deps", "migrate"); check("dedicated migration role applies every migration");
  const app = await database();
  try {
    const role = (await app.query("SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user")).rows[0];
    assert.deepEqual(role, { rolsuper: false, rolcreatedb: false, rolcreaterole: false });
    await assert.rejects(app.query("CREATE TABLE public.h2_forbidden(id int)"), { code: "42501" });
  } finally { await app.end(); }
  check("runtime role has no superuser/role/schema creation privilege");
  await compose("up", "-d", "--wait", "--wait-timeout", "120", "api", "web", "proxy");
  for (const service of ["api", "web"]) {
    const uid = await compose("exec", "-T", service, "node", "-e", "console.log(process.getuid())"); assert.equal(uid.stdout.trim(), "1000");
  }
  check("real API and standalone web images run as UID 1000");
  await compose("cp", "proxy:/data/caddy/pki/authorities/local/root.crt", path.join(temporary, "public-ca.crt"));
  ca = fs.readFileSync(path.join(temporary, "public-ca.crt"));
  let health;
  for (let attempt = 0; attempt < 30; attempt++) { try { health = await call("/v1/health"); if (health.status === 200) break; } catch {} await wait(1000); }
  assert.equal(health?.status, 200); assert.equal((await call("/login")).status, 200);
  check("HTTPS proxy serves API health and web with verified local CA");
  await assert.rejects(new Promise((resolve, reject) => { const req = https.get("https://localhost:15443/v1/health", resolve); req.on("error", reject); }));
  check("TLS certificate is rejected without the test CA");
  const csrf = await call("/v1/auth/logout", {}, { Origin: "https://attacker.invalid" }); assert.equal(csrf.status, 403);
  const password = "H2-isolated-password-123!";
  async function register(name) { const response = await call("/v1/auth/register", { email: name+"@h2.example.test", displayName: name, password }); assert.equal(response.status, 201); assert.match(response.headers["set-cookie"].join(), /HttpOnly/); assert.match(response.headers["set-cookie"].join(), /Secure/); assert.match(response.headers["set-cookie"].join(), /SameSite=Lax/); return { ...response.json.data, cookie: response.headers["set-cookie"][0].split(";")[0] }; }
  const admin = await register("admin"), user = await register("member");
  const owner = await database("sf_migrator");
  try { await owner.query("INSERT INTO user_roles(user_id,role,granted_by,granted_at) VALUES($1,'admin',NULL,now())", [admin.user.id]); } finally { await owner.end(); }
  const bearer = session => ({ Authorization: "Bearer " + session.accessToken });
  assert.equal((await call(`/v1/admin/users/${user.user.id}/suspend`, {}, bearer(admin))).status, 200);
  assert.equal((await call("/v1/auth/me", undefined, bearer(user))).status, 401);
  assert.equal((await call(`/v1/admin/users/${user.user.id}/restore`, {}, bearer(admin))).status, 200);
  assert.equal((await call("/v1/auth/me", undefined, bearer(user))).status, 401);
  assert.equal((await call("/v1/auth/refresh", {}, { Cookie: user.cookie })).status, 401);
  const login = await call("/v1/auth/login", { email: user.user.email, password }); assert.equal(login.status, 200);
  const live = { ...login.json.data, cookie: login.headers["set-cookie"][0].split(";")[0] };
  assert.equal((await call("/v1/auth/me", undefined, bearer(live))).status, 200);
  check("secure login, CSRF refusal and suspend/restore reject both old token types while fresh login works");
  const template = (await call("/v1/templates",undefined,bearer(live))).json.data[0];
  const design = await call("/v1/designs",{schemaVersion:1,name:"H2 container worker smoke",description:"Isolated fixture",source:"template",templateId:template.id,graph:template.graph,traffic:template.traffic},bearer(live));assert.equal(design.status,201);
  const started=await call(`/v1/designs/${design.json.data.id}/simulate`,{expectedRevision:design.json.data.revision,requestId:require("node:crypto").randomUUID()},bearer(live));assert.equal(started.status,202);
  let computed;for(let n=0;n<40;n++){computed=await call(new URL(started.json.data.statusUrl,values.PUBLIC_ORIGIN).pathname,undefined,bearer(live));if(computed.json?.data?.status!=="pending")break;await wait(250);}assert.equal(computed.json.data.status,"completed");
  check("compiled simulation worker computes and stores a real design run inside the rootless image");
  for (let n=0;n<31;n++) {
    const response = await call("/v1/auth/username-availability", { username: "h2candidate" }, { "X-Forwarded-For": `203.0.113.${n+1}` });
    assert.equal(response.status, n<30 ? 200 : 429);
  }
  check("spoofed forwarding headers cannot bypass the per-client rate limit");
  const logout = await call("/v1/auth/logout", {}, { ...bearer(live), Cookie: live.cookie }); assert.equal(logout.status, 204);
  const redis = createClient({ socket: { host: "127.0.0.1", port: 6392 }, password: values.REDIS_PASSWORD }); redis.on("error",()=>{}); await redis.connect();
  const script = fs.readFileSync(path.join(api,"src/modules/auth/token-store.service.ts"),"utf8").match(/SESSION_CUTOFF_SCRIPT = `([\s\S]*?)`/)[1];
  await redis.eval(script,{keys:["sf:revoked:since:h2-check"],arguments:["200","60000"]});
  await redis.eval(script,{keys:["sf:revoked:since:h2-check"],arguments:["100","1000"]});
  assert.equal(await redis.get("sf:revoked:since:h2-check"),"200"); await redis.close();
  await compose("restart", "redis"); for(let n=0;n<40;n++){try{if((await call("/v1/health")).status===200)break;}catch{}await wait(1000);}
  const after = createClient({ socket: { host:"127.0.0.1",port:6392 },password:values.REDIS_PASSWORD }); after.on("error",()=>{}); await after.connect();
  assert.equal(await after.get("sf:revoked:since:h2-check"),"200"); await after.close();
  assert.equal((await call("/v1/auth/me", undefined, bearer(live))).status,401);
  assert.equal((await call("/v1/auth/refresh",{}, {Cookie:live.cookie})).status,401);
  check("real atomic cutoff and logout revocations survive durable Redis restart");
  await compose("exec","-T","postgres","sh","-c",'PGPASSWORD="$SF_MIGRATION_PASSWORD" pg_dump -U sf_migrator -d stressforge -Fc -f /tmp/h2.dump');
  const administrator = await database("postgres");
  try { await administrator.query("CREATE DATABASE stressforge_restore OWNER sf_migrator"); } finally { await administrator.end(); }
  await compose("exec","-T","postgres","sh","-c",'PGPASSWORD="$SF_MIGRATION_PASSWORD" pg_restore -U sf_migrator -d stressforge_restore --no-owner --exit-on-error /tmp/h2.dump');
  const restored = await database("sf_migrator","stressforge_restore");
  try { assert.equal((await restored.query("SELECT count(*)::int AS n FROM users")).rows[0].n,2); assert.ok((await restored.query("SELECT count(*)::int AS n FROM migrations")).rows[0].n>0); assert.equal((await restored.query("SELECT count(*)::int AS n FROM designs")).rows[0].n,1); } finally { await restored.end(); }
  check("backup restores accounts and migrations into a separate disposable database");
  const rollback = "(async()=>{const {DataSource}=require('typeorm');const o=require('./dist/config/database.config').dataSourceOptions;const d=await new DataSource({...o,extra:{...o.extra,statement_timeout:60000,query_timeout:65000}}).initialize();try{await d.undoLastMigration();await d.runMigrations();}finally{await d.destroy()}})().catch(()=>process.exitCode=1)";
  await compose("run","--rm","--no-deps","-e","DB_DATABASE=stressforge_restore","migrate","node","-e",rollback);
  check("latest migration rollback and reapply succeed on the restored clone");
  const regressionAdmin=await database("postgres");try{await regressionAdmin.query("CREATE DATABASE stressforge_regression OWNER sf_migrator");}finally{await regressionAdmin.end();}
  const unitArgs=["run","--rm","--network","none","--name",project+"-units","--label","com.docker.compose.project="+project,"--memory","2048m","-e","NODE_ENV=test","stressforge-h2-test:local","node","node_modules/jest/bin/jest.js","--runInBand","--runTestsByPath","src/config/app.config.spec.ts","src/config/hosting.config.spec.ts","src/modules/auth/session-boundary.spec.ts","src/modules/auth/session-cutoff.spec.ts","src/modules/roles/restore-boundary.spec.ts"];
  const unit=await run(unitArgs,{timeout:600000});fs.writeFileSync(path.join(temporary,"final-units.log"),unit.stdout+unit.stderr);
  check("unchanged configuration startup test and all new hosting/session regressions pass in isolated Linux");
  const testing = await run(["run","--rm","--name",project+"-http","--label","com.docker.compose.project="+project,"--network",project+"_data","--memory","2048m","-e","NODE_ENV=test","-e","HOSTED_MODE=false","-e","DB_HOST=postgres","-e","DB_PORT=5432","-e","DB_TEST_DATABASE=stressforge_regression","-e","DB_DATABASE=stressforge_regression","-e","DB_USER=sf_migrator","-e","DB_PASSWORD","-e","JWT_ACCESS_SECRET","-e","JWT_REFRESH_SECRET","stressforge-h2-test:local","node","node_modules/jest/bin/jest.js","--runInBand","--config","test/jest-e2e.json","--runTestsByPath","test/admin-status.e2e-spec.ts","test/account.e2e-spec.ts","test/roles.e2e-spec.ts"], { timeout: 600000 });
  fs.writeFileSync(path.join(temporary,"existing-http.log"),testing.stdout+testing.stderr);
  check("unchanged Admin suspension, account and role HTTP regression passes inside Linux verification image");
    await compose("restart","api");
  for(let n=0;n<40;n++){try{const healthy=await call("/v1/health");if(healthy.status===200)break;}catch{}await wait(1000);}
  assert.equal((await call("/v1/auth/me",undefined,bearer(live))).status,401);
  const restarted=await call("/v1/auth/login",{email:user.user.email,password});assert.equal(restarted.status,200);
  assert.equal((await call(`/v1/designs/${design.json.data.id}/runs`,undefined,bearer(restarted.json.data))).status,200);
  check("API restart preserves recorded designs and refuses logged-out access credentials");
  // A separate short-lived TLS fixture validates node-postgres using the actual helper.
  const tlsArgs = ["run","-d","--name",project+"-tls","--label","com.docker.compose.project="+project,"-p","127.0.0.1:5553:5432","-e","POSTGRES_PASSWORD","--entrypoint","sh","postgres:16","-c","openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=localhost -addext subjectAltName=DNS:localhost,IP:127.0.0.1 -keyout /tmp/server.key -out /tmp/server.crt >/dev/null 2>&1 && chown postgres:postgres /tmp/server.key && chmod 600 /tmp/server.key && exec docker-entrypoint.sh postgres -c ssl=on -c ssl_cert_file=/tmp/server.crt -c ssl_key_file=/tmp/server.key"];
  environment.POSTGRES_PASSWORD=values.POSTGRES_ADMIN_PASSWORD;
  await run(tlsArgs);
  try {
    for(let n=0;n<60;n++){const ready=await run(["exec",project+"-tls","pg_isready","-U","postgres"],{failure:true});if(ready.code===0)break;await wait(1000);}
    await run(["cp",project+"-tls:/tmp/server.crt",path.join(temporary,"pg-public-ca.crt")]);
    required("ts-node").register({transpileOnly:true,project:path.join(api,"tsconfig.json")});
    const {databaseTls}=required(path.join(api,"src/config/database-tls.ts"));
    const settings={host:"127.0.0.1",port:5553,user:"postgres",database:"postgres",password:values.POSTGRES_ADMIN_PASSWORD,connectionTimeoutMillis:15000};
    const good=new Client({...settings,ssl:databaseTls(true,path.join(temporary,"pg-public-ca.crt"))});await good.connect();await good.query("SELECT 1");await good.end();
    const bad=new Client({...settings,ssl:databaseTls(true,path.join(temporary,"public-ca.crt"))});
    await assert.rejects(bad.connect(),e=>/CERT|SELF_SIGNED/.test(e.code??""));await bad.end().catch(()=>{});
    const wrongHost=new Client({...settings,ssl:{...databaseTls(true,path.join(temporary,"pg-public-ca.crt")),servername:"wrong.invalid"}});
    await assert.rejects(wrongHost.connect(),e=>/CERT|SELF_SIGNED/.test(e.code??""));await wrongHost.end().catch(()=>{});
    check("real PostgreSQL TLS accepts the trusted CA and rejects wrong CA/hostname");
  } finally {await run(["rm","-f","-v",project+"-tls"],{failure:true});}
  // Browser-only local-CA exception; strict TLS was separately verified above.
  const webRequire=createRequire(path.join(root,"web/package.json"));
  const {chromium}=webRequire("@playwright/test");
  const browserServer=await chromium.launchServer({channel:"chrome",headless:true,timeout:60000});
  try {
    const browser=await chromium.connect(browserServer.wsEndpoint());
    const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1280,height:900},colorScheme:"dark"});
    const page=await context.newPage(),errors=[];page.on("pageerror",e=>errors.push(e.message));
    await page.goto(values.PUBLIC_ORIGIN+"/login",{timeout:60000});
    await page.getByLabel("Email",{exact:true}).fill(user.user.email);
    await page.getByLabel("Password",{exact:true}).fill(password);
    await page.getByRole("button",{name:"Log in",exact:true}).click();
    await page.waitForURL("**/dashboard",{timeout:60000});
    await page.getByText("H2 container worker smoke",{exact:true}).waitFor({state:"visible",timeout:30000});
    assert.deepEqual(errors,[]);
    const directory=path.join(root,"docs/audit/h2-2026-11-27");fs.mkdirSync(directory,{recursive:true});
    await page.screenshot({path:path.join(directory,"real-hosted-dashboard-dark.png"),animations:"disabled"});
    check("real Chrome signs in through HTTPS and hydrates the standalone dashboard without page errors");
  } finally {
    let timer;try{await Promise.race([browserServer.close(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error("Browser shutdown deadline")),15000);})]);}
    catch{result.browserCleanup="forced after shutdown deadline";let killTimer;try{await Promise.race([browserServer.kill(),new Promise(resolve=>{killTimer=setTimeout(()=>{browserServer.process().kill("SIGKILL");resolve();},5000);})]);}finally{clearTimeout(killTimer);}}finally{clearTimeout(timer);}
  }
  result.status="passed";
}
main().catch(error => { result.status="failed"; result.error=error.message; console.error(error.message); process.exitCode=1; }).finally(async()=>{
  if(resourcesStarted) for(const suffix of ["units","http","tls"])await run(["rm","-f","-v",project+"-"+suffix],{failure:true});
  try { if(resourcesStarted)await compose("down","--volumes","--remove-orphans","--timeout","10"); result.cleanup=resourcesStarted?"own project removed":"no resources created"; }
  catch(error) { result.cleanup="FAILED: "+error.message; process.exitCode=1; }
  const evidence=path.join(root,"docs/audit/h2-2026-11-27");fs.mkdirSync(evidence,{recursive:true});if(fs.existsSync(path.join(temporary,"final-units.log")))fs.copyFileSync(path.join(temporary,"final-units.log"),path.join(evidence,"final-units.log"));if(fs.existsSync(path.join(temporary,"existing-http.log")))fs.copyFileSync(path.join(temporary,"existing-http.log"),path.join(evidence,"existing-http.log"));fs.writeFileSync(path.join(evidence,"integration.json"),JSON.stringify(result,null,2)+"\n");fs.writeFileSync(path.join(evidence,project+".json"),JSON.stringify(result,null,2)+"\n");
  // Only the exact mkdtemp-owned fixture directory.
  fs.rmSync(temporary,{recursive:true,force:true});
});
