# Support aggregate metrics verification — 2026-11-05

Baseline `6d93542`, branch `codex/phase2-contracts`. Owner approved proceeding from the 5 November handoff and later explicitly approved updating the stale shell test. Implemented Support P1 item 11 and the navigation/accessibility/check repairs found during verification. AI acceptance and other Support extras remain separate. Work is uncommitted; nothing pushed.

## Metric definitions and privacy

The existing Admin-only metrics response adds all-time total/unresolved Support counts, closed category/status breakdowns, and median elapsed milliseconds from creation to the first public Support reply. Unresolved means Open + In progress + Waiting. Unanswered and invalid negative durations do not enter the median; zero is valid; no valid samples is null. The valid reply denominator is visible. Internal notes and author messages do not start the clock. Every category/status key is included even at zero. Support is included in the role breakdown.

No title, body, expectation, technical context, private note, ticket id or reporter identity is selected for this response. Strict contracts and the leak tests were extended together. Admin gains no inbox/design access; Support gains no Admin metrics access. The read-only repeatable-read snapshot, 3-second cache, polling and error handling remain in place. No route, migration or dependency added.

## Final evidence

| Check | Observed result |
| --- | --- |
| Backend build/types/lint | Pass; 0 lint errors, 26 existing warnings |
| Backend unit | 780/780, 61 suites; opt-in Redis tests included |
| Backend e2e | 396/396, 30 suites, real local PostgreSQL and Redis |
| Frozen Phase 2 / canonical Phase 3 contracts | Both checks match; Phase 3 updated additively |
| Web production build | Pass on final source; temporary one-CPU setting restored byte-for-byte |
| Web unit | 512/512 on final source |
| Web lint/types/registry | Pass on final source; 0 lint errors, 2 existing warnings; 46 routes have page files |
| Initial focused Chrome | 115 passed, 1 failed (delayed-auth report-dialog focus); retained in `browser-focused.txt` |
| Targeted focus/motion/metrics rerun | 20/20 pass before later route-sweep repairs |
| Complete Chrome production run | 1,150 passed, 10 skipped, 4 failed in 46.6 minutes; all failures were the stale 40-route assertion. Raw evidence `browser-full-original.txt` |
| Corrected shell attempt | 4 API-error checks passed, 4 shell checks failed at the wall's missing breadcrumb, 4 dev-only skipped. A subsequent affected run exposed a missing h1 on the standalone Support denial; evidence retained |
| Final single shell smoke | 1/1 pass, 1440-light, all 46 routes plus real report persistence/auth/themes/session restoration/logout |
| Final affected browser checks | 40/40 pass, 5.5 minutes: 1024/1440 light/dark, final production build, shell/API errors, wall/motion, metrics, Support thread/access/privacy/keyboard |
| Deliberate breaks | 10 actual assertion failures; all exact source bytes restored |
| Fresh DB migrations | All 18 applied only to newly created `sf_support_metrics_20261105_3c720547` |
| Preservation | All 119 task-entry PNG hashes match; 73 overwritten files restored; protected M2 unchanged and never written; original dirty runtime contract bytes restored |

No second complete 1,164-case run was performed after the small breadcrumb/heading repairs. All affected cases were rerun on the final build. Do not call the original full run green or inflate the final 40 with the earlier duplicate checks. The 10 original skips are four dev-only journeys and six duplicate heavy-fixture variants (13-design pagination and the 100-note limit, each actually passed at 1440-light).

## Findings and repairs

1. **Moderate, repaired — focus race:** opening Report a problem during session loading first shows sign-in; session recovery reused the Modal without initial form focus. Distinct view keys repair title focus and original-opener restoration. Deterministic delayed-auth test fails without the keys; the existing keyboard assertion was preserved.
2. **Moderate, repaired — stale test coverage:** committed `phase1.spec.ts` still pinned 40 routes although the registry already held 46, and expected non-persistent placeholder feedback. Owner approved correction. It now pins all 46 and the six added route ids, uses a real owned report for the detail route, checks empty fields, real 201 submission/reference, author API read-back and reload persistence. Existing auth, breadcrumb, overflow, console, theme, palette and tab checks remain.
3. **Low, repaired — missing wall breadcrumbs:** the expanded sweep found the custom wall header omitted shared `Crumbs`. Added the shared component, preserving the assertion and wall behavior.
4. **Low, repaired — missing standalone denial heading:** `/support/:id` denied access correctly but had no h1. Optional heading level on RoleGate defaults to the existing h2; only this standalone caller requests h1. Protected content remains behind the gate. Three tests cover denied/unavailable/default/authorized heading behavior and private-content exclusion.
5. **Check blockers, repaired — React lint:** existing synchronous reduced-motion state setup and four render-time clock reads. Subscribed media preference and cleanup-safe `useNow` remove all five errors. Tests cover clock ticks, cleanup and changed intervals; Chrome checks reduced motion.
6. **Documentation, reconciled:** current instructions/state/deferral banner reflect five roles and exactly three demo AI tasks, with development figures distinguished from acceptance. Historical gates unchanged. The acceptance plan's transport-retry permission contradicts its “No retry” sentence; owner must confirm this before registration.
7. **Open diagnostic:** full backend e2e emits MaxListenersExceeded warnings for server listeners. Cause not established, not suppressed; tests pass. Existing lint warnings remain.

