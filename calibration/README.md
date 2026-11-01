# Calibration

Tools for comparing the StressForge model with a real running service. The plan, the decisions and what will and will not be claimed are in [docs/CALIBRATION-SCOPE.md](../docs/CALIBRATION-SCOPE.md). This folder is separate from the product and has no dependencies beyond Node.

## What is here

| File | What it does |
| --- | --- |
| `src/generator.mjs` | An **open-loop** load generator: requests go out at their scheduled times whatever the server is doing, and each latency is measured from the scheduled time. |
| `src/stats.mjs` | Nearest-rank percentiles, a summary (count, p50, p95, p99, mean, max) and a seeded random stream. Empty input gives NaN, never zero. |
| `src/fake-server.mjs`, `src/fake-worker.mjs` | Fake servers with a **known** latency (fixed, or one queue with a fixed service time), an optional pause, and an optional error status. Used only to check the generator. |
| `src/service.mjs` | **The service under test:** every request costs exactly 20 ms of work (a busy wait) on one of N worker threads, first come first served. Requests abandoned while waiting are dropped. `/stats` and `/reset` expose counters. |
| `src/plan.mjs` | The load levels, the core masks, and the reader for the paging log. |
| `src/run.mjs` | The stepped test: refuses to start below 2 GB of available memory, records the machine, pins the service and the generator to different cores, runs the levels, repeats a step if the generator fell behind, logs paging, writes `data/<name>.json`. Windows only. |
| `data/w1.json`, `data/w4.json` | The raw measurements of the real runs (1 and 4 workers, 3 repeats, 12 levels), with the machine record and the paging logs. |
| `data/analysis.json` | The analysis, produced by `pnpm calibration:analyze` in `nest-boilerplate/nest-boilerplate` (it runs the real engine on the measurements). |
| `test/` | The generator, the service and the planning functions checked. |

## Repeat the runs

Close Brave, Docker, the dev server and other heavy programs first (the run refuses to start below 2 GB available, and pins the generator to logical core 2 and the service to cores 4, 6, 8, 9, 10 and 11 of a 12-thread i5-12450H; change the lists at the top of `src/run.mjs` for another machine). Then:

```bash
node src/run.mjs --workers 1 --repeats 3 --out w1     # about 25 minutes
node src/run.mjs --workers 4 --repeats 3 --out w4     # about 25 minutes
cd ../nest-boilerplate/nest-boilerplate && pnpm calibration:analyze
```

`node src/run.mjs --smoke` is a short check of the setup (two steps, two seconds each). The measurements depend on the hardware, so a test cannot recreate them; the analysis of stored measurements is tested and checked for freshness (`pnpm calibration:analyze:check`).

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

Passing these checks shows the generator and the service behave as described. What the runs show about the model, and what they do not, is in [docs/CALIBRATION-FINDINGS.md](../docs/CALIBRATION-FINDINGS.md); read the correction section of [docs/CALIBRATION-EXPECTATIONS.md](../docs/CALIBRATION-EXPECTATIONS.md) with it.
