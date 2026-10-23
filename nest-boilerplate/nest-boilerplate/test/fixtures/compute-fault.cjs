// Test-only worker entry. Production worker accepts only validated calculation messages.
const { parentPort, workerData } = require("node:worker_threads");
parentPort.on("message", message => {
  if(workerData.signal) Atomics.store(new Int32Array(workerData.signal),0,1);
  if(workerData.mode==="hang") { while(true) { /* deliberately occupy only this worker */ } }
  if(workerData.mode==="throw") throw new Error("private-worker-sentinel");
  if(workerData.mode==="crash") process.exit(7);
  if(workerData.mode==="wrong") parentPort.postMessage({id:message.id,result:workerData.result});
  else parentPort.postMessage({id:message.id,result:{malformed:true}});
});
