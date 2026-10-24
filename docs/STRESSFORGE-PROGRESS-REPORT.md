# STRESSFORGE progress report

> **Latest update: 2026-10-24 (Asia/Dhaka). Phase 1: COMPLETE for the local Foundation scope, with documented dependency follow-ups. Original audit: PARTIAL on 2026-10-22; see section 9 for closure evidence.**

> **Publication scope:** Phase 1 remediation baseline **9e8bb00** was published to GitHub main on 2026-10-24. M1–M3 implementation and checkpoints are local on **codex/phase2-contracts**, not yet published. Phase 2 is in progress; M3 implements the first usable design journey; see section13 for its verification and limitations.

## 1. Maintenance instructions

Nothing updates this file automatically. Whoever completes a later phase (a person or an agent) must update THIS report before calling the phase done. They must:

1. Add the new phase's checklist and results, and keep every earlier section and the update history.
2. Record new verification evidence: exact command, result, exit status, short output quote. Tag each conclusion `[Verified]`, `[Inferred]` or `[Untested]`.
3. Re-check earlier requirements that the new work touches (auth, error codes, route registry, API types) and change their status if they regressed.
4. Update the phase tracker (section 3) and the latest dated verdict (currently section 9). Preserve the original section 7 verdict as history.
5. Add a dated entry to the update history (section 8), newest first.

Audit rules used for Phase 1 (reuse them): audits do not change application source, config, dependencies, migrations or existing tests; they may add new test files and edit this report. No secret values are printed or recorded. Never mark something Verified without a command or test result behind it.

## 2. Project overview

StressForge (working title "Architecture Stress Test") is a web app where users draw a system architecture on a canvas, a simulator finds its bottlenecks under a traffic profile, and AI drafts, fixes and explains designs. Course constraints: AI central, zero cost to run, web app, not a management-style app.

| Item | Value |
| --- | --- |
| Backend | `nest-boilerplate/nest-boilerplate`: NestJS 11, TypeORM, PostgreSQL 16, Redis 7, zod / nestjs-zod, argon2, JWT |
| Frontend | `web`: Next.js 16 (App Router), React 19, Tailwind 4, TanStack Query, next-themes, cmdk, sonner, zod |
| Package manager | pnpm (lockfiles in both projects) |
| Local services | `docker-compose.dev.yml` in the backend folder |
| Design reference | `nest-boilerplate/nest-boilerplate/docs/stressforge/reference/architecture-stress-test.html` (and `mock-engine.js`) |

Build and run: see `README.md` at the repo root.

Sources used to define phase requirements:

- `nest-boilerplate/nest-boilerplate/docs/stressforge/PHASE-1-PROMPT.md` (the Phase 1 specification; the only roadmap-like document found).
- The prototype's `PHASE_NAMES` and route phases (SECTION 5) for the phase names of Phases 2 to 5.
- `README.md` and `docs/ARCHITECTURE.md` (what the project claims).

No CLAUDE.md, CONTRIBUTING file or earlier progress report exists. `web/AGENTS.md` only says Next.js 16 differs from older versions.

## 3. Phase tracker

| Phase | Name | Status |
| --- | --- | --- |
| 1 | Foundation | Complete (2026-10-23): functional findings closed; dependency reachability triaged; evidence and limits in section 9 |
| 2 | Core loop (designs API, simulation module, canvas editor, Traffic / Results / Limits) | In progress (2026-10-24): M0 published baseline + M1 contracts/fixtures + M2 engine/worker complete; M3 first saved-design journey complete; M4–M9 not started. See section13; local Phase 2 changes not yet published |
| 3 | Improve and history | Not started |
| 4 | Public and learning pages | Not started |
| 5 | Evaluation, settings, onboarding, developer screens | Not started |

Phase 1 has a complete Foundation audit; Phase 2 verification now includes the M3 saved-design journey; full Phase2 completion still requires M4–M9.

## 4. Phase 1 checklist — original 2026-10-22 baseline

