# Simulation model and execution — M2

M2 is the backend calculation foundation. SimulationModule is registered without controllers; Designs API/persistence and the first usable editor journey remain M3. No real infrastructure traffic or AI requests are sent.

## Structure

Backend src/modules/simulation contains:
- engine: typed catalog, graph validation, routing/propagation, queue/latency/distribution math, simulation, named paths, sampled timeline, Limits, builders/import completion and wire conversion.
- worker: one lazy worker_threads worker, strict request/reply protocol, safe errors and bounded admission.
- SimulationService: validation and execution boundary, exported by SimulationModule; AppModule imports it and shutdown terminates owned workers.

Pure engine files import no Nest/database/browser APIs. calculate() validates a complete snapshot, creates a per-calculation budget, returns JSON-safe model data plus fingerprint/version, or raises a safe computation/complexity failure. Invalid runnable graphs return structured validation and no fabricated output. Raw helpers are internal mathematical building blocks; controllers must use the validated service/calculation boundary.

The six templates/catalog and deterministic omitted-position imports match the prototype. Edge-id generation avoids collisions with supplied ids. The source files remain unchanged.

## What the model means

Load is routed by read/write/background request kind. Capacity/replicas determine utilization; a Sakasegawa queueing approximation estimates waiting time, with inferred parallel servers, saturation clamps, fixed cross-region RTTs and a lognormal path mixture. Named paths expose up to six dominant sequences. A seeded48-point timeline samples independent loads; it is labelled illustrative and is not a time-evolving queue simulation.

Do not describe p95/p99 as measured performance or exact M/M/c quantiles. The analytic test verifies only that the one-inferred-server waiting-time expression reduces to S*rho/(1-rho) below the clamp. No empirical calibration was performed. Source probability pruning (1e-7 mixtures /0.002 named paths), mixture compression90, timeout3000ms, replication cost0.25 and one-minute modeled burst semantics are preserved approximations.

Six full-precision source fixtures verify simulation fields, validation, named paths, seeded timeline, Limits curve/threshold/order and passing/failing brackets. Finite comparison tolerance is abs1e-6 + rel1e-6; ids/statuses/issues/array order are exact. No tolerance was widened.

Intentional source/wire exceptions:
- Clients have no service pool. The source computes a NaN server count; the port uses no client pool internally and exposes servers:null. Other unexpected non-finite output fails rather than becoming JSON null.
- Infinity is represented only through explicit finite/unbounded variants where supported. At zero sampled load a saturation metric may have no finite estimate; this is not a promise of infinite physical capacity.
- Limits failure at1rps yields failsAtMinimumLoad with lowerThreshold:unknown and null headroom, not zero capacity.
- Search is capped at1e7 base rps. No failure within that range yields notReachedWithinRange and a headroom lower bound, not proven infinite capacity.
- Redundant byId/bottleneck objects are removed/referenced by id; flow objects become bounded edge arrays; issue/path field mapping follows the M1 contract.

## Frozen initial bounds

| Boundary | M2 setting |
| --- | --- |
| Safe input | Existing M1 bounds:50 nodes/200 edges, strict finite/type-specific settings; safe drafts may be cyclic/empty |
| Compute expansion | 2,000,000 pair attempts,200,000 walker calls per complete calculation;4096 live distribution components; explicit rejection on exhaustion |
| Output | 512KiB encoded calculation result; at most6 paths,48 timeline points,45 Limits curve points; search24 refinement iterations |
| Execution | One worker, at most4 waiting reservations/jobs, one pending calculation of durable priority per owner |
| Time | Durable priority5000ms; preview2000ms; includes provisional reservation/queue/startup time, not reset when computation starts |
| Worker V8 limits | Old generation128MiB, young generation16MiB, stack4MiB; these do not impose an absolute process RSS/native-allocation limit |
| Preview metadata | Latest sequence per owner/editor,128 entries maximum,30second TTL; bounded cleanup; stale/superseded requests rejected |
| Error behavior | Complexity/invalid number/worker crash/timeout fails safely and frees capacity; no accurate-looking partial result |

