# Showcase readiness verification — 2026-11-03

Baseline: `68dd94c` on `codex/phase2-contracts`. User approved the demo-readiness plan, including the existing optional AI preflight. No application behavior, provider code, quality-gate rubric, migration, feature default or key value was changed.

| Check | Observed result | Evidence |
| --- | --- | --- |
| Previously excluded developer-state journeys | 4/4 pass, 25.8 s; each exercises all 10 states and recovery, 1024/1440 light/dark | dev-states.txt |
| User/Admin/Reviewer/Instructor browser flows | 17/17 pass, 40.1 s; no skips; 1440-light | roles.txt |
| Same-account showcase rehearsal | 9 steps pass; original documented model figures reproduced; no page errors | journey.json, journey-final.txt, rehearse.cjs |
| Development migration history, read-only | All 16 source migrations applied; none missing | migration-status.json |
| Existing live AI preflight | One invocation, 3/3 requests as expected, READY; no retry | ai-preflight.txt |
| Preservation | 117 pre-existing PNGs restored and hash-verified; protected M2 hash unchanged | preservation.json |

## Method and commands

The browser checks used Node 22.23.4, installed Chrome, one worker and the M9 disposable PostgreSQL/Redis services (5552/6399). API/web audit ports were 5003/3003. AI was explicitly disabled on that API. The developer build used `STRESSFORGE_AUDIT_BUILD=dev` with `pnpm dev --port 3003`; it was stopped before using the previously verified `.next-audit` production build.

From `web`, with SF_WEB_URL=http://localhost:3003, SF_API_URL=http://localhost:5003/v1, SF_BROWSER_CHANNEL=chrome:
- Development run: SF_DEV_STATES=1; `node node_modules/@playwright/test/cli.js test tests/browser/phase1.spec.ts --grep '@dev' --workers=1`.
- Role run: SF_PG_CONTAINER=stressforge-m9-postgres, SF_PG_USER=sf_audit, SF_PG_DB=sf_m9_audit; `node node_modules/@playwright/test/cli.js test tests/browser/r1-roles.spec.ts tests/browser/r2-admin.spec.ts tests/browser/r3-reviews.spec.ts tests/browser/r4-comments.spec.ts tests/browser/r5-challenges.spec.ts tests/browser/r52-learners.spec.ts tests/browser/r53-feedback.spec.ts --project=1440-light --workers=1`.
- Same-account rehearsal, from the root: `node docs/audit/showcase-2026-11-03/rehearse.cjs`. Requires those isolated ports/services; it creates only disposable accounts/designs. It uses real UI actions for registration, template creation, traffic/save/run, fix application, comparison, ladder, sharing and logout; local authenticated GETs independently verify saved revisions/results. No AI calls, mocking or user-data reset.

The separate `pnpm demo:ai:check` was run once from the backend, after stopping the audit web/API. Its existing code loads the server-side key internally; the agent never read or printed environment values. It made exactly three calls to the existing `openai/gpt-oss-120b` task, with the existing guard. Settings were process-local, explanations off; no demo API was left enabled. READY is not a quality pass. No new benchmark case, rubric, pass mark or evaluation attempt was introduced.

Read-only development query: `docker exec stressforge-dev-postgres-1 psql -U stressforge -d stressforge -X -A -t -c 'SELECT name FROM migrations ORDER BY timestamp;'`. Names were compared with migration classes in source. No user records, secrets or schema definitions were inspected; this verifies migration history, not every possible schema drift.

## Initial observations retained

- The first health probe preceded completion of the cold audit API startup and was refused. After the startup log reported ready, health and dev login were both 200. No application change.
- The newly written rehearsal stopped after five steps because it expected report text `Strained`, whereas the actual established label is `Strained: close to its limits`. The new harness was corrected to assert that exact full label; no existing test or app code changed. Initial log/JSON are retained. The next run passed all nine steps (`journey-first-pass.json`). A final unchanged-behavior run also passed after switching its report capture to a useful viewport image instead of an oversized off-screen article capture.

`report-light.png` and `guard-evaluation-light.png` were visually inspected. The report shows the recorded 41.26 ms p95/zero errors and honest strained verdict; Evaluation shows the counts, NO-GO, JSON miss and experimental/default-off limits. Screenshots contain only disposable audit design data and no credentials/share tokens.

## Limitations and cleanup

These are scripted real-browser rehearsals, not a claim that the user personally rehearsed the presentation. The live check covers the existing backend preflight, not a new live goal-box UI journey; the earlier Claude UI-live evidence remains attributed to the handoff. No inference feature is released by these checks. Faculty acceptance of experimental AI is unconfirmed pending the user's answer.

The earlier full production regression remains 950 pass/10 intentional skips/0 failures; these focused checks were run separately. Do not add the repeated role tests to that total. No full-suite rerun/build was needed: application source and dependencies were unchanged. No new application feature was added to mutation-test; the earlier feature mutations remain recorded in the preceding audit.

Owned audit API/dev/production web processes and M9 containers were stopped, volumes retained. Development services and the already-running M8 containers were left as found. No push, paid upgrade, model download, key change/deletion, account-role changes in the development database or staging of protected/unrelated work. Evidence copies normalize only terminal trailing whitespace; original temporary logs remain intact.
