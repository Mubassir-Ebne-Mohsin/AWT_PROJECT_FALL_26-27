# P3 scope: Examples, Templates and Components pages

Prepared 2026-11-01. Status: **all ten decisions approved 2026-11-01 ("Approve all", as recommended).** Both commits are built: one (generator, data file, freshness spec) and two (the three pages). Needs no AI and no new backend route. Details slice P3 of [PHASE-4-5-SCOPE](PHASE-4-5-SCOPE.md), where decisions 1 and 4 (content in code; examples are the existing templates, read-only, copy after sign-in, no guest simulation) are already approved.

## 1. Where the code is today (verified)

- `/examples`, `/templates` and `/components` are one-line placeholders. The registry already has all three, so **no new routes; the registry stays at 40.** `/examples` is public. `/templates` and `/components` are inside the app (sign-in needed).
- `/new/template` already works (preview of the six templates, then create a design). Its registry label still says "placeholder"; that label is stale.
- The data exists in the engine: six templates (name, blurb, graph, traffic), a catalog of 12 component types (label, category, capacity, service time, what happens when overloaded, blurb, defaults, which settings can be edited), three regions, and five **traffic** presets.
- `GET /v1/templates` and `GET /v1/simulation/catalog` need a signed-in user and are part of the **frozen phase 2 contract**, so a public page cannot call them and I will not change that contract.
- The engine can compute, for each template, its **breaking point** (the load where it first misses its goal), the first component to fail and why, the order components saturate in, and a 45-point curve of p50, p95, p99, errors and busiest utilization against load. I ran it: all six have a real breaking point (491, 1,155, 1,199, 1,830, 2,483 and 4,641 requests a second). Two templates already miss their own goal at their own stated traffic (Classic three-tier: p95 313 ms against 300; E-commerce checkout: p95 1,572 ms against 300).
- The registry's "planned" bullets promise things the data does not have: moving a live traffic slider on an example (the simulator runs on the server and needs an account), "presets such as Postgres on a 4-core box or Redis cluster" (no such presets exist), and template "tags" (no tags field). This scope replaces those with what can be shown honestly.

## 2. What each page becomes

| Page | Who | Shows |
| --- | --- | --- |
| **`/examples`** | anyone, no account | The six templates as read-only examples. Each: a preview of the design, what it is for, its components, the traffic it is tested at and the result (p95 and errors against the goal, the busiest component), and its **breaking point** in words: "holds up to about N requests a second; the first thing to fail is X, because of latency or errors". Plus a **load explorer**: a slider through the 45 precomputed load levels showing p95, errors and the busiest component's utilization at that load. A button to make your own copy. |
| **`/templates`** | signed in | The same six as a library: preview, short description, breaking point, and **tags worked out from the design** (has a cache, has a queue, has a CDN, has replicas, uses object storage, calls an external service, spans regions), with a filter by tag. "Start from this template" goes to the existing `/new/template` flow. |
| **`/components`** | signed in | The 12 component types grouped by category: what each models, capacity per replica, service time, **what happens when it is overloaded** in plain words (drops excess, builds a backlog, times out, rejects), defaults, and which settings you can edit. Then the five **traffic presets** (steady weekday, evening peak, flash sale, launch day, ingest) with their numbers and notes. |

The load explorer is a slider over **precomputed** engine results and is labelled that way; nothing is simulated in the browser, so guests still never run the simulator.

## 3. How the data gets there

A generator in the API (`pnpm fixtures:examples`, same pattern as the Learn fixtures) runs the real engine on the six templates and the catalog and writes one data file into the web app (`web/src/lib/examples-data.json`). A backend spec fails if that file differs from what the engine produces now (within a last-digit tolerance), so the pages cannot show stale numbers. The web side has tests that every figure on a page is read from that file and that tags are derived from the graph, not typed by hand.

## 4. Decisions needed (recommendation first)

1. **Static generated data or live API.** Recommended: static, checked against the engine by a spec. The public page cannot use the signed-in endpoints, and one source for all three pages avoids three loading and error states. Alternative: make the endpoints public (changes the frozen contract) or use live data on the signed-in pages only (two sources that can disagree).
2. **What counts as an example.** Recommended: exactly the six existing templates, each at its own traffic. No new hand-made example designs. Alternative: add extra examples (more design work, more data to keep correct).
3. **Traffic slider.** Recommended: a slider over the 45 precomputed load levels, clearly labelled as precomputed model results. Alternative: drop the slider and show only the breaking point and curve numbers.
4. **Product presets.** Recommended: drop "Postgres on a 4-core box / Redis cluster" (there is no such data, and inventing capacity numbers for real products would be false precision). Show the five traffic presets instead. Alternative: you supply the product figures and sources and I add them.
5. **Tags.** Recommended: worked out automatically from the design and filterable on `/templates`; no hand-written tags. Alternative: no tags.
6. **One page for examples.** Recommended: `/examples` is a single page with six panels you can link to by `#name`. No new routes. Alternative: a page per example (needs registry changes; the route count goes up).
7. **Calls to action.** Recommended: a guest's "Make your own copy" goes to sign-up and returns to `/new/template` with that template chosen (using the existing safe return-path check); a signed-in user goes straight there.
8. **Wording of the breaking point.** Recommended: say it plainly with "model estimate", name the first failing component by its label, and give the cause (latency, errors or both) in words. Two examples that fail their own goal say so; that is a feature, not a mistake.
9. **Stale labels.** Recommended: set the three routes and `/new/template` to complete in the registry, and leave `/new/template` otherwise unchanged.
10. **Slicing.** Recommended: two commits. First the generator, the data file and the freshness spec; second the three pages and their tests. Pushed only when you say so.

