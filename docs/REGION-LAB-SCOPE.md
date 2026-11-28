# Region Lab — stage 1 scope and acceptance specification

Date: 2026-11-27, Asia/Dhaka. Status: **draft specification complete; application implementation not started**. Owner authorized Scope and contracts only. No purchase/billing feature. UI prototype and later stages require their own go-ahead.

## 1. Product and evidence boundary

Region Lab by StressForge is a private, reproducible regional capacity/resilience experiment workspace. Main navigation will eventually replace Evaluation with Region Lab. A dedicated public introduction leads to authenticated experiments. Generic profiles are assumptions; measured profiles are evidence for explicitly recorded workloads and configurations, never universal hardware predictions.

Current reference-port-v1 uses catalog capacities, inferred service concurrency, approximate waiting times, fixed regional delays and an illustrative sampled timeline. Preserve its code, contracts, stored runs and historical parity. Region Lab uses a separate contract and a new engine version. Event-driven simulation must replace decorative timeline variation. The stage-1 schemas validate input structure and consistency; they do not simulate requests or establish accuracy.

## 2. First-release boundary

- One to three named regions: us-east, eu-west, ap-south; these remain abstract deployment regions, not a claim about a provider's exact facilities.
- All12 existing component names have an explicit supported model in the table below.
- One database primary; individually placed read replicas; no primary promotion or multi-primary writes.
- One operation-class mix shared by origins, with1–8 classes and one global arrival schedule. Regional shares divide total requests. Per-region/per-operation schedules and closed-loop clients follow later.
- Open-loop constant-rate or Poisson arrivals. Piecewise-linear load multipliers. No implicit hidden burst multiplier.
- Baseline, application-deployment outage, or paired baseline/outage experiment; one outage interval affecting a declared subset of one region's application deployment.
- Explicit or nearest-healthy routing with enumerated candidates; measured/deliberately assumed network inputs; bounded retry and queue policies.
- Immutable saved experiment revisions, immutable run inputs/results, cancellation, bounded admission, readable failure states, owner-only access, regional/component/timeline results and export/report design.
- Request latency/error SLOs determine the request verdict. Growing asynchronous queues produce separate operational warnings; a request pass does not certify background-job health. Job-age/backlog SLO enforcement is a later contract revision.

## 3. Supported component behavior

| Type | First-release behavior | Explicit omissions |
| --- | --- | --- |
| client | One origin per region; operation allocation, root deadlines, idempotency-aware retries | Browser/rendering behavior, mobile radio, user think-time |
| cdn | Bernoulli cache hit for reads; hit processing and miss-to-origin path; per-replica service pool | TTL/eviction, DNS-anycast behavior, adaptive warming |
| lb | Service overhead followed by weighted-one or explicit fan-out graph dispatch; healthy regional entry selection is separate | TCP packet-level algorithms or universal provider behavior |
| gateway | Service pool and local token-bucket admission with rate/burst limits | Real authentication execution, TLS cryptography cost unless in measured service profile |
| app | Per-replica finite service slots, sampled service demand, finite FIFO waiting, explicit downstream graph | Automatic conversion from CPU/RAM specifications to performance |
| cache | Fixed documented hit probability, hit delay and miss path; writes bypass cache in v1 | Eviction, invalidation, stampedes or cold-cache fault scenarios |
| db | One primary, read/write service distributions, finite service pool and FIFO wait | Query planner, lock graph, storage-engine internals |
| replica | Read-only service; primary reference; async commit transport plus ordered apply events | Synchronous commit, promotion, conflict resolution; stale-read probability without key/version workload |
| queue | Finite retained FIFO backlog; enqueue acknowledgment, overflow policy, bounded redelivery | Exactly-once guarantee, broker consensus, regional queue failover |
| worker | Sampled service pool; pull jobs from its upstream queue; run downstream graph before acknowledging job | Autoscaling and scheduler provisioning latency |
| storage | Read/write operations; shared bandwidth and operation slots | Multipart protocol and provider-specific durability claims |
| external | One logical provider quota, latency, finite concurrency and local rate limiting | Scaling the provider by adding fictional replicas |

Every computational node references an immutable typed profile. Replica count multiplies independent app/worker/LB/gateway/cache/CDN service pools. A database primary, each read-replica node, each logical queue, storage service and external provider have replicas=1; users add explicitly modeled resources rather than silently multiplying external quotas or primaries.

