# STRESSFORGE project state (shared by Codex and Claude Code)

**AI integration is PARKED by the user (2026-10-29).** Read [AI-DEFERRAL-PLAN.md](AI-DEFERRAL-PLAN.md) first: no AI feature work, no provider choice, `AI_ENABLED` stays false. Non-AI milestones continue.

**Last updated:** 2026-10-29 by Claude Code. **Branch:** `codex/phase2-contracts`. **Last commit:** `fe5c01a`.
Rules: [AGENTS.md](../AGENTS.md). Session history: [HANDOFF-LOG.md](HANDOFF-LOG.md). Evidence and history: [living report](STRESSFORGE-PROGRESS-REPORT.md). Plans: [Phase 2](PHASE-2-PLAN.md), [Phase 3](PHASE-3-PLAN.md), [roles and future scope](PROJECT-PLAN.md).

Update this file at the end of every session. Keep it short; put detail in the handoff log and the report.

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
| M15 History / Compare / Notes | Plan written, **awaiting your decisions** ([scope](M15-HISTORY-COMPARE-NOTES-SCOPE.md)) | M11's immutable `design_versions` is the data foundation. Needs no AI. Next milestone to build |
| M16 Reports / Sharing | Not started, not approved | Needs no AI |
| Roles (Instructor, Reviewer, Admin) | Planning only | Decisions needed first: [PROJECT-PLAN](PROJECT-PLAN.md) |
| Phase 4 / 5 (public, learning, evaluation, settings pages) | Placeholders | Landing page work exists, uncommitted (not Claude's) |

## M12A detail (finished and parked)

- **Committed:** `fe5c01a` (verified facts, evidence endpoint, figure grounding), `4ad4481` (typed server-checked claims, server-rendered statements, version schemas split out of the AI file, prompt kept under the M11 500-character guard), `4aa48c1` (explanation drawer, scoped API errors, hidden unless the backend enables AI).
- **Evidence (final code):** backend unit 214 (2 opt-in skips), e2e 80/80, lint 0 errors, both contract checks identical; web unit 147, tsc and lint clean; M12 browser 36/36 (9 journeys x 4 projects); full Chrome regression 268/268 (landing and dev-only excluded). Mutation checks caught: claim check off, new request id per retry, earlier-revision guard, local error scope, AI-hidden gate.
- **Behaviour:** with the default `AI_ENABLED=false` the UI shows no AI at all. Switching AI on later is a backend setting; see [AI-DEFERRAL-PLAN](AI-DEFERRAL-PLAN.md).
- **Not done (parked by the user):** M12B real-model gate. Not Claude's, still uncommitted: `groq.provider.ts` and its spec, `GROQ-IMPLEMENTATION-ROADMAP.md`, `M12-EXPLANATION-SCOPE.md`. The report contains Codex checkpoints (one says M12B was authorized); this conflicts with the later "AI parked" decision and needs the user to reconcile.

## Active claims (edit only what you have claimed)

| Agent | Area / paths | Since | Status |
| --- | --- | --- | --- |
| Claude Code | M15 planning only (docs/M15-HISTORY-COMPARE-NOTES-SCOPE.md); M12A claim released | 2026-10-29 | Waiting for the user's M15 decisions |
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
