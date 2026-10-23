# StressForge

Draw a system architecture on a canvas, let a simulator find its bottlenecks under a traffic profile, and let AI draft, fix and explain designs. Everything runs free: local Postgres and Redis in Docker, no paid services, no AI calls yet.

**Status: Phase 1 (foundation).** Auth, health, the app shell, every route as a placeholder, and all system-state pages. Designs, the canvas and the simulator arrive in Phase 2. The design reference is a clickable prototype in `nest-boilerplate/nest-boilerplate/docs/stressforge/reference/`.

Progress and audit: [STRESSFORGE progress report](docs/STRESSFORGE-PROGRESS-REPORT.md). Phase 1 is **complete for the local Foundation scope** after the 2026-10-23 fixes and verification. See the report for evidence, the original audit history, and remaining dependency follow-ups.

Next: [Phase 2 plan and planning review](docs/PHASE-2-PLAN.md) (M0–M2 complete locally; the first usable design/save/run journey is M3). See the [contract guide](docs/contracts/README.md) for schemas, fixtures and generation commands.

## Layout

```
STRESSFORGE/
  nest-boilerplate/nest-boilerplate/   NestJS API (TypeORM, PostgreSQL, Redis)  -> http://localhost:5001
  web/                                 Next.js app (App Router, Tailwind)        -> http://localhost:3000
  docs/ARCHITECTURE.md                 Modules, auth flow, error codes, Phase 2 plan
```

## Prerequisites

- Backend: Node.js 22 (backend `.nvmrc`) and pnpm 10.34.7 (backend `packageManager`).
- Frontend: Node.js 22 and pnpm 12.14.0 (`web/package.json`). Each project pins its package-manager version; both were verified with Node 22.
- Docker Desktop for Postgres 16 and Redis 7 (or your own instances; match `.env`)

## Run it (Windows PowerShell)

Use an absolute path in each new terminal. If your checkout is elsewhere, replace the checkout prefix below.

```powershell
# 1. Backend environment BEFORE Compose; preserve existing secrets and ports.
Set-Location -LiteralPath 'C:\ADVANCED WEB TECH\AWT_PROJECT_FALL_26-27\STRESSFORGE\nest-boilerplate\nest-boilerplate'
if (-not (Test-Path -LiteralPath '.env')) { Copy-Item -LiteralPath '.env.example' -Destination '.env' }
# Edit .env now: generate two independent JWT secrets using the example's command.
# New environments use DB_PORT=5433 (container Postgres still listens on 5432).
# If a local service already uses 5433, choose another free DB_PORT in .env.
# Existing .env files keep their configured ports. Do not stop unrelated Postgres.
pnpm install --frozen-lockfile
docker compose -f docker-compose.dev.yml up -d --wait
docker compose -f docker-compose.dev.yml ps
pnpm migration:run
pnpm seeder:run:dev                 # demo@stressforge.dev; password from DEMO_USER_PASSWORD
pnpm start:dev                      # http://localhost:5001/v1/health ; Swagger /docs

# 2. Frontend (new terminal)
Set-Location -LiteralPath 'C:\ADVANCED WEB TECH\AWT_PROJECT_FALL_26-27\STRESSFORGE\web'
pnpm install --frozen-lockfile
if (-not (Test-Path -LiteralPath '.env.local')) { Copy-Item -LiteralPath '.env.example' -Destination '.env.local' }
pnpm dev                           # http://localhost:3000
```

Set Redis ports/passwords in the backend .env before Compose starts. A nonempty REDIS_PASSWORD configures the server, healthcheck and API clients together. Restart the dev services after changing it. PostgreSQL credentials in an existing named volume are not changed by editing .env; retain the original credentials or deliberately migrate that database. Preserve existing data; a port conflict does not require deleting volumes.

Regenerate API types after changing backend DTOs (backend running):

```powershell
Set-Location -LiteralPath 'C:\ADVANCED WEB TECH\AWT_PROJECT_FALL_26-27\STRESSFORGE\web'
pnpm gen:api
```

## Tests and checks

```powershell
Set-Location -LiteralPath 'C:\ADVANCED WEB TECH\AWT_PROJECT_FALL_26-27\STRESSFORGE\nest-boilerplate\nest-boilerplate'
pnpm typecheck       # strict source + unit/e2e/setup typecheck
pnpm test --runInBand
pnpm build
pnpm lint:check      # read-only; pnpm lint applies fixes
# E2E truncates users: point DB_TEST_DATABASE at a disposable test database first.
pnpm test:e2e        # real Postgres; Redis/rate limiting use test doubles

Set-Location -LiteralPath 'C:\ADVANCED WEB TECH\AWT_PROJECT_FALL_26-27\STRESSFORGE\web'
pnpm typecheck
pnpm lint
pnpm check:routes
pnpm test            # API client, theme, focus, route and error-boundary regressions
pnpm build
```

## Handy

- Press `Ctrl+K` anywhere for the command palette, `?` for shortcuts.
- In `pnpm dev` only: `Ctrl+Shift+D` opens a switcher that forces any system-state page.
- Stop the API while the web app is open to see the "waking up" state recover by itself.


## Browser acceptance and audit checks

Use an isolated audit API/database for browser tests: they create disposable accounts. See the [progress report](docs/STRESSFORGE-PROGRESS-REPORT.md) for the verified test environment and evidence. Keep normal user data separate from the e2e database, which truncates users.

```powershell
Set-Location -LiteralPath 'C:\ADVANCED WEB TECH\AWT_PROJECT_FALL_26-27\STRESSFORGE\web'
# Backend and pnpm dev must already be running. Use installed Edge, or install Playwright Chromium.
$env:SF_BROWSER_CHANNEL = 'msedge'
$env:SF_DEV_STATES = '1'
pnpm test:browser
# Production checks: run pnpm build; pnpm start, then remove SF_DEV_STATES.
# The dev-state test is deliberately skipped against production.
```

From the root, after building the backend, `node docs/audit/phase1-regressions.cjs` runs offline regressions. `node docs/audit/live-phase1.cjs` exercises a running audit API and creates accounts; never record its tokens. `node docs/audit/rate-limit.cjs` starts a temporary API with the default auth limit against the configured audit services and stops its own process afterward.

Backend engine/worker checks and model limitations: [Simulation model (M2)](docs/SIMULATION-MODEL.md). No new editor or calculation HTTP route is available until M3.
