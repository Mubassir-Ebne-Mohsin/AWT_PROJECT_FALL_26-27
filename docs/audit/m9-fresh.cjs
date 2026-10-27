// Fresh-setup check on one named disposable database, never the normal database.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{spawnSync}=require('node:child_process');
if(process.env.DB_DATABASE!=='sf_m9_audit'||process.env.DB_PORT!=='5552')throw Error('M9 identity mismatch');
const backend=path.resolve(__dirname,'../../nest-boilerplate/nest-boilerplate'),{DataSource}=require(path.join(backend,'node_modules/typeorm')),opts=require(path.join(backend,'dist/config/database.config')).default;
(async()=>{
 const admin=new DataSource({...opts,database:'postgres'});await admin.initialize();
 try{const existing=await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',['sf_m9_fresh']);assert.equal(existing.length,0,'Fresh fixture database already exists: preserve it and use earlier evidence');await admin.query('CREATE DATABASE sf_m9_fresh OWNER sf_audit');}finally{await admin.destroy();}
 const db=new DataSource({...opts,database:'sf_m9_fresh'});await db.initialize();
 try{
  const migrations=await db.runMigrations();assert.equal(migrations.length,2);
  const seed=[];for(let i=0;i<2;i++){const child=spawnSync(process.execPath,[path.join(backend,'dist/seeder.js')],{cwd:process.cwd(),env:{...process.env,DB_DATABASE:'sf_m9_fresh'},encoding:'utf8',windowsHide:true,timeout:30000});assert.equal(child.status,0,'Fresh seed failed');seed.push(child.status);}
  const [{count}]=await db.query("SELECT count(*)::int AS count FROM users WHERE email='demo@stressforge.dev'");assert.equal(count,1);
  const evidence={database:'sf_m9_fresh',migrations:migrations.map(m=>m.name),seedStatuses:seed,demoUsers:count,synchronize:opts.synchronize,configuredStatementDeadlineMs:opts.extra.statement_timeout};
  fs.writeFileSync(path.join(__dirname,'m9-fresh.json'),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
 }finally{await db.destroy();}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
