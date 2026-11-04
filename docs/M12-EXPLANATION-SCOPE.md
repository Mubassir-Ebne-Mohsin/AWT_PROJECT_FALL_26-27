# M12 plan — Evidence-grounded result explanation

Prepared: 2026-10-28 (Asia/Dhaka). Status: proposed; awaiting implementation approval. This document does not start M12, enable inference, rerun benchmarks or change application behavior.

## Goal

From a completed saved simulation, the user selects **Explain this result** and receives a short local-AI explanation tied to that exact design revision and run. Verified numerical facts remain separate from generated interpretation. Reading results, editing and saving continue to work when AI is disabled, busy or unavailable.

## Confirmed baseline

- [M11 guide](M11-AI-FOUNDATION.md): authenticated job/readiness/cancel endpoints, owned version/run provenance, native Ollama transport, disabled-by-default configuration, bounded inference and physical/commit-memory guards. Backend201 unit/76 e2e checks pass; model quality was not certified.
- [M10 report](M10-LOCAL-AI-FEASIBILITY.md): both installed models failed the tested explanation protocol, and a repeat exhausted system resources. Warm speed/GPU residency do not establish useful or safe answers.
- web/src/components/shell/ai-panel.tsx is currently an explicitly scripted drawer; it lacks active-design context.
- Workspace and RunResults already bind saved designs/runs. Use those authoritative identities rather than scraping displayed text or sending unsaved graph data.
- The API client already supports auth refresh, cancellation signals and a silent option for some server failures. Its network-error path still emits a global unreachable event even when silent is set. M12 must introduce explicit scoped handling; do not assume silent already protects the workspace from AI network failures.

## Delivery and approval gates

**M12A — Functional integration, disabled by default.** Implement contracts, context, UI, scoped errors and all deterministic tests against a controlled provider. This is useful infrastructure, but a mock-assisted demo is not completion of real-AI explanation.

**M12B — Real-model acceptance.** Complete a safer M10 follow-up first, with sustainable physical/commit headroom and revised bounded prompting. Run real evaluation on the selected configuration alongside the application. M12 is complete only when both functional and real-model gates pass. If B remains unsuccessful, report M12 partial and keep actual inference disabled. No paid fallback, silent mock replacement or automatic model download.

## 1. User flow and placement

1. Add **Explain this result** beside the recorded Results summary, using the existing product styles, fonts and semantic colors. No landing redesign or new route is needed.
2. Open/reuse the existing assistant drawer in a clearly named Result explanation mode. Header shows design name, saved revision, selected run and local model identity once known.
3. Show a concise verified-facts block: recorded verdict, p95 against target, error rate against budget and identified bottleneck or explicitly none. Render values from server evidence, not generated text.
4. User explicitly starts generation. Show pending state, real elapsed status and Cancel. Do not fabricate percent progress, token streaming or typed responses.
5. Display generated interpretation with its evidence references and limitations, visibly distinct from verified facts. Allow explicit retry/check of the same pending request; do not create duplicate jobs after a lost response.
6. After cancellation, the job may be terminal while the provider is still stopping. Show that distinction and respect M11 readiness before offering a new generation.

Outside a workspace, explain that a saved simulation is required. Any retained scripted demo must have a separate explicit mode and label; it is never an automatic fallback for failed real AI. General free-form chat is outside M12.

## 2. Grounding and backend changes

M11 currently returns a short summary plus evidence IDs. That validates structure/references, not all statements. M12 needs a versioned explanation contract before presentation:

- Server-owned identity: design/version/run IDs, fingerprint, engine version and model/prompt/schema provenance.
- Server-owned facts: recorded verdict, latency/target, error fraction/budget, identified bottleneck, and a bounded relevant component/path subset if context allows. Define units explicitly; never confuse error fraction with percent or utilization with traffic share.
- Proposed generated interpretation: a short explanation and a small set of typed claims linked to evidence IDs. The server validates claim eligibility against actual evidence. It renders numerical values and labels itself; AI does not supply authoritative metric values or recalculate simulation outputs.
- A missing bottleneck remains JSON null/None, not string-null or an invented target. Strained with no identified bottleneck requires uncertainty, not an unsupported cause.
- Historical result, missing result, incomplete/failed run and invalid/oversized input are determined by the server. Do not ask a small model to decide whether two revision numbers differ.
- Treat labels, descriptions and notes as untrusted data; they cannot override instructions or request authentication changes. Send no password, token or unrelated account data.
- Preserve context/output/memory/deadline limits. Do not silently omit decisive evidence to fit2048 tokens. Summarize transparently with coverage metadata, or return a readable unsupported-size reason. No hidden repair loop or larger-model download.

Free prose can still contradict facts despite valid JSON and references. Structured checks are necessary but cannot certify all semantic accuracy. Review real answers with a documented rubric and reject known unsupported claims; do not promise a regex solves hallucination.

Compatibility: version new artifacts/prompt/schema, preserve readable M11 artifacts and their experimental label. Do not reinterpret a legacy M11 summary as a newly certified explanation. Regenerate canonical/live OpenAPI types and test old-row compatibility.

## 3. Context, stale work and recovery

