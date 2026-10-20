# StressForge — Phase 1 (Foundation): build prompt for Claude Code

> Run Claude Code from the `STRESSFORGE` folder (the parent of `nest-boilerplate`), so it can create the frontend next to the backend.

---

## Who I am and what we are building

I am a university student doing an Advanced Web Technologies course (JavaScript, TypeScript, NestJS, Next.js). My course project is **StressForge** (working title "Architecture Stress Test"): a web app where users draw a system architecture on a canvas, a simulator finds its bottlenecks under a traffic profile, and AI drafts, fixes and explains designs.

Course constraints: AI must be central, it must cost nothing to run, it must be a web app, and it must not be a management-style app.

I already built a **high-fidelity clickable prototype** (single HTML file, in-memory, scripted fake AI). It is the design reference for every screen and for the simulation engine. Do not redesign it; port it.

- Prototype: `nest-boilerplate/nest-boilerplate/docs/stressforge/reference/architecture-stress-test.html`
- Engine only, for Phase 2: `.../docs/stressforge/reference/mock-engine.js`
- The prototype is organised in numbered `SECTION` comments (1 engine, 2 utilities, 3 fixtures, 4 store, 5 router with the `ROUTES` table, 6 global UI incl. `buildCommands`, `scriptedReply`, `SYSTEM_STATES`, 8 placeholders and system states, 9 auth, 10 dashboard ...). Read the sections you need; do not load the whole file at once. The CSS tokens are in the `:root` block at the top.

## Where the code lives

- **Backend:** the existing NestJS boilerplate at `nest-boilerplate/nest-boilerplate`. Build on it. Do not start a new Nest project. Do not rename the folder.
- **Frontend:** a new Next.js app at `STRESSFORGE/web` (sibling of `nest-boilerplate`).
- Package manager: **pnpm** (the boilerplate has `pnpm-lock.yaml`). Node 22.
- If this is not a git repo, `git init` at `STRESSFORGE`, and commit in small logical steps. **Never commit `.env`**; confirm it is in `.gitignore`. Never print secret values from `.env`.

## What the boilerplate is (I checked) and what is wrong with it

It is a cleaned-out NestJS 11 starter from another project ("Krown Dex") with: TypeORM + Postgres (`synchronize: false`, migrations via `pnpm migration:run`), Redis (cache module + Bull queue), Swagger, helmet, cookie-parser, CORS from `CORS_ORIGINS`, throttler, argon2, passport-jwt, zod + nestjs-zod AND class-validator, socket.io, path alias `@/`, an ESLint rule forbidding relative imports, and an empty `src/modules/`.

Known problems to fix as part of Phase 1 (verify each before changing it):

1. **`AuthGuard` never verifies the JWT.** The verification is commented out; it only checks a Redis blacklist and returns `true`. This is a security hole. Replace with real verification.
2. `Role` enum contains thesis/department roles from another product, and `THESIS_SUPERVISOR` duplicates `"ROLE_USER"`. Reduce to `USER` and `ADMIN`, with a hierarchy.
3. `.nvmrc` says 18.17.0 but Nest 11 and the README need Node 22. README, Swagger title ("KDex API"), package name and docker names all say Krown Dex / KDex. Rebrand to StressForge.
4. `app.module.ts` calls `ConfigModule.forRoot` twice. `BullModule` uses `process.env.REDIS_URL`, which is empty in `.env.example`. `main.ts` does `parseInt(process.env.PORT)` with no default (NaN if unset).
5. `SnakeNamingStrategy.tableName` reads `splittedClassName[splittedClassName.length]` (always undefined, so the `status` rule never fires). Fix it.
6. The TypeORM migrations glob only matches `*.ts`, so migrations will not load from a compiled `dist` build. Make it work for both ts-node and `dist`.
7. The boilerplate has two validation systems (zod/nestjs-zod and class-validator). **Pick zod/nestjs-zod** and use it everywhere. Inspect `src/common/pipes/validation.pipe.ts` first and make it consistent. Leave the class-validator dependency alone unless it is unused.
8. `docker-compose.yml` is a production-style file (external network, RTC port ranges) that does not fit this project. Leave it, do not use it, and add a separate `docker-compose.dev.yml` (see below).
9. `.env.example` contains OIDC/auth-server variables (`AUTH_SERVER_*`). StressForge does its own email+password auth, so remove them from the example and the code paths that read them (only if nothing else uses them).
10. Swagger is mounted at `/api`. I want an API prefix `/v1` and Swagger at `/docs`.

