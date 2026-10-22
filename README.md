# StressForge

Draw a system architecture on a canvas, let a simulator find its bottlenecks under a traffic profile, and let AI draft, fix and explain designs. Everything runs free: local Postgres and Redis in Docker, no paid services, no AI calls yet.

**Status: Phase 1 (foundation).** Auth, health, the app shell, every route as a placeholder, and all system-state pages. Designs, the canvas and the simulator arrive in Phase 2. The design reference is a clickable prototype in `nest-boilerplate/nest-boilerplate/docs/stressforge/reference/`.

Progress and audit: [STRESSFORGE progress report](docs/STRESSFORGE-PROGRESS-REPORT.md). The Phase 1 audit verdict is **Partial**; see the report for verified checks, open findings, and remaining work.

## Layout

```
STRESSFORGE/
  nest-boilerplate/nest-boilerplate/   NestJS API (TypeORM, PostgreSQL, Redis)  -> http://localhost:5001
  web/                                 Next.js app (App Router, Tailwind)        -> http://localhost:3000
  docs/ARCHITECTURE.md                 Modules, auth flow, error codes, Phase 2 plan
```

## Prerequisites

- Node.js 22 (see `.nvmrc`), pnpm 10+ (`npm i -g pnpm`)
- Docker Desktop for Postgres 16 and Redis 7 (or your own instances; match `.env`)

## Run it (Windows PowerShell)

```powershell
# 1. Database and Redis
cd nest-boilerplate\nest-boilerplate
docker compose -f docker-compose.dev.yml up -d
docker compose -f docker-compose.dev.yml ps        # both should be "healthy"

# 2. Backend
pnpm install
Copy-Item .env.example .env                         # then replace the two JWT secrets (see the comment inside)
pnpm migration:run
pnpm seeder:run:dev                                 # demo user: demo@stressforge.dev / Demo-Pass-123!
pnpm start:dev                                      # http://localhost:5001/v1/health , docs at /docs

# 3. Frontend (new terminal)
cd web
pnpm install
Copy-Item .env.example .env.local
pnpm dev                                            # http://localhost:3000
```

Regenerate the API types after changing backend DTOs (backend running):

```powershell
cd web
pnpm gen:api
```

## Tests and checks

```powershell
cd nest-boilerplate\nest-boilerplate
pnpm test            # unit tests
pnpm test:e2e        # needs Postgres only; creates the stressforge_test database itself
pnpm build ; pnpm lint

cd ..\..\web
pnpm typecheck ; pnpm lint ; pnpm check:routes ; pnpm build
```

## Handy

- Press `Ctrl+K` anywhere for the command palette, `?` for shortcuts.
- In `pnpm dev` only: `Ctrl+Shift+D` opens a switcher that forces any system-state page.
- Stop the API while the web app is open to see the "waking up" state recover by itself.
