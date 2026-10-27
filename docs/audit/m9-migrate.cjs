// Runs only with the disposable M9 process configuration from m9-run.ps1.
const path=require('node:path');
const backend=path.resolve(__dirname,'../../nest-boilerplate/nest-boilerplate');
if(process.env.DB_DATABASE!=='sf_m9_audit'||process.env.DB_PORT!=='5552')throw Error('M9 migration target mismatch');
const {DataSource}=require(path.join(backend,'node_modules/typeorm'));
const opts=require(path.join(backend,'dist/config/database.config')).default;
const db=new DataSource(opts);
(async()=>{await db.initialize();const applied=await db.runMigrations();console.log(JSON.stringify({migrations:applied.map(x=>x.name)}));await db.destroy()})().catch(()=>{console.error('Audit migration failed');process.exitCode=1});
