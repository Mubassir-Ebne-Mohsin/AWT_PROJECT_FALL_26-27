# Roadmap E verification — 7 November 2026

## Observed final results

Backend 785/785 unit and 422/422 e2e (32 suites, four sequential processes); web 557/557 unit; Chrome 88/88 affected across four light/dark laptop projects; four applied functional faults caught. Builds, lint/types, both contracts and 46 routes pass.

- `backend-unit.txt`: full backend unit run; `backend-e2e.json` and `.txt`: final real-PostgreSQL e2e aggregate, 32 suites. Four shard JSON/logs retain every assertion; combine-e2e.cjs checks all discovered files, no duplicate suite and no skipped tests. The initial backend-e2e-oom.txt retains the failed single-process run. New SupportExtras suite has 11 scenarios, including ownership/role revocation, safe expansion/deleted author, strict inputs/stale writes, concurrent quotas and opposite merges, source/target/internal-note privacy, first-response semantics, notification rollback, export/cascade and migration refusal/round trip.
- `web-unit.txt`: full SERIAL Node unit run, eight new tests in `tests/support-extras.test.cjs`; draft/no-send, overflow/stale/local error, current-draft async insertion and unmount/duplicate-action checks.
- `chrome-affected.txt`: **88 passed**, all four Chrome projects (1024/1440 x light/dark), E + existing Support/notification specs. New E journeys: 16; remaining 72 existing. `chrome-smoke.txt`: final 4/4 smoke after label fix. Browser spec narrows the disposable identity to `sf_notifications_support_e_*`; compatible prefix allows existing notification tests without editing their safety guards.
- `web-build-final.txt`, build/types/lint/route/contract logs: success; warnings inherited, no errors. `live-types.txt`: actual audit API docs-json generated primary schema, committed separately.
- `browser-migrations.txt`: fresh disposable DB up through E. `pg-durability-restored.txt`: fsync on after full e2e.
- Local unstaged screenshots cover 320, 390, 1024, 1440; dark 320 and light 1440 visually reviewed, labels/control text fit. Assertions cover no overflow, keyboard entry, reduced motion, console/page errors, private messages and alias removal.

## Deliberate faults

`mutate.cjs` intercepts in-memory reads; no application source edits. `mutations.json` requires applied markers and functional assertion failures, not just a nonzero exit. Personal-list leakage, cross-reporter alias leakage, disabled merge topology guards and insertion that sends automatically all fail tests. Cycle fault also removes the DB trigger, so its later down test reports missing trigger; the meaningful self-merge HTTP 200-vs-409 failure is separately present. Full unchanged positive suites follow all faults.

## Reproduction / isolation

Use Node 22, pnpm and Docker. These audit scripts use public fake credentials only and never read `.env`. They are recorded machine-specific harnesses, not the ordinary app launcher. `runtime.json` names the disposable DB on owned `stressforge-m9-postgres` (5552), Redis (6399), API 5003/web 3003; owner 5001/3000 and dev containers untouched.

1. Start the owned audit containers if intentionally rerunning. `run.ps1 migrate` creates/migrates only the guarded new audit DB; `start-browser.ps1` starts labelled servers and smoke. `browser.ps1 affected` runs the 88 journeys serially.
2. `full-gates.ps1` needs that running audit API for live types, then stops only recorded audit listeners. It runs faults and full backend/web checks, using a new labelled e2e DB per invocation. database-gates.ps1 runs four sequential shards with a fresh process each; finish-gates.ps1 resumes only that stage and the web gates after the recorded first-run memory failure. Node workers capped at 768 MB; web unit concurrency one.
3. Legacy full-suite DROP DATABASE teardown has a fixed two-second timeout. Only on this disposable container, the harness temporarily disables fsync and restores it in finally; production/owner settings untouched. New migration test instead uses its own random temporary schema; no old assertion changed.
4. `preserve.cjs` verifies exact task-entry copies via the task-specific TEMP pointer, restoring overwritten old audit PNGs/runtime only; it refuses unexpected M2/config changes. Preserve your own entry copies before a future rerun.

## Initial failures and limits

Initial new-test setup rejected an overlong display name; fixed fixture only. API tests exposed TypeORM UPDATE tuple handling and PostgreSQL mixed parameter casts; fixed with a CTE returning rows and consistent varchar casts. Browser tests exposed filled-textarea label lookup and late insertion overwriting newly typed draft; fixed explicit label/id pairs and a current-draft ref. New tests use an explicitly listening HTTP server, a disposable schema for migration round trips and zero mutation-cache GC in JSDOM. A grouped run passed all assertions but the old Copilot migration suite hit its two-second DROP DATABASE cleanup deadline. That failed JSON/log is retained; a disposable checkpoint and unchanged retry resolved it. The first single-process full e2e run hit the 768 MB heap limit; all discovered suites were then run in four sequential processes with unique-file/no-skips aggregation. Existing listener warnings also appeared in the prior C run. No existing test changed, skipped or weakened.

Earlier logs retained, including initial label failure and fixture/SQL/HTTP setup failures. Screenshot tests can overwrite earlier audit PNGs; restored from this task's entry copies, never HEAD. `Full all-project Chrome, Edge and dev-only journeys were not rerun. Browser failures use controlled 503/cancellation, not a real API/container outage. No owner migration, live AI request, new dependency or frontend route. AI acceptance remains separate and unclosed.` Owner setup: `pnpm migration:run` then restart API. No push authorized. No old test edited.

## Recorded-artifact handling

Only new E console logs have trailing whitespace/extra final blank lines normalized for Git; substantive output is retained. Historical artifacts use exact entry-byte restoration. Cleanup status records only owned audit containers stopped, volumes retained; owner dev Postgres/Redis remain healthy. Code commits: 56a5651 (backend/contracts), 23b63a2 (UI/tests), 49ee461 (live types only).
