# STRESSFORGE: rules for every coding agent (Codex, Claude Code, others)

Read this file, then [docs/PROJECT-STATE.md](docs/PROJECT-STATE.md), before touching anything. Both agents follow the same rules. `web/AGENTS.md` adds Next.js-specific rules for work under `web/`.

## Start of a session
1. Run `git status --short` and `git log --oneline -8`. The tree is often dirty with someone else's work.
2. Read PROJECT-STATE.md (what is done, claimed, blocked) and the newest entries of [docs/HANDOFF-LOG.md](docs/HANDOFF-LOG.md).
3. Add or check your row in **Active claims** in PROJECT-STATE.md before editing. If a file is claimed by the other agent, do not edit it; ask the user.

## Working rules
- **Never edit or reformat files you did not create or claim.** If a file changed on disk since you read it, treat it as another agent's work: re-read it, build on it, do not revert it. Say so in the handoff log.
- **Stage explicitly by path.** Never `git add -A` / `.`. Never stage `docs/audit/m2-profile-source.json`, `film/`, `DESIGN.md` or landing-page work unless the user says so. Check `git diff --cached --name-only` before every commit.
- **Small, logical commits** with accurate messages. Do not push, merge, deploy, change remotes or global Git settings without the user's explicit instruction.
- **Never read, print or copy `.env` values.** API keys live only in the backend `.env`, never in code, logs, docs or `NEXT_PUBLIC_*`.
- **Isolated test data.** Use dedicated, labelled containers and databases (for example `stressforge-<milestone>-postgres`, `sf_<milestone>_e2e`). Never reset or delete the user's data, volumes, or containers you did not create. Ports 3000/5001 and the `stressforge-dev-*` / `sf-qa-p1-*` containers belong to the user.
- **Evidence over claims.** A green suite is not enough: show the test fails when the feature is broken (mutation check). Record initial failures and fixes. Never weaken or delete an existing test to pass; if one is wrong, stop and tell the user.
- **Do not start the next milestone** without the user's approval. A milestone is complete only when every mandatory item is verified; otherwise report it partial.
- Keep hooks/gates (for example GateGuard) enabled. If one blocks a command, state the request and the exact command, then retry unchanged.
- Windows: edits may involve CRLF line endings. Preserve each file's existing line endings.

## AI work rules
- AI is **disabled by default** and must never silently fall back to a mock or another provider.
- The simulator stays the numerical authority. Facts, units and verdicts are computed by the server; models only phrase interpretation, and the server validates it.
- No paid services, paid upgrades or model downloads without the user's explicit approval. Hosted AI (Groq) uses the free plan only; the key is server-side only.
- Real-model quality gates in the milestone docs are binding. Mock-only tests never close an AI milestone.

## End of a session (mandatory)
1. Commit finished work in logical commits, or leave it clearly listed as uncommitted.
2. Update **docs/PROJECT-STATE.md** (status, claims, blockers, next step) and add an entry to **docs/HANDOFF-LOG.md**: what you did, commit hashes, tests run with results, uncommitted files, what the next agent should do.
3. Update the living report `docs/STRESSFORGE-PROGRESS-REPORT.md` when a milestone's status or evidence changes. Preserve history.
4. Release your claims.
