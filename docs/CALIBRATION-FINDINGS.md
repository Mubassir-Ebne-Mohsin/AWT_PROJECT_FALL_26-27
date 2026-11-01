# Calibration findings

Written 2026-11-01 for your review **before** the Calibration page changes. Data: [calibration/data](../calibration/data) (`w1.json`, `w4.json`, `analysis.json`). Method and the rules committed before measuring: [CALIBRATION-SCOPE](CALIBRATION-SCOPE.md) and [CALIBRATION-EXPECTATIONS](CALIBRATION-EXPECTATIONS.md), including the dated correction made after the first analysis. Read that correction first: it changes how the two model inputs were chosen, after the data had been seen.

## What was done

A small Node service (20 ms of work per request, first come first served, 1 worker and then 4 workers) was driven by an open-loop load generator with random (Poisson) arrivals through twelve load levels from 10% to 120% of its nominal capacity, 30 seconds per level, three full repeats per configuration (72 steps). The real engine was then run on a one-component design with the service time and capacity taken from the measurements, and its predictions were compared with what was measured. Everything ran on one laptop (i5-12450H, 7.9 GB, AC power, "Balance" mode, Windows timer about 9 to 14 ms), with the generator and the service pinned to different cores and the machine otherwise quiet.

## The result, in one paragraph

On this service the model was **cautious**: at nearly every load it predicted a slower response than was measured, and for one worker it put the breaking point earlier than it really was. For four workers the predicted breaking point was close to the measured one. The model does **not** appear optimistic anywhere that matters on this service, except that at 120% of capacity with four workers it predicted a much lower error rate than was measured (20.5% against 56.6%). This is one toy service with a fixed cost per request on one laptop; it says how the formula behaves for that kind of service, not how accurate the model is for real applications.

## The numbers (corrected analysis, all 36 steps per configuration)

Measured values are the mean over three repeats; the measured range across repeats is in brackets. p95 is in milliseconds.

**One worker** (fitted service time 20.96 ms, capacity 49.43 requests a second; true nominal capacity 50)

| Load (share of capacity) | Measured p95 | Model p95 | Model against measured |
| --- | --- | --- | --- |
| 10% | 34.5 [29 to 39] | 38.0 | +10% (fit step) |
| 20% | 38.8 [37 to 41] | 44.8 | +15% (fit step) |
| 30% | 43.0 [40 to 48] | 55.7 | +30% |
| 40% | 50.0 [49 to 52] | 71.6 | +43% |
| 50% | 61.5 [56 to 71] | 94.8 | +54% |
| 60% | 79.9 [80 to 80] | 129.9 | +63% |
| 70% | 92.4 [87 to 101] | 188.4 | +104% |
| 80% | 175.1 [134 to 238] | 307.5 | +76% |
| 90% | 347.6 [326 to 364] | 691.1 | +99% |
| 95% | 403.6 [374 to 443] | 1,623.7 | +302% |
| 105% | 2,347.7 [1,343 to 2,974] | 5,105.6 | not comparable (see below) |
| 120% | 2,995.4 [2,995 to 2,997] | 5,890.4 | not comparable (see below) |

The model was higher than the measurement at all ten compared loads, and every difference was larger than the spread between repeats. **Breaking point** (first load at which the p95 exceeds three times the service time, 63 ms): measured about **25.4** requests a second (51% of capacity), model about **17.5** (35%), so the model says the service breaks about 31% earlier than it does.

**Four workers** (fitted service time 20.81 ms, capacity 198.44 requests a second; nominal 200)

| Load | Measured p95 | Model p95 | Model against measured |
| --- | --- | --- | --- |
| 10% | 22.5 [22 to 23] | 34.4 | +53% (fit step) |
| 20% | 22.2 [22 to 22] | 34.6 | +55% (fit step) |
| 30% | 21.8 [21 to 22] | 35.0 | +60% |
| 40% | 24.0 [23 to 25] | 35.8 | +49% |
| 50% | 28.4 [27 to 30] | 37.8 | +33% |
| 60% | 32.8 [32 to 34] | 42.3 | +29% |
| 70% | 37.3 [37 to 37] | 53.0 | +42% |
| 80% | 57.5 [50 to 65] | 79.9 | +39% |
| 90% | 80.7 [70 to 101] | 171.0 | +112% |
| 95% | 154.5 [148 to 160] | 377.2 | +144% |
| 105% | 2,282.8 [1,952 to 2,726] | 1,853.1 | -19%, within the spread between repeats |
| 120% | 2,997.2 [2,997 to 2,998] | 2,673.1 | -11%, not comparable (see below) |