**Legend:** verified = inspected code plus relevant observed checks; partial = implementation exists but a defect or required check remains; missing = absent; blocked = unable to verify in this environment. References are relative to the project root. **API/** = `nest-boilerplate/nest-boilerplate/`; **WEB/** = `web/`. Passing a build is not evidence of complete behavior.

### Constraints and ten boilerplate fixes

| Requirement | Implementation and evidence | Status |
| --- | --- | --- |
| Preserve backend, sibling frontend, pnpm | Original nested API, sibling web, package scripts and both lockfiles inspected | verified |
| Node 22 | API/.nvmrc and Dockerfile specify 22; audit actually ran Node v24.14.1, pnpm 12.14.0 | blocked |
| Free local runtime, no Phase 1 AI calls | Local Compose; scripted-reply.ts is a local function, no model provider integration found | verified |
| Git and no committed .env | HEAD 2fefde6; tracked worktree initially clean; git ls-files shows examples, not secrets; .env/.env.local confirmed ignored | verified |
| 1. Real AuthGuard JWT verification | auth.guard.ts; live missing token = 401; audit tests reject wrong signature/type, expiry and revoked jti | verified |
| 2. USER/ADMIN hierarchy | role.enum.ts and roles.guard.ts; hierarchy unit tests pass. No role-decorated app endpoint tests the full stack | partial |
| 3. Rebrand and versions | API package, Swagger, READMEs, dev Compose use StressForge; .nvmrc/Dockerfile = 22; legacy compose intentionally retained | verified |
| 4. One config load, usable Redis config, PORT default | app.module.ts has one ConfigModule; app.config.ts constructs REDIS_URL and defaults PORT=5001; config tests pass | verified |
| 5. Naming strategy index | database.config.ts uses length-1; UserStatus -> user_statuses tested | verified |
| 6. Migrations work source/dist | Extension chosen using __filename; source migration applied; compiled app reads users; focused glob tests pass | verified |
| 7. zod everywhere | Global ZodValidationPipe and zod DTOs; class-validator/transformer removed. Parser failures still violate status contract (F7) | partial |
| 8. Separate dev Compose | Postgres 16, Redis 7, named volumes/healthchecks; isolated fresh project healthy; legacy compose unused | verified |
| 9. Remove unused OIDC variables/readers | Source scan and env example show no AUTH_SERVER integration | verified |
| 10. /v1 and /docs instead of /api | Live /v1/health, /docs, /docs-json work; setup inspected | verified |

### A. Backend

| Requirement | Implementation and verification | Status |
| --- | --- | --- |
| A1 env boot validation and commented example | config/app.config.ts and .env.example; synthetic short JWT secret stops startup with field-name message. Public example secrets accepted in production (F12) | partial |
| A2 prefix, Swagger JSON, credentialed CORS/OPTIONS | app.setup.ts; real preflight 204, exact localhost:3000 origin and credentials=true | verified |
| A2 global validation/filter, safe logs | APP_PIPE/FILTER, RequestLoggerMiddleware; logging sentinel test passes. Parser errors misclassified (F7) | partial |
| A3 data/meta envelope and stable codes/statuses | Envelope tests cover values/null/meta; code tests cover all AppException codes; actual malformed JSON is 400 VALIDATION_FAILED, oversized request is 500 INTERNAL | partial |
| A4 health Postgres + Redis, 200 or 503 details | Real service stop/recovery checks; postgres:down/redis:down details observed; healthy recovery = 200 | verified |
| A5 user entity/migration UUID, lowercase unique email, argon2, role, name, timestamps | User entity and CreateUsers migration; fresh migration; SQL aggregate confirms 3 rows all lowercase/argon2id | verified |
| A5 register/login/me, no hash, same wrong-credential message | Real normal flows pass, hash omitted, identical credential error. Concurrent duplicate email = 500 (F6) | partial |
| A5 short access JWT body + in-memory token | JWT TTL default 900s; client.ts module variable; no localStorage token persistence found | verified |
| A5 httpOnly/Lax cookie, rotating refresh, real Redis revocation | Cookie attributes and immediate replay rejection verified; revocation entries observed. Family TTL defect F1 | partial |
| A5 logout revokes session | Normal 204 and old-token 401 pass; injected storage failure silently swallowed (F2) | partial |
| A5 auth route rate limiting | Real Redis-backed login sequence: ten 422 validation responses then two 429s; existing limiter e2e also passes with in-memory storage | verified |
| A5 AuthGuard/CurrentUser/Public/RolesGuard end to end | Public routes and /me work; role guard tested in isolation but no real @Roles endpoint/e2e | partial |
| A5 demo seeder/password documented | Fresh seed run twice successfully; browser demo login succeeds | verified |
| A6 auth unit and supertest e2e tests | Original 11 unit + 16 e2e pass; additional tests expose defects. Test typecheck fails; Redis is substituted in e2e | partial |
| A7 no designs module | Only users/auth/health app modules; simulator/design APIs not built | verified |

### B. Frontend

| Requirement | Implementation and verification | Status |
| --- | --- | --- |
| App Router/strict TS/Tailwind/ESLint, requested libraries | package.json/tsconfig/providers inspected; lint/typecheck/build pass; installed Next 16.4.2 (latest registry version not separately checked) | verified |
| B1 prototype tokens, light/dark/semantic palette, spacing/radii/fonts | proto.css, globals.css and next/font match named tokens/fonts; computed Instrument Sans and light background verified. Visual screenshots timed out | partial |
| B1 persistent Light/Dark/System selection | Default follows system, explicit light/dark persist, but no control selects System again (F8) | partial |
| B2 topbar/user menu/palette/breadcrumbs | Ctrl+K focuses search, 54 production destinations; routes render. Generic workspace titles and missing dashboard breadcrumb (F13) | partial |
| B2 AI shell, help, ?, feedback and toasts | Local scripted replies labelled Scripted mock; help/keyboard lifecycle inspected, focus-return defect (F9). Full click-path test unfinished | partial |
| B3 single typed registry, prototype routes, all page files | Set parity: 35 prototype patterns = 35 registry patterns, no extras/missing; check:routes passes | verified |
| B3 placeholders: correct title/crumb/phase/planned features; no dead buttons | Shared placeholder used for future routes; sampled pages work. Some planned content generic; full all-control audit incomplete | partial |
| B4 all required states and real failures | All 10 demo states rendered at 1024/dark; real API-off waking/recovery passes. API 404 and some 401/429 branches lack mapping (F4/F5) | partial |
| B4 hidden dev switcher absent production | Dev Ctrl+Shift+D works; production shortcut produces no menu; conditional import inspected | verified |
| B5 real login/register validation/loading/errors/return-to/logout | Browser login + HTTP register/logout work; real source forms implemented. Complete UI edge matrix not run; switching auth pages loses next path (review note) | partial |
| B5 protected proxy/session, memory token, silent refresh, one retry then expired | proxy.ts hint gate plus client/API enforcement; normal restore works; terminal retry-401 and refresh-429 regressions fail | partial |
| B6 typed fetch, ApiError, envelope unwrap and Query provider | Implementation inspected; generated schema matches committed file; error-state integration incomplete | partial |
| B7 API user name + Phase 2 dashboard cards | Browser name/email/role loaded from /auth/me; future cards visibly labelled | verified |
| B8 laptop responsiveness/accessibility/reduced motion | Checked screens no overflow at 1440/light and 1024/dark; labels/modal trap/reduced-motion CSS inspected; drawer focus fails; full matrix/screen-reader testing incomplete | partial |

### C. Docs and definition of done

| Requirement | Evidence | Status |
| --- | --- | --- |
| C root README exact PowerShell setup | Present, but starts Docker before copying env and assumes terminal directory; no workstation port-conflict guidance (F14) | partial |
| C backend README rebranded/accurate | Present; scripts/test-double notes useful; root architecture link points to wrong relative location | partial |
| C architecture module map/auth diagram/error table/Phase 2 note | All present; security claims need revision alongside F1/F2 fixes | verified |
| D1 dev containers healthy | Fresh isolated Compose services healthy | verified |
| D2 fresh migrations and seed | Migration applied; seed twice succeeds | verified |
| D3 backend build/lint/unit/e2e/health/Swagger | All baseline checks pass; meaningful audit regressions fail and test typing fails | partial |
| D4 manual HTTP walkthrough | Normal sequence passes; edge failures documented below | partial |
| D5 web build/lint/typecheck/gen:api | All pass; exact generated schema match | verified |
| D6 full 1440/1024 × light/dark browser checklist | Substantial checks, not complete four-way form/route/control matrix; title/theme/focus defects and screenshot timeout | partial |
| D7 API stopped -> unreachable instead of crash | Actually stopped audit API: waking screen, no crash overlay, automatic dashboard return after restart | verified |

Phases 2–5 are deliberate placeholders, not Phase 1 defects. Their displayed simulation/quota/maintenance content does not implement those systems.


## 5. Checks performed and limitations

**Baseline and safety.** Audit date 2026-10-22, Asia/Dhaka. HEAD `2fefde6`, prior commit `8936b6a`; tracked files initially clean. Actual Node v24.14.1/pnpm 12.14.0. Tests used fresh Compose project `stressforge-phase1-audit`, host Postgres **5545**, Redis **6391**, and separate e2e DB `stressforge_phase1_audit_test`. Existing non-audit application data was preserved. Existing e2e tests truncate users; they ran only in that disposable audit test database. No paid APIs or production systems were used. Application behavior/config/dependencies were not edited.

| Command/check | Observed result |
| --- | --- |
| API: pnpm build | PASS, exit 0 |
| API: pnpm lint:check | PASS, exit 0; 22 warnings, 0 errors. Used read-only equivalent because pnpm lint has --fix |
| API: pnpm exec tsc --noEmit --pretty false | FAIL, nonzero exit; **191 current-tree diagnostics**, including newly present audit tests. Original test globals and pg declaration errors also predate these added tests |
| Original pnpm test -- --runInBand | 11/11 PASS, 1 suite |
| pnpm test:e2e on isolated audit DB | 16/16 PASS, 1 suite; real Postgres, fake Redis, in-memory rate counters |
| Focused phase1-audit.spec.ts | Runner PASS: 44 cases = 39 ordinary checks + **5 it.failing cases that confirm known defects still exist** |
| Final full unit run with coverage | 55 runner passes across 2 suites = 50 ordinary passes + 5 expected failures; exit 0. Coverage across src/**/*.ts: statements 34.19% (266/778), branches 32.79% (121/369), functions 31.93% (38/119), lines 33.67% (232/689) |
| node docs/audit/phase1-regressions.cjs | **FAIL**, exit 1: 1 control passes; 6 desired-behavior assertions fail (F1/F2/F4/F5/F7). No network/DB needed |
| Fresh Compose up -d --wait, isolated project/ports | Postgres16/Redis7 both healthy |
| pnpm migration:run; seeder:run:dev twice | Migration applied, both idempotent seeds succeed |
| Compiled API startup | Real Postgres/Redis API on localhost:5001; Redis ready |
| Synthetic invalid secret startup | Rejected with readable JWT_ACCESS_SECRET minimum-length error; no secret values recorded |
| SQL aggregate on fresh audit DB | 3 rows, all emails lowercase and all hashes start argon2id; raw hashes not displayed |
| WEB: pnpm lint/typecheck/check:routes/build | All PASS; 35 route patterns have page files; 29 static pages plus dynamic routes and Proxy build |
| WEB: openapi-typescript /docs-json to temporary file | PASS; generated SHA256 equals committed schema.d.ts. Same command/endpoint as gen:api, avoiding tracked-file rewrite |
| pnpm audit --prod --json | Frontend metadata: zero advisories. Backend: **1 critical, 26 high, 17 moderate, 3 low** severity findings. These are package scan results; app exploitability not established |
| Clean production console sample | No errors/warnings. Intentional outage requests produce expected browser network errors |
| Prototype | Browser opened original login; source/tokens/fonts inspected. DevTools screenshot capture timed out; visual fidelity remains unverified |

No frontend automated test runner is configured. The standalone client harness tests selected branches, not React rendering. Coverage is evidence of gaps, not a new acceptance threshold.

**Real HTTP outcomes** against audit Postgres and Redis:

| Scenario | HTTP / result |
| --- | --- |
| GET /v1/health; /docs; /docs-json | 200 |
| Valid register; login; me with access | 201; 200; 200 |
| me without token; unknown API route | 401 UNAUTHENTICATED; 404 NOT_FOUND |
| Refresh; replay original; use rotated after replay | 200; 401 SESSION_EXPIRED; 401 SESSION_EXPIRED immediately |
| Logout; me using old access | 204; 401 |
| Wrong password vs unknown email | Identical 401 message: Incorrect email or password |
| Invalid registration | 422 VALIDATION_FAILED |
| Malformed JSON body | **400 VALIDATION_FAILED** |
| Oversized JSON (~150 KB password field) | **500 INTERNAL**, despite a client request-size error |
| Two simultaneous register requests for one new email | **201 and 500 INTERNAL** |
| Credentialed localhost:3000 preflight | 204; exact origin; allow-credentials true |
| Redis limiter | Ten 422 validation responses, then two 429 responses |
| Stop isolated Redis | 503 UNAVAILABLE with redis:down |
| Stop isolated Postgres | 503 UNAVAILABLE with postgres:down (Redis was still reconnecting in that sample) |
| Restart services | Subsequent 200 with both up |
| Stop audit API, reload dashboard | Waking up the server; no crash overlay; automatic dashboard recovery when restarted |

**Browser evidence.** Demo form login reaches dashboard and shows /auth/me user data; document.cookie exposes only the session hint, not the httpOnly refresh token. At 1440/light, 33 representative URLs cover the registry's non-auth route patterns and aliases. At 1024/dark, dynamic workspace/evaluation/settings variants were also checked; no checked screen overflowed. Some intermediate samples were interrupted by service-failure/session redirects and are not counted as successful route checks. The full four-combination matrix (both sizes, both themes, all forms/controls/routes) remains incomplete.


Ctrl+K opened/focused search; Escape closed the palette. Help focused Close help, but after Escape focus was BODY. Production Ctrl+Shift+D rendered no dev menu. Dev mode rendered all 10 states: 404,403,500,waking,rate-limited,quota,session,simulation-failure,invalid-AI-output,maintenance. Demo rendering is not proof of real later-phase quota/maintenance implementations. Workspace browser titles remained generic Workspace; dashboard has no crumb component. Screenshot capture timed out, preventing visual sign-off.

**Repeatable commands** (use isolated resources, not your application database):

```powershell
# From the backend folder; overrides affect this process only.
$env:DB_PORT = '5545'
$env:REDIS_PORT = '6391'
$env:DB_TEST_DATABASE = 'stressforge_phase1_audit_test'
docker compose -p stressforge-phase1-audit -f docker-compose.dev.yml up -d --wait
pnpm migration:run
pnpm seeder:run:dev
pnpm test:e2e
# From STRESSFORGE root after API build:
node docs/audit/phase1-regressions.cjs
```

**Manual auth walkthrough** (PowerShell 7; do not record tokens):

```powershell
$api = 'http://localhost:5001/v1'
$body = @{email='audit-new@example.test'; password='Audit-Pass-123!'; displayName='Audit'}
$r = Invoke-WebRequest "$api/auth/register" -Method Post -ContentType 'application/json' -Body ($body | ConvertTo-Json) -SessionVariable cookies
$r.StatusCode # 201
$loginBody = @{email=$body.email; password=$body.password} | ConvertTo-Json
$r = Invoke-WebRequest "$api/auth/login" -Method Post -ContentType 'application/json' -Body $loginBody -WebSession $cookies
$r.StatusCode # 200
$headers = @{Authorization="Bearer $(($r.Content | ConvertFrom-Json).data.accessToken)"}
(Invoke-WebRequest "$api/auth/me" -Headers $headers).StatusCode # 200
(Invoke-WebRequest "$api/auth/refresh" -Method Post -WebSession $cookies).StatusCode # 200
(Invoke-WebRequest "$api/auth/logout" -Method Post -WebSession $cookies -Headers $headers).StatusCode # 204
(Invoke-WebRequest "$api/auth/me" -SkipHttpErrorCheck).StatusCode # 401
```


