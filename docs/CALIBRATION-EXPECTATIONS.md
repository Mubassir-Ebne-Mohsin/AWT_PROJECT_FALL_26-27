# Calibration: expectations and rules, written before any measurement

Committed 2026-11-01, **before the first calibration run**. Its purpose is that the result cannot be shaped afterwards. It fixes what was expected, how the model's inputs are chosen, and which steps are compared. It follows [CALIBRATION-SCOPE](CALIBRATION-SCOPE.md) (decisions 5, 6 and 7). If a run later shows one of these rules to be wrong, the change is made in a new, dated section below, never by editing this one.

## The experiment, as fixed

- Service under test: `calibration/src/service.mjs`, 20 ms of work per request, 1 worker and, in a second set of runs, 4 workers. Nominal capacity 50 and 200 requests per second.
- Offered load, as a share of nominal capacity: 0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90, 0.95, 1.05, 1.20. Poisson arrivals. 30 seconds per step after a 5 second warm-up that is discarded. Three full repeats per configuration. A step in which the generator fell behind its schedule (lateness p99 above 5 ms) is repeated, up to three attempts.
- Paging is logged for every step. A step with paging (pages per second above 100 at any sample) or less than 1.5 GB of available memory is excluded from the comparison and listed.

## How the model's two inputs are chosen (no peeking)

- **Service time** `S_fit` = the mean, over the three repeats, of the median (p50) latency of the 0.10 step. (At 10% busy the median request has almost no wait.)
- **Capacity** `C_fit` = the mean, over the three repeats, of the highest achieved throughput in any step.
- The model is then run for each held-out step on a design of one client and one app component with capacity `C_fit`, latency `S_fit`, one replica, burst 1, all requests reads, at the **nominal** offered rate of that step.
- **Held out and compared:** the steps at 0.30 and above. The 0.10 and 0.20 steps are used only for the fit and the light-load comparison. (The capacity fit uses throughput measured in the 1.05 and 1.20 steps; their latencies and error rates are still compared, and this is stated wherever those steps are shown.)

## What is compared

For each compared step: measured p50, p95, p99 and error rate (mean of the repeats, with the range across repeats) against the model's p50, p95, p99 and error rate; the difference in milliseconds and in percent; whether the model is higher (pessimistic) or lower (optimistic). Also the load at which the measured p95 first exceeds **three times `S_fit`** against the load at which the model's p95 first does. No pass mark is set. A difference smaller than the range across repeats is reported as not meaningful.

## What was expected (to be answered "held" or "did not hold")

1. **With one worker, the model's p95 at light load (the 0.10 and 0.20 steps) is above the measured p95.** The model gives even an idle component a spread of 35% of its service time; the service has almost none.
2. **With one worker at 50 to 80% busy, the model's waiting time (its p50 minus `S_fit`) is above the measured waiting time.** The model assumes variable service times; the service's are fixed, and a fixed-time server waits about half as long.
3. **Above 90% busy (the 0.95, 1.05 and 1.20 steps), the measured p95 rises at least as fast as the model's.** If it rises faster, the model is optimistic exactly where it matters most; that will be the headline.
4. **With four workers, the load at which the measured p95 first exceeds three times `S_fit` is within 15% of the load at which the model's p95 first does.** This is a genuine guess.

Each will be reported as held or not held, with the numbers, however it turns out.

---

## Correction made after the first analysis (2026-11-01, after seeing the data)

The original text above is unchanged. This section records what went wrong with two of its rules, what was changed, and the order in which things were seen. It is written so a reader can tell exactly which results follow the rules as committed and which follow a correction chosen afterwards.

**What the committed rules produced** (commit `b14b8d3`, before any change): the paging rule excluded 21 of 36 steps in each configuration (42 of 72 in total), so the capacity fit, which takes the highest throughput among the steps that remain, lost most of the heavy steps. For four workers it came out at 167 rps (the service's true capacity is about 200) and the model inferred **3** servers instead of 4. Its predictions then collapsed (a p95 of 2,386 ms at 90% busy against 71 ms measured), and expectation 4 looked "not held" by 30.7%. That result is an artifact of the fit, not a finding about the model.

**Two flaws in the committed rules**
1. **The paging counter is not a stall detector.** Pages per second include ordinary file-cache and memory-mapped traffic, and it exceeded 100 in 42 of 72 steps, including at 10% load where nothing slow happened. Of the light-load steps (up to 50% busy) only three showed a latency spike over 100 ms; they had paging of 866, 2,495 and 8 pages per second, while 14 other light-load steps exceeded the 100 mark with no spike (the highest reading, 12,336, was at 10% load with a worst latency of 52 ms). So paging above 100 neither marks the stalls nor separates them from normal steps, and excluding steps on it threw away more than half the data without clearly removing the outliers.
2. **"Highest achieved throughput" is not a capacity.** The generator counts a request as achieved if it was *scheduled* in the window and later answered. In an overloaded step where nothing times out, every request is eventually answered, so "achieved" equals the offered rate. That is why the fit without exclusions came out at 51.9 and 211.5 rps for services whose capacity is about 50 and 200.

**The check on the service's real capacity.** The service counts what it completes. In the heaviest step (120% of nominal), it completed 49.4 requests a second with one worker and 198.4 with four, with almost no spread between repeats (49.3 to 49.5 and 198.3 to 198.6): within 1% of the nominal 50 and 200.

**The correction ("corrected" in the data):** (a) no step is excluded for paging; paging stays recorded for every step and the committed-rule exclusions stay in the data as the "committed" variant; (b) the capacity fit is the service's own completion rate in the heaviest step, requests served divided by the time the step took, averaged over the repeats. The service-time fit (the 10% step's median) and every other rule are unchanged.

**What was seen when.** The committed-rule result and the "no exclusions" result (paging rule dropped, capacity as committed) were both seen before this correction was chosen. The no-exclusions result showed expectation 3 not held and expectation 4 held. The capacity flaw was found while explaining why that fit was 211 rather than 200. Because the corrected capacity is lower than the flawed one, it makes the model run hotter, so the correction could have moved the verdicts either way; it did not move any of the four. All three variants are kept in the data and shown, and the verdicts under each are:

| Expectation | As committed | No exclusions | Corrected |
| --- | --- | --- | --- |
| 1. One worker, light load: model p95 above measured | held | held | held |
| 2. One worker, 50 to 80% busy: model wait above measured | held | held | held |
| 3. Above 90% busy: measured p95 rises at least as fast as the model's | undetermined (steps missing) | not held | not held |
| 4. Four workers: breaking point within 15% | not held (fit artifact) | held | held |

The "corrected" variant is the one this project reports as its result, because its two inputs are measured the way the model defines them, and the page says that it was chosen after the first analysis.

**One more caveat found in the data, not a rule change.** Above the limit (105% and 120% of capacity) requests time out after 3 seconds. The measured latencies cover only requests that were answered in time, so the measured p95 cannot exceed 3,000 ms, while the model's p95 can. Rows where requests timed out are marked "censored" and are not a like-for-like comparison.
