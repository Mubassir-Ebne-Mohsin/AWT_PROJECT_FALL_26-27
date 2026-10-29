# Context for Codex: what Claude Code did on 2026-10-29

Read this first, then [AGENTS.md](../AGENTS.md), [PROJECT-STATE.md](PROJECT-STATE.md) and [HANDOFF-LOG.md](HANDOFF-LOG.md). This file is a snapshot written at the end of a long Claude Code session. If it disagrees with git or the state board, trust git and the state board, and tell the user.

**Branch:** `codex/phase2-contracts`. **Last pushed commit:** `1fcf7c1` (pushed to `origin/codex/phase2-contracts` by the user's explicit instruction). Anything newer is local only.
**Owner:** one user (Mubassir). The user decides scope. Do not start a milestone without their approval.

## 1. One-paragraph summary

Today Claude Code finished the whole of **M15** (History, Restore, Notes, Compare, Designs list) and built **M16** (printable Report and read-only Share links). AI work stayed **parked** by the user. The M16 backend and the report page are committed and pushed. The M16.3 web slice (share settings page and public viewer) passed its final full Chrome regression (434 passed, 10 skipped, 0 failed) and is committed locally; check `git log` for its hash and `git status -sb` to see whether it has been pushed.

## 2. What was done, in order

| Milestone | Commits | State |
| --- | --- | --- |
| M11 AI backend foundation | `11f6a2a`, `d9678f5`, `7cf8799` | Done. AI is off by default |
| M12A explanation UI and grounding | `fe5c01a`, `4ad4481`, `4aa48c1` | Done and **parked**. UI hidden unless the backend enables AI |
| Shared tracking files | `43d8a16`, `19e8468` | `AGENTS.md`, `CLAUDE.md`, `PROJECT-STATE.md`, `HANDOFF-LOG.md`, AI deferral plan, M15 scope |
| M15.1 History, M15.2 Restore | `0570294`, `7f6ed8d`, `b7dcb33` | Done |
| M15.3 Notes | `f5d8ab0`, `bed8280` | Done |
| M15.4 Compare | `d4f5496`, `534171d` | Done |
| M15.5 Designs list | `a45b0ec` (API), `e7158ab` (web), `1cb47bc` (docs) | Done |
| M16 scope and decisions | `bdff398` | Seven decisions approved by the user |
| M16.1 Report | `eea8349` (API), `ca2fd2a` (web + full update report) | Done |
| M16.2 Share API | `1fcf7c1` | Done, pushed |
| M16.3 Share settings and viewer | committed after the final regression (see `git log`) | Done |

## 3. What each M16 piece is (so you do not rebuild it)

- **Report** (`GET /v1/designs/:id/report?revision&run`): one assembler, `report.service.ts`, builds a document for one revision and one run. It reads the retained version snapshot, never the live design, for earlier revisions. It states whether Limits was run, flags a run recorded for a different revision (`matchesRevision`), and lists model limitations. Web: `/designs/:id/report` with a revision and result picker and print CSS (`web/src/styles/m16.css`).
- **Share links** (`design-shares.service.ts`, table `design_shares`, migration `1793600000000-DesignShares`):
  - Secret = 32 random bytes in base64url (exactly 43 characters). Shown once. Only a SHA-256 hash is stored.
  - A link stores a **frozen copy** of the report. Later edits and notes never appear.
  - Scopes: `design` (graph and traffic only) or `design_report` (plus result, Limits disclosure, optional Decision notes). Assumption notes are never shared.
  - Expiry 7, 30, 90 days or none. At most 5 active links per design (checked under a design row lock).
  - Owner routes: `POST/GET /v1/designs/:id/shares`, `POST /v1/designs/:id/shares/:shareId/revoke`.
  - Public route: `POST /v1/shares/open` with the token in the **body** (never the URL, so logs cannot record it). One atomic UPDATE validates (not revoked, not expired) and counts the open. Unknown, expired, revoked and malformed tokens all return the same 404. Responses carry `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`.
  - Public view omits owner details and the internal design id.
- **Web share screens:** `/designs/:id/share` (create, copy once, revoke with confirmation, last opened, 5-link limit) and `/share/:token` (read-only viewer, signed-out friendly, noindex, no-referrer, prints cleanly). The viewer reuses `ReportDocument` with a `designOnly` mode.
- **Not in M16 by decision:** "copy to your account". The share links are **not** the Reviewer or Instructor system.

## 4. Evidence at the time of writing

| Check | Result |
| --- | --- |
| Backend unit | 214 passed, 2 skipped (run with `--maxWorkers=2`; the default parallel run fails some suites on this laptop from memory pressure) |
| Backend e2e | **130 of 130**, 10 suites (includes 7 report and 14 share tests) |
| Backend lint, tsc, contract checks | 0 errors, clean, identical |
| Web unit | 173 of 173 |
| M16 browser specs | report 20 of 20, share 24 of 24 (5 and 6 journeys across 4 projects) |
| Last full Chrome regression that passed fully | 410 passed, 10 skipped, 0 failed (before M16.3) |
| Latest full regression with M16.3 | first run: 430 passed, 10 skipped, **4 failed**, all one existing test (see below). Second run on the fixed build: **434 passed, 10 skipped, 0 failed** |
| Mutation checks | Done for every slice. Each deliberate break made a test fail. Compile-failing mutations ("0 total") do not count and were redone |

**The one failure and its fix:** the existing route audit in `web/tests/browser/phase1.spec.ts` ("35 registry routes") visits `/share/frontend-audit-share` (a 20-character sample). The first viewer accepted 20 to 128 characters, so it called the API, got a 404, and logged a console error. The fix was in `web/src/lib/share-presentation.ts`: a real token is exactly 43 characters, so `looksLikeToken` now requires exactly 43. **The existing test was not changed or weakened.** If you ever see that test fail on a share route, check that rule first.

## 5. Standing rules from the user (they still apply)

- `docs/audit/m2-profile-source.json`: preserve exactly. **Never stage, commit or revert it.** Check it is not staged before every commit.
- Never read, print, log or copy values from `.env` files.
- No push, merge, deploy or remote or global Git changes without the user's explicit instruction. (The user explicitly asked for one push today; it is done. Push again only if asked.)
- No destructive operations on user data. Do not weaken or delete an existing test to make something pass; if a test looks wrong, tell the user and wait.
- A green suite is not enough: confirm tests would fail if the feature were broken (mutation checks).
- Keep GateGuard enabled (it asks for facts before creating a new file; state them and retry).
- **AI is parked** (`docs/AI-DEFERRAL-PLAN.md`): no AI feature work, no provider choice, `AI_ENABLED` stays false, no AI surface in new screens.
- Do not start the next milestone without approval.

## 6. Files that are not Claude's (do not stage them as part of someone else's commit)

Untracked and Codex-or-unknown origin: `web/src/components/landing/`, `web/src/styles/landing.css`, `film/`, `DESIGN.md`, `docs/LANDING-PAGE.md`, `docs/audit/landing/`, `nest-boilerplate/.../modules/ai/groq.provider.ts` and its spec, `docs/GROQ-IMPLEMENTATION-ROADMAP.md`, `docs/M12-EXPLANATION-SCOPE.md`. Locally modified and **not committed on purpose**: `web/src/app/page.tsx`, `web/src/components/shell/app-shell.tsx`, `web/src/lib/routes.ts` (landing page work) and about 74 tracked `docs/audit/*.png` files that test runs overwrite.

**Open conflict for you to resolve with the user:** the progress report contains a Codex note that "M12B is authorized", which contradicts the user's later decision that AI is parked. Please reconcile it and commit your own untracked files.

## 7. Operator notes

- **Migrations to run on any existing database** (`pnpm migration:run` in `nest-boilerplate/nest-boilerplate`): `VersionRestore`, `DesignNotes`, `DesignArchive`, `DesignShares`. All are additive.
- **Machine limits:** this laptop has about 7.9 GB RAM. During M16 it ran out of memory, Docker's WSL VM hung, and Windows needed a restart. Do not run unit tests, e2e, a Next build and a Playwright regression at the same time. The user's dev and QA containers (`stressforge-dev-*`, `sf-qa-p1-*`) were stopped on request to free memory; they auto-restart with Docker.
- **Audit stack Claude used** (local scratch, not in the repo): containers `stressforge-m8-postgres` (5551) and `stressforge-m8-redis` (6398); databases `sf_m8_audit` and the e2e database; API on port 5003 from compiled `dist` (stop it with the stop script, `pkill` does not see Windows processes); web production build on 3003. Browser tests ran with the system Chrome (`SF_BROWSER_CHANNEL=chrome`) because Playwright's bundled browser is not installed.
- **Tooling lesson:** long shell heredocs with mixed quotes failed; edit scripts were written as files in the session scratchpad and run with `node`. A new file triggers a GateGuard prompt.
- The user also installed the `find-skills` skill globally (`~/.claude/skills/find-skills`). It is not part of this repo.

## 8. Known limitations

- The run-list cursor is `createdAt`; two runs created in the same millisecond across a page boundary could be skipped.
- Rename from the Designs list is not offered (it would bump the revision; the workspace already renames).
- The share link secret cannot be shown again after creation, by design.
- The model is a simplified queueing model; every report says so.

## 9. Suggested next steps (the user chooses)

1. Nothing is pending for M16. Ask the user whether to push the M16.3 commit.
2. Role foundations (Instructor, Reviewer, Admin): needs design decisions first, see [PROJECT-PLAN.md](PROJECT-PLAN.md). Today only User is implemented; Admin has a role identifier but no screens.
3. Or Phase 4 public pages, or resuming AI when the user's plan is ready.

Fuller summary for the user: [STRESSFORGE-FULL-UPDATE-REPORT.md](STRESSFORGE-FULL-UPDATE-REPORT.md).
