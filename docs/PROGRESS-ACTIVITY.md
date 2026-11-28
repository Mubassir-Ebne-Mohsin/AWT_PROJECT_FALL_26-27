# Private progress and activity calendar

Implemented 25-26 November 2026 after the owner approved the Progress redesign and purple GitHub-style calendar. This is private practice history, not a public contribution score or proof of expertise.

## Experience

- Four overview cards: passed lesson checks, passed/attempted challenges, distinct designs with completed runs in the last 365 UTC dates, and active days.
- A next-step recommendation retains the existing deterministic rules. Continue learning links to the latest lesson opened on this device; old undated marks are preserved without inventing a latest visit.
- Five category completion bars use the current 41-lesson registry. A collapsible three-column lesson list retains every title, link and completion mark.
- The purple calendar defaults to a year on laptops and 84 days on mobile. Users can switch either view. Four fixed nonzero levels mean 1, 2-3, 4-6 and 7+ activities. Empty days have a separate neutral color. UTC day labels are explicit.
- Focus or hover reveals the date/count breakdown. One day is in the Tab sequence; arrow keys move days/weeks, Home/End go to the boundary and Enter selects details. Closing details restores focus to the selected day. Counts and text support users who cannot distinguish colors. Dense chart cells are small; keyboard navigation and the text detail panel provide alternatives.
- Selected-day records and the latest eight milestones link to the relevant lesson, saved simulation/Limits run or challenge attempt. Day reads show at most 100 saved events with an explicit truncation message; calendar totals remain complete for retained data.

## Counting and data boundaries

A lesson counts when both check answers are passed, at most once per lesson per UTC day. Opening a lesson only updates Continue learning. Retaking a previously passed check on another date can count again. Saved activity counts completed simulation and Limits records and completed graded challenge submissions. A modeled failed scenario counts as a useful experiment. Pending, technically failed/interrupted work, graph checks, editing, page loads and live previews do not count.

Learning marks remain in the existing `sf:learn:v1:<bucket>` localStorage data. Dated learning data uses a separate `sf:activity:v1:<bucket>` entry, segregated by signed-in account and guest. The stored version includes first-observed time, completed checks and last-opened lesson. No historical dates are inferred from old marks. Records are validated, deduplicated and pruned to 365 UTC dates, with a 15,000-entry parsing bound (enough for 41 topics each day). Storage failures do not block lessons. Clearing Learn progress clears that account's local learning activity as well, without removing saved backend runs. It does not sync across devices.

Saved activity is read directly from retained owner-scoped database records. Deleting a design removes its run history from these totals; they are not a permanent analytics ledger. Existing challenge summary limits are unchanged. API failures retain local learning, show an explicit partial-data message and Retry, and use unknown summary values rather than claiming a complete zero. The calendar has no leaderboard, rewards or invented retrospective activity.

## Backend and contracts

New `src/modules/progress/{progress.module,progress.controller,progress.service}.ts`, registered in AppModule. The existing global JWT guard authenticates both reads; owner identity comes only from CurrentUser, with no caller-supplied owner selector.

- `GET /v1/progress/activity`: one-statement snapshot of sparse UTC day totals, distinct tested-design count, 12 latest saved events and window metadata. A 365-date rolling window includes today through the query time. Both union branches filter ownership and completed_at before aggregation. No graph, component properties, notes, tokens or other users' records are selected.
- `GET /v1/progress/activity/day?date=YYYY-MM-DD`: a validated in-window UTC day, up to 100 events plus hasMore. Invalid/missing/future/old dates return 422. Same owner/completion filters as the aggregate.

Canonical schemas are in `src/common/contracts/phase3/progress.schema.ts`, registered in phase3/openapi.ts and available in Swagger. Generated Phase3 JSON and web Phase3 types are updated. The runtime schema.d.ts is not regenerated. No migration, new table, dependency, model request, provider or paid service.

## Frontend files

`web/src/components/progress/`: progress-page.tsx, activity-calendar.tsx, activity-details.tsx and use-learning-activity.ts. Helpers are lib/learning-activity.ts, lib/progress-activity.ts and lib/api/progress.ts. Styles are imported by app/progress/page.tsx from styles/progress.css. The existing learner/challenges.tsx export delegates to the new page. learner/concepts.tsx gains category bars and the organized lesson list; Learn's existing hook records real opens/check passes and clears local history. Existing storage marks, demos and grading logic remain.

