# Calibration scope: comparing the model with a real running service

Prepared 2026-11-01. Status: **all ten decisions approved 2026-11-01 ("Approve all", as recommended).** Commit one (the load generator and its validation) is built; commits two and three are not. Needs no AI. This is the "Calibration" tab promised on `/evaluation/calibration`, whose method (seven steps) was approved in [P5-EVALUATION-SCOPE](P5-EVALUATION-SCOPE.md). It is the largest gap in the evidence: [SIMULATION-MODEL](SIMULATION-MODEL.md) says plainly that "no empirical calibration was performed".

## 1. What calibration can and cannot show

Calibration compares what the model **predicts** for a design with what a **real service measures** under the same load. It can show where the model is close, where it is off, and in which direction. It cannot show that the model is right for every system: one service on one laptop says nothing about a database cluster in another region. The page must say that in those words, whatever the result.

A good result is not required. A poor result, reported with the numbers, is a finding and is worth as much as a good one. The experiment is designed so the answer is not decided in advance.

## 2. What the model predicts (verified in the code)

For a component the model takes a **capacity** (requests per second per replica), a **service time** (ms) and a replica count. It infers the number of parallel servers as `round(capacity x service time / 1000)`, at least 1. It then estimates the waiting time with an approximation, adds a spread (a standard deviation of `sqrt((0.35 x S)^2 + (1.25 x Wq)^2)`, so even an idle component is predicted to have a spread of 35% of its service time), and reports p50, p95, p99 and an error rate. Utilization is judged at the **burst** peak (steady load times the burst multiplier, 1.5 by default), and a timeout of 3,000 ms turns slow requests into errors. Past 98.5% busy it adds a full-queue penalty.

Two things follow that make the experiment informative rather than a formality:
- **The model assumes variable service times; a simple real handler is nearly fixed.** So at light load the model should predict a p95 above the true p95 (the model assumes a spread that the service does not have), and the waiting time for a fixed-time server is about half that of a variable one. I expect the model to be **conservative (pessimistic)** on a fixed-time service. That is a prediction I will write down before measuring, and the data can contradict it.
- **Near saturation, real systems degrade in ways a formula does not** (garbage-collection pauses, queue limits, connection backlogs). The model has a saturation penalty; whether it matches is exactly what is unknown.

## 3. The experiment

**The service under test.** A small Node HTTP service written for this purpose (in a new `calibration/` folder, not inside the product), with one endpoint that does a fixed amount of CPU work per request (a busy loop calibrated to a target time, for example 20 ms) and returns. It has a setting for the number of worker threads (1 or 4), which fixes the real number of parallel servers. This is a deliberately **simple, well-understood service**: it tests the queueing core of the model without the noise of a database, a cache or a network. It is **not** "a real application", and the page will say it is a toy service.

**The load generator.** An **open-loop** generator that sends requests at a fixed rate whatever the responses do, and measures each latency from the moment the request was *scheduled* (not when it was sent). This matters: a generator that waits for each reply before sending the next hides queueing delay (known as coordinated omission) and would make any service look better than it is. No load tool is installed on this laptop; the recommended route is a small purpose-written generator in Node (about 100 lines), **validated first against a fake server with a known latency** so its own overhead and accuracy are measured before it is trusted.

**The stepped test.** Offered load goes through fixed levels from light load to past the breaking point (for example 10% to 120% of the measured capacity in about a dozen steps). Each step runs 30 seconds after a 5 second warm-up that is discarded. At each step it records achieved throughput, p50, p95, p99, the error rate (timeouts and failures) and the service's own CPU use. The whole stepped test is **repeated three times** per configuration, so the run-to-run variation is known and can be shown next to any model error.

**Fitting without cheating.** The model has two inputs to estimate, capacity and service time. They are set **only from a subset of steps**: service time from the light-load steps (10 to 20% busy), capacity from the highest throughput achieved. The remaining steps are **held out**: the model predicts them without having seen them, and those are the steps compared. Fitting on all the data and then "predicting" it would prove nothing.

