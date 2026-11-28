# Region Lab Stage 7 — recorded results and live workspace

Implemented on 2026-11-28. Final verification status is recorded in `docs/audit/region-lab-results-2026-11-28/checks.json`; this guide does not establish calibration or production readiness.

## User experience

The signed-in main navigation and command palette now open **Region Lab** instead of Evaluation. Existing `/evaluation/*` evidence pages remain accessible from the Lab guide and existing evidence links; their historical scientific findings have not been removed or rewritten.

| Page | Access | Purpose |
| --- | --- | --- |
| `/region-lab` | Public | Dedicated graphite/teal introduction, glass navigation, regional schematic and model boundary guide |
| `/region-lab/experiments` | Signed in | Private experiment creation/list pagination and operator-profile catalog |
| `/region-lab/experiments/:id` | Owner | Saved configuration, optimistic revisions, workload/targets/replicas, service properties, outage/deployment selection, per-route observation clocks, complete JSON editing/import, validation, duplication/deletion and paged run history |
| `/region-lab/runs/:id` | Owner | Durable status/cancellation, recorded side/repetition selection, regional/component/operation/timeline views, histogram chart, network/outage records, comparison and JSON/PDF downloads |

The primary editor exposes supported settings, including an outage switch that prepares a paired experiment. Database/replica/queue/storage/external resources do not offer unsupported replica-pool controls. Advanced JSON exposes the complete supported scenario, including topology, regional shares, network distributions, candidate routes and multi-deployment outage subsets. It accepts Region Lab scenario, version-export or run-export JSON; it does not silently convert an existing legacy canvas graph or infer a measured hardware profile. Legacy-canvas conversion requires a separate mapping/report workflow.

All new pages reuse the existing auth provider and API client. Protected pages use the existing proxy/session gate; every API read still checks real server-side ownership. The session hint alone grants no API access. Client state/query keys are scoped to account and route. Requests can be cancelled by query signals; completed/failed/cancelled runs stop status polling, hidden pages pause it, and visible recovery uses bounded backoff. Downloads use bearer-authenticated fetch, refresh handling and temporary Blob URLs, never tokens in links.

Unsaved configuration is retained in memory through local validation or HTTP errors. Configuration queries do not overwrite an editor through background focus/reconnect refetches. Running requires a saved revision. An uncertain submission retry keeps its request UUID; acknowledgement clears it so a later explicit Run is a new request. Expired idempotent acknowledgements do not trigger silent recomputation. No browser-local permanent copy of private scenarios, tokens or numerical results is introduced.

Earlier-revision result views carry `experimentRevision`, contextual `currentRevision` and `isCurrentRevision`. The UI warns when the run predates the current experiment. This contextual warning does not alter the recorded numerical result or export. New runs also freeze report name/description/source-design provenance at submission. Older snapshots never acquire guessed metadata from the current experiment.

## Result capture and wire version

The numerical model remains `region-lab-regions-v1`. New worker output adds `wireVersion: "region-lab-result-v2"` and a telemetry execution manifest. Each manifest entry corresponds to one actual repetition/side, in the same baseline/outage execution order as the native result. No repetitions are pooled.

Optional engine observation callbacks capture successful-root samples for global, origin and operation summaries, plus offered/attempt/outcome events for the original root's arrival interval. With callbacks absent, the prior numerical output remains exactly unchanged. A new format is not evidence that the assumptions have been calibrated.

HDR distributions use compressed HDR v2 base64, three significant digits, integer microsecond ticks (`encodedTickToMs: 0.001`), lowest discernible tick 1 and highest trackable tick 60,000,000. HDR's zero bucket preserves successful zero-latency observations. Percentiles shown in summaries remain the engine's exact sampled values, with p50 requiring one successful observation, p95 1,000 and p99 10,000. The histogram is quantized; it is not used to invent unavailable tail evidence or change target verdicts.

