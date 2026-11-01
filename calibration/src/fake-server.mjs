import { Worker } from "node:worker_threads";

/** Start a fake server (see fake-worker.mjs) in its own thread. Resolves to { url, stop }. */
export function startFake(options) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./fake-worker.mjs", import.meta.url), { workerData: options });
    worker.once("error", reject);
    worker.once("message", ({ port }) =>
      resolve({
        url: `http://127.0.0.1:${port}/`,
        stop: () => worker.terminate(),
      }),
    );
  });
}
