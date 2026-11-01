# STRESSFORGE handoff log

Append a new entry at the TOP at the end of every session (newest first). Never rewrite old entries. Keep each entry to what the next agent needs: what changed, evidence, what is uncommitted, what to do next. Current status lives in [PROJECT-STATE.md](PROJECT-STATE.md).

Entry template:

```
## YYYY-MM-DD HH:MM (Asia/Dhaka), <agent>
**Goal:** ...
**Done:** ... (commit hashes)
**Evidence:** commands and results; initial failures and fixes
**Uncommitted:** paths and whose they are
**Decisions by the user:** ...
**Next:** ...
**Warnings:** ...
```

## 2026-11-01, Claude P5, commit one
**Goal:** build P5 after "Approve all".
**Done:** `pnpm fixtures:evaluation` generates `web/src/lib/evaluation-data.json`; `evaluation-data.spec.ts` guards it and tests the checks themselves. Final numbers are in P5-EVALUATION-SCOPE.md (worst relative error vs exact Erlang C: 15.2% where the wait is at least 20% of service time; largest absolute gap 0.0336 service times; port fidelity 1.1e-16; 30 of 30 consistency checks pass).
**Warnings:** run `pnpm fixtures:evaluation` after any engine change. Do not stage `docs/audit/m2-profile-source.json` or the audit PNGs.
**Next:** commit two: public `/evaluation/simulator`, `/calibration`, `/ai` with honest statuses, tests, regression.

## 2026-11-01, Claude P5 scope
**Goal:** plan P5 (user: "Push and scope P5").
**Done:** pushed `44e0c15` (P3). Wrote [P5-EVALUATION-SCOPE](P5-EVALUATION-SCOPE.md) from verified facts: the Evaluation routes are placeholders with stale "mock data" text; the real evidence is port fidelity to the prototype, one exact M/M/1 test, behaviour tests, no calibration and an AI NO-GO. A quick experiment against exact Erlang C gave a real finding (see PROJECT-STATE) that the page should state plainly. No code changed.
**Next:** the user answers the ten decisions (notably: make the page public? how to word the Erlang C finding?); then build P5 in two commits. No active claims.

## 2026-11-01, Claude P3, commit two
**Goal:** finish P3 (user: "Approve all").
**Done:** the three pages, built from `examples-data.json`; two examples that miss their own goal say so; Chrome 674 passed / 10 skipped / 0 failed with 28 new browser tests; web unit 311. Breaks: 21 of 24 caught first time, the rest led to 3 new tests.
**Warnings:** keep `examples-data.json` and `learn-fixtures.json` fresh with `pnpm fixtures:examples` and `pnpm fixtures:learn` after any engine, template or catalog change (the backend specs fail otherwise). Do not stage `docs/audit/m2-profile-source.json` or the audit PNGs.
**Next:** P5 evaluation (scope first), then P6 welcome and progress.

## 2026-11-01, Claude P3, commit one
**Goal:** build P3 after "Approve all".
**Done:** `pnpm fixtures:examples` generates `web/src/lib/examples-data.json` from the real engine; `examples-data.spec.ts` fails when it goes stale. 10 deliberate breaks caught.
**Warnings:** after any change to templates, the catalog or the engine, run `pnpm fixtures:examples` and commit the file. Do not stage `docs/audit/m2-profile-source.json` or the audit PNGs.
**Next:** commit two: `/examples` (guest, load explorer), `/templates` (tags, filter, start), `/components` (catalog, presets), tests, regression.

## 2026-11-01, Claude P3 scope
**Goal:** plan P3 (user: "Push and scope P3").
**Done:** pushed `90faeae` (P2). Wrote [P3-EXAMPLES-SCOPE](P3-EXAMPLES-SCOPE.md) from verified facts: the template and catalog endpoints are signed-in and in the frozen phase 2 contract, so public data must be engine-generated static data checked by a spec; all six templates have real breaking points (491 to 4,641 requests a second) and two fail their own goal at their stated traffic; the registry promised a live traffic slider, product presets and tags the data does not support, and the scope replaces them with honest equivalents. No code changed.
**Next:** the user answers the ten decisions; then build P3 in two commits (generator + freshness spec first). No active claims.

