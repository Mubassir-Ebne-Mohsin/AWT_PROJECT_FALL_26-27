import { test } from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { startFake } from "../src/fake-server.mjs";
import { runStep } from "../src/generator.mjs";

// The generator is validated against fake servers whose behaviour is known exactly, before it is trusted to measure a real
// service. Each test would fail for a generator that waits for replies (closed loop), times from the send instead of the
// schedule, or hides its own lateness.

async function withFake(options, fn) {
  const fake = await startFake(options);
  try {
    return await fn(fake.url);
  } finally {
    await fake.stop();
  }
}

test("against a server that always takes 20 ms, it reports about 20 ms, sends at the offered rate, and is valid", async () => {
  const r = await withFake({ mode: "fixed", ms: 20 }, (url) => runStep({ url, rps: 100, durationMs: 3000, warmupMs: 1000 }));
  assert.equal(r.errors, 0);
  assert.equal(r.valid, true, JSON.stringify(r.lateness));
  // The measured latency is the true 20 ms plus a little overhead, never below the truth.
  assert.ok(r.latency.p50 >= 20 && r.latency.p50 < 25, String(r.latency.p50));
  assert.ok(r.latency.p95 < 32, String(r.latency.p95));
  assert.ok(r.sent > 225 && r.sent < 375, String(r.sent));
  assert.equal(r.achievedRps, r.offeredRps);
  assert.ok(r.lateness.p99 < 5, String(r.lateness.p99));
});

test("it is open loop: against a server that can only do 50 a second it still sends 100 a second, and the delay shows", async () => {
  const r = await withFake({ mode: "single", ms: 20 }, (url) => runStep({ url, rps: 100, durationMs: 3000, warmupMs: 1000, timeoutMs: 1500 }));
  // A closed-loop generator would slow down to the server's pace; this one keeps its schedule.
  assert.ok(r.sent > 225, String(r.sent));
  assert.ok(r.offeredRps > 75, String(r.offeredRps));
  // The queue builds, so the median wait is many times the 20 ms service time, and some requests give up.
  assert.ok(r.latency.p50 > 200 || r.errors > 0, `p50 ${r.latency.p50}, errors ${r.errors}`);
  assert.ok(r.timeouts > 0, String(r.timeouts));
  assert.equal(r.errors, r.timeouts);
  assert.ok(r.errorRate > 0.1 && r.errorRate < 1, String(r.errorRate));
});

test("a pause in the server is counted for every request that was scheduled during it (no coordinated omission)", async () => {
  const r = await withFake({ mode: "fixed", ms: 20, stallAtMs: 1500, stallForMs: 600 }, (url) => runStep({ url, rps: 100, durationMs: 3000, warmupMs: 1000, keepRaw: true }));
  const slow = r.raw.filter((x) => x.ok && x.latency > 100);
  // About 60 requests were scheduled during the 600 ms pause; a generator that waits for replies would show only one.
  assert.ok(slow.length >= 40, String(slow.length));
  assert.ok(r.latency.max >= 500, String(r.latency.max));
  // They are spread from near 600 ms down to near zero, because they arrived at different times during the pause.
  assert.ok(r.latency.p99 > 300, String(r.latency.p99));
});

test("a pause during the warm-up is discarded and does not appear in the results", async () => {
  const r = await withFake({ mode: "fixed", ms: 20, stallAtMs: 100, stallForMs: 400 }, (url) => runStep({ url, rps: 100, durationMs: 3000, warmupMs: 1000 }));
  assert.ok(r.latency.max < 100, String(r.latency.max));
  assert.ok(r.sent > 225 && r.sent < 375, String(r.sent));
});

test("if the generator itself stalls, the lateness is reported and the run is marked invalid", async () => {
  const blocker = setTimeout(() => {
    const until = performance.now() + 300;
    while (performance.now() < until);
  }, 1500);
  const r = await withFake({ mode: "fixed", ms: 20 }, (url) => runStep({ url, rps: 100, durationMs: 3000, warmupMs: 1000, keepRaw: true }));
  clearTimeout(blocker);
  assert.ok(r.lateness.max >= 200, String(r.lateness.max));
  assert.ok(r.lateness.p99 > 5);
  assert.equal(r.valid, false);
  // The delay is still in the latency (it is measured from the schedule), so nothing is quietly hidden.
  assert.ok(r.latency.max >= 250, String(r.latency.max));
  // Every latency includes that request's own lateness: a request sent 250 ms late cannot report 20 ms.
  for (const x of r.raw.filter((y) => y.ok)) assert.ok(x.latency >= x.sentLate - 0.5, `${x.latency} < ${x.sentLate}`);
});

test("replies that are HTTP errors count as errors, not as successful latencies", async () => {
  const r = await withFake({ mode: "fixed", ms: 5, status: 500 }, (url) => runStep({ url, rps: 100, durationMs: 1500, warmupMs: 500 }));
  assert.ok(r.sent > 100);
  assert.equal(r.errors, r.sent);
  assert.equal(r.timeouts, 0);
  assert.equal(r.errorRate, 1);
  assert.equal(r.latency.count, 0);
  assert.equal(r.achievedRps, 0);
});

test("the time allowed to answer runs from the scheduled time, so a late send does not get extra time", async () => {
  const blocker = setTimeout(() => {
    const until = performance.now() + 300;
    while (performance.now() < until);
  }, 1500);
  const r = await withFake({ mode: "fixed", ms: 20 }, (url) => runStep({ url, rps: 100, durationMs: 3000, warmupMs: 1000, timeoutMs: 250 }));
  clearTimeout(blocker);
  // Requests scheduled early in the 300 ms stall were sent more than 250 ms late: already out of time when sent.
  assert.ok(r.timeouts >= 3, String(r.timeouts));
  assert.equal(r.valid, false);
});

test("a server that cannot be reached gives errors for every request, no latency numbers, and zero throughput", async () => {
  const r = await runStep({ url: "http://127.0.0.1:1/", rps: 50, durationMs: 1000, warmupMs: 200, timeoutMs: 500 });
  assert.ok(r.sent > 20);
  assert.equal(r.errors, r.sent);
  assert.equal(r.errorRate, 1);
  assert.equal(r.achievedRps, 0);
  assert.equal(r.latency.count, 0);
  assert.ok(Number.isNaN(r.latency.p95));
});

test("the same seed schedules the same arrivals, so a run can be repeated", async () => {
  const run = () => withFake({ mode: "fixed", ms: 5 }, (url) => runStep({ url, rps: 80, durationMs: 1500, warmupMs: 500, seed: 11, keepRaw: true }));
  const a = await run();
  const b = await run();
  assert.deepEqual(a.raw.map((x) => x.offset), b.raw.map((x) => x.offset));
});

test("only requests scheduled after the warm-up are counted", async () => {
  const r = await withFake({ mode: "fixed", ms: 5 }, (url) => runStep({ url, rps: 100, durationMs: 2000, warmupMs: 1000, keepRaw: true }));
  for (const x of r.raw) assert.ok(x.offset >= 1000);
  assert.ok(r.sent > 150 && r.sent < 250, String(r.sent));
});