## 6. Findings, ordered by severity

At the original 2026-10-22 baseline all findings below were open. Section 9 records their current disposition; original reproductions are preserved as history. **Verified** means reproduced by observed HTTP/browser/test results. **Inferred** means code supports a concern without a complete runtime reproduction. File references use the API/ and WEB/ prefixes above.

### F1 — High — refresh-family revocation expires too early

**Verified.** API/src/modules/auth/auth.service.ts:68–75 and token-store.service.ts:61. Revocation TTL uses the replayed token's remaining life, while rotation issues a new full-life token. Reproduction in both audit test files: set a synthetic TTL=10 seconds; issue at t=0; refresh at t=9; replay original at t=9; advance to t=11. The rotated token (valid until t=19) refreshes successfully after the family marker expires. **Impact:** a token from a supposedly revoked family becomes usable again. **Fix:** retain revocation through the latest/maximum family expiry, never shorten revocation, and cover time/rotation races. This must be fixed before completion.

### F2 — High — logout swallows revocation storage failures

**Verified by fault injection.** API/src/modules/auth/auth.service.ts:85–103. Inject a rejection from revokeFamily/revokeAccess: logout resolves and its controller clears cookies/returns 204. The catches cover both JWT verification and Redis writes. **Impact:** caller believes server-side tokens were revoked although they can remain usable. The global Redis limiter may fail before some requests reach this code, but cannot guarantee a later write succeeds. **Fix:** separately catch invalid/expired JWTs; propagate storage failure as UNAVAILABLE, with safe retry behavior. Local frontend sign-out may still complete without claiming successful server revocation.

### F3 — High — production dependency advisories need triage

**Verified package scan; exploitability untested.** API/pnpm-lock.yaml and package.json. Registry metadata reports 47 severity findings: 1 critical, 26 high, 17 moderate, 3 low. Example: proxy-addr **2.0.7**, path @nestjs/platform-express > express > proxy-addr, [GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h), patched >=2.0.8. Default trust-proxy=0 means a trusted IPv6 subnet advisory is **not proof this configuration is exploitable**. Other results include multer, socket.io-parser, engine.io, minimatch and transitive tooling. **Fix:** determine reachability/configuration per advisory; update compatible affected chains and lockfiles, remove truly unused dependencies, rerun tests/audit. No automatic updates were applied.

### F4 — Medium — terminal 401 and refresh 429 mishandled

**Verified client harness.** WEB/src/lib/api/client.ts:121–166. Reproduce original request=401, refresh=200, retry=401: no session-expired event is emitted. Reproduce refresh=429: every non-5xx response forgets credentials, falsely treating rate limiting as invalid authentication. **Fix:** distinguish credential failure, rate limit, server failure and network outage; preserve session on 429, emit rate-limited, and open session-expired after the one retry fails. Add maintained client tests.

### F5 — Medium — API 404 is not connected to the 404 state

**Verified client harness.** WEB/src/lib/api/client.ts:103, api/events.ts, components/providers.tsx. api('/missing') turns a NOT_FOUND body into ApiError but emits no system-state event. The api field in SYSTEM_STATES is metadata only. **Fix:** wire not-found through events/provider or consistently handle resource errors at callers; test real API error mapping.

### F6 — Medium — concurrent duplicate registration returns 500

**Verified HTTP.** API/src/modules/auth/auth.service.ts:41–51 and users/users.service.ts:29–44. Two simultaneous valid registrations with one new email return 201 and 500 INTERNAL: the existence precheck races the unique DB insert. **Fix:** catch PostgreSQL 23505 for the email constraint and return the existing 422 email field error. Keep the unique constraint; add a concurrency e2e case.

### F7 — Medium — parser errors violate the error contract

**Verified HTTP and filter tests.** API/src/common/filters/all-exceptions.filter.ts:83–101. Send malformed JSON: 400 VALIDATION_FAILED, although the specified code maps to 422. Send a JSON body above the parser's size limit (~150 KB): 500 INTERNAL. **Impact:** ordinary invalid client input appears as a server failure or disagrees with client status mapping. **Fix:** normalize validation to 422 and handle known parser errors explicitly; document any intentional additional transport statuses. Keep unexpected internal errors generic.

### F8 — Medium — user cannot return theme to System

**Verified source and command palette.** WEB/src/components/shell/top-bar.tsx:134 and command-palette.tsx:40. next-themes initially defaults to system, but controls only toggle light/dark; appearance settings is a future placeholder. **Fix:** offer accessible Light/Dark/System selection, persist it, test OS changes and reload.

### F9 — Medium — drawer keyboard focus is lost when closing

**Verified browser for Help; similar AI lifecycle inferred.** WEB/src/components/shell/help-drawer.tsx:16 and ai-panel.tsx:23. Open Help, then Escape: focus moves from Close help to BODY, not its opener. **Fix:** save/restore opener focus on unmount for keyboard and close-button paths. Define intentional tab order for nonmodal drawers; a modal trap is not automatically required for an aside.

### F10 — Medium — test code runs without type checking


**Verified compiler.** API/tsconfig.json:16–18, test/global-setup.ts:1, package.json Jest transform. typeRoots excludes node_modules/@types, hiding Jest globals; pg declarations are missing. Full tsc reports **191 current-tree diagnostics**, including added audit tests; original tests/setup also fail. Jest diagnostics=false and build excluding tests hide this. **Fix:** include/configure node/jest types, add pg declarations, enable a test typecheck gate, resolve errors while retaining strictness. The required Node 22 run remains outstanding.

### F11 — Medium — Redis password configuration is inconsistent

**Inferred from configuration; authenticated server test not run.** API/docker-compose.dev.yml and config/app.config.ts. REDIS_PASSWORD is accepted and added to API REDIS_URL, but Compose starts Redis without requirepass and probes it without authentication. **Fix:** configure server/client/healthcheck together or explicitly declare nonempty passwords unsupported for this Compose profile. The default empty-password profile works.

### F12 — Medium — public example secrets pass production boot validation

**Verified schema test.** API/src/config/app.config.ts:33–34 and .env.example:23–24. NODE_ENV=production plus the published example JWT secrets passes length-only validation. **Impact:** misconfiguration is not rejected; no claim is made that deployed secrets are public. **Fix:** fail production startup on known placeholders and equal access/refresh secrets; keep setup guidance and add a startup regression.

### F13 — Low — generic workspace titles, absent dashboard breadcrumb

**Verified browser.** WEB/src/components/shell/app-shell.tsx:133, lib/routes.ts and dashboard/dashboard.tsx. Results heading/crumbs are correct but document title is Workspace; other tabs likewise. Dashboard has an eyebrow but no Crumbs component. Some early-phase placeholders contain only generic planned text. **Fix:** resolve the tab title centrally, use consistent breadcrumbs, and supply concrete planned features from the reference.

### F14 — Low — setup documentation has ordering/path pitfalls

**Verified source; complete fresh-machine shell walkthrough untested.** Root README starts Docker before copying env; backend README has the safer order. Example DB port 5432 collides with this workstation's unrelated local Postgres; the previously configured dev environment uses another port. Unconditional copy can overwrite configured secrets/ports. A new terminal's 'cd web' assumes the root directory. Backend README's architecture path resolves inside the backend. **Fix:** show explicit root paths, copy examples only when missing, configure env/ports before Compose, document conflicts and correct links.

### Other review notes

- **Inferred:** refresh single-flight is only per tab/module. Two concurrent tab restores can race the same rotating cookie and trigger family revocation. Multi-tab reproduction remains untested; use cross-tab coordination if confirmed.
- **Inferred:** switching /login?next=… to plain /register (and back) loses the return-to destination. Preserve a validated next parameter in both auth links and test the flow.
- **Untested:** full actual @Roles endpoint end to end; all menu arrow-key behavior; screen-reader/contrast audit; real root-layout error recovery; full responsive/theme form/route/control matrix; Node 22 clean install. Actual maintenance, AI quota and simulator validation are intentionally later-phase implementations.
- phase1-audit.spec.ts has five **it.failing** cases. Runner green means those defects are reproduced. Once fixed, convert those to ordinary tests and record closures. The standalone regression harness deliberately exits 1 for unresolved desired behavior.

## 7. Original 2026-10-22 verdict and remaining work

**PARTIAL — not complete.** Normal auth, persistence, health, local services, API schema generation and route placeholders work. Passing baseline builds and 27 original tests do not override reproduced auth/security/error-handling defects and required checks still unverified.

Before Phase 1 can be marked complete:

1. Fix F1/F2 and make revocation-expiry/logout-storage regressions pass.
2. Triage F3, update relevant affected packages or document non-reachability with evidence.
3. Repair terminal-401, refresh-429 and API-404 wiring (F4/F5); add maintained frontend tests.
4. Fix duplicate-email race and parser mapping (F6/F7), then add actual HTTP edge tests.
5. Implement System theme and drawer focus restoration (F8/F9); correct titles/breadcrumbs/planned content (F13), and check all controls.
6. Restore test type safety, run the required Node 22 toolchain (F10), and verify real @Roles enforcement end to end.
7. Align/document Redis password support, reject unsafe production examples, and correct setup docs (F11/F12/F14).
8. Finish the exact D6 browser matrix: 1440/~1024, light/dark, registration/login/dashboard/palette/theme/all registry patterns/all states/logout; visually compare the prototype; record no unexpected console errors/overflow. Add missing failure and multi-tab checks where relevant.
9. Update this same report with new evidence/closures, preserve historical failures, and reassess all earlier requirements affected by fixes/later phases.