CPU cores, memory, IOPS, payload-dependent CPU demand, cold caches, adaptive hit rates, packet loss, autoscaling, synchronous replication, primary failover and network partitions are **unsupported first-release capabilities**. Do not render active controls for them or silently ignore imported settings. Extensions require a schema/model version and separate validation. This boundary is narrower than the ultimate product roadmap so every exposed property can have tested consequences.

## 4. Numerical and event semantics

1. Time is simulated relative time in milliseconds internally; user schedule/outage fields are seconds. Persist exact conversions. Request/job counts are integers, bytes are bytes, bandwidth is decimal Mbps, ratios0–1, allocation shares integer basis points summing10000.
2. Arrivals continue independently of response time. Expected regional rps = baselineRps × interpolated multiplier × shareBps/10000; operation share is another independent allocation. Poisson realizations may differ from expected counts; report observed totals.
3. Start with empty pools/queues, run warmup, then measure. Warmup uses the initial schedule multiplier; excludes warmup-origin requests from measured request SLOs but preserves their resource/queue effects.
4. Admit root requests during [0,durationSeconds). They have end-to-end deadlines measured from their first arrival; retries share that deadline. Stop arrivals at the horizon and drain for at least the maximum root deadline. Report remaining background jobs separately.
5. An event is ordered by (time, priority, sequence). At equal timestamps: failure transitions and root deadlines first; completion/ack events second; health/routing transitions third; new arrivals/retry/dispatch last. A response completing exactly at its deadline times out. Tests pin these choices.
6. Use a specified portable seeded generator, a published reference sequence and counter/key-based independent streams keyed by request, operation, node, visit and attempt. Implementation cannot rely on Math.random or wall-clock time. Replicate k uses a recorded derived seed; paired scenarios share request streams without promising identical event order.
7. Service slots are explicit processing concurrency, not inferred CPU cores. Nominal service capacity for a homogeneous pool is slots/mean service seconds; replicas add pools. Catalog/request-rate assumptions are not an independent contradictory second capacity multiplier.
8. A finite FIFO wait either accepts or rejects a new call; a full pool/queue never generates fake completed throughput. Each requested downstream synchronous call contributes its actual completion/deadline to its parent's outcome.
9. Network delay is sampled one-way propagation plus serialization of request bytes on forward link and response bytes on reverse link. Matrix includes local pairs and both directions. First release shares available link bandwidth among active transfers using a documented equal-share policy; default bandwidth means bandwidth assumption, not a measured capacity. Never add an extra RTT over already-accounted forward/return propagation.
10. For a node/operation, all eligible outgoing edges share dispatch kind. all issues one child per edge (weight=1) and waits for all synchronous children. weighted_one selects exactly one edge with basis-point weights totalling10000. Async edges only enqueue to queue nodes; parent success waits for enqueue acknowledgment, not job completion. Cache hits terminate the read's miss subgraph; writes follow the miss/bypass path.
11. Request-flow graph is acyclic. Client nodes define origins; routing entries select service entry nodes, so clients have no graph edges. Every entry/fallback has a synchronous data path: writes to primary; reads to primary or replica. Replica propagation is a separate event stream referenced by primaryNodeId, not a request-flow back-edge.
12. A replica receives ordered primary commit events over the configured network and applies them in order. Expose commit-to-apply lag, not an invented data-loss/stale-read probability. Writes cannot terminate at replicas. First release has no primary promotion and no cross-region quorum claim.
13. Root retries consume additional attempts, wait exponential capped backoff with sampled bounded jitter and re-evaluate observed routing. Only retry-safe operations may use maxAttempts>1. Retryable outcomes are unavailable routing, transient rejection and transient service failure; exhausted shared deadline is terminal. No stacked implicit per-hop retry loops.
14. Root deadline expiry does not free work already executing downstream. That work continues occupying resources until completion or explicit failed-node abortion, and late responses cannot count as successful roots. Waiting work may be removed on deadline. Record abandoned/late work in diagnostics.
15. Queue maxDepth counts waiting jobs; in-service jobs occupy worker slots separately. reject_new rejects the enqueue; drop_oldest acknowledges new work and records the discarded job. Failed jobs redeliver after the configured delay up to their maximum delivery attempts, then count as dead-lettered/dropped. A worker consumes one queue in v1; validation rejects ambiguous consumers.

## 5. Routing, outage and recovery