## 2026-11-01, Claude P2 Learn, commit two
**Goal:** finish P2 (user: "Approve all").
**Done:** `/learn` and eight topic pages with demos, checks and local progress; fixed route checks that accepted inherited names (`constructor`, `__proto__`) for learn, settings and evaluation. Web unit 296, Chrome 646 passed / 10 skipped / 0 failed, 48 new browser tests. Breaks: 21 of 24 caught first time, the rest led to 2 new tests and 1 equivalent change.
**Warnings:** if the engine's formulas change, run `pnpm fixtures:learn` in the API; the specs fail until the fixtures are regenerated. The lesson wording is mine and is for the user's review. Do not stage `docs/audit/m2-profile-source.json` or the audit PNGs.
**Next:** P3 examples, templates and components; then P5 evaluation and P6 welcome and progress.

## 2026-11-01, Claude P2 Learn, commit one
**Goal:** build P2 after "Approve all".
**Done:** shared model + fixtures + parity tests (web `learn-model.ts`, `docs/contracts/learn-fixtures.json`, `pnpm fixtures:learn`). Found and recorded that V8 can print different last digits for the same `Math.pow` in different processes, which explains the older `fixtures:phase2` drift. 24 deliberate breaks, 23 caught (one equivalent).
**Warnings:** if the engine's formulas or constants change, run `pnpm fixtures:learn` and commit the new fixtures; the specs fail until then. Do not stage `docs/audit/m2-profile-source.json` or the audit PNGs.
**Next:** commit two: eight topic pages, demos, two-question checks, local progress, 404 for unknown topics, browser journeys.

## 2026-11-01, Claude P2 Learn scope
**Goal:** plan P2 (user: "plan scope for P2").
**Done:** pushed `2c5cd23` (P4). Wrote [P2-LEARN-SCOPE](P2-LEARN-SCOPE.md): eight topics, one demo and a two-question check each, demos kept equal to the simulator by fixtures generated from the backend engine (tests on both sides), progress in the browser, nine decisions with recommendations. No code changed.
**Next:** the user answers the decisions; then build P2 in two commits (shared model + parity first). No active claims.