Initial command failures (a missing new test import and an incorrect relative Jest path) were corrected before the passing gates. Initial failure logs/contexts remain available; progress through a route is not counted as a passing shell test.

## Reproduction

Node 22, pnpm, Docker Desktop. Audit PostgreSQL/Redis use ports 5552/6399. `runtime.json` identifies the disposable browser database. The runner uses public disposable credentials and an environment-file-free working directory, with AI disabled. Create the named database on the audit instance first; do not point the tests at owner/production data.

```powershell
# From STRESSFORGE, after starting the existing M9 audit containers:
.\docs\audit\support-metrics-2026-11-05\run.ps1 migrate
.\docs\audit\support-metrics-2026-11-05\run.ps1 api
# Separate terminal, after building with STRESSFORGE_AUDIT_BUILD=1
# and NEXT_PUBLIC_API_URL=http://localhost:5003/v1:
.\docs\audit\m9-run.ps1 web-start
# From web, set SF_WEB_URL=http://localhost:3003,
# SF_API_URL=http://localhost:5003/v1, SF_BROWSER_CHANNEL=chrome,
# SF_PG_CONTAINER=stressforge-m9-postgres, SF_PG_USER=sf_audit,
# SF_PG_DB=<database in runtime.json>.
pnpm exec playwright test --workers=1
```

Backend unit/e2e use `docs/audit/m9-run.ps1 unit` and `e2e` with their separate disposable e2e DB. Package build/lint/typecheck/contract scripts were used. Browser tests intentionally create disposable accounts, roles, reports and designs. Final affected command:

```powershell
pnpm exec playwright test tests/browser/phase1.spec.ts tests/browser/admin-dashboard.spec.ts tests/browser/support.spec.ts --grep 'registry routes|API error screens|wall display|Support metrics|a report travels|only Support reaches|dialog works from the keyboard|hostile text' --workers=1
```

## Visual review, preservation and cleanup

Four final panel screenshots are retained here. Light/dark images at 1024 and 1440 were inspected: labels, values, empty response state, real response samples, denominator and zero-filled tables are readable. New browser assertions also check no overflow at 320/390/1024. This does not claim human review of every page or every device.

See `preservation.json`. Protected M2 SHA256 remains `d0edb982c694cf1983ffe36faac2f7c80ed77ac1a735852f03013e6c4a2f76dc`; it was never written/staged/reverted. Original runtime contract SHA256 restored to `2317a43213882d02e8988414cff45b632c3eb478116fdd42ba5b060a2d74df6b`; it remains pre-existing dirty work, not a task change. Six existing PNGs still differ from Git HEAD, but all match the saved originals byte-for-byte; leave those PNGs unstaged. Preservation is against the saved task-entry copies, not a reset to HEAD. Original untracked handoff and `film/` untouched. Owned API/web listeners and M9 containers stopped; volumes/database retained. Owner dev PostgreSQL/Redis left running and healthy. Temporary raw logs/backups retained.

## Limits and next actions

No environment-file values read/printed/copied, live AI/provider call, owner migration, push or new dependency. AI defaults remain off. Browser AI-interface checks use mocked replies. Independent writer sheet, confirmed bars/mix/retry rule, registration and explicit live go still block acceptance. Owner must run NoteComponent/Support migrations on their own database and rehearse personally. Consent sharing, notifications, saved replies/merge and other P1/P2 extras need separate approved scopes. Primary OpenAPI types were stale and regenerated from the isolated live Swagger endpoint, explaining their large generated-only diff. This verifies the approved panel and relevant repairs; it does not certify AI reliability or course acceptance.
