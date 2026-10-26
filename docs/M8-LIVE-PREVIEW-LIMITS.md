# M8 — Limits, live preview and canvas load overlay

Approved scope: [M8 scope](M8-LIMITS-PREVIEW-SCOPE.md), approved on 2026-10-26 with these defaults:

- a superseded preview returns 409 `PREVIEW_SUPERSEDED`;
- a preview blocked by the owner's own pending saved calculation returns 429 `DURABLE_PENDING`;
- complexity returns 422 `COMPLEXITY_LIMIT`;
- timeout or failure returns 503 `PREVIEW_TIMEOUT` / `PREVIEW_FAILED`;
- genuine capacity pressure stays a plain 429;
- preview has its own 90-requests-per-minute throttle bucket;
- `?run=` selects a simulation and `?limits=` selects a Limits search.

No engine formula, database migration, environment setting or runtime dependency was added. The two operations that the frozen Phase 2 contract had already described are now mounted: `POST /v1/designs/{id}/limits` and `POST /v1/simulation/preview`.

## Use it

1. Start the existing Docker services, backend and frontend as described in the root README, then open an owned design.
2. **Find limits:** open the Limits tab and press Find limits. Current valid edits are saved first. The search then runs against that saved revision, as a durable job with the same request-identity, retry and one-pending-job-per-owner rules as Run test. The result is stored, survives reload and opens from `/designs/{id}/limits?limits={runId}`. Dashboard links use the stored kind of each run.
3. **Live preview:** on Edit, press **Load** or the **L** key (ignored while typing in a field). The bottom bar's traffic slider edits the same draft traffic as the Traffic tab, with the same autosave and undo. On Traffic, tick **Live preview** in its own panel. The recorded timeline below it still belongs to the selected saved run.
4. **Results topology:** the Results tab draws the selected run's saved snapshot under load. Selecting a component shows its recorded metrics. An Edit link appears only if that component still exists in the current draft.

## Reading Limits honestly

| Search state | What is shown |
| --- | --- |
| found | The tested bracket: passes at A rps, misses targets at B rps (extra precision is shown only when needed to separate A and B). The cause (latency, errors or both) and the first saturating component. Headroom = failing threshold ÷ current average load. At zero current load headroom is "not applicable", never infinite. |
| failsAtMinimumLoad | The design already misses targets at the minimum tested 1 rps. Lower thresholds are unknown, and no headroom is shown. |
| notReachedWithinRange | No failure up to the returned maximum tested load. Headroom is a lower bound ("at least"), and nothing says "never" or ∞. |

The average-rate threshold and the burst peak are labelled separately. Saturation order is "predicted saturation under unshed demand". It is not a chronological failure trace, and unbounded components are named as such. The ramp chart has separate labelled axes and target lines. **Read ramp data** opens the accessible table. There is no progress percentage: a pending search says so until the stored result arrives.

## Live preview rules

- Off by default. The on/off choice is kept in memory for that user and design.
- Only semantic changes are debounced (750 ms): traffic, targets, regions, components and edges. Moving, renaming, pan/zoom and selection never request a calculation.
- One request per editor session. A newer edit aborts the older request. A reply is accepted only for the same editor session, the newest sequence and the exact current inputs. Stale output is labelled stale and never painted onto changed components.
- Preview pauses while an input is invalid, a pointer gesture is unfinished, a save conflict is open or the owner's saved calculation is pending. It resumes with the latest inputs only.
- Failures stay inline with **Retry preview**. There is no automatic retry loop. Supersession is neutral, never an error screen.
- Logout, account switch, leaving Edit/Traffic and unmount cancel preview requests. After session-modal reauthentication the draft stays, and preview continues with a new editor-session identity.
- Previews are computed by the server worker and never stored. They create no run rows, dashboard entries or history.

## Overlay

Status colours are paired with text and a legend: healthy below 75%, strained 75 to under 100%, failing at or above 100%. Utilization above 100% stays numeric; only the meter is clamped. The bottleneck is tagged only when it is at least strained. Edge width shows **modeled** request flow, not observed packets. Animation is never required, and reduced-motion preferences are respected.

## Scheduling

There is one worker. Saved Run test and Find limits jobs preempt a running preview and evict queued previews. A preview never preempts accepted durable work. Client disconnect cancels only that preview. Detection uses the response `close` event, because Node marks the request stream destroyed once its body has been read. Startup reconciliation marks pending jobs from a stopped server as `INTERRUPTED`. They are never resubmitted automatically; the user starts a new search.

## Verification

See section 20 of [the living report](STRESSFORGE-PROGRESS-REPORT.md) for observed results, initial failures and limitations.

- `nest-boilerplate/nest-boilerplate/test/m8.e2e-spec.ts`: HTTP auth and ownership, Limits states and replay, deletion during a search, preview bounds, supersession, real disconnect, DURABLE_PENDING, preemption and eviction, worker crash recovery, OpenAPI and the separate throttle bucket.
- `web/tests/m8.test.cjs`: Limits presentation, kind-aware links and intents, preview lifecycle (debounce, ordering, pauses, failures, undo) and overlay and topology markup.
- `web/tests/browser/m8.spec.ts`: real journeys across 1024/1440 in light and dark themes.
- `web/tests/verify-m8-services.cjs`: an explicitly opt-in test of real PostgreSQL, Redis and API restart outages. Before stopping anything it checks the dedicated `stressforge.audit=m8` labels, ports 5551/6398 and the compiled 5003 API command line. Never use it against normal services.

M9 (final integration acceptance and documentation review) remains a separate milestone.
