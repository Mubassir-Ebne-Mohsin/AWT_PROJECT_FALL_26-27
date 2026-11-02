# STRESSFORGE project state (shared by Codex and Claude Code)

**AI integration is PARKED by the user (2026-10-29).** Read [AI-DEFERRAL-PLAN.md](AI-DEFERRAL-PLAN.md) first: no AI feature work, no provider choice, `AI_ENABLED` stays false. Non-AI milestones continue.

**Last updated:** 2026-10-29 by Claude Code. **Branch:** `codex/phase2-contracts`. **Last commit:** `fe5c01a`.
Rules: [AGENTS.md](../AGENTS.md). Session history: [HANDOFF-LOG.md](HANDOFF-LOG.md). Evidence and history: [living report](STRESSFORGE-PROGRESS-REPORT.md). Plans: [Phase 2](PHASE-2-PLAN.md), [Phase 3](PHASE-3-PLAN.md), [roles and future scope](PROJECT-PLAN.md).

Latest handover for Codex: [CODEX-CONTEXT-2026-10-29.md](CODEX-CONTEXT-2026-10-29.md).

Update this file at the end of every session. Keep it short; put detail in the handoff log and the report.

## Codex handoff verification — 2026-10-29

Read-only repository review completed. Local HEAD and live origin/codex/phase2-contracts both resolve to 1fcf7c171af39326e927154b1fb77bf56c17a5d7. M15 is recorded complete; M16 report and share API are committed/pushed. M16.3 share settings/viewer remain uncommitted. Final full-regression success was not independently verified in this review; do not close M16 yet. Earlier summary rows below are stale where they conflict with this checkpoint. AI remains PARKED by the user's latest explicit instruction, superseding earlier M12B/Groq authorization. Codex has no active code claims; its Groq prototype files remain untouched and uncommitted. Landing work is from earlier Codex work; film/ origin remains unverified. No tests, migrations, inference, commits or pushes run during this handoff review.

## Milestones

| Milestone | Status | Notes |
| --- | --- | --- |
| Phase 1 Foundation | Complete | Published on GitHub main (`9e8bb00`) |
| Phase 2 M1-M9 | Complete, published | Core loop: designs, canvas, traffic, results, Limits, live preview. Branch `codex/phase2-contracts`; see report sections 11-21 |
| M10 local-model feasibility | **NO-GO** for the tested local models | Semantic failures plus resource exhaustion on this laptop. See [M10](M10-LOCAL-AI-FEASIBILITY.md) |
| M11 AI backend foundation | Complete locally (`11f6a2a`, `d9678f5`, `7cf8799`), not pushed | Jobs, readiness, memory guards, versions. AI disabled by default. See [M11](M11-AI-FOUNDATION.md) |
| M12A explanation UI and grounding | **Built, parked** | Backend committed (`fe5c01a`). Frontend and typed claims finished but uncommitted until the regression passes. Hidden unless the backend enables AI. See below |
| M12B real-model acceptance | **Parked** (user is planning AI) | Approved direction: [Groq roadmap](GROQ-IMPLEMENTATION-ROADMAP.md) (free plan, GPT-OSS 20B first) |
| M13 AI fix suggestions, M14 AI drafting, M17 AI evaluation | Not started | Need M12 real-model gate first. Separate approvals |
| M15 History / Restore / Notes / Compare / Designs list | **M15.1-M15.5 done** (History, Restore, Notes, Compare, Designs list; last commits `bed8280`, `534171d`, `a45b0ec`, `e7158ab`) | Decisions approved 2026-10-29. See [M15 scope](M15-HISTORY-COMPARE-NOTES-SCOPE.md). Needs `pnpm migration:run` on existing databases (VersionRestore, DesignNotes, DesignArchive) |
| M16 Reports / Sharing | **Done** (M16.1 `eea8349`, `ca2fd2a`; M16.2 `1fcf7c1`; M16.3 web, see log) | Needs no AI. See [M16 scope](M16-REPORT-SHARING-SCOPE.md). Needs `pnpm migration:run` (DesignShares). Full Chrome regression 434 passed, 10 skipped, 0 failed |
| Roles (Instructor, Reviewer, Admin) | **Complete and pushed** (R1 `3f7dbc0`, R2 `9700bb2`, R3 `87736b2`, R4 `3db9068`, R5.1 `ace6b64`, R5.2 `dca7218`, R5.3 `a245192`) | Needs no AI. Latest Chrome regression 550 passed, 10 skipped, 0 failed. Run `pnpm migration:run` on every database. Detail: report section 28, [ROLES-SCOPE](ROLES-SCOPE.md), [R5-INSTRUCTOR-SCOPE](R5-INSTRUCTOR-SCOPE.md) |
| Phase 4 / 5 (public, learning, evaluation, settings pages) | Placeholders; scope proposed in [PHASE-4-5-SCOPE](PHASE-4-5-SCOPE.md), awaiting decisions | The landing page at `/` is committed (`72ab218`, `ba93a83`) and its 16 browser tests pass. `DESIGN.md`, `film/` and `docs/audit/landing/` are still untracked |

