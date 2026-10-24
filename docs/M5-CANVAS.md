# M5 — Canvas fundamentals

Updated 2026-10-24 (Asia/Dhaka). User approved the M5 scope before implementation. Sources: prototype Sections12–14, [Phase2 roadmap](PHASE-2-PLAN.md), existing M1 graph/catalog contracts and M3/M4 save/recovery implementation. Verification and current verdict live in [the progress report](STRESSFORGE-PROGRESS-REPORT.md).

## Using the canvas

Start the normal backend/frontend with the root README and open a saved design's Edit tab.

- The palette contains all12 existing catalog types. Click/Enter/Space adds a component at the view centre; drag it onto the canvas to choose its position. The limit remains50 components.
- Click a node or choose it in the Component dropdown. Edit its name and supported catalog properties in the right panel. Clients have traffic weight/region and no replica pool; CDN has a global edge location rather than a region control.
- Drag a node to move it, snapping to the prototype12-unit grid. Arrow keys while the canvas/node has focus move12 units; Shift+arrows move48. Position buttons provide an alternative. Keyboard nudges preserve exact deltas from imported non-grid coordinates.
- Drag empty canvas space to pan. Wheel zoom anchors to the pointer; +/− zoom, F fits, and the focus-selected button centres the selected node. Zoom stays30–200%; Fit follows source30–115% limits. Minimap clicks navigate; keyboard activation centres its overview, with Fit/component focus as alternatives.
- Escape, pointer cancellation or lost capture cancels a node drag without committing it. Releasing outside the SVG still finishes safely through pointer capture.
- Positions/properties use the existing750ms autosave and explicit Save. Pan, zoom, minimap and selection are view state only and do not save.
- Editing is supported from900px wide. Below that, a clear wider-window message replaces the canvas. The editor gives its main space to the graph; saved descriptions/assumptions remain available below it.

Numbers are checked before application. Invalid/empty fields pause saves/Run; correcting them resumes normal editing. Leaving an invalid field restores its last accepted value with an explanation, rather than clamping or sending an invalid graph. Prototype control ranges are preserved within API safety bounds. Legal imported values are not silently rewritten merely by opening the properties panel.

## Scope boundary

M5 delivers adding, selecting, moving, properties, viewport tools, minimap, accessible alternatives and persistence. Existing connections render with source-style directed curves and follow moving nodes.

Creating/reversing/removing connections, component deletion/duplication and undo/redo remain M6. Full Traffic/Results remains M7; live load colours/animations and preview/Limits remain M8. No fake connection handles or enabled placeholder tools imply otherwise. Whole-design deletion and explicit saved simulation runs continue to work.

Blank designs can now gain components and layouts. Newly added disconnected components remain a safe saved draft; making a new runnable topology needs M6 connections. Existing connected templates can still run.

## Implementation and safety

No runtime dependency, backend endpoint, migration, schema bound, environment variable or engine change was needed.

- WEB/src/lib/canvas/geometry.ts: world/screen conversion, source fit/zoom/snap and edge geometry.
- WEB/src/lib/canvas/model.ts: catalog-driven graph commands, collision-free local IDs, numeric validation/default display.
- WEB/src/components/canvas/: SVG renderer, trusted source glyphs, pointer handling, palette, properties, minimap and editor layout.
- EditorSession adds gesture/input guards. Pointer frames are local preview only; release commits one graph change. Save/Run cannot flush a half gesture or invalid field. A preceding save's acknowledgement still preserves newer graph edits.
- DraftProvider retains the existing per-user/design memory lifetime and navigation/unload warnings. Canvas listeners/observers/gesture flags clean up on unmount; logout/account switch disposes the original session.
- Remote reads do not replace dirty, saving, gesturing or invalid-field state. Actual visibility/focus refetches the design even within the cache window. Once a clean gesture is cancelled, the held server revision is reconsidered; dirty graphs still use the409 conflict workflow.
- Model-input comparison excludes positions and design title, preserving node/edge array order and semantic fields from M1. A layout save does not itself mark model output stale. The stored run revision/fingerprint/version remain visible and its snapshot is never rewritten.
- Dashboard summaries have revisions rather than full model inputs. They therefore say Earlier revision instead of asserting numerical staleness; open Results to compare the actual tested inputs. Attention counts remain explicitly scoped to current-revision results in the ten recent designs.

Minimap/pan/zoom/selection are intentionally temporary view state. There is no persistent offline storage or multi-tab editing merge. A minimum30% zoom may not show an extreme imported extent all at once; pan, component selection and focus remain available.

## Verification

Existing scripts remain authoritative: pnpm test, lint, typecheck, build and check:routes. No separate test framework was introduced.

- tests/canvas.test.cjs covers transformations/anchors/bounds, all12 catalog defaults, IDs/limits, invalid numbers, gesture/save/refetch safety and semantic result equivalence. tests/fixtures/canvas-catalog.json is captured from the existing backend getCatalog implementation.
- browser/m5.spec.ts covers zoomed movement/save/reload, all types/properties, cancellation and save failure, zoomed palette drops/outside drops, maximum graph navigation and held remote revisions.
- browser/m5-boundary.spec.ts covers actual wheel events, zoom limits, minimap keyboard activation, resize and the exact899/900px boundary.
- SF_M5_REAL_OUTAGES=1 node tests/verify-m5-services.cjs explicitly stops/starts only task-labelled M5 PostgreSQL5548/Redis6395 containers. The audit API on5003 must point at their separate sf_m5_audit database, with web on3003. The harness validates labels/ports first and always restarts containers in finally. Never use normal services.
- Use STRESSFORGE_AUDIT_BUILD=1 and NEXT_PUBLIC_API_URL=http://localhost:5003/v1 for isolated .next-audit builds, then SF_WEB_URL=http://localhost:3003 and SF_API_URL=http://localhost:5003/v1 for browser tests. Traces/tokens/storage state stay off.

A frame sample on the maximum graph is a short usability smoke check, not a formal performance benchmark. Browser/coverage results and untested areas are recorded with their scope in the report.

Future milestone completion must update the same progress report, preserve earlier history, record new evidence and reassess touched earlier requirements. No automatic updates or synchronization are promised.

## Subsequent milestone

M6 now supplies the connection, duplication/deletion, undo/redo and graph-repair tools deferred above. This guide preserves the M5 scope/history; use [the M6 guide](M6-CONNECTIONS-HISTORY.md) for current editing behaviour and the living report for its verification status.