## 2026-11-01, Claude Phase 4/5 P4 settings
**Goal:** build P4 (user: "Push and start P4").
**Done:** pushed `7b08733` (P1). Built Settings end to end: four new API routes, one migration, six settings sections, privacy text updated. Backend e2e 253 pass, web unit 268 pass, Chrome 598 passed / 10 skipped / 0 failed. 24 backend and 28 web deliberate breaks caught. Deviations from the approved decision text are listed in PHASE-4-5-SCOPE.md "P4 result".
**Warnings:** run `pnpm migration:run` (AccountSelfService is new; the user's dev database has not had it). `pnpm fixtures:phase2` fails on byte-drift under Node 24.14.1 (not caused by this work, no inputs changed). A `git stash -u` was attempted and refused by the classifier; nothing was stashed. Do not stage `docs/audit/m2-profile-source.json` or the audit PNGs.
**Next:** P2 Learn (eight topic pages with mini-demos), then P3 examples/templates/components, P5 evaluation, P6 welcome and progress.

## 2026-11-01, Claude Phase 4/5 P1 public pages
**Goal:** build P1 after the user approved all ten Phase 4/5 decisions.
**Done:** four public pages replace placeholders; content as typed data tied to SIMULATION-MODEL.md and to the code by tests; 7 unit + 12 browser tests; 18 deliberate breaks caught; full Chrome regression 574 passed, 10 skipped, 0 failed. No backend or migration change.
**Warnings:** the privacy page says export and deletion are not available yet; update `PRIVACY_CONTROL` when P4 ships (a test forces this). The About page links to the GitHub repository. Do not stage `docs/audit/m2-profile-source.json` or the audit PNGs.
**Next:** P4 settings (profile, password change, export, account deletion).

## 2026-11-01, Claude Phase 4/5 scope
**Goal:** plan the non-AI phases that remain after the roles track (AI parked).
**Done:** pushed `06f37e4` (report section 28 for R1-R5). Wrote [PHASE-4-5-SCOPE](PHASE-4-5-SCOPE.md): six slices (honest public pages, learn, examples/templates/components, settings with export and account deletion, evaluation, welcome/progress) and ten decisions with recommendations. No code changed. The landing page was already committed; its 16 browser tests pass.
**Next:** the user answers the decisions; then build P1 first. No active claims.

## 2026-11-01, Claude finishes R5.3 and the R5 Instructor track
**Goal:** R5.3 Instructor submissions and feedback (user: "proceed with the R5.3 and finish it").
**Done:** built and verified, see R5-INSTRUCTOR-SCOPE.md "R5.3 result". Backend, web panel on the existing challenge page, learner feedback on the attempt page, 11 + 6 + 1 new tests, 17 of 18 deliberate breaks caught (the last is equivalent), full Chrome regression 550 passed, 10 skipped, 0 failed.
**Warnings:** run `pnpm migration:run` (ChallengeFeedback is new). R5.2 was pushed (dca7218); R5.3 is local only. Do not stage `docs/audit/m2-profile-source.json` or the audit PNGs.
**Next:** the roles track is complete. Next phase is the AI work (M12 explanation, Groq roadmap); needs the user's go-ahead because hosted inference sends data off-machine.

## 2026-11-01, Claude finishes R5.2 learner challenge loop
**Goal:** take over Codex's uncommitted R5.2 work after its usage limit and finish it.
**Done:** reviewed and kept Codex's backend and web; added 14 e2e tests; mutation checks, web checks, browser journey and full sequential regression, see R5.2-LEARNER-SCOPE.md "R5.2 result". Codex's reported truncate timeout was memory pressure, not a defect (passes alone and in the full sequential run); no limit was relaxed.
**Warnings:** run `pnpm migration:run` (ChallengeAttempts is new). Local branch is ahead of origin; nothing pushed. Do not stage `docs/audit/m2-profile-source.json` or the audit PNGs.
**Next:** R5.3 Instructor submissions and feedback (not started).

## 2026-10-31, Codex R5.2 backend groundwork (incomplete)
**Done:** approved R5.2 groundwork: attempt/submission schemas, additive migration1794200000000, unregistered learner service and pure judging with two specs.15 tests pass; AND→OR mutation caught and restored; tsc passes. No live endpoints or migration executed.
**Remaining:** service lifecycle and resource/retention review, controllers/OpenAPI, own progress, learner UI/editor links, dev seed, real isolated integration tests, full gates and Chrome regression. R5.2 remains incomplete. No new feature can be used yet.
**Uncommitted:** six new backend files under contracts/phase3, database/migrations and modules/challenges; state/handoff notes; existing unrelated files preserved. No active claims, commits or pushes; AI parked.

## 2026-10-31, Codex R5.2 scope preparation
**Done:** approved R5.1 verification committed015e19a by explicit paths; protected artifact and images excluded. Drafted R5.2-LEARNER-SCOPE.md using eleven existing decisions plus labelled recommendations. No application code changes or tests rerun for planning.
**Next:** user reviews detailed scope before implementation; no push authorized. No active claims. AI parked. Unrelated dirty/untracked work preserved.

## 2026-10-31, Codex R5.1 full Chrome verification
**Done:** full552-test Chrome suite completed:542 passed,10 skipped,0 failed,23.7min,one worker,all4 projects. All role/Instructor tests ran with explicit SF_PG_* variables. See r51-2026-10-31/chrome-regression.txt and R5 scope closure for details.
**Preserved:**117 earlier PNGs restored; protected M2 hash unchanged,staging empty; source unchanged.
**Cleanup:** owned API/web sessions and m9 containers stopped; volumes retained. Dev containers remain stopped after freeing RAM. AI disabled.
**Uncommitted:** verification evidence and tracking/scope/report notes plus all pre-existing unrelated files. No commits/push. No active claims.
**Next:** user may authorize publication; R5.2 not started. Prior incomplete-regression notes are historical, superseded by this successful run.

## 2026-10-31, Codex R5.1 regression preflight
**Goal:** rerun full Chrome regression after user said Proceed.
**Done:** read instructions/scope/hand off, confirmed HEAD ace6b64 and2 commits ahead of cached origin; started Docker Desktop, inspected one-worker Playwright configuration and SF_PG_CONTAINER/SF_PG_USER/SF_PG_DB prerequisites. No source edits.
**Evidence:** Docker recovered; development containers auto-started healthy. Physical RAM499 then545 MiB free, below prior crash headroom (~800 MiB). One sandbox CIM read failed; successful elevated recheck returned545 MiB (the failed probe's zero output is invalid telemetry). Ports3003/5003 empty. No regression launched and no pass claimed.
**Next:** user closes unnecessary apps and replies ready; remeasure RAM before starting isolated stack and full Chrome run. Preserve existing screenshots through backup/restore before test writes. No new milestone or push approved.
**Uncommitted:** state/handoff notes; existing unrelated modifications untouched. No active code claims; AI parked.

## 2026-10-30, Codex R1 handoff reconciliation
**Goal:** receive Claude's new handoff and inspect publication/current constraints.
**Done:** local and live remote match3f7dbc0; checked roles scope and bootstrap implementation locations. Added R1 checkpoint to state board. No active code claims.
**Evidence:** read-only inspection; Claude's test numbers retained as reported, not independently rerun. Refresh-session revocation remains a documented deviation from approved decision3; privileged endpoints instead recheck DB roles.
**Uncommitted:** tracking docs remain local; supplied handoff and all prior dirty screenshots/protected M2/unknown files preserved. No commit/push/migration/bootstrap performed.
**Next:** choose explicit existing account before bootstrap; verify migration state before operation. R2 not authorized. AI parked supersedes old authorization.

## 2026-10-30, Codex development connection recovery
**Goal:** resolve Nest ECONNREFUSED.
**Done:** existing development PostgreSQL/Redis were stopped; restarted only stressforge-dev-postgres-1 and stressforge-dev-redis-1 with docker start. Verified watcher21896 belonged to this project, stopped it and relaunched pnpm start:dev once under Node22; session28979 left running. A prior source timestamp touch changed no source bytes.
**Evidence:** container health both healthy, PostgreSQL accepting connections, Nest compilation0 errors and successful startup; GET /v1/health200 with PostgreSQL/Redis up.
**Uncommitted:** state/handoff operational notes only; all existing dirty work preserved. No migrations, commits or pushes. No active claims.
**Next:** use existing backend; do not launch a duplicate on5001. Start these development services before Nest next time. AI remains parked.

## 2026-10-29, Codex handoff verification
**Goal:** read Claude context and confirm M16 publication state.
**Done:** read context, root instructions, state board, handoff and AI deferral plan; checked branch, status, log and live remote. Both HEAD and remote are 1fcf7c1; M16.3 remains uncommitted; staging area empty. Added a corrective checkpoint to state board without rewriting historical records.
**Evidence:** read-only Git checks; no test suite rerun. Final regression completion remains unverified. Exact43-character token guard is present in share-presentation.ts.
**Uncommitted:** preserved Claude share UI/generated types, dirty historical screenshots, protected M2 profile, earlier Codex landing/Groq documents and code, and film/. Only handoff/state documentation updated by this review.
**Decisions:** user's latest AI-parked instruction supersedes earlier AI approval; no active Codex code claims.
**Next:** establish final M16.3 regression evidence before completion or a path-scoped commit. No new milestone started.

## 2026-10-29 (M15), Claude Code
**Goal:** build M15.1 History and M15.2 Restore after the user approved all six M15 decisions.
**Done:** `0570294` backend (POST /designs/:id/versions/:revision/restore, GET /designs/:id/runs, migration VersionRestore, phase 3 contracts) and `7f6ed8d` web (History tab, Restore preview and guards). Details and numbers: PROJECT-STATE "M15 detail".
**Evidence:** see PROJECT-STATE. Notes: the shell heredoc kept failing on long scripts, so edit scripts were written as files in the session scratchpad; a first mutation of the editor-adoption line was not caught because the cache update also makes the editor adopt the revision, so both were removed in the second mutation and that was caught.
**Uncommitted:** not Claude's: landing page, `film/`, `DESIGN.md`, `groq.provider*`, GROQ roadmap, M12 scope doc, protected `docs/audit/m2-profile-source.json`.
**Decisions by the user:** approved all six M15 decisions as recommended (restore as new revision; compare same-design versions first; pick runs with latest preselected; notes 2,000 chars and 100 per design; archive hides and keeps evidence; retention line "latest 100 versions are kept").
**Next:** M15.3 Notes, then M15.4 Compare (adds the pick-two control to History), then M15.5 Designs list, each with its own gates. Run `pnpm migration:run` on any existing database first.
**Warnings:** the cursor for GET /designs/:id/runs is createdAt, so two runs created in the same millisecond across a page boundary could be skipped. AI remains parked; History does not render any AI surface.

## 2026-10-29 (later), Claude Code
**Goal:** finish M12A, then make AI deferrable and plan the non-AI track.
**Done:** `4ad4481` typed claims and version-schema split; `4aa48c1` explanation drawer and the AI-hidden gate; docs: [AI-DEFERRAL-PLAN](AI-DEFERRAL-PLAN.md), [M15 scope](M15-HISTORY-COMPARE-NOTES-SCOPE.md), updated AGENTS.md and this board.
**Evidence:** see PROJECT-STATE "M12A detail". Defects found and fixed this stretch: a 0.5 absolute tolerance let 0.99 pass as a 1% budget; a slow readiness reply overwrote an earlier-revision notice; closing the panel mid-submit stranded state; my claims prompt grew to 534 chars and broke the existing under-500 guard test (prompt shortened to 446, test untouched); the audit database lacked the M11 migration (applied to the disposable DB only).
**Uncommitted:** not Claude's: landing page, `film/`, `DESIGN.md`, `groq.provider*`, GROQ roadmap, M12 scope doc, protected `docs/audit/m2-profile-source.json`. The report holds Codex's M12A/Groq checkpoints, committed together with Claude's note because the file cannot be split.
**Decisions by the user:** AI integration is parked until they finish planning it; finish M12A then two tracks.
**Next:** the user answers the six M15 decisions, then M15.1 History and M15.2 Restore. Codex should reconcile the report's "M12B authorized" note with the AI pause and commit its own untracked files.
**Warnings:** the two M12 docs linked from this board are untracked until Codex commits them (dead links meanwhile). Do not touch `modules/ai`, `explain-*` or `groq.provider*` while AI is parked.

## 2026-10-29, Claude Code
**Goal:** continue M12A (result explanation) after committing the M11 backend; then set up shared tracking for Codex and Claude Code.
**Done:**
- Committed the M11 backend in three commits: `11f6a2a` (contracts), `d9678f5` (API: AiModule, jobs, versions), `7cf8799` (docs and audit evidence). Verified from a clean checkout of HEAD before the docs commit: build, typecheck, lint (0 errors, 22 inherited warnings), unit 201, e2e 76/76.
- Committed `fe5c01a`: verified facts with explicit units, `GET /ai/jobs/:id/evidence`, figure-grounding check, legacy-artifact labelling, regenerated contracts and types. Backend after it: unit 206 (2 opt-in skips), e2e 79/79, lint 0 errors.
- Wrote (uncommitted) the M12A frontend: `scope: "local"` for the API client with tests, `ExplainSession` (stable request id, same-request retry, bounded polling, cancel with provider-still-stopping, late-reply and account/design/run/revision binding, URL job recovery), the store, `ExplainDrawer` and `ExplainTrigger`, styles, workspace wiring.
- Added root `AGENTS.md`, `CLAUDE.md`, `docs/PROJECT-STATE.md` and this log.
**Evidence:**
- Mutation checks passed and were restored: grounding off makes the e2e rejection test fail; removing the local-scope guard makes a client test fail.
- Real defects found by new tests and fixed: the 0.5 absolute tolerance let "0.99" pass as a 1% budget (now rounding-based); a slow readiness reply overwrote an earlier-revision notice (now a derived status line); closing the panel mid-submit stranded the state (submit now survives the panel and is aborted only on dispose).
- Web after the frontend work: `tsc` clean, lint clean, unit 142/142. Not yet run: any M12 browser test, full regression.
**Uncommitted:** see PROJECT-STATE "M12A detail" and "Active claims". Codex-side files that appeared during the session (`groq.provider*.ts`, `GROQ-IMPLEMENTATION-ROADMAP.md`, typed claims in `grounding*.ts`) were not written or run by Claude. The landing page, `DESIGN.md` and `film/` are not Claude's either.
**Decisions by the user:** M12A approved first; "Commit M11" approved; strategy discussion requested before continuing. The Groq direction was recorded by another agent in the roadmap (approved 2026-10-29).
**Next:** user confirms claims and order. Then finish M12A (write `m12.spec.ts`, run web regression, review Codex's typed-claim integration, commit by path), then provider abstraction (G2) and, in parallel and only if approved, M15 History / Compare / Notes.
**Warnings:** `ai.service.ts` and `ollama.provider.ts` will be touched by both M12A claim integration and the G2 provider abstraction. Do not edit them concurrently. Keep `docs/audit/m2-profile-source.json` unstaged.

## 2026-10-29 (M15 finish), Claude Code
**Goal:** M15.3 Notes, M15.4 Compare, M15.5 Designs list with the same gates.
**Done:** `f5d8ab0`/`bed8280` Notes; `d4f5496`/`534171d` Compare; `a45b0ec` library API (search, filters, duplicate, archive, migration DesignArchive); `e7158ab` /designs page. API client gained an `envelope` option so paged lists keep meta.
**Evidence:** see PROJECT-STATE "M15.3-M15.5 detail". Full Chrome regression 390 passed, 10 skipped, 0 failed; web unit 163; mutation checks caught for each slice.
**Uncommitted:** not Claude's: landing page, `film/`, `DESIGN.md`, `groq.provider*`, GROQ roadmap, M12 scope doc, protected `docs/audit/m2-profile-source.json` (kept unstaged).
**Decisions by the user:** all six M15 decisions approved as recommended.
**Next:** the user chooses the next milestone; none started. Codex should commit its own untracked files and reconcile "M12B authorized" with AI being parked.
**Warnings:** run `pnpm migration:run` on existing databases (three new migrations). Rename from the list was deliberately left out.

## 2026-10-29 (end of day), Claude Code
**Goal:** M16 Report and read-only sharing, then hand over to Codex.
**Done:** M16 scope (`bdff398`), M16.1 report (`eea8349`, `ca2fd2a`), M16.2 share API (`1fcf7c1`, pushed). M16.3 share settings and public viewer is built and tested; a final full Chrome regression was running, so check `git log` for whether it is committed.
**Read first:** [CODEX-CONTEXT-2026-10-29.md](CODEX-CONTEXT-2026-10-29.md) has the full picture: commits, evidence, rules, files that are not Claude's, operator notes and next steps.
**Warnings:** run `pnpm migration:run` (DesignShares is new). Do not stage `docs/audit/m2-profile-source.json`, the landing files or the audit PNGs. AI stays parked.
**Update (final regression):** M16.3 passed the full Chrome regression, 434 passed, 10 skipped, 0 failed, and is committed. One real defect was found and fixed on the way: the share viewer's token check accepted 20 to 128 characters, so the route audit's sample token caused a 404 console error; real tokens are exactly 43 characters and the check now says so. The existing test was not changed.

## 2026-10-31, Claude Roles R1 and R2
**Goal:** build the roles track foundations and Admin tools (decisions approved 2026-10-30).
**Done:** R1 `3f7dbc0` and R2 `9700bb2`, both pushed. Docker Desktop failed to start (stale `docker-secrets-engine\engine.sock`); the folder was renamed to `docker-secrets-engine.stale-20261031` and Docker restarted, nothing deleted.
**Evidence:** see ROLES-SCOPE.md "R1 result" and "R2 result". The first full browser run after R2 found a duplicate `h1` in the access-denied panel (fixed); only the affected specs were rerun afterwards.
**Warnings:** run `pnpm migration:run` on dev and QA databases. Existing tests changed on purpose: phase1.spec route count 35 to 36, R1 lookup allow-list gained `status`, fake-redis gained `del`. Do not stage `docs/audit/m2-profile-source.json`.
**Next:** R3 review grants (in progress by Claude on 2026-10-31).

## 2026-10-31, Claude Roles R3 review grants
**Goal:** R3 of the roles track, after the R1/R2 cleanup commit.
**Done:** R3 `87736b2` (local, not pushed). Owner shares one frozen revision with one named Reviewer; Reviewer inbox and read-only view; permission `review.read`; migration `ReviewGrants1793900000000`.
**Evidence:** see ROLES-SCOPE.md "R3 result". The full browser run had 4 failures, all the existing M16.3 share-link test clashing with my duplicated sentence; fixed by rewording my text; affected specs rerun green, the rest of the suite was not rerun after that wording change.
**Warnings:** run `pnpm migration:run` on dev and QA databases. Existing test changed on purpose: phase1.spec route count 36 to 38. Stale servers from an earlier test stack held ports 3003 and 5003 and were stopped; they were mine, not the dev stack.
**Next:** R4 reviewer comments (not started; scope review given to the user).

## 2026-10-31, Claude Roles R4 reviewer feedback
**Goal:** R4 of the roles track (the user said to proceed; they ran `pnpm migration:run` on their dev database and made the first Admin).
**Done:** R4 `3db9068` (local, not pushed). Comment thread per review; Reviewer API behind `review.read`; owner read and reply API; web panels on the Reviewer view and the share page; migration `ReviewComments1794000000000`.
**Evidence:** see ROLES-SCOPE.md "R4 result". Full Chrome regression 530 passed, 10 skipped, 0 failed.
**Warnings:** run `pnpm migration:run` on dev and QA databases. Existing tests touched on purpose: two of my own R3 "read-only means no buttons" checks now allow buttons inside the feedback panel only. Docker Desktop had failed to start earlier (stale `docker-secrets-engine` socket; folder renamed, nothing deleted).
**Next:** R5 Instructor (not started; needs a scope review and decisions first).

## 2026-10-31, Claude Roles R5.1 handoff to Codex
**Goal:** R5.1 Instructor challenges, then hand over to Codex at the user's request.
**Done:** R5.1 built and committed locally (not pushed). Backend, web, tests and deliberate-break checks listed in R5-INSTRUCTOR-SCOPE.md "R5.1 status".
**Not done:** the full Chrome regression did not complete (about 226 of 552 tests ran; free memory fell to about 800 MB of 7.9 GB and Docker Desktop crashed). Restart Docker, run one heavy job at a time, then rerun the full regression with `SF_PG_CONTAINER`, `SF_PG_USER`, `SF_PG_DB` set (see ROLES-SCOPE R3 to R5 notes).
**Warnings:** run `pnpm migration:run` on dev and QA databases (the user already did on their dev database). Existing test changed on purpose: phase1.spec route count 38 to 40. Postgres quirk handled in the challenges service: `UPDATE ... RETURNING` returns `[rows, count]`, `INSERT ... RETURNING` returns the rows. Do not stage `docs/audit/m2-profile-source.json`.
**Next:** finish R5.1 verification, then R5.2 (public list, attempts, submit and server judging, starter challenges, real progress page), then R5.3.

## 2026-11-01, Claude P5 Evaluation done
**Done:** P5 commit two (the three tabs, public routes, tests, docs). **Not done:** push (waiting for the user); P6.
**Warnings:** after any engine change run `pnpm fixtures:evaluation` (and `:check`). `r1-roles.spec.ts:41` failed once in a full run and passed 48 of 48 on rerun; if it fails again, investigate rather than weaken it. `pnpm fixtures:phase2` byte-drift (V8 `Math.pow`) still needs the user's decision. Do not stage `docs/audit/m2-profile-source.json`.

## 2026-11-01, Claude P6 commit one (Welcome)
**Done:** the Welcome tour, sample design, post-registration redirect. **Warning:** a new account without `?next=` now lands on `/welcome`, so any new browser test that registers and expects the dashboard must register with `/register?next=%2Fdashboard`. **Next:** Progress concepts (commit two). Do not stage `docs/audit/m2-profile-source.json`.

## 2026-11-01, Claude P6 done
**Done:** Progress concepts and next suggestion. All planned non-AI slices (P1 to P6) are built. **Not done:** push; AI (parked). Do not stage `docs/audit/m2-profile-source.json`.

## 2026-11-01, Claude breadcrumb fix
**Done:** on public pages a signed-in person's first breadcrumb is now "Dashboard" (to `/dashboard`) instead of "Home" (the landing page); guests keep "Home". One existing test (`phase1.spec.ts:32`) now expects that, with the user's approval. **Evidence:** web unit 357 (run one file at a time; the parallel run can fail with module-not-found under memory pressure), 5 deliberate breaks caught, full Chrome regression 757 passed, 9 failed, of which 4 were the intended change (fixed) and 5 single-project failures (m9:112, r53:40, m12:244, m6:63, p1-public:54) passed on rerun on every project.

## 2026-11-01, Claude Designs cards
**Done:** the cards on `/designs` had no inner padding (`.panel` has none and `.m15-design` never added any), so text touched the border. Now 18 by 20 px padding, a column layout with the buttons pinned to the bottom (equal-height cards line up), and a 0.18 s hover (accent border, shadow, 2 px lift; no lift under reduced motion; also on keyboard focus). **Evidence:** 2 new browser tests on four projects pass, 6 deliberate CSS breaks caught, m15 library specs pass, screenshots checked in light and dark. The full regression was not rerun: the CSS touches one class used only by the Designs list.

## 2026-11-01, Claude Help drawer fix
**Found:** 29 of 40 routes have no help entry, and the drawer's fallback told people that built pages (Learn, Progress, Evaluation, Settings and others) "arrive in phase N" and are "a placeholder". **Done:** the note now shows only for the three real placeholder routes (`compare`, `dev-ai-logs`, `dev-eval-runner`, list in `help.ts`), and the stale "Concept pages arrive in phase 4" line is gone. A unit test ties the list to the pages that actually render the placeholder, so it cannot drift. **Evidence:** web unit 360; 2 new browser tests on four projects; 5 deliberate breaks caught; phase1 and Welcome specs pass. Full regression not rerun (text-only change inside the drawer). **Also checked:** the top-bar brand link already goes to the dashboard when signed in; no other place sends a signed-in person to a guest page. **Not changed:** the AI panel still says real AI answers "arrive in phase 3" (AI is parked; wording to revisit when it returns). **Build note:** with about 800 MB free the production build crashes (exit 3221226505); building with `experimental.cpus` capped at 3 works (set temporarily, not committed).