## M12A detail (finished and parked)

- **Committed:** `fe5c01a` (verified facts, evidence endpoint, figure grounding), `4ad4481` (typed server-checked claims, server-rendered statements, version schemas split out of the AI file, prompt kept under the M11 500-character guard), `4aa48c1` (explanation drawer, scoped API errors, hidden unless the backend enables AI).
- **Evidence (final code):** backend unit 214 (2 opt-in skips), e2e 80/80, lint 0 errors, both contract checks identical; web unit 147, tsc and lint clean; M12 browser 36/36 (9 journeys x 4 projects); full Chrome regression 268/268 (landing and dev-only excluded). Mutation checks caught: claim check off, new request id per retry, earlier-revision guard, local error scope, AI-hidden gate.
- **Behaviour:** with the default `AI_ENABLED=false` the UI shows no AI at all. Switching AI on later is a backend setting; see [AI-DEFERRAL-PLAN](AI-DEFERRAL-PLAN.md).
- **Not done (parked by the user):** M12B real-model gate. Not Claude's, still uncommitted: `groq.provider.ts` and its spec, `GROQ-IMPLEMENTATION-ROADMAP.md`, `M12-EXPLANATION-SCOPE.md`. The report contains Codex checkpoints (one says M12B was authorized); this conflicts with the later "AI parked" decision and needs the user to reconcile.

## M15 detail (History and Restore, finished)

- **Committed:** `0570294` (restore endpoint, run list, migration `VersionRestore`, contracts, 7 e2e tests) and `7f6ed8d` (History tab, safe Restore, 5 unit tests, 7 browser journeys x 4 projects).
- **Evidence (final code):** backend unit 214 (2 opt-in skips), e2e 87/87, lint 0 errors, phase 2 and phase 3 contract checks identical (phase 2 frozen contract unchanged); web unit 152, tsc and lint clean; M15 browser 28/28; full Chrome regression 296/296 (landing and dev-only excluded). Mutation checks caught: stale-revision check, no-op check, remembered source revision, unsaved-edits guard, editor adopting the new revision.
- **Behaviour:** restore saves an old version as a NEW revision (never edits history), blocked while a draft is unsaved. Works with AI off.
- **Later slices:** see "M15.3-M15.5 detail" below.
- **Operator step:** run `pnpm migration:run` in the backend before using this build on an existing database.

## M15.3-M15.5 detail (Notes, Compare, Designs list, finished)

- **Committed:** Notes `f5d8ab0` (API) and `bed8280` (web); Compare `d4f5496` and `534171d`; Designs list `a45b0ec` (API, archive column) and `e7158ab` (web page).
- **Evidence (final code):** backend unit 214 (2 opt-in skips), e2e 109/109 across 8 suites, lint 0 errors, phase 2 contract unchanged; web unit 163, tsc and lint clean; full Chrome regression 390 passed, 10 skipped, 0 failed (includes landing specs, so not comparable with older totals). Mutation checks caught for every slice, including 4 unit and 4 page mutations on the Designs list.
- **Behaviour:** Notes are 2,000 characters, 100 per design, stale edits refused (NOTE_CHANGED). Compare covers versions of one design with server-decided comparability. Archive only hides: versions, runs and notes are kept, and Undo restores. Search matches % and _ literally. Works with AI off.
- **Not done:** Rename from the list (the workspace already renames; a list rename would bump the revision). Backend e2e and unit were last run before the web-only Designs list commit.
- **Operator step:** `pnpm migration:run` for VersionRestore, DesignNotes and DesignArchive.

