# STRESSFORGE progress report

> **Latest update: 2026-10-28 (Asia/Dhaka). Phase3: in progress; M10 inference gate failed, M11 backend foundation verified with real AI disabled (sections25–26). Phase 1: COMPLETE for the local Foundation scope; M9 production-dependency reassessment is in section21. Original audit: PARTIAL on 2026-10-22; see section 9 for closure evidence.**

> **Publication scope as of 2026-10-27:** Phase1 baseline **9e8bb00** remains on GitHub main. M1–M9, including the completed Phase2 core loop, M9 fixes and this report, are published on **codex/phase2-contracts**. Verified code/closure checkpoint **7bdc41d** was pushed on2026-10-27 under explicit user authorization; a documentation-only publication update follows it. No main merge or deployment occurred. Phase2 is complete for the approved local scope with the accepted historical benchmark exception; see section21.

## 1. Maintenance instructions

Nothing updates this file automatically. Whoever completes a later phase (a person or an agent) must update THIS report before calling the phase done. They must:

1. Add the new phase's checklist and results, and keep every earlier section and the update history.
2. Record new verification evidence: exact command, result, exit status, short output quote. Tag each conclusion `[Verified]`, `[Inferred]` or `[Untested]`.
3. Re-check earlier requirements that the new work touches (auth, error codes, route registry, API types) and change their status if they regressed.
4. Update the phase tracker (section 3) and the latest dated verdict for each affected phase (Phase1 section9; latest Phase2 milestone at the end). Preserve the original section 7 verdict as history.
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

- Current Phase2 scope: docs/PHASE-2-PLAN.md and the user-approved M4 creation/dashboard, M5 canvas and M6 connections/history/repair scopes, and the approved M7 Traffic/Results scope, with verification in sections15–19. Historical Phase1 sources follow.

- `nest-boilerplate/nest-boilerplate/docs/stressforge/PHASE-1-PROMPT.md` (the Phase 1 specification; the only roadmap-like document found).
- The prototype's `PHASE_NAMES` and route phases (SECTION 5) for the phase names of Phases 2 to 5.
- `README.md` and `docs/ARCHITECTURE.md` (what the project claims).

No CLAUDE.md, CONTRIBUTING file or earlier progress report exists. `web/AGENTS.md` only says Next.js 16 differs from older versions.

## 3. Phase tracker

| Phase | Name | Status |
| --- | --- | --- |
| 1 | Foundation | Complete (2026-10-23): functional findings closed; dependency reachability triaged; evidence and limits in section 9 |
| 2 | Core loop (designs API, simulation module, canvas editor, Traffic / Results / Limits) | Complete (2026-10-27): M0–M9 verified for the approved local scope; historical benchmark exception explicitly accepted. See sections13–21. M1–M9 published on codex/phase2-contracts; main remains the Phase1 baseline |
| 3 | Improve and history | In progress (2026-10-28): M10 evaluated, real-inference gate NO-GO; M11 backend foundation verified, AI disabled by default; M12–M17 remain. Sections24–26 |
| 4 | Public and learning pages | Partial: public landing verified locally (section23); remaining public/learning features remain placeholders |
| 5 | Evaluation, settings, onboarding, developer screens | Not started |

Phase 1 has a complete Foundation audit; Phase 2 verification includes M3 saved designs, M4 creation/dashboard, M5 canvas and M6 connections/history/repair; M7 Traffic/Results is verified in section19; M8 Limits/live preview/overlay is verified in section20; all M9 application gates pass and the user accepted the historical benchmark exception; Phase2 is complete for the local scope documented in section21.

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

- **2026-10-28 — M11 foundation verified:** explicit approval after M10;201 backend unit tests pass (2 existing opt-in skips),76 e2e pass, backend/frontend build/types/lint pass. Additive migration preserved5 existing designs. AI stays disabled; no M12 UI or real-model approval. Local changes are not committed/pushed; see section26.

- **2026-10-28 — M10 / public entry / role planning:** four-role direction recorded, landing implemented/verified, Ollama models inspected and benchmarked; current inference configuration NO-GO due quality/resource failures. See sections22–25; all prior phase history retained.

- **2026-10-27 — GitHub publication:** user explicitly requested pushing to Mubassir-Ebne-Mohsin/AWT_PROJECT_FALL_26-27. Fast-forward push published M7–M9 through7bdc41d on codex/phase2-contracts, including the closure report. Main was not merged; the benchmark remains unstaged. Earlier no-push statements describe the implementation/closure stage before this authorization.

- **2026-10-27 — M9 / Phase2 closure accepted:** user explicitly said “Accept exception and close M9.” All functional verification remains green. The unrecovered historical M2 benchmark is an accepted preservation exception and stays unstaged. Earlier failures and the prior partial verdict remain preserved below. No push, deployment or Phase3.

- **2026-10-27 — M9 verified locally:**187backend unit/59e2e,120web unit,232Chrome,14scoped Edge,4dev-state cases,636s soak and real outage/restart/fresh-setup/retention checks pass. Final evidence and code checkpoints are in section21. Formal closure remains PARTIAL solely for the unrecovered original M2 benchmark; current file unstaged. No push or Phase3.

- **2026-10-27 — M9 authorized/in progress:** demonstrated dependency/refresh/laptop-layout defects repaired;181 unit/59 API/120 web checks, real recovery, bounded soak and retention observed. Full browser/channel/dev acceptance is in progress. Section21 records initial failures and the accidental overwrite of the unrelated M2 source-profile artifact; preservation closure remains open.

- **2026-10-27 — M8 completed locally:** Saved Limits (all three honest search states), debounced cancelable live preview, Load overlay with the shared traffic control, Traffic live panel and recorded Results topology. Simulation, Limits and preview identities are separate.176 backend unit/59 e2e/120 frontend unit tests pass. Full Chrome regression216/216; later fixes reverified by focused reruns (M5/M6/M8116/116, remaining suites in section20); M8 Chrome48 combinations, Edge12/12, dev4/4. Real PostgreSQL/Redis outages and an API restart during a pending Limits search (INTERRUPTED, no resubmission) verified. Initial failures, three application fixes found by new tests/screenshots, one user-approved M3 assertion change and one unreproduced 409 observation are recorded in section20. M9 remains; no push.

- **2026-10-26 — M7 completed locally:** Full Traffic controls and recorded Results implemented.174 backend unit/44 e2e/101 frontend unit tests pass. Final complete browser invocation168 passed/4 intentional production dev skips; separate dev4/4 covers the skips. M7 has44 unique Chrome combinations (40 in that full run plus4 separately added pipeline-analysis cases) and11 Edge passes across two invocations. Real PostgreSQL/Redis/API interruptions retained traffic/history, recovered Undo and allowed a new run. Section19 preserves initial failed invocations and test corrections. M8–M9 remain; no M7 GitHub push.



- **2026-10-25 — Local startup recovery:** Pasted log showed PostgreSQL/Redis ECONNREFUSED after successful compilation. Docker Desktop engine was stopped. Started Docker and the existing normal development Compose services without resetting volumes, restarted the exited backend watcher under Node22, and verified health200 (postgres up/redis up) plus Swagger200. See section18. No M7 implementation.

- **2026-10-24 — M6 completed and code published:** Connections/reversal/deletion, component duplication/deletion, bounded undo/redo and revision-bound graph repair implemented.174 backend unit,44 e2e,86 frontend unit,40 M6 Chrome and10 Edge scenarios passed. Real PostgreSQL/Redis interruptions retained connections/history. Initial full browser run122 passed/2 Foundation timing failures/4 dev skips; strengthened Foundation rechecks8/8 and separate dev checks4/4 passed. Section17 preserves this evidence and limits. Code a08d284 and test synchronization b90737d published on codex/phase2-contracts; main unchanged.

- **2026-10-24 — M5 completed:** Approved canvas fundamentals implemented and verified: all twelve types, selection/movement/properties, pan/zoom/fit/minimap, keyboard alternatives and guarded persistence. Final174 backend unit,44 e2e,73 frontend unit,32 final Chrome and7 Edge cases passed; full regression checkpoint84 passed/4 dev-only skips. Actual PostgreSQL/Redis outage recovery verified. Section16 records evidence, corrections and limits. Local only; M6–M9 not started.

- **2026-10-24 — M4 completed:** User approved Creation/dashboard. Four creation flows, source-parity scripted drafts, persistent assumptions, honest saved-result summaries, confirmed deletion and recovery implemented.173 backend unit/44 API/63 frontend tests,60 production Chrome/4 Edge/4 developer-state checks passed; real PostgreSQL/Redis/API outages recovered with retained inputs. Scope, corrections, evidence and limits in section15. Local only; M5–M9 not started.

- **2026-10-24 — M3 deep audit closed:** Six issue groups fixed;148 unit/39 API/56 frontend tests,44 production Chrome browser checks,7 Edge scenarios and4 developer-state cases passed. M3 backend line coverage96.44%, branch86.41%. Three inherited backend advisories remain documented; no dependency change or GitHub push. See section14.

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
## 14. M3 deep audit and hardening (2026-10-24)

User requested deeper testing after the replica autosave correction. This follow-up inspects actual implementation and expands adversarial coverage; it does not start M4. Earlier M3 completion evidence and its limitations remain above.

### Reproduced findings and resolutions

All functional findings below are closed by the accompanying code/tests. Severity describes impact, not a claim that user data was compromised.

| ID / severity | Reproduction and impact | Fix / evidence |
| --- | --- | --- |
| M3-D01 / medium | Accept a simulation but lose its response; retry gets429 (or401). The browser discarded requestId and could create another run. Reloading a conflicted draft also discarded the uncertain identity. | WEB/lib/editor-session.ts preserves identity through throttling, authentication recovery and draft reload. Both state regressions failed before correction. A real-service browser test verifies one request identity and one retained run after lost acceptance→429→retry. |
| M3-D02 / medium | Run two revisions; select the older row from Dashboard. URL points to the old run, but a cached newer run overrides it and displays the wrong result. | Workspace now prioritizes the selected URL and only displays matching run data. Browser reproduction failed before the fix and passes afterward. Selected-result read failures now have an inline retry. |
| M3-D03 / medium | Open/save a clean design, leave it, save from another client, then reopen within the query cache lifetime. The UI reports Saved but still shows old inputs. | Refetch on workspace entry/focus; EditorSession adopts strictly newer server revisions only while clean/not saving. Browser failed with replicas1 instead of7 before correction. Unit tests also protect dirty/in-flight edits and ignore old responses. |
| M3-D04 / medium | Delete a design between Dashboard's joined run read and its later design-name lookup. The entire dashboard returned404. | API/modules/designs/designs.service.ts reads the name in the same joined query, removing the race and extra per-run lookup. Deterministic DB interleaving test failed404 before correction and passes200 after it. Stable ID tiebreakers also make equal-timestamp ordering deterministic. |
| M3-D05 / medium | A submission response arrives after local logout/account disposal or after leaving the workspace. The old handler could return acceptance or redirect back to Results. A held-response browser test reproduced the unwanted redirect. Template creation had the same stale-handler pattern. No data-access bypass was observed. | EditorSession checks disposal after awaiting submission; useActiveView prevents unmounted run/template handlers from redirecting. Unit and delayed-response browser tests protect these paths. Accepted backend work still completes independently. |
| M3-D06 / low | A draft is saved but calculation acceptance is unknown. Dirty-only navigation/unload checks did not warn before losing its memory-only retry identity. | Draft guards now include saving, running and uncertain intent. State test proves saved-but-uncertain work remains unsettled. Browser-history cancellation remains the documented later-editor limitation. |

The earlier autosave normalization defect remains covered: the deep browser test edits Database replicas (initially omitted), observes multiple complete750ms debounce windows, and confirms exactly one PATCH before/after Run.

### Expanded checks and environment

- Node22.23.4; existing pnpm/lockfiles; no new runtime package or AI call.
- Existing user servers on3000/5001 were not stopped. Separate API5003, web3003, databases sf_m3_deep_20261024 and sf_m3_deep_e2e_20261024. Initial smoke checks used existing local Redis; subsequent full checks used the dedicated stressforge-m3-deep-redis container on6393 to separate sessions/throttle counters. No normal design/user rows were changed.
- Added opt-in STRESSFORGE_AUDIT_BUILD=1, fixed .next-audit output, lint/Git ignores and generated-type includes, so audit builds do not replace a running .next development build. Default build/run behavior is unchanged.
- API e2e uses real PostgreSQL and existing Redis/rate-limit doubles. Browser checks use real PostgreSQL, Redis, JWT/cookies and the real worker. Disposable real-Redis Compose configuration tests were also enabled.
- The user-modified audit/m2-profile-source.json is preserved and excluded. Reference model/fixtures and API contracts are unchanged.

| Gate | Observed result |
| --- | --- |
| API pnpm test --runInBand --silent with TEST_REDIS_COMPOSE=1 | PASS,148/148,10 suites; no skipped tests |
| API pnpm test:e2e --coverage --collectCoverageFrom=src/modules/designs/**/*.ts | PASS,39/39 (22 Foundation +17 M3),2 suites |
| M3 backend coverage | Statements95.66% (265/277), branches86.41% (70/81), functions96.15% (50/52), lines96.44% (244/253). Only modules/designs is collected; this is not whole-project coverage or proof of correctness |
| API build / strict typecheck / lint:check | PASS; lint0 errors,22 inherited warnings |
| WEB pnpm test | PASS,56/56 |
| WEB lint / strict typecheck / isolated production build | PASS |
| Canonical schema/examples/reference fixtures | PASS contract:phase2:check and fixtures:phase2 |
| WEB route/live/planned API checks | PASS;35 routes, live /docs-json types and planned types unchanged |
| Final production browser matrix | PASS,44 passed;4 dev-only cases intentionally skipped against production;3.4min. Chrome at1024/1440, light/dark. Seven deep cases plus existing M3/Foundation browser flows |

New backend cases reject invalid replicas/fractions/capacity/properties/IDs/coordinates/pagination without mutating the design; accept zero traffic and replicas200 with finite outputs; save but refuse a cyclic graph; resolve conflicting concurrent request identities; expire admission behind a real PostgreSQL row lock and successfully retry; protect >50 young request keys plus pending records; reproduce concurrent dashboard deletion, and prove retained-key replay precedes scheduler-full rejection. Earlier tests retain actual worker crash/timeout, DB acceptance/finalization failure, restart, ownership, immutable snapshots and deletion coverage.

One Foundation rate-limit test exceeded its5s budget while running dozens of dummy Argon2 checks under concurrent build load. Its throttle-only loop now uses schema-rejected requests and asserts422 until429; ordinary incorrect-credential/password verification remains independently tested. No runtime limit was raised. The audit directory initially needed an explicit ESLint ignore because generated bundles were being scanned; corrected before the final lint pass.

### Dependency/security review and remaining limits

Fresh pnpm audit --prod: frontend0 advisories; backend3 (2high,1moderate). No dependency/lockfile was changed in this audit.

