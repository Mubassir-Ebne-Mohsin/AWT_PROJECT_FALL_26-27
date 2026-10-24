# M3 — saved designs and the first working model journey

Updated 2026-10-24 (Asia/Dhaka). This milestone implements the first slice in [the Phase 2 plan](PHASE-2-PLAN.md), not the complete canvas editor.

## Try it

Use Node 22 and the existing environment files. Never replace an existing .env just to apply this milestone.

Backend, PowerShell:

~~~powershell
Set-Location -LiteralPath 'C:\ADVANCED WEB TECH\AWT_PROJECT_FALL_26-27\STRESSFORGE\nest-boilerplate\nest-boilerplate'
docker compose -f docker-compose.dev.yml up -d --wait
pnpm migration:run
pnpm start:dev
~~~

In another terminal:

~~~powershell
Set-Location -LiteralPath 'C:\ADVANCED WEB TECH\AWT_PROJECT_FALL_26-27\STRESSFORGE\web'
pnpm dev
~~~

Open http://localhost:3000/dashboard, sign in, choose **New design from template**, then **Single-server MVP**. Select App servers, change replicas, wait for Saved (or press Save), then Run test. Results show estimated p95, error rate and bottleneck. Refresh, return to Dashboard and reopen the design. Completed results and their original inputs remain stored.

Run migration:run before starting the updated API: startup recovery expects the designs/design_runs tables to exist. Existing users remain intact. The migration adds tables/indexes; it does not truncate users.

## HTTP and persistence

All routes require the existing bearer authentication. Ownership is checked for every design/run operation. Existing foreign UUIDs return 403; missing UUIDs return 404, matching the frozen plan's explicit existence-disclosure tradeoff.

Mounted: GET /v1/templates, GET /v1/simulation/catalog, owned designs POST/GET/PATCH/DELETE, POST /v1/designs/:id/validate, POST /v1/designs/:id/simulate, GET /v1/designs/:id/runs/:runId, GET /v1/dashboard. Live /docs-json documents these with the frozen Zod contracts and OpenAPI 3.1. Frontend schema.d.ts is generated from that live endpoint. Preview and Limits HTTP endpoints remain unmounted; their planned types remain separate.

designs stores owner, bounded graph/traffic JSONB, metadata, timestamps and revision. design_runs stores the unique design/request identity, status/time indexes and a JSONB immutable snapshot/result payload. Foreign keys cascade on deletion. This deliberate payload column reuses the validated discriminated Run contract; it is not arbitrary unvalidated JSON.

PATCH locks the owned row, compares expectedRevision, updates allowlisted fields and increments revision. Stale writes return CONFLICT/409 with currentRevision. Safe incomplete/cyclic drafts can be stored, but runnable semantic validation is required before simulation.

## Run protocol and recovery

1. Authorize, coalesce concurrent matching submission identities, and retrieve retained keys before checking current revision/capacity.
2. Validate the saved snapshot. Enforce one pending accepted run/account, including records awaiting database finalization. Reserve M2 scheduler capacity.
3. Lock/recheck the design in a short transaction; insert a pending immutable run. Only the insertion winner starts calculation, after commit. No transaction spans computation.
4. Return 202 with run/statusUrl (200 for a terminal retained replay). Browser polls every 600ms while pending; navigation stops polling, not accepted work.
5. Update only a still-pending row with validated output or a safe failed status. Deletion cancels its reservation and late results cannot recreate rows.
6. On startup, mark interrupted pending work failed. A 15s recovery pass reconciles non-active pending rows older than 30s after a failed finalization. Capacity is released independently of database availability.
7. Preserve every accepted key for 24h and the newest 50 terminal runs/design thereafter. Pending records are never pruned. Dashboard counts describe the retained window.

**One API process only:** startup reconciliation assumes no other live instance owns pending records. This is persistent acceptance/result storage with failure recovery, not a distributed queue or automatic resumption of interrupted CPU work. Restarted pending calculations become INTERRUPTED, then need deliberate retry.

## Browser state

A memory-only EditorSession sits above the shell's system-screen replacement and is keyed by user/design. It serializes saves; each response acknowledges only its submitted baseline. Later edits remain dirty. Autosave debounces 750ms. Run flushes edits before capturing revision. Failed saves block submission.

409 retains the draft and offers inspection of current saved inputs, confirmed discard/reload or deliberate reapply. Unknown run acceptance retains requestId/revision through429/401 and draft reload; retry recovers the original run even after newer edits. After the 24h guarantee the browser requires deliberate new intent with an uncertainty warning. Old revision/semantic inputs mark results stale.

Clean reopened drafts adopt newer server revisions; dirty/in-flight drafts are never overwritten by refetch. Selected stored-result URLs take precedence over cached results. See progress report section14 for the deep-audit reproductions and fixes.

Explicit local logout/account changes dispose sessions, including when server logout fails. Late operations from disposed sessions cannot submit a new calculation. Session expiry alone retains the draft. Link/palette/keyboard navigation warns for dirty sessions, and beforeunload warns where supported, including unconfirmed calculation acceptance. Browser history traversal retains memory drafts but has no custom cancel dialog; broader history/navigation editing behavior remains a later editor milestone. Reload/closure can lose failed unsaved edits; no persistent offline draft store was added.

## Verification and limits

Use [progress report section 13](STRESSFORGE-PROGRESS-REPORT.md#13-m3--first-saved-design-journey-2026-10-24) for the final observed gate results.

- API test/designs.e2e-spec.ts: ownership, malformed inputs, empty-draft validation, concurrent save conflict, immutable inputs, same-key concurrency/replay, key misuse, dashboard ownership, real worker crash/timeout and health, deletion, admission DB failure, finalization DB recovery, actual application restart, retention.
- WEB/tests/editor-session.test.cjs: save acknowledgments, serialization, conflicts, unknown acceptance identity, save barrier, stale result, 24h guard and disposed sessions.
- WEB/tests/browser/m3.spec.ts: complete journey plus save failure, conflict resolution, dirty-link guard and lost-acceptance recovery at 1024/1440 light/dark.
- Test databases sf_m3_20261024 and sf_m3_browser_20261024 are separate from normal data. API e2e uses real PostgreSQL and existing Redis/rate-limit doubles; browser checks use real PostgreSQL/Redis.
- Aggregate storage evidence: audit/m3-storage.json. This small MVP dataset is not a growth forecast; result-size/model bounds from M2 still apply.

No runtime dependency was added. No real AI calls were added. All numerical limitations in [SIMULATION-MODEL.md](SIMULATION-MODEL.md) still apply. There is no new empirical calibration.

Remaining M4–M9: full creation flows/dashboard polish, interactive canvas/edges/undo, Traffic/Results charts, Limits/preview UI and comprehensive final acceptance. The current dashboard deliberately shows only the 10 most recently edited designs; the owned paginated list API exists, while the standalone /designs screen remains its later-phase placeholder.