Dense valid drafts can exceed compute support even below node/edge limits. They remain saveable; the future UI must show the actionable calculation failure. Profiles establish an initial local envelope, not a guarantee that every graph of a given size completes on all hardware.

## Admission and lifecycle

SimulationExecutor.reserve() offers provisional admission for the future M3 transaction:
1. Reserve before writing a pending row; retain its original deadline.
2. Validate/persist an immutable owned snapshot in M3, then start the reservation once.
3. Release on transaction/input failure; read reservation.result for computation completion/failure.
4. M3 handles authorization, database idempotency/coalescing, accepted-run status/polling, finalization, restart reconciliation and retention. They are not implemented by M2.

The scheduler prefers durable priority, preempts a running preview, and evicts queued previews before rejecting durable admission. It never preempts accepted durable work for a preview. AbortSignal affects previews only; accepted durable-priority calculations survive client disconnect. Supersession, owner cancellation, explicit reservation cancellation and shutdown release timers/slots; termination is awaited before a replacement worker begins.

Because M2 is memory-only, the name durable here means priority/disconnect behavior, not persistence across an API restart. M3 must persist before acceptance and mark interrupted rows failed. ExecutionError codes are internal; M3 maps them to run failure codes and Foundation HTTP envelopes. No new calculation endpoint exists yet.

Replies must match the active execution id, snapshot fingerprint, model version and requested kind. Wrong/malformed/crashed replies fail safely; retired-worker replies cannot overwrite new work. Errors never include graphs, submitted text, stack traces or credentials. Worker environment contains only runtime/temp settings (plus TS configuration in source mode), not application JWT/database secrets.

## Reproduce the checks

From the existing backend directory, Node22 and its pinned pnpm:

~~~powershell
pnpm test:simulation
pnpm build
pnpm typecheck
pnpm lint:check
pnpm test --runInBand
pnpm simulation:profile
pnpm simulation:profile:compiled
pnpm contract:phase2:check
pnpm fixtures:phase2
~~~

Profiles require no database or Redis. They run the real worker, write only docs/audit/m2-profile-source.json and m2-profile-compiled.json, and include six templates in both calculation modes, long chains, branching and an explicit dense-graph rejection. First task includes startup. Recorded worker heap is post-calculation, not a peak/RSS measurement; heartbeat records main-thread responsiveness.

pnpm simulation:health:verify requires configured real Postgres/Redis. Use the documented isolated audit services/database; it uses AppModule/HealthController on a random local port and a test-only fault worker. It checks health during a CPU loop, timeout, crash and replacement. It performs no account/DDL changes and closes its own app/workers. Fault modes exist only in test/fixtures/compute-fault.cjs and are never production calculation options.

[Source profile](audit/m2-profile-source.json), [compiled profile](audit/m2-profile-compiled.json), [real-service health evidence](audit/m2-worker-health.json), [M1 contract guide](contracts/README.md), and [living progress report](STRESSFORGE-PROGRESS-REPORT.md) preserve the dated evidence and limitations. Future work must update that same progress report; nothing publishes automatically.


## M9 acceptance clarification (2026-10-27)

The earlier controller-free/M3-future descriptions above record the M2 boundary. M3–M8 now provide owned persistence, durable simulation/limits, transient preview and the canvas/tabs; numerical formulas and declared parity exceptions are unchanged. M9 rechecks all six fixtures, unit edge cases and source/compiled profiles (16cases:15complete,1complexity rejection). Model outputs remain estimates rather than actual infrastructure stress measurements.

**Protect historical evidence:** profiles default to the legacy M2 filenames. For every later audit, first set SF_PROFILE_OUTPUT to a distinct JSON basename, e.g. m9-profile-source.json or m9-profile-compiled.json. The script constrains output to docs/audit. M9's accidental overwrite of a pre-existing dirty M2 source artifact is recorded openly in report section21; new measurements do not recover old bytes. See [M9 guide](M9-ACCEPTANCE.md) for commands and bounded-soak limits.