For explicit routing use primary until observation-based failover, then first observed-healthy fallback in listed order. nearest_healthy considers only primary/fallback candidates and minimizes expected origin→entry forward+return propagation delay (stable node-ID tie-break); it does not automatically load-balance based on capacity. Candidate health is observed state and never omniscient actual state.

At outage start the declared nodes become unavailable. At affected nodes abort in-flight work and fail waiting work; calls routed to a failed node fail until routing changes. Healthy dependencies continue running. User-visible detection occurs after detectionMs; switching consumes switchMs; requests during that interval retain the previously observed destination. If every candidate fails, requests fail: no magic fallback is invented. A fallback in the same failed subset may be stored but cannot serve; validation warns, and explicit single-node outage examples must include a surviving candidate.

At outage end nodes restart empty, with original configured capacity. Observed recovery uses detectionMs, then failbackMs; returnOnRecovery controls return to the primary. No warm cache/autoscaling/ramp-up is invented. The first release does not claim cold-cache simulation. Every phase is derived from events, never decorative jitter.

## 6. Results, accounting and comparisons

offeredRequests = successfulRequests + failedRequests + unresolvedRequests, counting unique measured roots. attempts counts client attempts including retries, not downstream fan-out; component calls are reported separately. errorRateRatio = failedRequests/offeredRequests; no traffic gives null/indeterminate. Error categories are mutually exclusive terminal root outcomes; failed child calls are diagnostic counts and never added again to root failure totals.

Latency percentiles include successful measured roots only, from first arrival through final success, including backoff. Report timeout/error fractions beside percentiles to avoid concealing failures. Minimum observed successful samples: p50=1, p95=1000, p99=10000; insufficient fields are null with explicit status. These are display-policy thresholds, not statistical-accuracy guarantees. No rounding before comparison with targets. Overall and regional results are computed from compatible merged observations/histograms, never averages of percentile values. Each repetition is separately reported; a pooled distribution must be explicitly labelled and never substituted for variation across repetitions.

Request pass requires available p95, no unresolved measured roots, and global plus configured regional p95/error targets satisfied. A known target failure is fail; missing evidence without a known failure is indeterminate. Zero-traffic regions are labelled no traffic and do not create a false failure for an unexercised region; an explicitly required regional target with insufficient samples prevents pass. Background operational warnings remain visible separately. Cancellation and budget failures never return a completed pass.

Record queue depth/age, component pool utilization, offered/served/failed calls, rerouted roots, attempts per root and remaining work. Queue utilization is null because a buffer is not a service pool. Busy-slot utilization stays0–1; offered demand ratio may exceed1 and must have a different label if added.

Paired comparisons use exactly the same architecture, workload, targets, profiles, network, seed stream scheme and engine version; only the defined outage is applied/removed. Never compare a reference-port-v1 run with Region Lab output as if interchangeable. Cross-experiment architecture optimization and arbitrary run-to-run deltas follow a later comparison contract.

## 7. Dedicated UI and route scope

Public /region-lab: REGION LAB by StressForge introduction, clearly labelled illustrative demonstration, Open Region Lab, Explore example and sign-in return. No numeric accuracy claims without evidence. A dedicated shell uses graphite/navy, restrained teal/cyan, amber warnings and red failures; glass navbar with opaque fallback, solid readable tables, responsive layout and reduced motion. No purchase, pricing or upgrade CTA.

Planned authenticated routes: /region-lab/experiments, /region-lab/experiments/new, /region-lab/experiments/:id, /region-lab/runs/:id. Workspace flow: Architecture → Workload → Routing & failures → Review → Results. Profile selection is a workspace panel; documentation stays accessible without leaking owner records. Avoid showing two app-wide navbars at once. Return to StressForge preserves account/session and does not expose tokens in URLs.

Move old Simulator/Calibration/AI evidence behind How the simulator works → Verification and limitations; preserve deep-link targets or explicit redirects with equivalent content. Do not remove Evaluation navigation until replacement routes, auth, evidence links and tests pass. No route/UI changes in stage1.

## 8. Data, execution and security

Proposed isolated records: region_lab_experiments, region_lab_experiment_versions and region_lab_runs; a minimal owner-scoped request-id ledger survives experiment deletion for account lifetime to prevent an old request ID creating duplicate work. Account deletion removes it. Reference/measured profile registry is versioned operator-owned data; custom profiles are embedded in experiment versions. No user endpoint may mint measured provenance.

