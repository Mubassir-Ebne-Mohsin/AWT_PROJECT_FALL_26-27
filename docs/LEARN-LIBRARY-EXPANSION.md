# Learn library expansion

## Learn library expansion - 25 November 2026

Implemented locally after the owner approved the expanded scope and the obsolete eight-card/count assertion corrections. Nothing committed or pushed.

### What changed

Learn is now a searchable 41-lesson field guide with five category filters, three suggested starting paths, consistent component/category glyphs, compact status footers, and responsive three/two/one-column cards. All 12 canvas component types have exactly one component lesson. Existing eight lesson IDs, order, numerical demos, quiz answer keys and progress storage remain. The 33 new lessons provide written guides and two-question checks; they do not pretend to have new interactive simulations.

Component lessons explain real-world uses, conceptual example sequences, every supported component property, editor ranges, effects, tradeoffs, and controlled exercises. Traffic guides cover baseline/scale, bursts, reads/writes, all three shapes, presets, modeled duration, p95 target and error budget. Results and workflow guides explain how to interpret saved evidence, model limits, preview/Limits, fixes, comparisons, reports/sharing, Gallery, roles and Support. Practices are manual experiments, not precomputed pass/fail claims. Existing Concept Help entries link to the relevant full lessons without model calls or changes to their answer ranking.

### Inventory

| Category | Count | Lesson IDs |
| --- | --- | --- |
| Components | 12 | queues, caching, replicas, load-balancing, cdn, clients, api-gateway, app-servers, workers, databases, object-storage, external-apis |
| Properties and scaling | 6 | regions, capacity, service-time, scaling, request-share, queue-depth |
| Traffic | 7 | traffic-basics, bursts, read-write, traffic-shapes, traffic-presets, test-duration, targets |
| Reading results | 7 | utilization, p95, throughput-errors, verdicts-bottlenecks, headroom, queue-metrics, model-limits |
| Using StressForge | 9 | canvas-graph, save-history, simulation-results, limits-preview, fixes-whatif, compare, report-share, gallery-learning, account-safety |

### Implementation and sources

- `web/src/lib/learn-content.ts` composes the original CORE_TOPICS with typed guides. New data files: learn-types.ts, learn-enrichment.ts, learn-guides-components.ts, learn-guides-foundations.ts, learn-guides-workflows.ts and learn-help-links.ts. catalog.ts derives valid lesson titles from this registry; routes.ts retains the existing dynamic route and updates its description.
- `web/src/components/learn/learn-library.tsx`, lesson-icon.tsx and lesson-guide.tsx render discovery, glyphs, examples, property tables and related links. learn.tsx retains the existing progress/quiz implementation and renders demos only for the original eight. Both Learn route page files import styles/learn-library.css explicitly.
- `web/src/lib/concept-help/index.ts` enriches selected entries with lesson links. Tests: tests/p2-learn.test.cjs, tests/browser/p2-learn.spec.ts and new tests/browser/learn-library.spec.ts.
- Property descriptions were checked against backend graph.schema.ts, engine/catalog.ts, frontend canvas/model.ts and workspace/traffic-tab.tsx. Numerical teaching demos remain checked against learn-model.ts and docs/contracts/learn-fixtures.json. Workflow copy follows the existing workspace, library, sharing, roles and help behavior. No vendor-logo assets or external learning service introduced.

### Verification evidence

- Full web unit sweep: **592/592 passed** (serial execution). After adding one additional help-link integrity test, the final focused Learn suite passed **25/25**. Earlier combined Learn/model/progress/Concept Help selection passed 54/54 before that last case.
- `pnpm build` (STRESSFORGE_AUDIT_BUILD=1), `pnpm typecheck`, `pnpm lint` and `pnpm check:routes` passed. Lint has zero errors and two unrelated existing warnings (support.ts unused disable; dossier.test.cjs unused id). Registry remains **48 routes**, with 41 concrete lesson IDs under the existing dynamic route.
- Backend Learn fixture tests **4/4** and `pnpm fixtures:learn:check` passed; fixtures match the simulator. No engine or backend application changes in this Learn increment.
- Combined selected original/expanded Chrome suite on the current development server: **49 passed, 3 intentionally skipped**. The original eight demos, guest reload/pass/reset, invalid/prototype-key topic rejection and new discovery flow passed across four light/dark laptop projects. The separate real-account creation journey was excluded to avoid writing to the owner's database; account/guest separation remains covered by units.
- Final strengthened new browser suite: **5 passed, 3 intentionally skipped**. The 41-URL inventory runs once rather than four times, and now checks every lesson at desktop and 390px. Discovery runs in all four projects at 1440/1024/390/320px, asserts computed 3/2/1 grid columns, visible icons, focus/navigation, legacy progress preservation, a new guide quiz, empty-search recovery and readable reduced-motion output. No page errors or /v1 calls observed in these journeys.
- Separate production server on port 3013: **2/2** new journeys passed, including all 41 lesson URLs at desktop/mobile, without touching owner ports 3000/5001. Only that temporary production process was stopped.
- Two in-memory deliberate faults were rejected: adding an unsupported Clients property failed the exact schema-property coverage assertion; an unknown related lesson failed the link-integrity assertion. No application source was broken on disk.
- Initial focused run exposed a stale assertion that Regions was the last lesson. Updated under the owner's approval to check the final registry item while retaining original lesson/demos/quiz tests. An initial helper command used an incorrect relative test-file path, performed no edit, and was corrected.
- New screenshots retained, unstaged, under docs/audit/learn-library-2026-11-25. Light desktop, dark mobile cards and mobile property layouts were visually inspected.

### Boundaries and delivery

No dependency, backend route, migration, live AI request, environment-value access, owner-data modification, commit or push. Guest/account progress continues in the same browser-only buckets; no migration or reset is necessary. Full all-feature Chrome/Edge, real-account signup/login and screen-reader testing were not repeated. Existing unrelated dirty files and protected artifacts remain unstaged and untouched. Preview at http://localhost:3000/learn; refresh the already-running development frontend.

To add a lesson, extend the typed guide registry, validate related IDs and supported properties, add a real knowledge check, and update counts and coverage with owner approval when required. Do not label a written guide an interactive demo. Future phase work must update the existing progress report, preserve earlier history, record fresh evidence and reassess affected earlier requirements; this does not happen automatically.
