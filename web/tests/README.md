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
