# Region Lab regional simulation — stage 5

Implemented locally on 2026-11-28. This stage adds regional execution to the typed component engine: directed shared network resources, client/entry routing, observation-based failover/failback, application-deployment outages, worker transport and ordered replica transport/application. It remains an **uncalibrated offline engine**. No API, database job, main-app navigation or live prototype execution is registered.

## Files and entry points

Under `nest-boilerplate/nest-boilerplate/src/modules/region-lab/engine/`:

| File | Responsibility |
| --- | --- |
| `regional-input.ts` | Strict regional execution schema, complete directed matrix, per-origin/operation routes, targets and permitted outage subsets. |
| `regional-runtime.ts` | Separate actual/observed health, per-route transition clocks, directed equal-share links, transfer diagnostics and event-derived phases. |
| `regional-engine.ts` | Validated single-side execution, regional target verdicts, canonical hashes, deterministic repetitions and shared experiment budgets. |
| `regional-scenario.ts` | Strict adapter from the Stage 1 draft scenario: profile resolution, unsupported-property refusal, second-to-millisecond conversion and provenance/hash. |
| `regional.fixture.ts` | Explicit synthetic two-region assumptions used by tests/evidence. |
| `regional.spec.ts` | Numerical, failure-clock, replication, worker, three-region, validation, budget and compatibility tests; test-only faults. |
| `component-input.ts` | Existing local structure/semantics split into reusable helpers. The public local schema retains its original restrictions. |
| `component-engine.ts` | Internal regional execution seam, network lifecycle hooks and failed-node abortion. The public `simulateComponents` entry remains local-only. |

`simulateRegional` accepts `regionalVersion:1` and returns one side. `simulateRegionalExperiment` accepts baseline/outage/paired mode and 1–5 repetitions. `simulateRegionLabScenario` accepts the existing `region-lab-event-v1-draft` document, resolves immutable profile references and invokes the experiment. None bootstraps Nest or reads environment configuration. The internal `executeComponentModel` is for validated callers only; future HTTP/jobs must call the validated entry points.

## Network accounting

The matrix must contain every ordered active region pair, including local pairs, without duplicates. Three regions require nine rows. Propagation distributions, decimal Mbps and provenance are explicit input assumptions; names such as `us-east` do not imply measured internet performance.

Each message serializes its bytes on the directed shared link, then incurs one sampled one-way propagation delay. Simultaneous transfers share that link bandwidth equally; the reverse direction has an independent pool. Local self-pair traffic shares its declared local resource. There is no additional hidden RTT. Regional edges require `oneWayDelayMs=0`, so the local delay cannot be charged again alongside the matrix.

Transport includes client→selected entry request bytes, entry→client response bytes, downstream synchronous request/response bytes, async enqueue request/ACK response bytes, queue→worker job fetch bytes and worker→queue zero-payload ACK propagation. Worker fetch reserves one processing slot until arrival/processing/downstream completion; this models a blocked fetch slot, not CPU occupancy. Private worker buffers remain unsupported (`waitingCapacity=0`).

Primary commits serialize the operation's `requestBytes` as the explicit replication-log-size approximation, propagate over primary→replica links, then enter ordered application. No arbitrary extra log overhead or synchronous commit ACK is invented. Commit records are queued in commit order before transport; a later fast arrival cannot overtake an earlier slow one. Replica apply demand runs on the previously documented dedicated serial lane. Commit-to-apply lag includes serialization, propagation and apply waiting/service. Primary success does not wait for replica application. No stale-read probability, quorum, primary promotion or data-loss prediction is claimed.

Timeout does not remove bytes already serialized or propagated; pending transfers retain their event/memory accounting until they complete or remain after drain. RPCs whose caller/deadline is already terminal can be suppressed before downstream service starts. Already processing healthy dependencies continue holding their resources. This is an application-level event model, not a packet-level TCP or cancellation-delivery simulator.

## Routing and outage clocks

Routes enumerate a primary and up to two distinct fallback entry nodes for every origin/operation. Every candidate must retain the required synchronous data path; writes cannot target replicas. The local origin `entryNodeId` is a validated alias of the canonical first operation's primary, while per-operation route selection controls actual execution.

Explicit policy starts at its primary and selects the first observed-healthy candidate in declared order after switching. Nearest-healthy policy minimizes expected forward-plus-return propagation among only those candidates, with ASCII node-ID tie breaking. It does not choose based on capacity, instantaneous sampled latency, or actual hidden failure state. Initial nearest selection is the baseline route; merely choosing a nearer declared fallback does not inflate rerouted-root counts.

Actual failure happens at `warmup + startMs`. It aborts active and queued work only at the explicitly failed application nodes. Other dependencies retain running work. New calls at failed nodes return unavailability. Failure events precede equal-time service completions; root deadlines retain their existing first-priority semantics.

Each route has its own observation epoch. It continues using its old destination for `detectionMs + switchMs`. There is no instantaneous fallback based on actual state. If the outage ends before a pending detection/switch event, stale transition callbacks are invalidated. If every enumerated candidate is observed failed, the selected entry is null and requests fail; no new destination is fabricated.

At outage end, configured pools are available empty and gateway tokens restart at their configured startup burst. Retained broker jobs belong to their healthy queue, so interrupted worker deliveries can redeliver after recovery. Recovery becomes observed after `detectionMs`, with `failbackMs` before the next route transition. `returnOnRecovery=false` retains an active fallback; if no active entry remains, recovery can restore an available candidate. Fixed cache hit ratios resume unchanged: cold-cache behavior is not implemented or implied.

