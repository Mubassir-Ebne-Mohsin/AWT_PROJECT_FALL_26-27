# STRESSFORGE project state (shared by Codex and Claude Code)

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
| M12A explanation UI and grounding | **In progress** | Backend committed (`fe5c01a`). Frontend written but **uncommitted and not browser-tested**. See below |
| M12B real-model acceptance | **Blocked** on the Groq key and gate | Approved direction: [Groq roadmap](GROQ-IMPLEMENTATION-ROADMAP.md) (free plan, GPT-OSS 20B first) |
| M13 AI fix suggestions, M14 AI drafting, M17 AI evaluation | Not started | Need M12 real-model gate first. Separate approvals |
| M15 History / Compare / Notes | Not started, not approved | M11's immutable `design_versions` is the data foundation. Needs no AI |
| M16 Reports / Sharing | Not started, not approved | Needs no AI |
| Roles (Instructor, Reviewer, Admin) | Planning only | Decisions needed first: [PROJECT-PLAN](PROJECT-PLAN.md) |
| Phase 4 / 5 (public, learning, evaluation, settings pages) | Placeholders | Landing page work exists, uncommitted (not Claude's) |

## M12A detail (the in-flight work)

- **Committed (`fe5c01a`):** versioned explanation contract, verified facts with explicit units, `GET /ai/jobs/:id/evidence`, grounding check for invented figures, legacy-artifact handling. Backend then: unit 206, e2e 79/79, lint 0 errors.
- **Uncommitted, written by Claude, unit-tested only:** scoped API errors (`client.ts`), `ai.ts`, `explain-session.ts`, `explain-store.ts`, `explain-panel.tsx`, `m12.css`, wiring in `workspace.tsx`, `ai-panel.tsx`, `run-links.ts`, `layout.tsx`, tests `client.test.cjs` and `m12.test.cjs`. Last run: web unit 142/142, tsc and lint clean.
- **Not done:** `web/tests/browser/m12.spec.ts` (planned journeys: AI disabled on the real API, facts vs interpretation, lost acknowledgement, cancel with resident runner, outages, late reply after navigation, unsaved edits, earlier revision, keyboard and 390 px). Full regression, report section, commits.
- **Not mine, unreviewed:** `grounding.ts` / `grounding.spec.ts` gained typed claim predicates (`claimIsSupported`) after `fe5c01a`. `groq.provider.ts` and its spec are new. Claude has not run or reviewed them.

## Active claims (edit only what you have claimed)

| Agent | Area / paths | Since | Status |
| --- | --- | --- | --- |
| Claude Code | M12A frontend: `web/src/lib/api/ai.ts`, `web/src/lib/explain-*.ts`, `web/src/components/workspace/explain-panel.tsx`, `web/src/styles/m12.css`, `web/tests/m12.test.cjs`, `web/tests/browser/m12.spec.ts`; edits to `client.ts`, `workspace.tsx`, `ai-panel.tsx`, `run-links.ts`, `layout.tsx` | 2026-10-29 | Paused by the user to plan strategy |
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