No phase beyond Foundation is complete. Designs CRUD, canvas, SimulationModule and Traffic/Results/Limits remain Phase 2 work; real AI/improvement/history and later public/evaluation/settings screens remain future work.


## 8. Dated update history

- **2026-10-24 — M3 implementation:** Explicit user approval; owned designs/runs, asynchronous persistent simulation lifecycle, template/replica/save/results/reopen flow and focused failure tests added. All gates passed:146 backend unit/31 API e2e/44 frontend/16 browser checks;4 dev-only browser cases intentionally skipped. Section13 records evidence and limits. Changes remain local.

- **2026-10-24 — M2 completed:** User approved M2. Ported and tested the pure TypeScript engine, builders/wire adapter, bounded worker/admission and failure recovery. Six source fixtures match;144 unit/22 e2e/36 frontend regressions plus source/compiled/watch and real-service health checks passed. Local checkpoint only; M3 not started. See section12.

- **2026-10-24 — M0–M1 completed:** User approved the baseline/contracts stage with a checkpoint before engine implementation. Published Phase 1 fixes9e8bb00; added canonical Zod/OpenAPI/types, six full-precision oracle fixtures, contract tests and CONFLICT integration. Final114 backend unit,22 e2e,36 frontend tests plus builds/types/lint/live checks passed. Phase 2 remains In progress; section11 records scope and limits.

- **2026-10-23 — Phase 2 plan refined:** Re-read local completion/publication status, existing tests and selected prototype/engine sections. Replaced stale Phase 1 repair/test-setup work with a baseline gate, defined M0–M9 and the early working M3 slice, and integrated six independent static-review corrections. Archived the original plan. Planning documents only; Phase 1 verdict unchanged and Phase 2 implementation not started.

- **2026-10-23 — report-only publication:** User requested the updated progress report on GitHub. Published only this Markdown file; explicitly distinguished local verification from the older remote implementation. No application code or secret files included.

- **2026-10-23 — Phase 1 remediation completed:** closed F1/F2/F4–F14 with implementation fixes and observed verification; F3 triaged after compatible updates. Verified Node 22 builds/types/lint, 72 unit + 2 real Redis + 22 e2e + 35 frontend tests, original 7 regressions, real HTTP/service failures, fresh migration/seed, all-route four-combination browser matrix, production dev-control exclusion, and actual API-stop recovery. Preserved the original partial audit and Phase 2 planning edits. Current verdict: Complete for the local Foundation scope with documented dependency follow-ups; see section 9.

- **2026-10-22 — Phase 2 planning:** Created docs/PHASE-2-PLAN.md with scope, Phase 1 prerequisites, milestone dependencies, contracts, test gates and a planning review. Phase 2 is planned only; no implementation is verified and Phase 1 remains Partial.

- **2026-10-22 — review completed to available evidence:** assessed Phase 1 PARTIAL. Recorded original checks, additional audit cases, six failing regression assertions, real local service/HTTP tests, browser observations, package scan and limitations. No application behavior changes.
- **2026-10-22 — draft baseline clarification:** the standalone harness and stressforge-phase1-audit containers were created in this review session. The earlier draft's “pre-existing/left untouched” wording below is preserved as history, not adopted as this session's resource-ownership claim. Existing non-audit project data was preserved.
- **2026-10-22 — original draft entry retained:** “audit started. Scope fixed from PHASE-1-PROMPT.md. Pre-existing state recorded: untracked docs/audit/phase1-regressions.cjs and two Docker containers named stressforge-phase1-audit-* (ports 5545, 6391) existed before this audit and were left untouched.”

Future phase-completion work must update this report manually, preserve earlier history, attach dated command/browser evidence, and reassess earlier affected requirements. Nothing schedules or guarantees automatic future updates.


### 2026-10-22 verification addendum — approved browser signup

After the user explicitly approved a disposable account, browser signup completed against the isolated audit database: registration form first rejected all four empty fields; valid name/email/password/terms submission reached the dashboard and displayed Browser Audit with /auth/me data. Logout cleared the visible session hint and returned to Log in. AI drawer displayed Scripted mock and answered the p95 starter chip locally. Login was also checked at 1024/light and 1440/dark without overflow; this does not complete the full route/form matrix. The earlier browser form-fill approval restriction was resolved for this test. The Phase 1 verdict remains PARTIAL.

Additional observed UI checks: unauthenticated /new/template?audit=1 redirected to login with the encoded destination; login returned to /new/template?audit=1. The ? shortcut rendered Keyboard shortcuts, Escape closed it, and the local feedback dialog accepted test text, closed and showed the “nothing was sent” toast. These supplement B2/B5; the full matrix and documented defects remain open.

Audit cleanup (2026-10-22): audit API and identified audit frontend processes stopped; only the stressforge-phase1-audit Compose project stopped, without deleting its volumes or test data. Docker Desktop and unrelated project services were left untouched. Existing tracked application files have no diff; added/preserved audit artifacts are this report, docs/audit/phase1-regressions.cjs and src/modules/auth/phase1-audit.spec.ts. No commit or dependency update was made.

- **2026-10-22 — GitHub publication preparation:** Phase 1 implementation history, audit tests and this living report prepared for the user-requested initial publication to Mubassir-Ebne-Mohsin/AWT_PROJECT_FALL_26-27 on main. Root README now links this report. The audit verdict and unresolved findings are unchanged; publication does not mark Phase 1 complete.


## 9. 2026-10-23 remediation and re-verification

**Current verdict: COMPLETE for Phase 1 local Foundation scope.** All original functional findings have verified fixes. F3 is closed by compatible updates plus documented reachability analysis; two transitive production advisories remain as follow-up, not a claim of a clean security scan. The user authorized application fixes after the read-only audit. The audit-only restriction in section 1 describes the original audit; it does not prohibit these explicitly requested repairs. Existing Phase 2 planning edits and unrelated data are preserved. No future-phase implementation is included.

### Decisions

- Refresh families now expire at an absolute deadline (seven days from login by default). Rotation changes token ids and preserves the exact signed expiry; cookie maxAge is the remaining lifetime. Versioned refresh claims reject pre-fix sliding cookies, requiring one fresh login after upgrading. No database reset or secret changes are needed.
- HTTP body-parser failures use 422 VALIDATION_FAILED with generic messages. Wrapped syntax errors must not echo submitted credentials. Unexpected server errors are logged without arbitrary exception messages or SQL parameters.
- Browser acceptance uses a separate local audit database and Redis. Its traffic limits can be raised for the route matrix, while separate tests retain normal limit verification. Unit/e2e doubles are distinguished from real-service checks.

### Verification sequence and historical intermediate results

- [Verified] Expanded API e2e: 20/20 passed before the final dependency update, including concurrent registration, parser errors, retryable logout failures and test-only @Roles/@CurrentUser endpoints. Further review added partial-write and cookie-deadline cases, requiring a final rerun.
- [Verified] `node docs/audit/live-phase1.cjs`: 15 real HTTP checks passed against isolated PostgreSQL/Redis: health/docs/schema 200; register 201; login/me/refresh 200; logout 204; revoked/missing credentials 401; malformed/oversized bodies 422; concurrent email registrations 201+422; credentialed CORS OPTIONS 204. No tokens or hashes are recorded.
- [Verified] Stopped only stressforge-phase1-audit Redis: health 503 UNAVAILABLE with redis:down; restarted: 200. Repeated for PostgreSQL: 503 with postgres:down, then 200 recovery. Existing normal application services/data were not stopped or reset.
- [Verified] Opened original prototype at 1440x900. Light tokens: bg #F2F4F7, accent #2446D2, radii 4/6/10px, topbar 52px; dark bg #0B0F15, accent #7D95FF, ok #36C384. Inline screenshot succeeded. Rendered-app comparison is pending.

Final results below supersede the intermediate results above.


### Finding closure table

All rows refer to the original findings in section 6. [Verified] is used only where inspected implementation and observed tests support closure.

