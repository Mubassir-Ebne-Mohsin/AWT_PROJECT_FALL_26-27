# StressForge architecture (Foundation + Phase 2 through M3)

## Modules

```
nest-boilerplate/nest-boilerplate/src
  main.ts, app.setup.ts          bootstrap: /v1 prefix, helmet, CORS, cookies, Swagger (/docs, /docs-json)
  app.module.ts                  global pipe (zod), filter, response envelope, guards: Throttler -> Auth -> Roles
  config/                        zod-validated env (fails fast), TypeORM options
  common/                        AppException + error codes, exception filter, envelope interceptor,
                                 AuthGuard / RolesGuard, @Public @Roles @CurrentUser, request logger
  modules/users                  User entity, UsersService (the only code that touches password hashes)
  modules/auth                   register / login / refresh / logout / me, token rotation, Redis revocation
  modules/health                 GET /v1/health (Postgres + Redis)
  modules/designs                owned persistence, revisions, asynchronous run lifecycle/recovery
  modules/simulation             pure model, bounded worker, validation
  providers/                     Postgres (TypeORM), Redis client
  database/                      migrations, seeders
web/src
  app/                           one page per registry route; auth, dashboard, template picker and minimum Edit/Results workspace are real
  lib/routes.ts                  the route registry (path, title, area, phase, fidelity, description)
  lib/api/                       typed fetch client, ApiError, refresh, generated schema.d.ts
  components/shell/              top bar, command palette, AI panel, help, shortcuts, feedback, dev switcher
  components/system/             system-state screens and the session-expired modal
  proxy.ts                       optimistic redirect for signed-out visitors (Next 16's name for middleware)
```

## Auth flow

```mermaid
sequenceDiagram
  participant B as Browser (memory: access token)
  participant W as Next proxy
  participant A as API
  participant R as Redis
  B->>A: POST /auth/login {email, password}
  A-->>B: 200 {data:{accessToken, user}} + Set-Cookie sf_refresh (httpOnly, Lax, Path=/v1/auth)
  B->>B: sets sf_session hint cookie (non-secret)
  B->>A: GET /auth/me  Authorization: Bearer access
  A-->>B: 200 {data: user}
  Note over B,A: access token expires (15 min)
  B->>A: GET /auth/me (expired)
  A-->>B: 401 SESSION_EXPIRED
  B->>A: POST /auth/refresh (cookie)
  A->>R: SET rt:<jti> NX (spend the old token)
  A-->>B: 200 new access + rotated refresh cookie (same signed exp; remaining maxAge)
  B->>A: GET /auth/me (retry once)
  Note over B,A: refresh fails -> session-expired modal, log in again in place
  B->>A: POST /auth/logout
  A->>R: revoke refresh family + access jti
```

- The access token (15 min) lives only in browser memory. A refresh family has a fixed absolute lifetime: seven days from login by default (JWT_REFRESH_TTL_SECONDS), with no sliding extension. The refresh token is an httpOnly, SameSite=Lax cookie scoped to `/v1/auth`.
- Every refresh rotates the token while preserving its exact signed exp. The rotated cookie maxAge is the remaining family lifetime, not a fresh seven days. Spent token ids and family revocations remain effective through that absolute expiry, so descendants cannot outlive the revocation. Replaying a spent token revokes the whole family (theft signal).
- Refresh JWTs carry a required `ver:1` marker. Existing cookies issued before this upgrade are rejected and users must log in once; this prevents older sliding-lifetime descendants from bypassing the fixed family-expiry rule.
- The browser's `sf_session` cookie is only a hint so `proxy.ts` can redirect before rendering. The API is the actual gate.
- Login returns the same error for a wrong password and an unknown email and always does the same hashing work.

## Configuration and tooling

- [Backend environment example](../nest-boilerplate/nest-boilerplate/.env.example) must be copied only when .env is missing, then configured before Compose. [Root setup](../README.md) uses absolute PowerShell paths and documents host Postgres port 5433 conflicts.
- Production boot rejects either published JWT placeholder in either signing role and rejects equal access/refresh secrets. Minimum length remains 32 characters; generate two independent random secrets.
- REDIS_PASSWORD feeds the URL (percent-encoded), local Redis requirepass, and the healthcheck via REDISCLI_AUTH. Empty passwords remain supported for local development.
- pnpm typecheck covers strict application, test and setup sources; the production build excludes tests. Unit ts-jest diagnostics are enabled. Use Node 22 and pnpm 10 with the checked-in lockfile.

