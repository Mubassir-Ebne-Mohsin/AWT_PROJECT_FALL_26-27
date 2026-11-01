# Phase 4/5 scope: public, learning, settings and evaluation pages

Prepared 2026-11-01. Status: **all ten decisions approved 2026-11-01 ("Approve all", as recommended).** P1 is built (see the result at the end); P2 to P6 are not. Needs no AI (AI stays parked, see [AI-DEFERRAL-PLAN](AI-DEFERRAL-PLAN.md)). Sources: the route registry (`web/src/lib/routes.ts`), the fixed vocabularies in `web/src/lib/catalog.ts`, [SIMULATION-MODEL](SIMULATION-MODEL.md), and the planned-content lists already written for each route.

## 1. Where the code is today (verified)

Every page below is a one-line `RoutePlaceholder` (it renders the registry's description and "planned" bullets). The registry already has all the routes, so **no new routes are needed and the registry stays at 40.**

| Route | Registry fidelity | Backend it can use today |
| --- | --- | --- |
| `/how-it-works`, `/about`, `/privacy`, `/terms` | placeholder, stub | none needed |
| `/learn`, `/learn/:topic` (8 topics: p95, caching, queues, replicas, load balancing, utilization, CDN, regions) | placeholder | none; the model's formulas live in the simulation module |
| `/examples`, `/templates`, `/components` | placeholder | `GET /v1/templates` exists; component defaults live in the simulation engine |
| `/welcome` | placeholder | templates and designs APIs |
| `/progress` | **already real for challenges** (R5.2); concepts and quiz are not built | `GET /v1/progress/challenges` |
| `/settings/:section` (profile, security, AI usage, data, appearance, preferences) | placeholder | only `GET /auth/me`, login, refresh, logout. **No profile, password, export or delete endpoints.** |
| `/evaluation/:tab` (simulator, calibration, ai) | "complete" mock page labelled illustrative | none |
| `/dev/ai-logs`, `/dev/evaluation-runner` | stubs | AI-dependent; stay stubs |

`catalog.ts` still lists four invented challenge ids (`flash-sale` and so on) that predate the real challenges from R5. They only feed page titles.

## 2. Proposed slices (each with the usual gates: tests, deliberate breaks, 4-project browser journeys, full regression, commit by path)

| Slice | Delivers | Backend? |
| --- | --- | --- |
| **P1 Honest public pages** | `/how-it-works` (assumptions, formulas, limits, from SIMULATION-MODEL), `/about`, `/privacy` (what is really stored; AI off), `/terms` (estimates, not measurements) | none |
| **P2 Learn** | `/learn` cards and `/learn/:topic` pages: plain-words explanation, one draggable mini-demo, "where this shows up in your results", a two-question check. Detailed in [P2-LEARN-SCOPE](P2-LEARN-SCOPE.md) | none (progress marks local, see decision 3) |
| **P3 Examples, templates, components** | `/templates` and `/components` as real catalogs from existing data; `/examples` as ready designs a visitor can look at. Detailed in [P3-EXAMPLES-SCOPE](P3-EXAMPLES-SCOPE.md) | none (static data checked against the engine) |
| **P4 Settings** | Profile (display name), Security (change password), Appearance and Preferences (local), AI usage (shows "AI is off"), Data (export everything as JSON; delete account) | **yes**: new endpoints and one migration |
| **P5 Evaluation** | `/evaluation/simulator`: formula tests against textbook queueing results, with real numbers from the test suite; `/calibration` and `/ai` handled honestly (decision 6) | maybe a static results file |
| **P6 Welcome and progress** | `/welcome` first-run tour with a sample design; `/progress` adds concepts opened | small |

Order: P1, P4, P2, P3, P5, P6. P1 is quick and fixes the most visible gaps; P4 is the only slice that touches accounts and data, so it should get the most care early.

## 3. Decisions needed (recommendation first)

1. **Static or database-backed content.** Recommended: P1, P2, P3 and P5 content lives in the code (typed data files plus components), reviewed like code. No CMS, no content tables. Alternative: store in the database so an Instructor or Admin can edit it later; much more work and not needed for the course.
2. **Learn mini-demos.** Recommended: each demo uses the same formulas as the simulation module (shared, tested) and says "model estimate". Alternative: free-standing toy formulas; faster, but could disagree with the real results.
3. **Where concept progress is kept.** Recommended: in the browser only (per device) for P2; no new table. Alternative: a server table so progress follows the account (adds a migration and privacy text).
4. **Examples.** Recommended: examples are the existing templates, shown read-only with their breaking point, and "Copy to my account" after sign-in. Visitors cannot run the simulator (it needs an account, and running it for guests would need rate limits). Alternative: guest runs with a strict limit; a new public endpoint to defend.
5. **Account deletion (P4).** Recommended: in scope. Deleting an account removes its designs, runs, notes, shares and attempts; challenge results already given to other people's challenges are removed with the learner's attempt; an Instructor with published challenges or learner attempts must archive or hand over first (the database already blocks this with `ON DELETE RESTRICT`), and the screen says so. Needs a typed confirmation and the password. Alternative: out of scope, hide the button.
6. **What "evaluation" means.** The registry says it is the proof page: **Simulator** (formula tests against textbook queueing results), **Calibration** (a real app load-tested against the simulator's prediction), **AI** (AI suggestions against a rule-based baseline). Recommended: build **Simulator** now with real numbers from the existing analytic tests, mark **Calibration** as "not yet measured" with the method written down (a real load test is a separate piece of work), and mark **AI** as "parked, not evaluated". Never show mock numbers as results. Alternative: also run a real calibration experiment in this phase.
7. **Settings details.** Recommended: display name editable (1 to 80 characters, plain text), password change requires the current password and ends other sessions, email is shown but not editable in this phase, theme stays local. Export is a single JSON file of the account's own data, never other people's content.
8. **`catalog.ts` challenge ids.** Recommended: remove the four invented ids so titles come from the real challenges.
9. **`/dev/*` stubs.** Recommended: leave as stubs until AI is unparked.
10. **Shipping.** Recommended: one slice at a time, each verified and committed, pushed only when you say so.

## 4. Test matrix (every slice)

Public pages: each route renders without an account, has one `h1`, correct title, no overflow at 320, 390, 1024 and 1440 px, light and dark, and no claim that contradicts SIMULATION-MODEL. Settings: each operation succeeds for the owner and is refused for others and guests; password change, export and deletion are covered end to end, including parallel requests, a wrong password and a suspended account; deleting removes only the account's own data. Evaluation: every figure shown is read from a recorded result, and a test fails if the page contains a number with no source.

## 5. Not in scope

AI of any kind (M12 to M17), a CMS, guest simulation, email verification and password reset by email (needs a mail service), social login, payments, and a real calibration load test unless you choose it in decision 6.

## 6. Risks

Account deletion is the one hard-to-undo feature: it needs the strictest tests and a clear screen. Public pages can drift from the model; the matrix ties their claims to SIMULATION-MODEL. Learn demos can disagree with real results unless they share formulas (decision 2).

## P1 result (2026-11-01)
**Built:** `/how-it-works`, `/about`, `/privacy` and `/terms` are real, account-free, server-rendered pages (`web/src/components/public/static-pages.tsx`, words in `web/src/lib/public-content.ts`). Registry fidelity for the four routes is now "C"; the registry stays at 40 routes.
**Honesty rules enforced by tests:** how-it-works repeats only what SIMULATION-MODEL.md says (bounds, 48-point timeline, six paths, 1e7 search cap, Sakasegawa, no calibration); the terms quote the limits the code enforces (50/200, 20 graded submissions, 20 feedback notes); the privacy page matches the code (argon2 password hashes, SHA-256 share-link hashes, no email shown to Reviewers or Instructors, AI off) and says export and deletion are "not available yet", and a test fails as soon as an export or delete route exists so the text must be updated in P4.
**Evidence:** web tsc and eslint clean; web unit 253 pass (7 new in `tests/p1-public.test.cjs`); 12 browser tests (3 per project) in `tests/browser/p1-public.spec.ts` as a guest at 320, 390, 1024 and 1440 px with no API calls; full Chrome regression 574 passed, 10 skipped, 0 failed; 18 deliberate breaks (wrong numbers, flipped claims, a second h1, a client page, a missing noopener, placeholder text) each failed a test. No backend change.
**Open item:** the About page links to the GitHub repository; remove that link if the repository should stay private.

## P4 result (2026-11-01)
**Built:** Settings at `/settings/:section`, six real sections. Profile (display name, 1 to 60 characters, plain text; email shown, not editable). Security (change password: current password required, new password with the registration rules, **every other session ends at once**, this device gets a fresh one). AI usage (states that AI is off). Data (download everything as one JSON file; delete the account with the password and the typed words). Appearance (theme, saved on the device). Preferences (says there is nothing else to set yet). Registry fidelity for the route is now "C"; the registry stays at 40 routes.
**API (new, in the phase 3 contract):** `PATCH /v1/account/profile`, `GET /v1/account/export`, `POST /v1/account/delete`, `POST /v1/auth/password`. Migration `AccountSelfService1794400000000`. No route takes an account id; each acts on the caller.
**How other sessions end:** refresh tokens through `users.sessions_revoked_at`, access tokens through a Redis marker the auth guard checks. A session created in the same second as the cut-off is dated just after it, so signing in right after a change works (this also removes the same latent edge for suspension).
**Deviations from the approved text, and why:** (1) The display-name limit is 60, the column size, not the 80 first written. (2) Decision 5 said an Instructor must "archive first"; archiving does not remove learners' attempts, so some Instructors could never delete. Instead a challenge other people have attempted is kept, archived and ownerless, with its feedback shown as "Former Instructor"; all other challenges go with the account. (3) The last working Admin cannot delete their account (409). (4) The role history is an append-only audit log and keeps the email text of past role changes; the Privacy page says so.
**Export contents:** account, designs with versions, notes, runs (full result for the latest 20 per design, listed without the large result beyond that), share links without secrets, reviews of your designs with the Reviewer's display name, your comments, challenges you manage, your attempts with results and feedback received, and role history. Never other people's emails, password hashes or share secrets.
**Evidence:** backend unit 245 pass (2 new in `account.controller.spec.ts`); e2e 19 suites, 253 pass (17 new in `account.e2e-spec.ts`); web unit 268 pass (15 new); Chrome regression 598 passed, 10 skipped, 0 failed (24 new Settings journeys across the four projects). Deliberate breaks: 24 backend (all caught once the throttle test was added) and 28 web (27 caught at first; the survivor, forgetting the sign-in marker after deletion, is now covered by `p4-account-api.test.cjs`).
**Found and fixed on the way:** the first migration changed `challenges.instructor_id` to SET NULL, which broke the R5.1 test "deletes an Instructor's challenges with the account"; the migration now only makes the column nullable and keeps CASCADE (the account service detaches kept challenges first). The delete flow first ended on the login page because the auth gate reacted to the dropped session; it now clears the marker and does a full page load to the home page.
**Privacy page updated** to say export and deletion exist; its test now fails if the text and the API disagree.
**Known gap (not caused by P4):** `pnpm fixtures:phase2` reports "Reference fixtures drifted" on this machine (Node v24.14.1): the prototype oracle's `Wq` differs from the stored fixture by one unit in the last place. None of its inputs changed in this work; the tolerance-based parity tests (1e-6) pass. Needs a decision: re-capture the fixtures, or loosen the byte comparison.
**Operator step:** run `pnpm migration:run` on every database.
