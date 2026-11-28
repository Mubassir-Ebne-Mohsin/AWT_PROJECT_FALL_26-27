// Independent draft OpenAPI, not registered by the running API.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const C=require('./contract.cjs'),z=C.z;
const id=z.uuid(),rev=z.number().int().positive().max(2147483647),date=z.iso.datetime();
const source=z.strictObject({id,revision:rev}).nullable();
const experiment=z.strictObject({id,name:z.string().min(1).max(100),description:z.string().max(2000),revision:rev,sourceDesign:source,scenario:C.scenarioSchema,createdAt:date,updatedAt:date});
const summary=z.strictObject({id,name:z.string().min(1).max(100),revision:rev,regions:z.array(z.enum(['us-east','eu-west','ap-south'])).max(3),updatedAt:date,lastRun:z.strictObject({id,status:z.enum(['queued','running','completed','failed','cancelled']),experimentRevision:rev}).nullable()});
const version=z.strictObject({revision:rev,createdAt:date,scenario:C.scenarioSchema});
const schemas={Scenario:C.scenarioSchema,CreateExperiment:C.createSchema,PatchExperiment:C.patchSchema,RunRequest:C.runRequestSchema,Run:C.runRecordSchema,Profile:C.profileSchema,Experiment:experiment,ExperimentSummary:summary,Version:version,ResultPage:C.resultPageSchema,
 DuplicateRequest:z.strictObject({expectedRevision:rev,name:z.string().trim().min(1).max(100)}),
 Validation:z.strictObject({ok:z.boolean(),issues:z.array(z.strictObject({severity:z.enum(['error','warning','info']),code:z.string().max(80),path:z.array(z.union([z.string().max(80),z.number().int().nonnegative()])),message:z.string().max(500),nodeIds:z.array(z.string().max(64)).max(36)})).max(200),supportedCapabilities:z.array(z.string().max(80)).max(50),estimatedEvents:z.number().int().nonnegative().nullable()}),
 Error:z.strictObject({error:z.strictObject({code:z.string().max(80),message:z.string().max(500),details:z.unknown().optional()})}),
};
const ref=name=>({$ref:'#/components/schemas/'+name});
const envelope=name=>({type:'object',required:['data'],additionalProperties:false,properties:{data:ref(name)}});
const paged=name=>({type:'object',required:['data'],additionalProperties:false,properties:{data:{type:'object',required:['items','nextCursor'],additionalProperties:false,properties:{items:{type:'array',items:ref(name),maxItems:36},nextCursor:{type:['string','null'],maxLength:256}}}}});
const response=(description,schema)=>({description,content:{'application/json':{schema}}});
const jsonBody=name=>({required:true,content:{'application/json':{schema:ref(name)}}});
const commonErrors=Object.fromEntries([400,401,404,409,422,429,503].map(status=>[status,response('See REGION-LAB-CONTRACTS.md error mapping',ref('Error'))]));
const param=(name,where,schema,required=false)=>({name,in:where,required,schema});
const ids=[param('id','path',{type:'string',format:'uuid'},true)];
const paging=[param('cursor','query',{type:'string',maxLength:256}),param('limit','query',{type:'integer',minimum:1,maximum:20,default:20})];
const op=(operationId,responses,extra={})=>({operationId,description:'PLANNED ONLY: not an implemented or deployed operation.',security:[{bearerAuth:[]}],'x-implementation-status':'planned',responses:{...commonErrors,...responses},...extra});
const paths={
 '/profiles':{get:op('regionLabProfiles',{200:response('Supported profile versions',{type:'object',required:['data'],additionalProperties:false,properties:{data:{type:'array',maxItems:36,items:ref('Profile')}}})},{parameters:[param('component','query',{type:'string',enum:['cdn','lb','gateway','app','worker','cache','db','replica','queue','storage','external']}),param('limit','query',{type:'integer',minimum:1,maximum:36,default:36})]})},
 '/experiments':{get:op('regionLabListExperiments',{200:response('Owner summaries',paged('ExperimentSummary'))},{parameters:paging}),post:op('regionLabCreateExperiment',{201:response('Created; no implicit run',envelope('Experiment'))},{requestBody:jsonBody('CreateExperiment')})},
 '/experiments/{id}':{parameters:ids,get:op('regionLabGetExperiment',{200:response('Owned current experiment',envelope('Experiment'))}),patch:op('regionLabPatchExperiment',{200:response('New immutable revision',envelope('Experiment'))},{requestBody:jsonBody('PatchExperiment')}),delete:op('regionLabDeleteExperiment',{204:{description:'Deleted; active runs must first be terminal'}},{parameters:[param('expectedRevision','query',{type:'integer',minimum:1},true)]})},
 '/experiments/{id}/duplicate':{parameters:ids,post:op('regionLabDuplicate',{201:response('Independent copy with no completed run',envelope('Experiment'))},{requestBody:jsonBody('DuplicateRequest')})},
 '/experiments/{id}/versions':{parameters:ids,get:op('regionLabVersions',{200:response('Retained immutable versions',paged('Version'))},{parameters:[param('beforeRevision','query',{type:'integer',minimum:1}),param('limit','query',{type:'integer',minimum:1,maximum:20,default:20})]})},
 '/validate':{post:op('regionLabValidate',{200:response('Validation only, no numerical simulation',envelope('Validation'))},{requestBody:jsonBody('Scenario')})},
 '/experiments/{id}/runs':{parameters:ids,post:op('regionLabSubmitRun',{200:response('Existing matching idempotent submission',envelope('Run')),202:response('Durably accepted queued run',envelope('Run'))},{requestBody:jsonBody('RunRequest')})},
 '/runs/{id}':{parameters:ids,get:op('regionLabGetRun',{200:response('Recorded lifecycle state',envelope('Run'))})},
 '/runs/{id}/cancel':{parameters:ids,post:op('regionLabCancelRun',{200:response('Already terminal state',envelope('Run')),202:response('Cancellation requested',envelope('Run'))})},
 '/runs/{id}/results':{parameters:ids,get:op('regionLabResults',{200:response('Recorded page for selected repetition/scenario',envelope('ResultPage'))},{parameters:[param('scenario','query',{type:'string',enum:['baseline','outage']},true),param('repetition','query',{type:'integer',minimum:0,maximum:4,default:0}),param('view','query',{type:'string',enum:['regions','components','timeline']},true),param('cursor','query',{type:'string',maxLength:256}),param('limit','query',{type:'integer',minimum:1,maximum:120,default:120})]})},
 '/runs/{id}/export':{parameters:ids,get:op('regionLabExport',{200:{description:'Versioned recorded-input/result export; final export manifest contract is a stage7 gate',content:{'application/json':{schema:{type:'object','x-stage7-export-manifest-required':true}}}}})},
 '/runs/{id}/report':{parameters:ids,get:op('regionLabReport',{200:{description:'PDF from recorded inputs/results; layout is a stage7 gate',content:{'application/pdf':{schema:{type:'string',format:'binary'}}}}})},
};
const document={openapi:'3.1.0',info:{title:'Region Lab API — DRAFT specification',version:'0.1.0-draft',description:'Stage1 planning artifact only. No operation is implemented. Cross-field/server/worker checks are mandatory; export manifest and PDF layout are deferred stage7 gates.'},servers:[{url:'/v1/region-lab'}],paths,components:{securitySchemes:{bearerAuth:{type:'http',scheme:'bearer',bearerFormat:'JWT'}},schemas:Object.fromEntries(Object.entries(schemas).map(([name,s])=>[name,z.toJSONSchema(s,{target:'draft-2020-12'})]))}};
let checks=0;const operationIds=[];
for(const [route,item] of Object.entries(paths))for(const [method,o] of Object.entries(item)){if(method==='parameters')continue;assert.equal(o['x-implementation-status'],'planned');assert.deepEqual(o.security,[{bearerAuth:[]}]);operationIds.push(o.operationId);if(route.includes('{id}'))assert(item.parameters.some(p=>p.name==='id'&&p.required));for(const p of o.parameters||[])assert(p.in==='query');checks++;}
assert.equal(new Set(operationIds).size,operationIds.length);
function refs(value){if(!value||typeof value!=='object')return;for(const [key,v] of Object.entries(value)){if(key==='$ref'&&typeof v==='string'&&v.startsWith('#/components/schemas/'))assert(document.components.schemas[v.split('/').at(-1)],v);else refs(v);}}refs(document);
const output=path.resolve(__dirname,'../contracts/region-lab-v1.openapi.json');
if(process.argv.includes('--write'))fs.writeFileSync(output,JSON.stringify(document,null,2)+'\n');
else assert.deepEqual(JSON.parse(fs.readFileSync(output,'utf8')),document,'Draft OpenAPI stale');
console.log(JSON.stringify({draftOperations:checks,authAndReferences:'passed',registeredInApplication:false}));