Before changing anything, give me a **10-line summary** of what you confirmed or disagree with. Then continue without waiting.

## Zero-cost constraint

Everything must run free: local Postgres and Redis through a new `docker-compose.dev.yml` (Postgres 16, Redis 7, with healthchecks and named volumes). If Docker is not installed on my machine, tell me in one line and continue with the code, then show me what to install. No paid services, no paid APIs. In Phase 1 there are **no AI calls at all**.

## PHASE 1 SCOPE — Foundation only

### A. Backend (`nest-boilerplate/nest-boilerplate`)

1. **Cleanup and rebrand** (the list above). Validate environment variables at boot with zod and fail fast with a readable message. Keep `.env.example` complete and commented.
2. **Global setup in `main.ts`:** `/v1` prefix, Swagger at `/docs` with JSON at `/docs-json` (the frontend generates types from it), CORS for `http://localhost:3000` with credentials (OPTIONS must work), global validation, a global exception filter, request logging that does not log secrets.
3. **Consistent API responses.** Success `{ data, meta? }`; errors `{ error: { code, message, details? } }` with stable codes: `VALIDATION_FAILED` (422), `UNAUTHENTICATED` (401), `SESSION_EXPIRED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `RATE_LIMITED` (429), `INTERNAL` (500), `UNAVAILABLE` (503). The frontend's system-state pages map one-to-one to these.
4. **Health:** `GET /v1/health` returning status of Postgres and Redis (200, or 503 with details).
5. **Users + Auth modules** (`src/modules/users`, `src/modules/auth`): entity + migration for `users` (uuid id, email unique and lowercased, password hash with **argon2**, display name, role, created/updated timestamps).
   - `POST /v1/auth/register`, `POST /v1/auth/login`, `POST /v1/auth/refresh`, `POST /v1/auth/logout`, `GET /v1/auth/me`.
   - Short-lived access JWT returned in the body (frontend keeps it in memory). Refresh token in an **httpOnly, SameSite=Lax cookie**, rotated on every refresh, with the revoked/blacklisted token ids stored in Redis (the boilerplate's Redis service). Logout revokes it.
   - Rate limit the auth routes with the existing throttler. Same error message for wrong email and wrong password. Never return the hash.
   - Real `AuthGuard` (JWT verify) + `RolesGuard` + the existing `@CurrentUser()` decorator working end to end. A `@Public()` decorator for open routes.
   - A seeder (the boilerplate has `nestjs-seeder` scripts) creating one demo user: `demo@stressforge.dev` with a password defined in `.env.example` comments.
6. **Tests:** unit tests for the auth service (hashing, token rotation, revoked token) and e2e tests with supertest for health, register, login, me, refresh, logout, and a protected route returning 401 without a token. `pnpm test` and `pnpm test:e2e` must pass.
7. **Do not create the designs module yet.** That is Phase 2.

### B. Frontend (`STRESSFORGE/web`)

Next.js (App Router) + TypeScript (strict) + Tailwind CSS + ESLint. Use the latest stable Next.js. Libraries: `@tanstack/react-query`, `next-themes`, `cmdk` (command palette), `sonner` (toasts), `zod`, `openapi-typescript` (types generated from the backend's `/docs-json` via a `pnpm gen:api` script). Keep the dependency list short and justify any addition in the final report.

1. **Design system ported from the prototype:** the colour tokens (light and dark, the semantic ok/warn/fail palette separate from the cobalt accent), spacing, radii, and fonts Archivo (display), Instrument Sans (body) and JetBrains Mono (data) via `next/font`. Light/dark/system theme toggle that persists. The look must match the prototype; open it in a browser and compare.
2. **App shell and global UI**, as in prototype SECTION 6, working on every page: top bar (brand, breadcrumbs, user menu, theme toggle, help, feedback), **Ctrl+K command palette** built from the route registry, collapsible **AI panel shell** (UI only; replies come from a local scripted function, labelled "Scripted mock"), help drawer, keyboard shortcuts sheet (`?`), feedback modal (stores nothing yet; shows a toast), toasts.
3. **Route registry:** one typed file describing every route (path, title, breadcrumb, phase, fidelity tag, description). **Extract it from the prototype's `ROUTES` table; do not invent routes.** Generate the page files for all routes. Every route not built in Phase 1 renders the same clean placeholder: correct title and breadcrumb, "Coming in phase N", and what it will contain. **No dead links and no dead buttons.**
4. **System-state pages**, ported from prototype SECTION 8 (`SYSTEM_STATES`): 404 (`not-found.tsx`), 403, 500 (`error.tsx` / `global-error.tsx`), session expired, API unreachable / server waking up, rate limited / quota, maintenance. Wire the real ones to real failures (an API 401 with `SESSION_EXPIRED` opens the session modal; a network failure opens "waking up"). Add a **dev-only state switcher** (hidden, `Ctrl+Shift+D`, absent from production builds) that forces any state.
5. **Real auth screens:** login and register calling the backend, with field validation (zod), loading and failure states, a protected-route layer (Next.js `middleware` plus a client session provider) with return-to-where-you-were after login, and logout. Access token held in memory; silent refresh on 401 using the refresh cookie; one retry, then the session-expired state.
6. **API client:** a small typed `fetch` wrapper that attaches the token, unwraps `{ data }`, converts `{ error }` into a typed `ApiError`, and handles refresh. TanStack Query provider set up.
7. **Dashboard placeholder** for a logged-in user that shows their name from `GET /auth/me` and the placeholder cards the prototype shows, clearly marked "Phase 2".
8. Responsive from a narrow laptop up; accessible (focus rings, labelled controls, keyboard navigation for the palette and drawers, `prefers-reduced-motion` respected).

### C. Project docs

- Root `STRESSFORGE/README.md`: what it is, folder layout, prerequisites, and exact setup/run commands for Windows (PowerShell) for Docker services, migrations, seed, backend, frontend, tests.
- Replace the old backend README with accurate StressForge instructions.
- `STRESSFORGE/docs/ARCHITECTURE.md` (1 page): module layout, auth flow diagram in text/mermaid, the error-code table, and a note on how the prototype's mock engine will become a NestJS `SimulationModule` in Phase 2.

## Out of scope for Phase 1 (do not build)

Designs CRUD, the canvas editor, the simulation engine, real AI calls, History/Compare/Report, Learn pages, challenges, evaluation, settings. Placeholders only.

## How to work

- Plan briefly, then execute. Do not ask me questions unless something is truly blocked or a decision cannot be undone; otherwise choose the sensible default, say so in one line, and continue.
- Backend first (so the frontend can generate types), then frontend.
- Use the Nest CLI conventions and the boilerplate's path aliases (`@/...`); do not fight its ESLint rules.
- Keep files small and named by purpose. Comment non-obvious decisions, not obvious code.

## Definition of done (verify, do not assume)

1. `docker compose -f docker-compose.dev.yml up -d` starts Postgres and Redis healthy.
2. `pnpm migration:run` and the seeder succeed on a fresh database.
3. Backend: `pnpm build`, `pnpm lint`, `pnpm test`, `pnpm test:e2e` all pass. `GET /v1/health` is 200. Swagger loads at `/docs`.
4. A manual curl/PowerShell walk-through of register, login, me, refresh, logout, and a protected route without a token (401) works. Show me the commands and the status codes.
5. Frontend: `pnpm build`, `pnpm lint` and `pnpm typecheck` pass. `pnpm gen:api` produces types from the running backend.
6. In a browser, at 1440 px and ~1024 px, light and dark: register, log in, see the dashboard, open Ctrl+K, toggle the theme, open every route in the registry (each shows the right title and breadcrumb), trigger every system state with the dev switcher, log out. No console errors, no horizontal scroll.
7. Stop the backend and confirm the frontend shows the "waking up / unreachable" state instead of crashing.

## Final report (keep it short)

1. **What you can run and click now** (a short list).
2. **Known gaps.**
3. **What I must do by hand** (installs, env values).
4. **Decisions you made** that I did not specify, one line each, and any place you disagreed with this prompt.
5. **Next phase** (Phase 2: designs API, simulation engine as a NestJS module, canvas editor, Traffic / Results / Limits tabs) and what it needs from Phase 1.