## Active claims (edit only what you have claimed)

| Agent | Area / paths | Since | Status |
| --- | --- | --- | --- |
| Claude Code | M15 | 2026-10-29 | Finished M15.1-M15.5; nothing claimed. Next milestone needs the user's approval |
| Codex (unconfirmed) | Groq provider and roadmap: `groq.provider*.ts`, `GROQ-IMPLEMENTATION-ROADMAP.md`; typed claims in `grounding*.ts` | 2026-10-29 | Appeared in the tree during the Claude session; Codex should confirm or correct this row |
| Nobody | Landing page, `DESIGN.md`, `film/` | | Origin unknown. Do not touch or stage |

## Blockers and open decisions

1. **Groq key (G0):** the user creates a free account and puts `GROQ_API_KEY` only in the backend `.env`. Nothing hosted runs before explicit approval to execute.
2. **Concurrent editing:** two agents share one working tree. A "file changed on disk" overwrite risk already occurred once. Proposal (needs user approval): each agent works in its own git worktree and branch (`claude/<task>`, `codex/<task>`), merged by the user.
3. **Order of work (proposal):** finish M12A first (it is provider-independent and mostly written), then run two tracks in parallel: provider abstraction and Groq (G2-G3), and non-AI M15 History / Compare / Notes. Needs the user's approval before M15 starts.
4. **Role design:** Instructor/Reviewer/Admin need design decisions before implementation.

## Standing constraints

- `docs/audit/m2-profile-source.json` has an unrelated pre-existing modification. Never stage, commit or revert it.
- No push, merge or deploy without the user's instruction. M10-M12 work is local only.
- Zero paid services. AI is off by default; never a silent fallback.
- Isolated test infrastructure: containers `stressforge-m8-*` (ports 5551/6398) belong to the Claude M8 audit and are stopped; M11's disposable harness is in `docs/audit/phase3/m11-2026-10-28/`.

## Next step for whoever picks this up

Run `git status`, read the newest handoff entry, confirm claims with the user, then continue the claimed track.

## Development service recovery — 2026-10-30
Codex restarted existing stressforge-dev PostgreSQL (5433) and Redis (6379), which were stopped. Both healthy; existing Nest watcher had exhausted retries, so it was restarted once. GET /v1/health returned200 with database/cache up. No database reset, environment-value inspection, migrations or code changes; no active claims. Backend watcher left running in Codex exec session28979. Tracking notes are uncommitted.

## R1 handoff reconciliation — 2026-10-30
Codex read CODEX-HANDOFF-2026-10-30.md and verified local HEAD and live origin/codex/phase2-contracts both equal3f7dbc0341731fcf8ce78c93b48accf59e95c4b3. R1 implementation is committed/pushed. Claude reports222 backend unit passes (2 skips),143 e2e,180 web unit and494 Chrome passes (10 skips); these suites were not independently rerun in this review. Approved role-change refresh-session revocation is explicitly deferred to R2, so this requirement remains open despite immediate DB-based privileged authorization. Existing databases require AccountRoles migration; first Admin needs an explicitly selected existing account. Neither operation was performed here. R2 remains not started; route-registry expansion needs approval. AI remains PARKED, superseding historical M12B/Groq approval; no clarification is needed. No active code claims. Only tracking documentation edited; all unrelated files preserved and unstaged.

## Roles R1 and R2 — 2026-10-31
R1 (`3f7dbc0`): multi-role model (`user_roles`), permission table in code, Admin role API, append-only audit log, first-Admin command `pnpm admin:bootstrap -- --email=`, dev-only `pnpm seed:demo-roles`. R2 (`9700bb2`): suspend and restore (`users.account_status`), sessions end on suspension or role removal (`users.sessions_revoked_at`), account search, `/admin/users` screen. Migrations `AccountRoles1793700000000` and `AccountStatus1793800000000` must be run on every dev and QA database (`pnpm migration:run`). Evidence at `9700bb2`: backend unit 222, e2e 155, web unit 190, mutation checks all caught; the Admin browser journeys need `SF_PG_CONTAINER`, `SF_PG_USER`, `SF_PG_DB`. Route registry is now 36 routes (`/admin/users`). Details: [ROLES-SCOPE](ROLES-SCOPE.md).

