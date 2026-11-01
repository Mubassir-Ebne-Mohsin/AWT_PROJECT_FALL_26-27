import http from "node:http";
import { parentPort, workerData } from "node:worker_threads";
import { performance } from "node:perf_hooks";

// A fake server with a KNOWN latency, used only to check the load generator against a known truth. It runs in its own
// thread so the generator's event loop is not shared with it, and it answers at exact times (a spin on setImmediate,
// because Windows timers tick about every 15.6 ms).
//   mode "fixed":  every request is answered `ms` after it arrives, however many arrive at once (no queueing).
//   mode "single": one server, first come first served, each request takes `ms`, so requests queue up when they arrive
//                  faster than 1000/ms per second.
// status: the HTTP status every reply carries (200 unless a test needs an error).
// stallAtMs / stallForMs: starting stallAtMs after the first request, nothing finishes for stallForMs.
const { mode, ms, stallAtMs = null, stallForMs = 0, status = 200 } = workerData;
const queue = [];
let head = 0;
let busyUntil = 0;
let firstAt = null;

const server = http.createServer((req, res) => {
  const now = performance.now();
  firstAt ??= now;
  let due;
  if (mode === "single") {
    const start = Math.max(now, busyUntil);
    busyUntil = start + ms;
    due = busyUntil;
  } else {
    due = now + ms;
  }
  if (stallAtMs !== null) {
    const from = firstAt + stallAtMs;
    const to = from + stallForMs;
    if (due >= from && due < to) due = to;
  }
  queue.push({ due, res });
});

const pump = () => {
  const now = performance.now();
  while (head < queue.length && queue[head].due <= now) {
    const { res } = queue[head++];
    res.writeHead(status, { "content-length": 2 });
    res.end("ok");
  }
  if (head > 4096) {
    queue.splice(0, head);
    head = 0;
  }
  setImmediate(pump);
};
pump();

server.listen(0, "127.0.0.1", () => parentPort.postMessage({ port: server.address().port }));
