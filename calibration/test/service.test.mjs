import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

// The service under test must really have the worker count and service time it claims, or the model comparison means
// nothing. These tests check the work time, that four workers do four times the work of one, that requests queue in order,
// and that requests abandoned while waiting are dropped.
const SERVICE = fileURLToPath(new URL("../src/service.mjs", import.meta.url));

function start(workers, workMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SERVICE, "--serve", "--workers", String(workers), "--work-ms", String(workMs)], { stdio: ["ignore", "pipe", "inherit"] });
    child.once("error", reject);
    child.stdout.once("data", (chunk) => {
      const info = JSON.parse(String(chunk));
      resolve({ ...info, stop: () => child.kill() });
    });
  });
}

const agent = new http.Agent({ keepAlive: true, maxSockets: 256 });
const get = (port, path = "/") =>
  new Promise((resolve, reject) => {
    const sentAt = performance.now();
    const req = http.get({ host: "127.0.0.1", port, path, agent }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString(), ms: performance.now() - sentAt }));
    });
    req.on("error", reject);
  });

async function drain(port, n) {
  const t0 = performance.now();
  const results = await Promise.all(Array.from({ length: n }, () => get(port)));
  return { seconds: (performance.now() - t0) / 1000, results };
}

test("one request costs about the work time, and the answer is ok", async () => {
  const s = await start(1, 20);
  try {
    await get(s.port);
    const r = await get(s.port);
    assert.equal(r.status, 200);
    assert.equal(r.body, "ok");
    assert.ok(r.ms >= 20 && r.ms < 30, String(r.ms));
  } finally {
    s.stop();
  }
});

test("with one worker, 40 requests at once take about 40 x the work time, and the stats count them", async () => {
  const s = await start(1, 20);
  try {
    await get(s.port);
    await get(s.port, "/reset");
    const { seconds } = await drain(s.port, 40);
    assert.ok(seconds >= 0.8 && seconds < 1.0, String(seconds));
    const stats = JSON.parse((await get(s.port, "/stats")).body);
    assert.equal(stats.served, 40);
    assert.equal(stats.cancelled, 0);
    assert.ok(stats.maxQueue >= 30, String(stats.maxQueue));
    assert.equal(stats.queueNow, 0);
    assert.equal(stats.workers, 1);
    assert.equal(stats.workMs, 20);
  } finally {
    s.stop();
  }
});

test("four workers really are four servers: the same 40 requests finish about four times faster", async () => {
  const one = await start(1, 20);
  const four = await start(4, 20);
  try {
    await get(one.port);
    await get(four.port);
    const slow = (await drain(one.port, 40)).seconds;
    const fast = (await drain(four.port, 40)).seconds;
    const ratio = slow / fast;
    assert.ok(ratio > 3.4 && ratio < 4.4, `ratio ${ratio} (${slow} vs ${fast})`);
    assert.ok(fast >= 0.2 && fast < 0.3, String(fast));
  } finally {
    one.stop();
    four.stop();
  }
});

test("requests are served in the order they arrived", async () => {
  const s = await start(1, 15);
  try {
    await get(s.port);
    const finished = [];
    await Promise.all(Array.from({ length: 12 }, (_, i) => get(s.port).then(() => finished.push(i))));
    assert.deepEqual(finished, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  } finally {
    s.stop();
  }
});

test("requests abandoned while waiting are dropped without doing the work", async () => {
  const s = await start(1, 20);
  try {
    await get(s.port);
    await get(s.port, "/reset");
    const requests = Array.from({ length: 30 }, () => {
      const req = http.get({ host: "127.0.0.1", port: s.port, path: "/", agent: false });
      req.on("error", () => {});
      return req;
    });
    await new Promise((r) => setTimeout(r, 30));
    // About one has been done and one is being worked on; the rest are still waiting. Hang up on all of them.
    for (const req of requests) req.destroy();
    await new Promise((r) => setTimeout(r, 300));
    const stats = JSON.parse((await get(s.port, "/stats")).body);
    assert.ok(stats.served <= 3, `served ${stats.served}`);
    assert.ok(stats.cancelled >= 25, `cancelled ${stats.cancelled}`);
    assert.equal(stats.queueNow, 0);
    // And the service still works afterwards.
    assert.equal((await get(s.port)).status, 200);
  } finally {
    s.stop();
  }
});

test("reset zeroes the counters", async () => {
  const s = await start(2, 5);
  try {
    await drain(s.port, 10);
    assert.ok(JSON.parse((await get(s.port, "/stats")).body).served >= 10);
    await get(s.port, "/reset");
    const after = JSON.parse((await get(s.port, "/stats")).body);
    assert.equal(after.served, 0);
    assert.equal(after.maxQueue, 0);
  } finally {
    s.stop();
  }
});