Reuse existing auth, PostgreSQL and Bull/Redis transport. Use a separate queue name and worker process with a lower concurrency budget. API does no CPU-heavy simulation. Acceptance transaction stores immutable run snapshot, engine/profile versions, budgets, ownership and request identity before dispatch; a recovery dispatcher reconciles queued DB rows with deterministic queue job IDs. Claim/heartbeat/terminal-write CAS protects against duplicate delivery. No queue-only accepted run and no silently lost DB-only run. Isolated test DBs only during later implementation.

Draft server-enforced ceilings:36 nodes/120 edges,3 regions,8 operations,32 schedule knots,5 repetitions,20,000 baseline rps and10x multiplier,1–60s deadline,10–3600s measurement. These are syntax ceilings, not advertised supported throughput. Per accepted job across repetitions and paired sides:2,000,000 events,45s wall execution,256MiB worker memory and2MiB stored numerical result. Admission estimates full expanded call/attempt/event demand and rejects unsupported jobs before dispatch; watchdog still enforces limits. Start with1 running and2 queued jobs per owner;100 experiments and100 retained run records per experiment. Values are provisional and must be benchmarked before release; raising them requires versioned configuration and admission tests. Exceeding a budget is an explicit failure, never silent downsampling.

Owner scopes enforced on every experiment/version/run/report/export/profile operation; Admin/Support/Instructor roles gain no implicit private-design access. Anonymous=401; another owner's identifier=404. Existing origin/CSRF rules apply to mutation routes. Strict bodies, bounded imports, parameterized queries, cursor pagination, safe errors, rate limits and no arbitrary URLs/file paths. No remote benchmark execution, payment provider, cloud provisioning, AI call or model dependency.

## 9. Acceptance gates and implementation stages

Stage1 closes when scope, units, first-release exclusions, machine-readable drafts, examples, cross-field checks, endpoint/security/lifecycle contracts and remaining gates agree. Contract fixtures are explicitly uncalibrated, with no passing simulation results invented.

Stage2: review dedicated intro/navbar/workspace/results prototype including empty/loading/error/mobile/light/dark/reduced-motion states. Stage3: bounded seeded event engine with conservation, FIFO, timeout and hand-calculated fixtures. Stage4: one validated behavior per exposed component property; unsupported imports fail. Stage5: routing/network/outage/recovery with elapsed-time checks. Stage6: owner-private persistence, queue recovery/cancellation/idempotency under races. Stage7: result inspection/comparison/export and provenance. Stage8: measured calibration and preregistered acceptance. Stage9: full release/browser/security/resource verification.

Mandatory correctness gates: repeatable outputs, event ordering golden cases, exact request accounting, no double-counting network/failed roots, no percentile averaging, bounded retry amplification, queue overflow/redelivery accounting, correct scenario hashes, owner isolation, stale result detection, cancellation/completion race, crash/recovery and budget failure. Deliberately break each critical boundary and demonstrate a failing check. Existing assertions are not weakened without owner approval.

Calibration uses independent measured workloads for single service, multiple replicas, connection pool, cache hits/misses, queue workers, external throttling and network-emulated failover. Use open arrival-rate load generation, preserve censored/time-out requests, measure warmup and repeatability; fitting and held-out validation workloads are disjoint. Network emulation is labelled and does not establish intercontinental accuracy. Candidate tolerances (throughput10%, p5015%, p9520%, saturation15%) are **unregistered research proposals**, not pass marks or release promises. Before running acceptance, owner approves frozen metrics, operating ranges, repetitions, exclusion rules, tail/near-zero error treatment and outage criteria. Publish unsuccessful cases and limits. No acceptance claim from schema checks, mock transport or simulated measurements.

## 10. Stage1 deliverables

- [Contract semantics and REST boundary](REGION-LAB-CONTRACTS.md)
- [Executable draft schemas](region-lab/contract.cjs)
- [Scenario JSON Schema](contracts/region-lab-v1.schema.json)
- [Run JSON Schema](contracts/region-lab-v1-run.schema.json)
- [Draft OpenAPI](contracts/region-lab-v1.openapi.json)
- [Baseline and paired-outage examples](region-lab/examples.json)
- [Offline specification checker](region-lab/verify-contract.cjs)

Current application schema/engine/OpenAPI/route exports, owner data, dependencies and services remain unchanged. This is a design contract, not a deployed capability.
