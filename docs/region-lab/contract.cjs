// Region Lab v1 DRAFT: executable specification only. Never imported by the application.
const {createRequire}=require('node:module');
const {resolve}=require('node:path');
const {z}=createRequire(resolve(__dirname,'../../nest-boilerplate/nest-boilerplate/package.json'))('zod');
const localId=z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/).refine(v=>!['__proto__','prototype','constructor'].includes(v),'Reserved identifier');
const regionId=z.enum(['us-east','eu-west','ap-south']);
const integer=(min,max)=>z.number().int().min(min).max(max);
const finite=(min,max)=>z.number().min(min).max(max);
const distribution=z.discriminatedUnion('kind',[
 z.strictObject({kind:z.literal('constant'),valueMs:finite(0,60000)}),
 z.strictObject({kind:z.literal('exponential'),meanMs:finite(0.001,60000)}),
 z.strictObject({kind:z.literal('lognormal'),meanMs:finite(0.001,60000),coefficientOfVariation:finite(0.01,3)}),
]);
const service={serviceTime:distribution,serviceSlotsPerReplica:integer(1,1024),waitingCapacity:integer(0,100000)};
const readWriteService={readServiceTime:distribution,writeServiceTime:distribution,serviceSlotsPerReplica:integer(1,1024),waitingCapacity:integer(0,100000)};
const profileCommon={id:localId,version:integer(1,1000000),label:z.string().trim().min(1).max(100),origin:z.enum(['reference','measured','custom']),provenance:z.string().trim().min(1).max(500)};
const profile=(component,properties)=>z.strictObject({...profileCommon,component:z.literal(component),properties:z.strictObject(properties)});
const profileSchema=z.discriminatedUnion('component',[
 profile('cdn',{...service,hitRatio:finite(0,1),hitTime:distribution}),
 profile('lb',service),
 profile('gateway',{...service,rateLimitRps:finite(0.001,1000000),rateLimitBurstRequests:integer(1,1000000)}),
 profile('app',service),
 profile('worker',service),
 profile('cache',{...service,hitRatio:finite(0,1),hitTime:distribution}),
 profile('db',readWriteService),
 profile('replica',{...service,replicationApplyTime:distribution}),
 profile('queue',{maxDepthJobs:integer(1,1000000),ackTime:distribution,overflowPolicy:z.enum(['reject_new','drop_oldest']),maxDeliveryAttempts:integer(1,3),redeliveryDelayMs:integer(1,60000)}),
 profile('storage',{...readWriteService,aggregateBandwidthMbps:finite(0.001,1000000)}),
 profile('external',{...service,rateLimitRps:finite(0.001,1000000),rateLimitBurstRequests:integer(1,1000000)}),
]);
const geometry={id:localId,label:z.string().trim().min(1).max(80),x:finite(-100000,100000),y:finite(-100000,100000)};
const assigned={...geometry,region:regionId};
const profiled={...assigned,profileId:localId,profileVersion:integer(1,1000000),replicas:integer(1,200)};
const node=(type,shape)=>z.strictObject({...shape,type:z.literal(type)});
const nodeSchema=z.discriminatedUnion('type',[
 node('client',assigned),
 ...['cdn','lb','gateway','app','worker','cache'].map(type=>node(type,profiled)),
 ...['db','queue','storage','external'].map(type=>node(type,{...profiled,replicas:z.literal(1)})),
 node('replica',{...profiled,replicas:z.literal(1),primaryNodeId:localId}),
]);
const edgeSchema=z.strictObject({id:localId,from:localId,to:localId,operationIds:z.array(localId).min(1).max(8),dispatch:z.enum(['all','weighted_one']),weight:integer(1,10000),mode:z.enum(['sync','async'])});
const retry=z.strictObject({maxAttempts:integer(1,3),baseBackoffMs:integer(1,10000),maxBackoffMs:integer(1,60000),jitterRatio:finite(0,1)});
const operation=z.strictObject({id:localId,label:z.string().trim().min(1).max(80),kind:z.enum(['read','write']),shareBps:integer(1,10000),requestBytes:integer(0,16777216),responseBytes:integer(0,16777216),deadlineMs:integer(1,60000),idempotent:z.boolean(),retry});
const route=z.strictObject({originRegion:regionId,operationId:localId,policy:z.enum(['explicit','nearest_healthy']),primaryEntryNodeId:localId,fallbackEntryNodeIds:z.array(localId).max(2),detectionMs:integer(0,60000),switchMs:integer(0,60000),failbackMs:integer(0,60000),returnOnRecovery:z.boolean()});
const scenarioBase=z.strictObject({
 schemaVersion:z.literal(1),engineContract:z.literal('region-lab-event-v1-draft'),
 regions:z.array(regionId).min(1).max(3),
 profiles:z.array(profileSchema).min(1).max(36),
 graph:z.strictObject({nodes:z.array(nodeSchema).min(2).max(36),edges:z.array(edgeSchema).max(120)}),
 network:z.array(z.strictObject({from:regionId,to:regionId,oneWayDelay:distribution,bandwidthMbps:finite(0.001,1000000),provenance:z.string().trim().min(1).max(500)})).min(1).max(9),
 workload:z.strictObject({baselineRps:finite(0,20000),arrival:z.enum(['constant_rate','poisson']),durationSeconds:integer(10,3600),warmupSeconds:integer(0,120),drainSeconds:integer(1,60),regionalShares:z.array(z.strictObject({region:regionId,shareBps:integer(0,10000)})).min(1).max(3),operations:z.array(operation).min(1).max(8),schedule:z.array(z.strictObject({atSeconds:integer(0,3600),multiplier:finite(0,10)})).min(2).max(32)}),
 routing:z.array(route).min(1).max(24),
 outage:z.strictObject({id:localId,scope:z.literal('application_deployment'),region:regionId,affectedNodeIds:z.array(localId).min(1).max(12),startSeconds:integer(0,3600),durationSeconds:integer(1,3600),inFlightPolicy:z.literal('abort_at_failed_node')}).nullable(),
 targets:z.strictObject({p95Ms:finite(1,60000),errorBudgetRatio:finite(0,1),perRegion:z.array(z.strictObject({region:regionId,p95Ms:finite(1,60000),errorBudgetRatio:finite(0,1)})).max(3)}),
 runOptions:z.strictObject({mode:z.enum(['baseline','outage','paired']),seed:integer(0,4294967295),repetitions:integer(1,5)}),
});
const uniq=values=>new Set(values).size===values.length;
const mean=d=>d.kind==='constant'?d.valueMs:d.meanMs;
function semantics(s,ctx){
 const issue=(path,message)=>ctx.addIssue({code:'custom',path,message});
 const ids=s.graph.nodes.map(n=>n.id),nodes=new Map(s.graph.nodes.map(n=>[n.id,n])),ops=s.workload.operations.map(o=>o.id);
 if(!uniq(s.regions))issue(['regions'],'Duplicate region');
 if(!uniq([...ids,...s.graph.edges.map(e=>e.id)]))issue(['graph'],'Node/edge identifiers must be unique');
 const active=new Set(s.regions),profileKeys=s.profiles.map(p=>p.id+'@'+p.version);
 if(!uniq(profileKeys))issue(['profiles'],'Duplicate profile version');
 const profiles=new Map(s.profiles.map(p=>[p.id+'@'+p.version,p]));
 for(const [i,n] of s.graph.nodes.entries()){
  if(!active.has(n.region))issue(['graph','nodes',i,'region'],'Inactive region');
  if(n.type!=='client'){
   const p=profiles.get(n.profileId+'@'+n.profileVersion);
   if(!p||p.component!==n.type)issue(['graph','nodes',i,'profileId'],'Missing or wrong-type profile');
   if(p){const services=['serviceTime','readServiceTime','writeServiceTime'].filter(k=>k in p.properties);for(const k of services)if(mean(p.properties[k])<=0)issue(['profiles'],'Processing service demand must be positive');}
  }
  if(n.type==='replica'&&nodes.get(n.primaryNodeId)?.type!=='db')issue(['graph','nodes',i,'primaryNodeId'],'Replica must reference the single primary');
 }
 if(s.graph.nodes.filter(n=>n.type==='db').length!==1)issue(['graph','nodes'],'Exactly one primary database required in v1');
 if(!uniq(ops)||s.workload.operations.reduce((a,o)=>a+o.shareBps,0)!==10000)issue(['workload','operations'],'Unique operation IDs with shares totalling10000 required');
 for(const [i,o] of s.workload.operations.entries()){
  if(!o.idempotent&&o.retry.maxAttempts>1)issue(['workload','operations',i,'retry'],'Retries require idempotency');
  if(o.retry.baseBackoffMs>o.retry.maxBackoffMs)issue(['workload','operations',i,'retry'],'Backoff cap below base');
  if(o.deadlineMs>s.workload.drainSeconds*1000)issue(['workload','drainSeconds'],'Drain must cover maximum request deadline');
 }
 const shares=s.workload.regionalShares;
 if(!uniq(shares.map(v=>v.region))||shares.length!==s.regions.length||shares.some(v=>!active.has(v.region))||shares.reduce((a,v)=>a+v.shareBps,0)!==10000)issue(['workload','regionalShares'],'One share per active region; total10000');
 for(const r of s.regions)if(s.graph.nodes.filter(n=>n.type==='client'&&n.region===r).length!==1)issue(['graph','nodes'],'Exactly one client origin per active region');
 const netKeys=s.network.map(v=>v.from+'>'+v.to);
 if(!uniq(netKeys)||s.network.some(v=>!active.has(v.from)||!active.has(v.to)))issue(['network'],'Duplicate or inactive network pair');
 for(const a of s.regions)for(const b of s.regions)if(!netKeys.includes(a+'>'+b))issue(['network'],'Every ordered region pair, including local, is required');
 const schedule=s.workload.schedule;
 if(schedule[0].atSeconds!==0||schedule.at(-1).atSeconds!==s.workload.durationSeconds||schedule.some((v,i)=>i>0&&v.atSeconds<=schedule[i-1].atSeconds))issue(['workload','schedule'],'Ordered knots must span0 to duration');
 const pairs=new Set(),adj=new Map(ids.map(id=>[id,[]]));
 for(const [i,e] of s.graph.edges.entries()){
  if(!nodes.has(e.from)||!nodes.has(e.to)||e.from===e.to)issue(['graph','edges',i],'Unknown endpoint or self-edge');
  if(nodes.get(e.from)?.type==='client'||nodes.get(e.to)?.type==='client')issue(['graph','edges',i],'Client origins use routing entries instead of request-flow edges');
  const key=e.from+'>'+e.to;if(pairs.has(key))issue(['graph','edges',i],'Duplicate edge');pairs.add(key);
  if(!uniq(e.operationIds)||e.operationIds.some(id=>!ops.includes(id)))issue(['graph','edges',i,'operationIds'],'Unknown/duplicate operation');
  if(e.mode==='async'&&nodes.get(e.to)?.type!=='queue')issue(['graph','edges',i,'mode'],'Async handoff must target queue');
  if(e.dispatch==='all'&&e.weight!==1)issue(['graph','edges',i,'weight'],'Fan-out weight must be1');
  adj.get(e.from)?.push(e.to);
 }
 const gray=new Set(),black=new Set();function visit(id){if(gray.has(id))return false;if(black.has(id))return true;gray.add(id);for(const next of adj.get(id)||[])if(!visit(next))return false;gray.delete(id);black.add(id);return true;}
 if(ids.some(id=>!visit(id)))issue(['graph'],'Request-flow graph must be acyclic');
 for(const n of s.graph.nodes)for(const op of ops){const out=s.graph.edges.filter(e=>e.from===n.id&&e.operationIds.includes(op));if(out.length&&(!out.every(e=>e.dispatch===out[0].dispatch)||out[0].dispatch==='weighted_one'&&out.reduce((a,e)=>a+e.weight,0)!==10000))issue(['graph','edges'],'Outgoing dispatch must agree; weighted choices total10000 per node/operation');}
 const routes=s.routing.map(r=>r.originRegion+'>'+r.operationId);
 if(!uniq(routes)||s.routing.some(r=>!active.has(r.originRegion)||!ops.includes(r.operationId)))issue(['routing'],'Unknown or duplicate route');
 for(const region of s.regions)for(const op of ops)if(!routes.includes(region+'>'+op))issue(['routing'],'A route is required for each origin/operation');
 const reachable=(start,target,op)=>{const seen=new Set(),todo=[start];while(todo.length){const id=todo.pop();if(id===target)return true;if(seen.has(id))continue;seen.add(id);todo.push(...s.graph.edges.filter(e=>e.from===id&&e.operationIds.includes(op)&&e.mode==='sync').map(e=>e.to));}return false;};
 for(const [i,r] of s.routing.entries()){
  const entries=[r.primaryEntryNodeId,...r.fallbackEntryNodeIds];
  if(!uniq(entries))issue(['routing',i],'Repeated fallback or primary');
  for(const id of entries){const n=nodes.get(id);if(!n||!['lb','gateway','app'].includes(n.type))issue(['routing',i],'Entry must be a load balancer, gateway or app');
   const primary=s.graph.nodes.find(n=>n.type==='db'),operation=s.workload.operations.find(o=>o.id===r.operationId);
   const destinations=s.graph.nodes.filter(n=>n.type==='db'||operation?.kind==='read'&&n.type==='replica');
   if(primary&&!destinations.some(n=>reachable(id,n.id,r.operationId)))issue(['routing',i],'Entry must retain a synchronous data path (writes to primary, reads to primary or replica)');
  }
 }
 if(!uniq(s.targets.perRegion.map(t=>t.region))||s.targets.perRegion.some(t=>!active.has(t.region)))issue(['targets','perRegion'],'Unknown/duplicate regional target');
 if(s.outage){const o=s.outage;if(!active.has(o.region)||o.startSeconds+o.durationSeconds>s.workload.durationSeconds)issue(['outage'],'Outage must use an active region and fit the measurement window');if(!uniq(o.affectedNodeIds))issue(['outage','affectedNodeIds'],'Duplicate outage node');for(const id of o.affectedNodeIds){const n=nodes.get(id);if(!n||n.region!==o.region||!['lb','gateway','app','cache','worker'].includes(n.type))issue(['outage','affectedNodeIds'],'Only declared application-deployment components in that region may fail in v1');}}
 if(s.runOptions.mode!=='baseline'&&!s.outage)issue(['outage'],'Outage/paired mode requires an outage definition');
}
const scenarioSchema=scenarioBase.superRefine(semantics);
const createSchema=z.strictObject({name:z.string().trim().min(1).max(100),description:z.string().max(2000),sourceDesign:z.strictObject({id:z.uuid(),revision:integer(1,2147483647)}).nullable().optional(),scenario:scenarioSchema});
const patchSchema=z.strictObject({expectedRevision:integer(1,2147483647),name:z.string().trim().min(1).max(100).optional(),description:z.string().max(2000).optional(),scenario:scenarioSchema.optional()}).refine(v=>Object.keys(v).length>1,'Supply a change');
const runRequestSchema=z.strictObject({expectedRevision:integer(1,2147483647),requestId:z.uuid()});
const histogram=z.strictObject({unit:z.literal('ms'),encodedTickToMs:z.literal(0.001),lowestTrackableMs:z.literal(0.001),highestTrackableMs:z.literal(60000),significantDigits:z.literal(3),encoding:z.literal('hdr-v2-base64'),count:integer(0,1000000000),data:z.string().min(4).max(262144).regex(/^[A-Za-z0-9+/]+={0,2}$/)});
const metricStatus=z.enum(['available','insufficient_samples','incomplete']);
const results=z.strictObject({verdict:z.enum(['pass','fail','indeterminate']),offeredRequests:integer(0,1000000000),successfulRequests:integer(0,1000000000),failedRequests:integer(0,1000000000),unresolvedRequests:integer(0,1000000000),attempts:integer(0,3000000000),p50Ms:finite(0,60000).nullable(),p95Ms:finite(0,60000).nullable(),p99Ms:finite(0,60000).nullable(),percentileStatus:z.strictObject({p50:metricStatus,p95:metricStatus,p99:metricStatus}),errorRateRatio:finite(0,1).nullable(),successLatencyHistogram:histogram.nullable()}).superRefine((v,ctx)=>{
 const fail=message=>ctx.addIssue({code:'custom',message});
 if(v.offeredRequests!==v.successfulRequests+v.failedRequests+v.unresolvedRequests)fail('Request conservation violated');
 if(v.attempts<v.offeredRequests||v.attempts>v.offeredRequests*3)fail('Attempt count inconsistent with root requests');
 const rate=v.offeredRequests?v.failedRequests/v.offeredRequests:null;
 if(rate===null?v.errorRateRatio!==null:v.errorRateRatio===null||Math.abs(rate-v.errorRateRatio)>1e-12)fail('Error denominator mismatch');
 if(v.unresolvedRequests>0&&v.verdict!=='indeterminate')fail('Unresolved requests prohibit a definitive verdict');
 for(const [key,min] of [['p50',1],['p95',1000],['p99',10000]]){const value=v[key+'Ms'],status=v.percentileStatus[key];if(status==='available'&&(value===null||v.successfulRequests<min))fail('Insufficient percentile samples');if(status!=='available'&&value!==null)fail('Unavailable percentile must be null');}
 if(v.p50Ms!==null&&v.p95Ms!==null&&v.p50Ms>v.p95Ms||v.p95Ms!==null&&v.p99Ms!==null&&v.p95Ms>v.p99Ms)fail('Percentiles out of order');
 if(v.successLatencyHistogram&&v.successLatencyHistogram.count!==v.successfulRequests)fail('Histogram count mismatch');
 if(v.successfulRequests>0&&!v.successLatencyHistogram)fail('Successful observations require a histogram');
 if(v.verdict==='pass'&&v.p95Ms===null)fail('Cannot pass without an available p95');
});
const runRecordBase={id:z.uuid(),experimentId:z.uuid(),experimentRevision:integer(1,2147483647),inputHash:z.string().regex(/^[a-f0-9]{64}$/),engineVersion:z.string().min(1).max(80),mode:z.enum(['baseline','outage','paired']),createdAt:z.iso.datetime()};
const runRecordSchema=z.discriminatedUnion('status',[
 z.strictObject({...runRecordBase,status:z.literal('queued'),progressRatio:z.literal(0)}),
 z.strictObject({...runRecordBase,status:z.literal('running'),startedAt:z.iso.datetime(),progressRatio:finite(0,1)}),
 z.strictObject({...runRecordBase,status:z.literal('completed'),completedAt:z.iso.datetime(),progressRatio:z.literal(1),baseline:results.nullable(),outage:results.nullable()}),
 z.strictObject({...runRecordBase,status:z.literal('failed'),completedAt:z.iso.datetime(),failure:z.strictObject({code:z.enum(['INVALID_SCENARIO','UNSUPPORTED_CAPABILITY','BUDGET_EXCEEDED','DEADLINE_EXCEEDED','WORKER_INTERRUPTED','COMPUTE_FAILED']),message:z.string().max(500)})}),
 z.strictObject({...runRecordBase,status:z.literal('cancelled'),completedAt:z.iso.datetime()}),
]).superRefine((v,ctx)=>{if(v.status==='completed'){const ok=v.mode==='baseline'?v.baseline!==null&&v.outage===null:v.mode==='outage'?v.baseline===null&&v.outage!==null:v.baseline!==null&&v.outage!==null;if(!ok)ctx.addIssue({code:'custom',message:'Completed result sides must match run mode'});}});
const resultPageSchema=z.discriminatedUnion('view',[
 z.strictObject({view:z.literal('regions'),scenario:z.enum(['baseline','outage']),items:z.array(z.strictObject({region:regionId,summary:results})).max(3),nextCursor:z.string().max(256).nullable()}),
 z.strictObject({view:z.literal('components'),scenario:z.enum(['baseline','outage']),items:z.array(z.strictObject({nodeId:localId,region:regionId,kind:z.enum(['service','queue']),offeredCalls:integer(0,3000000000),completedCalls:integer(0,3000000000),rejectedCalls:integer(0,3000000000),timedOutCalls:integer(0,3000000000),utilizationRatio:finite(0,1).nullable(),peakQueueDepth:integer(0,1000000000),endingQueueDepth:integer(0,1000000000)})).max(36),nextCursor:z.string().max(256).nullable()}),
 z.strictObject({view:z.literal('timeline'),scenario:z.enum(['baseline','outage']),items:z.array(z.strictObject({startSeconds:finite(0,3660),endSeconds:finite(0,3660),phase:z.enum(['healthy','undetected_outage','switching','rerouted','recovering','recovered','draining']),offeredRequests:integer(0,1000000000),successfulRequests:integer(0,1000000000),failedRequests:integer(0,1000000000),p95Ms:finite(0,60000).nullable(),peakQueueDepth:integer(0,1000000000)})).max(120),nextCursor:z.string().max(256).nullable()}),
]);
module.exports={profileSchema,scenarioBase,scenarioSchema,createSchema,patchSchema,runRequestSchema,runRecordSchema,resultPageSchema,results,semantics,z};