| Finding | Current disposition | Implementation and verification evidence |
| --- | --- | --- |
| F1 refresh-family lifetime | verified — fixed | API/src/modules/auth/auth.service.ts preserves an absolute signed expiry across rotation; ver:1 rejects legacy sliding cookies. Auth tests cover still-valid descendant rejection, exact deadline, legacy cookie rejection and cookie lifetime. Original regression harness passes. |
| F2 swallowed logout failures | verified — fixed | JWT parsing catches are separate from revocation writes; writes fail as 503 UNAVAILABLE. Controller retains cookies on failure. E2E covers each partial write failure, successful retry and eventual rejection of both credentials. Frontend catches failure, signs out locally and explicitly warns that the server session may remain active; no stale retry can revoke a later login. |
| F3 dependency advisories | verified — triaged, follow-up retained | Compatible dependency updates, unused Socket.IO/event-emitter removal, and a scoped Swagger serializer update reduce production findings from 47 to 2 (0 critical, 1 high, 1 moderate). Installed Bull only calls uuid.v4; the buffer advisory affects v3/v5/v6. The fixed-value demo seeder calls neither Faker helpers.fake nor DataFactory. Major upgrades require separate compatibility work; see API/README.md. Swagger UI/JSON/YAML test passes. |
| F4 terminal 401 / refresh 429 | verified — fixed | WEB/src/lib/api/client.ts retries once, emits session expiry on a second 401, preserves credentials on transient refresh failures, and handles malformed refresh envelopes safely. Maintained client tests and real browser failure/recovery scenarios pass. |
| F5 API 404 state | verified — fixed | NOT_FOUND event/provider mapping opens the not-found screen. Typed client and browser-injected 404 tests pass; unknown real API route is still 404 NOT_FOUND. |
| F6 duplicate registration race | verified — fixed | UsersService maps only PostgreSQL 23505/uq_users_email to the existing 422 email error. Deterministic constraint tests preserve unrelated failures; concurrent HTTP requests yield 201+422 with one stored row. |
| F7 parser contract / disclosure | verified — fixed | Raw parser errors and wrapped Nest 400 errors become safe 422 VALIDATION_FAILED responses. Malformed syntax near a secret sentinel and oversized JSON pass HTTP tests; unexpected error logs do not echo arbitrary messages/SQL parameters. |
| F8 System theme | verified — fixed | Accessible Light/Dark/System selector plus palette actions; persisted choice, OS media changes and reload verified in rendered tests and all four browser projects. |
| F9 drawer focus | verified — fixed | Shared drawer-focus lifecycle restores connected opener focus on Escape/button closure, without stealing focus after the user moves into content. Both Help and AI paths pass rendered and browser tests. |
| F10 test type safety / Node 22 | verified — fixed | Node/Jest/pg types and strict test tsconfig restored; both Jest runners enable diagnostics. pnpm typecheck and full tsc pass. Backend/frontend gates run under portable Node v22.23.4, leaving global Node untouched. |
| F11 Redis password profile | verified — fixed | Compose configures requirepass and an authenticated healthcheck; API URL encoding remains consistent. Opt-in Docker tests pass for empty and punctuation-containing passwords through node-redis and ioredis; unauthenticated access is rejected when enabled. |
| F12 unsafe production examples | verified — fixed | Production rejects either published placeholder in either signing role and rejects equal secrets. Schema/startup tests pass and show readable field names without printing submitted secrets. |
| F13 titles / breadcrumbs / plans | verified — fixed | Workspace titles resolve each tab; dashboard has its breadcrumb; concrete planned content is present. Registry tests and all 35 route patterns across four browser combinations verify title/heading/breadcrumb consistency. |
| F14 setup ordering / paths | verified — fixed | Root/backend READMEs use explicit PowerShell locations, preserve existing env files, configure env before Compose, explain port 5433 conflicts, and correct architecture links. Fresh database migration and two idempotent seeds pass. A new-machine installer walkthrough is not claimed. |

Additional original review notes: login/register/session links preserve a validated return-to path; unsafe destinations are rejected. Same-origin refreshes are serialized with Web Locks and tested with real concurrent tabs. @Roles and @CurrentUser work through test-only controller endpoints under the application's actual global guards; no extra production admin route was introduced.


### Current Phase 1 requirement checklist (supersedes baseline statuses in section 4)

| Requirement | Implementation / current verification | Status |
| --- | --- | --- |
| Layout, existing backend, sibling web, pnpm, no secrets committed | Same nested backend/web layout; both lockfiles; tracked env files are examples and real env files remain ignored | verified |
| Node 22 and zero-cost runtime | Portable Node v22.23.4 used for final gates; local Postgres16/Redis7; no real AI/provider calls | verified |
| Boilerplate fixes 1–10 | Original inspected fixes retained; strict JWT/role tests, config defaults, naming/migration tests, zod/parser contract, dev Compose, OIDC removal, rebrand, /v1 and /docs | verified |
| A1 config validation and env example | Production-secret/default tests; coherent Redis authentication; safe commented setup | verified |
| A2 global prefix, Swagger/JSON, CORS/OPTIONS, validation/filter/logging | Live endpoints/preflight; Swagger YAML compatibility; sanitized parser/server errors; logging sentinel tests | verified |
| A3 success/error envelopes and stable code/status mapping | Interceptor/filter tests plus real 422/401/404/429/503 checks | verified |
| A4 Postgres/Redis health | 200 healthy; actual dependency stop produces 503 details; restart recovers | verified |
| A5 users entity and migration | Fresh UUID/lowercase/unique/hash/timestamps schema migration; seed aggregate verifies lowercased Argon2id account | verified |
| A5 register/login/me and credential errors | Real HTTP/browser flows, no hash in response, identical wrong-credential errors, duplicate-email race handled | verified |
| A5 access JWT, cookie rotation/revocation/logout | Memory-only access token; httpOnly/Lax refresh; versioned fixed-deadline rotation; replay/partial-write/expired-token regressions pass | verified |
| A5 throttling and guard/decorator hierarchy | Real Redis default ten-request limit; missing token 401; test-only USER/ADMIN endpoints exercise all global guards and CurrentUser | verified |
| A5 seeder | Fresh migration then seed twice creates one demo user | verified |
| A6 unit/e2e suites | 72 ordinary unit tests, 2 separately run real Redis checks, 22 e2e; strict test typecheck passes; no expected-failure tests remain | verified |
| A7 no designs module | No Phase 2 APIs, editor or engine added | verified |
| B framework/libraries/API generation | Strict Next16/React/Tailwind setup retained; Next16.4.2 matches registry latest checked in this session; gen:api against live /docs-json passes | verified |
| B1 design system/themes/fonts | Actual prototype/app browser comparison; matching token palette/radii/topbar/font; Light/Dark/System persistence and OS changes tested | verified |
| B2 shell/global controls | Brand/navigation/user menu, breadcrumbs, Ctrl+K, scripted AI, Help, ?, local feedback/toasts; browser control/focus checks pass | verified |
| B3 registry and placeholders | 35 patterns retained; every page exists; full four-combination title/heading/breadcrumb/overflow matrix; future screens remain explicit phase placeholders | verified |
| B4 system states/dev-only controls | All ten demo states across four combinations; real/injected error recovery; production Ctrl+Shift+D exposes no dev controls | verified |
| B5 real auth/protection/return-to/one refresh retry | Actual forms/loading/validation, protected redirects, safe auth links, real shared-cookie tab restore; one retry and expiry/429 behavior covered | verified |
| B6 typed API client and Query provider | Envelope/ApiError/refresh/event tests; generated schema and providers verified; no persistent access-token storage | verified |
| B7 dashboard | Real /auth/me name/email/role, Phase 2 cards and breadcrumb shown | verified |
| B8 responsiveness and accessibility | 1024/1440 x light/dark matrix; labels, focus rings, palette/drawer keyboard navigation, focus restoration, reduced-motion CSS | verified |
| C root/backend README + architecture | Safe PowerShell setup/ports/tests; module map, auth diagram, error table, Phase 2 note; living report updated with history retained | verified |
| D1–D7 acceptance gates | Docker healthy; fresh migration/seed; backend/web gates; HTTP walkthrough; route/control matrix; actual API-stop/recovery | verified |

### Final check results (Node v22.23.4 unless stated)

All successful gates below exited 0 unless an advisory scan is explicitly shown as nonzero.

| Command / practical check | Result |
| --- | --- |
| API pnpm install --frozen-lockfile | PASS; lockfile current; no reset of env/database. pnpm 10.34.7 |
| API pnpm build | PASS |
| API pnpm typecheck; pnpm exec tsc --noEmit --pretty false | PASS, including test/setup sources; previous 191 diagnostics resolved |
| API pnpm lint and pnpm lint:check | PASS, 0 errors; 22 pre-existing helper/test-double warnings remain |
| API pnpm test --runInBand | PASS: 72 ordinary checks; 2 opt-in Docker cases skipped in the default run |
| API TEST_REDIS_COMPOSE=1 pnpm exec jest --runInBand --runTestsByPath src/config/redis-compose.spec.ts | PASS: both opt-in checks, including authenticated healthcheck and both Redis clients; uniquely owned disposable project cleaned up |
| API pnpm test:e2e | PASS: 22/22; real disposable Postgres database, fake Redis/in-memory counters explicitly distinguished from separate real checks |
| API pnpm test:cov --runInBand --collectCoverageFrom='**/*.ts' --coverageReporters=json-summary --coverageReporters=text-summary | PASS: statements 37.26% (297/797), branches 36.70% (116/316), functions 35% (42/120), lines 36.76% (261/710). This unit-only metric includes unused boilerplate and excludes separate e2e/browser coverage; it is not a completion argument |
| node docs/audit/phase1-regressions.cjs | PASS: 7/7 desired-behavior assertions. Successful refresh fixture now includes the real complete user shape; behavior assertions retained/strengthened |
| node docs/audit/live-phase1.cjs | PASS: 15 real-service HTTP checks with status codes recorded above |
| node docs/audit/rate-limit.cjs (audit DB_PORT=5545 / REDIS_PORT=6391) | PASS: ten 422s, then two 429s; temporary API uses normal limits and its own loopback client |
| Fresh sf_completion_<timestamp> database: migration:run + seeder:run:dev twice | PASS: CreateUsers applied, seed completed twice, aggregate users=1/lowercase=true/hashed=true; no existing database reset |
| Actual audit Redis/Postgres stop/restart | PASS: 503 UNAVAILABLE details then 200 recovery for both |
| WEB pnpm gen:api | PASS against running backend; schema unchanged |
| WEB pnpm typecheck / lint / check:routes / build | PASS; 35 route patterns; production generated 29 static pages plus dynamic routes and proxy |
| WEB pnpm test | PASS: 35/35 maintained client/rendered UI/route/error-boundary tests; no paid services or test-only runtime app hooks |
| WEB pnpm test:browser, Chrome, four viewport/theme projects | PASS: 8 normal/error integration scenarios plus 4 dev-state scenarios; all 35 patterns covered in each combination. Final affected failure-recovery scenario separately rerun across all four combinations |
| Production server /login + Ctrl+Shift+D | PASS: no developer menu/button, no unexpected console errors, no overflow |
| Actual API stop on authenticated dashboard | PASS: Waking up the server, no crash overlay/overflow; after restart returned automatically to the same dashboard with /auth/me user |
| Prototype/app visual comparison | PASS for Phase 1 shell/auth styling: tokens, fonts, radii, split layout and topbar. Static labelled illustration remains illustrative; no Phase 2 simulation is represented as working |
| API pnpm audit --prod --json | Exit 1: two remaining triaged transitive advisories, no critical; see F3 closure and API README. Full dependency scan also has two moderate development downloader advisories |
| WEB pnpm audit --prod --json | PASS: zero advisories |
| git diff --check; secret-file tracking/ignore checks | PASS; only env examples tracked; no token/hash dumps or real env files added |

