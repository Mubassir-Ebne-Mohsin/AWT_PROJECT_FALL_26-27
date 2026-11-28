# Hosting hardening: implementation and release gates

Started: 26 November 2026; verified/update: 27 November 2026. Owner authorized hardening before component expansion.
Status: H1 implemented locally; focused checks/builds passed, browser teardown limitation recorded. Overall hosting hardening remains open. This is not a production-readiness certificate.
No deployment, provider request, account change, database migration, commit or push is part of this pass.

## H1: HTTP and build-context boundaries

Implemented:

- `nest-boilerplate/nest-boilerplate/src/common/middlewares/http-boundary.ts`, wired by `src/app.setup.ts`: all `/v1` responses default to `Cache-Control: private, no-store`, including errors. Unsafe requests with foreign, opaque or malformed browser origins are refused before controllers. Configured CORS origins are compared exactly. Browser-controlled `Sec-Fetch-Site: same-origin` permits API-origin Swagger; unsafe requests without Origin but marked cross-site/same-site are refused. Header-free CLI/Postman clients remain usable and still require normal authentication/authorization. This check is a browser-CSRF boundary, not an API credential or bot defense. An arbitrary HTTP client can forge browser headers, so normal guards remain mandatory.
- Existing trusted-frontend requests, GET OAuth callbacks and CORS preflight remain supported. Cross-site POST OAuth callbacks are not supported; the implemented providers use GET callbacks. CORS configuration must list only trusted frontend origins. Do not add arbitrary customer origins to make an error disappear.
- `src/app.setup.ts` no longer creates or mounts `/docs` and `/docs-json` in production. Development Swagger/type generation stays available. `src/main.ts` reports whether docs were mounted.
- `web/next.config.ts`: frame embedding denied, MIME sniffing disabled, referrers suppressed, camera/microphone/geolocation disabled, CSP disallows objects and limits base URI. Removes `X-Powered-By`. This is a compatible CSP baseline, not a complete script/XSS policy; there is no claim of nonce-based script protection.
- Backend `.dockerignore` excludes environment files, keys, dependency trees and generated output from the Docker build context. `.env.example` remains public configuration documentation. The Docker integration test uses a synthetic scratch context only; it never copies the real project or reads real environment files.

No dependency, API payload, database schema or role permission change is required. Restart local servers to load setup/config changes.

## Evidence and limits

Initial boundary regression: 14 failed / 4 passed before the fix. Foreign login/logout writes reached the fixture and no-store was absent. After implementation, the boundary plus existing environment/authentication/recovery checks passed 44/44. Final Swagger/boundary checks passed 19/19; these totals overlap and must not be added together as unique tests. The production Swagger regression failed before the fix. Both frontend header assertions failed before implementation and passed afterward.

Frontend production build passed on the current working tree, with TypeScript/page generation. Actual production HTTP responses at `/`, `/login`, `/register` and the protected `/admin/users` redirect have the expected headers. Final backend build and scoped backend/frontend lint passed. The Docker scratch-context check passed, then failed when the ignore rules were deliberately removed, then passed after restoration; nested environment/key/certificate files and dependencies are covered. No real project image was built.

The initial Playwright run failed to launch all 12 journeys because bundled Chromium was absent. Installed Chrome recorded all 12 unique production assertion passes: nine across the first three projects, three in a separate 1440-dark run. Both runners stalled in shutdown/between-project cleanup under severe RAM pressure and were stopped by their exact owned process trees. Do not label this a clean 12/12 suite exit. Screenshot review confirmed the production Admin page remains styled and readable. Own audit server 3014 was stopped; owner ports/processes were preserved. Full evidence is in `docs/audit/hosting-hardening-2026-11-27/verification.json` and adjacent logs.

The HTTP fixture uses real Nest/Express middleware without a database. Browser accounts/API replies are controlled fixtures. This pass does not prove live OAuth acceptance, real SMTP delivery, database recovery or a whole-product production regression.

## H2: deployment and durable-session gate (next implementation priority)

Do not publish the current inherited container setup as a production release:

