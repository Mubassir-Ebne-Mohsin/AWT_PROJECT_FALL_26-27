// Local source-worker startup observation, with the real unchanged admission budget.
const path=require('node:path'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const backend=path.resolve(__dirname,'../../nest-boilerplate/nest-boilerplate');
process.env.TS_NODE_PROJECT=path.join(backend,'tsconfig.json');
require(path.join(backend,'node_modules/ts-node')).register({project:process.env.TS_NODE_PROJECT,transpileOnly:true});
require(path.join(backend,'node_modules/tsconfig-paths/register'));
const {SimulationExecutor}=require(path.join(backend,'src/modules/simulation/worker/simulation-executor'));
const {getTemplates}=require(path.join(backend,'src/modules/simulation/engine/templates'));
const t=getTemplates().find(t=>t.id==='mvp'),snapshot={schemaVersion:1,graph:t.graph,traffic:t.traffic},mode=process.argv[2];
if(!['baseline','fixed'].includes(mode))throw Error('Choose baseline or fixed');
(async()=>{const records=[];for(let i=0;i<4;i++){const e=new SimulationExecutor(),started=Date.now();try{await e.submit('m9-cold',{kind:'preview',snapshot},{editorSessionId:randomUUID(),sequence:0});records.push({status:'completed',ms:Date.now()-started});}catch(error){records.push({status:error.code??'ERROR',ms:Date.now()-started});}finally{await e.close();}}
const result={mode,previewDeadlineMs:2000,records};fs.writeFileSync(path.join(__dirname,'m9-cold-workers-'+mode+'.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));if(mode==='fixed'&&records.some(r=>r.status!=='completed'))process.exitCode=1;
})().catch(e=>{console.error(e.message);process.exitCode=1});