The pinned JavaScript codec's header is normalized to zero index offset and IEEE-754 conversion ratio 1.0 before emitting standard HDR v2. Reference format: [HdrHistogram's Java implementation](https://github.com/HdrHistogram/HdrHistogram/blob/master/src/main/java/org/HdrHistogram/AbstractHistogram.java). Preflight validates compressed/uncompressed lengths, cookies, range/precision/allocation header, bounded inflation (256 KiB), bounded count stream, safe bucket/count totals and count metadata before library decoding. Base64 payloads are bounded to 180,000 characters. Global/origin/operation quantiles are checked against sampled summaries with microsecond/HDR quantization allowance. Merged origin, operation and arrival-bucket histograms must equal the global distribution exactly; root counts, attempts, failures and failure-reason totals must also conserve.

The latency chart is derived by iterating the recorded histogram's nonzero counts into 24 labelled bins. It is not reconstructed from p50/p95/p99. Zero-count bins do not become positive bars. Native-v1 records remain readable/exportable with `distributionStatus: "unavailable_for_legacy_run"`, no captured distribution and no invented timeline. Nothing runs the simulator when viewing or exporting old data.

Engine/code and registry fingerprints remain frozen with each submission. New capture code changes the code digest, so old queued work cannot silently execute under a different build. Retrying interrupted work requires a new explicit request. Existing terminal results retain their original values and provenance.

## Timeline and target semantics

Measurement is divided into at most 60 arrival-cohort buckets (`ceil(durationMs / 60)` width). A root's attempts and final outcome stay with its measured arrival bucket, even if it completes during drain. Buckets with no offered roots are omitted. Unresolved roots remain unresolved; missing data is never converted to zero. These are simulated request cohorts, not wall-clock monitoring samples.

Component queue/pool/replication diagnostics cover the whole recorded side. They are not fabricated per-second utilization traces. Outage phases come from actual engine transitions; directed-link records contain actual simulated transfer/byte/remaining-work counts. Regional verdicts in the view/report use their frozen regional target override, or the global target if none exists. Raw native origin-summary verdicts in JSON retain their original global-target scope; the result-view row's `verdict` and `target` make the regional interpretation explicit.

## Inspection, comparison and exports

The implemented private API has 18 operations across 14 paths. Stage 6 supplies storage/status operations; Stage 7 adds:

| Method/path under `/v1/region-lab` | Behavior |
| --- | --- |
| `GET /experiments/:id/runs` | Retained run summaries with owner/experiment-scoped microsecond-precise keyset pagination |
| `GET /experiments/:id/versions/:revision/export` | Authenticated export of an immutable saved version |
| `GET /runs/:id/results` | Select `scenario`, `repetition`, `view` and bounded cursor/limit; regions/components/operations/timeline |
| `GET /runs/:id/compare` | `otherId`, left/right side and repetition; recorded values and compatibility reasons |
| `GET /runs/:id/export` | Versioned JSON of the frozen snapshot, code/profile evidence and every recorded repetition/side |
| `GET /runs/:id/report` | Private PDF made from the same stored facts, without simulation |

Result pages are limited to 120 rows; run-history pages to 20. Cursors are bounded and scoped to the authenticated owner, run/experiment and selected view. Unknown query fields, unsupported selections and invalid cursors are rejected. Incomplete numerical results return 409; absent/foreign identifiers return 404, including for Admin. All Lab API responses are private/no-store. Filenames use validated UUIDs. The actual Swagger snapshot is `docs/contracts/region-lab-implemented.openapi.json`; the result view has a strict Zod response DTO in addition to numerical/HDR validation. The original Stage 1 draft artifacts are retained as historical specifications, not silently rewritten to describe a calibrated release.

Comparability checks code digest, resolved architecture, profile versions/evidence, directed numerical network, workload, global/regional targets, routing and seeds. Baseline/outage mode and the outage itself are intentionally excluded from the common foundation. A mismatch reports its reasons and withholds every delta; matching results use right minus left. Error values are ratios, latency values milliseconds, and request/attempt counts retain their units. There is no averaging of regional percentiles, pooling of repetitions or implied causal attribution between unrelated experiments.

PDF reports include frozen identification/hashes, targets, per-repetition/side summaries, regional target verdicts, component diagnostics, rerouting/network/phases, provenance, limitations and complete scenario input. The PDF's standard embedded font uses ASCII fallback for non-ASCII labels; this is stated in the report. JSON preserves original Unicode text and the complete encoded distributions. No password hashes, access/refresh tokens, worker leases or worker-instance identifiers are exported.

The whole-account export gains an owner-only Region Lab manifest: all retained experiment/version/run metadata and request tombstones, with authenticated per-version/run download paths. Numerical payloads and large scenario snapshots are deliberately separate to bound the account-export response. The manifest states this omission; it does not claim to contain those payloads. Use the Lab's download controls or a bearer-authenticated API request for those paths. A signed-in browser opening a plain API link does not add its in-memory bearer header automatically.

## Implementation map

Backend paths below are under `nest-boilerplate/nest-boilerplate/`:

- `src/modules/region-lab/results/result-codec.ts`: captured histograms/cohorts, bounded HDR preflight/decoding, quantile/count/merge validation and chart bins.
- `src/modules/region-lab/results/region-result.dto.ts`: strict recorded-summary/result-view DTO and Swagger model.
- `src/modules/region-lab/results/region-results.service.ts`: owner checks, stored inspection/paging, regional interpretation, comparison, JSON/version export and PDF assembly.
- `src/modules/region-lab/results/report-text.ts` and its spec: PDF wrapping against actual embedded-font widths, including long unbroken labels and empty/Unicode text.
- `src/modules/region-lab/results/region-account-export.ts`: bounded owner-only account manifest.
- `src/modules/region-lab/engine/engine.ts`: optional observation callback types; existing foundation calculations unchanged.
- `src/modules/region-lab/engine/component-engine.ts`: optional actual sample/root-event capture; default numerical behavior unchanged.
- `src/modules/region-lab/worker/{region-compute.worker.ts,region-result.ts}`: new result capture/validation and final IPC-flush-before-disconnect.
- `src/modules/region-lab/{region-policy.ts,region-store.service.ts,region.controller.ts,region-lab.module.ts}`: fingerprints, frozen report metadata, selection metadata, response privacy and API registration.
- `src/modules/account/account.service.ts` and `src/common/contracts/phase3/account.schema.ts`: account manifest integration.
- `test/region-lab.e2e-spec.ts`: additive real-PostgreSQL/HTTP/process checks and opt-in disposable browser fixture; `results/result-codec.spec.ts` tests byte/count/quantile boundaries.

Frontend paths are under `web/`: `src/app/region-lab/**/page.tsx`, `src/components/region-lab/region-lab.tsx`, `src/styles/region-lab.css`, `src/lib/region-lab-starter.json`, and the existing shell/route/API-client integrations. The route registry has four additional pages. `tests/browser/region-lab.spec.ts` contains the reproducible browser journeys; existing route-count tests were updated only with owner approval, preserving their previous assertions.

## Verification and known limits

The audit directory retains initial failures as well as final command logs, source hashes, compiled-worker output, numerical replay, browser downloads and screenshots. Early checks caught codec header metadata, a new fixture's invalid worker UUID, JSONB key-order assumptions, UTF-8 editing, a shell height/header overlap and editor labelling. Worker metadata binding and final IPC-flush handling were corrected and covered by real child execution. Deliberate test-only owner, compatibility and histogram-validation bypasses each fail their intended assertions; normal tests must then pass. The browser overflow fault checks the actual app scroller as well as the document.

The exact Stage 4 and Stage 5 numerical golden cases remain unchanged with capture absent. Seven of the eight original foundation source files remain byte-identical; `engine.ts` changes only to declare optional capture callbacks. This is compatibility evidence, not calibration. Backend TypeScript/scoped lint/production build, frontend gates and final integration/browser counts are recorded separately in `checks.json`; the opt-in browser-server fixture is not counted as a normal passing behavior test.

Focused verification uses only the task-owned PostgreSQL 17 cluster on 127.0.0.1:55468 (`sf_region_stage6`), a test-only API on 5057 and a separate production-web preview on 3016. Authentication restoration/revocation dependencies are controlled fixtures around the real bearer guard; Region Lab storage, numerical workers, result reads and exports are real. Visibility polling uses an explicitly controlled pending-status response. This does not replace the separately deferred full hosting/Redis/provider/production-CORS rehearsal. No live provider/model request or environment-file value inspection is part of this work.

No new database migration is needed for Stage 7's versioned JSON result payload. The Stage 6 `RegionLabStorage1795600000000` migration is still required before using the owner development deployment; it was tested only in the disposable cluster and has not been applied to the owner's database here. Run the normal backend migration workflow before enabling these pages against that deployment. Work remains local and uncommitted; no push is performed by this stage.

Stage 8 requires separate approval for measured calibration and preregistered acceptance. Hosted OS/container RSS enforcement and process supervision remain release gates: the existing 256 MiB RSS guard is sampled/cooperative, not an OS hard cap. Legacy-canvas conversion, provider-specific cloud accuracy and whole-project hosting acceptance are not implied by this stage.

## Final local verification — 2026-11-28

Final gates pass:190 numerical/codec/PDF checks,39 real SQL/API/worker checks,102 frontend regressions and2 production Chrome journeys. Both native production builds, types, scoped zero-warning lints,53-route registry, additive account contract/types and compiled-worker replay pass. The deliberate owner, comparison, HDR-validation and browser-overflow faults fail as intended; normal restored checks pass. Desktop dark, desktop/mobile light, introductory diagrams and the downloaded PDF first page were visually reviewed. The browser fixture and all task-only services are stopped. Exact commands/outcomes, initial failures and source hashes are retained in the audit directory. This completes Stage7 local engineering verification; the separate release gates above still apply.