**The model's side.** The real engine is run on a two-part design (clients, then one app component) with the fitted capacity and service time, burst set to 1 (the load generator is steady), all requests reads, replicas 1. The prediction per step (p50, p95, p99, error rate) and the model's own breaking point (its Limits search) are written to a file by a script, in the same way as the P5 evidence.

**What is compared, and what will be reported.** For every held-out step: predicted and measured p50, p95 and error rate, the difference in ms and in percent, and the run-to-run range of the measurement. Also the load at which the measured p95 first exceeds a goal (for example 3 times the service time) against the load at which the model says the goal is first missed. **No pass mark is set in advance**, because a threshold chosen now would be arbitrary; instead the report states the largest error, whether the model is optimistic or pessimistic at each step, and where it is far off.

## 4. Written down before measuring

So the result cannot be shaped afterwards, the expectations are recorded in the repository before the first run:
1. With one worker, the model's p95 at light load is **above** the measured p95 (it assumes variability the service lacks).
2. With one worker at moderate load (50 to 80% busy), the model's waiting time is **above** the measured waiting time (variable versus fixed service times).
3. Close to saturation (above 90% busy), the measured p95 rises **at least as fast as** the model's; if it rises faster, the model is optimistic exactly where it matters most, and that will be the headline.
4. With four workers, the model's ordering of the breaking point (the load at which the goal is first missed) is within 15% of the measured one. (This one is a genuine guess; I do not know.)

## 5. Constraints of this laptop (and how they are handled)

The machine has about 8 GB and, in this session, often under 1 GB free; builds have crashed from it. The load generator and the service run on the **same machine**, so they compete for CPU. Controls: one job at a time; Brave, Docker and the editors closed during runs; free memory checked before each run (the run refuses to start below 2 GB); the service pinned to fixed cores and the generator to others; the machine's state (free memory, power mode, running processes) recorded with every run. Windows timer resolution and the antivirus scanner add noise; the three repeats show how much. The result holds **for this laptop, this Node version and this service only**, and the page will say so.

## 6. How it reaches the product

- `calibration/` holds the service, the generator, the runner and the analysis, with a short README to repeat it.
- The raw measurements are committed (small files), together with the machine record.
- A script (`pnpm calibration:predict`) reads the measurements, runs the engine and writes `web/src/lib/calibration-data.json`; a backend spec fails if that file is out of date with the measurements and the engine, as for the P5 evidence. The measurements themselves cannot be re-created by a test (they depend on the hardware), and the page says so.
- The Calibration tab changes from "Not yet measured" to "Measured on one machine, one toy service", and shows the held-out table (predicted, measured, difference, run-to-run range), the written expectations and whether each held, the limits above, and how to repeat it. If the data file is missing the tab keeps saying "Not yet measured", so it can never show a figure that was not produced.
- The "what none of this proves" box on the Simulator tab is updated to match.

## 7. Decisions needed (recommendation first)

