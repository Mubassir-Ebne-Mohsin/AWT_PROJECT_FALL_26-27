# Roadmap B — Admin dashboard extras (2026-11-06)

Verified locally: API/contracts `4993b9b`, dashboard `9d21ba3`, generated live types `fa480fc`. No push. [User guide](../../ADMIN-DASHBOARD-EXTRAS.md).

## Implementation

The Admin dashboard has 168 Monday-first UTC cells for designs and runs created in the rolling interval `[snapshot time - 28 days, snapshot time)`, matching 28-day totals and an accessible numeric table. Counts are read inside the existing read-only transaction/cache. The 28-day window is explicitly distinguished from all-time and 24-hour cards.

An aggregate SHA256 key pins CSV/JSON exports to an immutable retained snapshot (five minutes, maximum 128). Expiry/eviction/restart fails clearly rather than substituting newer numbers. The one-page PDF uses that same source and the existing drawing pipeline. CSV contains keys/numbers only. Strict schemas and per-request Admin permission protect all formats; role revocation takes effect immediately. Redis records accepted requests by UTC day and closed format only, with a 90-day TTL. No account or content is logged; audit-storage failure returns no file.

## Observed verification

| Check | Result | Evidence |
| --- | --- | --- |
| Backend build/typecheck | pass, including final source | backend-build-final.txt; backend-typecheck-final.txt |
| Backend lint | 0 errors / 26 existing warnings | backend-lint.txt |
| Full backend unit | 785/785, 62 suites | backend-unit.txt |
| Final positive controls | 15/15 after mutations | backend-positive-control.txt |
| Full backend e2e | 399/399, 30 suites | backend-e2e.txt |
| Focused PostgreSQL e2e | 14/14 | backend-focused-e2e.txt |
| Contracts | phase 3 matches schemas; frozen phase 2/examples unchanged | contracts-final.txt |
| Live types | generated from isolated running /docs-json | live-types.txt |
| Final web build/types/lint/routes | pass; 0 lint errors / 2 existing warnings; 46 registry pages | web-build-final.txt; web-typecheck-final.txt; web-lint-final.txt; web-routes-final.txt |
| Final web unit | 536/536 | web-unit-final.txt |
| Affected Chrome | 124/124 at 1024/1440 light/dark | chrome-regression.txt |
| Final rebuilt B Chrome | 12/12 after styling repair | chrome-final.txt |
| Empty-window first Chrome run | 12/12 before populated assertions | chrome-empty-first.txt |
| Deliberate breaks | 9 applied faults caught; source files unchanged | mutations.json; mutation-*.txt |
| Actual services | older retained snapshot stays exact after newer poll; cache reuse; safe counters/TTL; denied requests not counted; Redis outage 503 in 3 ms/no file; recovery; health/docs 200 | services.json; verify-services.cjs |
| Visual/accessibility | inspected light/dark 320/390/1024/1440; numeric cells/table, keyboard focus/scroll, no page overflow | local PNGs and browser spec |

The populated Chrome case creates a real design and simulation, checks positive counts/sums, parses all three downloads and excludes private canaries/IDs. Existing Report PDF byte identity, Print, draft protection, notes, cancellation, polling, wall-display and reduced-motion checks also pass. The broad run predates only a small B header/table style correction; final build/full web unit/static checks and 12 B journeys cover it. Full all-project Chrome, Edge, dev-only state journeys and live AI quality were not rerun. Browser expiry/audit-error screens use controlled HTTP failures; real retention pinning and Redis outage are separately exercised. Time expiry and capacity bounds are unit-tested.

## Initial failures and fixes