1. Replace the inherited `docker-compose.yml` service name, RTC port ranges and root-path wget probe with an explicit StressForge deployment definition. Use `/v1/health`, bind application exposure behind the chosen HTTPS proxy, and keep Postgres/Redis inaccessible from the public network. Do not reuse the owner's development compose project.
2. Run the API image without root, pin its package-manager toolchain, remove unused PM2 and document image update/rollback. Build and smoke-test the actual image; the synthetic ignore test alone is insufficient.
3. Select same-site frontend/API domains so the existing secure SameSite=Lax refresh-cookie model works. Entirely different sites can lose refresh cookies even if CORS allows the request. Configure exact HTTPS frontend/callback origins and proxy hops; reject development defaults in a deployment preflight. Configure OAuth production consent/app settings and verify real sign-in/link/unlink behavior with the owner.
4. Add verified PostgreSQL TLS/CA configuration where required by the hosting provider; current database options do not expose TLS. Use a least-privilege runtime DB role and a separate migration role. Validate Redis authentication/private transport and persistence appropriate to token revocation and rate limits.
5. Investigate the earlier suspend/restore refresh-token failure rather than dismissing its passing rerun. Review future-dated `iat` handling in `AuthService.issue`, sub-second revocation boundaries, concurrent login/password/role changes and Redis restart behavior. Register adversarial tests before changing session semantics. Do not weaken the existing admin-status assertion.
6. Keep one active API instance initially: `SimulationExecutor` explicitly owns single-instance admission. Redis-backed HTTP throttling does not make simulator admission distributed. Test overload, timeouts and restart recovery before allowing replicas.

H2 acceptance: real image build/rootless smoke; HTTPS proxy/forwarded-header tests; managed/private DB/Redis checks; migration from an existing disposable database; backup restore and rollback rehearsal; session race/restart tests; no owner data modifications.

## H3: public-account and role operations

- User: agree email-verification/password-recovery behavior, delivery provider and abuse limits; expired/single-use recovery tokens, session revocation and privacy-safe responses need end-to-end tests. These flows were not established by this audit as complete. Keep the existing honest AI gating and model-specific quota controls.
- Admin: stronger authentication for privileged accounts, current-role permission regression, last-admin protection, suspension/restore/revoke tests, bounded exports and audit retention. Do not give Admin implicit access to private designs.
- Instructor: ownership/frozen challenge/rule tests, publish/archive limits, moderation and abuse-report paths.
- Support: consent-bound design access, reporter privacy, saved-reply/merge boundaries and safe file/report handling.
- Reviewer: verify grant/revocation/privacy boundaries and comment moderation; this is a distinct current role even though some older planning docs describe four roles.

Accept role changes only with explicit permissions, server-side ownership checks and negative cross-account tests. Existing features and historical results are not substitutes for a current release regression.

## H4: release and operational acceptance

- Create CI/release jobs in the verified Git root, STRESSFORGE (there is no `.github/workflows` directory there). Require builds/types/lint, contract parity and the relevant security/integration/browser tests. Keep controlled fault evidence and never weaken thresholds.
- Record a release manifest from a reviewed clean/selectively committed tree. Current tree contains many unrelated uncommitted features; publishing it without reconciliation is unsafe.
- Encrypt/schedule backups, set retention, perform a timed restore on a disposable database, define recovery objectives and verify migration/rollback steps.
- Add operational alerts for health/dependencies, worker saturation, 5xx rates, quota rejection and backup failures. Redact credentials, callback codes, tokens and request bodies; do not add sensitive browser traces.
- Set measured resource/user limits from representative workload tests. A hosting price estimate or 1,000 registered users does not establish concurrent capacity.
- Full production Chrome regression, four dev-only system states, all five role journeys, support/challenge/report/share/export flows and a documented showcase rehearsal are release gates.
- Before hosting, rotate the Google client secret previously shared in chat using the provider console and configure the replacement privately. Do not paste it into reports, source or this chat.

The owner still needs to choose hosting domains/provider, mail delivery and operational targets. No paid purchase, live AI test or deployment is authorized by this document.
