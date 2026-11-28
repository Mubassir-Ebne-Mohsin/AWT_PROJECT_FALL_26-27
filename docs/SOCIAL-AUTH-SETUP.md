# Google and GitHub sign-in: local setup and acceptance

Status, 26 November 2026: implemented locally with controlled-provider tests. Both providers are **off by default**. Real Google/GitHub sign-in is not verified: the owner has not created the OAuth applications. This is not a completed live-authentication milestone. No owner database migration, provider request, commit or push was performed.

## 1. Prepare the local application

Keep the existing email/password sign-in. Start the project's development PostgreSQL and Redis as described in the root README. From PowerShell:

```powershell
Set-Location 'C:\ADVANCED WEB TECH\AWT_PROJECT_FALL_26-27\STRESSFORGE\nest-boilerplate\nest-boilerplate'
pnpm install --frozen-lockfile
pnpm migration:run
```

Run the migration yourself against the intended local database after backing it up. Migration `1795300000000-SocialIdentities.ts` makes `users.password_hash` nullable and adds `external_identities`. It preserves existing passwords and stores provider identifiers, not provider tokens. The new code is compatible with password accounts; do not enable providers before applying the migration.

## 2. Register the provider applications yourself

Use a development application for localhost and a separate application/credentials for production. Do not paste client secrets into chat, screenshots or source code.

Google: create a Web application OAuth client in Google Cloud / Google Auth Platform, configure the consent screen and add your account as a test user if the application is in testing. Request only OpenID, email and profile identity scopes. Set the exact authorized redirect URI:

```text
http://localhost:5001/v1/auth/google/callback
```

GitHub: Settings → Developer settings → OAuth Apps → New OAuth App. Homepage: `http://localhost:3000`. Authorization callback URL:

```text
http://localhost:5001/v1/auth/github/callback
```

The implementation requests only `read:user user:email`; it does not request repository access. The account needs a verified primary email; private email is supported through GitHub's authenticated email API. If none is verified, fix it at GitHub and retry. Google and GitHub authorization screens, password/MFA and consent are completed personally by the owner.

## 3. Configure only the backend

Copy the variable names/placeholders from the backend `.env.example` into your own local configuration. Never commit the actual `.env`. Supply the provider-issued client ID and secret there. The code does not expose either secret to Next.js.

```dotenv
FRONTEND_URL=http://localhost:3000
CORS_ORIGINS=http://localhost:3000
GOOGLE_AUTH_ENABLED=true
GOOGLE_CLIENT_ID=<Google Web client ID>
GOOGLE_CLIENT_SECRET=<Google client secret>
GOOGLE_REDIRECT_URI=http://localhost:5001/v1/auth/google/callback
GITHUB_AUTH_ENABLED=true
GITHUB_CLIENT_ID=<GitHub OAuth client ID>
GITHUB_CLIENT_SECRET=<GitHub client secret>
GITHUB_REDIRECT_URI=http://localhost:5001/v1/auth/github/callback
```

These are placeholders, not usable credentials. Enable each provider independently. Keep disabled until its credentials are ready. Restart the backend after changing configuration. Enabled but incomplete configuration fails at boot. Use `localhost` consistently rather than mixing it with `127.0.0.1`. Existing frontend API configuration must point to the backend's `/v1` API.

```powershell
# Backend terminal, in the backend folder
pnpm start:dev
# Separate frontend terminal
Set-Location 'C:\ADVANCED WEB TECH\AWT_PROJECT_FALL_26-27\STRESSFORGE\web'
pnpm dev
```

Visit `http://localhost:3000/login` or `/register`. Configured buttons appear beside the existing email option. Provider availability failure hides the optional buttons and retains email login. Internet is required for provider sign-in. Disabled providers do not appear.

## 4. Behavior to expect

New provider identity → verified-email pending form → display name, optional username and explicit terms/privacy acceptance → normal JWT session. No user exists before final consent. The verified email is read-only. A matching email on an existing account never silently merges: sign in to that existing account and connect the provider in Settings → Security.