1. **What to calibrate against.** Recommended: the purpose-written toy service (clean, tests the queueing core, repeatable). Alternative: the StressForge API itself (a real NestJS and Postgres app, more realistic but several moving parts on a small laptop, and harder to interpret). A second round on the real API could follow if the first is informative.
2. **Load generator.** Recommended: a small open-loop generator written here and validated against a fake server first. Alternative: install k6 (a standard tool, but it needs Docker or a separate install, and Docker has been crashing on this laptop).
3. **Worker configurations.** Recommended: one worker and four workers. Alternative: only one worker (half the work, but the multi-server approximation, which P5 showed is the loosest part, would go untested).
4. **Number of repeats.** Recommended: three full stepped runs per configuration (about 7 minutes each, about 45 minutes of load in total). Alternative: one run (faster, but run-to-run variation unknown).
5. **Fitting rule.** Recommended: service time from the 10 to 20% steps, capacity from peak throughput, everything else held out. Alternative: fit on all steps (easier, but then the comparison proves nothing).
6. **Pass mark.** Recommended: none; report the errors and their direction. Alternative: set a threshold now (for example within 25% at held-out steps), which makes headlines easy and risks being arbitrary.
7. **Written expectations.** Recommended: commit the four expectations in section 4 before any measurement, and report whether each held. Alternative: skip them.
8. **Where the code lives.** Recommended: a new top-level `calibration/` folder, separate from the product, with no change to the engine. Alternative: inside the API's `src/script` (closer to the other generators, but mixes an experiment with product code).
9. **Whether the model may change afterwards.** Recommended: no. If the model is found optimistic or pessimistic, that is recorded as a finding and a possible future change, as with P5's Erlang C result; changing the formulas would move every number and break the match with the original prototype. Alternative: allow a tuning change in a separate, later slice.
10. **Slicing and review.** Recommended: three commits. First the generator and its validation against a fake server (no product change). Second the service, the runs, the raw data and the analysis, with the findings written up before the page changes. Third the Calibration tab, the data file, the spec and the docs. You read the findings wording before the page ships. Pushed only when you say so.

## 8. Test plan

- **The generator itself:** against a fake server with a fixed, known latency it reports that latency within a small tolerance; at an overloaded fixed-latency server it reports growing delay (it does not hide queueing); it keeps its rate when the server is slow (it is open-loop); it reports its own scheduling lateness.
- **The service:** its work time per request is within a stated tolerance of the target; the worker count is real (measured throughput at saturation is about the worker count times the single-worker throughput).
- **The analysis:** unit tests on hand-made measurements: the held-out steps exclude the fitted steps; the differences and the optimistic or pessimistic direction are right; the breaking-point comparison is right; run-to-run range is computed from the repeats.
- **The data file:** a backend spec fails if the stored predictions differ from a fresh engine run on the stored measurements.
- **The page:** every number comes from the data file; when the file is absent the tab says "Not yet measured" and shows no number; the toy-service and one-machine limits are always shown; the expectations are shown with whether each held; no word such as "validated" or "accurate" without its qualification.
- **Deliberate breaks:** the generator waits for replies (closed loop): caught by the overload check; fitting on the held-out steps: caught; the direction of an error reversed: caught; a stale data file: caught; a figure on the tab with no data file: caught; the limits text removed: caught.
- The usual gates: type check, lint, all unit tests, full Chrome regression, commit by path, protected audit file never staged.

## 9. Not in scope

Calibrating against a database, a cache, a queue or a multi-region system; load-testing the StressForge product itself; changing the model; cloud machines or any cost; AI.

## 10. Risks

- **A clean-looking result could be over-read.** One toy service on one laptop agrees or disagrees with a formula; it does not certify the model. The page repeats the limits next to every table.
- **The result may be unflattering** (the model may be optimistic near saturation). That is why the expectations are fixed first and no pass mark is set.
- **Measurement noise from the laptop** (memory, thermal limits, antivirus, other programs) could swamp small differences; the repeats and the machine record show how much, and differences smaller than the run-to-run range are reported as not meaningful.
- **The generator could be the bottleneck.** It is validated first and records its own lateness; a run where it falls behind is rejected.
- **Time.** About an hour of load runs plus setup; it must be done while the laptop is otherwise idle.

