# Handoff for Codex, 2026-11-05

Branch `codex/phase2-contracts`, pushed, head `6d93542`. Read this with AGENTS.md, CLAUDE.md, docs/PROJECT-STATE.md and docs/HANDOFF-LOG.md (newest entries at the bottom). Written by Claude Code at the owner's request.

## Standing rules from the owner (unchanged, follow them exactly)
- `docs/audit/m2-profile-source.json`: preserve exactly. Never stage, commit or revert it. Check before every commit that it is not staged.
- Never read, print, log or copy values from `.env` files.
- No push, merge, deploy, remote or global Git changes without the owner's explicit instruction. Commit by explicit path, and ask before committing.
- No destructive operations on the owner's data. Do not weaken or delete an existing test to make something pass; if an existing test is wrong, tell the owner and wait.
- A green suite is not enough: show that tests fail when the feature is broken (deliberate breaks).
- Live Groq calls only on the owner's explicit go. AI features are off by default; the demo launcher `pnpm demo:ai` forces exactly `fixes,describe,whatif`.
- The faculty extended the 8 Nov deadline (new date unknown). Size work by quality, not days.

## How features are built here
Scope doc in `docs/<FEATURE>-SCOPE.md` with questions, owner approval, then build: unit tests, e2e on real PostgreSQL, Chrome specs on a production web build, deliberate breaks, look at screenshots, a handoff entry in `docs/HANDOFF-LOG.md`, ask before commit, push only when told.

## Done (newest first, all pushed)
| Commit | What |
|---|---|
| `6d93542` | **Support role and problem reports (P0).** Role `support`; migration `1794700000000-Support`; `modules/support/`; Report a problem dialog (replaced the placeholder feedback modal); My reports (`/reports`); Support inbox (`/support`); internal notes never reach authors; rate limits 5/hour and 20/day; append-only `support_activity`; reports anonymised on account deletion; account export includes the person's reports; demo account `demo-support@example.test`. Scope: `docs/SUPPORT-SYSTEM-SCOPE.md`. |
| `2d4ec41` | **Admin live dashboard.** `GET /v1/admin/metrics` (permission `admin.metrics.read`, aggregate-only, 3 s cache, derived alerts); `/admin/dashboard` and `/admin/dashboard/wall`; polling state machine in `web/src/lib/admin-metrics.ts`; `pnpm demo:activity` and `demo:activity:clean`. Scope: `docs/ADMIN-DASHBOARD-SCOPE.md`. No migration. |
| `ca7677a` and earlier this week | Component-anchored notes (migration `NoteComponent1794600000000`); PDF design dossier (`web/src/lib/dossier`, `pdf-lib` pinned); concept help drawer (no AI); what-if endpoint and AI sentence box; describe v2; goal box v3; demo launcher and five-request preflight (READY x3); Evaluation sections with development figures labelled. |

Verified at `6d93542`: backend unit 777, full e2e 394 (30 suites), web unit 503, Chrome support spec 26 plus 64 neighbouring specs, all green, plus about 30 deliberate breaks for Support and 16 for the dashboard (all caught).

## What the owner still has to do (do not do these for them)
1. **Run `pnpm migration:run` on their own database.** The dev DB `stressforge` is behind: it lacks `NoteComponent1794600000000` and `Support1794700000000`. E2E uses `stressforge_test`, so it does not migrate the dev DB.
2. Collect the AI test sheet from at least 5 independent writers.
3. Confirm the plan bars in `docs/AI-DEADLINE-PLAN.md`, and give an explicit go for the acceptance run (about 68 live calls).
4. Do their own timed demo rehearsal; supply the faculty document (it may name an admin or reporting feature, which would change scope).

## Plan for Codex, in order
1. **Keep the tree clean.** Do not commit `docs/contracts/m11-runtime.openapi.json`: the full e2e run rewrites it as a side effect. Leave `film/` (nested `.git` internals of a failed clone) and the `docs/audit` PNGs alone.
2. **AI acceptance run (blocked on the owner, see above).** When unblocked: declare the run in a commit first (pre-registered method, thresholds as confirmed), then one live run on the owner's explicit go; record the result honestly, including a NO-GO. Do not retune prompts or thresholds to pass. Until then every AI figure is a *development* figure and must stay labelled so.
3. **Dashboard panel for support counts** (small, Support scope item 11): open reports, median first-response time (`first_response_at`), reports by category and status. Counts only, extend `admin-metrics.schema.ts`, the leak test and the OpenAPI contract together.
4. **Support P1, each independent and with its own scope questions first:**
   - Design sharing by consent (largest; needs a consent table, read-only snapshot at one revision, every open logged, withdrawal ends access at once, a second design stays unreadable).
   - Notification bell (in-app only; there is no mail setup).
   - Saved replies and merge duplicates.
5. **Dashboard extras not built:** peak-hours heatmap (item 14), export (11), system detail beyond database, cache and uptime (20), and the tier B and C ideas in `docs/ADMIN-DASHBOARD-SCOPE.md`.
6. **Before the demo:** follow `docs/DEMO-SCRIPT.md` end to end (steps 3g and 3h are new), run `pnpm demo:ai:check`, and ask the owner for a rehearsal.

## Things learned the hard way (save yourself the time)
- **Chrome runs need a throw-away database.** Create one, run `DB_DATABASE=<name> pnpm migration:run`, start the API with `DB_DATABASE=<name> AUTH_THROTTLE_LIMIT=1000` (auth routes allow 10 a minute), set `SF_BROWSER_CHANNEL=chrome` and `SF_PG_CONTAINER=stressforge-dev-postgres-1 SF_PG_USER=stressforge SF_PG_DB=<name>`, and drop the database afterwards.
- Playwright strict-mode violations do not retry. Wait for the filtered list (`toHaveCount(1)`) before asserting on one row.
- Emails are stored lowercase; lowercase them in raw SQL.
- Docker Desktop stops on its own sometimes; start it before e2e. Run one heavy job at a time (memory).
- Run Next on a production build for regressions; the dev server runs out of memory.
- The shell tool mangles large heredocs; write files with the file tools.
- Older tests pin the route count (now 46) and the role lists; a new route or role means updating them on purpose, with new assertions for the new thing.
- Every privileged route declares `@RequirePermission`; there is no inheritance between roles; roles are read from the database on every call. Admin never reads design content or the Support inbox.
