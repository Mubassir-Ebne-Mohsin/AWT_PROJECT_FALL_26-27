# PDF branding verification — 6 November 2026

**Complete locally, not pushed.** Implementation commit `7ea1093`. Owner requested the supplied STRESSFORGE logo in black and white at top-right, with clear PDF source attribution.

## Plan and result

1. Reuse the existing landing stacked-layer vector and wordmark; share PDF drawing/source generation across all downloads instead of changing individual buttons.
2. Reserve a continuation-header band and footer credit; repeat the same branding outside browser-print content using page-margin boxes.
3. Check existing PDF invariants, actual emitted pages, deliberate break detection and frontend gates. No new package or backend change.

549/549 frontend unit tests, lint (zero errors/two existing warnings), types, 46 routes and production build pass. Three applied in-memory faults caught. Five fixture PDFs /15 pages inspected for logo/source/placement, including landscape and four-page Chrome print; representative pages visually reviewed.

- `unit.txt`: final unchanged full suite, **549 passed /0 failed**, single worker. `focused.txt`: initial existing/new PDF checks **35/35**.
- `mutations.json`: missing renderer branding, incorrect left-side placement, and removed print CSS each applied and produced ERR_ASSERTION/nonzero exit. Source files never edited by these faults.
- `inspection.json`: **15/15 actual pages** across report (2), landscape (3, including landscape page), long title/description (5), Admin summary (1), and Chrome print/shared Report component (4). Extracted logo top-right, source bottom, all horizontal text bounds checked. Representative report/landscape/Admin/print pages rendered and visually reviewed.
- `lint.txt`, `typecheck.txt`, `routes.txt`, `build.txt`: pass; two inherited lint warnings. No new route; registry 46.
- `preservation.json`: 158 previous protected hashes /155 original PNGs match without writes/restoration.

**Synthetic fixtures only:** sample figures are not measured performance and are not the owner's saved designs. Local PDFs and preview PNGs are deliberately unstaged. `samples.cjs` creates them from established unit fixtures using the real PDF renderer and real headless Chrome print. `verify-output.py` inspects every page; `verify-samples.ps1` renders representative pages. It uses bundled pdfplumber/Poppler; production adds no dependency.

## Initial failures and correction

- Fixed-position print header initially landed near the bottom (measured text top about 746pt); `initial-print-position-failure.txt` retains the rejected coordinates. Reserved page-margin boxes now put logo/source on every page. No existing application test altered.
- Python audit helper renamed from inspect.py to avoid shadowing the standard library.
- Initial parallel full suite exhausted memory (`unit-initial-parallel-resource-failure.txt`, explicit fatal out-of-memory messages). Same test files/assertions rerun with Node --test-concurrency=1, 768MB heap, pass 549/549. No timeout/pass mark changed.

## Limits and use

Actual Chromium print verified with the owner/shared ReportDocument; other print engines, authenticated route journeys, broad Chrome and backend tests not rerun. Standard downloaded PDFs use the shared vector renderer and do not require browser margin-box support. No user database/service/env values/AI/network asset touched. Refresh frontend and generate a new PDF; existing files unchanged. No migration/install.

[Guide](../../PDF-BRANDING.md) · [Living report, section 44](../../STRESSFORGE-PROGRESS-REPORT.md).
