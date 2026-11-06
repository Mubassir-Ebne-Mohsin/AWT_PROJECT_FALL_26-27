# Handoff for Codex, 2026-11-06: Claude Code is stepping away; Codex continues alone

Branch `codex/phase2-contracts`, in sync with `origin`, head `60993e1`. Read this first, then AGENTS.md, CLAUDE.md, docs/PROJECT-STATE.md, the newest entries at the bottom of docs/HANDOFF-LOG.md, and [CODEX-HANDOFF-2026-11-05.md](CODEX-HANDOFF-2026-11-05.md) (still accurate; this file adds to it). Written by Claude Code at the owner's request ("I will transfer this work to codex entirely").

## 1. Standing rules from the owner (unchanged, follow exactly)
- `docs/audit/m2-profile-source.json`: preserve exactly. Never stage, commit or revert it. Check before every commit that it is not staged.
- Never read, print, log or copy values from `.env` files.
- No push, merge, deploy, remote or global Git changes without the owner's explicit instruction. Commit by explicit path and ask before committing.
- No destructive operations on the owner's data. Do not weaken or delete an existing test to make something pass; if an existing test is wrong, tell the owner and wait. (Updating a count or role list that a new feature legitimately changes, with new assertions for the new thing, has been accepted by the owner.)
- A green suite is not enough: show the tests fail when the feature is broken (deliberate breaks), and look at screenshots.
- Live Groq calls only on the owner's explicit go. AI figures are development figures until a separately registered acceptance run passes.
- The faculty extended the deadline (new date unknown). Size work by quality, not days.

## 2. State of the repository
**Pushed (newest first), all verified:**
| Commit | What |
|---|---|
| `60993e1` | PDF diagram boxes show each component's settings (`3x  cap 250  40ms  hit 80%`), wrapped and grown only where there is room; `web/src/lib/dossier/settings.ts` |
| `828a715` | **Report & PDF** and **Share** buttons in the workspace header on every tab, and a "Save or share this result" panel on Results (the report and share pages were previously reachable only by typing their address) |
| `6d93542` | Support role and problem reports (P0): migration `1794700000000-Support`, inbox, My reports, report dialog, internal notes hidden from authors, limits, append-only log |
| `2d4ec41` | Admin live dashboard and wall display, `GET /v1/admin/metrics`, `pnpm demo:activity` |
| `ca7677a` and earlier | component-anchored notes, PDF dossier, concept help, what-if, describe v2, goal box v3, demo launcher |

**Uncommitted in the working tree (do not lose it):**
- **Codex's own work from 2026-11-05** (Admin Support metrics, focus/heading/clock repairs, updated docs): `admin-metrics.*`, `support-metrics.tsx`, `use-now.ts`, the four new web unit tests, `role-gate.tsx`, changes to the support components, `phase1.spec.ts`, `AGENTS.md`, `PROJECT-STATE.md`, the progress report, and `docs/audit/support-metrics-2026-11-05/`. Its own log entry says: ask before committing explicit task paths.
- **Claude Code's handoff-log entries** (appended to `docs/HANDOFF-LOG.md`, which also holds Codex's entries, so they should be committed together with Codex's commit): the Admin dashboard, Support, PDF-link and PDF-settings entries, if not already present.
- **New planning documents (untracked):** `docs/ROADMAP-NEXT-FEATURES.md`, `docs/DESIGN-FEED-SCOPE.md`, `docs/CODEX-HANDOFF-2026-11-05.md`, this file.
- **Never commit:** `docs/audit/m2-profile-source.json`, the six `docs/audit/*.png` files that tests rewrite, `docs/contracts/m11-runtime.openapi.json` (the full e2e run rewrites it), and `film/` (nested `.git` of a failed clone).
- `web/src/lib/api/schema.d.ts` is a ~7,700-line regeneration of stale types; commit it on its own so it can be reviewed separately.