An initial coverage invocation incorrectly prefixed src/ relative to Jest's src root and yielded 0/0; it was discarded and rerun with the correct source-relative glob above. A final browser rerun initially failed because the delegated dev process had ended; restarting the owned audit frontend resolved the connection refusal. These were verification setup issues, not hidden passing results.


### Remaining limits and next phase

No mandatory Phase 1 functional work remains known from this verification. This verdict is for the specified local course-project Foundation scope, not a production security certification.

- Two transitive production advisories remain triaged as unreachable in current flows, plus two moderate development downloader advisories. Reassess before using Faker templates, UUID v3/v5/v6 output buffers, queues, or changing those dependency chains. Do not describe pnpm audit as clean.
- Backend lint passes with 22 inherited warnings. Unit-only all-source coverage is 37.26%; separate HTTP/browser evidence covers the requested flows but does not make untested boilerplate verified.
- Chrome was exercised; browsers without Web Locks have only per-tab refresh coordination. A full screen-reader/contrast audit and framework-driven root-layout fault injection were not performed. Boundary rendering/retry callbacks, actual API failures, keyboard paths, reduced-motion rules and responsive layouts were verified as described above.
- The login-side diagram is explicitly a static illustration. OAuth/password-reset controls from the fake prototype are not presented as working services; real email/password auth is the Phase 1 scope.
- No application data or env values were reset. Portable Node 22 is a verification tool in the local temp directory; global Node is unchanged. Generated artifacts, traces and browser storage state are not committed.
- No commit or GitHub push was performed during remediation. This subsequent report-only publication leaves the implementation fixes, tests, other documentation edits and Phase 2 plan local; publish them separately before treating the GitHub code as the completed snapshot.

Phase 2 can now use authenticated users, stable errors/envelopes, generated API types and tested shell/session recovery. Designs CRUD, canvas editing, SimulationModule, Traffic/Results/Limits, real AI and later-phase pages remain unimplemented. Follow docs/PHASE-2-PLAN.md and update this same report at each milestone; preserve history, attach new evidence, and reassess earlier requirements affected by new work. Nothing updates this report automatically.


Cleanup (2026-10-23): stopped only the owned audit API/frontend listeners and stressforge-phase1-audit Compose services; audit volumes and databases retained. Normal project services/data and existing env files were preserved. Start the normal Docker services and restart the backend/frontend to use the fixes, then log in again.


## 10. Phase 2 planning checkpoint — 2026-10-23

[Refined Phase 2 plan](PHASE-2-PLAN.md): ten milestones M0–M9, scope/contracts, engine truth/resource limits, ownership, saves/conflicts, durable runs/preview priority, user-flow gates and a static planning review. Original preserved in docs/archive/PHASE-2-PLAN-2026-10-22.md.

[Verified] Repository inspection still shows the Phase 1 remediation code/tests local and uncommitted after the report-only publication (HEAD eb8c39b). Existing frontend test infrastructure is present. Reference-engine SHA256 still matches the recorded e841b1af...78f. New plan references and diagram fences were checked; no application code, services or tests were executed or changed for this planning work.

[Recommendation] Before Phase 2 implementation, review/commit the actual verified Phase 1 code and establish its publication/local baseline accurately. Then freeze contracts/fixtures in M1 and deliver the first real create/save/simulate/reopen slice at M3 before completing the rich editor/tabs. No Phase 2 milestone is complete merely because it is planned. Future implementation must update this same report with observed evidence and reassess affected earlier requirements. Planning changes are local; nothing is automatically synchronized or published.

## 11. Phase 2 M0–M1 checkpoint — 2026-10-24

**Verdict: M0 and M1 complete. Phase 2 IN PROGRESS; M2–M9 not started.** User approved starting the foundation baseline/contracts, with a checkpoint before engine implementation. No simulation engine, worker, designs migration/controller, canvas or real AI was implemented in this session.

### M0: immutable, published Foundation baseline

[Verified] Reviewed the existing pending remediation scope, ignored environment files and new tests; removed two trailing blank lines caught by staged diff validation. Committed the Phase 1 fixes/tests/docs as **9e8bb00**, then fetched origin/main and performed a normal fast-forward push (eb8c39b..9e8bb00). The older report-only publication gap is closed. No environment values or normal project data were reset.

[Verified] Before that commit, Node v22.23.4 gates passed: API build/typecheck/lint:check, 72 unit tests (2 opt-in Docker checks skipped), 22 e2e on isolated sf_m0_20261024, web 35 tests/typecheck/lint/check:routes/build, and 7/7 offline audit regressions. Read-only lint retained 22 inherited warnings. The full browser matrix and opt-in Redis checks from 2026-10-23 were not repeated as M0 gates; their dated evidence remains in section 9.

### M1: contracts and full-precision reference fixtures

| Requirement | Implementation and observed evidence | Status |
| --- | --- | --- |
| One authoritative payload definition | Backend src/common/contracts/phase2: strict Zod graph/traffic/import/design/run/result schemas; planned OpenAPI generated from them; existing actual API types remain separate | verified |
| Safe draft vs runnable validation boundary | Empty/cyclic drafts accepted; duplicate/unsafe ids, self/duplicate/dangling edges, nonfinite positions, ownership injection and unknown type-specific settings rejected in focused tests. Runnable engine validation remains M2 | verified for M1 |
| Exact bounds/import versions | Six source templates fit schema; 50 nodes/200 edges; 64KiB UTF-8 text parser; versionless legacy or version1; omitted import layout fields accepted for later deterministic completion; unknown version/invalid supplied fields rejected | verified |
| Fingerprint and retry/revision identity | Tested SHA256 identity excludes coordinates/edge ids; includes semantic order/labels/props/traffic/version. Typed expectedRevision/UUID requestId, run lifecycle and conflict details; service-level atomic saves/idempotency remain M3 | verified contract; runtime deferred |
| Finite result/limits semantics | Explicit finite/unbounded variants, Clients servers:null, honest minimum-load and capped-search states, bounded arrays and validated threshold brackets; documentation-only wire examples validate | verified contract; port deferred |
| Prototype oracle | Captured six full-precision graph/traffic + validation/simulation/paths/limits/timeline fixtures and minimum-load counterexample. Read-only recapture --check matches; source engine hash still e841b1afe3f2897cab9405d86bd4f735f977e5c0ce950ebbab7f621e54f7d78f | verified source evidence |
| CONFLICT/409 integration | AppException/filter + actual Swagger ErrorResponseDto + generated live API type + client fallback; tests confirm inline handling retains credentials and details without system-screen events | verified |
| Generated contract and consumer types | 13 planned operations; local refs resolve; OpenAPI/examples drift checks and frontend gen:phase2 --check pass. All operations explicitly planned; no fake live endpoint | verified |
| Reviewable examples and maintenance | docs/contracts/README.md, examples.json, PHASE-2-PLAN.md and this report distinguish contracts/oracle evidence from unimplemented services | verified |

The canonical schemas are in common/contracts because M1 does not register a DesignsModule/SimulationModule. The reference source remains unchanged. No package dependency was added.

Decisions frozen after inspection:
- Preserve SECTION 14's **200** replica maximum; correct the plan's earlier proposed100. Other starting envelopes remain subject to M2 complexity/runtime profiling, not measured promises.
- Normalize schema/property key order before both reference and port evaluation; preserve node/edge array order and explicit property presence. Fingerprints canonicalize object keys; source timeline seeds cannot drift solely from input key insertion order.
- Capture source NaN rather than letting JSON silently turn it into null. Observed NaNs are Clients server counts (unbounded capacity times zero service time); the wire contract explicitly uses null only for this not-applicable field.
- Preserve the source 0.1rps-pass/1rps-fail counterexample; do not interpret findLimits breakRps:0 as zero capacity. Limits headroom is unknown/null at a failed minimum and only a lower bound when no failure was observed within range.
- Keep generated planned types separate from types generated from actual /docs-json until provider implementation is verified. No paid service or AI call.

### Final M1 checks performed

All listed commands/checks exited0 in their final runs.

| Check | Observed result |
| --- | --- |
| API pnpm build / typecheck / lint:check | PASS; strict source/test types; 0 lint errors, 22 inherited warnings |
| API pnpm test --runInBand | PASS: 114 tests =72 previous +41 contract +1 conflict mapping; 2 opt-in Docker cases skipped |
| API pnpm test:e2e | PASS:22 on sf_m1_20261024, real isolated Postgres, fake Redis/counters as documented |
| API pnpm contract:phase2:check | PASS: OpenAPI and schema-validated examples match canonical sources |
| API pnpm fixtures:phase2 | PASS: six complete fixtures plus minimum-load counterexample match normalized reference inputs |
| WEB pnpm gen:api | PASS against actual audit API5001; live schema change is CONFLICT enum addition |
| WEB pnpm gen:phase2 --check | PASS: separate planned types current |
| WEB pnpm test | PASS:36 including409 inline/preserved-session/gateway fallback regression |
| WEB pnpm typecheck / lint / check:routes / build | PASS; all35 existing route patterns still have pages; no new feature page represented as working |
| Real-service node docs/audit/live-phase1.cjs | PASS:15 checks; health/docs200, register201, login/me/refresh200, logout204, revoked/missing-token401, malformed/oversized422, duplicate-email201/422, credentialed OPTIONS204 |
| Live Swagger/planned-route check | PASS: ErrorResponseDto includes CONFLICT; no planned Phase2 paths in live OpenAPI; /v1/designs and /v1/simulation/catalog return404 |
| Source preservation / whitespace / secret-file checks | Engine hash unchanged; diff checks pass; real env files ignored/untracked; generated artifacts contain no auth tokens |