## Commit one result (2026-11-01): the load generator, validated before use
**Built:** `calibration/` (top level, no dependencies): `src/generator.mjs` (open loop, spins on a high-resolution clock, reports its own lateness and marks a run invalid when it fell behind), `src/stats.mjs`, fake servers with a known latency in `src/fake-*.mjs`, and 19 tests.
**Two refinements to the approved scope, found while building:**
1. **Windows timer resolution is about 15.5 ms on this machine** (measured: `setInterval(1)` ticked every 15.5 ms). A generator built on `setTimeout` would send in clumps; the generator therefore spins on `setImmediate` and uses a full core. It must run on its own core, which the runner will arrange.
2. **Arrivals are Poisson by default, not evenly spaced.** The scope said "a fixed rate"; the mean rate is fixed, but the model's waiting-time formula assumes random arrivals, and evenly spaced arrivals would shorten every wait and bias the comparison toward the model being pessimistic. Evenly spaced is kept as an option (`arrival: "uniform"`). This is a change of method, so it is noted here rather than slipped in.
**What the tests prove:** against a fake that always takes 20 ms the generator reports 20.7 ms (p50) and sends at the offered rate; against a single queue that can do 50 a second it keeps sending 100 a second and shows the delay and the timeouts (open loop); a 600 ms pause in the server is counted for the requests scheduled during it (no coordinated omission); a stall in the generator itself is reported as lateness and marks the run invalid; every latency includes that request's own lateness; warm-up is discarded; HTTP errors, timeouts and unreachable servers are errors and never latencies; the same seed gives the same arrivals; Poisson gaps are exponential.
**Evidence:** 19 of 19 pass, and three full runs in a row all pass. 16 deliberate breaks to the generator and the statistics (closed loop, latency timed from the send, lateness hidden, validity check removed, warm-up kept, timeouts or HTTP errors counted as success, throughput counting failures, timeout run from the send, seed ignored, even spacing instead of Poisson, percentile off by one, p95 really p90, empty input giving zero): 14 caught first time, 2 survivors each exposed a real gap in the tests (no test of a timeout counted from the schedule; the stall test could not tell latency from the schedule from latency from the send), both fixed with new assertions and then caught.
**Not yet done:** the service under test, the stepped runs, the model predictions and the Calibration tab. No product code changed.

## Commit two result (2026-11-01): the runs, the analysis and the findings
**Done:** the service under test, the runner and the stepped runs (1 and 4 workers, 3 repeats, 12 levels, 72 steps; the generator never fell behind, so no step was repeated), the analysis (the real engine run on the measurements), and the findings written up in [CALIBRATION-FINDINGS](CALIBRATION-FINDINGS.md) for the user to read before the page changes. The expectations were committed (`7060583`) before any run; the raw data and the analysis exactly as the committed rules produce it were committed (`b14b8d3`) before any correction.
**What went wrong, and how it is recorded:** applying the committed rules literally excluded 42 of 72 steps for paging and fitted the four-worker capacity at 167 rps (true 200), so the model ran with 3 servers instead of 4; and "highest achieved throughput" turned out to equal the offered rate when nothing times out, so it is not a capacity. A **dated correction** (in [CALIBRATION-EXPECTATIONS](CALIBRATION-EXPECTATIONS.md), original text untouched) replaces the capacity fit by the service's own completion rate in the heaviest step (49.4 and 198.4 requests a second, within 1% of nominal) and keeps paging as a record rather than a reason to exclude. It was chosen after seeing the first analyses; all three variants are in the data and the verdicts of the two sensible ones agree.
**Result in one line:** on this fixed-cost service the model was cautious (p95 above measured at nearly every load; breaking point 31% earlier for one worker, within 9% for four workers); expectations 1, 2 and 4 held and 3 did not; one clear optimistic spot (error rate at 120% of capacity with four workers, 20.5% predicted against 56.6% measured).
**Refinements to the approved scope, all noted where made:** Poisson arrivals and a spinning generator (commit one); a start threshold of 2 GB available memory with an abort floor of 1.5 GB (so a brief dip does not lose a run); the capacity correction above; a "censored" flag on rows where requests timed out, because measured latencies then cover only answered requests.
**Evidence:** 31 calibration tests pass (19 generator and statistics, 6 service, 6 planning); backend unit 286 pass (24 new for the analysis); type check and lint clean; 22 deliberate breaks to the analysis, all caught; the stored analysis is checked for freshness by a spec (`pnpm calibration:analyze:check`). The measurements themselves cannot be re-created by a test (they depend on the hardware).
**Not yet done:** the Calibration tab, the web data file and its spec (commit three), waiting for your reading of the findings.
