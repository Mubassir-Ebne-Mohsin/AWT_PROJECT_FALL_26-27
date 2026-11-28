# Google and GitHub authentication - proposed implementation scope

**Date:** 26 November 2026 (Asia/Dhaka). **Status:** Owner-approved scope implemented locally; controlled verification passed. SOC-5 remains PARTIAL pending owner-created OAuth apps and live Google/GitHub acceptance. Providers remain disabled by default. See [setup and live checklist](SOCIAL-AUTH-SETUP.md) and the latest living-report entry.

## 1. Objective and preserved behavior

Add Continue with Google and Continue with GitHub to login and registration while retaining email/password authentication, existing backgrounds/illustrations, the authenticated workspace, all roles, ownership checks and access-JWT/rotating-refresh-cookie sessions. First-time social users complete registration; returning linked users sign in. Both work on localhost with internet access. Deployment is not a prerequisite.

No paid identity platform, provider API permissions unrelated to identity, AI calls, repository access, Gmail/Drive access, provider-password collection, automatic email-based account merging, or authentication-system replacement. No avatar import, organization SSO, MFA/passkeys, password-reset-by-email system or arbitrary account merging in this scope. Do not add fabricated local passwords. No push/deployment/owner database migration without separate instruction.

## 2. Confirmed repository context

- Backend auth routes/controller and session-cookie handling: nest-boilerplate/nest-boilerplate/src/modules/auth/auth.controller.ts. Sessions/password verification: auth.service.ts; existing token family/revocation logic in the auth module remains authoritative.
- User entity: src/modules/users/entities/user.entity.ts. passwordHash is currently required. UsersService.create requires a password hash; emails are normalized and unique, username is optional, public serialization excludes hashes.
- AuthService.login, changePassword and AccountService.deleteAccount call Argon2 assuming a non-null password hash. These must become null-aware before social-only accounts are enabled.
- Account routes/service and contracts: src/modules/account/{account.controller,account.service}.ts and src/common/contracts/phase3/account.schema.ts. Deletion currently requires a password plus the typed phrase and has a last-working-Admin safeguard. Preserve those existing protections and export/privacy behavior.
- Frontend: web/src/components/auth/{login-form,register-form,auth-provider}.tsx, components/settings/settings.tsx and lib/api/client.ts. lib/session-hint.ts uses a non-secret sf_session cookie so Next can redirect signed-out visitors; that hint is not authentication. A new public completion route must establish the real session before navigating to protected pages.
- Existing API client stores access JWTs in memory; the backend refresh cookie is httpOnly, SameSite=Lax and scoped to /v1/auth. Reuse this architecture. Do not adopt a second frontend session framework or put provider/STRESSFORGE tokens in browser storage or redirect URLs.

## 3. User journeys and account rules

### A. Returning linked user

Choose provider -> server creates browser-bound login transaction -> provider authenticates -> backend validates callback/provider identity -> lookup by stable (provider, subject) -> enforce local suspension/session rules -> issue ordinary STRESSFORGE session -> public completion page restores in-memory access token -> allow-listed local return path, default Dashboard.

Provider subject, not email/name/username, identifies a linked account. Changing provider email or GitHub handle must not create a second account or silently change the local email/display name/roles. No admin/instructor/reviewer/support access is inferred from provider data.

### B. New account

After verified provider identity, require a usable verified email for new local registration. Keep a short-lived pending registration server-side; do not create a user or session yet. Show verified email read-only, editable validated display name, optional available STRESSFORGE username, and explicit terms/privacy acceptance. Final submission creates local user plus provider identity atomically and issues the existing session. Preserve ordinary default role and suspended-account behavior.

Google email verification and GitHub verified-email data must be checked. For GitHub use its email-list API rather than assuming the public profile contains an email; a private email is supported. Prefer a verified primary email; if absent, require the user to fix it at the provider and retry. Never invent a placeholder local address or accept a typed address as provider-verified. Existing linked identities are resolved by stable subject and are not reassigned when email changes.

### C. Email collision

If an unlinked provider identity presents an email already registered locally, stop automatic registration. Explain that the user should sign into their existing account and connect the provider in Settings. Do not silently attach the identity, transfer data, reveal roles or merge accounts. Database uniqueness and transactions must also handle two callbacks racing to register/link.

### D. Explicit linking

