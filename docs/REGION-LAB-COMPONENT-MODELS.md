# Region Lab typed component models — stage 4

Local implementation dated 2026-11-27. `simulateComponents` is a separate, offline, **uncalibrated** component engine. It reuses the Stage 3 heap, arrival schedule, seeded distributions and error/budget definitions. The existing simulator, foundation engine, main application and illustrative Region Lab prototype remain unchanged. No Nest registration, HTTP route, database migration or provider call is added.

## Code map

All five new files are under `nest-boilerplate/nest-boilerplate/src/modules/region-lab/engine/`.

| File | Purpose |
| --- | --- |
| `component-input.ts` | Strict typed nodes/properties; versioned profile references; operation payloads; origin/client mapping; graph, data-path, queue-consumer and resource validation. |
| `component-resources.ts` | Local token bucket and event-driven equal-share storage bandwidth. |
| `component-engine.ts` | Typed event lifecycle, pools, read/write paths, caches, quotas, detached queue jobs, replica application, accounting and budgets. |
| `component.fixture.ts` | Deterministic synthetic fixtures, not measured hardware profiles. |
| `component.spec.ts` | Component/property, numerical, lifecycle, boundary and integration checks, plus explicit test-only mutations. |

Flow: validated component input → canonical ordering and hash → expanded-work admission → open arrivals → typed service/queue dispatch → request outcomes plus independent jobs/commits → exact latency and component diagnostics. No arbitrary configuration URLs, environment values or AI dependencies are used.

## Behaviors and property consequences

| Component | Implemented behavior and properties |
| --- | --- |
| Client | One origin in the local component run. Baseline rate/schedule produce open arrivals; operation shares select read/write/payload/deadline/retry settings. The origin share allocates global traffic; it does not add traffic. |
| CDN | Fixed keyed Bernoulli read hit probability. Hits use `hitTime` **instead of** miss `serviceTime` and terminate downstream dispatch; misses use service demand then the miss graph. Writes bypass lookup. Hits, misses and write bypasses are separate. |
| Load balancer | Own service demand, explicit replicas/slots/FIFO and per-operation all-child or weighted-one dispatch. Local edge delay is charged once each way. Regional health selection is not part of Stage 4. |
| API gateway | Service pools plus one token bucket per logical node, shared by its replicas. Rate controls refill; burst controls capped token storage. Bucket starts full; admission occurs before consuming a service slot or FIFO entry. |
| App server | Sampled own service, finite replica pools, finite per-replica FIFO. Caller slots remain occupied while awaiting synchronous children and async enqueue ACKs. Increasing replicas/slots adds concurrency; waiting capacity trades rejection for queue delay. |
| Cache | Same explicit hit/miss/bypass rules as CDN. Fixed ratios are assumptions; no TTL, adaptive warming, invalidation or stampede claim. |
| Database | Exactly one primary; reads and writes choose their separate demand distributions and compete for the same pool/FIFO. A processing write commits when service finishes, including a late write after client timeout. No automatic query/IOPS/CPU conversion. |
| Read replica | Read-only request leaf referencing the primary. Primary commits enter a dedicated serial apply lane in commit order. `replicationApplyTime` changes lag/backlog. Read pools and apply lane are separate resource assumptions. Pending applies and observed mean/max commit-to-apply lag are reported. |
| Queue | Finite retained FIFO, durable acceptance followed by sampled ACK. FIFO is acceptance order: a later fast ACK cannot overtake an earlier slow ACK. `reject_new` rejects new work; `drop_oldest` discards the oldest waiting job and records the loss. ACK ends the parent's enqueue wait, not the job. |
| Worker | Pulls only when a real processing slot is free. Replicas/slots add consumers from one broker backlog; own service and downstream completion determine ACK of the job. This stage requires `waitingCapacity=0`; nonzero worker buffers are explicitly rejected to prevent bypassing the broker backlog limit. |
| Object storage | Read/write service plus serialization of request bytes **and** response bytes through one aggregate decimal-Mbps resource. Active transfers share bandwidth equally; occupied operation slots remain held until completion. Slot limits and shared transfer contention are distinct. |
| External service | One provider node with service pool, FIFO and token-bucket quota. Replicas must equal one; adding fictional provider replicas cannot increase quota. Request retries consume additional attempts/quota and retain the original root deadline. |

For cache/CDN, service slots/FIFO and replicas also apply to hit processing. For DB, replica, storage and provider resources, node replicas must equal one; additional explicitly modeled resources require separate nodes. One immutable `profileId@profileVersion` cannot have conflicting type/properties within a run. IDs and versions contribute provenance/hash; they are not performance multipliers.

Constant, exponential and lognormal demands are supported; lognormal parameters use the arithmetic mean and coefficient of variation. Processing demands must be positive; ACK/hit/apply delays may be zero. Every unknown field is rejected, including CPU, RAM, promotion, unsupported regional knobs and arbitrary profile properties.

## Background lifecycles and accounting

Root deadline/retry rules remain separate from delivery attempts. An accepted job is retained even if the foreground request completes, fails or times out. Each delivery gets a distinct execution context and a new delivery deadline of the operation's configured duration; old timers cannot expire a new delivery. Failed deliveries wait the configured redelivery delay, up to `maxDeliveryAttempts`, then dead-letter. A rejected redelivery is counted as dropped; `drop_oldest` can discard an older waiting job. Delayed retries immediately retain a slot in the finite broker backlog, are reported separately from other waiting jobs, and become eligible after their backoff. They cannot bypass maxDepthJobs; dropping one invalidates its future timer. This is not exactly-once execution or a durable real broker.

The physical job invariant is:

