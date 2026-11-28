# Region Lab engine foundation — stage 3

Implemented locally on 2026-11-27. This is a bounded, seeded discrete-event processing kernel, separate from the existing StressForge simulator. It is **uncalibrated** and is not connected to the Region Lab UI, application routes, database, or background jobs. All new files remain uncommitted.

## Implementation locations

Under `nest-boilerplate/nest-boilerplate/src/modules/region-lab/engine/`:

| File | Responsibility |
| --- | --- |
| `input.ts` | Strict versioned kernel input and cross-field validation: shares, deadlines, retry safety, service distributions, DAG, reachability, schedule and size limits. |
| `heap.ts` | Binary event min-heap: elapsed time, priority, stable insertion sequence. |
| `random.ts` | Portable keyed SHA-256 uniform draws; constant, exponential and lognormal sampling; weighted allocation. |
| `arrivals.ts` | Integrated piecewise-linear arrival intensity and inverse schedule mapping, including warmup. |
| `engine.ts` | Root/attempt/call lifecycle, replica pools, FIFO waiting, deadlines, downstream calls, retries, metrics, hashes and execution budgets. |
| `foundation.fixture.ts` | Small synthetic inputs shared by the new checks. |
| `foundation.spec.ts` | 41 hand-calculated, primitive, validation and budget tests; explicit test-only event-order fault. |
| `queueing.spec.ts` | Three seeded M/M/1 analytical reference checks. |

Call flow: strict input → canonical ID order → admission estimate → arrival/event heap → per-replica pools → downstream completion/deadline → root accounting → exact latency summaries and result-size checks. No Nest module registration or controller is added.

## Supported semantics

- Time is elapsed milliseconds. Traffic is total baseline requests/second multiplied by a piecewise-linear schedule. Origin and operation shares use basis points summing to 10,000. A root is allocated once; adding origins does not multiply global offered traffic.
- Constant-rate arrivals cross integrated-intensity marks 0.5, 1.5, 2.5, and so on. This midpoint phase avoids a fabricated request at time zero. Poisson arrivals use independent exponential integrated-intensity gaps. Zero-rate intervals produce no arrivals.
- Each replica has an explicit number of concurrent **blocking service slots** and a finite FIFO waiting capacity. These slots are not CPU cores. Dispatch selects the eligible replica with the least busy-plus-waiting work, with stable index tie breaking. There is no autoscaling.
- Own service completes before downstream dispatch. All-child fanout is parallel; weighted dispatch selects one child. A caller retains its slot while waiting for children. Explicit edge delay is charged once outbound and once on response. There is no inferred internet or cross-region latency yet.
- A request has one original deadline across every attempt. Equal-time deadlines precede service/return completions, then measurement boundaries, then arrivals/dispatch/retries. Failed roots cannot later become successful.
- Timed-out queued work is removed. A running service continues holding its slot until its processing actually finishes; late completion is diagnostic. Waiting caller resources are released at deadline. Already running descendants may remain beyond drain; the result exposes remaining work.
- Only queue rejection is retryable. Retries require an explicitly idempotent operation, have capped exponential backoff and bounded jitter, and allow at most three total attempts within the original deadline. No automatic regional failover or durable queue redelivery is implemented.
- Constant times, exponential arithmetic means and lognormal arithmetic means/CV are explicit assumptions. Read/write kinds label operation cohorts; typed read/write capacity differences belong to stage 4.

Warmup and measurement are distinct. Root SLO counts include only arrivals in `[warmup, warmup + duration)` and follow those roots through drain. Warmup backlog carries into measurement. Component call counters follow the measured root cohort, including calls during drain; utilization integrates **all** occupied slots only within the measurement window. Those quantities deliberately use different windows and must not be divided into an invented throughput metric. Queue/busy peaks are measured-window observations. Rejected calls count as failed calls, without consuming slots.

## Metrics, reproducibility and limits

Root results distinguish offered, successful, failed, unresolved and attempts; failure reasons are explicit. Origin and operation summaries preserve root allocation. Root latency includes waiting, downstream delays and retries/backoff. Only successful roots enter latency percentiles; error and timeout fractions remain visible beside them. Exact sorted observations use nearest-rank quantiles: p50 requires 1 success, p95 requires 1,000, p99 requires 10,000. Otherwise the percentile is null with an insufficient-samples status. Regional percentiles are never averaged. No traffic returns null error rate and an indeterminate verdict, rather than a fabricated pass.

