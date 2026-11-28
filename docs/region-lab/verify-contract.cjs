// Documentation-contract verification only; no network, DB, environment loading or simulation.
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const C=require('./contract.cjs');const root=path.resolve(__dirname,'..');
if(process.argv.includes('--fault-disable-semantics'))C.scenarioSchema=C.scenarioBase;
const schemaFile=path.join(root,'contracts/region-lab-v1.schema.json');
const resultSchemaFile=path.join(root,'contracts/region-lab-v1-run.schema.json');
const examplesFile=path.join(__dirname,'examples.json');
function exportSchema(schema,id){return {...C.z.toJSONSchema(schema,{target:'draft-2020-12'}),$id:'urn:stressforge:'+id,$comment:'Draft specification only. Cross-field checks require contract.cjs and REGION-LAB-CONTRACTS.md. No running API or calibrated engine is implied.'};}
const schema=exportSchema(C.scenarioBase,'region-lab:v1:scenario'),runSchema=exportSchema(C.runRecordSchema,'region-lab:v1:run');
const constant=valueMs=>({kind:'constant',valueMs});
const profiles=[{id:'app_reference',version:1,label:'Example app; uncalibrated',origin:'reference',provenance:'Illustrative contract fixture; not a benchmark',component:'app',properties:{serviceTime:constant(10),serviceSlotsPerReplica:4,waitingCapacity:100}},{id:'db_reference',version:1,label:'Example database; uncalibrated',origin:'reference',provenance:'Illustrative contract fixture; not a benchmark',component:'db',properties:{readServiceTime:constant(2),writeServiceTime:constant(5),serviceSlotsPerReplica:8,waitingCapacity:100}}];
const baseline={schemaVersion:1,engineContract:'region-lab-event-v1-draft',regions:['us-east','eu-west'],profiles,graph:{nodes:[{id:'us_clients',label:'US clients',type:'client',region:'us-east',x:0,y:0},{id:'eu_clients',label:'Europe clients',type:'client',region:'eu-west',x:0,y:200},{id:'us_app',label:'US application',type:'app',region:'us-east',x:250,y:0,profileId:'app_reference',profileVersion:1,replicas:2},{id:'eu_app',label:'Europe application',type:'app',region:'eu-west',x:250,y:200,profileId:'app_reference',profileVersion:1,replicas:2},{id:'primary',label:'Primary database',type:'db',region:'us-east',x:500,y:0,profileId:'db_reference',profileVersion:1,replicas:1}],edges:[{id:'us_db',from:'us_app',to:'primary',operationIds:['browse','checkout'],dispatch:'all',weight:1,mode:'sync'},{id:'eu_db',from:'eu_app',to:'primary',operationIds:['browse','checkout'],dispatch:'all',weight:1,mode:'sync'}]},network:['us-east','eu-west'].flatMap(from=>['us-east','eu-west'].map(to=>({from,to,oneWayDelay:constant(from===to?0.5:40),bandwidthMbps:1000,provenance:'Illustrative contract assumption; not measured internet latency'}))),workload:{baselineRps:800,arrival:'poisson',durationSeconds:120,warmupSeconds:20,drainSeconds:10,regionalShares:[{region:'us-east',shareBps:5000},{region:'eu-west',shareBps:5000}],operations:[{id:'browse',label:'Browse',kind:'read',shareBps:8000,requestBytes:512,responseBytes:8192,deadlineMs:2000,idempotent:true,retry:{maxAttempts:1,baseBackoffMs:100,maxBackoffMs:1000,jitterRatio:0.2}},{id:'checkout',label:'Checkout',kind:'write',shareBps:2000,requestBytes:2048,responseBytes:1024,deadlineMs:2000,idempotent:false,retry:{maxAttempts:1,baseBackoffMs:100,maxBackoffMs:1000,jitterRatio:0.2}}],schedule:[{atSeconds:0,multiplier:1},{atSeconds:120,multiplier:1}]},routing:['us-east','eu-west'].flatMap(originRegion=>['browse','checkout'].map(operationId=>({originRegion,operationId,policy:'explicit',primaryEntryNodeId:originRegion==='us-east'?'us_app':'eu_app',fallbackEntryNodeIds:[originRegion==='us-east'?'eu_app':'us_app'],detectionMs:5000,switchMs:1000,failbackMs:10000,returnOnRecovery:true}))),outage:null,targets:{p95Ms:300,errorBudgetRatio:0.01,perRegion:[]},runOptions:{mode:'baseline',seed:42,repetitions:1}};
const outage=structuredClone(baseline);outage.outage={id:'europe_app_outage',scope:'application_deployment',region:'eu-west',affectedNodeIds:['eu_app'],startSeconds:30,durationSeconds:40,inFlightPolicy:'abort_at_failed_node'};outage.runOptions.mode='paired';
const examples={note:'Structure/semantics fixtures only. They have not been simulated or calibrated.',baseline,outage};
if(process.argv.includes('--write')){fs.mkdirSync(path.dirname(schemaFile),{recursive:true});fs.writeFileSync(schemaFile,JSON.stringify(schema,null,2)+'\n');fs.writeFileSync(resultSchemaFile,JSON.stringify(runSchema,null,2)+'\n');fs.writeFileSync(examplesFile,JSON.stringify(examples,null,2)+'\n');}
assert.deepEqual(JSON.parse(fs.readFileSync(schemaFile,'utf8')),schema,'Scenario JSON Schema stale');
assert.deepEqual(JSON.parse(fs.readFileSync(resultSchemaFile,'utf8')),runSchema,'Run JSON Schema stale');
assert.deepEqual(JSON.parse(fs.readFileSync(examplesFile,'utf8')),examples,'Examples stale');
let checks=0;
function good(name,value,schema=C.scenarioSchema){assert.equal(schema.safeParse(value).success,true,name);checks++;}
function bad(name,mutate){const s=structuredClone(outage);mutate(s);assert.equal(C.scenarioSchema.safeParse(s).success,false,name);checks++;}
good('baseline',baseline);good('paired outage',outage);
good('create',{name:'Regional rehearsal',description:'Private draft',scenario:outage},C.createSchema);
good('revision patch',{expectedRevision:1,scenario:baseline},C.patchSchema);
good('run request',{expectedRevision:1,requestId:'90000000-0000-4000-8000-000000000001'},C.runRequestSchema);
const service={serviceTime:constant(5),serviceSlotsPerReplica:2,waitingCapacity:10};
const readWrite={readServiceTime:constant(2),writeServiceTime:constant(5),serviceSlotsPerReplica:2,waitingCapacity:10};
const propertyExamples={cdn:{...service,hitRatio:0.8,hitTime:constant(1)},lb:service,gateway:{...service,rateLimitRps:1000,rateLimitBurstRequests:100},app:service,worker:service,cache:{...service,hitRatio:0.8,hitTime:constant(1)},db:readWrite,replica:{...service,replicationApplyTime:constant(1)},queue:{maxDepthJobs:100,ackTime:constant(1),overflowPolicy:'reject_new',maxDeliveryAttempts:2,redeliveryDelayMs:100},storage:{...readWrite,aggregateBandwidthMbps:1000},external:{...service,rateLimitRps:1000,rateLimitBurstRequests:100}};
for(const [component,properties] of Object.entries(propertyExamples)){const p={id:'profile_'+component,version:1,label:component,origin:'custom',provenance:'Contract test only',component,properties};good(component+' profile',p,C.profileSchema);assert.equal(C.profileSchema.safeParse({...p,properties:{...properties,unmodeledCpuCores:64}}).success,false);checks++;}
bad('shares do not total10000',s=>s.workload.regionalShares[0].shareBps=6000);
bad('duplicate regions',s=>s.regions.push('us-east'));
bad('unknown component property',s=>s.graph.nodes[2].cpuCores=100);
bad('unsupported packet loss',s=>s.network[0].packetLossRatio=0.1);
bad('unknown edge endpoint',s=>s.graph.edges[0].to='missing');
bad('cycle',s=>s.graph.edges.push({id:'cycle_edge',from:'primary',to:'us_app',operationIds:['browse'],dispatch:'all',weight:1,mode:'sync'}));
bad('profile type mismatch',s=>s.graph.nodes[2].profileId='db_reference');
bad('missing network pair',s=>s.network.pop());
bad('duplicate network pair',s=>s.network[1]=s.network[0]);
bad('schedule outside horizon',s=>s.workload.schedule[1].atSeconds=121);
bad('unsafe write retries',s=>s.workload.operations[1].retry.maxAttempts=2);
bad('insufficient drain',s=>s.workload.drainSeconds=1);
bad('primary database outage unsupported',s=>s.outage.affectedNodeIds=['primary']);
bad('wrong outage region',s=>s.outage.affectedNodeIds=['us_app']);
bad('outage exceeds horizon',s=>s.outage.durationSeconds=100);
bad('fallback loops to primary',s=>s.routing[0].fallbackEntryNodeIds=['us_app']);
bad('missing origin operation route',s=>s.routing.pop());
bad('asynchronous direct db call',s=>s.graph.edges[0].mode='async');
bad('weighted routing sum',s=>{s.graph.edges[0].dispatch='weighted_one';s.graph.edges[0].weight=100;});
bad('multiple primaries',s=>s.graph.nodes.push({...s.graph.nodes[4],id:'another_primary'}));
bad('invented external replicas',s=>s.graph.nodes[4].replicas=2);
bad('unknown engine capability',s=>s.engineContract='production-accurate');
const record={id:'90000000-0000-4000-8000-000000000001',experimentId:'90000000-0000-4000-8000-000000000002',experimentRevision:1,inputHash:'a'.repeat(64),engineVersion:'region-lab-event-v1-draft',mode:'baseline',createdAt:'2026-11-27T10:00:00Z'};
good('queued record',{...record,status:'queued',progressRatio:0},C.runRecordSchema);
good('running record',{...record,status:'running',startedAt:record.createdAt,progressRatio:0.5},C.runRecordSchema);
good('failed record',{...record,status:'failed',completedAt:record.createdAt,failure:{code:'BUDGET_EXCEEDED',message:'Event budget exceeded'}},C.runRecordSchema);
good('cancelled record',{...record,status:'cancelled',completedAt:record.createdAt},C.runRecordSchema);
assert.equal(C.runRecordSchema.safeParse({...record,status:'queued',progressRatio:1}).success,false);checks++;
assert.equal(C.runRecordSchema.safeParse({...record,status:'failed',completedAt:record.createdAt,baseline:{}}).success,false);checks++;
assert.equal(C.patchSchema.safeParse({expectedRevision:1}).success,false);checks++;
assert.equal(C.runRequestSchema.safeParse({expectedRevision:1,requestId:record.id,ownerId:record.id}).success,false);checks++;
// AAAA is a structural placeholder, not a decodable HDR histogram; codec checks are an engine-stage requirement.
const summary={verdict:'indeterminate',offeredRequests:10,successfulRequests:10,failedRequests:0,unresolvedRequests:0,attempts:10,p50Ms:5,p95Ms:null,p99Ms:null,percentileStatus:{p50:'available',p95:'insufficient_samples',p99:'insufficient_samples'},errorRateRatio:0,successLatencyHistogram:{unit:'ms',encodedTickToMs:0.001,lowestTrackableMs:0.001,highestTrackableMs:60000,significantDigits:3,encoding:'hdr-v2-base64',count:10,data:'AAAA'}};
good('low sample result remains indeterminate',summary,C.results);
good('completed baseline record',{...record,status:'completed',completedAt:record.createdAt,progressRatio:1,baseline:summary,outage:null},C.runRecordSchema);
for(const [name,change] of [['conservation',v=>v.offeredRequests=11],['wrong denominator',v=>v.errorRateRatio=1],['invented p95',v=>{v.p95Ms=5;v.percentileStatus.p95='available';}],['unsupported pass',v=>v.verdict='pass'],['invented attempts',v=>v.attempts=31]]){const value=structuredClone(summary);change(value);assert.equal(C.results.safeParse(value).success,false,name);checks++;}
assert.equal(C.runRecordSchema.safeParse({...record,status:'completed',completedAt:record.createdAt,progressRatio:1,baseline:null,outage:null}).success,false);checks++;
console.log(JSON.stringify({stage:'specification only',checks,positiveAndNegativeContracts:'passed',generatedSchemaParity:'passed',simulationExecuted:false,network:false,database:false}));
