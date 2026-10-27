// Audit-only bootstrap: actual compiled module + shared setup, with local numeric telemetry.
const path=require('node:path'),fs=require('node:fs');
// Explicit disposable configuration also makes child-process restart independent of shell state.
Object.assign(process.env,{NODE_ENV:'development',PORT:'5003',DB_HOST:'127.0.0.1',DB_PORT:'5552',DB_USER:'sf_audit',DB_PASSWORD:'sf_m9_disposable',DB_DATABASE:'sf_m9_audit',REDIS_HOST:'127.0.0.1',REDIS_PORT:'6399',REDIS_PASSWORD:'',JWT_ACCESS_SECRET:'m9-audit-only-access-secret-0123456789abcdef',JWT_REFRESH_SECRET:'m9-audit-only-refresh-secret-0123456789abcdef',DEMO_USER_PASSWORD:'M9-Demo-Local-Only!',AUTH_THROTTLE_LIMIT:'300',THROTTLE_LIMIT:'120',CORS_ORIGINS:'http://localhost:3003',FRONTEND_URL:'http://localhost:3003',TRUST_PROXY_HOPS:'0',JWT_ACCESS_TTL_SECONDS:'900',JWT_REFRESH_TTL_SECONDS:'604800'});
const backend=path.resolve(__dirname,'../../nest-boilerplate/nest-boilerplate');
if(process.env.PORT!=='5003'||process.env.DB_DATABASE!=='sf_m9_audit'||process.env.DB_PORT!=='5552')throw Error('M9 audit identity mismatch');
const {NestFactory}=require(path.join(backend,'node_modules/@nestjs/core'));
const {AppModule}=require(path.join(backend,'dist/app.module'));
const {configureApp,setupSwagger}=require(path.join(backend,'dist/app.setup'));
const {SimulationService}=require(path.join(backend,'dist/modules/simulation/simulation.service'));
// Safe audit diagnostics: classification only, never messages, stacks, request bodies or credentials.
const {AllExceptionsFilter}=require(path.join(backend,'dist/common/filters/all-exceptions.filter'));
const originalToResponse=AllExceptionsFilter.prototype.toResponse;
AllExceptionsFilter.prototype.toResponse=function(error){
 const result=originalToResponse.call(this,error);
 if(result.status>=500){const candidate=error?.constructor?.name;console.warn(JSON.stringify({auditFailureClass:/^[A-Za-z0-9_]{1,80}$/.test(candidate)?candidate:'unknown',status:result.status}));}
 return result;
};
let app;
(async()=>{
 app=await NestFactory.create(AppModule);configureApp(app);setupSwagger(app);await app.listen(5003);
 const executor=app.get(SimulationService).executor,file=path.join(__dirname,'m9-runtime-stats.log');
 const sample=()=>{const mem=process.memoryUsage();const expired=[...executor.latestPreview.values()].filter(v=>v.expiresAt<=Date.now()).length;fs.appendFileSync(file,JSON.stringify({at:Date.now(),pid:process.pid,rss:mem.rss,heapUsed:mem.heapUsed,...executor.state,expiredPreviewEntries:expired,worker:executor.diagnostics})+'\n');};sample();
 const timer=setInterval(sample,2000);timer.unref();
 console.log('M9 audit telemetry ready on5003');
})().catch(async()=>{console.error('M9 audit bootstrap failed');await app?.close().catch(()=>undefined);process.exit(1)});