Input parsing creates a separate normalized object; ID collections are sorted using ASCII comparisons. The input hash is SHA-256 of the normalized JSON. Keyed random streams use SHA-256 of UTF-8 `JSON.stringify([seed,...keys])`, first big-endian uint32, mapped by `(value + 0.5) / 2^32`. Reference vectors and same-seed equality are pinned. Reproducibility applies to this engine version/runtime and accepted inputs; it does not establish real-world accuracy or eliminate Monte Carlo uncertainty. Wall time and observed heap measurements are intentionally absent from deterministic results.

| Default guard | Limit |
| --- | ---: |
| Processed events | 2,000,000 |
| Pending events | 200,000 |
| Live calls | 100,000 |
| Stored observations across total/origin/operation arrays | 600,000 |
| Wall execution | 45 seconds |
| Observed heap growth / conservative live-object estimate | 256 MiB |
| Serialized result | 2 MiB |

Admission estimates expanded downstream and retry work before execution. Poisson admission uses a conservative statistical bound; runtime event limits remain authoritative. Syntax ceilings such as 20,000 baseline rps do not promise acceptance at that workload. Trusted internal options can only lower limits. Budget, cancellation, numerical and execution-deadline errors return no completed result or partial pass.

This is a synchronous library. Heap-growth checks and conservative object estimates are **not an OS-enforced process memory limit**. AbortSignal is checked between events, but event-loop delivery of cancellation cannot interrupt a synchronous call; a terminating worker/process and external watchdog are required for hosted execution in stage 6. No public execution endpoint is exposed now. Exact internal observations are not the proposed HDR wire format; that adapter remains later work.

## Verification and evidence

The new suites pass 44 tests. Existing canonical-engine, examples and fixes suites add 47 passing regression tests, for **91 tests in five suites**. Backend test TypeScript, scoped ESLint with zero warnings and backend compilation pass. No existing test was modified. An initial scoped lint warning identified an empty callback in a new heap test; it now explicitly returns undefined.

Hand calculations include a 50 rps/10 ms single server (50 successful roots, 10 ms latency, utilization 0.5); a 100 rps/20 ms FIFO overload (100 successes after drain, mean 515 ms, median 510 ms); zero-queue rejection; independent replica/slot capacity; deadline ties; timed-out resource occupancy; warmup backlog; exact parallel/serial network accounting; bounded retries; merged percentile behavior; strict invalid-input rejection and resource failures.

Analytical checks use M/M/1 arrival 50/s, service mean 10 ms, 30 s warmup and 300 s measurement, seeds 1/42/999. Theory: utilization 0.5, response mean 20 ms, response p95 about 59.915 ms. Each seeded check requires mean 18–22 ms, p95 within 15% and utilization 0.47–0.53, with no failed or unresolved roots. These fixed analytical tolerances validate implementation behavior; **they are not production-calibration acceptance criteria**.

Mutation check: `SF_REGION_FOUNDATION_FAULT=deadline-order` is recognized only in the new test file and deliberately moves deadline priority behind completion. The ordering assertion fails with the wrong sequence; the normal five-suite rerun passes without the variable. No production mutation switch exists.

Evidence: `docs/audit/region-lab-foundation-2026-11-27/` contains the recorded analytical results, source hashes, regression/build/type/lint output and expected fault failure. Reproduce analytical evidence from the repo root:

```powershell
node docs/audit/region-lab-foundation-2026-11-27/verify.cjs
```

Run suites from the backend directory using `pnpm exec jest --runInBand --runTestsByPath src/modules/region-lab/engine/foundation.spec.ts src/modules/region-lab/engine/queueing.spec.ts`. The new code does not bootstrap the application or read environment files.

## Next stage

Stage 4 is the separately approved typed component/property adapter and behavior tests for all 12 component types. Caches, database read replicas, asynchronous brokers/workers and external-service semantics must have their own supported property models; generic blocking pools must not silently stand in for them. Stage 5 adds routing, regional network/outage/recovery; later stages add private persistence/jobs, result/UI integration and measured calibration. The prototype remains illustrative and the existing Evaluation feature remains unchanged. Full isolated deployment E2E remains deferred by the owner.
