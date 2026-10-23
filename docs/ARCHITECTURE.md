# StressForge architecture (Phase 1)

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
  providers/                     Postgres (TypeORM), Redis client
  database/                      migrations, seeders
web/src
  app/                           one page per registry route; login, register, dashboard are real
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
| `VALIDATION_FAILED` | 422 | Field messages shown inline on the form (`details.fields[]`) |
| `UNAUTHENTICATED` | 401 | Wrong credentials inline; elsewhere send to `/login?next=` |
| `SESSION_EXPIRED` | 401 | Silent refresh once, then the session-expired modal |
| `FORBIDDEN` | 403 | "Not your design" page |
| `NOT_FOUND` | 404 | Not-found page |
| `RATE_LIMITED` | 429 | Inline on forms; elsewhere the rate-limited page |
| `INTERNAL` | 500 | Server-error page with a retry |
| `UNAVAILABLE` | 503 | "Waking up" page; polls `/v1/health` and returns by itself |
| (no response) | n/a | Same "waking up" page |

## Phase 2: the mock engine becomes a `SimulationModule`

[mock-engine.js](../nest-boilerplate/nest-boilerplate/docs/stressforge/reference/mock-engine.js) is a pure function of a design graph and a traffic profile. In Phase 2 it moves to `src/modules/simulation` as plain TypeScript (no Nest imports in the engine itself), wrapped by a thin `SimulationService`, so the same code runs in unit tests against textbook queueing results. A `DesignsModule` adds the `designs` table (JSONB graph, owner, traffic) and CRUD; `POST /v1/designs/:id/simulate` and `/limits` return the engine output inside the standard envelope. The frontend reuses the route placeholders for Traffic, Results and Limits and adds the canvas editor. What Phase 1 provides for this: authenticated users, ownership via `@CurrentUser()`, validation with zod DTOs, the envelope and error codes, generated API types, and the system-state pages.