Returning linked identity → existing local user, unchanged roles/email/profile → normal short-lived in-memory access JWT and rotating httpOnly refresh cookie. The public `/auth/complete?oauth=1` route restores a clean browser session. The fixed query flag is not a credential; access, refresh and provider tokens never go in URLs.

Settings → Security → Connected accounts shows login methods. Select an action, authenticate with the current password or an already-linked provider, then explicitly confirm. Proofs last at most five minutes, are single-use and bind the account, browser, refresh family and exact action. Expired/used proofs ask for authentication again without expiring an otherwise valid login. Unlink cannot remove the last usable method. A social-only account can set a first real password or delete itself after provider authentication; existing password users retain password confirmation. Last-working-Admin protection still applies.

Local disconnect removes the STRESSFORGE identity binding; it does **not** revoke consent in the provider's own settings. Provider access tokens are used transiently, not retained. Provider reauthentication is not claimed as MFA and may reuse an existing provider session without asking for a password.

## 5. Required owner-present live acceptance (still pending)

Use disposable accounts and record only outcomes/statuses, never tokens/cookies/passwords. Test separately for Google and GitHub:

- New registration, declined consent/no local user, returning sign-in and return-to-page from a clean browser.
- Canceled provider authorization, unavailable provider and verified/private/missing-email behavior.
- Existing-email collision: no auto-link or data/role transfer.
- Explicit Settings linking, wrong identity/account refusal, proof reauthentication, last-method disconnect refusal, then disconnect after another method is available.
- Social-only first password, email/password login afterward, session refresh/rotation and logout/revocation.
- Social-only deletion with typed phrase and fresh proof; last-working-Admin refusal.
- Desktop/mobile, keyboard, light/dark, page reload and readable local errors.

Update `STRESSFORGE-PROGRESS-REPORT.md` and `PROJECT-STATE.md` with observed results. Do not mark SOC-5 complete until this matrix passes.

## 6. Implementation map and operational limits

Backend: `src/modules/social/` holds protocol client, Redis state/proof storage, login/registration flow, account-method service, controller and module. Canonical requests/responses are in `src/common/contracts/phase3/social.schema.ts`; Phase3 OpenAPI/client types are generated from them. Sensitive JSON routes deliberately live under `/v1/auth/oauth/` so the existing refresh cookie scoped to `/v1/auth` is available. Own methods: `GET /v1/auth/oauth/identities`; local proof: `POST /v1/auth/reauthenticate`; provider action endpoints: `/v1/auth/oauth/{provider}/{link|reauth|unlink}`; first password/deletion: `/v1/auth/oauth/{password|delete}`. Origin checks protect state-changing requests; browser-bound state, PKCE and Google nonce protect redirect flows.

Frontend: `components/auth/social-{buttons,registration,completion}.tsx`, `components/settings/social-settings.tsx`, `lib/api/social.ts`, `app/auth/complete/page.tsx`, `styles/social-auth.css`. Proofs stay in module memory and disappear on reload; obtain a new proof when needed. Existing routes now total 49. Owner-approved route-count tests preserve the old checks.

Added backend dependencies: `oauth4webapi` 3.8.9 for OAuth/PKCE/token-response processing; `jose` 6.2.18 for Google JWT/JWKS signature validation. No paid identity platform, frontend package or AI call was added.

Production remains a separate deployment gate: use exact HTTPS callback/root URLs, secure cookies, intentional same-site frontend/API hosting, trusted reverse-proxy/forwarded-IP settings, restricted CORS, protected Redis/PostgreSQL, secrets management and provider production-consent configuration. Arbitrary cross-site hosting is not verified by localhost tests. Do not disable a social-only account's last provider without a recovery plan.

Rollback: disable provider entry first while retaining the null-aware code and existing data. Migration down refuses when social-only accounts or identity records would be lost. Never fabricate passwords/delete users to force rollback; never return to legacy code that assumes every password hash exists.

Official setup references: [Google OIDC](https://developers.google.com/identity/openid-connect/openid-connect), [GitHub OAuth](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps), [GitHub emails](https://docs.github.com/en/rest/users/emails#list-email-addresses-for-the-authenticated-user). Recheck provider-console instructions when configuring live applications.
