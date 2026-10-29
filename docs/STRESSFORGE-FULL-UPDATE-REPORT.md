# StressForge: full update report, Phase 1 to the last phase

Date: 2026-10-29. Branch: `codex/phase2-contracts`. Prepared by Claude Code from the project's own plans, state board and evidence. This is a summary; the [living progress report](STRESSFORGE-PROGRESS-REPORT.md) remains the detailed record, and anything marked **not verified** has not been proven yet.

## 1. At a glance

| Phase | Name | Status |
| --- | --- | --- |
| 1 | Foundation | **Complete.** Published on GitHub `main` (`9e8bb00`) |
| 2 | Core loop (M1 to M9) | **Complete.** Published |
| 3 | Improve and history (M10 to M17) | **Partly done.** Non-AI work finished through M15; M16 in progress; AI work parked by the user |
| 4 | Public and learning pages | Placeholders only. A landing page exists as uncommitted work that is not Claude's |
| 5 | Evaluation, settings, onboarding and developer screens | Placeholders only |
| Roles | Instructor, Reviewer, Admin | Planning only. No implementation |

Everything after Phase 2 is committed locally and **not pushed**. Nothing has been pushed, merged or deployed without your instruction.

## 2. Phase 1: Foundation (complete)

- NestJS backend with validated configuration, real JWT authentication with rotating refresh cookies, users, health checks and a standard error contract.
- Next.js frontend: application shell, a registry of 35 routes, system states (error, offline, not found, rate limited, session expired), sign-in and registration screens, light and dark themes, drawers and a command palette.
- Ten boilerplate fixes and a review that found 14 issues (refresh-token revocation, logout failure handling, dependency advisories, 401 and 429 handling, duplicate registration returning 500, drawer focus, test type-checking, Redis password and secret validation, and others). All were remediated and re-verified on 2026-10-23.

## 3. Phase 2: Core loop, M1 to M9 (complete)

| Step | What it delivered |
| --- | --- |
| M0 Freeze foundation | Phase 1 committed and published as an immutable baseline |
| M1 Contracts and fixtures | Frozen schemas, bounds, versions, error codes and full-precision reference fixtures |
| M2 Engine and worker | The simulation engine, run in a bounded worker with timeout and crash handling |
| M3 Saved designs | Owned designs with revisions, safe saves and a reliable simulation lifecycle |
| M4 Creation and dashboard | Blank, six templates, JSON import and scripted drafting; dashboard cards; confirmed delete |
| M5 Canvas | All 12 component types, move, zoom, pan, properties and keyboard alternatives |
| M6 Connections and save safety | Arrows, undo and redo, and recovery from slow saves, conflicts, outages and two tabs |
| M7 Traffic and results | Traffic presets and settings; verdict, percentiles, errors, throughput, utilisation and paths |
| M8 Limits and live preview | A breaking-point search and a debounced live overlay |
| M9 Acceptance | Full verification and closure; one historical benchmark exception was accepted by you |

## 4. Phase 3: Improve and history (partly done)

Phase 3 was planned as AI first, then history and sharing. You parked the AI work on 2026-10-29, so the non-AI milestones went ahead.

| Milestone | Status | Notes |
| --- | --- | --- |
| M10 Local-model feasibility | **NO-GO** for the tested models | Wrong answers and memory exhaustion on this laptop |
| M11 AI backend foundation | Done, local only | Jobs, readiness checks, memory guards. AI is **off by default** |
| M12A Explanation UI and grounding | Built, **parked** | Hidden unless the backend turns AI on |
| M12B Real-model acceptance | **Parked** | Direction recorded: a Groq free-plan provider |
| M13, M14, M17 (AI fixes, drafting, evaluation) | Not started | Need the M12 real-model gate first |
| M15 History, Restore, Notes, Compare, Designs list | **Done** | Details below |
| M16 Reports and sharing | **In progress** | Details below |

**M15 (done):**
- History timeline of every saved version; Restore saves old content as a **new** revision and never edits history.
- Notes for decisions and assumptions (2,000 characters, 100 per design), tied to a revision number.
- Compare two versions of one design; the server decides whether the results can honestly be compared.
- A Designs list with search, sort, filters, paging, duplicate, and reversible archive that keeps all evidence.

**M16 (in progress):**

| Slice | Status |
| --- | --- |
| M16.1 Report data (backend) | Committed (`eea8349`), tested |
| M16.1 Report page and print layout (web) | Built and tested, **not committed yet** (waiting on the full regression) |
| M16.2 Share links (backend) | Code written. **Not yet tested** |
| M16.3 Share settings page and public viewer | **Not started** |

## 5. Phases 4 and 5 (placeholders)

