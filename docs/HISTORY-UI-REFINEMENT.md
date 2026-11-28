# History split workspace

Approved first preview, implemented2026-11-27. Open a saved design and select History, then pick two revisions.

- Desktop: centered1320px workspace, compact revision rail beside comparison.
- Smaller screens: revisions above results; numeric table scrolls locally and supports keyboard focus.
- Native recorded-run disclosures preserve all links and start open.
- Restore previews, two-selection limit, run selectors, retries and unavailable-result explanations retained.
- Direction labels and numeric deltas come from unchanged helpers; server remains the comparison authority.

Files: web/src/components/workspace/history-tab.tsx; web/src/components/workspace/compare-panel.tsx; web/src/styles/m15.css; web/tests/browser/history-polish.spec.ts. No dependencies/backend/contracts changes.

Verification:10 unchanged units;8 unique controlled Chrome journeys across four theme/viewport projects, plus4 final reruns for mobile scrolling; scoped lint/types/production build pass. CSS-only test injection deliberately broke desktop columns and was detected. Evidence: audit/history-refinement-2026-11-27/. Browser fixtures use synthetic auth and API responses, with no live owner writes. Existing DB-backed browser suites were not run; no full hosting acceptance claimed.

Local/uncommitted. No push authorized for this task.

## Revision scroller follow-up

Added bounded, focusable native vertical revision scrolling beneath the fixed list heading. Responsive height limits keep older versions and paging reachable without stretching the whole workspace. Six controlled Chrome checks plus TypeScript/scoped lint pass; test CSS removing the height limit is detected. Production build not repeated for this follow-up. Evidence: audit/history-scroller-2026-11-27/.
