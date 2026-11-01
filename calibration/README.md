# Calibration

Tools for comparing the StressForge model with a real running service. The plan, the decisions and what will and will not be claimed are in [docs/CALIBRATION-SCOPE.md](../docs/CALIBRATION-SCOPE.md). This folder is separate from the product and has no dependencies beyond Node.

## What is here so far

| File | What it does |
| --- | --- |
| `src/generator.mjs` | An **open-loop** load generator: requests go out at their scheduled times whatever the server is doing, and each latency is measured from the scheduled time. |
| `src/stats.mjs` | Nearest-rank percentiles, a summary (count, p50, p95, p99, mean, max) and a seeded random stream. Empty input gives NaN, never zero. |
| `src/fake-server.mjs`, `src/fake-worker.mjs` | Fake servers with a **known** latency (fixed, or one queue with a fixed service time), an optional pause, and an optional error status. Used only to check the generator. |
| `test/` | The generator checked against the fake servers. |

## Run the checks

```bash
cd calibration
pnpm test        # or: node --test --test-concurrency=1 "test/*.test.mjs"
```

Run it with the machine otherwise quiet (about 45 seconds). The tests are about timing, so a loaded machine can fail them; they run one file at a time for that reason.

## Why the generator is built this way

- **Open loop, timed from the schedule.** A generator that waits for each reply before sending the next hides queueing delay (coordinated omission) and flatters any service. The tests include a server that pauses and a generator that stalls, and check that the delay is counted.
- **It spins instead of using timers.** The Windows timer ticks about every 15.6 ms (measured on this machine), which would send requests in clumps. The generator spins on `setImmediate` and a high-resolution clock and therefore uses one full core; run it on its own core.
- **Poisson arrivals by default.** The model assumes random arrivals, so the default gaps are exponential (seeded, so a run can be repeated exactly). Evenly spaced arrivals are available as `arrival: "uniform"`. The mean rate is what is fixed.
- **It reports its own lateness and marks a run invalid** when the 99th percentile of send lateness exceeds `maxLatenessMs` (5 ms by default). An invalid run must be repeated, not reported.
- **Timeouts count as errors** and run from the scheduled time, so a late send gets no extra time.

## What it does not show

Passing these checks shows the generator measures a known fake server correctly. It does not show anything about the model; that comes from the runs in a later step.
