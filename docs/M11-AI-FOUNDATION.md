# M11 — Experimental AI backend and design-version foundation

Completed locally: 2026-10-28 (Asia/Dhaka), under explicit user approval to proceed after the M10 no-go. **This implements backend infrastructure; it does not reverse M10's quality verdict, enable real AI, or implement M12's assistant UI.**

## What is implemented

- Canonical Zod/OpenAPI contracts and generated frontend types; live API types regenerated from /docs-json on the running development API.
- Optional AiModule with native-fetch Ollama adapter. Defaults disabled, loopback-only origin whitelist, two installed-model names allowed, no user-supplied prompts/model/origin, no provider SDK or other runtime dependency.
- Authenticated asynchronous job endpoints and current provider readiness. Every job belongs to an owned saved design and a completed simulation of that exact revision/fingerprint.
- Short server-derived evidence packets,1400-byte message budget,2048 context/256 output tokens,16KiB upstream response bound, strict output/reference checks and before/after model-tag digest checks. Output remains experimental prose; schema validity is not factual correctness.
- Durable job status, idempotent retained request keys, cancellation, generation deadline, interruption recovery and bounded retention. No accepted job can change the design or simulation numbers.
- Physical and host commit/virtual-memory preflight; running safety checks. Windows uses fixed, noninteractive CIM sampling; Linux uses /proc/meminfo. Missing telemetry fails closed. No global system/Ollama settings are changed.
- Atomic immutable versions on create/edit, truthful current-revision migration baseline and bounded owner-only cursor listing. This is not the M15 History/restore/Compare UI.

## Endpoints (existing API prefix /v1)

| Method / path | Behavior |
| --- | --- |
| GET /ai/readiness | Authenticated;200 with enabled/ready/reason. Never loads a model; core /health stays independent. |
| POST /ai/jobs | Body: requestId,designId,expectedRevision,runId.202 accepted;200 terminal replay. |
| GET /ai/jobs/:id | Owner-only retained status/result/provenance;401/403/404 follow existing conventions. |
| POST /ai/jobs/:id/cancel | Owner-only, idempotent terminal behavior; aborts active upstream request. |
| GET /designs/:id/versions | Owner-only snapshots; limit1–50 (default20), optional positive beforeRevision cursor. |

Job provenance: immutable version ID, design revision, run ID/input fingerprint, model name/digest, prompt/schema version, created/completed/expiry timestamps. Internal facts are not returned by job endpoints. Source run records may undergo their existing retention: a bounded copy of required numerical evidence is retained in the job, so no new FK blocks Phase2 run pruning.

## Resource and recovery protocol

One active StressForge inference globally, therefore at most one per owner. Concurrent work is rejected with429; no unbounded queue. A database advisory instance lease and a unique pending-row constraint defend capacity across duplicate API starts; another instance's AI is unavailable while its core API remains usable. This remains a single-active-API local architecture, not certified distributed failover.

Admission requires at least1536MiB free physical and4096MiB free commit/virtual headroom. Running checks use512/1024MiB floors every5seconds. The generation deadline defaults60seconds, bounded to1–65seconds in config; preflight/DB operations have their own bounded timeouts. These guards are not proof that an arbitrary workload fits RAM/VRAM or that model quality is acceptable.

Cancellation aborts fetch and requests unload. **An aborted HTTP connection does not prove GPU work stopped.** Admission remains blocked until the generation promise settles and /api/ps confirms no runner. If that check/unload fails, capacity stays blocked until a later successful idle check. The mock upstream regression deliberately keeps a runner reported after cancellation and verifies429 until idle. Actual GPU cancellation was not retried on the memory-constrained laptop.

Accepted jobs are durable: closing the browser or losing the202 acknowledgement does not cancel accepted work. Retry the same requestId to discover it; use explicit cancel to stop it. This clarifies the original broad disconnect-abort wording in the plan. On API restart, pending jobs become interrupted; no generation automatically restarts. Uncertain DB acknowledgements recover as interrupted after the bounded reconciliation window rather than inventing a completed result.

## Retention and version integrity

