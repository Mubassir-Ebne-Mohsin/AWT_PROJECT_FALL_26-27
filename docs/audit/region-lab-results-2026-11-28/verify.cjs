/* Offline compiled-code replay. No application bootstrap, credentials, DB or provider. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const repo=path.resolve(__dirname,'../../..'),backend=path.join(repo,'nest-boilerplate/nest-boilerplate'),engine=path.join(backend,'dist/modules/region-lab/engine');
const {simulateComponents}=require(path.join(engine,'component-engine.js'));
const {simulateRegional}=require(path.join(engine,'regional-engine.js'));
const old4=JSON.parse(fs.readFileSync(path.join(repo,'docs/audit/region-lab-components-2026-11-27/verification.json')));
const old5=JSON.parse(fs.readFileSync(path.join(repo,'docs/audit/region-lab-regions-2026-11-28/verification.json')));
for(const c of old4.cases)assert.deepEqual(simulateComponents(c.input),c.result);
for(const c of old5.cases)assert.deepEqual(simulateRegional(c.input),c.result);
const foundation=JSON.parse(fs.readFileSync(path.join(repo,'docs/audit/region-lab-foundation-2026-11-27/verification.json')));
const changed=Object.entries(foundation.sourceSha256).filter(([name,hash])=>createHash('sha256').update(fs.readFileSync(path.join(backend,'src/modules/region-lab/engine',name))).digest('hex')!==hash).map(([name])=>name);
assert.deepEqual(changed,['engine.ts']); // Only the optional capture callback type extends the old foundation file.
const output={date:'2026-11-28',nodeVersion:process.version,stage4ExactGoldenCases:old4.cases.length,stage5ExactGoldenCases:old5.cases.length,foundationSourceChanges:changed,foundationFilesUnchanged:Object.keys(foundation.sourceSha256).length-changed.length,numericalDefaultsPreserved:true,calibrated:false};
fs.writeFileSync(path.join(__dirname,'numerical-compatibility.json'),JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output,null,2));