## Roles R3 review grants — 2026-10-31
R3 (`87736b2`, not yet pushed): an owner shares one frozen revision (and optionally one recorded result) with one named Reviewer by email; the Reviewer reads it at `/reviews` and `/reviews/:id`. Owner API: `/designs/:id/reviews`; Reviewer API: `/reviews/shared-with-me`, `/reviews/:id` behind the new `review.read` permission (Reviewer only, never Admin). Frozen at grant time, no notes, owner display name only. Migration `ReviewGrants1793900000000` must be run on every dev and QA database. Route registry is now 38. Evidence: backend unit 224, e2e 172, web unit 202, 26 deliberate breaks all caught; one existing test (M16.3 share link) clashed with my first wording on the share page and was fixed by rewording my text, not the test. Reviewer browser journeys need `SF_PG_CONTAINER`, `SF_PG_USER`, `SF_PG_DB`. Details: [ROLES-SCOPE](ROLES-SCOPE.md).

## Roles R4 reviewer feedback — 2026-10-31
R4 (`3db9068`, not yet pushed): one comment thread per review. A Reviewer writes plain-text comments (1 to 2,000 characters, 50 per review, replies and removed placeholders count), edits or removes their own; the owner replies and can never change a Reviewer's words; the owner keeps the thread after stopping, the Reviewer loses access at once. Migration `ReviewComments1794000000000` must be run on every dev and QA database. No new routes (registry stays 38). Evidence: backend unit 224, e2e 186, web unit 217, full Chrome regression 530 passed / 10 skipped / 0 failed, 35 deliberate breaks all caught. Two of my own R3 checks were narrowed (not weakened) because the Reviewer page now has a feedback panel with buttons. Details: [ROLES-SCOPE](ROLES-SCOPE.md).

## Roles R5.1 Instructor challenges — 2026-10-31
R5.1 is built and committed locally (not pushed). Instructors create, edit, publish, archive and duplicate challenges (`/instructor/challenges`); publishing measures the frozen starting design with the model; published challenges are frozen. Migration `Challenges1794100000000` must be run on every dev and QA database. Registry is now 40 routes. Verified in pieces (backend unit 226, e2e 205, web R5 unit 19, 38 deliberate breaks caught, 12 browser journeys) but **the full Chrome regression did not complete** (machine out of memory, Docker crashed at about test 226 of 552). Rerun it first. Details: [R5 scope](R5-INSTRUCTOR-SCOPE.md).

## R5.1 regression preflight — 2026-10-31
User authorized full regression. Codex restarted Docker Desktop; existing dev containers auto-started and became healthy. Free physical RAM measured499 MiB before recovery and545 MiB afterward (commit headroom12722 MiB). Prior run crashed around800 MiB free; no Chrome/test/API/build workload launched under this lower headroom. Ports3003/5003 unoccupied. Awaiting user to close unnecessary apps; none terminated by Codex. R5.1 remains awaiting full regression, no new passing evidence. No push/R5.2/AI work. No active code claims; documentation-only notes remain uncommitted.

## R5.1 full regression closure — 2026-10-31 (Codex)

Verified against compiled R5.1 code at HEAD ace6b64, existing production audit build, Chrome, one worker: **542 passed,10 skipped,0 failed (552 total),23.7 minutes**. Four projects:1024/1440 light/dark. Explicit SF_PG_CONTAINER=stressforge-m9-postgres, SF_PG_USER=sf_audit, SF_PG_DB=sf_m9_audit ensured all Admin/Reviewer/Instructor journeys ran. Audit API health200 with PostgreSQL/Redis up. Existing additive migrations were applied only to the disposable audit database. No rebuild, unit or e2e run was performed concurrently or repeated in this session; earlier individual/mutation evidence remains Claude's recorded evidence.