## 3. What the owner still has to do (do not do these for them)
1. The owner already ran `pnpm migration:run` on their dev database for `NoteComponent1794600000000` and `Support1794700000000` (done 2026-11-05). Every future migration needs the owner to run it on their own database: say so loudly in the handoff entry.
2. Collect AI test inputs from at least 5 independent writers; confirm the pass bars in `docs/AI-DEADLINE-PLAN.md` and settle its retry-rule contradiction; give an explicit go for the roughly 68-call acceptance run.
3. Their own timed demo rehearsal (`docs/DEMO-SCRIPT.md`, steps 3g and 3h are new); supply the faculty document (it may add a requirement).
4. The owner keeps `mubassirebnemohsin@gmail.com` as the only real Admin. Other Admin-role rows in their dev database (`dash-…`, `r2-…`, `shots-…@example.test`) are leftovers from verification runs; a cleanup command was offered and not run. Do not delete them without the owner's say.

## 4. The plan to continue (all unbuilt; owner approval needed per item)
The owner asked for a proper plan for these, now written:
- [ROADMAP-NEXT-FEATURES.md](ROADMAP-NEXT-FEATURES.md): items A to G with scopes, rules and tests, and the recommended order.
- [DESIGN-FEED-SCOPE.md](DESIGN-FEED-SCOPE.md): the community gallery ("a feed for designs"), brainstormed and shaped, five phases, nine questions for the owner.

**Recommended order:** (A) one-click PDF from Results; (B) dashboard extras (peak-hours heatmap, export); (C) notification bell; (D) community gallery phases F1 to F3, then (E) saved replies and merge duplicates, then gallery F4 and F5; (F) Support design sharing by consent last; (G) the AI acceptance run in parallel, blocked on the owner.
**Do not start the gallery before the owner answers the questions in DESIGN-FEED-SCOPE.md section 11** (who may view, the meaning of "contribute", moderation owner, account-deletion rule, seeding, name). For A, B, C, E and F follow the scope text in the roadmap; ask the owner to approve the item before building, as per the established loop.

## 5. Things learned the hard way
- **Chrome runs need a throw-away database.** Create one, run `DB_DATABASE=<name> pnpm migration:run`, start the API with `DB_DATABASE=<name> AUTH_THROTTLE_LIMIT=1000` (auth routes allow 10 a minute), set `SF_BROWSER_CHANNEL=chrome`, `SF_PG_CONTAINER=stressforge-dev-postgres-1`, `SF_PG_USER=stressforge`, `SF_PG_DB=<name>`, and drop the database afterwards. Backend e2e uses its own `stressforge_test`, so it never migrates the owner's dev database. Several Chrome specs of mine were first run against the dev database by mistake and left the leftover accounts above; do not repeat that.
- Playwright strict-mode violations do not retry: wait for the filtered list (`toHaveCount(1)`) before asserting on one row.
- Emails are stored lowercase; lowercase them in raw SQL.
- Docker Desktop stops on its own sometimes; start it before e2e. Run one heavy job at a time (memory). Use a production Next build for regressions; the dev server runs out of memory.
- Two backend tests are timing-sensitive under load and pass alone: `src/modules/simulation/worker/worker.spec.ts` and the teardown (drop database) of `test/ai-copilot-migration.e2e-spec.ts`. One red run is not proof of a regression; rerun alone. About 25 `sf_m11_migration_*` databases have piled up in the dev Postgres from such teardown timeouts (harmless).
- Older tests pin the route count (now 46) and the role lists; a new route or role means updating them on purpose and adding assertions for the new thing.
- Every privileged route declares `@RequirePermission`; no inheritance between roles; roles are read from the database on every call. Admin never reads design content or the Support inbox. Author-facing Support queries must never select `internal = true` messages (tested at the API).
- The shell tool mangles large heredocs and backslashes; write files with the file tools.
- `pnpm demo:ai` forces exactly `fixes,describe,whatif` with explanations off; plain `pnpm start` has no AI.

## 6. How to start the project (for the owner and for checks)
Docker Desktop running, then `docker start stressforge-dev-postgres-1 stressforge-dev-redis-1`; in `nest-boilerplate/nest-boilerplate` run `pnpm start` (or `pnpm demo:ai`); in `web` run `pnpm dev` (or `pnpm build` then `pnpm start`). `pnpm admin:bootstrap -- --email=<existing account>` only works while no Admin exists; `pnpm seed:demo-roles` prints demo-account passwords once (including `demo-support@example.test`); `pnpm demo:activity` and `:clean` fill and remove demo dashboard data.
