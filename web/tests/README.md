# Frontend regressions

`pnpm test` uses Node's test runner, the installed TypeScript compiler for test-only TS/TSX transpilation, and jsdom for rendered React tests. `pnpm typecheck` separately checks production sources and browser tests. No test service is required for focused tests.

## Browser integration

Start the isolated audit API on localhost:5001 (audit Postgres 5545 / Redis 6391) and web on localhost:3000. The suite never starts/stops services or deletes database rows. It creates disposable `web-*` / `errors-* @example.test` users via actual registration and logs them out. Run only against the audit database. Each test has a separate browser cookie jar; access tokens, storage state, traces and videos are never saved.

```powershell
pnpm exec playwright install chromium # once, or use an installed channel below
$env:SF_DEV_STATES = '1' # against pnpm dev: enables all ten demo-state checks
# Optional: $env:SF_BROWSER_CHANNEL = 'chrome' (or 'msedge')
pnpm test:browser
```

Four projects cover 1024/1440 pixels by light/dark. Each project visits all 35 registry patterns (including aliases), checks titles, headings, theme and horizontal overflow, validates auth forms and return-to links, exercises the command palette, both drawer close paths, scripted AI, Light/Dark/System persistence and OS changes, real concurrent tab restores and logout. A separate scenario injects API 404/403/500, initial refresh 429 and terminal 401 responses and checks state focus and recovery. Development tests render all ten demo states and leave each one. Against a production server, omit SF_DEV_STATES; those four explicitly development-only tests skip because production excludes the switcher.