`accepted = completed + dropped + deadLettered + waiting + inFlight + delayed`

Job counters include **all** accepted jobs, including warmup. Replica apply/lag diagnostics likewise include all commits; pending commits cannot be turned into an invented stale-read probability. Root request SLOs include only measured arrivals, as in Stage 3. Component call counters follow their initiating root/job cohort; utilization integrates all occupied service slots only during the measurement window. Client/queue utilization is null. `maxStartedJobAgeMs` measures age at actual worker start. Background backlog/loss emits separate warnings, rather than silently changing request latency or certifying job health.

Terminal root/delivery outcomes remove queued calls and release callers waiting on downstream work. Genuinely processing work and storage transfers retain resources until completion, and cannot resurrect the terminal root. This also prevents slots leaking when a parallel branch fails before another child's dispatch occurs.

## Stage boundaries and supported input

The entry point accepts `componentVersion:1`, the strict **local component** input, not the full draft Region Lab scenario. A full `engineContract` input is explicitly refused. All nodes must use one region; edge delays are explicit local assumptions. Replica commit transport is zero in this stage. Queue-to-worker edge delay must be zero, and each queue has one explicitly scalable worker deployment consuming all its operation kinds. Workers cannot consume multiple queues or run with private waiting buffers. These are deliberate, validated restrictions, not silently ignored draft settings.

The Stage 1 draft profile allows nonzero worker waiting capacity and more general regional graphs; the Stage 4 local schema is narrower. A later adapter must reject unsupported imports or introduce a versioned, tested behavior before accepting them. The Stage 1 executable draft/schema artifacts are preserved, not silently rewritten to claim parity. Ordered regional transport, shared regional link bandwidth, nearest-healthy routing, outage detection/switching/recovery and cross-region execution belong to Stage 5. There is no primary promotion, synchronous replication, broker consensus, autoscaling or packet simulation.

Resource ceilings inherit Stage 3 defaults: two million events, 200,000 pending events, 100,000 live calls/background records, 600,000 stored aggregate/origin/operation observations, 45 s wall execution, 256 MiB observed heap-growth/conservative-object guard and 2 MiB serialized result. Expanded admission includes fanout, retries, broker deliveries and apply work. Runtime checks remain authoritative. Budgets are checked for background work too; no partial passing result is returned on failure. Same-process heap and AbortSignal checks are not hard OS isolation or event-loop-responsive interruption; hosted workers/watchdogs remain Stage 6 work.

Results use pooled exact observations and nearest-rank percentiles with the existing successful-sample minimums (p50 1, p95 1,000, p99 10,000). Insufficient tails are null. Low-volume fixtures therefore remain indeterminate even when every request completes. No numerical output is a measured production-capacity claim. HDR wire serialization and full scenario/result adapters remain later work.

## Verification

The component suite covers all 12 types together, nine parameterized service/slot/FIFO cases, cache/CDN ratio endpoints and seeded hit counts, write bypass, gateway/provider rate and burst effects, logical quota across gateway replicas, replica serial apply lag, queue ACK detachment/overflow/drop/redelivery/dead-letter, worker scaling, warmup conservation, late writes/transfer occupancy, FIFO under variable ACKs, terminal-fanout cleanup and strict invalid imports/budget refusal.

Numerical oracles include a 1 ms app plus 3 ms DB = 4 ms; replica apply durations 4 ms after two commits one millisecond apart → lags 4/7 ms, mean 5.5 ms; full token bucket burst 2/refill 2 per second → next token at 500 ms; 8 decimal Mbps gives 1,000,000 bytes per second, two equal simultaneous transfers finish at 2,000 ms, or staggered at 500 ms finish at 1,500/2,000 ms.

The component suite has 58 tests; with the prior 44 foundation and 47 existing simulator cases, the final regression run covers 149 tests in six suites. Backend test TypeScript, zero-warning scoped ESLint and production compilation are checked separately.

Two test-process-only mutations disable quota enforcement or bypass bandwidth sharing; the numerical assertions must fail under those mutations and pass normally. Existing tests are not changed. An independent review found and prompted fixes for terminal caller leakage, FIFO overtaking and worker buffering outside the broker limit; dedicated regression tests cover the outcomes. Additional retained-retry rejection and drop-oldest cases verify that delayed jobs consume broker depth and discarded retry timers cannot resurrect work. The warmup fixture initially overflowed its unrelated default backlog; it now explicitly provides enough capacity for its conservation oracle, while overflow cases retain their rejection/drop assertions. A later independent review reproduced a floating-point bandwidth stall at late timestamps with 1/3/1,000-byte payloads and high bandwidth. All three new regressions failed before the fix. A current-generation completion event now explicitly completes the mathematically minimum transfer set even when timestamp rounding leaves residual bytes; every event makes bounded progress, without changing transfer sharing. Initial new-file type-narrowing/literal errors and an unused-import lint warning were corrected.

Evidence and exact final test/build/type/lint counts are recorded in `docs/audit/region-lab-components-2026-11-27/checks.json` and associated logs. `verification.json` records source hashes, full input/results and replay equality for baseline and combined 12-component examples. Reproduce from the repo root:

```powershell
node docs/audit/region-lab-components-2026-11-27/verify.cjs
```

From the backend directory, run `pnpm exec jest --runInBand --runTestsByPath src/modules/region-lab/engine/component.spec.ts`.

All Stage 4 changes remain local and uncommitted. No main-app browser behavior has changed; the existing prototype remains illustrative. Full isolated hosting E2E remains deferred by the owner. Next is separately approved Stage 5 regional routing/network/outage/recovery modeling, followed by persistence, UI integration and measured calibration.
