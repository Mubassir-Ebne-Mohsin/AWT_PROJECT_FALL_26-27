# Region Lab — stage2 UI prototype

Completed2026-11-27 for review; local/uncommitted. This preview has no live simulator, account access, API calls or persistent storage.

## Open

- Overview: http://127.0.0.1:3015/region-lab-preview/index.html
- Workspace: http://127.0.0.1:3015/region-lab-preview/index.html#workspace
- Results illustration: http://127.0.0.1:3015/region-lab-preview/index.html#results

From STRESSFORGE root, restart the task-owned server with:

    node docs/region-lab/serve-preview.cjs

It binds127.0.0.1:3015 only and whitelists the four preview assets. If3015 is occupied, inspect the owner before stopping anything. The files can also be served by the normal Next app at /region-lab-preview/index.html once that app is running. Owner3000 was offline during this stage; return-to-StressForge/evidence links use3000. Main Evaluation navigation is retained until future integration.

## Reviewable screens

1. Overview: dedicated brand, glass navigation, interactive regional illustration, workflow and example cards.
2. Experiments: memory-only drafts, search, rename dialog, duplication and new draft.
3. Workspace: four setup steps; independent replicas/service assumptions, expected traffic allocation, scoped Europe application interruption and form validation.
4. Results: frozen illustrative baseline/outage metrics and table, responsive horizontal scrolling and phase scrubber. Labels explicitly deny simulation/calibration/measurement claims.
5. Profiles: all12 component names, proposed controls and reference/uncalibrated status.
6. Guide: traffic/result/evidence explanations and current implementation boundary.

The screen-state picker intentionally previews loading/empty/failure states. Retry and navigation preserve in-tab edits. Light/dark controls, reduced motion, keyboard menu/tab/skip navigation and320px reflow are included. No pricing/buy interface.

## Data honesty and export

Expected regional rps is arithmetic allocation of total input, not simulated throughput. Editable configuration exports a draft matching the stage1 scenario schema, derived from docs/region-lab/examples.json. Custom service profiles are labelled unmeasured. Export has no fabricated completed run/result. Preview result values remain a distinct static illustration; changing configuration does not recompute them. Run simulation is disabled. Closing/reloading the tab resets prototype state.

## Verification

- Final8/8 browser checks across1024-light and1440-dark;8 unique journeys, multiple refinement reruns.
- Six views checked at1440/1024/390/320 with no document overflow/page errors.
- Draft JSON passes docs/region-lab/contract.cjs validation.
- Native slider labels, tab arrows, skip link, menu/Escape, dialog, invalid values and failure recovery verified.
-1600px test-only hero injection triggers the expected overflow failure; normal suite passes.
- Frontend TypeScript, scoped test lint, JS/server syntax and no-network/no-storage source checks pass.
- Server serves four approved assets; unknown path404 and POST405 verified.
- Screenshots: docs/audit/region-lab-ui-2026-11-27/.

Reproduce from web/ using PowerShell:

    $env:SF_WEB_URL='http://127.0.0.1:3015'
    $env:SF_BROWSER_CHANNEL='chrome'
    pnpm exec playwright test tests/browser/region-lab-preview.spec.ts --project=1440-dark --project=1024-light

Initial connection failures were caused by owner3000 being offline. First functional rehearsal found slider-label and prototype-test selector/theme issues; corrected before final passes. Existing application tests were not edited. No builds or numerical/security-backend acceptance claimed for this static stage.

## Next stage

Review layout and interaction direction, then separately authorize stage3 event-engine foundation. Integrating authenticated app routes, replacing Evaluation navigation, persistence, genuine execution and accuracy evidence are later gated work.