- AI jobs are retained for at least24hours; expired terminal jobs become eligible for pruning on a later admission. No separate unlimited chat/prompt history exists.
- Maximum500 retained AI job rows globally. If unexpired provenance fills capacity, new admission returns429 instead of evicting keys. Pending rows are not pruned.
- Keep the latest100 design versions plus any older version referenced by a retained AI job. Reference checks/FKs prevent pruning pinned versions.
- Versions are insert-only through the application. No version-update/restore endpoint is added in M11. Explicit owner design deletion cascades its versions/jobs; arbitrary independent deletion of a pinned version is restricted.
- Migration records only each existing design's current revision as baseline. Earlier changes cannot be reconstructed and are not fabricated. Migration rollback removes the new metadata tables, not original designs/runs; do not use rollback as a normal user undo action.

## Configuration and local use

Existing .env was not changed. Defaults keep AI off; .env.example documents:

```dotenv
AI_ENABLED=false
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:1.5b
AI_DEADLINE_MS=60000
AI_MIN_FREE_MIB=1536
AI_MIN_COMMIT_MIB=4096
```

Do not enable real inference merely because the foundation tests pass. M10 still requires a successful memory/quality follow-up. Ollama should be reserved for this app during a controlled enabled test; existing loaded models prevent admission, but unrelated external clients are not coordinated by the app's lease. The two allowed model names and loopback origins are validated at boot; redirects are rejected at transport level.

Normal setup (Node22, pinned backend pnpm):

```powershell
Set-Location -LiteralPath 'C:\ADVANCED WEB TECH\AWT_PROJECT_FALL_26-27\STRESSFORGE\nest-boilerplate\nest-boilerplate'
pnpm migration:run
pnpm start:dev
# In a separate backend terminal:
pnpm build
pnpm lint:check
pnpm typecheck
pnpm contract:phase3:check
```

This session applied AiFoundation1793200000000 to the development database:5 existing designs were unchanged (count and aggregate state digest equal before/after),5 baseline versions added,0 AI jobs. Existing users/graphs/runs were not reset.

Frontend type generation:

```powershell
Set-Location -LiteralPath 'C:\ADVANCED WEB TECH\AWT_PROJECT_FALL_26-27\STRESSFORGE\web'
pnpm gen:api        # actual running API /docs-json
pnpm gen:phase3     # separate canonical foundation contract
```

## Verification

- Backend build/typecheck and non-mutating lint pass;22 existing warnings,0 errors.
- Unit suite201 passed,2 existing opt-in Redis-compose tests skipped.
- Full e2e76/76 passed in85.675seconds: original Foundation/Phase2 coverage plus17 M11 tests with real isolated Postgres and a stateful mock HTTP upstream.
- M11 checks include upgrade/backfill/rollback/re-upgrade, save conflict/version history, owner isolation, idempotency, immutable provenance, missing/offline model, malformed/truncated/oversized output, invented refs, changed model digest, preflight/runtime memory pressure, deadline/cancel, held capacity, pinned-version pruning, explicit deletion cascade, one instance lease, expiry and restart interruption.
- Frontend production build, typecheck and lint pass with new generated API types. No user-interface change in M11; browser/editor suites were not repeated. Existing authenticated backend flows are covered by full e2e.
- Raw runtime OpenAPI exported from the isolated live Nest HTTP response; primary types then regenerated from running development /docs-json. Canonical phase3 contract matches source.
- No real generation/model download, production deployment, new dependency, commit or GitHub push. No claim that generated explanations are now trustworthy.

Isolated reproduction from project root (never substitute normal DB parameters):

```powershell
docker compose -f docs/audit/phase3/m11-2026-10-28/compose.yml up -d --wait
.\docs\audit\phase3\m11-2026-10-28\run.ps1 unit
.\docs\audit\phase3\m11-2026-10-28\run.ps1 e2e
# Stop only this disposable test service when finished; retain its volume:
docker compose -f docs/audit/phase3/m11-2026-10-28/compose.yml stop
```

The runner uses a fresh timestamped test database, explicit disposable config and a temp cwd without .env. The migration compatibility check uses another unique isolated database. Tests do not truncate normal data. The real Ollama port is never used by these test generations.

## Next

M10 quality/memory follow-up remains open before enabling real inference. M12 can then add context-aware result explanation UI, stricter sentence-level grounding and user-facing pending/retry/cancel states under separate approval. Real improvement/application is M13; drafting is M14. All four proposed roles remain in the overall plan; no Instructor/Reviewer or administration workflow was implemented here.
