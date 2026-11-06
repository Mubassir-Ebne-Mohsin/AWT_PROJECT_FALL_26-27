# Roadmap C verification — 6 November 2026

## Status

**C is complete locally, not pushed.** The owner-approved bounded Support migration test retains all earlier assertions; the final full integration run passes. Backend 785/785 unit, 411/411 e2e (31 suites), builds/types/lint/contracts pass. Web 544/544 full unit, 18/18 final focused controls, build/types/lint and 46 routes pass. Chrome 96/96 affected, then 20/20 final notifications, 4/4 existing shell journeys and 4/4 reduced-motion journeys; five applied deliberate faults caught.

The nine earlier verified commits were pushed to `origin/codex/phase2-contracts`; independently checked remote HEAD was `16bc7d589ca372c1cc8946cea49bbe047bd42595`. New C work has not been pushed.

## Evidence

- Backend build/types/lint pass; lint has 26 pre-existing warnings. Both contract checks pass. Full unit: **785/785**, 62 suites (`backend-unit.txt`).
- Final new PostgreSQL positive controls: **12/12**, including raw storage privacy, recipient matrix, self/internal/no-op suppression, role loss, cursor ties, concurrency/retention, export/cascade, event rollback and migration up/down/refusal (`backend-positive-final.txt`).
- Full integration attempt: nonzero exit, known existing Support rollback failure (`backend-e2e-before-support-test-correction.txt`). It did not produce a trustworthy final count. The later corrected full run passes; see backend-e2e-final.json / backend-e2e-result.json.
- Web full unit: **544/544**. Final focused positive controls: **18/18**. Build, lint (two pre-existing warnings), types and all **46 routes** pass including the final timestamp accessibility repair; final logs are in web-build-final.txt / web-lint-last.txt / web-typecheck-last.txt.
- Earlier affected production Chrome: **96/96** (notifications, Support, Settings across 1024/1440 light/dark, embedded 320/390 checks). Final rebuilt notifications **20/20**, unchanged existing shell **4/4**, explicit reduced motion **4/4**. These are repeated/focused runs, not 124 unique cases.
- **Five applied deliberate faults caught** (`mutations.json`): wrong recipients, missing self exclusion, missing current-access check, private text stored in an expanded table, and stale response winning. Backend faults use a fresh labelled database each; all mutations are in-memory reads, never writes to application files. Stale fault ran in the Node test child (its marker is `# MUTATION_APPLIED stale 1`; the parent marker is zero).

## Failures found and fixed

1. Real PostgreSQL rejected ambiguous varchar/text parameter inference in notification insertion; explicit casts fixed it. First run: nine failures, one pass (`backend-initial-sql-failure.txt`).
2. New Preferences effect initially violated an existing lint rule; initial loading state and promise completion handling fixed it without disabling the rule.
3. Browser checks exposed an inaccessible event-name prefix, focus lost when async actions disabled/removed the focused button, and a checkbox reverting while waiting for save. Explicit labels, stable Close focus and optimistic save with rollback fixed them.
4. Final review connected each timestamp description to its element and added an assertion. The final rebuilt browser run passes.
5. New-test `prefer-const` lint error fixed. UTF-8 loading text repaired after a Windows encoding mistake. Audit startup now waits for listeners; no app timeout changed.
6. The existing Support migration test calls `undoLastMigration()` after applying every migration. It now undoes empty Notifications successfully instead of exercising Support's role-use refusal. Reproduce with the current full integration suite or its existing Support migration case. Owner-approved correction: restrict only that temporary DataSource to migration timestamps through Support, assert Support is the last executed migration, then retain every existing refusal/data-preservation/up-down assertion.

## Isolation and limits

Only `stressforge-m9-postgres` (5552), `stressforge-m9-redis` (6399), `sf_notifications_*` databases and owned ports 3003/5003 are used. No owner database migration, .env inspection, model call or paid usage. Full-suite legacy teardown temporarily used fsync-off on the disposable PostgreSQL container; finally reset/reloaded to **on** (`pg-durability-restored.txt`). No owner container or timeout changed.

No full all-project Chrome, Edge, dev-only or AI acceptance claim. New notification kinds for the gallery remain out of scope. Polling refreshes the latest page; pause to browse earlier pages. Ninety-day cleanup is lazy and owner-bounded, not a global scheduled purge.

## Reproduce

`run.ps1` uses public disposable credentials and an empty working directory, never copies owner environment files. `web-gates.ps1`, `verify-mutations.ps1`, `positive-final.ps1` and `browser-final.ps1` record sequential checks. The Support-test decision is resolved and the final full gate passes. Do not count a failed negative check as a positive pass.

Owner setup: stop the backend, run `pnpm migration:run` in the backend, then restart it. This adds `Notifications1794800000000`, with no backfill. The audit does not migrate the owner's database.

[User guide](../../NOTIFICATIONS.md) · [Approved scope](../../NOTIFICATIONS-SCOPE.md) · [Living report](../../STRESSFORGE-PROGRESS-REPORT.md).

## Final preservation and cleanup

158 entry files /155 original PNGs verified (preservation.json). Runtime OpenAPI restored to entry bytes; M2 never written/staged/reverted. All PNGs/runtime/M2/film remain unstaged. Only owned 3003/5003 listeners and M9 audit containers stopped; volumes retained. Owner dev services unchanged. Full all-project browser/Edge/dev-only/AI acceptance remain outside this verification. Initial reduced-motion measurement failed on transient top-bar layout after resizing; bounded polling retains the original 1px overflow threshold and all four final journeys pass.

Stored console transcripts have trailing whitespace trimmed for Git; test results and assertions are unchanged.
