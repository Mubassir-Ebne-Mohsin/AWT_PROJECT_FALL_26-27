# Challenge visibility and visitor introduction

Updated 27 November 2026 at the owner's request.

- /challenges remains a public entry page. Guests see a static teaching introduction and an illustrative app-replica comparison, never the published catalog, counts, filters, starter designs or hints.
- Signed-in users see the existing challenge library. Challenge and briefing queries require a user, attach the access token and use account-scoped cache keys. Signing out unmounts the library and clears cached session data.
- /challenges/:id is protected by the existing Next proxy and client AuthGate. Login preserves the requested path/query. The session-hint cookie is only a navigation hint, not proof of authentication.
- GET /v1/challenges and GET /v1/challenges/:id require the global JWT AuthGuard. Anonymous, invalid/expired/refresh tokens, revocations and suspension/session markers are rejected before the data service is called. Read responses keep no-store behavior.
- The Phase3 OpenAPI operations now declare bearer authentication. PublicChallenge schema names are retained for compatibility; they describe published projections, not anonymous access.
- No role, migration, simulation rule or response-body schema changes. Instructors continue authoring and users keep private attempts, hints, submissions and progress.

The example is explicitly labelled illustrative, uses no published challenge data, makes no simulation/AI request and does not claim a computed pass. Glass surfaces, glow, native radio interaction and scroll reveals respect light/dark and reduced-motion settings.

Implementation: web/src/components/public/challenge-introduction.tsx and styles/challenge-introduction.css; learner/challenges.tsx and challenge-library.tsx; lib/api/attempts.ts and lib/routes.ts. Backend: src/modules/challenges/learner-challenges.controller.ts and common/contracts/phase3/openapi.ts.

Evidence: docs/audit/challenge-access-2026-11-27/verification.json. Seven focused real-guard HTTP tests passed using stubbed data/revocation services; 21 web units passed. Initial browser run40 passed/4 failed on a one-shot outage fixture. Owner approved making the outage persist until explicit recovery; corrected outage and added logout journeys8/8 passed, yielding48 distinct successful journeys across runs. Two production guest journeys passed. Types, scoped lint, canonical contract regeneration and both production builds passed. The running API returned401 for both anonymous reads. A public-route bypass in the isolated test process failed5 assertions; restored7/7 pass. No production controller was made public during fault testing.

The existing Postgres-backed attempts/foundation fixtures were updated with owner approval and type-checked, but those broader database suites were not rerun. Separate hosting acceptance remains deferred. No owner-data changes, live AI/provider calls, commits or push. Own production preview is available on3013.