Skips: four @dev state cases because this used production web; six per-project library/100-note cases skipped by the existing test conditions (the corresponding cases ran at1440-light). No skipped role/Instructor journeys. Full log: docs/audit/r51-2026-10-31/chrome-regression.txt. This closes the previously missing full Chrome gate for R5.1; R5.2/R5.3 remain separate pending work.

Preservation/cleanup:117 pre-existing PNGs restored from pre-run copies; protected M2 SHA256 remains D0EDB982C694CF1983FFE36FAAC2F7C80ED77AC1A735852F03013E6C4A2F76DC and unstaged. New images created by the tests may remain untracked. No source changes. Audit API/web sessions and m9 containers stopped after testing; volumes retained. Development containers were stopped to free RAM and remain stopped. AI stayed disabled; no paid usage, commits or pushes. Verification notes/evidence are left uncommitted. No active code claims.
## R5.2 planning checkpoint — 2026-10-31
User approved committing R5.1 verification and preparing R5.2 scope/tests. R5.1 evidence committed015e19a, not pushed. Detailed proposal: R5.2-LEARNER-SCOPE.md. Planning only; no implementation started, no active code claims. AI parked. Review one-resumable-attempt, archived submissions, technical-failure cap and best-result rules before implementation.

## R5.2 implementation claim — 2026-10-31
Approved by user. Codex claims learner attempt/submission contracts, challenges learner backend, additive migration, learner screens/tests and generated contracts. No overlapping active Claude claim reported. AI parked; unrelated dirty files preserved. Implementation in progress.

## R5.2 implementation checkpoint — 2026-10-31
Partial backend groundwork written: attempts.schema.ts, additive ChallengeAttempts1794200000000 migration, learner-challenges.service.ts, judge-challenge.ts and two specs.15 focused tests passed; deliberate AND→OR judging mutation failed a boundary test and was restored; backend tsc then passed. Initial incorrect validation.valid field was corrected to validation.ok; design DTO now reuses DesignsService.dto. No migration applied. Learner service is deliberately NOT registered and has no controllers yet. No generated contracts, learner UI, progress aggregation, seed or browser acceptance implemented. Remaining lifecycle/resource/retention and full integration acceptance are open; this is not a completed R5.2 slice. All six new backend files and this note remain uncommitted; existing unrelated work preserved. No active file claims after this checkpoint; resume the approved R5.2 objective from here. AI parked; no pushes.

R5.2 resumed under existing approval: Codex claims learner service/controllers/contracts, migrations, learner UI/tests and generated files. No AI work or overlapping agent claim. Implementation active.

## R5.2 complete — 2026-11-01
Learner challenge loop built and verified (see R5.2-LEARNER-SCOPE.md "R5.2 result"). Committed locally, not pushed. Next: R5.3.

## R5.3 complete — 2026-11-01
Instructor submissions and one-way feedback built and verified (see R5-INSTRUCTOR-SCOPE.md "R5.3 result"). The R5 Instructor track is complete. Committed locally, not pushed. Next: AI work (M12 / Groq) on the user's go-ahead.

## Phase 4/5 P1 complete — 2026-11-01
Decisions in [PHASE-4-5-SCOPE](PHASE-4-5-SCOPE.md) approved. P1 (honest public pages: how-it-works, about, privacy, terms) built and verified, committed locally. Next: P4 settings. When P4 adds export or delete, the P1 privacy test will fail until the privacy text is updated.

## Phase 4/5 P4 complete — 2026-11-01
Settings (profile, password change that ends other sessions, export, account deletion, appearance) built and verified, committed locally. See [PHASE-4-5-SCOPE](PHASE-4-5-SCOPE.md) "P4 result". Needs `pnpm migration:run` (AccountSelfService). Open: `pnpm fixtures:phase2` byte-drift on this Node version (see the scope doc). Next: P2 Learn.

## Phase 4/5 P2 Learn scope — 2026-11-01
Scope proposed in [P2-LEARN-SCOPE](P2-LEARN-SCOPE.md): eight topics with one demo and a two-question check each, demos tied to the simulator by generated fixtures, progress in the browser. Awaiting the user's decisions; nothing built.

