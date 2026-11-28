# Region Lab Stage 6 — private storage and isolated jobs

Implemented locally on 2026-11-28. This stage adds authenticated experiment storage and durable execution to the Stage 5 numerical engine. It does not connect the prototype UI or claim real-world calibration. The owner's separate full isolated hosting rehearsal remains deferred.

## Implementation map

Paths below are relative to `nest-boilerplate/nest-boilerplate/`.

| File | Responsibility |
| --- | --- |
| `src/database/migrations/1795600000000-RegionLabStorage.ts` | Five tables, indexes, owner/version foreign keys, lifecycle/immutability constraints and account-status/deletion fences |
| `src/modules/region-lab/entities/region-lab.entity.ts` | TypeORM entity mappings for the five tables |
| `src/modules/region-lab/region.dto.ts` | Strict Zod request DTOs; owner IDs cannot be supplied |
| `src/modules/region-lab/region.controller.ts` | Authenticated HTTP operations, migration readiness guard, UUID/query validation and acceptance status codes |
| `src/modules/region-lab/region-policy.ts` | Admission limits, canonical hashes, code/profile binding, trusted reference registry and owner-scoped cursors |
| `src/modules/region-lab/region-store.service.ts` | Parameterized transactional SQL, owner checks, immutable versions, idempotency, pruning, claim/cancel/finalize fencing |
| `src/modules/region-lab/region-jobs.service.ts` | Durable PostgreSQL dispatcher, cancellation polling, shutdown and lease recovery |
| `src/modules/region-lab/worker/region-executor.ts` | Fixed child launch, scrubbed environment, independent deadline, IPC validation and exit-before-publication |
| `src/modules/region-lab/worker/region-compute.worker.ts` | Snapshot verification and bounded numerical execution in a child process |
| `src/modules/region-lab/worker/region-result.ts` | Finite/size/hash/provenance/seed/side/accounting validation before accepting child output |
| `src/modules/region-lab/region-lab.module.ts` | Dependency registration; imported by `src/app.module.ts` |
| `test/region-lab.e2e-spec.ts`, `test/jest-region-lab.json`, `test/fixtures/region-worker-fault.cjs` | Disposable real-PostgreSQL HTTP/storage/process checks and deliberate fault fixtures |

Flow: existing global authentication/CSRF boundary → controller/strict DTO → owner-scoped store transaction → frozen version and queued run → database claim/lease → executor child → unchanged numerical engine → validated result → fenced terminal transaction. Polling reads operational status; numerical result inspection comes in Stage 7.

## Storage and ownership

| Table | Stored information |
| --- | --- |
| `region_lab_experiments` | Owner, title/description, current revision and timestamps |
| `region_lab_versions` | Immutable experiment revision with scenario, profile/code hashes, budgets and optional source-design reference |
| `region_lab_runs` | Frozen execution input, lifecycle, lease, terminal failure or native engine result |
| `region_lab_requests` | Owner/request UUID idempotency ledger, original run ID and last status, including after pruning |
| `region_lab_execution_slot` | Singleton physical-execution lease held until worker close or expiry |

Every private read/write selects by authenticated owner. Another account, including Admin, gets 404 for a foreign identifier. A source-design reference must be an owned, retained design revision; Region Lab does not modify the original design. Public sharing is not introduced.

Edits require `expectedRevision`; concurrent stale edits conflict. Versions and run inputs cannot be updated in SQL. Terminal runs cannot be overwritten. Account suspension fences queued/running work; account deletion fences work before cascading private rows. Re-enabling an account does not resurrect its old jobs. The execution slot deliberately has no cascading run foreign key so account deletion cannot immediately free capacity while its child is still exiting.

A repeated owner/request UUID returns the accepted run, without repeating compute. Reuse for a different experiment/revision conflicts. After run pruning or experiment deletion, the retained ledger returns a minimal `retained:false`, `resultExpired:true` record instead of silently rerunning. Account deletion removes that owner's ledger too.

List endpoints return summaries with keyset pagination, not per-card scenario fetches. Cursors are scoped to owner and collection; PostgreSQL microseconds are preserved so equal-millisecond timestamps do not skip records.

## Authenticated API in this stage

