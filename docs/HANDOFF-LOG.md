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