1. A new fixture import used an unsupported alias; moving it under the existing modules alias fixed initial typecheck.
2. First focused e2e: 13 passed, one cleanup guard refused a database name without test/e2e. The runner now uses a separate labelled test database; the guard was preserved.
3. First full e2e: three assertions failed (repeated historical fixtures and two CORS expectations from an audit origin of 3003 instead of test origin 3000), plus a known migration teardown timeout. New boundary fixtures now remove only their own IDs under the isolated-database guard; the runner uses the established test origin. Existing tests were not weakened. The privacy test independently recomputes the new digest before applying its original leaf allow-list to everything else.
4. Next full e2e: all 399 cases passed, but the existing Copilot migration's temporary-database teardown exceeded its two-second timeout. Temporarily using fsync-off only on our disposable test container made the isolated migration pass 6/6 and full e2e pass 30/30. Normal fsync-on was restored before actual services/browser checks and verified at cleanup. No application timeout/assertion or owner container was changed. Initial logs remain available; this is a laptop test-storage workaround, not a production setting.
5. The mutation classifier initially missed Supertest's `expected 403 ... got 200` format. Inspection confirmed unauthorized success; the classifier now recognizes the actual assertion. Test expectations were unchanged.
6. Screenshot review caught `panel-head` instead of the existing `panel-h` class. Reused the correct style, kept long-table headings visible, rebuilt and reran 12 B cases. Phone screenshots capture the real viewport rather than a tall component clip intersecting the sticky app header.

## Reproduction

Node 22, pnpm, Docker Desktop; one heavy job at a time. Only labelled M9 containers (Postgres 5552/Redis 6399) and `sf_dashboard_extras_*` databases are used. `runtime.json` identifies the browser DB; `run.ps1` derives a separate `_final_e2e` database and uses an empty temporary working directory, public throwaway credentials and AI off. The earlier full e2e process captured its identity before `_browser` was appended to the browser identity. No owner environment values are read, printed or copied.

- `run.ps1 unit` / `run.ps1 e2e` use the existing Jest configuration. The known migration teardown may need temporary `ALTER SYSTEM SET fsync=off` / `SELECT pg_reload_conf()` on **this disposable container only**; restore with `ALTER SYSTEM RESET fsync` and reload afterward. The record verifies fsync on before service/browser checks and shutdown.
- `run.ps1 migrate`, then `run.ps1 api` start the isolated API on 5003. `build-web.ps1` builds .next-audit for that API with one worker/1536 MiB heap and restores config bytes in finally. Start the audit build on 3003 with STRESSFORGE_AUDIT_BUILD=1.
- Browser environment: SF_WEB_URL=http://localhost:3003, SF_API_URL=http://localhost:5003/v1, SF_BROWSER_CHANNEL=chrome, SF_PG_CONTAINER=stressforge-m9-postgres, SF_PG_USER=sf_audit, SF_PG_DB=<runtime.json database>.
- Broad command from web: `pnpm exec playwright test tests/browser/admin-extras.spec.ts tests/browser/admin-dashboard.spec.ts tests/browser/direct-pdf.spec.ts tests/browser/report-pdf.spec.ts --workers=1`. Final command: `pnpm exec playwright test tests/browser/admin-extras.spec.ts --workers=1`.
- `verify-services.cjs` checks actual HTTP/Postgres/Redis and stops/restarts only the labelled Redis container. `verify-mutations.ps1` injects nine faults in memory and requires meaningful failures; no application source is written.

## Preservation and limitations

142 entry hashes/139 original PNGs verified. Only the test-overwritten runtime schema was restored to exact task-entry bytes, not Git HEAD. M2 was never written/staged/reverted. See preservation.json and preservation-entry.json. All PNGs, protected profile/runtime artifact and film remain outside commits; new screenshots stay local.

Only recorded audit listeners and M9 containers were stopped; volumes/databases retained and owner dev services left healthy. Normal test-container durability restored. No new migration/package, owner DB change, paid usage, live provider request or push. Retention is deliberately bounded single-process memory; multiple API processes would need shared retention. Counters measure accepted requests, not completed local file saves. AI acceptance and subsequent roadmap scopes remain separate approvals.