All paths start with `/v1/region-lab`. Existing JWT authentication, account checks, response envelopes and mutation CSRF rules apply. The submit route declares six submissions/minute using the existing throttler. The focused HTTP suite uses the real AuthGuard/signatures with a controlled revocation-store fixture; it does not claim a full application/Redis hosting rehearsal.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/profiles` | Trusted versioned reference assumptions |
| POST | `/validate` | Validate/admit a scenario without queuing |
| GET / POST | `/experiments` | List summaries / create an experiment |
| GET / PATCH / DELETE | `/experiments/:id` | Read / optimistic revision edit / delete with expected revision |
| POST | `/experiments/:id/duplicate` | Create an independent owned copy |
| GET | `/experiments/:id/versions` | List immutable revision metadata |
| POST | `/experiments/:id/runs` | Accept `{expectedRevision,requestId}`; 202 new, 200 replay |
| GET | `/runs/:id` | Owner-private operational status and safe failure metadata |
| POST | `/runs/:id/cancel` | Idempotent cancellation |

There are 12 operations across nine paths. Unknown body/query fields are rejected. A missing storage migration yields a safe 503 for Region Lab rather than exposing SQL details. Result inspection, regional tables, comparison, exports and report operations from the draft contract are deferred to Stage 7; this status response is not the final numerical result wire format.

## Execution, recovery and limits

Implementation adjustment from the Stage 1 draft: its Bull/Redis dispatch proposal is replaced here with durable PostgreSQL queued rows. Acceptance and dispatch now share the same transactional source, avoiding DB/queue dual-write reconciliation; existing Bull/Redis modules remain unchanged. The queue is durable PostgreSQL storage. It reuses TypeORM and requires no new queue service or dependency. A short transaction/advisory lock serializes admission and claim/finalize boundaries. A singleton slot plus a partial running index arbitrate across dispatchers. One logical job runs at a time; cancellation holds the slot until its physical child exits. Cancellation and completion use first-terminal-commit-wins semantics.

| Guard | Current engineering setting |
| --- | --- |
| Scenario JSON | 90 KiB, within existing 100 KiB HTTP-body ceiling with metadata allowance |
| Owner storage | 100 experiments; 1,000 versions per experiment; 100 retained runs per experiment |
| Pending queue | Two queued per owner; 64 globally |
| Dispatch polling | 250 ms; database failure backs off five seconds |
| Execution deadline / lease | 45 s parent watchdog / 60 s database lease |
| Child V8 | 160 MiB old space; 16 MiB semi-space |
| Observed child RSS | 256 MiB cooperative guard plus parent heartbeat checks |
| Engine | Two million events; 200,000 pending events; 100,000 live records; 600,000 observations; 2 MiB serialized result |

These are provisional resource guards, not advertised production capacity. V8 heap flags are enforced by Node; RSS sampling/engine guards are **not an OS/cgroup hard memory limit**. A transient native allocation can exceed the sampled limit before detection. The trusted fixed child is process isolation for crashes/deadlines, not a sandbox for arbitrary user code. Hosted OS/container memory enforcement remains a release gate.

The child receives only NODE_ENV and temporary-directory paths (plus the fixed source-project path in source mode). Database/JWT/provider credentials are not forwarded. Only a fixed internal worker entry is launched; the request cannot supply code, a command or a path. Parent publication waits for child close and validates ID/token/snapshot hash, finite values, size, accounting, engine/input hash, provenance and expected repetition/seed/sides. No partial simulation becomes a completed run.

An expired running lease becomes interrupted/failed, never silently queued again. Queued jobs survive a restart. A graceful server shutdown interrupts its active job; it is recorded as interruption rather than user cancellation. Old tokens cannot publish after expiry, cancellation, deletion or replacement. The parent wall watchdog and child parent-liveness checks reduce orphan duration; leases fence database publication. A paused or partitioned host still requires deployment process supervision; database arbitration is not an OS-wide physical-process guarantee.

Engine-code digest, profile-registry digest and budgets are frozen with the run. A changed build cannot silently execute an old snapshot using different code. Source and compiled builds have different code-byte digests by design. Numerical hashes exclude layout and descriptive metadata; full snapshot hashes preserve those details separately. Eleven operator reference profiles represent service types (clients need no service profile). They are explicitly uncalibrated assumptions. Custom profiles remain user assumptions; spoofed measured/reference registry entries are refused.

## Migration and verification boundary

The migration was applied, exercised and rolled down/up only in the dedicated local PostgreSQL 17 test cluster on 127.0.0.1:55468, database `sf_region_stage6`, user `sf_stage6`. No owner's development database, existing service or environment file was read/reset. Rollback refuses experiments, retained idempotency records or an occupied slot; it never discards retained work to make rollback succeed. Deployments must apply the migration through the normal migration workflow before using these endpoints. It has **not** been applied to the owner's development database.

Final results: **30 focused integration tests plus 182 prior numerical tests pass (212 across separate runs/eight suites)**. TypeScript, zero-warning scoped ESLint, production build, compiled-child smoke, eight foundation hashes and two prior numerical golden outputs pass; each of the two deliberate boundary faults fails its intended test. Final counts, command logs, mutation results, compiled-child smoke and source hashes are recorded in `docs/audit/region-lab-storage-2026-11-28/checks.json`. The new real-database suite covers ownership, JWT/CSRF/strict payloads, optimistic edit races, immutable snapshots, precise pagination, source-design ownership, concurrent idempotency, queue/storage limits, pruning/tombstones, claim races, stale leases, cancellation/completion, suspension/deletion, restart recovery, shutdown, worker crash, spinning timeout, real heap exhaustion, malformed IPC/results and rollback refusal. Deliberate owner and lease bypasses exist only in the new test file; each must fail its boundary assertion before normal tests pass again. No existing test assertions were changed.

Initial checks caught a SQL function dollar-quote escaping mistake, TypeORM raw UPDATE RETURNING shape handling, and a leftover result-size guard reference. These were corrected before final verification; initial failure logs are retained. Existing Stage 3/4 numerical evidence and the 182-test engine/simulator regression remain required.

Reproduce the focused suite from the backend with a dedicated test cluster already started: `pnpm exec jest --config test/jest-region-lab.json --runInBand`. The test deliberately forbids dotenv configuration and targets only its explicitly named disposable database. Run `pnpm build`, then from the repo root `node docs/audit/region-lab-storage-2026-11-28/compiled-smoke.cjs` for the compiled child. The compiled smoke does not require a database or bootstrap the app.

## Next separately approved stage

Stage 7: versioned result serialization, inspection/comparison/export/report and UI/API integration. Current native results do not expose HDR histogram samples. Capture histograms during engine observation with a versioned codec; do not reconstruct distributions from saved percentiles or recompute historical runs. Whole-account export integration must include Region Lab before release. Measured calibration, production memory/process supervision, complete browser/security acceptance and the deferred hosting rehearsal remain later gates. No screenshots or calibrated accuracy are claimed for this backend-only stage. Work remains local and uncommitted; no push was performed.