Phase 4 (public and learning pages) and Phase 5 (evaluation, settings, onboarding, developer screens) exist only as placeholder routes. A landing page and a film folder exist as uncommitted work that Claude did not write and does not touch.

## 6. The four users

| Role | Purpose | Today |
| --- | --- | --- |
| **User** | Create and explore architectures; manage own designs, run tests, share a design | **Implemented** |
| **Admin** | Maintain the platform: accounts, role assignments, configuration | The role identifier exists in the code, but **no admin screens exist** |
| **Instructor** | Publish challenges and example designs; see submissions explicitly shared with them | **Planned only** |
| **Reviewer** | See explicitly shared designs and results; add comments; cannot edit the owner's graph | **Planned only** |

Rules already agreed for the role work:
- Registration can never grant a privileged role. Roles are assigned and checked on the server.
- Holding the Instructor or Reviewer role grants **no** access to anyone's private design. Access needs an explicit, scoped grant from the owner.
- Feedback must name the revision it reviewed, and later edits cannot silently change that context.
- A faculty member may be both Instructor and Reviewer, so the design must allow more than one role per account instead of a simple chain.

**Important distinction:** the M16 share links are anonymous, read-only snapshot links. They are not the Reviewer system. The grant-based review flow with feedback is a separate later track.

Planned order for the role work: permission foundations, shared review, Instructor activities, then minimal Admin tools.

## 6a. Modifications to the original plan

| Change | Why |
| --- | --- |
| AI integration parked; `AI_ENABLED` stays false and the UI shows no AI | You are still planning the AI approach. The product works without it |
| Phase 3 reordered: non-AI milestones first | AI is deferred, and the rest should not wait |
| AI provider direction recorded as Groq (free plan) | Local models failed M10. Not yet approved to run |
| M15 decisions fixed: restore is a new revision, compare covers one design, notes 2,000 characters and 100 per design, archive keeps evidence, history keeps the latest 100 versions | Approved by you on 2026-10-29 |
| M16 decisions fixed: pick revision and result, notes private by default (Decision notes optional), two link scopes, frozen snapshot, optional expiry (7, 30, 90 days or none), 5 active links per design, last-opened tracking only, no copy-to-account | Approved by you on 2026-10-29 |
| Report uses print and Save as PDF instead of a PDF export engine | An explicit simplification in the Phase 3 plan |
| Shared tracking files so Codex and Claude Code do not collide | `AGENTS.md`, `CLAUDE.md`, `docs/PROJECT-STATE.md`, `docs/HANDOFF-LOG.md` |

## 7. Current evidence

| Check | Result | Note |
| --- | --- | --- |
| Backend unit tests | 214 passed, 2 skipped | Run with 2 workers; the default parallel run fails some suites from machine load |
| Backend e2e | 116 of 116 passed, 9 suites | Before the share spec was added |
| Web unit tests | 168 of 168 | |
| Lint, typecheck, contract checks | Clean (0 lint errors) | 22 older lint warnings remain |
| Last full Chrome regression | 390 passed, 10 skipped, 0 failed | Run before M16 |
| Current full Chrome regression | **Running** (about 284 of 420 when last checked) | Includes the new report journeys |
| Share link tests (e2e) | **Not run** | Spec written, run held for memory |
| Mutation checks | Done for every finished slice | Each deliberate break made a test fail |

## 8. Open items and risks

1. **Migrations:** run `pnpm migration:run` on existing databases for VersionRestore, DesignNotes and DesignArchive, and DesignShares once M16.2 is verified.
2. **Uncommitted files that are not Claude's:** landing page, `film/`, `DESIGN.md`, the Groq provider, the Groq roadmap and the M12 scope doc. Codex should commit its own.
3. **Conflict to resolve:** the progress report holds a Codex note saying M12B is authorised, which contradicts AI being parked.
4. **Audit screenshots:** about 74 tracked `docs/audit/*.png` files are modified by test runs and are being left out of commits. `docs/audit/m2-profile-source.json` is protected and is never staged.
5. **Machine limits:** this laptop has 7.9 GB of RAM and ran out during M16. Windows and Docker needed a restart. Heavy test runs should not overlap.
6. **Known limitations:** the run-list cursor could skip two runs created in the same millisecond across a page boundary; rename from the Designs list is not offered; share and report data are only as good as the simplified queueing model, which the report states on its face.
7. **Local only:** M10 onward is not pushed. Pushing needs your explicit instruction.

## 9. What comes next

1. Finish the regression and commit the report page.
2. Run and fix the M16.2 share tests, then run mutation checks.
3. Build and test M16.3: the share settings page (create, copy once, revoke, last opened) and the public viewer.
4. Final regression and documentation for M16.
5. Then your choice: the role foundations (Instructor, Reviewer, Admin), the Phase 4 pages, or resuming AI when your plan is ready.