Phases are actual transition records relative to measurement start: healthy, undetected outage, switching, rerouted, recovering, recovery detected and recovered. An evaluated route that does not change is marked `route_unchanged`. Routing counts are per attempt; rerouted counts are unique measured roots relative to each policy's baseline entry. A failed child, retry and root failure are not added together into invented root totals.

The supported outage remains one application-deployment subset in one region: app, LB, gateway, cache or worker. Database/storage/external/queue failures, network partitions, primary failover, autoscaling and provider-specific load-balancer health inference are rejected or outside this release. Candidate health follows the declared entry-node failures; an unaffected entry is not automatically marked failed because a downstream dependency failed.

## Results, repetitions and limits

Global and origin latency summaries use successful-root observations, not averages of regional percentiles. Errors use unique failed roots divided by offered roots. A known global or configured regional target violation is fail; missing required p95 evidence without a known violation is indeterminate. Required zero-traffic regional targets cannot manufacture passing evidence. The original sample minimums remain p50=1, p95=1,000, p99=10,000.

Baseline and outage sides use identical architecture, workload, targets, profiles, network and seed; only the outage is removed for the baseline. Repetition 0 uses the supplied seed; subsequent seeds are the first big-endian uint32 of SHA-256 UTF-8 `JSON.stringify([seed,"replicate",index])`. Each repetition is reported separately. Offered request/origin/operation streams are shared within paired sides, while route-dependent downstream event order and load may differ. No pooled repetitions are substituted for variance estimates.

Event and observation limits, wall execution, retained memory checks and final serialized result size apply across both sides and all repetitions. The existing runtime limits still apply per active execution. Admission estimates the largest declared route candidate's expanded downstream demand, including broker delivery and apply work. Runtime accounting includes pending network transfers as background records. Any budget or cancellation failure throws instead of returning a completed partial experiment. The shared limits remain provisional engineering guards, not advertised throughput capacity.

As before, heap-growth/count checks are not OS-enforced process isolation, and a synchronous call cannot receive ordinary event-loop cancellation while blocked. Stage 6 must provide private persistence, worker/process/watchdog execution, cancellation and recovery races before hosting. Exact internal observations are not the planned HDR wire format; wire serialization and result views remain later stages.

## Draft import boundaries

The adapter validates all profiles, even unused ones, rejects unknown properties and invalid primary/replica/worker topology, and preserves supplied provenance in the result manifest. A `measured` origin label is a user declaration, not independent calibration proof. Layout coordinates, labels and provenance are metadata; they do not alter capacity. Their canonical scenario hash is separate from the normalized execution hash. Imported profile properties are normalized through the strict typed schema, so JSON property-key order cannot change that scenario hash.

The draft permits nonzero worker waiting capacity, but the implemented broker model deliberately rejects it rather than hiding jobs outside the retained backlog limit. Each broker has one explicitly scalable worker deployment, and each worker consumes one broker. These are existing Stage 4 restrictions, preserved in the importer. No draft schema artifact is silently rewritten to claim every draft setting is executable.

## Verification and reproduction

The final suite passes 33 regional checks plus 149 prior component/foundation/existing-simulator checks: **182 tests in seven suites**. Scoped ESLint has zero warnings, backend test TypeScript and production compilation pass. Final exact counts and exit codes are in `docs/audit/region-lab-regions-2026-11-28/checks.json`, with build/type/lint/regression and expected-fault logs. The suite covers two/three-region global allocation; asymmetric propagation and bytes; directed-link contention; stable nearest routing; independent detection clocks; short-outage invalidation; optional failback; all-candidate failure; failure/completion ties; healthy downstream occupancy; shared retry deadlines; out-of-order replica transport; interrupted worker fetch/recovery; gateway token reset; target and aggregate budget rules; canonical hashes and strict draft import.

Numerical references include 1 ms app + 3 ms DB + four local 2 ms propagation legs + two 1 ms request serializations = 14 ms. An asymmetric remote-origin variant yields 40 ms. Two 1 MB transfers on an 8 Mbps link plus 10 ms propagation finish at 2,010 ms; an independent reverse transfer with 20 ms propagation finishes at 1,020 ms. A reference outage starting at 200 ms switches at 300 ms and fails back at 700 ms, producing 90 successes/10 unavailable roots from 100 arrivals. Replica transport at low load adds 1 ms serialization + 10 ms propagation + 4 ms apply = 15 ms lag.

The first regional suite passed 25 cases and failed three new-fixture assumptions: removing a fallback left an unused deployment, a chosen aggregate budget was not actually exhausted, and a Poisson example was expected to produce an exact count. The fixtures now remove unused topology, derive a budget demonstrated sufficient for one pair but insufficient for two, and explicitly select constant-rate arrivals. Existing assertions were not edited.

Test-only mutations bypass all transport or route using actual health before detection; both must fail their numerical/timing assertions. Normal tests then pass without either variable. No mutation switch is compiled into the engine. Evidence replay also checks the eight Stage 3 source hashes and exact equality of both recorded Stage 4 baseline/12-component results after the shared-kernel extension.

Reproduce offline evidence from the repo root:

```powershell
node docs/audit/region-lab-regions-2026-11-28/verify.cjs
```

No calibrated geographic/production accuracy, browser verification, provider call or hosted isolated E2E is claimed. All changes remain local and uncommitted. The prototype remains illustrative. Next is separately approved Stage 6 owner-private persistence and isolated job execution.
