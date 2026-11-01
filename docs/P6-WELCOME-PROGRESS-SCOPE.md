# P6 scope: the Welcome tour and the Progress page (concepts)

Prepared 2026-11-01. Status: **proposed, nine decisions await the user; nothing built.** Needs no AI and no new backend route. Last non-AI slice of [PHASE-4-5-SCOPE](PHASE-4-5-SCOPE.md) (approved row: "`/welcome` first-run tour with a sample design; `/progress` adds concepts opened").

## 1. Where the code is today (verified)

- `/welcome` is signed-in and a one-line placeholder. Nothing links to it. After registering, the user is sent to the page they asked for (`next`), usually the dashboard.
- `/progress` is real for challenges only (`LearnerProgress`: passed and attempted counts and each recorded attempt, from `GET /v1/progress/challenges`). It has no concepts section. The registry text promises "concepts opened and quiz results" and "streak and next suggestion".
- Learn progress already exists (P2): `learn-progress.ts` keeps "opened" and "passed the check" per topic in the browser, one bucket per account plus a guest bucket. It is not on the server.
- A design can be created from a template with the existing `createDesign(template)` call; the six templates and whether each meets its own goal are known from `examples-data.json` (two of the six miss their goal at their stated traffic).

## 2. What the pages become

**Welcome (`/welcome`)**
1. A short three-step tour in plain words: the editor (draw), results (run and read), the improve loop (change one thing and run again). Static text, no animation required; each step has Back and Next, and a visible Skip.
2. **Start with a sample design**: one button that creates a design from a template and opens it in the editor. The sample must be a template that **meets its goal as shipped**, so the first run is healthy and the learner then breaks it (add traffic, remove a replica). The choice is made from `examples-data.json` and pinned by a test, so it cannot silently become a failing one.
3. **Pick what to learn first**: links to the Learn topics, and a plain "Go to the dashboard" way out. No account data is asked for.
4. First-run means: after a **new registration** the user lands on `/welcome` (unless they came with an explicit `next`). Finishing or skipping is remembered in this browser, per account, and does not block anything. The tour stays reachable later (link in Help and on the empty dashboard).

**Progress (`/progress`)**
1. Keep the challenge section exactly as it is.
2. Add a **Concepts** section from the local Learn progress: how many topics opened and passed out of the total, and each topic with its mark ("Not opened yet", "Opened", "Passed the check") linking to the topic. Said plainly: "Kept in this browser, not on your account."
3. A **Next suggestion**: a fixed rule, shown with its reason (first unopened topic; else first topic not yet passed; else the first challenge not yet passed; else "You have covered everything here").
4. **No streak**: nothing records dates, and inventing one would be false. The registry text is updated to match.

## 3. Decisions needed (recommendation first)

1. **Where the tour starts.** Recommended: new registrations go to `/welcome`, except when an explicit `next` was given. Alternative: never redirect; only link to it (safer, but most users never see it).
2. **Which sample design.** Recommended: a shipped template that meets its goal as shipped, chosen from the data and pinned by a test. Alternative: let the user pick any of the six (the two that miss their goal would start the tour in a failing state).
3. **Creating the sample.** Recommended: the button creates one design and opens the editor; the button is disabled while working and shows a clear error on failure. Alternative: open the template read-only without saving (no design created, but nothing to break).
4. **Repeat visits.** Recommended: the tour never creates a second sample on its own; revisiting shows "Start with a sample design" again, which makes a new one only when clicked.
5. **Where the tour state is kept.** Recommended: browser only, per account (same as Learn progress), no new table. Alternative: a server flag (migration and privacy text).
6. **Concept progress on the server.** Recommended: no, keep it local, and say so on the page. Alternative: a table so it follows the account (the approved P2 decision 3 chose local for now).
7. **Streak.** Recommended: drop it and fix the registry text. Alternative: record dates locally (needs a design for what counts as a day).
8. **Next suggestion.** Recommended: the fixed rule in section 2, shown with its reason. Alternative: omit it.
9. **Slicing and review.** Recommended: two commits (Welcome with the redirect; Progress concepts), each with tests, regression and docs, pushed only when you say so. You read the tour wording before it ships.

## 4. Test plan

- **Unit:** the next-suggestion rule for every state; the sample choice meets its goal in the data; the first-run decision (new registration, with and without `next`, already finished, guest bucket); the progress counts against the topic list.
- **Browser (all four widths):** register, land on the tour, step through, skip, start the sample and reach the editor with that design; revisit does not create another; progress shows counts and marks that change after opening a Learn topic; a different account sees its own marks; no horizontal overflow at 320, 390, 1024, 1440; one h1 and ordered headings.
- **Honesty:** the page never says progress is saved to the account; no streak anywhere; no number that is not computed.
- **Deliberate breaks:** redirect always or never fires; sample button creates two designs; next rule off by one; counts ignore unknown topics; the sample swapped for a failing template; an account's marks leaking to another.
- The usual gates: type check, lint, all unit tests, full Chrome regression, commit by path, protected audit file never staged.

## 5. Not in scope

Server-side concept progress, streaks, badges or points, an interactive in-editor coach, role-specific tours, and anything using AI.

## 6. Risks

An automatic redirect after registering can annoy people who followed a link (hence the `next` exception and Skip). The first-run test must not depend on time or on leftover browser state. Local-only progress is lost if the browser data is cleared; the page says so.

## Approval and commit one result (2026-11-01): the Welcome tour
**All nine decisions approved ("APROVE ALL", as recommended).**
**Built:** `/welcome` is a three-step tour (draw, run and read, change one thing and run again) with Back, Next, Skip and Finish. "Start with a sample design" creates one design from the Single-server MVP template and opens it; the button cannot make a second design even on two clicks in the same instant (a ref guard, found by a surviving break), and a server error shows a message and allows a retry. A new registration lands on the tour unless it came with an explicit `next`. The tour is linked from the dashboard and from Help. "Been through the tour" is kept in this browser per account (`sf:welcome:v1:<account>`), nothing on the server.
**Existing tests changed, with your approval:** four tests registered through the form and then expected the dashboard (`m9.spec.ts` three tests, `phase1.spec.ts:184`). Only their entry URL changed, to `/register?next=%2Fdashboard`; every assertion is the same.
**Evidence:** web unit 338 pass (15 new for Welcome); 7 new browser tests on four widths pass; type check and lint clean; 18 deliberate breaks (redirect, sample template, per-account marker, double create, error text, Skip, wrong design opened, and others): all caught after the double-click guard was strengthened. Breaking the register redirect and the Help link in the real build failed the browser tests.
**Finding:** a dropped connection while creating the sample is handled by the app-wide "cannot reach the server" screen, not by the tour's own message; the tour's message is for the server answering with an error.
**Needs your review (decision 9):** the tour wording.
