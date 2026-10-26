# M7 — Traffic and recorded Results

Approved scope: Traffic settings/presets, complete recorded simulation results, snapshot-safe presentation, component inspection and return to Edit. The reference is prototype Sections 15–16, constrained by the Phase 2 roadmap's explicit server computation and immutable-run model. No engine formulas, API endpoints, database migrations, environment settings or runtime dependencies were added.

## Use it

1. Start the existing Docker services, backend and frontend as described in the root README.
2. Create or reopen an owned design. Use Edit and Check graph to repair blocking graph issues.
3. Open Traffic. Select one of the five server catalog presets or enter Custom settings. The logarithmic rate slider covers 10–50,000 rps; the number field supports zero through the existing 10-million-rps safety envelope. The ordinary burst slider covers 1–4×; a number field preserves the existing supported 1–100× envelope and imported values.
4. Configure reads, steady/spike/ramp shape, p95 target, error budget and duration. Ordinary duration choices remain 5/10/30/60 minutes, and error-budget choices remain 0.1/0.5/1/2/5%. A supported imported custom budget/duration remains visible instead of being silently clamped. Duration describes modeled time; calculation does not wait for that interval.
5. Users are in updates every Clients component in one undoable action. Mixed regions are identified; no Clients disables the control. Server regions are unchanged. Missing region properties use the source default, us-east.
6. Wait for Saved or press Run test. Run flushes all current valid changes, including edits made during an outstanding save, before submitting a saved revision.
7. Inspect Results. Click a component's name to inspect it, then Edit [name] to select it in the current architecture. Manually improve it and run again.

Presets change exactly the prototype's fields: preset id, rate, burst, read share, p95 target and shape. They preserve error budget and duration. Manual traffic edits switch to Custom. The daily figure assumes about 13/24 hours at the stated average; it is not a measured daily request count.

## Editing and safety

Traffic reuses EditorSession and its input-only, bounded local history. A preset or all-Clients region change is one history action. Consecutive same-field edits coalesce, saves retain history, and Undo becomes a new save at the current server revision. Traffic supplies Undo/Redo buttons and Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y outside text/select controls. Text fields keep native editing shortcuts.

Invalid numeric text stays visible and blocks Save/Run. Correct it or use Escape to restore the last valid value. Sliders, presets and other dependent controls are disabled while an input is invalid. Autosave still debounces at 750ms rather than writing on every slider event. A temporary catalog failure exposes Retry presets while retaining editable settings.

409 keeps the draft/history and requires deliberate resolution. Failed saves never submit a simulation. Lost acceptance retries retain the same request identity and revision even if later traffic changes. Session-modal reauthentication retains memory-only inputs/history. Explicit logout/account switch clears local state. No offline storage or cross-tab merge was introduced; reload/tab closure can lose unsaved changes and history, with existing guards where supported.

## Reading results honestly

- Every displayed result is a stored backend run. The Edit tab retains a compact summary; Results provides the full view. Traffic's recorded preview/outcome uses that same selected run.
- Verdict explanations use that result's own targets and metrics. Strained can mean utilization at least 75%, p95 above 80% of target, or a growing queue. It need not mean the p95 target failed or a qualifying bottleneck exists. The backend remains the numerical authority.
- p50/p95/p99, error rate, throughput, peak load, capacities, utilization, mean service/wait times, common request paths, queues, background failures and cross-region calls come from returned data. Tiny nonzero values use scientific notation when normal rounding would conceal them. Utilization can exceed 100%; its visual meter stops at full width while the numeric value remains truthful. Unbounded capacity/lag/saturation values are explicit.
- The timeline has separate labelled latency/rate axes, a target line, and expandable data table. It displays all returned samples without an undisclosed latency cap. It is an **illustrative sampled timeline**, not measurements or a stateful replay. Queueing approximations do not model every hardware/runtime effect.
- The average-latency section lists mean component contributions and the model's mean; it does not misrepresent them as a p95 breakdown. Remaining network/other contributions are acknowledged.
- Paths are the returned common paths, not an exhaustive enumeration. Background drops are distinguished from foreground errors.
- Revision, fingerprint, engine version, creation time and recorded graph/traffic remain inspectable. Changing semantic inputs marks the result stale immediately; layout-only movement does not. New targets, labels and regions never rewrite old metrics. Pending/failed/unavailable states do not fabricate output or percentages.

## Boundaries

M8 retains numerical canvas overlays, topology-under-load, automatic debounced preview and Limits. Real AI, version comparison/history/report features and paid integrations are not part of M7. Scripted mock remains explicitly labelled elsewhere. No deployment or automatic GitHub publication is implied.

## Verification

See the dated M7 section of [the living report](STRESSFORGE-PROGRESS-REPORT.md) and [sanitized verification evidence](audit/m7-verification.json) for observed results, initial failures/corrections and limitations.

- `web/tests/m7.test.cjs`: traffic bounds/history, region updates, save/run races, conflicts, uncertain acceptance, snapshot semantics, formatting, chart geometry and safe result markup.
- `web/tests/browser/m7.spec.ts`: real creation/traffic/run/reload journeys, every preset, zero/overload/replica change, retained drafts, conflict/retry, selected-run failures and session/logout boundaries across 1024/1440 light/dark.
- `web/tests/verify-m7-services.cjs`: explicitly opt-in actual PostgreSQL/Redis/API outage check. It verifies dedicated M7 labels/ports before stopping containers, retains inputs/history, and restores containers in finally. Interactive API stop/restart targets only the audited port-5003 process. Never use it against normal services.
- Existing Foundation/M3/M4/M5/M6 suites remain regression checks. Development-state tests require a development build; production skips are recorded separately.

Future milestone completion must update the same progress report, preserve earlier history, record new verification evidence and reassess affected earlier requirements. Nothing updates automatically.
