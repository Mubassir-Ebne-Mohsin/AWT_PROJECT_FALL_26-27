/* Fixed trusted compiled worker; no application bootstrap, credentials or environment files. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const repo = path.resolve(__dirname, '../../..');
const backend = path.join(repo, 'nest-boilerplate/nest-boilerplate');
const { frozenSnapshot } = require(path.join(backend, 'dist/modules/region-lab/region-policy.js'));
const { RegionExecutor, regionChildLaunch } = require(path.join(backend, 'dist/modules/region-lab/worker/region-executor.js'));
async function main() {
  const scenario = JSON.parse(fs.readFileSync(path.join(repo, 'docs/region-lab/examples.json'), 'utf8')).baseline;
  scenario.profiles.forEach(p => { p.origin = 'custom'; });
  Object.assign(scenario.workload, { arrival: 'constant_rate', baselineRps: 1, warmupSeconds: 0, durationSeconds: 10,
    schedule: [{atSeconds: 0, multiplier: 1}, {atSeconds: 10, multiplier: 1}] });
  scenario.runOptions = {mode: 'baseline', seed: 42, repetitions: 1};
  const snapshot = frozenSnapshot(scenario);
  const launch = regionChildLaunch();
  assert.ok(launch.entry.endsWith('region-compute.worker.js'));
  assert.ok(!launch.options.execArgv.includes('-r'));
  assert.deepEqual(Object.keys(launch.options.env).sort(), ['NODE_ENV','TEMP','TMP']);
  const started = performance.now();
  const result = await new RegionExecutor().run(randomUUID(), randomUUID(), snapshot, new AbortController().signal);
  const summary = result.repetitions[0].baseline.summary;
  assert.equal(summary.offeredRequests, 10);
  assert.equal(summary.successfulRequests, 10);
  const evidence = {date:'2026-11-28',nodeVersion:process.version,kind:'local compiled-worker engineering smoke, not production benchmark',
    elapsedMs:Math.round(performance.now()-started),engineDigest:snapshot.engineDigest,inputHash:snapshot.inputHash,
    childEnvKeys:Object.keys(launch.options.env),execArgv:launch.options.execArgv,summary,processedEvents:result.processedEvents,
    resolvesOnlyAfterChildClose:true,calibrated:false};
  fs.writeFileSync(path.join(__dirname,'compiled-worker.json'),JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify(evidence,null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
