# PDF logo and source attribution

Approved 6 November 2026 from the owner's supplied logo screenshot. The existing landing-page stacked-layer mark is reused as monochrome vector geometry with the `STRESSFORGE.` wordmark. No background block, purple ink, raster scaling, network asset or new package.

## Where it appears

- Download PDF from Results, the workspace header and the Report page: black logo at the top-right of every portrait/landscape page, source attribution below the existing revision/run/page footer.
- Admin dashboard PDF summary: the same shared renderer adds the logo and credit to its single page.
- Owner and read-only shared Report views, Print / Save as PDF: Chromium print page-margin boxes repeat the logo/source outside report content. Print margins reserve their space. The normal interactive view is unchanged.

Credit: `© <snapshot UTC year> STRESSFORGE · Generated with STRESSFORGE`. This identifies the generating app; it does not add an ownership claim over the user's architecture, change sharing permissions or insert “all rights reserved.” Existing author/creator metadata remains StressForge.

## Use it

Refresh the frontend, then download a **new** PDF or print the report again. Existing files on your computer are unchanged. No migration, backend configuration, key or service install is required. Downloaded PDFs use vector branding in every browser; repeating browser-print margin boxes were verified in local Chrome. Other print engines were not tested.

## Maintenance

All downloaded PDF types must use `renderPdfDocument` so branding cannot be omitted by a caller. `pdf-brand.ts` owns geometry, source text and print-margin CSS; do not add independent logos to each download button. Keep branding within reserved page bands, preserve snapshot-derived dates and source determinism, and keep the source layout immutable during rendering.

Tests and evidence: [dated audit](audit/pdf-branding-2026-11-06/README.md), [living progress report](STRESSFORGE-PROGRESS-REPORT.md). Update the same report for future changes; preserve historical phase evidence and reassess affected PDF exports. Updates are not automatic.