## Response and error format

Success: `{ "data": ..., "meta"?: ... }`. Errors: `{ "error": { "code", "message", "details"? } }`.

| Code | HTTP | Frontend reaction |
| --- | --- | --- |
| `CONFLICT` | 409 | Inline save/retry conflict; preserve draft/session |
| `VALIDATION_FAILED` | 422 | Field messages shown inline on the form (`details.fields[]`) |
| `UNAUTHENTICATED` | 401 | Wrong credentials inline; elsewhere send to `/login?next=` |
| `SESSION_EXPIRED` | 401 | Silent refresh once, then the session-expired modal |
| `FORBIDDEN` | 403 | "Not your design" page |
| `NOT_FOUND` | 404 | Not-found page |
| `RATE_LIMITED` | 429 | Inline on forms; elsewhere the rate-limited page |
| `INTERNAL` | 500 | Server-error page with a retry |
| `UNAVAILABLE` | 503 | "Waking up" page; polls `/v1/health` and returns by itself |
| (no response) | n/a | Same "waking up" page |

## Phase 2 through M5

The pure TypeScript model and bounded worker live in modules/simulation; the engine has no Nest/database dependencies. DesignsModule owns JSONB graph/traffic, revisions and immutable run payloads, authorized through the existing CurrentUser identity. See [M3 lifecycle/run guide](M3-SAVED-DESIGNS.md) and [model limits](SIMULATION-MODEL.md).

POST /v1/designs/:id/simulate commits pending inputs before returning202 and a status URL; a matching terminal replay returns200. Browser polling retrieves the stored result. A short row-lock transaction protects saves/admission; computation never holds the transaction. A single API process coalesces request keys and enforces one pending run/account. Startup marks interrupted work failed; periodic reconciliation repairs orphaned pending rows after database recovery. Deletion cascades runs and cancels local reservations. Keys are protected24h, then the latest50 terminal runs/design are retained.

The frontend ports the template picker and minimum workspace into existing URLs. Memory-only EditorSession state above the system-screen boundary protects serialized saves, newer in-flight edits, conflicts and uncertain run acceptance. Owned dashboard cards reopen stored designs/results; model estimates are explicitly labelled. Access tokens remain memory-only and existing refresh/session behavior is reused.

Live /docs-json exposes only mounted M3 operations using the frozen Zod contracts. Full planned Phase2 contracts/types remain in docs/contracts and phase2-schema.d.ts; frontend production calls use schema.d.ts generated from the running API. Preview/Limits HTTP routes, connection editing/undo and polished Traffic/Results/Limit tabs remain later milestones. No new runtime dependencies or real AI calls.

M4 adds authenticated POST /v1/designs/prepare as a pure import/blank/scripted preparation boundary, returning a validated CreateDesign snapshot without persistence or simulation. The existing POST /designs persists reviewed inputs. Scripted keyword rules port the reference MockAI draft; assumptions are explicitly stored with the description, and no provider/quota is used. CreationProvider keeps per-user/per-screen forms in memory above system screens, rejects concurrent submissions, retains uncertain acceptance and guards late navigation. Dashboard verdicts are saved results with explicit earlier-revision/pending/calculation-failure states. See [M4 guide](M4-CREATION-DASHBOARD.md).

M5 adds catalog-driven SVG canvas components and pure geometry/model helpers under web/src/components/canvas and web/src/lib/canvas. Pointer movement is temporary local preview; release commits through EditorSession. Gesture/invalid-field flags pause autosave and protect against remote replacement. View changes cause no writes. Result-input comparison excludes layout/title while retaining semantic graph/traffic fields; immutable run provenance remains visible. Dashboard summaries say Earlier revision where semantic equality is unknown. All twelve types can be added/configured; existing edges follow movement. New connections and undo remain M6. No new runtime package, endpoint, migration or engine change. See [canvas guide](M5-CANVAS.md).