Settings shows current login methods. Starting a link requires authenticated account ownership plus a short-lived recent-authentication proof, obtained by local password verification or a fresh successful flow for an already-linked provider. Bind proof and OAuth transaction to the current account/session/action; reject account changes mid-flow. Confirm which local account is being linked. Validate the new provider's identity independently. An identity already attached to another local user cannot be moved. A different provider email alone does not transfer or merge another local account.

### E. Unlink and sensitive operations

Require recent-authentication proof to unlink, set a first password or delete a social-only account. Prevent removal of the last usable sign-in method; enforce this transactionally under concurrent disconnects. A present password or another configured, linked sign-in provider is required before unlinking. Existing local-password users retain current-password checks for password changes/deletion. Social-only users can set a first Argon2 password after provider reauthentication, using existing strength rules. Session revocation/new-session behavior should match existing password changes.

Social-only deletion uses a single-use, action-bound proof from a linked provider plus the existing typed deletion phrase. Preserve last-working-Admin refusal, account cleanup/anonymization and all-session revocation. The same proof must not authorize a different action or a second request. Fresh provider authentication establishes control of that provider identity; do not label it MFA or promise the provider always asks for a password.

## 4. Protocol and session design

- Backend owns provider authorization-code flows. Use state and PKCE S256 for both providers, plus Google OIDC nonce and full ID-token validation (signature/trusted JWKS, issuer, audience, expiration, nonce and authorized-party checks where applicable). GitHub OAuth is not treated as an OIDC ID-token provider; exchange code server-side and fetch authenticated identity/email from fixed GitHub endpoints.
- Redis holds short-lived transactions (recommended ten-minute maximum), verifier/nonce, server-validated return path and browser/session binding. Consume state atomically once. Missing, expired, replayed, wrong-provider or wrong-browser state fails closed. Keep a separate purpose for login/link/reauth/pending-signup and short single-use action proofs (recommended five minutes).
- Validate provider errors/cancellation before exchange. Add bounded network timeouts and rate limiting. Redis/provider outages fail clearly; no mock identity, account creation from unverified data or silent fallback provider.
- The callback stores the normal refresh cookie and redirects to a public /auth/complete page. That page explicitly invokes the existing refresh/adopt mechanism, establishes the in-memory access JWT and session hint, then navigates. Do not depend on the hint already existing, and do not require an authenticated middleware pass before completion. Never put access/refresh/provider tokens in URLs. Refresh family deadlines, rotation and replay/logout revocation remain unchanged.
- New signup remains pending until consent. An httpOnly pending cookie references server-side state; the frontend cannot submit its own provider identity/email. State-changing requests require an explicit CSRF defense (origin validation and action-bound CSRF token, not SameSite alone). Login/link/reauth intents must not be interchangeable.
- Only allow safe local return paths. Reject external/protocol-relative/backslash/control-character variants and loops into callbacks. Use configured fixed callback/provider URLs, never Host headers or user-supplied URLs to construct trusted endpoints.
- Logs must redact authorization headers/cookies, provider codes, state/proofs, tokens, pending tickets, secrets and callback query strings. No token-bearing browser traces or storage-state artifacts.
- Request only identity scopes: Google openid/email/profile; GitHub minimal profile identity plus user:email. No offline access requested. Provider tokens are used transiently for verification/profile retrieval and are not retained. Disconnect removes the local identity binding; explain how to revoke the app separately in provider settings, without claiming local unlink revokes provider-wide consent.
- Select and review maintained protocol/JWKS libraries before implementation; avoid handwritten cryptography. Keep additions small and justify each dependency/version in the implementation report.

## 5. Database and migration

Proposed external_identities table: UUID id, user_id (FK users, cascade deletion), provider (google/github), provider_subject (stable string), linked_at and last_used_at. UNIQUE(provider, provider_subject) prevents cross-account reuse; UNIQUE(user_id, provider) limits first release to one account per provider per local user. No provider access/refresh tokens or passwords stored there.

Make users.password_hash nullable, preserving existing hashes. Social-only users have null; local authentication uses the existing dummy-hash path and consistent bad-credentials error when no password exists. Review every hash dereference and user fixture, not only login. Expose only safe account capabilities such as hasPassword and connected provider names/dates. Extend own-account export to include safe linked-method metadata, never secrets; deletion cascades identities.

Prevent invalid method removal through transactions/locking, including parallel unlink operations. Creating new user+identity must be atomic; failed callbacks/consent cannot leave an orphan user. Rollback must refuse destructive schema reversal while social-only accounts or identity data would be lost. Do not delete identities, manufacture passwords or delete social users to make a rollback succeed.

