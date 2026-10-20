# StressForge API

NestJS 11 + TypeORM (PostgreSQL) + Redis backend for StressForge. Phase 1 covers auth, users and health. The API is served under `/v1`, Swagger UI at `/docs` and the raw OpenAPI document at `/docs-json`.

## Prerequisites

- Node.js 22 (`.nvmrc`), pnpm 10+ (`npm i -g pnpm`)
- Docker Desktop (for local Postgres 16 and Redis 7), or your own Postgres and Redis

## Setup (Windows PowerShell)

```powershell
pnpm install
Copy-Item .env.example .env        # then set real JWT secrets, see the comment in .env.example
pnpm db:up                          # docker compose -f docker-compose.dev.yml up -d
pnpm migration:run
pnpm seeder:run:dev                 # demo user: demo@stressforge.dev
pnpm start:dev                      # http://localhost:5001/v1/health
```

The demo user's password is `DEMO_USER_PASSWORD` in `.env` (default in `.env.example`).

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm start:dev` | Watch mode |
| `pnpm build` / `pnpm start:prod` | Compile to `dist/` and run it |
| `pnpm migration:run` / `migration:rollback` / `migration:rollbackAll` | TypeORM migrations (`src/database/migrations`) |
| `pnpm migration:create src/database/migrations/Name` | New empty migration |
| `pnpm seeder:run:dev` / `seeder:refresh:dev` | Seed / re-seed the demo user (`seeder:run` uses `dist`) |
| `pnpm test` | Unit tests |
| `pnpm test:e2e` | End-to-end tests against Postgres (creates `stressforge_test` if missing) |
| `pnpm lint` / `pnpm lint:check` | ESLint with / without autofix |

E2E tests replace Redis with an in-memory fake, so they need Postgres only. Everything else (the real app, health checks, rate limiting) uses real Redis.

## Conventions

- Environment is validated with zod at boot (`src/config/app.config.ts`); a bad `.env` fails fast with a readable list of problems.
- Success responses are `{ data, meta? }`; errors are `{ error: { code, message, details? } }`. See `docs/ARCHITECTURE.md` at the repo root for the code table.
- Validation uses zod DTOs (`createZodDto` from `nestjs-zod`). Routes are authenticated by default; mark open routes with `@Public()`, restrict with `@Roles(Role.ADMIN)`, read the caller with `@CurrentUser()`.
- Imports use the `@/` aliases (relative imports are linted).
- `docker-compose.yml` is a legacy production-style file from the boilerplate and is not used by StressForge.
