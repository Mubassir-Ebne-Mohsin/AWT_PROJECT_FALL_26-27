import http from "node:http";
import { performance } from "node:perf_hooks";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";

// The service under test: a small, well-understood Node HTTP service. Every request to "/" costs exactly `workMs` of work
// on one of `workers` worker threads (a busy wait, so the cost does not depend on the speed of the core it lands on), and
// waits first-come-first-served for a free worker. So it has a real number of parallel servers (the worker count), a fixed
// service time, and a capacity of workers / workMs. It is a toy: no database, no cache, no network.
//
//   node service.mjs --serve --workers 4 --work-ms 20 [--port 0]
//
// GET /        does the work and answers "ok".
// GET /stats   counters: served, cancelled, maxQueue, queueNow, busyWorkers, and this process's CPU time.
// GET /reset   zeroes the counters.
// A request whose client has gone away before its turn is dropped without doing the work, as a real server would see a
// closed connection; this also lets the queue drain quickly after an overloaded step.

function spin(ms) {
  const end = performance.now() + ms;
  while (performance.now() < end);
}

if (!isMainThread && workerData?.role === "worker") {
  parentPort.on("message", ({ id, workMs }) => {
    spin(workMs);
    parentPort.postMessage({ id });
  });
} else if (isMainThread && process.argv.includes("--serve")) {
  const arg = (name, fallback) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? Number(process.argv[i + 1]) : fallback;
  };
  const workers = arg("workers", 1);
  const workMs = arg("work-ms", 20);
  const port = arg("port", 0);

  const pool = Array.from({ length: workers }, () => ({ worker: new Worker(new URL(import.meta.url), { workerData: { role: "worker" } }), job: null }));
  const queue = [];
  let head = 0;
  const stats = { served: 0, cancelled: 0, maxQueue: 0 };
  let nextId = 0;

  const dispatch = () => {
    for (const slot of pool) {
      if (slot.job) continue;
      let job;
      while (head < queue.length && !job) {
        const candidate = queue[head++];
        if (candidate.cancelled) stats.cancelled++;
        else job = candidate;
      }
      if (head > 1024) {
        queue.splice(0, head);
        head = 0;
      }
      if (!job) return;
      slot.job = job;
      slot.worker.postMessage({ id: job.id, workMs });
    }
  };
  for (const slot of pool) {
    slot.worker.on("message", () => {
      const { res } = slot.job;
      slot.job = null;
      stats.served++;
      if (!res.destroyed) {
        res.writeHead(200, { "content-length": 2 });
        res.end("ok");
      }
      dispatch();
    });
  }

  const server = http.createServer((req, res) => {
    if (req.url === "/stats") {
      const cpu = process.cpuUsage();
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ...stats, queueNow: queue.length - head, busyWorkers: pool.filter((s) => s.job).length, cpuUserMs: cpu.user / 1000, cpuSystemMs: cpu.system / 1000, workers, workMs }));
      return;
    }
    if (req.url === "/reset") {
      stats.served = 0;
      stats.cancelled = 0;
      stats.maxQueue = 0;
      res.writeHead(200, { "content-length": 2 });
      res.end("ok");
      return;
    }
    const job = { id: nextId++, res, cancelled: false };
    res.on("close", () => {
      if (!res.writableEnded) job.cancelled = true;
    });
    queue.push(job);
    stats.maxQueue = Math.max(stats.maxQueue, queue.length - head);
    dispatch();
  });
  server.keepAliveTimeout = 60000;
  server.listen(port, "127.0.0.1", () => process.stdout.write(JSON.stringify({ port: server.address().port, pid: process.pid, workers, workMs }) + "\n"));
}
