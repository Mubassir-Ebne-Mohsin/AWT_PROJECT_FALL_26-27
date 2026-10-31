# Handoff for Codex, 2026-10-30

Branch `codex/phase2-contracts`, pushed, head `3f7dbc0`. Read this with AGENTS.md, CLAUDE.md, docs/PROJECT-STATE.md and docs/HANDOFF-LOG.md. Written by Claude Code at the user's request ("create me the list of todays progress so that codex can check and take it from here").

## Done today (newest first)

| Commit | What |
|---|---|
| `87736b2` | **R3 Review grants (added 2026-10-31, local, not pushed).** Migration `ReviewGrants1793900000000`. Owner API `/designs/:id/reviews` (create, list, revoke); Reviewer API `/reviews/shared-with-me` and `/reviews/:id` behind the new `review.read` permission (Reviewer only, never Admin). Frozen at grant time with no notes; the Reviewer sees the owner's display name only. Web: a reviewers section on the share-settings page, `/reviews` and `/reviews/:id` (route registry now 38; phase1.spec count updated on purpose), and a Reviewer-only menu link. Evidence: backend unit 224, e2e 172, web unit 202, 26 deliberate breaks all caught; the existing M16.3 test clashed with my first wording and I reworded mine, not the test. |
| `9700bb2` | **R2 Admin tools (added 2026-10-31, pushed).** Migration `AccountStatus1793800000000`: `users.account_status`, `users.sessions_revoked_at`; audit gains `suspend` and `restore`. `POST /admin/users/:id/suspend` and `/restore`, `GET /admin/users?q=`. Suspension blocks sign-in (after the password is right), refresh and live access tokens; a role removal or suspension ends refresh sessions (closes the R1 deviation). Self-suspend and last-working-Admin are refused. Web: `/admin/users` screen behind `RoleGate`; route registry is now 36 (phase1.spec count updated on purpose). Evidence: backend unit 222, e2e 155, web unit 190, 22 mutation breaks all caught; full browser run found a duplicate `h1` (fixed), affected specs rerun green. The Admin browser journeys need `SF_PG_CONTAINER`, `SF_PG_USER`, `SF_PG_DB`. |
| `3f7dbc0` | **R1 Roles foundations.** `user_roles` plus append-only `role_audit` (migration `AccountRoles1793700000000`), `@RequirePermission` and `PermissionGuard` (roles read from the DB on every call, never the token), `GET /account/roles`, Admin-only `/admin/users/lookup`, `/admin/users/:id/roles` (get, post, delete), `/admin/audit`, last-Admin protection, `pnpm admin:bootstrap -- --email=`, dev-only `pnpm seed:demo-roles`. Web: `useMyRoles`, `RoleGate`, roles line in the account menu. |
| `e5556b9` | docs/ROLES-SCOPE.md: roles plan, all ten decisions approved as recommended. |
| `ba93a83` | Landing page: radial "pressure core" story figure. |
| `72ab218` | Landing page redesign in the login palette, with smoothing, glow and interaction effects. |
| `5c2f700`, `1fcf7c1` | M16 share links, web and API (read-only, hashed token, frozen snapshot). |
| `ca2fd2a`, `eea8349` | M16 report, web and backend. |
| `bdff398` | M16 scope. |
| `e7158ab`, `1cb47bc` | M15.5 Designs list (web) and docs. |

Also: the "Something broke on our side" error was a dev database missing migrations, fixed by `pnpm migration:run` on the user's dev DB.

## Verified at `3f7dbc0`

Backend unit 222 (2 skipped), backend e2e 143, web unit 180, Chrome regression 494 passed / 10 skipped / 0 failed (4 projects). R1: 11 backend and 4 web deliberate breaks, each failed a test. Frozen phase 2 contract unchanged.

## Please check

1. Run `pnpm migration:run` on any dev or QA database before running the new code, then `pnpm admin:bootstrap -- --email=<account>` once.
2. Legacy `Role` enum and ranked `RolesGuard` are deliberately untouched (existing tests pin them); `users.role = 'admin'` is read through into the new model and cleared on Admin revoke.
3. Deviation: a revoked Admin is refused at once on admin endpoints, but their refresh session is not revoked until R2.
4. `docs/PROJECT-STATE.md` and `docs/HANDOFF-LOG.md` have uncommitted edits that are not Claude's; R1 is not yet recorded in them. Add it when you commit them.

## Next

- R2 is done (see the table). **R3 review grants** is done (see the table); **R4 reviewer comments** is next, then R5 Instructor (docs/ROLES-SCOPE.md, decision 10). Do not start those in parallel.

## Open items

- Your note "M12B authorized" conflicts with AI being parked; clarify with the user.
- About 74 audit PNGs under `docs/audit/` are modified by test runs; restore only if the user says.
- `docs/audit/landing/` is untracked, and `docs/LANDING-PAGE.md` links to it.
- Untracked and not Claude's: `DESIGN.md`, `film/`, `docs/GROQ-IMPLEMENTATION-ROADMAP.md`, `docs/M12-EXPLANATION-SCOPE.md`, `src/modules/ai/groq.provider*.ts`.

## Standing rules

Never stage, commit or revert `docs/audit/m2-profile-source.json`. Never read or print `.env` values. No push, merge, deploy or remote changes without the user's explicit instruction. No destructive operations on user data. Do not weaken an existing test; if one is wrong, tell the user. A green suite is not enough: confirm tests fail when the feature is broken.