## P2 Learn commit one — 2026-11-01
All nine P2 decisions approved. Shared demo model, engine-generated fixtures and parity tests built ([P2-LEARN-SCOPE](P2-LEARN-SCOPE.md) "Commit one result"). Cause of the older fixtures:phase2 byte-drift identified: V8 Math.pow last-digit differences between processes. Next: pages, demos, checks, progress (commit two).

## Phase 4/5 P2 Learn complete — 2026-11-01
Eight concept pages with live demos, checks and local progress built and verified ([P2-LEARN-SCOPE](P2-LEARN-SCOPE.md) "Commit two result"). Also fixed: route checks accepted inherited names like `constructor` for settings, learn and evaluation. Committed locally. Next: P3 examples, templates and components.

## Phase 4/5 P3 scope — 2026-11-01
P2 Learn pushed (`90faeae`). Scope proposed in [P3-EXAMPLES-SCOPE](P3-EXAMPLES-SCOPE.md): `/examples` (public, six read-only examples with breaking points and a precomputed load explorer), `/templates` (library with derived tags) and `/components` (catalog and traffic presets), all from engine-generated static data. Ten decisions await the user; nothing built.

## P3 commit one — 2026-11-01
All ten P3 decisions approved. Engine-generated data file for the examples, templates and components pages, with a freshness spec, built ([P3-EXAMPLES-SCOPE](P3-EXAMPLES-SCOPE.md) "Commit one result"). If the engine or templates change, run `pnpm fixtures:examples` and commit the result. Next: the three pages (commit two).

## Phase 4/5 P3 complete — 2026-11-01
`/examples`, `/templates` and `/components` built and verified from engine-generated data ([P3-EXAMPLES-SCOPE](P3-EXAMPLES-SCOPE.md) "Commit two result"). Committed locally. After any change to templates, the catalog or the engine, run `pnpm fixtures:examples` (and `pnpm fixtures:learn`). Next: P5 evaluation, then P6 welcome and progress.

## Phase 4/5 P5 scope — 2026-11-01
P3 pushed (`44e0c15`). Scope proposed in [P5-EVALUATION-SCOPE](P5-EVALUATION-SCOPE.md): Simulator tab with an exact-textbook (Erlang C) comparison, port-fidelity numbers and consistency checks, all engine-generated; Calibration "not yet measured" with the method; AI "parked, not evaluated". Preliminary finding: the engine's multi-server waiting formula overestimates small waits in relative terms (worst relative error 15.2% where the wait is at least 20% of service time; largest absolute gap 0.034 service times). Ten decisions await the user; nothing built.

## P5 commit one — 2026-11-01
All ten P5 decisions approved. Engine-generated evaluation evidence (exact Erlang C comparison, port fidelity, consistency checks) with a freshness spec built ([P5-EVALUATION-SCOPE](P5-EVALUATION-SCOPE.md) "Commit one result"). After any engine change run `pnpm fixtures:evaluation`. Next: the three Evaluation tabs (commit two).

## P5 complete — 2026-11-01
The three Evaluation tabs are built and verified ([P5-EVALUATION-SCOPE](P5-EVALUATION-SCOPE.md) "Commit two result"); `/evaluation/*` is now public. Committed locally, not pushed (ahead of origin by the P5 scope doc and both P5 commits). One non-reproducing failure in `r1-roles.spec.ts` during the full run is noted there. Your review of the Simulator and Calibration wording is pending. Next: P6 welcome tour and `/progress` concepts.

## P6 Welcome tour — 2026-11-01
All nine P6 decisions approved. `/welcome` built: three-step tour, one-time sample design, new registrations land there unless they asked for a page ([P6-WELCOME-PROGRESS-SCOPE](P6-WELCOME-PROGRESS-SCOPE.md)). Four older browser tests got `?next=%2Fdashboard` on their register URL. Next: Progress concepts (commit two).

## P6 complete — 2026-11-01
Progress concepts built and verified ([P6-WELCOME-PROGRESS-SCOPE](P6-WELCOME-PROGRESS-SCOPE.md) "Commit two result"); the last non-AI slice of Phase 4/5 is done. Committed locally, not pushed (ahead of origin by the P6 scope doc and both P6 commits). Open: your review of the P2 lesson, P5 claims and P6 wording; the About page's GitHub link; stale line in the Help drawer ("Concept pages arrive in phase 4").

