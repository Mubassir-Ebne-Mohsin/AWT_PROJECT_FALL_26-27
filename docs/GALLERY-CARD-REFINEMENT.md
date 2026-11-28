# Gallery card refinement - 25 November 2026

Status: implemented and verified in the scoped checks below. Local changes; not committed or pushed.

## User-visible changes

The signed-in Gallery uses a three/two/one-column responsive grid. Every card has a frozen architecture SVG, directional arrows, existing component glyphs, a verdict badge, recorded p95 and target, revision/component count, component tags, author/date, remix count or view-only label, and a View design link. The toolbar preserves search, verdict and Only mine filters, with result counts and Clear filters. Loading skeletons and missing-preview/error/empty states are explicit. Themes and reduced motion use existing tokens and conventions. No new dependency, migration, route or AI call.

## Data and privacy

The list query selects graph data from the already-published frozen report. The response projects only node ID/type/label/position and edge ID/endpoints through a strict bounded schema. It does not return properties, full reports, owner IDs, emails or private notes. No detail request is made for each card. Existing publish/detail/remix/unpublish behavior and permissions are preserved. Earlier backends without previews show a fallback instead of crashing.

## Main files

- `web/src/components/gallery/gallery-list.tsx`: toolbar, list query and states.
- `web/src/components/gallery/gallery-card.tsx`: card information and actions.
- `web/src/components/gallery/gallery-preview.tsx`: lightweight, non-interactive topology SVG.
- `web/src/styles/gallery.css`: responsive light/dark card styling.
- `web/src/lib/api/gallery.ts`: preview types.
- `nest-boilerplate/nest-boilerplate/src/common/contracts/phase3/gallery.schema.ts`: preview/list contracts.
- `nest-boilerplate/nest-boilerplate/src/modules/gallery/gallery.service.ts`: frozen topology projection.
- `docs/contracts/phase3.openapi.json`, `web/src/lib/api/phase3-schema.d.ts`: regenerated canonical contract/types.

The pre-existing generated Phase 3 contract was behind the canonical sources: regeneration also includes the six Gallery schemas/routes and existing username changes in AccountUser/AccountSession. This explains the larger generated diff; no corresponding new application behavior was added by regeneration. The live `schema.d.ts` and protected runtime dump were not regenerated.

## Verification

- Backend production build, scoped ESLint and canonical Phase 3 contract check passed.
- New backend preview/privacy tests: 3/3 passed, including allow-list checks and omitted preview handling.
- Existing Gallery HTTP integration suite: 11/11 passed, with fresh migrations in a dedicated Postgres 16 container/database on port 5547. This exercises publishing, filtering/pagination, snapshots, access, remix and unpublish; no owner database was used.
- Frontend TypeScript, scoped ESLint, separate production build and 48-route inventory passed. Final full frontend unit run: 586/586 passed.
- New card tests: 5/5 passed, including escaped content, recorded metrics, arrow markers, negative positions, missing previews, view-only labels, dangling edges and all 50 nodes/200 edges.
- Chrome: 4/4 scoped projects passed against both development and final production builds. Each inspected 1440/1024/390px widths; both light and dark were covered. Checks include column counts, no page-level horizontal overflow, filters/reset, no per-card detail requests, keyboard focus, reduced motion and controlled 503/retry. No uncaught page errors were observed.
- Three deliberate source faults were caught: wrong displayed p95, removed arrow markers, and leaked node properties. Exact source bytes were restored; final builds/tests use restored files.
- Desktop dark and mobile light screenshots were visually inspected. Twelve new screenshots are under `docs/audit/gallery-cards-2026-11-25/` and remain unstaged.

## Initial failures and limits

The first new backend test had a quoting typo, corrected before execution. An SVG title warning was fixed. Playwright's bundled Chromium was absent, so installed Chrome was used. New browser assertions were adjusted for React development remounts and the existing global reduced-motion duration. A new large-graph assertion initially counted rectangles inside icons; it now counts component boxes.

The first broader frontend unit run reported 584/585 passing: unchanged Reviewer inbox test `tests/r3-reviews.test.cjs:214` observed zero rows instead of two. Its untouched file passed 12/12 in isolation. The final sequential rerun without concurrent build/browser work passed 586/586. The new maximum-size test was added during the earlier run, so its total differs. No existing test was changed or weakened.

Full all-route browser and all-module backend regressions were not run. Browser evidence uses isolated HTTP fixtures, while real backend integration is covered separately by the database suite. This is not a measured production-load benchmark. Dense topology labels become small in thumbnails; the detail page is the inspection surface. No current owner session was modified. Only this task's port-3017 servers and disposable Postgres container were stopped; the labelled stopped container remains available for inspection.


## Compact-card follow-up - 25 November 2026

Owner approved smaller Dashboard-style cards with thumbnail and creator identity. Cards now share Dashboard page width, use 108px architecture previews, approximately 306px height in the inspected desktop fixture, compact metrics/tags and a two-line title. Descriptions/timestamps remain available on the existing detail page. The running dev frontend initially lacked Gallery rules in its root bundle; importing Gallery CSS directly from GalleryList establishes a route dependency. HTTP and browser checks confirmed the Gallery stylesheet is now served and applied on port 3000.

The API includes only the publisher's public username, with display-name-only fallback. Existing users.username storage is reused; no migration. List/detail/publish attribution is verified using an isolated real registration/publish/read flow, without email exposure.

Current-revision verification: backend build, scoped lint, Phase3 contract check, 4/4 privacy units and 12/12 Gallery HTTP integration tests; frontend types, scoped lint, production build, 6/6 card tests and 48 routes. Four Chrome projects passed against the current dev frontend using isolated API fixtures, then four passed against the production build; each checks 1440/1024/390px, 3/2/1 columns, all card heights <=340px, creator name, no horizontal page overflow and earlier functional assertions. An in-memory hidden-username fault was caught. Desktop dark/mobile light screenshots reviewed. Twelve new screenshots are in docs/audit/gallery-compact-2026-11-25, unstaged.

Full-project regression was not repeated for this follow-up. Earlier 586-unit evidence applies to the preceding revision. Public username may require restarting an older compiled API. All task changes remain uncommitted/unpushed. Own production server and test container stopped; user services retained. No owner data or live AI calls.