During development, one import-union typing/syntax issue, an operation-count assertion and a test cleanup call failed initial checks; all were corrected and the final relevant gates above passed. The source Clients NaN was retained as evidence and documented, not suppressed as a passing engine result.

[Untested] M2 engine parity/performance, worker crash/timeout/priority, M3 database/run/save ownership races and all canvas/Traffic/Results/Limits journeys remain future work. No new browser visual matrix or fresh dependency advisory scan ran in this milestone; no UI layout/dependency version changed. The React/jsdom suite emits its known script-tag rendering notice; it is not a browser console observation.

### Publication, cleanup and next gate

[Verified] Phase 1 baseline9e8bb00 is on GitHub main. M1 contracts, generated artifacts, archived/refined plan and this checkpoint are committed locally on codex/phase2-contracts; they are not yet published. Do not confuse the published baseline with locally prepared Phase 2 work.

Owned audit API and stressforge-phase1-audit services are stopped after checks; volumes and sf_m0_20261024/sf_m1_20261024 databases are retained. Normal stressforge-dev and unrelated services/data are preserved.

**Next approval checkpoint: M2 engine/worker.** Port pure TypeScript functions and builders, implement the documented wire exceptions, prove six-fixture parity with abs1e-6+rel1e-6 tolerance, and profile/freeze graph expansion/output/time/memory limits before worker admission. Preserve responsive health, test crashes/timeouts and both watch/compiled runtimes. Do not start M2 until the user approves continuation.

Future milestone work must update this same report, retain this history/evidence, regenerate affected contracts/types and reassess Phase 1 auth/errors/session behavior. Nothing updates or publishes automatically.

## 12. Phase 2 M2 checkpoint — 2026-10-24

**Verdict: M2 COMPLETE. Phase 2 remains IN PROGRESS; M3–M9 not started.** The user explicitly approved M2 after reviewing M0–M1. This session implemented and verified the calculation foundation; it did not create Designs tables/controllers, run persistence, a canvas, Traffic/Results/Limits pages or real AI calls.

### Implementation and evidence

| M2 exit requirement | Evidence | Status |
| --- | --- | --- |
| Pure TypeScript engine | src/modules/simulation/engine separates typed catalog, graph validation, routing/propagation, distributions/queue math, simulation, paths, timeline, Limits, builders/import and wire adapter. Strict typecheck; production engine has no any/ts-ignore/ts-nocheck and imports no Nest/database/browser APIs | verified |
| Six-template numerical parity | engine.spec.ts recursively compares full source simulation/path/timeline structures, exact issue/status/order fields and finite abs1e-6+rel1e-6 values. Limits curves/thresholds/order and full failing-load simulation match source fixtures; passing/failing brackets checked. No tolerance widened; source unchanged | verified |
| Correctness/wire exceptions | Clients pool is not applicable/null; permitted Infinity explicitly tagged; unexpected NaN rejected; minimum-load threshold remains unknown; maximum1e7rps search produces a lower-bound result rather than proven infinite capacity | verified |
| Catalog, templates and imports | All12 types, six exact templates; builders reproduce fixture inputs; omitted coordinates completed deterministically and generated edge ids avoid collisions; empty safe draft remains valid | verified |
| Model edge/sanity checks | Zero load/share, semantic-invalid graphs, overload/replicas/cache/regions/burst, missing queue consumer/infinite lag, one-server waiting-time reduction, minimum-load counterexample, capped search and deterministic/nonmutating behavior | verified |
| Bounded calculation | Pair/walk/live-component limits, bounded encoded result, fixed sample/search budgets; dense49-node/138-edge draft rejects with COMPLEXITY_LIMIT. No silent accurate-looking partial result | verified initial envelope |
| Worker/scheduler | One lazy worker, four waiting slots, per-owner durable-priority pending limit, provisional reservations, queue-inclusive5s/preview2s deadlines, preview preemption/eviction/supersession, cancellation/TTL cleanup and shutdown | verified in-memory primitive |
| Failure isolation | Actual CPU-bound test worker terminated/replaced; exits/thrown errors/malformed or wrong-fingerprint replies fail safely; real replacement calculations succeed. Timers/capacity released; delayed timer callback cannot allow a late start | verified |
| Source/compiled/watch execution | Actual source and compiled worker profiles; Nest start:dev compiles with0 errors, loads SimulationModule, serves auth/health/Swagger, and restarts after source edits. Worker entry path selects compiled output for Nest watch/production and TS for ts-node/Jest | verified |
| Health responsiveness | Actual AppModule/HealthController with real configured Postgres/Redis: nine HTTP200 health probes before/during CPU loop/after timeout/crash/recovery, plus two fault markers; latest maximum response74.50ms | verified local observation |
| Foundation integration | Controller-free SimulationModule registered; no new HTTP feature route; auth/health e2e and actual watch-mode HTTP walkthrough pass; live API type generation unchanged; frontend tests/types pass | verified |

See [model/execution documentation](SIMULATION-MODEL.md) for architecture, commands and numerical limitations. No dependency or paid service was added.

### Frozen bounds and measured profile

- Inputs retain M1 bounds:50 nodes/200 edges and type-specific finite settings; draft validity does not imply supported compute complexity.
- Per complete calculation:2,000,000 combination attempts,200,000 walker calls,4096 live components,512KiB encoded result,6 named paths,48 timeline points,45 curve points and24 Limits refinement iterations.
- One worker; at most4 waiting jobs/reservations and one pending durable-priority job per owner. Reservations can expire before a database commit/start; their deadline is not reset. Preview metadata is capped128 entries/30sTTL.
- Five-second durable-priority and two-second preview deadlines include queue/startup time. V8 old generation128MiB, young generation16MiB, stack4MiB; these are not an absolute process RSS limit. Worker environment omits application signing/database secrets and includes safe temp settings.
- Local source profile:16 cases,15 complete +1 explicit dense-branch rejection. Maximum observed complete wall time1259.06ms including first-task startup; maximum post-calculation heap45.43MiB; maximum result30748bytes; heartbeat gap35.16ms. Dense rejection240.48ms.
- Local compiled profile: same16 cases/15 complete +1 rejection; maximum complete wall time370.23ms; post-calculation heap20.27MiB; maximum result30748bytes; heartbeat gap34.41ms. Dense rejection220.10ms.
- The successful matrix includes each of six templates in simulation and Limits modes, a50-node chain simulation,49-node chain Limits calculation and13-node branching. These measurements are local observations, not portable timing guarantees or peak-memory measurements.

Raw dated measurements: docs/audit/m2-profile-source.json, m2-profile-compiled.json and m2-worker-health.json. The profiler does not require a database; the health verifier uses actual configured audit services and creates no accounts/schema. Fault worker modes exist only in test/fixtures, never the production message schema.

### Checks performed

All listed final checks passed with exit0. Node v22.23.4 and existing pinned pnpm were used.

| Command/check | Result and limits |
| --- | --- |
| pnpm build; actual pnpm start:dev | PASS production build; watch compilation/recompilation0 errors; registered controller-free SimulationModule and existing routes |
| pnpm typecheck; pnpm lint:check | PASS;0 errors,22 inherited lint warnings; five temporary new warnings were removed |
| pnpm test --runInBand --coverage --collectCoverageFrom=modules/simulation/**/*.ts --coverageReporters=json-summary --coverageReporters=text-summary | PASS:144 unit tests,2 opt-in Docker checks skipped. Simulation coverage: statements88.70% (1052/1186), branches77.01% (536/696), functions92.40% (219/237), lines90.16% (944/1047). Child-worker execution/standalone live scripts are not fully represented by Jest coverage; this is evidence, not the completion criterion |
| pnpm test:simulation | PASS:30 cases (17 engine/model +13 worker). Affected worker suite13/13 separately rerun after the final safe-temp-environment adjustment |
| pnpm test:e2e | PASS:22, real isolated sf_m2_20261024 Postgres database; fake Redis/counters as documented in the existing suite |
| pnpm simulation:profile / simulation:profile:compiled | PASS:16 cases each, expected complexity rejection distinguished from successful calculations |
| pnpm simulation:health:verify | PASS:11 recorded checks, actual Postgres/Redis, CPU timeout/crash/recovery and HTTP health responsiveness |
| pnpm contract:phase2:check / pnpm fixtures:phase2 | PASS: canonical contract/examples and all full-precision source fixtures remain current |
| node docs/audit/live-phase1.cjs against Nest watch | PASS:15 real-service checks; healthy/docs200, register201, login/me/refresh200, logout204, revoked/missing-token401, malformed/oversized422, email-race201/422 and CORS OPTIONS204 |
| WEB pnpm gen:api / pnpm gen:phase2 --check | PASS; live API type output unchanged, planned types current; calculation HTTP operations remain unmounted |
| WEB pnpm test / pnpm typecheck | PASS:36 maintained tests and strict types. No frontend implementation changed; browser visual matrix/frontend production build were not repeated in M2 |
| Diff/source/security review | No unrelated files/dependency changes; reference engine SHA256 still e841b1af...78f; real env files remain ignored; no graph/secret/raw-worker-error logging; temporary port scripts and verified misplaced compiler cache removed |

Verification setup corrections: fixed an early test fixture path and type-import cleanup issue; waited for the deliberately asynchronous Redis connection before real-health assertions; supplied safe TEMP/TMP to prevent a Windows ts-node cache appearing under an undefined/temp folder. Failed preliminary checks were rerun successfully. Model fixtures were not edited to conceal a failure.

### Reassessment and remaining work

[Verified] Foundation auth, JWT/session/error envelopes, CORS, Swagger, health and generated actual API types remain working through the changed AppModule. Phase 1 completion remains the dated Foundation verdict; its historical no-Phase2-module requirement is not a prohibition on this explicitly approved later milestone. No Designs module/table exists yet.

[Untested/not implemented] Database acceptance, ownership/revision races, idempotency/coalescing, immutable run persistence/finalization/restart reconciliation/retention, and the usable editor loop remain M3. Durable is currently a scheduler priority/disconnect policy; all M2 jobs are memory-only and do not survive an API restart. M3 must persist before returning acceptance and reconcile interrupted work.

