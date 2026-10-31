# R5 Instructor: challenges, attempts, submissions and feedback (scope and decisions)

Status: **all eleven decisions approved 2026-10-31 ("Approve all", as recommended).** Nothing here is built yet; slice R5.1 is next. It details slice R5 of [ROLES-SCOPE](ROLES-SCOPE.md) and keeps its approved decisions (8: challenges first, the server decides pass or fail, Instructors see only submissions to their own challenges; 9: dev-only demo accounts). Needs no AI. Reuses the frozen-report machinery from M16, R3 and R4.

## 1. Where the code is today (verified)

| Thing | State |
| --- | --- |
| Challenges | Four names in `web/src/lib/catalog.ts` (`flash-sale`, `p95-100`, `cross-region`, `launch-10x`). Routes `/challenges` (public) and `/challenges/:id` exist as placeholders. No backend, no table. |
| Progress | `/progress` is a placeholder. |
| Instructor role | Exists since R1 (an Admin grants it at `/admin/users`). It carries no permissions yet. |
| Model | A recorded simulation holds p95, error rate, throughput, `sloMet` and a verdict; traffic holds `sloP95` and `errorBudget`. The model is deterministic for one engine version. |
| Reusable | Frozen reports (`ReportService.assemble`), the leak-checked shared report shape, `RoleGate`, the permission table, row-lock limits, the R4 comment patterns. |

## 2. Non-negotiable rules

- **The server decides pass or fail** from the model's own result. A client-sent number, run id or verdict is never trusted.
- **Instructors see only submissions to their own challenges**, by display name. Never an email, never the learner's other designs, notes or runs.
- A learner **submits explicitly**. That act is the sharing: nothing is visible to an Instructor before it.
- Challenge text is **plain text**, never HTML, with length limits.
- Every Instructor endpoint declares a permission; the permission matrix is tested for every role, like R1 to R4.
- Admins can read no challenge submission content.

## 3. Slices

| Slice | Delivers | Depends on |
| --- | --- | --- |
| **R5.1 Challenges (Instructor)** | Create, edit, publish and archive a challenge: title, summary, goal, fixed traffic, starting design. Instructor list. | R1 |
| **R5.2 Attempts and judging (learner)** | List published challenges, start one (a private copy of the starting design), submit a revision, and the server re-runs the model and records pass or fail with the numbers. | R5.1 |
| **R5.3 Submissions and feedback (Instructor)** | An Instructor reads submissions to their own challenges (outcome, metrics, the frozen design of the submitted revision) and writes feedback the learner reads. | R5.2 |
| **R5.4 Web** | Real `/challenges`, `/challenges/:id`, `/progress`, plus two Instructor screens. Recommended: each slice ships its own screens. | each |

Each slice follows the usual gates: backend e2e on the isolated database, permission matrix tests, mutation checks (each break must fail a test), web unit and browser journeys in 4 projects, full regression, commit by path, protected audit file never staged.

## 4. Decisions needed (recommendation first)

1. **How pass or fail is decided.** Recommended: at submit time the **server re-runs the model** on the frozen revision with the **challenge's own traffic** and compares the result with the goal. It stores that result and the engine version. This cannot be gamed by editing traffic in the learner's copy, and it does not depend on a stored run. Alternative: trust a recorded run, after checking its traffic equals the challenge's (weaker: depends on stored data).
2. **Goal shape.** Recommended: **p95 at or under X ms and error rate at or under Y** at the challenge's fixed traffic (rps, burst, read ratio, shape, duration). Nothing else is scored. Alternatives: also a component cap, a cost limit, or a score (not recommended yet; the model has no cost).
3. **Editing after publishing.** Recommended: once published, the goal, traffic and starting design are **frozen**. The Instructor can fix the title and summary, archive it, or duplicate it into a new draft. Alternative: allow edits (breaks past results).
4. **Who sees challenges.** Recommended: published challenges are listed **publicly** (title, summary, goal, no starting design), so guests can browse; starting an attempt needs a login. Archived ones disappear from the list but keep existing submissions.
5. **What an Instructor sees of a submission.** Recommended: the learner's **display name**, outcome, the model numbers, and the **frozen design and result of the submitted revision** (the same leak-checked shape as a review). Never email, never other designs, runs or notes.
6. **Feedback.** Recommended: **one-way**: the Instructor writes plain-text feedback on a submission (2,000 characters, up to 20 per submission); the learner reads it, and cannot reply in R5. Alternative: a full thread like R4 (more work; can be added later).
7. **Attempts and resubmitting.** Recommended: a learner may submit **as often as they like** (limit 20 per challenge, so it cannot be spammed); every submission is a frozen record; **a pass is permanent**; the learner's page shows their best result. No leaderboard.
8. **Starter challenges.** Recommended: the four catalog names become **real challenges seeded by the dev-only demo script** (owned by the demo Instructor), consistent with decision 9. Production starts with none until an Instructor publishes one. Alternative: seed them in a migration under a "StressForge team" account.
9. **Progress page.** Recommended: `/progress` shows the learner's **real challenge results** (attempted, passed, best numbers). The concepts and quiz parts stay placeholders (not part of R5).
10. **New routes.** Recommended: allow **two** new routes, `/instructor/challenges` (list and editor) and `/instructor/challenges/:id` (submissions), taking the registry from 38 to 40. Challenge and progress screens reuse the existing routes.
11. **Order and shipping.** Recommended: R5.1, R5.2, R5.3, each with its own screens, verified, committed and then pushed only when you say so.

## 5. Data sketch (all additive)

`challenges(id, instructor_id, title, summary, goal_p95_ms, goal_error_rate, traffic, starting_snapshot, status draft|published|archived, created_at, published_at)`; `challenge_attempts(id, challenge_id, user_id, design_id, created_at)`; `challenge_submissions(id, challenge_id, attempt_id, user_id, revision, report, result, engine_version, passed, submitted_at)`; `challenge_feedback(id, submission_id, author_id, text, created_at)`. New permissions in the code table: `challenge.manage` and `challenge.submissions.read`, both Instructor only. The frozen `report` reuses the shared report shape.

## 6. Test matrix (every slice)

For each role (guest, User, Reviewer, Instructor, Admin, Instructor-and-Reviewer): permitted operations succeed and forbidden ones return 401, 403 or 404. Plus: another Instructor's challenge and submissions, a learner's attempt on someone else's design, a revision that changed after submitting, a traffic profile that was edited, a goal that is exactly met (inclusive), just missed and just passed, the engine version stored, the attempt and feedback limits, DTO leak checks (no email, no private notes, no internal ids), and a User-flow regression.

## 7. Not in scope

Leaderboards, timed attempts, AI grading or hints, cost scoring, team challenges, notifications or email, an example-designs library separate from challenges, plagiarism checks, and deleting accounts.

## 8. Operator steps

Migrations are additive (`pnpm migration:run`). An Instructor is made by an Admin at `/admin/users`. `pnpm seed:demo-roles` creates the demo Instructor; the starter challenges would come from the demo script (decision 8).

## 9. Risks

Gaming the check is the main risk, which is why the server re-runs the model with the challenge's own traffic (decision 1). A later engine change could make an old pass look different, so the engine version is stored and a pass stays a record. Challenge text is shown to every user, so it is plain text with length limits. Instructor access to learner data must never grow past the submitted revision.
