# StressForge API

NestJS 11 + TypeORM (PostgreSQL) + Redis backend. Phase 1 covers auth, users and health. API: /v1; Swagger: /docs and /docs-json.

## Prerequisites

- Node.js 22 (see .nvmrc), pnpm 10.
- Docker Desktop for local Postgres 16 and Redis 7, or matching local instances.

## Setup (Windows PowerShell)

```powershell
Set-Location -LiteralPath 'C:\ADVANCED WEB TECH\AWT_PROJECT_FALL_26-27\STRESSFORGE\nest-boilerplate\nest-boilerplate'
if (-not (Test-Path -LiteralPath '.env')) { Copy-Item -LiteralPath '.env.example' -Destination '.env' }
# Edit .env BEFORE Compose: generate two independent JWT secrets; confirm free host ports.
pnpm install --frozen-lockfile
pnpm db:up
docker compose -f docker-compose.dev.yml ps
pnpm migration:run
pnpm seeder:run:dev
pnpm start:dev
```

Replace the absolute checkout prefix if needed. New environments use DB_PORT=5433 to avoid the common local Postgres port 5432 conflict; the container stays on 5432. If 5433 is occupied, choose another free DB_PORT in .env before starting Compose. Keep existing .env files and unrelated databases. Changing .env does not change credentials already stored in a Postgres named volume.

REDIS_PASSWORD may be empty for local development or nonempty: Compose configures Redis requirepass, its authenticated healthcheck, and all API clients from the same setting. Quote special characters as described in .env.example. Recreate services after changing credentials. Do not delete existing volumes to resolve a port conflict.

The demo login is demo@stressforge.dev; its password comes from DEMO_USER_PASSWORD in .env.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm start:dev` | Watch mode |
| `pnpm build` / `pnpm start:prod` | Compile to dist and run |
| `pnpm typecheck` | Strict source, unit, e2e and setup typecheck without emitting files |
| `pnpm test --runInBand` | Unit tests with ts-jest diagnostics enabled |
| `pnpm test:e2e` | Real Postgres; disposable DB_TEST_DATABASE required (tests truncate users) |
| `pnpm migration:run` / `migration:rollback` / `migration:rollbackAll` | TypeORM migrations |
| `pnpm migration:create src/database/migrations/Name` | New empty migration |
| `pnpm seeder:run:dev` / `seeder:refresh:dev` | Seed / re-seed demo user; compiled equivalents omit :dev |
| `pnpm lint` / `pnpm lint:check` | ESLint with / without autofix |

Run typecheck before either Jest suite. Both unit and e2e runners use tsconfig.test.json with ts-jest diagnostics enabled. E2E replaces Redis/rate limiting with in-memory doubles, so it does not verify real Redis authentication.

## Conventions

- Environment is validated at boot; production rejects the published JWT placeholders and equal access/refresh secrets. Generate each secret independently (at least 32 characters).
- Responses use data/meta or error/code/message/details. See [architecture](../../docs/ARCHITECTURE.md) and [root setup](../../README.md).
- Use zod DTOs, @Public(), @Roles(Role.ADMIN), @CurrentUser(), and @/ import aliases.
- docker-compose.dev.yml is the local profile; docker-compose.yml is legacy boilerplate.

## Focused config verification

With Docker running, the opt-in Redis check creates a unique disposable Compose project, tests empty and nonempty passwords through the server, healthcheck, node-redis and ioredis, then removes only that project's resources:

```powershell
Set-Location -LiteralPath 'C:\ADVANCED WEB TECH\AWT_PROJECT_FALL_26-27\STRESSFORGE\nest-boilerplate\nest-boilerplate'
$env:TEST_REDIS_COMPOSE = '1'
try { pnpm exec jest --runInBand --runTestsByPath src/config/redis-compose.spec.ts }
finally { Remove-Item Env:TEST_REDIS_COMPOSE -ErrorAction SilentlyContinue }
```

The default unit run skips this Docker integration suite. app.config.spec.ts checks production-secret rejection, module startup, Redis URL encoding and local defaults. swagger-runtime.spec.ts checks UI, JSON and YAML endpoints without requiring a database.

## Dependency triage (2026-10-23)

Compatible updates and removal of unused event-emitter/Socket.IO dependencies reduced the production audit from 47 findings (including one critical) to two: one high and one moderate. The scoped Swagger js-yaml 5.5.0 override is covered by the UI/JSON/YAML regression.

| Remaining path | Assessment and follow-up |
| --- | --- |
| nestjs-seeder -> @faker-js/faker 8.4.1 (high) | Advisory concerns helpers.fake; the deterministic demo seeder does not call it or DataFactory. Patched Faker requires >=10.5.0, a major change beyond the current seeder's range. Update/replace the seeder before adding Faker-based or user-controlled seed templates. Exploitability is not established. |
| bull -> uuid 8.3.2 (moderate) | Advisory affects buffer handling in v3/v5/v6; the installed Bull sources call v4. Patch requires >=11.1.1, a major change. Retain until a compatible Bull update or a separately tested queue migration. |

The all-dependency audit also reports two moderate file-type advisories through @swc/cli's downloader. They are development-tool dependencies, and no application input path to that downloader was found. Do not treat the reduced production count as a clean security audit. No forced cross-major Faker/uuid override was applied.

## M2 simulation core

Historical M2: SimulationModule was registered without calculation controllers. M3 now adds Designs tables/owned CRUD and asynchronous simulation; preview/Limits routes remain planned. See [M3 run guide](../../docs/M3-SAVED-DESIGNS.md). Apply pnpm migration:run before starting the updated API. The pure engine and bounded worker run free locally. See [model/worker documentation](../../docs/SIMULATION-MODEL.md) and the living report for evidence and limits.

```powershell
pnpm test:simulation
# Pick new evidence filenames; do not overwrite an earlier milestone's measurements.
$env:SF_PROFILE_OUTPUT='local-profile-source.json'
pnpm simulation:profile
pnpm build
$env:SF_PROFILE_OUTPUT='local-profile-compiled.json'
pnpm simulation:profile:compiled
Remove-Item Env:SF_PROFILE_OUTPUT
# Real Postgres/Redis must be configured first; prefer isolated audit services.
pnpm simulation:health:verify
```

The profiler requires no database and writes local aggregate evidence only. The health verifier creates no users or schema; its crash/CPU-loop fixture is a development test, never an API feature.


## Phase 2 core loop and M9 acceptance

DesignsModule owns user-scoped designs, revisions, prepare/validation, durable simulation/limits records and dashboard summaries. SimulationModule owns the pure model and bounded worker; live previews are transient and never add history rows. Real AI remains later scope. [M9 acceptance guide](../../docs/M9-ACCEPTANCE.md) documents isolated service failures, lock cancellation, auth recovery, bounded soak and retention. Do not run interruption tests against normal services/data or overlap them with integration/browser suites.

M9 uses narrow production transitive overrides for multer2.5.0, Bull's uuid11.1.1 and the seeder's faker10.5.0; Node22 and the committed pnpm lockfile are required. Database and Redis deadlines are documented in the architecture/acceptance guide. These are local defaults, not production latency guarantees.

## M11 optional AI/version backend

The backend now provides experimental local AI job/readiness contracts and immutable version baselines. `AI_ENABLED` defaultsfalse; no real-AI UI is added and M10's quality/memory gate remains open. Run `pnpm migration:run` before using the updated backend. Existing design data is preserved; the additive migration records each current revision only. See [M11 setup, limits and evidence](../../docs/M11-AI-FOUNDATION.md). No new runtime dependencies.