## 6. API and frontend scope

Proposed contracts, finalized after inspecting existing route conventions:

| Route | Purpose |
| --- | --- |
| GET /v1/auth/providers | Public configured-provider availability, no secret/config values |
| GET /v1/auth/:provider/start | Start browser-bound login/signup intent |
| GET /v1/auth/:provider/callback | Validate provider response and complete the relevant intent |
| GET /v1/auth/oauth/pending | Safe pending registration form context |
| POST /v1/auth/oauth/register | Consent-validated social registration |
| GET /v1/auth/oauth/identities | Own login methods/capabilities |
| POST /v1/auth/oauth/:provider/link | Authenticated, recent-proof-bound linking start |
| POST /v1/auth/oauth/:provider/unlink | Proof-bound unlink with final-method guard |
| POST /v1/auth/reauthenticate | Local-password recent-auth proof; provider proof uses purpose-bound OAuth flow |
| POST /v1/auth/oauth/password | Set a first local password with fresh proof |

Route provider parameters are an explicit allow-list. Check static/dynamic route precedence so existing login/register/refresh endpoints remain unchanged. JSON endpoints use canonical Zod/OpenAPI contracts and stable error envelopes. Provider redirects use safe failure reasons mapped to readable login/settings messages, with no sensitive provider errors reflected verbatim.

One proposed new public frontend route: /auth/complete. Reuse /register for pending social registration and the existing Settings Security section for connected accounts; no unnecessary page expansion. Update route registry, middleware/public exceptions, command palette and route-count tests transparently. Existing owner approval is required before correcting pinned obsolete route assertions; no test weakening.

Buttons: Google and GitHub above an Or continue with email divider, with accessible official-brand-compatible icons, focus/loading states and duplicate-click protection. Retain existing theme/background/animation and email forms. Hide unconfigured providers rather than showing dead buttons. Consent, canceled authorization, unavailable provider, denied linking, username conflict, pending expiration and last-method refusal all need actionable UI. Skip last-used-provider decorations in first release.

## 7. Provider setup and configuration

No hosted application is needed for local implementation. Register development provider apps; production registrations/credentials and HTTPS callback configuration are a later deployment gate.

Proposed localhost callbacks:
- http://localhost:5001/v1/auth/google/callback
- http://localhost:5001/v1/auth/github/callback

Google: configure project/consent branding/audience/test users where required and a web OAuth client. GitHub: register an OAuth application with the callback and minimal identity scope. The owner enters credentials locally; never paste or print secrets. No billing upgrade or paid auth service is required by this scope.

Proposed environment names: GOOGLE_AUTH_ENABLED, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, GITHUB_AUTH_ENABLED, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_REDIRECT_URI, plus the existing configured frontend/API origins. Zod validation requires complete settings only for enabled providers. All secrets are backend-only; document placeholders in .env.example without reading existing .env values. Use separate development/production credentials and exact callback registrations. HTTPS/Secure cookie behavior, public consent/branding requirements and provider publishing status must be checked before production release.

## 8. Work sequence and gates

| Stage | Deliverable | Exit evidence |
| --- | --- | --- |
| SOC-1 Foundation | Dependency review; null-password compatibility; identity migration/model; transaction/proof storage; contracts and migration rollback guard | Existing local auth/account flows pass; isolated migration up/down/refusal; no provider enabled |
| SOC-2 Google | Google validation adapter, login/signup/consent and public session completion; buttons | Controlled provider integration and browser journeys; real Google check when owner setup is available |
| SOC-3 GitHub | GitHub adapter/private verified email handling; same shared flows | Same contract/security suite, private-email and subject-stability tests; real GitHub check |
| SOC-4 Account management | Connected accounts, explicit linking/unlinking, first-password setting and social-only deletion/export | Ownership/recent-proof/race/last-method/last-Admin and regression tests |
| SOC-5 Release verification | Full auth/account regression, contracts/builds, screenshots/setup guide and live two-provider matrix | All mandatory acceptance items verified; report limitations honestly; no push without instruction |

Keep providers off until null-aware compatibility and sensitive-account operations are complete; SOC-2/3 can be tested in isolated environments while SOC-4 is still being built. If provider credentials are unavailable, controlled implementation/testing can proceed, but the milestone remains pending live verification. Do not claim mocked flows validate provider configuration.

## 9. Acceptance and test matrix