## Wording review and dev database — 2026-11-01
The user reviewed the P2 lesson wording, the P5 claims about the model (Simulator, Calibration, AI) and the P6 tour wording and said "all good" (P5 decision 9 and P6 decision 9 are met). The user also confirmed the dev database is up to date with the account-deletion migration. All non-AI slices (P1 to P6) are built, verified and pushed. Open: the About page's GitHub link (keep or remove), and the next major piece: the real calibration experiment or the parked AI work.

## Calibration scope — 2026-11-01
Scope proposed in [CALIBRATION-SCOPE](CALIBRATION-SCOPE.md): compare the engine's predictions with a purpose-written Node service under an open-loop stepped load, with the model fitted on a subset of steps and compared on the held-out ones, three repeats, no pass mark, expectations committed before measuring. Ten decisions await the user; nothing built.

## Calibration commit one — 2026-11-01
All ten calibration decisions approved. The load generator and its validation against fake servers with a known latency are built in the new top-level `calibration/` folder ([CALIBRATION-SCOPE](CALIBRATION-SCOPE.md) "Commit one result"). Two refinements to the scope are recorded there (spinning instead of timers because the Windows timer ticks every 15.5 ms; Poisson arrivals by default). Run the checks with `pnpm test` inside `calibration/` with the machine otherwise quiet. Next: the service under test, the stepped runs and the analysis (commit two).

## Calibration commit two — 2026-11-01
The calibration runs are done and analysed; findings are in [CALIBRATION-FINDINGS](CALIBRATION-FINDINGS.md) (read the dated correction in [CALIBRATION-EXPECTATIONS](CALIBRATION-EXPECTATIONS.md) with it). The Calibration tab still says "Not yet measured": the page, its data file and spec are commit three and wait for the user to read the findings. Docker Desktop, WSL, the Codex app and my audit servers were closed to free memory for the runs; start Docker again for the dev database (Postgres will run crash recovery, the data is on disk).

## Calibration complete — 2026-11-01
The Calibration tab shows the first comparison with a real running service ([CALIBRATION-SCOPE](CALIBRATION-SCOPE.md) "Commit three result"; [CALIBRATION-FINDINGS](CALIBRATION-FINDINGS.md)). After any engine change that alters predictions, run `pnpm calibration:analyze` in the API and re-read the findings (the stored analysis and the page data are checked by a spec). Open: the How it works sentence "Has it been compared with reality? Not yet" and its two pinning tests (waiting for the user); the About page GitHub link; the parked AI work. Docker Desktop is running again (the dev containers restarted with it).

## AI resumed for scoping — 2026-11-01
The user chose Groq free tier with `gpt-oss-20b` and said to proceed. Scope proposed in [AI-RESUME-SCOPE](AI-RESUME-SCOPE.md) (M12B only; ten decisions await the user; nothing built or enabled). The Codex draft `groq.provider.ts` and its spec, `GROQ-IMPLEMENTATION-ROADMAP.md` and `M12-EXPLANATION-SCOPE.md` are still uncommitted and are not mine; the scope proposes reviewing and adopting the draft with tests.

## AI commit one — 2026-11-01
All ten AI resume decisions approved. Provider interface, Ollama adapter, reviewed Groq adapter, settings and tests are built ([AI-RESUME-SCOPE](AI-RESUME-SCOPE.md) "Commit one result"). AI is still off (`AI_ENABLED=false`, provider `ollama`) and no hosted call has been made. The user created a free Groq account and reported the limits (30 requests a minute, 1,000 a day, 8,000 tokens a minute, 200,000 a day); the key is not yet in `.env` and Zero Data Retention for inference was still off at the last check. Next: quota, concurrency, provenance and the hosted-data wording (commit two).

## AI commit two — 2026-11-01
Quota guard, provenance and the hosted-data wording are built and verified ([AI-RESUME-SCOPE](AI-RESUME-SCOPE.md) "Commit two result"). Groq side is ready: free account (no card), Inference APIs ZDR on, limits confirmed, key in the backend `.env`. AI is still off by default and **no hosted call has been made**. Next: the rule-based baseline and the evaluation harness (commit three); the live run needs the user's explicit go.

