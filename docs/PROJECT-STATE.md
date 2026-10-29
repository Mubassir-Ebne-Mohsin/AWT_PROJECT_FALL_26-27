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
| Roles (Instructor, Reviewer, Admin) | Planning only | Decisions needed first: [PROJECT-PLAN](PROJECT-PLAN.md) |
| Phase 4 / 5 (public, learning, evaluation, settings pages) | Placeholders | Landing page work exists, uncommitted (not Claude's) |

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
