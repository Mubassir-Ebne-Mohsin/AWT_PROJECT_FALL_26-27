import { tmpdir } from "node:os";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Worker } from "node:worker_threads";

export const WORKER_RESOURCES = Object.freeze({
  maxOldGenerationSizeMb: 128,
  maxYoungGenerationSizeMb: 16,
  stackSizeMb: 4,
});
/** Nest watch/production execute the compiled sibling; ts-node/Jest use the TS entry. */
export function createComputeWorker(): Worker {
  const runtimeEnv = {
    NODE_ENV: process.env.NODE_ENV ?? "development",
    TEMP: tmpdir(),
    TMP: tmpdir(),
  };
  const compiled = resolve(__dirname, "compute.worker.js");
  if (existsSync(compiled))
    return new Worker(compiled, {
      resourceLimits: WORKER_RESOURCES,
      env: runtimeEnv,
    });
  return new Worker(resolve(__dirname, "compute.worker.ts"), {
    execArgv: ["-r", resolve(__dirname, "register-source.cjs")],
    env: {
      ...runtimeEnv,
      TS_NODE_PROJECT: resolve(__dirname, "../../../../tsconfig.json"),
    },
    resourceLimits: WORKER_RESOURCES,
  });
}