1. Existing register/login/me/refresh/logout, password change, account deletion, roles/ownership and session expiry continue to work. Nullable hashes never cause a 500 or a fake local-password login.
2. Google and GitHub each support new registration with consent, returning login, page return and refresh/logout. Existing account data/roles remain attached to the same user UUID.
3. Unknown provider IDs and forged/missing/replayed/wrong-browser/wrong-provider state, wrong PKCE/nonce, invalid signatures/audiences/issuers/expiries, mixed-up provider responses and malicious return paths are rejected without session creation.
4. Verified-email policy works for new accounts, GitHub private email and absent/unverified email. Existing linked subjects remain stable across handle/email changes. Matching emails never silently merge users.
5. Duplicate/racing registration/link callbacks create at most one user/identity. Used transactions and pending-registration/proof cookies expire and cannot be replayed. Consent rejection creates no account.
6. Linking/unlinking requires the owning authenticated account and fresh, action-bound proof. Cross-account identity transfer, proof reuse and parallel removal of the last method are refused. Roles are never granted from provider fields.
7. Social-only users can set a password and delete their account after appropriate reauthentication; password users retain existing verification. Last-working-Admin protections, export redaction and deletion cascades are checked.
8. Google/GitHub denial, network timeout, Redis failure, rate limiting and malformed upstream responses produce recoverable local errors. Existing email login remains available when configured; a social-only user cannot be promised offline/password access they have not set up.
9. No secrets/tokens appear in URLs, localStorage, logs, exports, snapshots or browser artifacts. Session hint restoration is tested from a clean browser without an existing sf_session cookie.
10. Responsive light/dark desktop/mobile layouts, keyboard use, provider buttons, consent, return navigation, page reload and Settings flows pass in the browser. Production build gets a separate smoke check; production-credential/HTTPS validation remains a deployment gate.
11. Meaningful deliberate faults must fail tests: bypass state/nonce, enable email auto-link, bypass last-method guard and leak callback tokens. Restore only the applied temporary faults; never weaken expectations.
12. Checks: backend build/lint/unit/e2e; frontend build/lint/typecheck/unit and affected/full auth browser journeys; canonical contract parity/generated client types; new route inventory; isolated migrations. Update the persistent report with command results, failures/fixes and limitations. Correct obsolete existing tests only with required owner approval.

Manual live acceptance (owner present): each provider's new user, returning user, canceled consent, existing-email conflict, explicit link, disconnect protection, reauthentication, logout/refresh and return-to-page. Use disposable accounts and avoid recording credentials/tokens. The owner types provider passwords/MFA/consent personally; do not automate around provider sign-in protections.

## 10. Rollout, rollback and completion

Ship migration/null-aware account compatibility with provider entries disabled first. Enable each provider only after isolated tests and account-management support pass. A safe rollback disables new OAuth entry/enrollment while retaining null-aware code/data; it does not roll back to legacy code that assumes every password hash exists. Preserve existing identities/users and access-method recovery instructions. Planned provider disablement must consider social-only accounts; hiding a button does not create a fallback password.

Before calling this complete: both real provider registrations must be configured and tested, the full mandatory matrix must pass, migration/rollback behavior must be demonstrated on disposable databases, documentation and the living report must match the implementation, and remaining limits must be stated. No production-readiness claim based only on local mocks. The original planning task performed no implementation. Subsequent approved implementation and isolated test-data changes are recorded in the latest report entry; no owner migration, live provider call, commit or push was performed.

## 11. Sources checked for this plan

Repository files listed in section 2; AGENTS.md, PROJECT-STATE.md and newest HANDOFF-LOG entries. Official provider documents checked on 26 November 2026:
- Google OIDC: https://developers.google.com/identity/openid-connect/openid-connect
- GitHub authorization-code/PKCE flow: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
- GitHub verified/private email API: https://docs.github.com/en/rest/users/emails#list-email-addresses-for-the-authenticated-user

Provider behavior and console requirements should be rechecked during implementation; this scope does not freeze external APIs. Future milestone work must update the existing progress report, preserve history, record verification evidence and reassess affected earlier requirements. Updates are not automatic.


Implementation clarification: sensitive routes use /v1/auth/oauth because the existing refresh cookie is scoped to /v1/auth. Completion is GET /v1/auth/oauth/completion; provider reauthentication is POST /v1/auth/oauth/:provider/reauth; social-only deletion is POST /v1/auth/oauth/delete. Action proof expiry/invalid passwords are local 403 errors, distinct from expired account sessions.
