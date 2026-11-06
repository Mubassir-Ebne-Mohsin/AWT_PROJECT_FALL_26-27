// Migrations only on the explicitly labelled disposable browser database.
const path=require("node:path");
const identity=require("./runtime.json");
if(process.env.DB_DATABASE!==identity.database || !/^sf_support_metrics_[a-z0-9_]+$/.test(identity.database) || process.env.DB_PORT!=="5552") throw Error("Audit target mismatch");
const backend=path.resolve(__dirname,"../../../nest-boilerplate/nest-boilerplate");
const {DataSource}=require(path.join(backend,"node_modules/typeorm"));
const opts=require(path.join(backend,"dist/config/database.config")).default;
(async()=>{const db=new DataSource(opts);await db.initialize();try{console.log(JSON.stringify({migrations:(await db.runMigrations()).map(x=>x.name)}));}finally{await db.destroy();}})().catch(()=>{console.error("Disposable migration failed");process.exitCode=1;});
