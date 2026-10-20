# StressForge web

Next.js (App Router) + Tailwind frontend. See the root README for setup. Notes:

- `pnpm gen:api` regenerates `src/lib/api/schema.d.ts` from the running API (`/docs-json`).
- `pnpm check:routes` verifies every route in `src/lib/routes.ts` has a page; `--write` scaffolds missing ones.
- Next.js 16: middleware is `src/proxy.ts`. Read `node_modules/next/dist/docs/` before relying on older Next APIs.
