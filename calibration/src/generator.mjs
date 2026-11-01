import http from "node:http";
import { performance } from "node:perf_hooks";
import { seeded, summarize } from "./stats.mjs";

// An open-loop load generator. Requests are sent at their scheduled times whatever the server is doing, and every latency
// is measured from the moment the request was SCHEDULED, not from when it happened to be sent. A generator that waited for
// each reply before sending the next would hide queueing delay (coordinated omission) and make any service look better.
//
// The Windows timer ticks about every 15.6 ms, which would send requests in clumps. So this spins on setImmediate and a
// high-resolution clock instead of setTimeout. It uses one full core; run it on its own core. It records how late each
// send was, and a run whose sends were late is marked invalid rather than reported as if it were good.

/** Scheduled send times, in ms from the start. Poisson (random gaps, the arrival pattern the model assumes) or evenly spaced. */
export function arrivalOffsets({ rps, durationMs, arrival = "poisson", seed = 1 }) {
  if (!(rps > 0)) return [];
  const out = [];
  if (arrival === "uniform") {
    for (let t = 0; t < durationMs; t += 1000 / rps) out.push(t);
    return out;
  }
  const random = seeded(seed);
  let t = 0;
  for (;;) {
    t += (-Math.log(1 - random()) / rps) * 1000;
    if (t >= durationMs) return out;
    out.push(t);
  }
}

/**
 * Send requests to `url` at a mean rate of `rps` for warmupMs + durationMs, and report only the requests scheduled after the
 * warm-up. A request that is not answered within timeoutMs of its scheduled time counts as an error.
 */
export async function runStep({ url, rps, durationMs, warmupMs = 5000, timeoutMs = 3000, arrival = "poisson", seed = 1, maxLatenessMs = 5, maxSockets = 1024, keepRaw = false }) {
  const offsets = arrivalOffsets({ rps, durationMs: warmupMs + durationMs, arrival, seed });
  const agent = new http.Agent({ keepAlive: true, maxSockets });
  const records = [];
  let pending = 0;
  let scheduling = true;
  let finished;
  const done = new Promise((resolve) => (finished = resolve));
  const t0 = performance.now();

  const send = (index, scheduledAt, now) => {
    const rec = { offset: offsets[index], sentLate: now - scheduledAt, latency: NaN, ok: false, timedOut: false };
    records.push(rec);
    pending++;
    let settled = false;
    let timer;
    const settle = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rec.ok = ok;
      rec.latency = performance.now() - scheduledAt;
      if (--pending === 0 && !scheduling) finished();
    };
    const req = http.get(url, { agent }, (res) => {
      res.resume();
      res.on("end", () => settle(res.statusCode >= 200 && res.statusCode < 300));
      res.on("error", () => settle(false));
    });
    req.on("error", () => settle(false));
    timer = setTimeout(() => {
      rec.timedOut = true;
      req.destroy();
      settle(false);
    }, Math.max(1, timeoutMs - (now - scheduledAt)));
  };

  await new Promise((resolve) => {
    let next = 0;
    const tick = () => {
      const now = performance.now();
      while (next < offsets.length && t0 + offsets[next] <= now) {
        send(next, t0 + offsets[next], now);
        next++;
      }
      if (next < offsets.length) setImmediate(tick);
      else resolve();
    };
    tick();
  });
  scheduling = false;
  if (pending === 0) finished();
  await done;
  agent.destroy();

  const window = records.filter((r) => r.offset >= warmupMs);
  const okLatencies = window.filter((r) => r.ok).map((r) => r.latency);
  const errors = window.filter((r) => !r.ok).length;
  const lateness = summarize(window.map((r) => r.sentLate));
  const seconds = durationMs / 1000;
  return {
    config: { url, rps, durationMs, warmupMs, timeoutMs, arrival, seed, maxLatenessMs },
    sent: window.length,
    offeredRps: window.length / seconds,
    achievedRps: okLatencies.length / seconds,
    errors,
    timeouts: window.filter((r) => r.timedOut).length,
    errorRate: window.length ? errors / window.length : NaN,
    latency: summarize(okLatencies),
    lateness,
    /** False when the generator itself fell behind its schedule, so the numbers cannot be trusted as the service's. */
    valid: window.length > 0 && lateness.p99 <= maxLatenessMs,
    ...(keepRaw ? { raw: window } : {}),
  };
}