- For new generation, preserve M11's current-revision policy: use a completed simulation for the current saved revision/fingerprint. An older selected result gets a clear Earlier revision notice and an action to run the current saved inputs. Do not silently explain it as current or auto-save/run.
- Existing older explanation artifacts can be viewed only in their original run context, with an explicit earlier-revision label. They are not attached to a newer graph.
- Unsaved changes remain untouched. Explain saved inputs only, with a visible distinction from the current unsaved draft. Saving a new revision during generation makes the returned artifact historical rather than current.
- Bind all client state to account ID, design ID, run ID and revision. Switching accounts/designs/runs must not show late responses in the wrong context. Clear account-scoped cache on logout.
- Persist only nonsecret job/request identifiers in an explicitly scoped URL/query or equivalent existing route state so reload can recover the owned job. Preserve existing run/Limits query parameters. No access-token localStorage, full graph cache or prompt history.
- Generate requestId before submit and retain it across uncertain acceptance. A lost202 response is recovered by explicitly retrying the same request identity, never silently submitting a new one.
- Poll accepted jobs at roughly2-second intervals while the panel is active; stop at terminal status. Check readiness only when needed, at a slower interval. Respect normal API throttle limits and M11's single-flight memory telemetry.
- Closing the panel stops UI polling, not an accepted durable server job. Explicit Cancel is the stop action. Interrupted-on-restart work requires an explicit new request; no automatic inference replay.

## 4. UI states and API error scope

| Condition | Expected UI |
| --- | --- |
| No saved completed simulation | Explain prerequisite and offer navigation to existing Run controls |
| AI disabled | Local AI is not enabled; numerical Results remain usable |
| Busy or insufficient physical/commit memory | Inline reason and deliberate retry; no repeated admission loop |
| Model missing / Ollama unavailable | Inline status and setup guidance; no silent install or scripted answer |
| Accepted/pending | Real pending status and Cancel; numerical results still visible |
| Cancelled but runner still resident | Cancel confirmed, provider stopping; generation stays unavailable |
| Successful | Verified facts, generated interpretation, evidence references, provenance and model caveat |
| Invalid/truncated/unsupported output | Reject explanation; preserve results and allow explicit retry |
| Stale revision/result | Earlier revision context; no false claim about the current design |
| API restart / interrupted / expired artifact | Clear recoverable status, no automatic new inference |
| Session expiry | Existing authentication refresh/session-modal flow, preserving relevant UI state |
| Forbidden / missing design or job | Clear access/not-found state without leaking private metadata |

Extend the typed API client's explicit error-scope option so AI transport/server429/503 failures remain local. Preserve global network/error behavior for existing requests and existing auth/session recovery. Caller-initiated abort remains distinct from network failure. This change needs focused regression tests because silently changing all callers' existing silent behavior would regress established flows.

Accessibility: keyboard-operable trigger/drawer/cancel, predictable focus return, labelled status/error controls and polite batched announcements. Reduced motion never uses fake typing. Verify1024/1440 light/dark plus390 mobile; keep Results readable and avoid horizontal overflow.

## 5. Required verification

### Backend and contract tests

- All owned/current completed-run checks; foreign IDs, missing runs, stale revisions and missing/null bottlenecks.
- Grounding predicates, unit conversion, malformed/schema-valid-but-false claims, fabricated references and label injection.
- Context/output bounds without silent truncation, changed model digest and legacy artifact compatibility.
- Preserve M11 replay, cancellation/held capacity, deadline/memory-pressure, retention and restart behavior.
- Generated contract/live types match actual endpoints; no mutation or numerical-engine formula changes.

### Frontend unit/component tests

- Correct selected run/context binding, unsaved draft preservation, account switching, logout clearing and late completion.
- Lost acceptance uses the same request ID, cancel/close distinctions and bounded polling.
- Every inline state, preserved auth refresh and the API client's old global-error behavior.
- Focus entry/return, reduced motion and readable loading/error/success content.

### Browser/integration tests

- Real authenticated saved-design/run → explanation UI → controlled provider result → references/provenance.
- Disabled AI, missing model, low-memory readiness, busy admission, provider/API outage and recovery without replacing numerical Results.
- Switch design/run or save a new revision during a held job; no cross-context output or lost edits.
- Refresh the page after acceptance, lost submit acknowledgement, explicit cancellation with held runner, logout/session expiry, API restart and job expiry.
- Full backend build/lint/types/unit/e2e and frontend build/lint/types/unit; affected workspace/auth browser regression. Use isolated test data and new M12 evidence filenames.

### Real-model gate

After sustainable headroom and safer server-grounded prompting, evaluate the eight M10 core cases with at least three generations each for the selected configuration. Add focused regression cases for any failures discovered. Preserve all failed/rejected attempts and record model digest, settings and rubric judgments.

Proposed initial gate: no resource exhaustion or unresponsive core workflow; warm explanations within30seconds, unloaded-start within60seconds; all accepted artifacts pass identity/schema/reference/claim checks; at least90% rubric-useful answers and zero accepted critical fabricated numerical/bottleneck or authentication-disabling claims. Keep acceptance rate separate from useful-answer rate; rejecting everything is not success. Server-forced fields do not count as model reasoning. These targets are proposals, not measured M12 results. M17 retains its broader24-case/three-generation evaluation obligation.

A failing real gate keeps M12 partial and AI disabled. Any narrowed feature or changed timing budget must be stated and approved explicitly, not retroactively counted as passing.

## 6. Out of scope

No graph fixes/apply/revert (M13), AI drafting (M14), full History/Compare/Notes (M15), reports/sharing (M16), new Instructor/Reviewer privileges, autonomous tool execution, model fine-tuning or paid services. Existing User/Admin ownership remains; the approved four-role project direction is unchanged.

## Acceptance and recommendation

M12 is complete only when: the saved-result explanation flow works end to end; facts and interpretation are distinguishable; all specified failures preserve core editing/results/auth; cross-context/leak/duplicate-request regressions pass; and the real-model gate passes on the selected machine/configuration. Update the same living report, architecture, setup instructions and new evidence while preserving prior history.

Recommendation: approve M12A implementation first, with an explicitly bounded M10 follow-up for M12B when memory headroom is sustainable. No change to AI_ENABLED is part of this planning task. No implementation or real inference has started under M12.