Tests: new web/tests/progress-activity.test.cjs and browser/progress-activity.spec.ts; backend modules/progress/progress.spec.ts and test/progress.e2e-spec.ts. Obsolete eight-topic counts in p6-progress.spec.ts now use 41 and the full registry for the all-passed case, following the owner's earlier expanded-count approval; original assertions and flows retained.

## Verification

Owner ports 3000/5001, data, accounts and existing containers are preserved. New audit data belongs only to `stressforge-progress-pg-20261125`, database `sf_progress_20261125` on 5548; test-only migration timeouts were extended for this laptop. Screenshots are unstaged under docs/audit/progress-activity-2026-11-25.

### Results - 26 November 2026

- Backend production build, scoped lint, canonical Phase3 contract check: passed. New unit suite 3/3. Isolated real-Postgres HTTP suite 6/6 on both initial clean validation and final rerun; real auth, completed simulation and Limits calculation, idempotent admission, empty data, foreign-owner exclusion, UTC boundaries, graded/ungraded challenge records, date validation and 100-row truncation covered. Swagger exposes the canonical authenticated reads. The owner's already-running API also advertised the new activity route in /docs-json.
- Full web unit sweep: 599/599 passed. Focused learning/progress/activity run: 45/45. The existing account-separated/guest storage checks and original numerical demos remain intact.
- Web production build, pnpm typecheck, pnpm check:routes and pnpm lint passed: 48 frontend route files; zero lint errors and two existing unrelated warnings (support.ts unused disable and dossier.test.cjs unused id).
- New Chrome browser suite: final 16/16 passed across four light/dark laptop projects. Each layout journey checks 1440/1024/390/320px, no page-level overflow, 365/84 visible days, actual purple versus neutral colors, category completion, keyboard navigation/selection, selected-day records, reduced-motion readability and empty history. Separate journeys cover partial service outages/retries and an actual quiz pass recorded once and retained across navigation and reload. Browser HTTP/auth are controlled fixtures; they are not a claim of a real-backend signup browser rehearsal.
- Separate production build on temporary port 3013: 4/4 passed with the same browser suite in 1440-dark (including mobile widths). Final desktop dark and 320px mobile screenshots visually inspected. Sixteen dev screenshots plus production snapshots are retained unstaged under docs/audit/progress-activity-2026-11-25; unrelated prior audit files were not changed.
- Two deliberate faults rejected: forcing neutral squares to the active purple failed a browser color assertion; removing owner predicates at query execution in an isolated test failed the HTTP owner-scope assertion by including other accounts' records. Faults lived in temporary browser/setup files, not application source, and those temporary files were removed.
- Initial issues: a new test fixture had an incorrectly quoted JSON SQL literal and was corrected. Visual inspection found that legacy admin activity-grid/activity-cell CSS overlaid the calendar, despite functional tests passing; new practice-grid/practice-cell classes and real color assertions fix and cover the conflict without altering the admin heatmap. A repeated audit first hit bootstrap reconciliation of synthetic pending fixtures; the isolated fixture cleanup now removes its synthetic rows, and the clean suite passes again. Helper commands with an incorrect working-directory-relative path made no edit and were retried correctly. No tests were weakened.

Limitations: full all-feature Chrome/Edge and backend-wide suites were not rerun. Original real-account P6 browser journeys were not rerun; their expanded-registry assertions were updated, and account separation remains covered by units while new browser journeys use isolated fixtures. No screen-reader user test or production-scale query benchmark. Dates are UTC, local learning is not synced, and retained backend records determine saved activity. Existing marks with no dates are never backfilled.

Delivery: all changes local, uncommitted and unpushed. No new dependency/migration/model call/environment-value read or owner-data modification. Only own production process/3013 and own progress audit Postgres container/5548 were stopped; owner services and data remain. Reopen /progress on the running frontend. No migration needed. Future phase work must update the existing progress report, preserve history, record fresh evidence and reassess affected earlier requirements; updates are not automatic.