| Dependency / path | Registry advisory and current assessment |
| --- | --- |
| multer2.4.0 via @nestjs/platform-express | [Pending asynchronous fileFilter DoS](https://github.com/advisories/GHSA-q7qp-rjg7-q26m), high. Newly recorded in this review; the dependency already existed. [Verified] no FileInterceptor/FilesInterceptor/AnyFilesInterceptor/MulterModule/upload handling call sites in src. [Inferred] the affected file-filter path is not exposed by current M3. This is not a full exploit proof; update the parent/transitive dependency in a reviewed follow-up, before adding upload handling. |
| @faker-js/faker via nestjs-seeder | [helpers.fake code execution](https://github.com/advisories/GHSA-qxc2-j82w-r537), high. Existing Foundation follow-up. [Verified] seeding uses fixed values/argon2 and no helpers.fake calls; no untrusted template evaluation is added. |
| uuid via Bull | [v3/v5/v6 buffer bounds](https://github.com/advisories/GHSA-w5hq-g745-h8pq), moderate. Existing Foundation follow-up. M3 uses node:crypto randomUUID; this audit adds no affected buffer API calls. |

Static M3 review found no eval/dangerous HTML/console.log call sites in its server/workspace/session code. Ownership, unknown-field rejection and safe failure envelopes are tested; no new authorization bypass was observed. This is a scoped review, not a claim of zero security risk or a clean backend dependency audit.

Single API instance, memory-only unsaved drafts, interrupted-job failure rather than automatic compute resumption, latest10 dashboard cards and mathematical model limitations remain documented design boundaries. Long-running storage/soak tests, Firefox/WebKit, full assistive-technology testing and formal race verification remain untested. Frontend dependency scan is current only for this audit date. No production deployment or paid usage occurred.

**Deep-audit verdict: PASS for the tested M3 functional scope. Six finding groups closed; no remaining functional failure observed in the completed gates. The backend dependency scan is not clean, and the limits above remain explicit.** Future work must update this same living report, retain this evidence/history and reassess affected earlier requirements; updates are not automatic.

Additional final checks: Microsoft Edge passed all7 deep scenarios (21.4s); a focused Chrome follow-up also passed Back navigation after delayed acceptance. Original M3 screenshots were preserved; the new snapshots are audit/m3-deep-review-{1024,1440}-{light,dark}.png. Aggregate machine-readable evidence is audit/m3-deep-verification.json.

Developer-state follow-up:4/4 passed against the isolated next dev server (40.4s), covering all ten states per width/theme combination. The4 production-only skips are therefore separately verified rather than hidden. Backend checkpointc2d22b7; frontend checkpointe8ef367. No M4 work started.

Cleanup: final audit health200; stopped only owned ports3003/5003 and the labelled audit Redis container. Isolated databases and stopped audit container remain for reproducibility. Normal3000/5001 services and user data were preserved; unrelated m2-profile-source.json remains uncommitted.

## 15. M4 — Creation and dashboard

**2026-10-24 (Asia/Dhaka). Verdict: M4 COMPLETE for its approved scope. Phase 2 remains IN PROGRESS; M5–M9 are not implemented or authorized.** The user approved the reviewed M4 plan and recommended decisions before implementation. This is implementation work, not the historical read-only audit. Sources: [Phase 2 roadmap](PHASE-2-PLAN.md), prototype Sections 10–11 and its MockAI.draft rules, frozen M1 import/CreateDesign contracts, completed M3 lifecycle and applicable web/AGENTS.md / installed Next page documentation. [M4 operating guide](M4-CREATION-DASHBOARD.md); [durable verification summary](audit/m4-verification.json).

### Requirement mapping

| Requirement | Implementation and verification evidence | Status |
| --- | --- | --- |
| Four creation choices | Existing /new URLs now mount chooser/blank/import/describe components under WEB/src/components/creation; six-template picker extended in workspace/template-picker.tsx. All routes exercised through real services and registry matrix | Verified |
| Six exact templates and custom names | Real graph thumbnails, selected details, editable copy name, quick-use actions; API e2e saves/reopens every template and compares graph/traffic, creating no implicit run | Verified |
| Blank starting draft | Name/region/preset and Clients-only/empty variants; API/unit/browser checks verify persisted region/preset and safe empty draft; Run still blocks invalid architectures | Verified |
| Import | Existing importDesign normalizer reused behind authenticated POST /v1/designs/prepare. Paste/file/legacy/version1 supported; 64 KiB UTF-8/50-node/200-edge contract preserved; defaults/layout/collision-free IDs tested. Malformed/unsupported/forged input creates no design/run | Verified |
| Scripted description | Ported prototype keyword rules; four exact source-example parity cases. Explicit Scripted mock label before submission, review and name before saving; invalid-output demonstration cannot create a design. No provider or quota operation | Verified |
| Persistent assumptions | Validated description contains original text plus delimited Scripted mock assumptions section, within existing 2000-character limit. Workspace renders it as text; browser reload verifies retention | Verified |
| Dashboard | Real owned summaries/cards, retained counts, scoped Needs attention, all four creation shortcuts, selected recent-run links, empty/loading/retry states. Unrun/stale/pending/calculation-failed/model-verdict distinctions have focused tests. No mass simulation or Limits computation | Verified |
| Confirmed deletion | Shared accessible alert dialog; cancel preserves row, confirm removes it and updates summaries/editor cache. Existing M3 e2e continues to verify ownership, cascade/compute cancellation and dashboard deletion interleaving | Verified |
| Recovery and duplicate prevention | CreationSession/CreationProvider keep per-user/per-screen memory above system pages. Concurrent clicks guarded; input edits invalidate previews; names preserve checked graph. Disposed/late replies ignored; network/5xx creates become uncertain, with dashboard recovery or explicitly confirmed new intent. Unconfirmed work warns on unload | Verified |
| Integration/security | Existing authenticated create/ownership/revision/error/session contracts retained; live OpenAPI preparation operation and generated WEB/schema.d.ts. No new runtime dependencies, database migration or env value. Existing Foundation and M3 regressions pass | Verified |
| Visual/accessibility baseline | Prototype opened in browser and compared with generated template/dashboard images; original tokens/fonts/layout classes reused. Chrome matrix at1024/1440 light/dark checks all35 routes, keyboard palette/drawers/auth, focus recovery and overflow; M4 form labels, safe text and delete dialog exercised. Edge M4 journeys pass | Verified |
| Living documentation | Root README, architecture, roadmap, frontend test guide and M4 guide updated; earlier report history preserved | Verified |

### Checks performed

All final commands below returned exit0. Node22.23.4 was used; repository package managers/lockfiles remained unchanged.

| Check | Observed result |
| --- | --- |
| API pnpm build / pnpm typecheck / pnpm lint:check | Pass; lint0 errors,22 inherited warnings; compiled API starts and serves health/docs |
| API pnpm test --runInBand with TEST_REDIS_COMPOSE=1 | 173/173,11 suites, no skips, including disposable real-Redis checks |
| Final focused creation.spec.ts coverage | 25/25; creation.ts + scripted-draft.ts only: statements94.48%, branches81.87%, functions100%, lines96.21%. Not whole-project coverage |
| API pnpm test:e2e, DB_TEST_DATABASE=sf_m4_e2e_20261024 | 44/44,2 suites; actual PostgreSQL, existing Redis/throttler doubles |
| WEB pnpm test | 63/63; concurrent creation, unknown acceptance, definitive errors, disposal, edited previews, names and status labels added |
| WEB pnpm lint / pnpm typecheck / pnpm build | Pass; isolated STRESSFORGE_AUDIT_BUILD=1 output used for production build |
| WEB pnpm check:routes | 35 registry patterns, all have pages |
| Live openapi-typescript against5003/docs-json --check; pnpm gen:phase2 --check | Pass; live types include preparation, frozen planned types unchanged |
| API pnpm contract:phase2:check / pnpm fixtures:phase2 | Pass; canonical contracts/examples and six complete fixtures/minimum-load counterexample still match |
| Chrome production pnpm exec playwright test | 60 passed,4 intentional @dev skips,4.5min;16 new M4 checks included across four width/theme combinations |
| Edge M4 suites,1440/light | 4/4 passed,18.0s |
| Separate next dev @dev run with SF_DEV_STATES=1 | 4/4 passed,30.9s; all10 demo states per width/theme combination. Production skips separately verified |
| Real dependency outages | Dedicated labelled PostgreSQL5547 and Redis6394 stopped/restarted independently: health503 while down,200 after recovery; blank name/description retained; no design created during failed write |
| Actual API stop/restart | Verified only the audit port5003 process, stopped it with an import form open, observed waking-up, restarted and confirmed health200, then verified original import text returned intact |
| Source/diff review | No new eval/dangerous HTML/runtime console logging found in scoped creation source; no package/lock/.env/reference-engine changes. Existing M3 screenshots restored after regression tests |

Browser evidence: audit/m4-dashboard-{1024,1440}-{light,dark}.png; audit/m4-templates-{1024,1440}-{light,dark}.png; audit/m4-api-unreachable.png. The screenshot comparison establishes reuse of the reference design language, not pixel-identical analytical UI: unavailable live verdict/breakpoint figures are explicitly deferred rather than fabricated.

### Findings caught and resolved during implementation

1. **Import transport boundary:** a valid64 KiB raw JSON file padded with tabs became >100 KiB when escaped in the request envelope and was rejected. Reproduction is now a passing e2e case. Preparation alone allows160 KiB transport; raw UTF-8 limit remains64 KiB and other JSON routes100 KiB.
2. **Parser integration:** directly registering Express JSON parsing caused Nest to skip its default parser on other routes; compiled pnpm resolution also exposed that Express is transitive, not a direct runtime import. The final implementation uses Nest's supported useBodyParser API, explicitly registers both bounded parsers, and passes Foundation auth/e2e plus compiled startup. No new package needed.
3. **CORS on parse failures:** an oversized preparation request initially returned422 without Access-Control-Allow-Origin, which browsers could mistake for a network outage. Parsing now follows CORS/helmet; the dedicated test asserts422, VALIDATION_FAILED, allow-origin and nosniff headers.
4. **Stable control labels:** wrapped selects and changing textarea text made exact label targeting unreliable. Explicit accessible names keep controls labelled through edits and errors; the browser journeys now pass.
5. **Creation lifecycle:** synchronous in-flight guards and retained uncertainty prevent immediate duplicate submissions; text/preview state survives actual outages. Wrong/late account replies cannot navigate or restore data. This is deliberately not a cross-tab/server idempotency guarantee.
6. **Harness corrections:** browser assertions were corrected to use the existing design-name input, inline alerts and alertdialog role. A premature API-restart gate timed out before health was ready; the rerun explicitly required health200 and passed. Intermediate failures/aborted reruns are not counted as final passes.

No unresolved mandatory M4 functional defect was observed in the tested scope.

### Decisions, limitations and continuity

- [Verified] Scripted rules preserve prototype daily-user conversion with a visible assumption. Literal unsupported server/worker counts are rejected instead of silently clamped; negative/fractional counts cannot become positive via substring matching. Scripted drafting is a heuristic, not a general natural-language parser.
- [Verified] Assumptions use the existing description as explicitly delimited text; no Notes feature or metadata migration. Template previews show graph/default traffic, with no invented p95/breaking point. Saved runs remain the numerical authority.
- [Verified] Dashboard displays ten recent designs and ten recent retained runs. Attention count names its ten-design scope. The standalone /designs page remains Phase3; counts are not invented lifetime statistics.
- [Verified] Form recovery is memory-only. Reload/tab close loses unsaved form state; separate tabs/reloads may still deliberately create duplicate designs. The UI explains uncertainty and offers dashboard recovery. General cross-tab create idempotency is not claimed.
- [Verified] Normal user tables were not truncated; e2e and browser databases were isolated. A separate dedicated PostgreSQL/Redis pair was used before stopping any service. Audit auth limit300 was process-only; normal global120 limit and all .env files were unchanged.
- [Untested] Firefox/WebKit, formal assistive-technology review and long-duration soak/storage-growth tests were not run in M4. The inherited three backend transitive advisories remain as triaged in section14; dependency audit was not refreshed and no dependency version changed.
- [Verified] Phase1 auth/errors/session/shell and M3 save/conflict/selected-run/normalization/lost-acceptance/late-navigation requirements were reassessed through the full regressions. Their completion verdicts remain unchanged.
- [Verified] M5–M9 remain: interactive canvas, edges/undo/save refinements, full Traffic/Results, Limits/preview and final Phase2 acceptance. Real AI is a later essential course requirement; scripted output does not satisfy it.

Publication is local only on codex/phase2-contracts. The pre-existing modified audit/m2-profile-source.json remains untouched and excluded from M4 commits. Future milestone completion must update THIS report, retain earlier history, add new verification evidence and reassess affected earlier requirements; no automatic update or synchronization is promised.

M4 local code checkpoints: backend **5c53dc9**; frontend/tests/types **9d89900**. Final audit health and Swagger both returned200 before cleanup. The verified audit API/frontend processes were stopped; only containers labelled stressforge.audit=m4 (PostgreSQL5547/Redis6394) were stopped and retained for reproducibility. Normal PostgreSQL5433, Redis6379 and the pre-existing QA services remained running/healthy. No normal development frontend was stopped, no .env was edited, and no GitHub push occurred.


## 16. M5 — Canvas fundamentals

**2026-10-24 (Asia/Dhaka). Verdict: M5 COMPLETE for the approved canvas fundamentals scope. Phase 2 remains IN PROGRESS; M6–M9 are not implemented or authorized by M5 approval.** Sources: user-approved M5 scope, [Phase2 roadmap](PHASE-2-PLAN.md), prototype Sections12–14 and static glyphs in Section2, frozen M1 graph/catalog contracts, existing M3/M4 lifecycle, web/AGENTS.md and installed Next client-boundary documentation. [Operating guide](M5-CANVAS.md); [durable verification summary](audit/m5-verification.json).

### Requirement mapping

All Verified rows below combine inspected implementation with the checks listed next.

| Requirement | Implementation / evidence | Status |
| --- | --- | --- |
| All twelve types, click and palette drag | WEB/components/canvas/palette.tsx and lib/canvas/model.ts use the real catalog. Collision-free IDs across nodes/edges;50-node limit. All twelve types saved/reopened; zoomed drop, outside drop, Escape and keyboard activation exercised | Verified |
| SVG architecture and selection | graph-nodes.tsx ports trusted static prototype icons,184x64 nodes, grid and existing directed curves. Click, keyboard and dropdown selection; labels remain escaped React text. Existing edges follow node movement | Verified |
| Movement and coordinates | geometry.ts + graph-canvas.tsx convert viewport/world coordinates; local preview then one release commit.12-unit grid; keyboard12/Shift48 and position buttons; finite/clamped API bounds. Reload and mid-gesture write counts asserted | Verified |
| Properties | node-properties/property-fields use catalog editableProperties, region/defaults and type-specific controls. Clients traffic weight has no replicas; CDN global location has no region selector. Empty/nonfinite/fractional/out-of-range values cannot be saved; legal imported values are not rewritten on inspection | Verified |
| Pan, zoom, fit, minimap | Background pan; actual wheel pointer anchor;30–200% zoom; prototype30–115% Fit; focus-selected, buttons/scoped shortcuts and interactive minimap. These view changes send no PATCH | Verified |
| Persistence and lifecycle | EditorSession guards incomplete gestures/invalid fields, serialized750ms autosave, explicit Save/Run and existing conflict/uncertain acceptance flow. Cancel/focus loss commits nothing. Clean held remote revisions apply after cancellation. Failed moves remain retryable | Verified |
| Numerical staleness | Semantic comparison excludes positions/title and retains semantic graph/traffic fields/order. Layout-only movement keeps the saved result current; replicas mark it stale. Stored revision/fingerprint/version remain visible. Dashboard says Earlier revision because summaries cannot prove semantic equality | Verified |
| Appearance/responsiveness/accessibility | Reference opened in browser and compared with M5 screenshots. Existing fonts/tokens, node icons/curves, panels and grid reused; narrow1024 layout and1440 layout in light/dark. Actual899/900 breakpoint, keyboard alternatives, visible focus and no console/overflow failures in scenarios | Verified |
| Earlier integration | Full Foundation/M3/M4 browser checkpoint, final creation journey and backend e2e passed; live OpenAPI types unchanged. Auth/session/ownership/save/selected-run/creation recovery requirements reassessed by regressions | Verified |
| Living docs and scope | This report, roadmap, README, architecture, canvas/test guides and evidence updated. No endpoint, package/lockfile, migration, env, route registry or engine behavior change | Verified |

Implementation paths above are under WEB/src unless otherwise stated. Connections render but cannot yet be created/reversed/deleted; component deletion/duplication and undo/redo remain M6. Full Traffic/Results are M7; load overlays/live preview/Limits are M8. Newly added disconnected components are safe drafts; creating a new runnable topology needs M6. Existing connected templates remain runnable. Real AI remains a later course requirement.

### Checks and observed results

Node22.23.4; existing pnpm versions retained. All final commands below returned exit0. Intermediate failures are documented separately.

| Check | Result |
| --- | --- |
| API pnpm build / pnpm typecheck / pnpm lint:check | Pass;0 errors,22 inherited lint warnings |
| API TEST_REDIS_COMPOSE=1 pnpm test --runInBand | Final174/174,12 suites,61.285s; includes real Redis and catalog-fixture equality |
| API pnpm test:e2e --runInBand, DB_TEST_DATABASE=sf_m5_e2e | 44/44,2 suites,54.787s; actual isolated PostgreSQL, existing Redis/throttler doubles |
| WEB pnpm test | 73/73,33.272s;10 new canvas tests plus prior regressions |
| WEB pnpm lint / pnpm typecheck / pnpm build | Pass; production build uses ignored .next-audit and isolated API URL |
| WEB pnpm check:routes; live openapi-typescript /docs-json --check | Pass;35 registry patterns and unchanged live API contract |
| Full Chrome production pnpm exec playwright test checkpoint | 84 passed,4 intentional @dev skips,6.8min, four width/theme combinations; before final Escape/focus cancellation correction |
| Final Chrome pnpm exec playwright test m5.spec.ts m5-boundary.spec.ts plus full M4 creation-journey selection | 32/32,3.4min across1024/1440 light/dark; after all application changes, including cancellation/layout corrections |
| Edge pnpm exec playwright test m5.spec.ts m5-boundary.spec.ts --project=1440-light | 7/7,47.6s on final source |
| Focused canvas coverage via Node test loader | geometry100% lines/branches/functions; model92.06% lines,87.23% branches,100% functions. This is transpiled focused-helper coverage, not whole-app coverage |
| SF_M5_REAL_OUTAGES=1 node tests/verify-m5-services.cjs | Actual dedicated PostgreSQL5548 and Redis6395 stop/restart: health503 independently,200 after recovery; node positions retained and explicit save recovered |
| Source/reference comparison | Reference and M5 browser screenshots inspected; reference files unchanged. No pixel-identical or completed analytical-overlay claim |

Browser matrix scenarios cover: mid-drag pauses beyond autosave, one release write, exact Shift movement, layout-versus-property staleness, all12 types, invalid fractions and200 replicas, reload, pointer cancellation/Escape/focus interruption, failed-save retry, zoomed palette drops, no writes for views,50nodes/200edges, remote revision during gesture, wheel/zoom limits/minimap keyboard, and899/900px resize.

Evidence images: audit/m5-canvas-{1024,1440}-{light,dark}.png and audit/m5-reference-1440-light.png. Local ignored logs retain detailed runs; durable results are captured in audit/m5-verification.json. Historical M3/M4 screenshots overwritten by regression execution were restored from HEAD, preserving earlier phase evidence.

### Findings resolved / verification corrections

1. **Wheel listener:** React's passive wheel handling could emit preventDefault console errors. Replaced with a scoped native passive:false listener and cleanup; actual wheel browser case passes.
2. **Gesture safety:** source of truth stays unchanged during pointer frames; Escape, lost capture, pointer cancellation and focus leaving for Ctrl+K cancel safely. A compiled follow-up reproduced an Escape palette drop still adding a component; cancellation now suppresses the trailing pointer click. Final Chrome/Edge checks verify no node was added.
3. **Remote replacement:** reads arriving during a clean drag were protected but needed reconsideration after cancellation. Gesture/input dependencies and focus-refetch policy now apply held clean revisions after cancellation. The browser harness dispatches window visibilitychange, matching the installed TanStack listener; its earlier document-target timeout was a test mistake.
4. **Imported positions and visual boundary:** keyboard movement preserves exact12/48 deltas from non-grid imported coordinates; pointer drags still snap. Explicit M5 CSS overrides the prototype's900px hide rule, so the stated900px boundary actually works. Description/assumptions moved below the canvas; the final creation/reload journey passes.
5. **False staleness:** layout-only saves previously caused revision-based stale labels. Detailed results compare semantic inputs; dashboard summaries honestly show Earlier revision without inventing model equality.
6. **Worker timing:** one intermediate full run had173 passes/1 real-worker deadline failure under active build/browser load. No runtime deadline or test expectation was loosened. Focused worker/catalog rerun passed14/14; final full suite passed174/174. Temporary resource contention is a plausible explanation, not proven causality; the earlier timeout is retained as a reliability observation.

### Decisions, limits and remaining work

- [Verified] No new dependency, schema/migration or environment setting. Pure SVG/React reuse the approved stack. Static source glyph HTML is trusted constant data; user labels never enter raw HTML.
- [Verified] M5 services/database are isolated: labelled audit PostgreSQL5548/Redis6395, API5003/web3003; process-only audit auth limit300. Normal data/services and .env remain unchanged. No paid usage or production operation.
- [Verified] Palette grouping follows live catalog categories; source design language is ported, with connection tools and numerical overlays honestly deferred. It is not a claim of final full-prototype fidelity.
- [Verified] Memory-only unsaved drafts and view state, no cross-tab merge/offline persistence, single API instance and earlier model assumptions remain. Extreme imported extents can exceed a single view at minimum30% zoom; pan/dropdown/focus remain available.
- [Untested] Firefox/WebKit, formal assistive-technology audit and long-duration soak/storage tests. The50-node frame sample is only a short usability smoke test.
- [Untested in M5] Separate @dev state matrix and actual API process outage were not repeated; four production dev skips are explicit. M4's independently passed4/4 dev-state and actual API outage evidence remains historical. M5 did test real PostgreSQL/Redis outages and retained editing.
- [Verified] The three inherited backend transitive advisories remain triaged in section14; no dependency scan was refreshed and no version changed. A scoped functional pass does not mean a clean security audit.
- [Verified] Phase1 and M3/M4 regression verdicts remain unchanged. M6–M9 remain required before calling Phase2 complete: connections/deletion/undo/save refinements, full Traffic/Results, preview/Limits/load overlay and final integration acceptance.

**M5 verdict: COMPLETE for approved fundamentals; no unresolved mandatory M5 functional failure observed in the completed gates.** Changes remain local on codex/phase2-contracts, with no GitHub push. The pre-existing modified audit/m2-profile-source.json is preserved and excluded. Future milestone completion MUST update this same report, preserve earlier phase history, record new verification evidence and reassess affected earlier requirements; nothing updates automatically.

M5 local implementation checkpoint: **30ea144**. Final audit health and Swagger both returned200 before cleanup. Stopped only verified audit API5003/web3003 and the two containers labelled stressforge.audit=m5; databases/containers retained for reproducibility. Normal Docker PostgreSQL/Redis and pre-existing QA services remained running/healthy. No normal frontend was stopped. Historical screenshots were restored, the unrelated M2 profile stays uncommitted, and no GitHub push occurred.


## 17. M6 — Connections, history and graph repair

**2026-10-24 (Asia/Dhaka). Verdict: M6 COMPLETE for its approved scope. Phase2 remains IN PROGRESS; M7–M9 remain unfinished.** The user approved the reviewed M6 scope and explicitly requested GitHub publication. Sources: [Phase2 roadmap](PHASE-2-PLAN.md), prototype Sections12–14 and store/history behaviour, existing M1 graph contracts, M3 revision/run safety and M5 canvas. Applicable web/AGENTS.md and installed Next client-boundary documentation were read. [M6 operating guide](M6-CONNECTIONS-HISTORY.md); [durable verification summary](audit/m6-verification.json).

### Requirement mapping

| Requirement | Inspected implementation and observed evidence | Status |
| --- | --- | --- |
| Create directional arrows | Canvas ports support pointer drag, Connect source/target clicks and Escape/focus/capture cancellation. Labelled Source/Destination controls are the keyboard alternative. Actual zoomed port drag, two-click and repair-action journeys pass | Verified |
| Select/reverse/delete connections | Wide invisible SVG hit targets, keyboard selection and Connection dropdown; reverse keeps edge identity/order. Shared immutable commands reject self-links, duplicate directions, missing nodes and inputs into Clients;200-edge bound retained. Invalid operations do not write | Verified |
| Duplicate/delete components | Unique IDs, cloned properties, bounded copy labels, visible offset and no copied arrows. Node deletion removes incident edges in one history action; Undo restores the exact graph.50-node limit remains | Verified |
| Bounded undo/redo | EditorHistory stores at most60 input snapshots; property/name groups use1500ms coalescing, completed drags are atomic. New edits clear Redo; viewport/selection/checks/revisions/run identities are excluded. Buttons, Ctrl+Z/Shift+Z/Y/D and Delete respect text inputs and canvas scope | Verified |
| Useful graph repair | Existing POST /designs/:id/validate reused through Check graph after a serialized save barrier. Revision/input-bound errors and repairs focus named components; disconnected Clients offers Start connection. Run422 details populate the same panel. Changed checks are labelled Outdated; late/disposed replies are ignored | Verified |
| Draft versus runnable graph | Empty/disconnected/cyclic graphs save safely; errors block simulation. Cycle repair through arrow deletion/undo and successful blank Clients→App→Database run/reload exercised. Unreachable-component warnings remain informative and do not prevent otherwise valid runs | Verified |
| Save races and conflicts | Undo during delayed save survives acknowledgement and re-saves at the returned revision.429 keeps graph/history for retry. Concurrent remote edit yields409 and preserves local graph; deliberate reapply starts a new history boundary, with no automatic merge | Verified |
| Session and account boundaries | Four Chrome width/theme cases prove connection/history survives session-modal re-login. A mocked failed logout still clears local draft/history; same-owner re-login reopens stored inputs with Undo disabled. Another account receives403 and cannot see old component controls | Verified |
| Real failure recovery | Dedicated PostgreSQL5549 and Redis6396 interrupted independently: health503, recovery200, retained connection/history, explicit retry and Undo recover original graph. Audit identity/ports checked and containers restarted in finally | Verified |
| Earlier UI/integration | Foundation/M3/M4/M5 regression checkpoint plus strengthened Foundation repeats and separate dev-state matrix. Production build, strict types/lint,35 routes and live API-type equality pass. No dependency, lockfile, route, endpoint, schema, migration, env or engine behaviour change | Verified |
| Documentation/publication | This same report, tracker/history, roadmap, architecture, README, guides, tests and evidence updated. Implementation and earlier Phase2 commits pushed to codex/phase2-contracts; remote SHA matched local code checkpoint. Main unchanged | Verified |

Implementation: WEB/src/lib/canvas/commands.ts, lib/editor-history.ts, lib/editor-session.ts; components/canvas/{graph-canvas,graph-nodes,canvas-editor,connection-panel,validation-panel,node-properties}; workspace/workspace.tsx and the existing API wrapper. New tests are WEB/tests/m6.test.cjs, browser/m6.spec.ts and explicit opt-in verify-m6-services.cjs.

### Verification results and exact scope

Node22.23.4; existing pnpm/package versions retained. Final listed checks passed; the initial full-run failures are explicitly retained below rather than counted as passes.

| Check | Observed result |
| --- | --- |
| API pnpm build / pnpm typecheck / pnpm lint:check | Exit0;0 errors,22 inherited lint warnings |
| API TEST_REDIS_COMPOSE=1 pnpm test --runInBand | Exit0;174/174,12 suites,90.479s; includes real Redis |
| API pnpm test:e2e, DB_TEST_DATABASE=sf_m6_e2e | Exit0;44/44,2 suites,58.973s; actual PostgreSQL, existing Redis/throttler doubles |
| Existing migrations on fresh sf_m6_audit | Exit0; CreateUsers and CreateDesigns applied; no new migration |
| WEB pnpm test | Exit0;86/86,43.604s, no skips;13 focused M6 unit cases added |
| WEB pnpm build / pnpm typecheck / pnpm lint | Exit0; final production source built with isolated .next-audit, frontend lint clean |
| WEB pnpm check:routes; openapi-typescript http://localhost:5003/docs-json --check | Exit0;35 routes, live types unchanged |
| Initial full production Chrome pnpm exec playwright test | Exit1;122 passed,2 failed,4 intentional dev skips,16.4min. All36 original M6 cases passed across1024/1440 light/dark; both failures were existing Foundation journeys described below |
| Corrected Foundation pnpm exec playwright test phase1.spec.ts --grep '35 registry routes' --repeat-each=2 | Exit0;8/8,2.3min, both repeats of all four width/theme combinations, with actual two-tab rotation/login/logout assertions retained |
| Added M6 session/history case across all four Chrome projects | Exit0;4/4,29.4s. Together with the36 original M6 cases, all40 M6 Chrome checks passed on final application source |
| Edge pnpm exec playwright test m6.spec.ts --project=1440-light | Exit0;10/10,42.6s, all M6 journeys including the added session/history case |
| Separate next dev, SF_DEV_STATES=1, Playwright --grep '@dev' | Exit0;4/4,36.4s; all ten state demonstrations per width/theme. Production skips separately covered |
| SF_M6_REAL_OUTAGES=1 node tests/verify-m6-services.cjs | Exit0; actual PostgreSQL and Redis health503 independently; recovered200; connectionRetained/historyRetained/undoRecoveredOriginalGraph all true |
| Visual/source review | 1024/light and1440/dark M6 screenshots inspected; source design tokens/icons/geometry reused, arrows and toolbar visible, no horizontal overflow in asserted cases. Existing reference files unchanged |
| Final running API health / Swagger | Both200 before cleanup |

The full128-case command was not rerun after the test-only synchronization correction. Evidence is the initial122 passes plus focused repeated coverage of both failing Foundation cases, the added4 M6 session cases, Edge10 and dev4. Do not describe the original full invocation as a clean pass or add overlapping runs into a unique-test total.

Browser evidence: audit/m6-editor-{1024,1440}-{light,dark}.png. Earlier M3/M4/M5 screenshots generated by regressions are restored from HEAD so their historical evidence remains unchanged. Detailed local logs are ignored; the durable aggregate records outcomes, scope and limitations without tokens or auth traces.

### Findings and verification corrections

1. **The missing repair loop is closed.** M5 could save disconnected components but offered no arrow tool to fix them. M6 now provides actual connection creation and an explicit, actionable graph check, with a successful blank-to-run browser journey.
2. **History and revisions are separate.** Undoing a save must not restore an old server revision or erase newer edits when the outstanding acknowledgement arrives. Input-only snapshots and existing submitted-state acknowledgements pass delayed-save/undo/re-save tests.
3. **Reset boundaries are explicit.** Discard/clean remote adoption/deliberate rebase clears old history; session-modal reauthentication retains it. Explicit local logout/account switch clears it even when server logout fails. Failed logout does not claim confirmed server revocation.
4. **Connection safety:** cancelled pointers create no edge, reverse validates before mutation, and stale selections cannot leave an enabled delete action for a nonexistent edge. Pending connections suppress unrelated canvas nudges until completion/cancellation.
5. **Foundation browser timing:** the initial1024-dark journey reached login instead of the expected second restored tab; audit API logged refresh401. The1440-dark journey timed out waiting30s for reload's load event while its snapshot already showed an authenticated dashboard. Theme checks had awaited theme DOM immediately after repeated reloads without explicitly awaiting restored authentication. The final harness uses DOMContentLoaded and asserts the authenticated dashboard before the next reload; all original two-tab status and auth assertions remain. Eight focused repeats passed. Interrupted refresh/load timing is an inference, not proven universal causality; no auth verification/replay protection, server throttle, timeout or security rule was weakened.
6. **Test-only setup:** an initial new unit case accidentally used the real API saver instead of its test double; corrected dependency injection, final86/86 passed. An undefined CSS fill token was replaced with the existing surface token before final production build; final frontend lint has no new warning.

### Limits, remaining work and publication

- [Verified] The approved M6 editing/repair scope is implemented; no unresolved mandatory M6 functional failure was observed in completed final gates. The initial long-run browser timing failures remain recorded above; focused passing reruns do not prove every refresh-interruption race impossible.
- [Verified] History is local memory per user/design, not server history or offline persistence. Reload/tab close loses unsaved changes/history; existing guards warn where supported. There is no cross-tab merge. Whole-design deletion retains its separate existing confirmation.
- [Verified] Checks validate a successfully saved revision and do not silently rewrite the graph. Temporary view changes are not history/save operations. Numerical estimates and immutable run provenance remain unchanged.
- [Untested] Firefox/WebKit, formal assistive-technology audit and long-duration soak/storage-growth tests. A complete post-correction128-case rerun and an actual API-process outage were not repeated in M6; real dependency outages and network/session/failure paths were exercised as recorded.
- [Verified] Earlier three backend transitive advisories remain triaged in section14. No fresh dependency scan or dependency version change; this is not a clean-security-audit claim.
- [Verified] Normal data, .env and normal development services were preserved. M6 used dedicated labelled containers, sf_m6_audit/sf_m6_e2e, API5003/web3003 and a process-only audit auth limit300. No production changes or paid services/AI calls.
- [Verified] M7 full Traffic/Results, M8 load overlay/live preview/Limits and M9 final integration acceptance remain. Real AI is still a later essential course obligation. M6 completion does not complete Phase2 or authorize M7.

Publication: feature **a08d284** and Foundation harness **b90737d** were pushed to [codex/phase2-contracts](https://github.com/Mubassir-Ebne-Mohsin/AWT_PROJECT_FALL_26-27/tree/codex/phase2-contracts); git ls-remote matched **b90737df9399ca2647638f04171793da052522e7**. This also publishes previously local M1–M5 commits. Main remains Phase1 baseline9e8bb00; no forced update or merge. Documentation/evidence accompany a subsequent commit on the same branch.

The pre-existing modified audit/m2-profile-source.json remains untouched and excluded. Future phase/milestone completion MUST update this same report, preserve earlier history, record observed new evidence and reassess affected earlier requirements; nothing updates automatically.

Cleanup evidence: final audit health/docs200 recorded, then only verified API5003 and audit next dev3003 processes stopped. Only containers labelled stressforge.audit=m6 were stopped and retained. Normal development PostgreSQL/Redis and pre-existing QA containers remained healthy/running; normal frontend untouched. Historical M3/M4/M5 screenshots restored from HEAD. Documentation and sanitized evidence are committed/published on the same Phase2 branch; no main merge or production deployment.

## 18. Local startup recovery — 2026-10-25

[Verified] The supplied watch log had zero compilation errors followed by PostgreSQL and ioredis ECONNREFUSED. Live inspection found Docker's Linux engine pipe absent, no PostgreSQL5433/Redis6379 listeners, and the earlier backend application exited while its file watcher remained waiting. Existing non-secret host/port settings matched the intended development services.

[Verified] Started Docker Desktop, ran docker compose -f docker-compose.dev.yml up -d --wait in the existing backend directory, and confirmed both normal development containers healthy. Restarted only the identified failed project watcher with Node22.23.4 / pnpm start:dev. GET http://localhost:5001/v1/health returned200 with status ok, postgres up and redis up; /docs returned200. The restored normal services and backend watcher were left running for use.

This was a stopped dependency/startup-order problem; no application behavior, dependency, migration or .env value changed. Existing volumes/accounts and unrelated work were preserved. README now explains starting Docker/services before the backend and restarting an exhausted startup attempt. No automated regression suite was rerun for this operational/docs-only recovery; live service health and Swagger were verified. M7 remains not started. This recovery update is local unless separately published.

## 19. M7 — Traffic and recorded Results

**2026-10-26 (Asia/Dhaka). Verdict: M7 COMPLETE for the approved scope. Phase2 remains IN PROGRESS; M8 and M9 remain required.** The user approved the reviewed scope before implementation. Sources: the Phase2 roadmap, prototype Sections15–16 and existing M1/M2 contracts/model, M3 saved-run protocol and M6 editing/history safeguards. Applicable web/AGENTS.md and installed Next client-boundary documentation were read. See [M7 operating guide](M7-TRAFFIC-RESULTS.md) and [durable verification evidence](audit/m7-verification.json).

### Requirements and observed evidence

| Requirement | Implementation and verification | Status |
| --- | --- | --- |
| Traffic presets/settings | Server catalog supplies all five presets; Custom, logarithmic rate slider/numeric input, burst, read share, shape, p95 target, error budget and duration. All presets and settings persisted/reloaded in four width/theme browser cases. Presets preserve budget/duration, matching the source | Verified |
| Region/history integration | All Clients update atomically; mixed/no-client cases handled. Input-only history, same-field grouping, Undo/Redo buttons/shortcuts and existing autosave reused. Unit tests cover multiple Clients, no Clients, preset action boundaries and undo branching | Verified |
| Input validation and save barrier | Zod mirrors the server traffic envelope. Invalid raw values block writes/Run; Escape restores last valid values. Tests exercise zero, nonfinite/out-of-range input, delayed saves/newer traffic,409 retention/reapply,429/no simulation and same-identity uncertain retries | Verified |
| Complete recorded results | Verdict reasons, p50/p95/p99, errors, throughput, bottleneck, sorted utilization/load/capacity/service/rejected metrics and inspectable mean service/wait/saturation. Real overload and replica changes alter backend metrics | Verified |
| Charts/paths/supporting analysis | SVG timeline and accessible data table use returned samples with distinct axes/target; returned common read/write paths, mean contributions, queues, background failures and cross-region effects are rendered conditionally. Unit checks cover empty/zero/constant/extreme series; browser runs cover zero/maximum load plus an actual overloaded saved pipeline with growing backlog, background drops and cross-region calls | Verified |
| Snapshot honesty | Targets, labels, graph/traffic, revision/fingerprint/engine/time come from the selected stored run. Semantic edits stale it; layout-only moves do not. Browser target300→600 confirms old target remains300 until a new run. Unit cases cover tiny nonzero errors, unbounded and utilization above100% | Verified |
| Understand verdict and improve | Deterministic reasons distinguish high utilization, latency proximity without bottleneck and target/budget failure. Results row selection exposes inspection; Edit [component] selects the current node. Existing repair/run loop retained | Verified |
| Session/failure recovery | Traffic session-modal login preserves draft/history; logout clears history. Real PostgreSQL/Redis health503 and actual API-process outage retain inputs/history; recovery200, Undo and a subsequent simulation pass. Selected-result503 has a controlled failure/recovery browser check | Verified |
| Responsive/source/accessibility | Prototype and final Traffic/Results screenshots inspected; source fonts/tokens/cards/semantic palette reused.1024/1440 light/dark browser cases assert no document overflow; normal M7 zero/results flows assert no page or console errors. Labelled controls, keyboard sliders/history, row buttons and readable chart tables exercised | Verified |
| Integration/docs/scope | Existing routes and API contracts reused; no new endpoint, migration, env value, engine formula or dependency. Builds/types/lint/tests/live API-type equality pass. This report, tracker, roadmap, architecture, README and test/operating guides updated. M8 preview/overlay/Limits not implemented | Verified |

Main implementation: WEB/src/lib/{traffic,result-presentation,editor-session}.ts; components/workspace/{traffic-tab,traffic-field,timeline-chart,run-results,workspace}.tsx; canvas/canvas-editor.tsx for selected-node links; styles/m7.css. Tests: tests/m7.test.cjs, browser/m7.spec.ts and opt-in verify-m7-services.cjs. Existing M6 navigation test now explicitly waits for the Results/Edit URLs before reload; original graph/auth assertions remain.

### Checks and exact results

Node22.23.4 and existing pinned pnpm/package versions. Commands ran against dedicated labelled containers PostgreSQL5550/Redis6397, sf_m7_audit/sf_m7_e2e, API5003/web3003 and a process-only auth limit300. Normal data/.env were preserved.

| Check | Observed result |
| --- | --- |
| API pnpm build / pnpm typecheck / pnpm lint:check | Exit0;0 errors,22 inherited lint warnings |
| API TEST_REDIS_COMPOSE=1 pnpm test --runInBand | Exit0;174/174,12 suites,100.22s; includes real disposable Redis authentication |
| API DB_TEST_DATABASE=sf_m7_e2e pnpm test:e2e | Exit0;44/44,2 suites,43.158s; actual PostgreSQL with existing Redis/throttler doubles |
| Fresh sf_m7_audit pnpm migration:run | Exit0; existing CreateUsers and CreateDesigns migrations; no new migration |
| WEB pnpm build / pnpm typecheck / pnpm lint | Exit0; separate .next-audit production build; strict types; frontend lint clean |
| WEB pnpm test | Exit0;101/101,32.991s;15 focused M7 cases added |
| WEB pnpm check:routes; live openapi-typescript /docs-json --check | Exit0;35 routes, generated mounted API types unchanged |
| Initial1440/light M7 pilot | Exit1;6 passed,2 failed; accessible dropdown naming and replicas test label corrected before matrix verification |
| First scoped Chrome M7 matrix | Exit0;32/32 across four width/theme combinations; subsequent tests added, not an extra unique-test total |
| Initial full Chrome browser command | Exit1;161 passed,3 failed,4 intentional dev skips,12.0min; failures/corrections below |
| Intermediate full Chrome rerun | Exit1;163 passed,1 M4 navigation/heading-locator failure,4 intentional dev skips,10.8min. Corrected case repeated8/8 across all four configurations before the final full rerun |
| Final corrected full Chrome pnpm exec playwright test | Exit0;168 passed,0 failed,4 intentional production dev skips,10.6min. Includes Foundation, M3–M6 and40 M7 cases |
| Earlier targeted maximum-traffic check | Exit0;4/4,17.2s.10-million-rps ×100 burst, keyboard read control, finite output/no horizontal overflow. These cases are also included in the final full run, not added twice |
| Added real pipeline-analysis browser case | Exit0;4/4,19.2s. Added after the final command discovered its tests, so reported separately. Actual overloaded worker, growing queue, background failures and cross-region calls at all four widths/themes |
| M7 unique Chrome coverage |44/44: ten journeys ×four in the final full command plus four separate pipeline-analysis cases. Earlier overlapping invocations are not added |
| Edge m7.spec.ts --project=1440-light | Exit0;10/10 core journeys,32.4s; separately added pipeline-analysis case1/1,7.2s.11 distinct M7 journeys total |
| Separate next dev; SF_DEV_STATES=1 Playwright --grep @dev | Initial3 passed/1 missed first shortcut,48.7s. After an observable form-handler readiness assertion, final Exit0;4/4,30.3s; all ten forced states per width/theme, separately covering production skips |
| SF_M7_REAL_OUTAGES=1 node tests/verify-m7-services.cjs (interactive) | Exit0; PostgreSQL503/Redis503, actual API unreachable screen, health200 recovery; traffic/history retained, Undo and new run verified |
| Final health / Swagger |200 /200 before cleanup |

Detailed logs are ignored locally. Sanitized aggregate and m7-* screenshots in docs/audit retain the evidence. Historical M3–M6 screenshots regenerated by regression runs were restored from HEAD, preserving earlier evidence.

### Corrections found during verification

1. **Accessible select names:** implicit wrapping labels included option text, making exact named selection unreliable. Added explicit accessible names; controls/presets and persistence pass across all four configurations. One initial test also used Replicas instead of the existing Replicas (1–200) label; corrected the test.
2. **Visual override:** inherited M3 grid styling overrode M7 metric-card columns. Increased the scoped selector specificity and tightened numeric-field proportions after comparing the actual prototype. The final width/theme checks use the corrected production build. This is a source-style port within the existing M6 shell, not a claim of pixel-identical final UI; numerical topology overlay remains M8.
3. **Navigation/reload synchronization:** full regression first failed two M6 blank-to-run cases because the summary could appear on Edit before asynchronous navigation reached Results; immediately clicking Edit/reloading could interrupt that transition. The test now waits for the Results URL and then the Edit URL before reload. M7's Run helper likewise waits for the accepted run URL. No application navigation/auth/security rule was relaxed.
4. **Failure-screen assertion:** a broad regex containing server selected a hidden SVG title for App servers. The corrected test targets the system heading, holds mocked dependency health503 during its assertion, then restores health/result responses and verifies recovery. Initial failures remain recorded above; the entire corrected suite was rerun.
5. **Dashboard-transition assertion:** the intermediate rerun encountered an existing M4 lost-creation-response test selecting both a template heading and the saved-card heading during navigation. It now waits for the Dashboard URL and targets the owned-design article, keeping the original no-duplicate/count-one assertions. Eight focused repeats passed before the final complete172-case invocation passed168 with only its four intentional dev skips.
6. **Developer-only shortcut readiness:** the first dev matrix passed3/4 but1440-dark missed its initial Ctrl+Shift+D menu. A cold hydration/effect timing race is inferred, not proven as a general application defect. The dev-only test now submits the empty login form and observes its client-validation result before using the window shortcut; all four projects then pass. Production test bodies are unchanged by this readiness step, and their four intentional skips remain separately covered.
7. **Test/tool setup:** an initial test-only prefer-const lint error was corrected; final lint passes. The first API-outage coordination attempt had no interactive input and could not finish its stop/restart step; a later warm-start health check was retried only after explicitly confirming health200. The final interactive execution verified the complete outage sequence. These earlier attempts are not counted as full successful outage runs.

### Decisions, limitations and remaining Phase2 work

- [Verified] Traffic's preview/outcome is explicitly the last recorded run. Editing does not compute in the browser or silently invoke live preview. Results timelines are independent illustrative model samples, not live measurements. No invented progress percentage or real-time duration wait was added.
- [Verified] Ordinary source slider/selection ranges are retained; the numeric fields preserve the existing API safety envelope and imported custom values rather than silently clamping them. Zero load is explicitly supported. Presets change the same fields as the prototype and preserve budget/duration.
- [Verified] Pending/failed/absent results render no fabricated completed metrics. Selected-run identity, account separation, save conflicts and uncertain acceptance remain covered by new and existing tests.
- [Verified] Phase1 and earlier milestone regression verdicts remain unchanged after the final complete browser rerun and backend tests. No new runtime dependency, lockfile change, endpoint, migration, environment setting or engine formula was introduced. The pre-existing modified audit/m2-profile-source.json remains untouched/excluded.
- [Untested] Firefox/WebKit, formal assistive-technology audit and long-duration soak/storage-growth testing. Existing backend advisories remain triaged in section14; no fresh dependency scan or clean-security-audit claim.
- [Verified] Memory-only drafts/history, no offline persistence/cross-tab merge, existing single-instance job limits and model assumptions remain. Normal Docker services/accounts were preserved. Only M7 audit processes/containers are stopped at cleanup; their data is retained for reproduction.
- [Verified] M8 must still implement Limits, debounced live preview and numerical load overlays; M9 must complete integration acceptance and final documentation/publication review. Real AI remains a later essential course requirement. M7 completion does not complete Phase2 or authorize M8.

**M7 verdict: COMPLETE for the approved Traffic/recorded Results scope, with no unresolved mandatory M7 functional failure observed in the completed gates.** Changes are committed locally on codex/phase2-contracts; no M7 GitHub push, main merge or production deployment occurred. Future completion work MUST update this same report, preserve earlier history, record new evidence and reassess affected earlier requirements; nothing updates automatically.

## 20. M8 — Limits, live preview and canvas load overlay

**2026-10-27 (Asia/Dhaka). Verdict: M8 COMPLETE for the approved scope. Phase 2 remains IN PROGRESS: M9 final acceptance is still required.** The user approved the [M8 scope](M8-LIMITS-PREVIEW-SCOPE.md), then approved Stage 2 with the recommended defaults:

- a superseded preview returns 409 PREVIEW_SUPERSEDED;
- a preview blocked by the owner's own pending durable job returns 429 DURABLE_PENDING;
- complexity returns 422 COMPLEXITY_LIMIT;
- timeout or failure returns 503 PREVIEW_TIMEOUT / PREVIEW_FAILED;
- plain 429 is kept for genuine capacity pressure;
- preview has its own 90/min throttle bucket;
- `?run=` selects a simulation and `?limits=` selects a Limits search.

Sources: the Phase 2 roadmap, the prototype's Limits/LiveBar/ResultsTab topology, the frozen M1 contracts, the M2 worker, the M3 durable-run protocol and the M6/M7 editor safeguards. web/AGENTS.md and the installed Next 16 documentation were read. See the [M8 operating guide](M8-LIVE-PREVIEW-LIMITS.md) and the [durable evidence](audit/m8-verification.json).

### Requirements and observed evidence

| Requirement | Implementation and verification | Status |
| --- | --- | --- |
| Limits API and durable lifecycle | Mounted POST /v1/designs/{id}/limits on the existing RunsService: 202 when new, 200 on replay, 409 for a reused key with a different kind or revision, one pending durable job per owner. The draft is flushed to a saved revision first. e2e covers auth/ownership, replay, every search state, invalid graph, stale revision, second pending job and deletion during a search. A real API kill right after acceptance was reconciled to INTERRUPTED at startup, with no automatic resubmission | [Verified] |
| Complete Limits tab | Breaking-point cards (bracket, cause, first component, headroom), ramp chart with separate latency/error axes, target lines, the current load and the searched bracket, an accessible data table, saturation order with Edit links, and revision/fingerprint/engine/time. Pending state has no progress percentage. Browser runs at four widths/themes: real search, reload, kind reroute and dashboard labels | [Verified] |
| Honest search states | found: bracket, with extra precision only where needed (the "152 – 152" case was fixed); headroom = failing ÷ current load, "not applicable" at zero load. failsAtMinimumLoad: minimum tested 1 rps, threshold below unknown, no headroom. notReachedWithinRange: "at least" lower bound, never "never" or ∞. Average and burst peak are separate. Unit tests cover every state; e2e returns each one over HTTP, including zero current load. Six-template numerical parity is unchanged and is still covered by the existing M2 engine fixtures | [Verified] |
| Separate identities | Simulation and Limits have separate selections, intents and pending flags. Links route by stored kind; a Limits id under `?run=` is redirected to `?limits=`. A lost Limits response retries the same Limits request (browser: one Limits run, zero simulations). Run test and Find limits disable each other while pending. Previews never write runs, dashboard counts or history (asserted in browser and e2e) | [Verified] |
| Debounced, cancelable live preview | POST /v1/simulation/preview runs on the existing worker; nothing is persisted. The client PreviewSession has a 750 ms debounce over semantic inputs only and one request per editor session. A newer request aborts the older one; a reply is accepted only for the same session, newest sequence and current inputs. It pauses for invalid input, gestures, conflicts and pending durable work; failures stay inline with explicit retry and no loop; logout, navigation and disable cancel; reauthentication renews the identity. Covered by unit tests and browser runs: debounce (≤2 requests for a 15-step slider burst), layout moves ignored, stale reply with abort, two tabs, logout, durable pause/retry, session modal | [Verified] |
| Scheduling and cancellation over HTTP | Durable work preempts a running preview and evicts queued ones; preview never preempts durable work. Supersession, owner-scoped sequences, a real client disconnect that releases the worker within 1 s, DURABLE_PENDING, a worker crash answered with 503 and then recovery, and the separate throttle bucket are all e2e-tested over real HTTP | [Verified] |
| Canvas overlay and shared traffic control | Load (L) button and shortcut (ignored while typing). The live bar's traffic control edits the same EditorSession draft as the Traffic tab. Status colours come with text and a legend; utilization above 100% stays numeric while the meter clamps; the bottleneck is tagged only when strained; edge width shows modeled flow. Overlay only when the output matches the current inputs. Browser: overload shows numeric >100% and BOTTLENECK; adding, deleting and undoing components never borrows old metrics; a 50-node/200-edge graph got a 200 preview in about 0.93–0.98 s (debounce included) with frame gaps under 1 s | [Verified] |
| Traffic live panel | Opt-in "Live preview — unsaved inputs" panel, clearly separate from the recorded run's timeline (browser, four projects) | [Verified] |
| Recorded Results topology | Read-only "Topology under load" from the selected run's saved snapshot and metrics. Deleted components keep their recorded metrics with a note and no Edit link; the run is marked stale (browser) | [Verified] |
| Responsive/accessibility | No horizontal overflow at 1024/1440 light and dark in the M8 journeys. Labelled controls, aria text for modeled utilization and flow, keyboard sliders and an accessible ramp table. Reduced-motion CSS; no animation is required | [Verified]; formal AT audit [Untested] |
| Real outages | Opt-in verify-m8-services.cjs. PostgreSQL stopped: save 503, live preview kept answering, draft kept and saved after recovery. Redis stopped: the app's "Waking up the server." state, then the draft kept and saved. API killed right after a Limits search was accepted: INTERRUPTED shown, no resubmission, new search succeeded | [Verified] |

Main implementation:

- API: `common/decorators/preview-throttle.decorator.ts`, `app.module.ts` (named throttlers), `modules/simulation/preview.{controller,service}.ts`, executor DURABLE_PENDING reason, `designs.controller.ts` limits route, OpenAPI exclusions removed.
- Web: `lib/{preview-session,load-overlay,limits-presentation,run-links}.ts`, the kind-aware `editor-session.ts`, `components/workspace/{limits-tab,live-preview,recorded-topology,run-results,workspace}.tsx`, the canvas overlay in `graph-nodes`/`graph-canvas`/`canvas-editor` and `styles/m8.css`.

Tests:

- `test/m8.e2e-spec.ts` (15 tests);
- `web/tests/m8.test.cjs` (19 tests);
- `web/tests/browser/m8.spec.ts` (12 journeys × 4 projects);
- the opt-in `web/tests/verify-m8-services.cjs`.

### Existing test changed with user approval

`test/designs.e2e-spec.ts` (M3) asserted that `/v1/simulation/preview` and `/v1/designs/{id}/limits` were absent from the live OpenAPI document. This was correct before M8, but contradicted the approved M8 scope. I stopped and asked. The user approved this: "Replace the two toBeUndefined assertions with assertions that /v1/simulation/preview and /v1/designs/{id}/limits are present and marked implemented, keep the rest of the test, record it in the report". Only those two assertions changed; the rest of the test is unchanged.

### Checks and exact results

Node 22.23.4 and the existing pinned package versions. The isolated stack was:

- labelled containers stressforge-m8-postgres (5551) and stressforge-m8-redis (6398);
- databases sf_m8_audit and sf_m8_e2e;
- the compiled API on 5003 with a process-only auth limit of 300;
- web on 3003 (`.next-audit` production build, or `next dev` for @dev only).

Normal services (3000/5001, the dev Compose services) and their data were not touched. No .env values were read or printed.

| Check | Observed result |
| --- | --- |
| API pnpm build / typecheck / lint:check | Exit 0; 0 errors, 22 inherited warnings |
| API TEST_REDIS_COMPOSE=1 pnpm test --runInBand | Exit 0; 176/176, 12 suites, 62.5 s (174 before M8 + 2 contract tests) |
| API DB_TEST_DATABASE=sf_m8_e2e pnpm test:e2e | Exit 0; 59/59, 3 suites, 41.4 s (44 earlier + 15 M8) |
| API pnpm contract:phase2:check | Exit 0; regenerated OpenAPI/examples/types in sync |
| WEB pnpm typecheck / lint / production build | Exit 0 (all three) |
| WEB pnpm test | Exit 0; 120/120 (101 earlier + 19 M8) |
| WEB check:routes; live openapi-typescript /docs-json --check | Exit 0; 35 routes; generated API types equal the mounted API |
| Initial M8 browser pilot (1440-light) | Exit 1; 3 passed, 3 failed (see corrections 6–7). After fixes: 6/6, 34.7 s |
| Added durable-pending browser journey | First run Exit 1 (real defect, correction 8); after the fix 1/1 |
| M8 browser matrix, 11 journeys × 4 projects | Exit 0; 44/44 |
| Full Chrome regression (Foundation, M3–M8; @dev excluded) | Exit 0; 216 passed, 0 failed, 16.2 min |
| Overlay-editing journey (added after the full run started) | Exit 0; 4/4 |
| After the flow-label fix (correction 9), production rebuild: M5, M5-boundary, M6, M8 | Exit 0; 116/116, 7.8 min |
| After the flow-label fix: Foundation, M3, M3-deep, M4, M4-recovery, M7 | Exit 0; 104/104, 6.8 min (with the 116 above, all 220 Chrome production cases rerun after the final application change) |
| Edge: m8.spec.ts --project=1440-light | Exit 0; 12/12, 46.3 s |
| next dev with SF_DEV_STATES=1: --grep @dev | Exit 0; 4/4, 46.2 s; all ten demo states at each width/theme |
| SF_M8_REAL_OUTAGES=1 node tests/verify-m8-services.cjs | First five attempts Exit 1 (harness corrections 10–12); then three consecutive Exit 0 runs with revision logging |
| Mutation checks (each restored afterwards) | Each of these, when removed, made a test fail: the abort wiring, the separate preview throttle bucket, the DURABLE_PENDING reason, the reply-acceptance rule, the paused-state Retry and the flow-label layering |

Logs are kept locally and are not committed. The m8-* screenshots in docs/audit (Edit overlay, Limits, Results topology at 1440 light/dark) were inspected. Earlier milestone screenshots that the regression runs regenerate were restored from HEAD.

### Initial failures and corrections

1. **Normal previews returned 409 (application).** The disconnect handler checked `req.destroyed`, which Node sets once the request body has been read, so every preview looked aborted. It now aborts on the response `close` event when the response is unfinished, or when the socket or response is already destroyed. An e2e test fails if this wiring is removed.
2. **Disconnect test too weak (test).** It first passed even without the abort wiring. It now requires the worker to be released within 1 s. Mutation confirmed.
3. **Fault injection had no effect (test harness).** The persistent worker ignored injected faults. The e2e `inject()` helper retires the worker before injecting a fault; this is test-only.
4. **Existing M3 assertion (test, user-approved).** See above.
5. **Narrow bracket rounding (application).** A narrow found bracket displayed as "152 – 152". `bracketText` now adds precision until the bounds differ, with a unit test.
6. **M7 render fixture without flows (application hardening).** The existing M7 render test's summary has no `flows`, which crashed the new topology view. The overlay now treats a missing list as empty; the M7 test was not edited.
7. **Preview never sent in the browser (application).** React's development double-invoked effect cleanup permanently disposed the PreviewSession. Unmount now disables instead of disposing. The initial pilot also had a test-only strict-mode locator ambiguity (fixed with `.first()`).
8. **No Retry after a server-side durable-pending pause (application, found by a new browser test).** The DURABLE_PENDING reply set a paused, retryable state, but Retry rendered only for errors, so preview stayed paused until the next edit. Retry now renders for retryable paused or error states (commit c20f2d4).
9. **Flow labels hidden on short edges (application, found by screenshot review).** Edge flow labels were drawn under node bodies ("491/s mode…"). They now render in a layer above all nodes, showing only the rate; the connection's accessible name carries "modeled flow N/s". A unit assertion fails on the old markup (commit 231f9ba).
10. **Outage harness: design id read too early (harness).** The id was taken from the URL before navigation away from /new/template, giving GET /designs/template 422. The harness now waits for the editor URL.
11. **Outage harness: wrong Redis expectation (harness).** With Redis stopped, requests wait for the cache instead of failing with 503. As in M7, the observable signal is the app's unavailable state. On one PostgreSQL attempt the PATCH took about 32 s to fail because the stopped container held the connection attempt until its timeout (other attempts: 16–49 ms), so the wait is now 60 s.
12. **Outage harness: kill too late and restart unobservable (harness).** Two PowerShell lookups before the kill let the roughly 1 s Limits search finish first. The process identity is now verified before submission, and only `taskkill` runs at acceptance. One detached restart produced no output; the restart now logs to a temp file and retries the start once. The passing runs needed one retry attempt to catch a running search (attempt 1 had completed before the kill).
13. **Unreproduced 409 after Redis recovery (observation).** In one harness attempt, the first autosave after Redis recovered returned 409. The client kept the draft behind the existing conflict UI, so no data was lost. Three later instrumented runs showed clean revision sequences (1 → 2 → 3) with no conflict, and the cause was not established. The save path was not changed in M8. [Untested root cause]

### Decisions, limitations and remaining Phase 2 work

- [Verified] No new runtime dependency, migration, environment value, engine formula or persistent storage was added. Contracts changed only by adding the frozen preview error-details schema, with regenerated documents and types.
- [Verified] Preview is a model summary of possibly unsaved inputs. The Traffic timeline remains the recorded run's illustrative samples; no hidden extra simulation is run. Overlay and edge widths are modeled values, not observed traffic.
- [Verified] The single worker and single-instance job rules remain. Restart recovery marks jobs INTERRUPTED rather than resuming them.
- [Inferred] With Redis down, requests wait instead of failing quickly; with PostgreSQL stopped, a connection attempt can take up to about 30 s to fail. Both are existing backend timeout behaviour; drafts are retained in both cases.
- [Untested] Firefox/WebKit, a formal assistive-technology audit, long-duration soak and storage growth, and multi-instance deployment. Existing backend advisories remain as triaged in section 14.
- [Verified] The pre-existing modification to docs/audit/m2-profile-source.json was never staged, committed or reverted.
- M9 must still complete integration acceptance, prototype comparison, Phase 1 reassessment and final documentation and publication review. Real AI remains a later course requirement. M8 completion does not authorize M9.

**M8 verdict: COMPLETE for the approved Limits, live preview, overlay and topology scope. No mandatory M8 item is unverified, and no M8 functional failure remains unresolved in the completed gates.** Commits are local on codex/phase2-contracts: 77add0d, 3cfe703, 960599d, ddc745c, c20f2d4, 231f9ba, plus this documentation commit. No push, merge or deployment was made. Future milestones must update this same report and preserve its history.


## 21. M9 — Phase 2 integrated acceptance (2026-10-27)

**Authorization and boundaries.** The user approved M9 with “Start M9.” Planning baseline: `8449253`; application baseline: `88ec239`; branch: `codex/phase2-contracts`. M9 permits targeted fixes and verification. No pre-M9 test assertions were changed. No push, merge, deployment, or Phase 3 work was performed.

**Current verdict: COMPLETE for the approved local M9/Phase 2 scope, with the user-accepted historical benchmark-preservation exception.** All required functional gates pass: backend187 unit/59 integration, frontend120 unit, final Chrome232, scoped Edge14, dev states4 and the636-second soak. Final real outages/restart, live API types, fresh DB, retention, diff and cleanup checks pass. Application checkpoint:`bea8321`; verification-harness checkpoint:`fd631fd` (browser-readiness checkpoint:`ebdfb06`). The additional12-case screenshot-readiness run passed59.8s on the unchanged application; it is overlapping coverage, not12 extra unique cases. No implementation fixes remain from the demonstrated findings below.

**Accepted preservation exception — original measurement not recovered.** An audit command overwrote the pre-existing, uncommitted `docs/audit/m2-profile-source.json`. Its exact original bytes remain unrecovered. The user instructed leaving it unstaged and subsequently asked for an independent backup search. It remains unstaged; neither HEAD nor an approximate reconstruction has been substituted. On 2026-10-27 (Asia/Dhaka), the user explicitly authorized: “Accept exception and close M9.” This closes the preservation requirement by an accepted scope exception, not by restoring the original measurement. The file stays unstaged; no functional verification requirement was waived.

### Sources and requirement mapping

Sources: the original Phase 1 prompt, [Phase 2 plan](PHASE-2-PLAN.md), approved M4–M9 scopes, M1 contracts/fixtures, selected prototype Sections 3/6/10–16 and `:root`, inspected code, historical sections 9–20 and newly observed checks. **API/** means `nest-boilerplate/nest-boilerplate/`; **WEB/** means `web/`. Operating commands and safety identities are in the [M9 guide](M9-ACCEPTANCE.md).

The checklist maps implementation to current observed evidence. The full browser matrix covers the final application, with a later focused rerun for test-only screenshot readiness. Overlapping runs are not added into a fictitious unique total. A passing build alone does not establish completion.

| Requirement | Inspected implementation | Evidence and status |
| --- | --- | --- |
| Preserve stack, folders and free local runtime | Existing Nest/Next apps, pnpm pins, explicit migrations | **Verified:** same applications; no paid calls; no normal data/configuration changed. Only labelled M9 services were interrupted |
| Canonical graph/traffic/import contracts and strict validation | API/common/contracts/phase2, DTOs, exporter, wire adapters | **Verified:** contract check, examples, fixtures and backend unit/API checks; no formula or public DTO changes |
| Six templates and twelve component types | API simulation catalog/templates/builders | **Verified:** six full-precision source fixtures; M4/M5 browser coverage of templates/types |
| Owned CRUD, CAS revisions and deletion | API/modules/designs, users, migrations/entities | **Verified:** 59 integration tests include ownership, concurrent revisions, invalid drafts, idempotency and deletion |
| Four creation paths and honest scripted mode | Prepare/create services; WEB creation provider/screens | **Verified:** M4 browser/API/unit cases; invalid preparation creates nothing; scripted mock remains labelled |
| Draft validity versus runnable graph | Graph schemas, validate service, repair panel | **Verified:** cycles/invalid drafts save safely; errors block calculations, warnings do not; repair browser cases |
| Canvas add/select/move/configure, pan/zoom/fit/minimap | WEB/components/canvas and lib/canvas | **Verified:** M5/M9 at both widths/themes, all types and zoomed coordinates; no view-triggered request storm |
| Arrows, reverse/remove, duplicate/delete | SVG ports/edges and shared graph commands | **Verified:** M6 keyboard/click/drag/reversal/deletion cases and unit checks |
| Grouped undo/redo and serialized saves | EditorHistory, EditorSession, CAS API | **Verified:** delayed acknowledgements, undo during save, conflicts, reapply and two-tab cases |
| Dirty drafts, late replies and account boundaries | Providers above shared system screens; scoped sessions | **Verified:** web unit and Foundation/M3/M6/M7/M8/M9 browser cases; explicit logout/account switch clears local state |
| Traffic presets and every supported control | Traffic UI and canonical server catalog | **Verified:** M7 persistence/history/region/settings, invalid, zero and maximum-load cases |
| Durable Run/Limits and immutable inputs/results | RunsService, design_runs and worker admission | **Verified:** acceptance/polling/revision/kind/idempotency, restart and deletion tests; no computation inside long DB transactions |
| Correct simulation versus Limits selection | Separate `?run=`/`?limits=` and shared run-link helpers | **Verified:** M8/M9 workspace/reload/direct-result/dashboard cases; improvement returns to the selected simulation |
| Results metrics, plots, paths and stale snapshots | M7/M8 result components and wire schemas | **Verified:** snapshot-bound inputs/labels/topology/targets and illustrative timeline; model estimates remain explicit |
| Honest Limits brackets, minimum/cap/headroom | Limits engine, wire adapter and renderer | **Verified:** lower-bound/cap/finite-unbounded cases; browser reload and kind-aware selection; full headline values wrap |
| Latest-only transient preview | Preview controller/service, executor, PreviewSession | **Verified:** abort/supersession/independent sessions, saved-job priority and retries; soak proves no preview history rows |
| Load overlay and recorded topology | Canvas overlay and selected-run snapshot renderer | **Verified:** M8/M9 stale/new/deleted component metrics, undo and legend/minimap clearance |
| Bounded worker, queue, cancellation and TTL | SimulationExecutor, worker factory, pure engine budgets | **Verified:** worker unit/API cases; source/compiled profiles each 15 completions and one expected complexity rejection; final bookkeeping clears on admission |
| Real service/restart/finalization recovery | RunsService reconciliation/cancellation and dependency handling | **Verified:** actual Redis/Postgres stops/pauses, blocked write cancellation, preserved drafts and API restart; no automatic Limits resubmission |
| Retention and request-key protection | RunsService.prune | **Verified:** disposable aged fixtures: 61 terminal rows become 50; 11 eligible rows removed; recent and pending rows protected |
| Prototype fonts/tokens and practical fidelity | next/font, proto.css, canvas/Traffic/Results/Limits UI | **Verified:** 97 light/dark token occurrences match; three fonts; source/reference and current screenshots inspected. Functional save/validation/progress controls differ from the scripted prototype; no pixel-identity claim |
| Keyboard, focus, labels, reduced motion and overflow | Existing shell/dialog/canvas controls and CSS | **Verified:** practical Foundation/M5–M9 assertions and screenshot review at 1024/1440, light/dark. Formal screen-reader/contrast certification is untested |
| Foundation auth/JWT/roles/current-user/public | AuthService, guards, TokenStore | **Verified:** unit/API tests and live register/login/me/refresh/logout/revocation/401 walkthrough; hashes never returned; wrong-credential messages match |
| Fail closed without false session expiry | Separate Redis clients, refresh ordering, availability filter | **Verified:** real outages return 503; same refresh cookie recovers after failed DB lookup; true replay still revokes its family |
| CORS, validation/errors, health/docs and safe logs | app.setup, exception filter, request logger, config | **Verified:** credentialed OPTIONS204, health/docs200, error-envelope tests and live schema equality; no normal .env values inspected or recorded |
| Fresh setup, seed, Node22 and lockfiles | Migration glob, seeder, env schemas, audit runner | **Verified:** fresh isolated DB has both migrations; seed twice leaves one demo user; demo login200; Node22/pnpm pins and unchanged frozen lockfiles. No clean node_modules reinstall claim |
| Production dependency reassessment | Narrow pnpm overrides and committed backend lockfile | **Verified:** initial 2 high/1 moderate advisories become 0 backend and 0 web production advisories; no framework upgrade or new runtime dependency |
| Future features remain honest placeholders | Typed registry and existing placeholder screens | **Verified:** 35 mapped routes, titles/breadcrumbs and navigation; no real AI, History/Compare/Report or Phase 3 feature added |
| Living docs and local reviewable commits | This report, README/architecture/model/contracts/test guides | **Verified:** current report/guides, sanitized JSON/screenshots, reviewed local code commits and completed cleanup; no automatic updates or publication |
| Preserve unrelated work | Initially dirty M2 source measurement | **Partial — accepted exception:** overwritten and not recovered; user explicitly accepted closure on2026-10-27; file remains unstaged |

### Findings, impact, reproduction and fixes

1. **High — a lock-blocked save could commit after the client abandoned it (fixed).** Hold an exclusive lock on `designs`, PATCH revision1, abort after5.5s, then unlock: baseline commits revision2 and a retry conflicts. API/src/config/database.config.ts:97 now sets acquisition1s, server statement2s, client query2.2s and idle transaction5s. The same final experiment returns503 in2010ms, remains revision1 and retries200. Server cancellation prevents the late write. [Baseline](audit/m9-lock-baseline.json), [final proof](audit/m9-lock-fixed.json). This proves a mechanism, not the original M8 Redis incident's cause.
2. **High — dependency waits exceeded the local failure target (fixed).** Redis-down PATCH initially took10203ms. The throttler owns a separate ioredis client, so node-redis settings did not constrain it. `API/src/providers/cache/redis/reliable-throttler-storage.ts` disables offline queue/resend and bounds connect/commands; `redis-cache.service.ts` bounds queue/socket inactivity. Pausing sockets also exposed a5033ms transaction/rollback path; the2.2s PG client bound brings final paused PATCH to4410ms. Final paused Redis write1012ms, refresh1007ms; all measured failures are503UNAVAILABLE below5s. [Recovery](audit/m9-recovery-fixed.json), [paused sockets](audit/m9-inflight.json). Socket inactivity is not an absolute command deadline if replies keep arriving.
3. **High — a failed DB lookup spent the refresh token (fixed).** Fail `UsersService.findById` once, then retry the same cookie: baseline treated it as replay and revoked the family. API/src/modules/auth/auth.service.ts:79 now looks up the user before atomic consumption. New regression fails before/passes after; a real DB outage returns503 then the same cookie200. Real replay still revokes family/descendant. Loss of a successful refresh response can still require login; no replay bypass was added.
4. **High/moderate — transitive production advisories (patched).** Narrow overrides replace multer2.4.0→2.5.0, Bull's uuid8.3.2→11.1.1 and seeder faker8.4.1→10.5.0. Build/tests, repeated seed and demo login pass; production audits now report0/0. Primary advisories: [multer](https://github.com/advisories/GHSA-q7qp-rjg7-q26m), [UUID](https://github.com/advisories/GHSA-w5hq-g745-h8pq), [Faker](https://github.com/advisories/GHSA-qxc2-j82w-r537). Zero reported advisories is not proof of zero vulnerabilities; Bull job-load testing is outside this phase's used runtime path.
5. **Medium — rejected revisions could poison a concurrent request key (fixed).** Concurrent valid revision1/invalid revision2 submissions using one new key could both return409. API/src/modules/designs/runs.service.ts:71 now validates a new revision before claiming its provisional key; retained idempotency still takes precedence after edits. The deterministic new regression failed before and passes after; existing integration tests remain unchanged.
6. **Medium — source worker startup approached the preview deadline (fixed with bounded evidence).** Earlier source/Jest recovery runs intermittently returned503; exact worker errors for every HTTP failure were not captured. Cold startup contributing is an inference. The first ts-node/SWC attempt still timed out at2016ms. The final worker-only `register-source.cjs` uses existing SWC and actual aliases without TypeScript compiler initialization; compiled production still loads emitted JS. Four final cold source previews took587/307/328/262ms. Deadlines/resources/formulas stayed unchanged; final187 unit/59 API tests pass. [Attempts and final evidence](audit/m9-cold-workers-fixed.json).
7. **Medium — Redis connection failures became500 (fixed).** A previous final soak stopped after tick120/375s when both previews returned500 alongside a Redis reconnect; its exact exception class was not recorded. Separately, killing only an audit helper's blocked Redis connection proves `SocketClosedUnexpectedlyError.name === "Error"` and baseline filter500. Four new class regressions failed before actual constructor matching in `API/src/common/filters/all-exceptions.filter.ts`; installed offline/closed/connect/socket classes now return503. Real socket-disconnect proof passes. Unexpected Lua/programming errors stay visible. [Failed soak](audit/m9-soak-failure.json), [controlled proof](audit/m9-socket-fixed.json). The historical soak's exact cause remains an inference.
8. **Medium — laptop palette and readouts hid information (fixed).** Below1200px, a62px palette hid names/categories; a legend overlapped the minimap; Limits ellipsized bounds/reasons. `WEB/src/styles/m5.css`, `m8.css`, palette and Limits components now provide168px labelled rows, a scroll cue, minimap clearance and wrapped values. New regressions failed on the old layouts and pass in Chrome/Edge; screenshots were inspected. No graph/model behavior changed.
9. **Low — preview outage copy promised successful saving (fixed in final source).** A real Redis outage produced save503 while the generic preview message said saving “still works.” `WEB/src/lib/preview-session.ts` now says users can keep editing and retry. Final Chrome and real Redis-outage UI checks confirm the corrected message; no pre-M9 test was changed and no implementation-mirroring copy test was added.

**Original M8 post-Redis409 observation: cause unproven.** A bounded campaign with complete outage and client aborts at1/4/7s preserved revision1 and retry200. The separate DB-lock experiment above does not establish its cause. Actual lost-save acknowledgement intentionally yields a legitimate409 while retaining the local draft until explicit inspection/reload/reapply. Current CAS, tab/save/recovery tests pass; no silent merge or unsafe retry exemption was introduced. Treat the old observation as unreproduced, not “fixed.”

**Preservation failure and recovery search.** Original M2 SHA256: `E11763AE32086355FF6EB9EE02E2023CD80A4A6D147F5D6C6AE79F3748EFE3FA`; overwritten current SHA256: `D0EDB982C694CF1983FFE36FAAC2F7C80ED77AC1A735852F03013E6C4A2F76DC`. Searches covered project/course folders, Documents/Downloads/OneDrive/Temp, VS Code/Cursor history and unsaved backups, Git history/unreachable blobs, relevant prior tool outputs, downloaded nest-boilerplate.zip, and Claude file-history metadata (no mapped version). No exact copy was found. [Search evidence](audit/m9-preservation-search.json). The optional `SF_PROFILE_OUTPUT` basename and updated commands avoid historical filenames in future audits when used as documented. This safeguard does not recover the lost measurement. The file remains unstaged under the user's instruction.

### Checks and final gates

Commands were run with Node22.23.4, backend pnpm10.34.7 and web pnpm12.14.0. API commands use the nested backend directory; web commands use `web`; audit runner commands use the root. `.env` values were not read/copied/printed. M9 used only Postgres5552/Redis6399/API5003/web3003; dev states used3004. Docker Desktop startup also resumed normal containers automatically; their data/configuration were not modified or used for tests.

| Gate | Observed result |
| --- | --- |
| API `pnpm build`, `pnpm typecheck`, `pnpm lint:check` | exit0; lint0errors/22 inherited warnings |
| `./docs/audit/m9-run.ps1 unit` | exit0;187/187,15suites,64.235s; includes opt-in real Redis authentication coverage |
| `./docs/audit/m9-run.ps1 e2e` | exit0;59/59,3suites,62.273s; isolated DB |
| `pnpm contract:phase2:check`, `pnpm fixtures:phase2` | exit0; canonical OpenAPI/examples match; six complete fixtures plus minimum-load counterexample match |
| Source/compiled profiler with distinct `SF_PROFILE_OUTPUT` names | exit0;16cases each,15completed/1expected complexity rejection; heartbeat observations are local, not SLAs |
| Web `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm check:routes` | exit0 on final wording;35 routes all have page files |
| Web `pnpm test` | exit0;120/120,30937.3597ms on final wording |
| Live `openapi-typescript` against API5003 `/docs-json` | exit0; byte-identical tracked schema; SHA256 `3FCD702C6F760361082F59AE74256CA61FD289738E0A1EA81464DAACB8926816` |
| Final Chrome production matrix | exit0;232passed,13.9m across1024/1440 light/dark on final application; see m9-chrome-final-source.log |
| Final Edge scoped acceptance | exit0;12M9 cases across4projects (55.1s), plus2Foundation cases at1024-dark (20.3s);14 scoped channel cases, not a full Edge matrix |
| Separate dev-state matrix | exit0;4cases, ten forced states each at1024/1440 light/dark; forced-state implementation is unaffected by final preview copy |
| Fresh isolated database/setup | both migrations; seed twice; one demo user; synchronize:false; live seeded login200 |
| Frozen lockfile validation | both pinned managers succeed; lock hashes unchanged; lockfile-only/ignore-scripts validation, not clean dependency reinstall |
| Production audits |0 backend/0 web production advisories after scoped patches |
| Actual dependency stops/pauses, lock cancellation and restart | final backend checks exit0; measured failures503 within4.41s, no late revision; same refresh cookie recovers; interrupted Limits requires explicit retry |
| Browser API-unreachable and preview-outage wording | exit0 on final copy; actual API stop shows waking screen and restores saved Limits; Redis-outage preview now promises only editing/retry |
| Bounded soak | exit0;636s,2actors,396workload previews (+1TTL/admission probe)/100saves/40completed durable jobs; zero request errors/pressure and no preview history rows |
| Retention | exit0;61terminal→50,11eligible aged rows pruned, recent/pending protected |
| Helper syntax and token checks |14JS helpers and PowerShell parse pass;97light/dark token occurrences match |
| Diff/preservation/cleanup/local commits | verified:39 historical artifacts restored,48 settled Chrome screenshots,30 temporary Lab task staging files removed; identified M9 services stopped with volumes retained; normal containers healthy; M2 source unstaged; no push |

[Machine-readable verification packet](audit/m9-verification.json), [final screenshots manifest](audit/m9-chrome-screenshots.json), [cleanup evidence](audit/m9-cleanup.json). Local code commits are listed in the packet; published heads were rechecked read-only and remain main9e8bb00 / codex44a7f23.

Inherited lint warnings are classified, not hidden:10loose-equality and10unused-binding warnings in the unchanged legacy requestParser.ts/QueryParserPipe.ts;2intentional empty lifecycle methods in test/fake-redis.ts. No lint rule was weakened for these. The isolated generated dev-build directory is excluded just like other generated builds.

The final soak has317 two-second samples, preview entries≤2, and after lazy TTL expiry the next admission leaves one non-expired entry and zero capacity held. Sampling missed short-lived active/queued work (sampled maxima0); it does not prove no work ran. API RSS start/peak134131712bytes, end87687168bytes. This is a bounded local observation, not a leak-free, peak-worker-memory, long-duration or distributed-load guarantee. The earlier passing634s attempt is retained separately in `m9-soak-first-fix.json`.

### Initial failures and verification corrections

- Unit baseline176pass/5fail: two pre-existing tests resolve public fixtures from cwd. The isolated runner mirrors only those public files; tests unchanged. Intermediate181 then183 passes, final187 after focused regressions.
- Initial API57pass/2fail: tests expect CORS3000 but audit runner supplied3003. Only runner configuration changed. Some later source-worker attempts overlapped heavy work; one overlapped outages and is invalid isolated evidence. Those failures are retained; startup contribution is labelled inference above.
- First frontend build used developmentNODE_ENV and failed prerender with nulluseContext. Runner now explicitly builds/starts in production; final build passes.
- New walkthrough assumed logout JSON/200; the actual contract is empty204. Corrected only the new helper.
- First browser attempt stopped after27passes for a visible legend defect. A stronger new minimap-clearance assertion failed before the final layout correction.
- Second attempt stopped after148cases (147pass/1fail). Foundation1024-dark timed out on an Evaluation runner palette option becoming actionable. Cause unproven; existing test unchanged. Subsequent full pre-wording Chrome and Edge1024-dark checks passed that case. Do not count an interrupted attempt as a final gate.
- A complete pre-wording Chrome232 and scoped Edge14 passed. Actual outage review then found the misleading generic save promise; final frontend gates were repeated after that copy correction instead of reusing a stale final-build claim.
- Separate dev output initially made ESLint scan generated chunks:547errors/5800warnings. Only `.next-audit-dev/**` was added to existing generated-build ignores; source rules remain intact and lint passes.
- New audit runner originally left its caller in the temporary cwd, breaking a later relative command/log path. It now restores location in finally; explicit isolated e2e rerun passes.
- New restart helper initially failed to observe detached PowerShell startup, then retained an occupied-port failed process. Direct Node startup with explicit disposable configuration and checked identity is now observable; failed boot closes/exits, and controlled cleanup leaves one API process. These were harness repairs, not evidence of multi-instance support.
- Some early setup screenshots captured session restoration rather than the loaded template gallery. New M9 tests now wait for authoritative user/count/catalog content and set the Traffic scroll position before capturing. Types/lint and12 focused Chrome cases pass (59.8s); application source is unchanged and these cases are not added to the232 total.
- Legacy profiler overwrote unrelated M2 evidence. This was an open preservation incident until explicit user acceptance on2026-10-27; leaving it unstaged is not a restoration.

### Boundaries, remaining work and continuity

[Untested/out of scope] Managed Firefox/WebKit engines are unavailable; Chrome and Edge share Chromium. Formal assistive-technology certification, real infrastructure calibration, long-duration storage/load growth, production hosting and distributed/multi-instance execution are not certified. Memory-only unsaved drafts cannot survive closing/reloading a tab during failed persistence. Real AI remains essential later course work; labelled scripted mocks do not satisfy that final course requirement.

**Closure accepted on2026-10-27:** the user said “Accept exception and close M9.” All required application implementation, functional checks, documentation and cleanup are complete. No M9 work remains within the approved local scope. The historical benchmark loss remains documented as an accepted exception, and that file remains unstaged. Publication and Phase3 are separate and have not been started.

Future phase-completion work must update this same report, preserve earlier phase history, record fresh verification evidence and reassess affected earlier requirements. Updates do not happen automatically.

### Publication after closure (2026-10-27)

The user subsequently authorized the GitHub push. M7–M9 and the closure report were published by a fast-forward push to codex/phase2-contracts through7bdc41d; this documentation update follows that checkpoint. Earlier no-push statements above are historical. No main merge, deployment or Phase3 work occurred. The accepted benchmark exception and unstaged-file instruction remain unchanged.

## 22. Planning update: four account roles (2026-10-28)

[User-approved direction] Future project planning now includes User, Instructor, Reviewer and Admin. Guest remains an unauthenticated access state. The [overall project plan](PROJECT-PLAN.md) defines their proposed responsibilities, a recommended delivery sequence and permission-test requirements.

[Not implemented by this update] Instructor/Reviewer roles, sharing grants, feedback, challenges and administration tools are future scope. Faculty may need both Instructor and Reviewer capabilities; multi-role storage and hierarchy remain technical decisions for scoping. Existing private designs must not become accessible solely because an account receives either role.

This is a documentation-only change. It does not reopen completed Phase 1/2 requirements, start Phase 3 or establish new verification evidence for application behavior. Future milestone work must update this same report and reassess affected auth/ownership requirements. No automatic updates are promised.

## 23. Public landing experience (2026-10-28)

[Implemented and verified locally] `/` now presents a public architecture-lab story before account entry. The user's supplied Vite/Inspo reference informed midnight surfaces, restrained violet accents, generous spacing, geometric hierarchy and a technical specimen composition. Existing Archivo/Instrument Sans/JetBrains Mono fonts and Next conventions are reused; no runtime dependencies added. [Design reference](../DESIGN.md), [implementation guide](LANDING-PAGE.md), [verification evidence](audit/landing/evidence.json).

The custom SVG architecture opens into clients/routing/compute/data layers, holds for inspection and reassembles with reversible scroll-position transforms. Text remains readable, header login stays reachable and account creation uses the existing register route. Mobile has a readable component key. Reduced motion uses a shorter nonsticky narrative/static exploded specimen. Server-rendered content and links work without JavaScript. The illustration is explicitly not a live simulation; real AI remains planned and current scripted interactions are identified honestly.

Verification: final isolated production build, TypeScript and full frontend lint pass. Existing frontend unit tests passed120/120 during implementation; all35 registry patterns retain page files. Final production Chrome landing checks16/16 (19.6s), Edge1440-dark subset4/4 (4.3s), including320/390/768 phone/tablet widths within tests,1024/1440 light/dark projects, reverse/fast scroll state, reduced motion, JavaScript-disabled output, auth links/forms and protected return-to. Four-size screenshot capture1440x1000/1024x900/390x844/320x700 found no horizontal overflow or console/page errors. Nine final screenshots are isolated in docs/audit/landing. Edge is not an independent engine.

An initial browser run found that the existing search-parameter auth boundary hid public content without JavaScript. Public `/` now bypasses that boundary; protected routes retain it. Real session/network failures also no longer replace the public introduction, while dev-forced states remain available. The failing fallback cases passed after correction. Screenshot review led to readable phone labels and removal of an overlapping decorative label.

[Limits] No real login/register was submitted, backend tests/full authenticated editor matrix were not rerun, and no screen-reader certification, physical-device, Firefox/WebKit or formal animation-performance claim is made. Backend/auth service, simulator, package/lock files and private data are unchanged. Existing four-role planning edits are preserved; no Instructor/Reviewer implementation or real-AI phase was started. The protected M2 historical measurement retains its prior hash and remains unstaged. Changes are local, not committed/pushed.

Future phase-completion work must update this same report, preserve earlier history, record fresh evidence and reassess affected public entry/auth requirements; updates do not happen automatically.

### Landing lighting and motion refinement (2026-10-28)

User-requested follow-up adds scoped violet specimen atmosphere, button hover/focus lighting, staggered hero entrance, a gentle specimen settling movement and brief traffic pulses along the illustrated connections. Automatic motion is finite (longest4.8s) and disabled under prefers-reduced-motion; scroll-driven layer separation remains reversible. No new dependency or backend change. Production Chrome landing matrix16/16 passes (29.0s); direct browser inspection confirms reduced-motion SVG/heading animations are none and phone layout has no overflow. Additional screenshots and [effect observations](audit/landing/effects.json) are saved separately from the earlier baseline captures. The production preview remains on3011; no commit or push performed.

## 24. Phase 3 planning and local Ollama inspection (2026-10-28)

[Verified read-only] Ollama CLI and local API version0.40.12 are reachable. Installed qwen2.5:1.5b (986MB,65ec06548149) and llama3.2:3b (2.0GB,a80c4f17acd5); no loaded model. RTX2050 reports4096MiB total/2944MiB free, driver596.21. Windows reports7.73GB usable RAM/0.78GB free and217.5GB free on C: at inspection. These are transient observations, not inference benchmarks. No model was loaded/downloaded and no prompt was generated.

[Proposed] [Phase3 plan](PHASE-3-PLAN.md) defines M10–M17: feasibility, local provider/contracts/version foundation, grounded explanations, approved improvement/rerun, reviewed drafting, Designs/History/Notes/Compare, report/read-only sharing, and integrated acceptance. Existing route/catalog Phase3 commitments are retained rather than silently reducing the phase to AI. The earlier recommendation to download qwen3:1.7b is replaced by benchmarking already installed models first. GPU placement, memory fit, speed and domain quality remain unverified until M10.

User/Instructor/Reviewer/Admin remain the approved project direction; Instructor/Reviewer and full administrative workflows remain a separate later implementation track. Shared access must remain explicit. The plan records print-to-PDF and validated nonstreaming-first responses as proposed simplifications, with no application behavior changed. Phase3 and M10 are awaiting approval; planning does not count as implementation or completion. Future milestone work must update this same report, preserve history and reassess affected earlier requirements.

## 25. M10 approved model feasibility evaluation (2026-10-28)

[Completed experiment; integration gate NO-GO] User explicitly approved M10. Both installed models were tested sequentially with synthetic inputs,2048 context,256 explanation-output tokens/512 draft tokens, temperature0/seed42 and65s request cutoff. No model downloads, application behavior changes, account/design writes or global Ollama configuration changes. [Full verdict](M10-LOCAL-AI-FEASIBILITY.md); [new isolated evidence folder](audit/phase3/m10-2026-10-28/README.md).

Qwen first cold request timed out65.019s. Repeat cold30.970s, warm3.370–4.135s;1/8 complete schema-valid explanations,7 truncated,0/8 complete expected-field matches. Llama first cold43.446s, warm2.300–2.963s;8/8 schema-valid but0/8 complete expected-field matches, including false stale-revision claims and string-null bottlenecks. Both tiny draft probes passed existing backend schema/graph validation/topology but changed exact requested labels; this is not general draft-quality certification. Reported GPU-resident allocations were approximately1057MiB Qwen/2216MiB Llama at2048 context.

The Llama repeat failed with explicit insufficient-system-resources HTTP500; unload also initially failed. Observed free virtual memory418MiB and physical371MiB. Further inference stopped; explicit stop of only the benchmark model succeeded, Ollama ps empty, memory recovered. The prepared server-grounded prompt diagnostic was not executed. Physical-only monitoring did not prevent commit-memory pressure and needs revision before a rerun.

Initial API probes had26 connection failures/34 while frontend stayed34/34 healthy; API PID changed externally, cause unknown. Repeat probes19/19 HTTP200 for each endpoint (API max50ms, frontend max22ms). Do not attribute the first interruption to AI without evidence or treat health probes as full authenticated-workflow testing. Final API/PG/Redis and web health pass; benchmark models unloaded. Historical protected M2 file retains its pre-M10 hash and unstaged state. Existing unrelated film/ and landing/planning work preserved.

No model/budget approved for integration, and M11 has not started. Recommended next step is an M10 follow-up with sustainable physical/commit headroom, safer preflight/monitoring and server-grounded short explanations; forced fields cannot count as model reasoning. No claim that local AI is impossible or that a hardware purchase is required. Preserve these failures when updating this same living report with subsequent evidence.

## 26. M11 approved backend foundation (2026-10-28)

[Implemented and verified locally] User explicitly said to proceed with M11 after M10's no-go. This delivers the opt-in backend/provider/version foundation; it does not pass M10 retroactively or implement M12's real-AI UI. [M11 guide](M11-AI-FOUNDATION.md) records contracts, commands, lifecycle/retention choices and limitations.

Added canonical Zod/OpenAPI and live-generated frontend types; fixed-loopback native-fetch Ollama adapter; authenticated owned jobs/readiness; bounded context/output/deadline; physical and host commit/virtual preflight plus runtime guard; global single-inference admission, durable idempotency, cancel/restart interruption, immutable provenance and bounded retention. AI defaultsfalse and core health/save/simulation work independently. Cancellation is not treated as proof of GPU shutdown: capacity stays occupied until upstream promise settlement and idle observation. Accepted202 jobs survive browser disconnect/lost acknowledgement and require explicit cancellation—an intentional clarification of the initial plan wording.

Design create/edit transactions now append immutable versions. Migration backfills only each current revision as baseline, never fictional history. Retain100 newest/design plus AI-pinned versions; retain AI artifacts at least24h with500-row admission cap. Jobs copy bounded numerical evidence rather than pinning Phase2 run rows. No restore/history/Compare interface, automated graph edits, arbitrary prompts/tools or extra user-role workflows added.

Verification: backend build/types/lint pass (22 inherited warnings,0 errors);201 unit tests pass and2 existing opt-in Redis-compose cases skip. Full e2e76/76 pass in85.675s, including17 M11 cases with isolated Postgres and actual mock HTTP transport. Covers migrations/backfill/rollback, snapshots, conflicts/ownership, replay, provider faults, context/response bounds, digest changes, cancellation while upstream still reports loaded, deadline/runtime memory pressure, pinned retention/deletion, duplicate instance lease, expiry and interruption recovery. A final admission review added explicit429 for retained pending work instead of exposing its uniqueness constraint; the full suite passed afterward. Initial test-only Postgres union narrowing and reused Response fixtures were corrected before acceptance.

Frontend production build/typecheck/lint pass after regenerating primary types from the actual development /docs-json and separate canonical Phase3 types. UI unchanged in M11; browser/editor suites were not repeated. Existing Foundation/Phase2 backend flows are in the full e2e suite. Canonical contract check passes; no new dependencies or dependency-lockfile changes.

Development migration AiFoundation1793200000000 applied:5 designs before/after, identical aggregate design-state hash,5 current-version baselines,0 AI jobs. Existing .env untouched. New audit evidence lives in docs/audit/phase3/m11-2026-10-28; normal service/data resets were not performed. Historical M2 artifact and unrelated landing/film work preserved.

[Limits/next] No real inference or GPU cancellation benchmark was run, model prose is not semantically certified, actual hardware performance and M10 memory/quality follow-up remain open. AI is disabled by default. The infrastructure is a local single-active-API design, not distributed production certification. M12–M17 remain unapproved/unstarted. No commit/push/deployment performed. Future work must update this same report, preserve prior evidence and reassess affected auth/ownership/save requirements.

A final readiness review added single-flight, one-second-cached host memory telemetry so concurrent polling cannot spawn one Windows process per request. Twenty concurrent callers share a single probe; failed telemetry is not cached as success. Two focused regressions pass, bringing the backend unit total to201 passed/2 existing skipped. The final Nest build uses separate temporary output to avoid disturbing the development watcher's dist files. A live type-generation attempt during watcher restart was refused; generation succeeded once the existing watcher recovered. No duplicate backend was launched.

## 27. M12 scope proposal (2026-10-28)

[Planning only] [M12 explanation scope](M12-EXPLANATION-SCOPE.md) defines saved-result context, verified-facts/AI-interpretation separation, versioned grounding, idempotent job recovery, inline optional-AI failures, stale-result protection and tests. M12A is functional integration with controlled responses and AI disabled; M12B requires real-model quality/memory acceptance after the still-open M10 follow-up. Neither stage is implemented or approved by this planning request. M12 cannot be called complete using mock results alone.

The existing API client's network-error path still opens a global unreachable state even when silent is set. Scoped AI error handling is a required, regression-tested M12 change, not claimed present behavior. New generation initially preserves M11's current saved-revision rule; older artifacts remain historical and unsaved drafts remain untouched. The four-role direction remains unchanged; no role-management scope is added. Future work must update this same report with actual verification evidence.

## M12A implementation checkpoint — 2026-10-29

M12A approved; implementation and verification are in progress. Existing explanation UI, session controller and local API error scope were inspected. This checkpoint does not certify M12A completion or real-model quality.

Verified this session: frontend typecheck and lint passed; all 145 frontend tests passed. Added regression coverage and fixes for rejecting wrong-revision jobs, rejecting evidence with a mismatched fingerprint, preventing generation during provider cleanup, and resuming cleanup checks when reopening the panel. Reopening a completed job also retries evidence loading if it was interrupted by closing the panel.

Remaining acceptance work: versioned typed-claim grounding (existing numeric prose filter is insufficient), account/context and reload recovery review, full backend gates, production build, authenticated browser integration and responsive/accessibility/failure-path checks. Real inference remains outside M12A; M12B is not certified. No publication performed in this session. Preserve earlier evidence and reassess these requirements when completing this same report.

### M12A continuation — 2026-10-29

Fixed immediate account-switch invalidation in the explanation store and removed retained session listeners during test reset. Added a regression proving a different authenticated account clears both the explanation context and published view.

Observed checks: 19 focused explanation tests passed; frontend TypeScript and ESLint passed; backend unit suite 206 passed / 2 existing optional tests skipped; backend e2e 79 passed across four suites against isolated stressforge-m11-postgres on port5553. Docker Desktop was started for these checks. No real inference was requested. Build and browser acceptance are not certified by these test results. Typed-claim grounding and the previously listed recovery/browser acceptance work remain open, so M12A is still in progress.
Production frontend build subsequently passed using STRESSFORGE_AUDIT_BUILD=1. The isolated Postgres container was stopped after verification; its volume was retained. Browser acceptance remains unverified.

### M12A grounding / M12B preflight — 2026-10-29

User authorized finishing M12A and then starting M12B. Added typed claim predicates for latency/target, error/budget and bottleneck presence, with rejection of unknown claims and equality-boundary tests. Focused grounding suite: 7/7 passed. The initial relative test path did not resolve from the isolated runner; rerunning with the absolute test path passed. These helpers are not yet wired into the provider contract or rendered interpretation, and do not certify M12A completion.

Read-only memory preflight observed 813 MiB free physical RAM and 12122 MiB free commit/virtual memory. Physical RAM was below the configured 1536 MiB admission minimum. No Llama inference was started, no settings were relaxed, and no user processes were stopped. M12B evaluation remains pending M12A completion and sufficient measured headroom. Outstanding work remains provider/schema integration, recovery review and controlled browser acceptance. Preserve this incomplete status until verified.

### Groq research proposal — 2026-10-29

Researched official Groq models, strict structured output, organization-wide free quotas and data retention. See [Groq implementation roadmap](GROQ-IMPLEMENTATION-ROADMAP.md). Conditional recommendation: evaluate GPT-OSS20B versus120B after provider-independent M12A, with explicit cloud consent, free-account verification and backend-only keys. No provider switch, account action, paid usage or remote inference performed. M12A remains incomplete; Groq suitability is an evidence-informed proposal, not observed domain performance. Original local-provider history is preserved.

### Groq transport checkpoint — 2026-10-29

User authorized implementation without live calls because no Groq key is configured yet. Added groq.provider.ts and four controlled transport tests: missing key sends nothing, fixed HTTPS strict nonstreaming request, quota retry metadata without upstream-content disclosure or automatic retries, and truncated-response rejection. Four tests passed. No external inference performed. Transport bounds input and response sizes and requires the configured returned model. It is not yet registered in AiModule or connected to durable jobs; provider selection, hosted provenance, cancellation/admission separation, typed-claim integration and browser acceptance remain outstanding. Do not call Groq integration or M12A complete at this checkpoint.

### M12A completion — 2026-10-29 (Claude Code)

**M12A (provider-independent explanation) is built and verified; M12B (real-model gate) is not started and AI is parked by the user, so M12 as a whole remains partial.** Commits `fe5c01a`, `4ad4481`, `4aa48c1`. Final-code evidence: backend unit 214 (2 opt-in skips), e2e 80/80, lint 0 errors, phase 2 and phase 3 contract checks identical; web unit 147, tsc and lint clean; M12 browser 36/36 across 1024/1440 light/dark; full Chrome regression 268/268 (landing and dev-only specs excluded, so not comparable with earlier totals). [Verified]

Defects found and fixed: relative-tolerance bug letting 0.99 pass as a 1% budget; readiness reply overwriting an earlier-revision notice; panel close stranding an in-flight submit; claims prompt breaking the M11 500-character guard (test unchanged). One existing fixture changed with disclosure: the e2e mock model now returns claims true for the run it computed; no assertion was altered. Mutation checks caught: claim check off, new request id per retry, earlier-revision guard, local error scope, AI-hidden gate. [Verified]

Design: server owns facts, units and the wording of checked statements; the model only phrases interpretation. With `AI_ENABLED=false` (default) the UI shows no AI. Not verified: any real model output (none was generated), hosted provider behaviour, accessibility audit beyond keyboard and 390 px checks. [Untested] See [AI deferral plan](AI-DEFERRAL-PLAN.md).

### M15.1 History and M15.2 Restore — 2026-10-29 (Claude Code)

**M15.1 History and M15.2 Restore are complete and verified; M15 as a whole is partial (Notes, Compare and the Designs list are not started).** The user approved all six scope decisions. Commits `0570294` (API) and `7f6ed8d` (web). Final-code evidence: backend unit 214 (2 opt-in skips), e2e 87/87, lint 0 errors, phase 2 and phase 3 contract checks identical; web unit 152, tsc and lint clean; M15 browser 28/28 (7 journeys x 4 projects); full Chrome regression 296/296 (landing and dev-only specs excluded, so not comparable with older totals). [Verified]

Behaviour: a restored version is saved as a NEW revision in one locked transaction with an expectedRevision check; historical versions are never updated (asserted before and after in e2e). Refused cleanly: stale view (409 REVISION_MISMATCH), version no longer retained after pruning past 100 (404 VERSION_NOT_RETAINED), identical content (422 RESTORE_NO_CHANGES); two parallel restores produce exactly one winner. The History tab labels baseline snapshots as imported, states the 100-version retention, pages versions and groups runs by revision. Restore is blocked while a draft is unsaved or saving, during a conflict, an unfinished edit or a running calculation. Mutation checks caught the stale check, no-op check, remembered source revision, unsaved-edits guard and editor adoption. [Verified]

Operator note: migration VersionRestore adds a nullable column and widens a check constraint; existing rows are untouched. Run pnpm migration:run on existing databases. Limitation: the run-list cursor is createdAt (a same-millisecond tie across a page boundary could be skipped). Not verified: assistive-technology audit beyond keyboard and 390 px checks, Firefox/WebKit. [Untested] Works with AI off; no AI surface appears in History.

### M15.3 Notes, M15.4 Compare, M15.5 Designs list — 2026-10-29 (Claude Code)

**M15 is complete.** Commits: Notes `f5d8ab0`, `bed8280`; Compare `d4f5496`, `534171d`; Designs list `a45b0ec`, `e7158ab`. Final-code evidence: backend unit 214 (2 opt-in skips), e2e 109/109, lint 0 errors, phase 2 contract unchanged; web unit 163, tsc and lint clean; full Chrome regression 390 passed, 10 skipped, 0 failed (includes landing specs). Mutation checks caught for every slice. [Verified]

Behaviour: Notes record decisions and assumptions (2,000 characters, 100 per design) tied to a plain revision number so they survive version pruning; a stale edit is refused. Compare puts two versions of one design side by side, and the server decides whether results are comparable (completed runs at identical traffic and engine version). The Designs list searches, sorts and filters on the server with bound parameters, pages at 12, duplicates, and archives reversibly; archive hides a design and keeps all evidence. [Verified]

Operator note: run pnpm migration:run (VersionRestore, DesignNotes, DesignArchive; all additive). Limitation: rename from the list is not offered. AI is parked and none of these screens shows an AI surface. [Verified]
