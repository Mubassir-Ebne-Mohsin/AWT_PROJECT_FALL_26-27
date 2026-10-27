# M9 — local Phase 2 acceptance

Approved by the user on 2026-10-27 (Asia/Dhaka). This milestone verifies the existing Foundation and M1–M8 core loop, repairs demonstrated defects, and prepares local commits. It does not authorize publication or Phase 3. The current verdict and final check totals belong in [the living report, section 21](STRESSFORGE-PROGRESS-REPORT.md#21-m9--phase-2-integrated-acceptance-2026-10-27).

## What changed

- Redis rate limiting uses its own fail-fast ioredis configuration: no offline queue or resend, one retry, one-second connection/command deadlines. The application's separate node-redis client bounds queueing and socket inactivity to one second, with a 128-command queue and 500ms idle pings. Socket inactivity is not an absolute per-command SLA under continuously arriving replies. An unavailable dependency returns `503 UNAVAILABLE`; unexpected programming/Lua/schema errors remain visible.
- PostgreSQL pool acquisition is limited to one second, server statements to two seconds, client queries to 2.2 seconds, and idle transactions to five seconds. Server cancellation prevents a blocked write from silently committing after the HTTP client gives up. These are local-project defaults, not a production SLA; longer future migrations/queries need deliberate review.
- Refresh looks up the user before atomically consuming the refresh credential. A failed database lookup can be retried after recovery without being mistaken for token replay. Rotation, absolute expiry, family revocation and real replay rejection remain enforced. Loss of a successful refresh response can still require signing in again; no insecure replay bypass was added.
- Redis connection errors are matched by their installed constructors: several inherit name="Error" and otherwise incorrectly return500. A controlled own-connection CLIENT KILL now returns503UNAVAILABLE; docs/audit/m9-socket-repro.cjs reproduces it without stopping a service.
- At laptop widths, all twelve palette names/capacities and category labels remain readable, with an explicit scrolling cue. The canvas load legend wraps beside the minimap, and full Limits ranges/reasons wrap without ellipsis.
- Scoped transitive overrides patch multer, Bull's UUID dependency and the seeder's Faker dependency. No frontend runtime library, numerical formula or public API shape changed.
- New run requests validate their revision before claiming a provisional request key, while retained keys still take precedence after later edits. A rejected invalid revision cannot poison a concurrent valid request.
- Source workers use the existing SWC dependency inside a small worker-only loader; production continues loading emitted JavaScript. No numerical equations, resource limits or queue-inclusive deadlines changed.
- `SF_PROFILE_OUTPUT` accepts a JSON basename for the existing profile scripts, keeping later evidence separate from historical M2 artifacts. Without it, the legacy filenames remain unchanged; always set it for a later audit.

## Reproduce safely on Windows

Use Node 22 and the pinned pnpm versions (backend 10.34.7, web 12.14.0). Docker Desktop must be running. Do not use a database containing normal user data. This audit used only `stressforge-m9-postgres` (5552), `stressforge-m9-redis` (6399), `sf_m9_audit`, `sf_m9_e2e`, API5003 and web3003. Normal services3000/5001 and existing development/QA containers were preserved.

For a **fresh** audit environment, from STRESSFORGE:

```powershell
docker compose -f docs/audit/docker-compose.m9.yml up -d --wait
# If the explicitly named M9 containers already exist from a previous audit,
# verify their label/ports and reuse them; do not delete volumes to rerun checks.
docker inspect --format '{{index .Config.Labels "stressforge.audit"}}' stressforge-m9-postgres
docker port stressforge-m9-postgres 5432
docker port stressforge-m9-redis 6379
```

`docs/audit/m9-run.ps1` sets only public disposable audit configuration and uses a temporary working directory without `.env` files. It mirrors the two public fixtures existing tests resolve from cwd, and restores its caller location on exit. It uses Node22 on PATH when available, with this machine's verified portable Node22 as a fallback. Select Node22 on PATH if that fallback does not exist. Never copy normal `.env` values into audit files. The audit-only account passwords in these helpers are intentionally public and unsuitable for normal deployments.

```powershell
# Build backend first from its nested folder: pnpm build
# Then from STRESSFORGE:
./docs/audit/m9-run.ps1 migrate
./docs/audit/m9-run.ps1 seed
./docs/audit/m9-run.ps1 seed       # idempotence
./docs/audit/m9-run.ps1 fresh      # one new sf_m9_fresh DB; refuses overwrite
./docs/audit/m9-run.ps1 api-instrumented  # own terminal; reserved port5003
./docs/audit/m9-run.ps1 web-build
./docs/audit/m9-run.ps1 web-start  # separate terminal; reserved port3003
./docs/audit/m9-run.ps1 unit
./docs/audit/m9-run.ps1 e2e
```

Run the integration suite **alone**: do not overlap source-worker profiles, builds or service-interruption harnesses. Source workers have the same strict deadlines as compiled workers, so cold TypeScript startup under competing work can produce honest timeout failures. Never increase a deadline or change an existing test merely to turn a red check green.

From `web`, with the audit servers healthy:

```powershell
$env:SF_WEB_URL='http://localhost:3003'
$env:SF_API_URL='http://localhost:5003/v1'
$env:SF_BROWSER_CHANNEL='chrome'
pnpm exec playwright test --grep-invert '@dev' --output=test-results-m9
node tests/verify-m9-foundation.cjs
```

Run the following **sequentially**, with no other browser/integration checks using these services:

```powershell
$env:SF_M9_REAL_OUTAGES='1'
node tests/verify-m9-recovery.cjs
node tests/verify-m9-lock.cjs
node tests/verify-m9-inflight.cjs
node tests/verify-m9-services.cjs
# Requires the instrumented API bootstrap for numeric resource observations:
$env:SF_M9_SOAK='1'
node tests/verify-m9-soak.cjs
# From STRESSFORGE, after the soak:
./docs/audit/m9-run.ps1 retention
```

These opt-in helpers check audit identity before interruptions, restart their containers in `finally`, create disposable users/designs, and preserve normal data. The services helper stops only the identified `m9-api.cjs` process on5003 and starts that same bootstrap with explicit audit configuration. The telemetry bootstrap uses the actual compiled AppModule, shared HTTP setup and Swagger; it adds no production diagnostics endpoint. Its numeric log is ignored by Git. Regular `dist/main.js` was also exercised independently.

For profiling from the backend, set distinct filenames **before** invoking either command:

```powershell
$env:SF_PROFILE_OUTPUT='m9-profile-source.json'
pnpm simulation:profile
$env:SF_PROFILE_OUTPUT='m9-profile-compiled.json'
pnpm simulation:profile:compiled
Remove-Item Env:SF_PROFILE_OUTPUT
```

Use the established backend build/typecheck/lint/contract/fixture gates and frontend build/typecheck/lint/unit/routes/live-schema checks as well. Edge is a scoped additional Chromium-channel check, not a second rendering-engine certification. Developer-state checks use m9-run.ps1 web-dev on3004 with a separate .next-audit-dev directory (SF_WEB_URL=http://localhost:3004, SF_DEV_STATES=1); do not run them against production. Keep traces, videos and exported auth storage disabled.

## Evidence and boundaries

- [Recovery](audit/m9-recovery-fixed.json), [blocked-write cancellation](audit/m9-lock-fixed.json), [browser outages/restart](audit/m9-services.json), [Foundation walkthrough](audit/m9-foundation.json), [bounded soak](audit/m9-soak.json), [retention](audit/m9-retention.json).
- Original M8 post-Redis409 was not reproduced by the bounded timing campaign. A separate baseline database-lock experiment demonstrated a late commit and subsequent legitimate409; that is **not proof** of the original incident's root cause. Actual lost-save acknowledgement is handled by retaining the draft and offering explicit conflict inspection/reload, not silent merging.
- The ten-minute soak is a limited local observation, not long-duration load, memory-leak or storage-growth assurance. TTL cleanup is lazy on admission. Local memory-only drafts cannot survive closing/reloading a tab during a failed save. One API instance is supported.
- Mathematical estimates are not measured infrastructure performance. Model equations, parity exceptions and complexity caps remain documented in [SIMULATION-MODEL.md](SIMULATION-MODEL.md).
- Real AI, Improve/History/Compare/Report/export, public sharing/learning/settings and hosting remain later scope. Scripted mock creation does not satisfy the course's central-AI requirement.

Before any later phase-completion claim, update the same progress report, preserve earlier history, attach fresh evidence and reassess affected earlier requirements. Nothing updates or publishes automatically.