The preserved queueing/lognormal model, probability pruning/compression, saturation clamps and independently sampled timeline remain approximations. No real traffic calibration, browser editor flow, production deployment, fresh advisory scan or full cross-browser accessibility audit was performed. Existing Phase 1 dependency follow-ups remain as documented; M2 adds no dependencies.

M2 is committed locally on codex/phase2-contracts, not pushed; GitHub main remains Phase1 baseline9e8bb00. Owned watch/audit processes and audit containers were stopped after checks; normal project services/volumes/data were preserved.

**Next: seek approval for M3**, the first real template → edit replicas → save → asynchronous simulation → results → reopen journey, with ownership/revision/idempotency/save safety from the start. Do not mark Phase 2 complete before M9. Future work must update this same report, preserve prior history, attach fresh evidence and reassess affected earlier requirements; no automatic updates/publication.

## 13. M3 — first saved-design journey (2026-10-24)

**Scope:** user explicitly approved implementing the reviewed M3 recommendation. This is authorized implementation, not a repeat of the historical read-only Phase 1 audit. [Plan](PHASE-2-PLAN.md); [operation/lifecycle guide](M3-SAVED-DESIGNS.md). M4–M9 and Phase 2 overall remain unfinished.

### Requirement/evidence checklist

| M3 requirement | Implementation and observed verification | Status |
| --- | --- | --- |
| Owned persistent designs and immutable runs | API/modules/designs, migration 1792800000000-CreateDesigns; real PostgreSQL e2e read/write/delete and app restart; owner FK, run-request uniqueness, status/time indexes | [Verified] |
| Ownership on every operation | CurrentUser-derived ownership; foreign read/write/delete/run =403, missing =404, wrong design/run pairing =404; account dashboard isolation tested | [Verified] |
| Safe save/revision conflict | Row lock + expectedRevision; simultaneous writes produce one200/one409; unknown owner fields422; incomplete graph saves but Run422 | [Verified] |
| Durable admission/idempotency | Matching keys checked before revision/capacity; bounded in-flight coalescing; reserve→transaction→commit→start; concurrent identical requests same run; retained terminal replay200 after later edits; changed identity409 | [Verified] |
| Compute/failure lifecycle | Pending persisted before202; one pending/account includes DB finalization; real worker crash/timeout→safe failed record; health200; deletion cancels and cascades; failed acceptance releases slots | [Verified] |
| Restart/recovery/retention | Actual app close/reboot preserves completed snapshot/result and marks interrupted pending row failed; failed finalization recovers after DB restoration; 24h keys protected then newest50 terminal/design; tests cover pruning | [Verified] |
| Template→edit→save→run→results→reopen | Six source templates; minimal SVG/property form; replica control; autosave/manual save; true model metrics; query-linked stored run and dashboard reopen | [Verified] main flow at1024/1440 light/dark |
| Minimum save safety | EditorSession serialization, submitted-state acknowledgments, save barrier, retained conflict/failed drafts, same request identity after lost acceptance, stale results, disposed account sessions | [Verified] eight focused frontend tests plus browser recovery |
| Real contracts/types | /docs-json publishes implemented subset from frozen Zod contracts; schema.d.ts regenerated from running API; preview/Limits remain absent; canonical/planned artifacts unchanged | [Verified] |
| Documentation and phase boundaries | M3 guide, root/backend README, architecture/contract guide and this report updated; no runtime packages added; no real AI integration | [Verified] source inspection |

### Commands and results

Node v22.23.4, existing pnpm versions. Docker Desktop was initially stopped; started it. Normal Compose services became available; no normal-user tables were migrated/truncated by these checks. Isolated databases: sf_m3_20261024 (e2e) and sf_m3_browser_20261024 (live browser/API).

| Check | Observed result |
| --- | --- |
| API pnpm build | PASS, exit0 |
| API pnpm lint:check | PASS, exit0; 0errors,22 inherited warnings, no new M3 warnings |
| API pnpm typecheck | PASS, exit0; strict source/unit/e2e/setup |
| API pnpm test --runInBand | PASS, exit0; 146 passed,2 opt-in real-Redis tests skipped; 9 suites passed,1 skipped |
| API pnpm test:e2e with DB_TEST_DATABASE=sf_m3_20261024 | PASS, exit0; 31 tests (22 Foundation +9 M3), real PostgreSQL, existing Redis/throttle doubles |
| Fresh live browser DB pnpm migration:run | PASS, exit0; CreateUsers1761000000000 and CreateDesigns1792800000000 applied |
| Compiled API + production web | Started successfully with real PostgreSQL/Redis; /v1/health and /docs-json available |
| WEB pnpm test | PASS, exit0;44 tests including8 new editor-session cases |
| WEB pnpm build, pnpm lint, pnpm typecheck | PASS, exit0 |
| WEB pnpm gen:api | PASS, exit0; real mounted API source |
| WEB pnpm check:routes | PASS, exit0;35 registered patterns have page files |
| API pnpm contract:phase2:check; pnpm fixtures:phase2; WEB pnpm gen:phase2 --check | PASS, exit0; canonical schemas/examples, six source fixtures and minimum-load counterexample unchanged |
| Browser full regression matrix (pnpm exec playwright test --reporter=dot, SF_BROWSER_CHANNEL=chrome) | PASS, exit0;16 passed,4 dev-only cases intentionally skipped,1.9min;1024/1440 light/dark |

M3 browser main journey passed at four size/theme combinations, collecting page errors and console errors and checking no horizontal overflow. Separate recovery coverage exercises an injected503 save failure, retained replicas, canceled dirty-link navigation, concurrent server save/409, explicit reapply, and a lost successful POST response: retry recovers the original run and exactly one retained row. These controlled browser failures are intentional; their network console messages are not counted as unexpected errors in the happy-path test.

Early verification caught/fixed a TypeORM dashboard query ordering defect and added dashboard ownership/content regression checks. Test-only setup corrections included pre-init Swagger registration, a strict type narrowing correction, using actual owned UUIDs for the former placeholder route matrix, and scoping ambiguous/mobile browser selectors. Initial failed runs are not reported as passing gates.

### Reassessment, boundaries and remaining work

[Verified] Existing Foundation auth/error/client/focus tests and the22 Foundation HTTP tests still pass. A known database connection/restart error now maps to503 UNAVAILABLE without exposing driver details; unrelated SQL/schema faults remain500. Historical Phase1 prohibition on Designs/Simulation was a phase boundary; the later user-approved modules do not invalidate that historical verdict.

[Verified] Screenshots: audit/m3-1024-light.png, m3-1024-dark.png, m3-1440-light.png, m3-1440-dark.png. Aggregate storage snapshot audit/m3-storage.json observed8 MVP run rows, mean JSONB payload4046bytes, max4050bytes, table+indexes163840bytes at capture time. This sample is not a forecast; larger supported outputs retain the M2 size bound. Retention is tested; there is no hidden daily quota.

[Limitations] One API instance only. Interrupted pending jobs fail safely rather than resume computation. Failed finalizations can remain pending until DB recovery plus the bounded recovery interval. Dashboard is the10 most recently edited designs, not the later full library. Browser history traversal preserves memory drafts but has no custom cancellation dialog; broader history/navigation editing behavior belongs to the later editor work. Failed unsaved edits cannot survive reload/closure; beforeunload depends on browser support.

[Untested in M3] New Firefox/WebKit/mobile/screen-reader matrices, fresh advisory audit, real infrastructure calibration and production deployment. Four dev-state browser cases intentionally require next dev and remain separate from production checks; earlier Phase1 evidence is preserved. Existing triaged dependency follow-ups remain. No paid usage, model calls, new runtime dependencies or production-system changes.

M4–M9 remain: complete creation flows, dashboard polish, full canvas/connections/undo/recovery, Traffic/Results charting, Limits/preview UI and final Phase2 acceptance. M3 does not authorize beginning those milestones.

**M3 verdict: COMPLETE for the approved first-slice scope. Phase2 remains IN PROGRESS; M4–M9 are not started.** Changes remain local on codex/phase2-contracts; nothing from this milestone was pushed. The pre-existing modified audit/m2-profile-source.json was preserved and excluded from M3 changes. Future milestone completion must update this same report, retain all earlier history, record new evidence and reassess affected earlier requirements; updates/publication are not automatic.

Local implementation checkpoints: backend6ffd470 and frontend38f3dd5. Health and Swagger returned200 after the final run; live OpenAPI version3.1.0. Only agent-owned verification API/web processes were stopped afterward; normal Docker services, volumes and user data were preserved. The isolated test databases remain available for reproducibility.

### M3 follow-up — replica autosave rate-limit defect (2026-10-24)

[Verified] A focused regression reproduced a false dirty state after the server returned equivalent JSON objects with normalized property order. JSON.stringify equality treated that order as an edit. Autosave could continue resending; Run's save barrier could immediately repeat saves until rejected. The user's live browser/network trace was not inspected, so this is a reproduced matching defect rather than a claim to have traced their exact429.

Fixed WEB/src/lib/editor-session.ts using WEB/src/lib/stable-json.ts: object keys compare canonically, meaningful array order remains intact, and save acknowledgments adopt normalized fields only when no newer edit superseded them. This also prevents repeated saves of a server-trimmed name. Existing request limits and environment values were not changed.

[Verified] The new normalization regression failed before the fix, then passed. Five added cases cover single acknowledged save, semantic key ordering, one-save Run submission, meaningful array reordering, and trimmed-name/newer-edit safety. Final WEB pnpm test:49 passed; pnpm lint and pnpm typecheck passed. WEB pnpm build also passed (exit0). Earlier browser matrix is historical evidence; it was not rerun for this pure comparison/acknowledgment change. Existing M2 profiling edits remain untouched.