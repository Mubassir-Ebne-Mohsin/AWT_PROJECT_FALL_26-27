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
