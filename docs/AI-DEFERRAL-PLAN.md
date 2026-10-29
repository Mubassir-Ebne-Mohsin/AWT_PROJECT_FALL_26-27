# AI deferral plan: keep AI pending, keep building

Decided by the user: 2026-10-29 (Asia/Dhaka). **AI integration is parked until the user has planned it.** No agent extends AI work, picks a provider, enables inference or starts M13/M14/M12B without an explicit instruction. Everything else continues. AI stays central to the course, so this is a pause with a review point, not a cancellation.

## Where AI stands today (frozen, all off by default)

| Piece | State |
| --- | --- |
| M10 local-model feasibility | NO-GO for the tested local models |
| M11 backend (jobs, readiness, memory guards, versions) | Committed locally. `AI_ENABLED=false` by default |
| M12A explanation (grounding, evidence endpoint, typed claims, drawer UI) | Provider-independent. Hidden unless the backend reports AI enabled |
| Hosted provider (Groq) | Research and a prototype transport exist. Not enabled, no key, not integrated |
| M12B real-model gate, M13 fix suggestions, M14 drafting, M17 evaluation | Not started. They need your decisions first |

## Why deferring is safe (the separation, checked in the code)

- **Backend:** AI is one optional module (`AiModule`) registered in `app.module.ts`, with its routes documented separately in the phase 3 contract. With `AI_ENABLED` unset, jobs are refused and core saving, simulation and health work. An e2e test covers this. Design versions are core data and live in `version.schema.ts`, not in an AI file, so History, Restore and Compare never depend on AI code.
- **Frontend:** only two files touch AI code outside the AI files themselves: `workspace.tsx` (the Explain trigger) and `ai-panel.tsx` (the drawer). Nothing AI-related renders unless `GET /ai/readiness` reports `enabled: true`. AI request failures use a local error scope and can never open a global error screen.
- **Contracts:** AI types are generated separately (`phase3` contract and types). Core `phase2` contracts are untouched by AI work.
- **Data:** the only AI table is `ai_jobs` (plus the version table that History needs anyway). Dropping the AI module would not affect designs, runs or users.

## Rules while AI is parked (both agents)

1. Do not add features to `modules/ai`, `explain-*`, `groq.provider*` or the AI contracts. Bug fixes and keeping the tests green are fine.
2. Non-AI code must not import from `modules/ai` or `explain-*`. Add shared data to a neutral module instead (as done for versions).
3. Do not set `AI_ENABLED=true`, create provider keys, download models or call a hosted model.
4. New screens must work completely with AI off. Do not add placeholder AI buttons.
5. Keep generated contract files and tests current if they change for other reasons.
6. Record any AI-related finding in the handoff log instead of acting on it.

## What proceeds meanwhile (none of it needs AI)

| Order | Milestone | Status |
| --- | --- | --- |
| 1 | M15 History, Restore, Notes, Compare, Designs list | Plan written: [M15 scope](M15-HISTORY-COMPARE-NOTES-SCOPE.md). Waiting for your decisions |
| 2 | M16 Report and read-only sharing | Not scoped yet |
| 3 | Roles (Instructor, Reviewer, Admin) | Planning only. Needs design decisions |
| 4 | Phase 4 and 5 pages (public, learning, evaluation, settings) | Placeholders today |

Building M15 first also helps AI later: suggested fixes (M13) will reuse versions, restore and compare, and M15's honest-comparison rule is what makes any "this change improved things" claim checkable.

## Switching AI on later (checklist)

1. **You decide:** local Ollama, hosted Groq, or both. Local needs free memory and a model that passes the evaluation. Hosted needs a free account, a server-side key and your acceptance that data leaves the machine.
2. **Backend only:** set `AI_ENABLED=true` and the provider settings in the backend `.env`. No frontend rebuild is needed; the Explain button appears when readiness reports enabled.
3. **Finish the provider work:** provider abstraction and quota handling (Groq roadmap G2 and G3) if you choose hosted.
4. **Pass the real-model gate** (M12B): the eight M10 cases, three generations each, with the written rubric. Mock-only tests never close the milestone.
5. Only then ask for M13 and M14, each with its own approval.

## Review point

AI is required for the course, so revisit this plan after M15 or when you have finished your own AI plan, whichever is first. Suggested: confirm a date here so the pause does not become a silent cancellation. Date to be set by the user: ____.

## Maintenance

Update this file and [PROJECT-STATE.md](PROJECT-STATE.md) when AI is resumed, with the decisions made.
