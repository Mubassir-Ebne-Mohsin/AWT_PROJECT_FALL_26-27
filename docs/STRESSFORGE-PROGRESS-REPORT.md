# STRESSFORGE progress report

> **Audit date: 2026-10-22 (Asia/Dhaka). Phase 1: PARTIAL — not complete.**

## 1. Maintenance instructions

Nothing updates this file automatically. Whoever completes a later phase (a person or an agent) must update THIS report before calling the phase done. They must:

1. Add the new phase's checklist and results, and keep every earlier section and the update history.
2. Record new verification evidence: exact command, result, exit status, short output quote. Tag each conclusion `[Verified]`, `[Inferred]` or `[Untested]`.
3. Re-check earlier requirements that the new work touches (auth, error codes, route registry, API types) and change their status if they regressed.
4. Update the phase tracker (section 3) and the verdict (section 7).
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
| 1 | Foundation | Partial: working core flows; open defects and verification gaps |
| 2 | Core loop (designs API, simulation module, canvas editor, Traffic / Results / Limits) | Not started |
| 3 | Improve and history | Not started |
| 4 | Public and learning pages | Not started |
| 5 | Evaluation, settings, onboarding, developer screens | Not started |

Only Phase 1 has been audited.

## 4. Phase 1 checklist

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

All findings are open. **Verified** means reproduced by observed HTTP/browser/test results. **Inferred** means code supports a concern without a complete runtime reproduction. File references use the API/ and WEB/ prefixes above.

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

## 7. Phase 1 verdict and exact remaining work

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

- **2026-10-22 — review completed to available evidence:** assessed Phase 1 PARTIAL. Recorded original checks, additional audit cases, six failing regression assertions, real local service/HTTP tests, browser observations, package scan and limitations. No application behavior changes.
- **2026-10-22 — draft baseline clarification:** the standalone harness and stressforge-phase1-audit containers were created in this review session. The earlier draft's “pre-existing/left untouched” wording below is preserved as history, not adopted as this session's resource-ownership claim. Existing non-audit project data was preserved.
- **2026-10-22 — original draft entry retained:** “audit started. Scope fixed from PHASE-1-PROMPT.md. Pre-existing state recorded: untracked docs/audit/phase1-regressions.cjs and two Docker containers named stressforge-phase1-audit-* (ports 5545, 6391) existed before this audit and were left untouched.”

Future phase-completion work must update this report manually, preserve earlier history, attach dated command/browser evidence, and reassess earlier affected requirements. Nothing schedules or guarantees automatic future updates.


### 2026-10-22 verification addendum — approved browser signup

After the user explicitly approved a disposable account, browser signup completed against the isolated audit database: registration form first rejected all four empty fields; valid name/email/password/terms submission reached the dashboard and displayed Browser Audit with /auth/me data. Logout cleared the visible session hint and returned to Log in. AI drawer displayed Scripted mock and answered the p95 starter chip locally. Login was also checked at 1024/light and 1440/dark without overflow; this does not complete the full route/form matrix. The earlier browser form-fill approval restriction was resolved for this test. The Phase 1 verdict remains PARTIAL.

Additional observed UI checks: unauthenticated /new/template?audit=1 redirected to login with the encoded destination; login returned to /new/template?audit=1. The ? shortcut rendered Keyboard shortcuts, Escape closed it, and the local feedback dialog accepted test text, closed and showed the “nothing was sent” toast. These supplement B2/B5; the full matrix and documented defects remain open.

Audit cleanup (2026-10-22): audit API and identified audit frontend processes stopped; only the stressforge-phase1-audit Compose project stopped, without deleting its volumes or test data. Docker Desktop and unrelated project services were left untouched. Existing tracked application files have no diff; added/preserved audit artifacts are this report, docs/audit/phase1-regressions.cjs and src/modules/auth/phase1-audit.spec.ts. No commit or dependency update was made.

- **2026-10-22 — GitHub publication preparation:** Phase 1 implementation history, audit tests and this living report prepared for the user-requested initial publication to Mubassir-Ebne-Mohsin/AWT_PROJECT_FALL_26-27 on main. Root README now links this report. The audit verdict and unresolved findings are unchanged; publication does not mark Phase 1 complete.
