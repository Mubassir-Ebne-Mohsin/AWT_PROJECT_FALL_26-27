// Migrations only on the explicitly labelled disposable browser database.
const path=require("node:path");
const identity=require("./runtime.json");
if(process.env.DB_DATABASE!==identity.database || !/^sf_notifications_support_e_[a-z0-9_]+$/.test(identity.database) || process.env.DB_PORT!=="5552") throw Error("Audit target mismatch");
const backend=path.resolve(__dirname,"../../../nest-boilerplate/nest-boilerplate");
const {DataSource}=require(path.join(backend,"node_modules/typeorm"));
const opts=require(path.join(backend,"dist/config/database.config")).default;
(async()=>{const {Client}=require(path.join(backend,'node_modules/pg'));const admin=new Client({host:process.env.DB_HOST,port:Number(process.env.DB_PORT),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:'postgres'});await admin.connect();try{const found=await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[identity.database]);if(!found.rowCount)await admin.query('CREATE DATABASE "'+identity.database+'"');}finally{await admin.end();}const db=new DataSource(opts);await db.initialize();try{console.log(JSON.stringify({migrations:(await db.runMigrations()).map(x=>x.name)}));}finally{await db.destroy();}})().catch(()=>{console.error("Disposable migration failed");process.exitCode=1;});