## AI commit three — 2026-11-01
Rule-based baseline, the eight benchmark cases and the evaluation harness (gate arithmetic, blind review sheet) are built and tested with fake providers ([AI-RESUME-SCOPE](AI-RESUME-SCOPE.md) "Commit three result"). **No model has been called.** Next: the live gate run (commit four), which needs the user's explicit go.

## AI commit four, part one — 2026-11-01
Live-run tooling is ready and tested offline: written rubric ([AI-GATE-RUBRIC](AI-GATE-RUBRIC.md)), pacer, `pnpm ai:gate` (run/sheet/score). **No Groq request has been made.** Next: the live run of `gpt-oss-20b`, which needs the user's explicit go.

## AI live gate, gpt-oss-20b — 2026-11-01: first run INVALID (harness error); diagnostic 2026-11-02: 0 of 18 accepted, all for citing 4 evidence ids (limit 3)
18 requests: 7 accepted, 11 rejected as invalid output (reasons not retained), 0 rate limited, slowest 1.4 s. Fails the 17-of-18 bar regardless of judging. AI remains off. See [AI-RESUME-SCOPE](AI-RESUME-SCOPE.md) "Commit four, part two". Next is the user's choice: diagnose the rejections, try `gpt-oss-120b`, or rely on the rule-based baseline.
See [AI-RESUME-SCOPE](AI-RESUME-SCOPE.md) "Correction and diagnostic". The user chooses: accept NO-GO, a declared run 2 with one stated change, or the 120b comparison. AI stays off.

## AI decision — 2026-11-02
**NO-GO accepted** for `gpt-oss-20b` (0 of 18). AI stays off and unreleased; the code groundwork is kept; no AI tab is built. Open for the owner: show the rule-based summary in the UI or not; whether to commit Codex's two roadmap docs; whether to push the local commits.

## AI Design Copilot P1 — 2026-11-02
Groundwork built and tested, no model called, all switches off: structured task path on the Groq adapter, `AiTaskService`, `ai_task_calls`, design source `ai`, `AI_FEATURES`, quota turn-taking. See [AI-COPILOT-SCOPE](AI-COPILOT-SCOPE.md) "P1 result". **Pending for the owner: run `pnpm migration:run` on the development database.** Next: P2, F1 describe-to-design.

## AI Design Copilot P2 — 2026-11-02
Describe-to-design is built end to end (backend, page, gate tooling, tests) with the task switched off by default. **No Groq request has been sent in P2.** See [AI-COPILOT-SCOPE](AI-COPILOT-SCOPE.md) "P2 result" and [AI-DESCRIBE-GATE-RUBRIC](AI-DESCRIBE-GATE-RUBRIC.md). Pending for the owner: run `pnpm migration:run` on the development database, and say go for the live gate (20 requests).

## F1 live gate, run 1 — 2026-11-02: NO-GO
`gpt-oss-20b`, 20 prompts: 13 accepted, 7 refused (5 from my own validation rejecting numbers the prompt said were ignored, 2 from a too-literal figure rule), and **all 3 injection prompts obeyed**. F1 stays switched off. See [AI-COPILOT-SCOPE](AI-COPILOT-SCOPE.md) "F1 live gate, run 1". The owner chooses: accept NO-GO, or a declared run 2.

## AI Copilot decision — 2026-11-02
**NO-GO accepted for F1.** The describe task stays off; code kept as unused groundwork. Open for the owner: run `pnpm migration:run` (not urgent), push the four local commits, and choose the next piece (recommended: F2 deterministic core, which needs no model).

## AI Copilot F2 core — 2026-11-02: built, no AI
Verified fix suggestions are live on the Results tab for any run that does not pass: the server tries edits at the bottleneck, re-runs the model on each, and offers the ones that help, with the model's before and after. No model, key, quota or migration. See [AI-COPILOT-SCOPE](AI-COPILOT-SCOPE.md) "F2 core result". Full Chrome regression 870 passed, 10 skipped by design, 0 failed. Open: whether to build F2's AI intent layer (recommended: no), F3, or a different next piece.