**Breaking point** (62 ms): measured **164.3** requests a second, model **149.4**, a difference of **9.1%**.

**Error rate above the limit.** For one worker at 105% the measured error rate was 1.8% and the model's 18.8%; at 120% it was 33.4% against 31.8%. For four workers at 105% it was 0.0% against 7.0%, and at 120% it was **56.6% measured against 20.5% predicted**, the one place the model was clearly optimistic.

**Not like for like above the limit.** From 105% of capacity requests start timing out after 3 seconds. The measured latency covers only the requests that were answered in time, so the measured p95 cannot exceed 3,000 ms, while the model's p95 can. Rows with timeouts are marked "censored" in the data and should not be read as a precise error.

## The four written expectations

| | Expectation | Result (corrected) | What it showed |
| --- | --- | --- | --- |
| 1 | One worker, light load: model p95 above measured | **Held** | 38.0 against 34.5 ms at 10%; 44.8 against 38.8 ms at 20% |
| 2 | One worker, 50 to 80% busy: model's waiting time above measured | **Held** | At 50% the model's wait was 14.5 ms and the measured 1.3 ms; at 80% 56.2 against 25.6 ms |
| 3 | Above 90% busy, measured p95 rises at least as fast as the model's | **Did not hold** | From 90% to 95% the measured p95 rose x1.16 and the model's x2.35; from 95% to 105% the measured rose x5.82 and the model's x3.14; from 105% to 120% x1.28 against x1.15 (censored) |
| 4 | Four workers: breaking point within 15% | **Held** | 164.3 against 149.4 requests a second (9.1%) |

The expectation I thought most likely to produce a headline, that the model would be optimistic near saturation, did not hold for one worker: it was pessimistic there. Expectation 3 failed in a mixed way (the measured rise is slower from 90% to 95% and faster from 95% to 105%), which reflects that the real knee is sharper and later than the model's smoother, earlier curve.

## Why the model was cautious here (an explanation, not something this test proves)

The model gives every component a spread of 35% of its service time even when idle, and its waiting-time formula assumes variable service times. This service does a fixed amount of work per request, so it has neither. Both effects push the model's p95 above the measurement, which is what was seen at light load (expectation 1) and in the waiting time at moderate load (expectation 2). A service with more variable service times (a database query, a call to another service) would be closer to what the model assumes; **that was not tested**.

## How much to trust this

- **The correction.** The capacity fit and the paging rule were changed after the first analysis, because the committed rules produced a broken fit (see the correction section). All three variants are in the data. The four verdicts are the same under the "no exclusions" and the "corrected" variants. The variant used here was chosen after I had seen the others.
- **Paging.** The Windows paging counter exceeded 100 pages a second in 42 of 72 steps. It did not mark the few latency spikes, so I did not use it to throw data away; it stays recorded.
- **Repeats.** Three repeats per configuration. Differences that are smaller than the spread between repeats are marked as not meaningful (only the four-worker 105% row).
- **One machine, one service, one run day.** The service does fixed work with no database, cache or network; the machine is a laptop with other programs running; the Windows timer resolution varied from 9 to 14 ms; free memory dipped as low as 1.6 GB during the four-worker run.
- **The generator was valid throughout** (no step needed repeating; the 99th percentile of send lateness never exceeded about 3 ms).

## What this does and does not show

It shows that, for a service with a fixed cost per request, the engine's p95 is above the measured p95 almost everywhere below the limit, that its breaking point is earlier for one server and within 9% for four, and that it can under-predict errors well above the limit. It does **not** show that the model is accurate for any real application, for services with variable work, for databases or caches, across regions, on other hardware, or under traffic that is not random arrivals. It does not validate the model.

## For you to decide

1. **Whether the headline wording on the page is right** ("cautious on this service"). Suggested text for the Calibration tab: *"Measured on one laptop against one simple service. For this service the model was cautious: it predicted slower responses than were measured at nearly every load, and put the breaking point earlier for one server (17.5 against 25.4 requests a second) and within 9% for four servers (149 against 164). At 120% of capacity with four servers it predicted a much lower error rate than was measured (20.5% against 56.6%). This shows how the formula behaves for a service with a fixed cost per request. It does not show how accurate the model is for real applications."*
2. **Whether to change the model.** Not recommended now (decision 9 of the scope): a possible later change is to let a component's variability be set, since the fixed spread of 35% explains much of the gap; that would change every result and needs its own slice.
3. **Whether to measure something more realistic next** (a service with variable work, or the StressForge API itself); out of scope for this slice.