`pnpm test:browser:list` lists projects/tests without launching a browser. Optional endpoints: SF_WEB_URL and SF_API_URL (defaults http://localhost:3000 and http://localhost:5001/v1). Keep one worker to respect the shared API limiter; the matrix uses palette navigation for most routes to avoid needless refreshes. Existing audit traffic can still exhaust limits: wait for the limit window or use the audit server's documented test configuration, then rerun. Failure screenshots are ignored by Git. Never enable auth traces/storage-state artifacts.

Web Locks serialize same-origin tab refreshes against the latest httpOnly cookie. Browsers lacking Web Locks retain only per-tab single flight; no insecure persistent token or ad-hoc storage lock fallback is used. The isolated-module unit test deterministically simulates rotating-cookie contention; the browser test additionally exercises real shared cookies and the live backend.

Installed Next 16.4.2 docs (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`) recommend `retry()` for refetch/recovery and expose `reset()` for rerender without refetch. Both segment/global recovery buttons have rendered click tests. Browser state tests do not inject a root-layout exception into the running app; framework-driven global-boundary fault injection remains separate integration coverage.

## M3 deep audit isolation

Use a disposable API/database/Redis instance. Set NEXT_PUBLIC_API_URL=http://localhost:5003/v1 and STRESSFORGE_AUDIT_BUILD=1 before pnpm build and pnpm start --port 3003; this uses ignored .next-audit output instead of replacing a running development build. Set SF_WEB_URL=http://localhost:3003 and SF_API_URL=http://localhost:5003/v1 for Playwright. m3-deep.spec.ts covers selected stored results, clean remote edits, default-property autosave stability, lost acceptance plus429, and dirty-draft session reauthentication. Existing request limits remain in force; the dedicated Redis instance keeps test counters separate from normal use.

## M4 creation/dashboard acceptance

M4 reuses the existing infrastructure. creation-session.test.cjs tests concurrent submission, lost/5xx acceptance, definitive errors, disposed accounts, preview invalidation, names and status labels. browser/m4.spec.ts covers template previews/custom naming, blank creation, text/file import, scripted assumptions across reload, dashboard/delete, invalid inputs and lost-response duplicate prevention. browser/m4-recovery.spec.ts covers empty blank graphs, inline429 retry, network recovery with retained descriptions, changed-preview invalidation and escaped labels.

Use SF_WEB_URL=http://localhost:3003, SF_API_URL=http://localhost:5003/v1, SF_BROWSER_CHANNEL=chrome and the ignored .next-audit production build for the four-project matrix. Full production browser runs intentionally skip the four @dev state cases; run those separately against an isolated dev server with SF_DEV_STATES=1.

Two non-default, explicit opt-in harnesses are documented in docs/M4-CREATION-DASHBOARD.md. verify-m4-services.cjs stops/starts only labelled M4 Docker containers on5547/6394 and always restarts them; the API must use their dedicated sf_m4_outage database. verify-m4-api-outage.cjs uses two operator Enter signals to coordinate an actual audit-API stop/restart. Neither runs in pnpm test. Never target normal services, export auth traces or commit .env.

## M5 canvas acceptance

canvas.test.cjs covers pure coordinate/zoom/fit/snapping, catalog defaults and IDs, bounds/numbers, gesture/save guards and semantic result equivalence. Its catalog fixture is checked against the actual backend catalog by engine/canvas-contract.spec.ts. Browser m5.spec.ts and m5-boundary.spec.ts exercise real persistence, zoomed palette/node drag, keyboard movement, cancellation (including Escape/focus loss), all twelve property forms, failed saves, held remote reads, maximum graphs and the exact899/900px boundary. Run against isolated services using the M3 variables above, for example pnpm exec playwright test m5.spec.ts m5-boundary.spec.ts.

The optional SF_M5_REAL_OUTAGES=1 node tests/verify-m5-services.cjs stops/starts only containers labelled stressforge.audit=m5 on5548/6395, with the audit API using sf_m5_audit and web3003. It validates service identity and restarts them in finally; never point it at normal data. See docs/M5-CANVAS.md. The short maximum-graph frame sample is a usability smoke check, not a performance benchmark. No auth traces or storage state are retained.

## M6 connection/history acceptance

m6.test.cjs adds immutable connection-rule/reversal/deletion/duplication tests,60-step grouped history, slow-save undo, revision-bound/late validation, failure guards and disposal/isolation. browser/m6.spec.ts covers blank-to-run, cycle repair and warnings, component/edge editing, zoomed pointer connections, click/repair actions,429 retry, delayed acknowledgement and conflict reapply. All run against actual isolated browser/API services; previous suites remain regression gates.

Optional SF_M6_REAL_OUTAGES=1 node tests/verify-m6-services.cjs requires dedicated M6-labelled containers PostgreSQL5549/Redis6396 and sf_m6_audit; it tests retained connections/history and Undo after real outages, with identity checks and finally restart. It is never part of normal pnpm test. See docs/M6-CONNECTIONS-HISTORY.md. Keep traces/storage state off and normal user data separate.

## M7 Traffic/Results acceptance

m7.test.cjs covers traffic input bounds/history, all-Clients region changes, save/run/undo races, conflict and uncertain-acceptance retention, disposal, snapshot semantics, tiny errors/unbounded values, verdict reasons, chart geometry and pending/failed/completed result markup. browser/m7.spec.ts exercises all presets, settings/reload, invalid/zero/maximum load, actual overload/replica changes, target snapshot staleness, component inspection/Edit links, save failures/races/conflicts and session/logout boundaries. Run pnpm exec playwright test m7.spec.ts with the same isolated SF_API_URL/SF_WEB_URL/browser setup described above; all four width/theme projects remain required. Navigation assertions wait for the accepted Results URL before later actions or reload.

Optional SF_M7_REAL_OUTAGES=1 node tests/verify-m7-services.cjs requires an interactive terminal, labelled stressforge.audit=m7 containers PostgreSQL5550/Redis6397, sf_m7_audit and API5003/web3003. It independently interrupts PostgreSQL and Redis with identity/port guards and finally restores them. READY_TO_STOP_M7_AUDIT_API asks the operator to stop ONLY the identified audit API and press Enter; M7_API_UNREACHABLE_OBSERVED asks for that same API restart/health200 before the next Enter. It checks retained traffic/history, Undo and a new run. Never target normal services or the database used by a real user. Keep traces/storage state off. See docs/M7-TRAFFIC-RESULTS.md and the dated living report for exact observations and limitations.

## M8 Limits/live preview acceptance

m8.test.cjs covers Limits headlines/brackets/headroom for every search state, saturation order, ramp geometry, kind-aware links/intents, Find limits flush and lost-response retry, and the PreviewSession lifecycle (debounce, layout-only moves, ordering/abort, foreign session replies, pauses, inline failures without retry loops, Undo to computed inputs) plus overlay/topology markup. browser/m8.spec.ts runs real saved Limits, lost Limits responses, Load overlay/debounce/overload, stale replies, Results topology after deletion, logout, the Traffic live panel, two tabs, a 50-node/200-edge preview, durable-pending pause/retry, session-modal reauthentication and editing with Load on. Run pnpm exec playwright test m8.spec.ts with the same isolated SF_API_URL/SF_WEB_URL/browser setup; all four width/theme projects remain required.

Optional SF_M8_REAL_OUTAGES=1 SF_M8_API_RESTART="<command that starts the 5003 audit API>" node tests/verify-m8-services.cjs is non-interactive. It requires labelled stressforge.audit=m8 containers PostgreSQL5551/Redis6398 and the compiled audit API on 5003 (its command line is checked before it is killed). It interrupts PostgreSQL and Redis with live preview on, then stops the API immediately after a Limits search is accepted and restarts it, checking startup reconciliation to INTERRUPTED, no automatic resubmission and a new search afterwards. Containers are restarted in finally. Never target normal services. See docs/M8-LIVE-PREVIEW-LIMITS.md.


## M9 integrated acceptance

browser/m9.spec.ts adds palette names/scroll discovery, full improvement→preview→Limits→recorded Results selection and genuine lost-save-acknowledgement conflict recovery. All earlier browser tests remain unchanged. New M9 setup screenshots wait for authenticated dashboard data and loaded template controls; Traffic captures reset scroll position. Run the complete production matrix at1024/1440 and light/dark; use a separate next-dev run for @dev. New opt-in verify-m9-{foundation,recovery,lock,inflight,services,soak}.cjs scripts use only the identity-checked M9 audit stack (Postgres5552/Redis6399/API5003/web3003); lock/outage/soak scripts require explicit flags. They must run sequentially, without another suite sharing these services. The soak additionally requires docs/audit/m9-api.cjs numeric telemetry. Retention is invoked through docs/audit/m9-run.ps1 retention. See [M9 guide](../../docs/M9-ACCEPTANCE.md) for all commands, safety identities, limitations and the persistent report link. Never enable auth traces or export storage state.