## 5. Test plan

- **Freshness:** the data file equals what the engine produces now; the templates in it equal `getTemplates()` and the components equal the catalog.
- **Honesty:** every number on every page is read from the data file (a test fails if a figure appears that is not in it); every page and the explorer say "model estimate"; breaking points are described with their real cause and first failing component.
- **Tags:** worked out from the graph, so a changed design changes its tags; the filter shows exactly the matching templates.
- **Behaviour:** the slider changes the written result and stays finite at both ends; the guest button builds a safe return path; signed-in users skip sign-up; `/templates` and `/components` ask a guest to sign in.
- **Browser (four projects, four widths):** `/examples` works for a guest with no API calls and keyboard-only slider use; the other two work after sign-in; no horizontal overflow at 320, 390, 1024 and 1440 px; "Start from this template" lands on the existing flow with the right template.
- **Deliberate breaks:** a stale data file, a wrong breaking point, a tag from the wrong component type, a wrong overload word, a CTA that skips the safe-return check, an example that hides a failed goal.
- The usual gates: type check, lint, all unit tests, full Chrome regression, commit by path, protected audit file never staged.

## 6. Not in scope

New example or template designs, editing or saving a template, guest simulation, product-specific capacity presets, sharing an example, and any change to `/new/template` beyond its label.

## 7. Risks

Static data going stale (guarded by the freshness spec). Readers taking precomputed results for measurements (every figure is labelled). Two examples failing their own goal could look like a bug; the page states it on purpose.

## Commit one result (2026-11-01): the data and its guard
**Built:** `pnpm fixtures:examples` (and `:check`) runs the real engine on the six templates and reads its catalog, and writes `web/src/lib/examples-data.json` (107 KB): each template's graph and traffic, its result at that traffic, and its Limits result (breaking point, first failing component and cause, saturation order, 45-point load curve); plus the engine's catalog of 12 components, 3 regions and 5 traffic presets. `src/modules/simulation/examples-data.spec.ts` fails if the stored file differs from what the engine produces now (within 1e-9), if the templates or catalog differ from what the API serves, or if an example lacks a breaking point, a named first failure or a full curve.
**What the data says:** breaking points are 491 (Single-server MVP), 1,155 (E-commerce checkout), 1,199 (Classic three-tier), 1,830 (Write-heavy ingest), 2,483 (Photo sharing) and 4,641 (Read-heavy content site) requests a second. At their own traffic, three pass, one is strained (ingest: meets its goal but is close to the edge) and two fail (Classic three-tier, p95 313 ms against 300; E-commerce checkout, p95 1,572 ms against 300). For two examples the engine reports no single bottleneck at their own traffic; the pages will say "nothing is under strain" for those.
**Evidence:** backend unit 253 pass (4 new); type check and lint clean; 10 deliberate breaks to the engine, templates, catalog and the stored file itself, all caught. No UI changed, so no browser run for this commit.

## Commit two result (2026-11-01): the pages
**Built:** `/examples` (public): six panels, each with a preview, its components, a verdict, the result at its own traffic, the breaking point in words (the number, the first component to fail and the cause), a **load explorer** over the 45 precomputed load levels (native slider, result written out, labelled precomputed) and a copy button. `/templates` (signed in): six cards with tags worked out from each design, a filter (a template must have every chosen tag; only tags that apply to some template are offered), the breaking point, and "Start from this template" into the existing flow. `/components` (signed in): the 12 component types in 7 categories with capacity, service time, what happens when overloaded in plain words, defaults and editable settings, then the 5 traffic presets. All text is built from `web/src/lib/examples-data.json`; the registry stays at 40 routes and the four routes (including `/new/template`) now read "complete".
**Honest by design:** the two examples that miss their own goal say so and say why (Classic three-tier: p95 313 ms against 300, with a breaking point of about 1,199 requests a second, below the 1,200 it is tested at; E-commerce checkout: p95 1,572 ms against 300). An example the engine reports as close to the edge says that. Where the engine names no bottleneck the page says "Nothing is under strain". No product presets are shown. No template spans regions, so that tag is never offered.
**Guests:** the copy button goes to sign-up and returns to the chosen template (existing safe return-path check); signed-in people go straight there; while sign-in is still being confirmed the safe choice, sign-up, is used.
**Evidence:** web type check and lint clean; web unit 311 pass (15 in `p3-examples.test.cjs`); 28 new browser tests (7 per project: guest examples with no requests, keyboard-only explorers, jump links and sign-up round trip, guests sent to sign in, filtered templates and start, components and presets, signed-in copy button); full Chrome regression 674 passed, 10 skipped, 0 failed. Deliberate breaks: 24 run on words, tags, filter, links, labels, the data file and the registry; 21 caught first time and the 3 survivors led to 3 new tests (an example judged by errors as well as speed, the five overload phrases, and the example names).
**Not done here (by scope):** new example designs, editing templates, guest simulation, product presets, a page per example.
