# Challenges foundation release (CH-1 / CH-2)

26 November 2026. Implementation is versioned on `codex/phase2-contracts` (CH-1/CH-2: `dc6ee8f`). The owner's database has NOT been migrated or seeded by this task. CH-3 advanced exercises and queue-health grading remain future work.

## What changes

- Compact architecture cards with real frozen-starter thumbnails, category icons, difficulty, fixed workload, targets and editorial time estimates.
- Search, category/difficulty/progress filters, sort, reset and bounded loading. Private attempted/passed figures come from the signed-in account's server progress; guests and failed progress requests never become fabricated zeroes.
- A scenario briefing, baseline result, explicit allowed edits, three progressive hints and real Learn links. Continue an existing private attempt and submit its saved revision.
- Instructors can add learning metadata and choose one of six bounded edit profiles. Published rules and starting inputs are frozen; custom exercises are not automatically proven solvable.
- Server checks preserve original components, client demand, service limits and required paths. Only declared additions/replicas/regions are editable. Rejected rules produce actionable messages and consume no graded submission. Accepted submissions record the rule version/snapshot alongside saved inputs and goal.
- Existing four challenges and historical results keep their original grading. A challenge pass still means p95 <= target AND error rate <= budget; the model's utilization verdict is a separate fact. Nothing here calls an AI model.

## Six opt-in official exercises

| Exercise | Main skill | Bounded edits |
| --- | --- | --- |
| Rescue the single-server launch | App scaling | App replicas 1–3 |
| Cache a busy catalogue | Reduce repeated reads | One cache, at most 85% hits |
| Scale reads without moving writes | Read distribution | Up to two read replicas |
| Put a breaking-news site behind the edge | Edge caching | One CDN, at most 80% hits |
| Remove a cross-region detour | Placement latency | App region only, within declared choices |
| Serve a photo feed under load | Combine caching and edge delivery | One cache and one CDN, at most 80% hits |

Every starter fails its fixed request targets; a server-only reference passes with the same traffic and valid exercise rules. Reference solutions are excluded from public API projections and browser fixtures. These are mathematical exercises, not measured infrastructure benchmarks or cost optimization.

## Install in your local database

From PowerShell, in the existing backend folder:

```powershell
Set-Location 'C:\ADVANCED WEB TECH\AWT_PROJECT_FALL_26-27\STRESSFORGE\nest-boilerplate\nest-boilerplate'
pnpm migration:run
pnpm challenges:seed --instructor-id '<ACTIVE_INSTRUCTOR_ACCOUNT_UUID>'
```

Replace the placeholder with an existing active Instructor account's user UUID. Never paste credentials. Ensure PostgreSQL and Redis are running as in the root README. Restart the API if it is not watching source, then open `/challenges` in the running frontend.

Migration `1795400000000-ChallengeLearning` adds nullable challenge learning/rules and submission rule snapshots. It refuses rollback after these fields hold history. The standard migration runner applies the pending migrations present in your checkout in order. Separate local OAuth changes are not included in this Challenges publication.

The seed is explicit, validates all six starter/reference pairs first, holds the Instructor advisory lock, respects the 50-challenge limit and uses six stable UUIDs. Repeating it skips existing rows, preserving edited published wording. A different owner's UUID collision is refused. It never runs on startup and never rewrites the legacy four exercises. Existing legacy challenges show neutral metadata until an Instructor explicitly adds a guide through an eligible draft.

## Code map

- Backend contracts: `src/common/contracts/phase3/challenge-learning.schema.ts`, `challenges.schema.ts`, `attempts.schema.ts`.
- Rules/projection/pack: `src/modules/challenges/exercise-rules.ts`, `challenge-projection.ts`, `foundation-fixtures.ts`, `foundation-pack.ts`.
- Submission allocation and frozen grading: `learner-challenges.service.ts`; authoring/publication: `challenges.service.ts`.
- Explicit CLI: `src/script/seed-foundation-challenges.ts`.
- Frontend: `web/src/components/learner/challenge-library.tsx`, `challenge-card.tsx`, `challenge-brief.tsx`, `challenges.tsx`; Instructor learning fields; scoped `web/src/styles/challenges.css`.
- Verification: `test/challenge-foundations.e2e-spec.ts`, rule/projection unit suites, `web/tests/challenge-discovery.test.cjs`, `web/tests/browser/challenge-foundations.spec.ts`.

## Limits and next step

The public catalog remains bounded to the server's first 200 published entries. Times are editorial estimates, not tracked study time. No leaderboard, XP, monetary budget engine, new route, new dependency or AI activation is included. Browser checks use controlled API fixtures; isolated HTTP tests exercise the actual Nest/Postgres/engine path. Owner-account installation and rehearsal remain separate. Finish activation and rehearse before considering CH-3; do not grade queue backlog using the current p95/error-only judge.

Future changes must update the same living progress report, preserve earlier evidence and recheck affected old challenge/auth flows.
