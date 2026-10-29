# StressForge

Draw a system architecture on a canvas, let a simulator find its bottlenecks under a traffic profile, and let AI draft, fix and explain designs. Everything runs free: local Postgres and Redis in Docker, no paid services. The experimental M11 AI backend defaults disabled; the existing assistant UI remains scripted.

**Status: Phase 2 complete for the approved local scope, including M9 acceptance, with a documented user-accepted historical benchmark exception.** Register/login, create a design from a template, blank graph, JSON or labelled scripted mock; draw/connect/configure components; save/reopen; set Traffic; run the backend model; inspect recorded Results, transient Load preview and saved Limits. Foundation auth, shell and system-state screens remain available. Later features remain labelled placeholders. The design reference is a clickable prototype in `nest-boilerplate/nest-boilerplate/docs/stressforge/reference/`.

Public entry: `/` now introduces the architecture lab with a responsive scroll-driven specimen and links to the existing login/register flow. See the [landing-page guide](docs/LANDING-PAGE.md).

Phase3 checkpoint: [M11 backend foundation](docs/M11-AI-FOUNDATION.md) is implemented and tested. Real inference remains disabled pending the [M10 quality/memory follow-up](docs/M10-LOCAL-AI-FEASIBILITY.md); result-explanation UI is M12.

Progress and audit: [STRESSFORGE progress report](docs/STRESSFORGE-PROGRESS-REPORT.md). Phase 1 is **complete for the local Foundation scope** after the 2026-10-23 fixes and verification. See the report for evidence, the original audit history, and the latest dependency reassessment.

Working on this repo with Codex or Claude Code? Read [AGENTS.md](AGENTS.md), then [docs/PROJECT-STATE.md](docs/PROJECT-STATE.md) and [docs/HANDOFF-LOG.md](docs/HANDOFF-LOG.md) first.

Next: [Phase 2 plan and planning review](docs/PHASE-2-PLAN.md) (M0–M9 complete locally; see the report for verified results and the accepted historical benchmark exception). See the [M9 acceptance/reproduction guide](docs/M9-ACCEPTANCE.md) for isolated reliability checks and the current report verdict. See the [contract guide](docs/contracts/README.md) for schemas, fixtures and generation commands.

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

Backend engine/worker checks and model limitations: [Simulation model (M2)](docs/SIMULATION-MODEL.md). M3 now adds owned saved designs, template/replica editing and asynchronous simulation results. See [M3 run guide](docs/M3-SAVED-DESIGNS.md). Run backend pnpm migration:run before starting the updated API.

M4 adds all four creation paths at /new and the saved-design dashboard. See [M4 creation/dashboard guide](docs/M4-CREATION-DASHBOARD.md). Start/restart the existing backend and frontend; no new package installation, migration or environment value is needed for M4. M5 adds the interactive palette, movement, properties, pan/zoom/fit and minimap. See [M5 canvas guide](docs/M5-CANVAS.md). Restart the existing backend/frontend; no new dependency, migration or environment value is needed. M6 adds arrow creation/reversal/deletion, component duplication/deletion, undo/redo and actionable graph checks. See [M6 editing guide](docs/M6-CONNECTIONS-HISTORY.md).

## If PostgreSQL and Redis report ECONNREFUSED

Compilation can succeed while the required services are stopped. Open Docker Desktop and wait for its engine to run, then use PowerShell:

```powershell
Set-Location -LiteralPath 'C:\ADVANCED WEB TECH\AWT_PROJECT_FALL_26-27\STRESSFORGE\nest-boilerplate\nest-boilerplate'
docker compose -f docker-compose.dev.yml up -d --wait
docker compose -f docker-compose.dev.yml ps
pnpm start:dev
```

Both containers should say healthy. If an earlier API startup already exhausted its retries, press Ctrl+C in that backend terminal and run pnpm start:dev again after the containers are healthy. Starting Docker alone does not restart an exited API process.

From another terminal, verify:

```powershell
Invoke-RestMethod http://localhost:5001/v1/health
```

Use the ports already configured in your environment. Existing named volumes and accounts are retained; no database reset is needed.

M7 adds the full Traffic tab and recorded Results: configure rate/bursts/reads/targets, save and run, inspect latency/errors/paths/queues and select a component back in Edit. See [M7 guide](docs/M7-TRAFFIC-RESULTS.md). Restart the existing frontend; no new package, migration or environment value is needed. Live preview, load overlay and Limits remain M8.

M8 adds saved Limits searches, an opt-in debounced live preview with a canvas load overlay (Load / L on Edit, a Live preview panel on Traffic) and the recorded Topology under load on Results. See [M8 guide](docs/M8-LIVE-PREVIEW-LIMITS.md). Rebuild/restart the backend and frontend; no new package, migration or environment value is needed.
