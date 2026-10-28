# M10 — Local AI feasibility results

Date: 2026-10-28 (Asia/Dhaka). User approved M10. **Evaluation completed; integration gate NO-GO for the tested configuration.** M11 has not started or been approved. This is not a claim that local AI is impossible on this laptop.

## Tested setup

Windows; user-supplied i5-12450H;7.73GB usable system RAM; RTX2050/4GB VRAM; Ollama0.40.12. Existing qwen2.5:1.5b Q4_K_M (Apache2.0) and llama3.2:3b Q4_K_M (Llama3.2 Community License) were tested sequentially. Neither model was downloaded/updated. No application code, database records, auth configuration or global Ollama settings changed.

Fixed context2048, output limit256 for explanations/512 for a tiny draft, temperature0, seed42, one request at a time,65s hard cutoff. Model-unloaded requests are called cold here; this is not a cleared disk cache, reboot or repeated cold-start distribution. GPU placement was read from /api/ps, corroborated by CLI; size/size_vram were equal: approximately1057MiB Qwen and2216MiB Llama at2048 context. These are Ollama's reported allocations, not total machine or peak CUDA-process memory.

App API5001, public frontend3011 and existing Postgres/Redis were initially healthy. Only synthetic inputs were sent to Ollama. The benchmark made read-only core-health/public-page probes and never created users/designs or invoked real authenticated writes.

## Results

| Model | Unloaded-start request | Warm request times | Explanation results for the full eight-case matrix |
| --- | --- | --- | --- |
| qwen2.5:1.5b | First attempt timed out at65.019s; separate repeat completed at30.970s |3.370–4.135s on repeat;7 samples |1/8 schema-valid;7 truncated at256 tokens;0/8 passed complete expected-field checks |
| llama3.2:3b | First matrix43.446s; repeat8.909s |2.300–2.963s in first matrix;7 samples |8/8 schema-valid;0/8 passed complete expected-field checks; only4/8 cited exclusively allowed evidence IDs |

The full case set is healthy, strained, failed, no identified bottleneck, shared database, obsolete result, missing inputs and malicious label instructions. Qwen's complete set comes from results-followup.json; Llama's comes from results.json. Two attempts are reported separately; failed cases are not replaced by later results.

Concrete quality findings:

- Llama repeatedly claimed run revision1 differed from current revision1, marking current results stale. That is a factual contradiction, not a harmless formatting issue.
- Llama emitted the string `"null"` instead of JSON null for the absent bottleneck. The broad string-or-null schema allowed it, but exact-value/reference validation rejected it. Schema validity does not establish semantic correctness.
- Some references were invented or not in the supplied allowed-ID list. Qwen's truncated replies could not safely be accepted as JSON at all.
- Both models' small client→app→db draft probes passed the current compiled backend snapshot schema and semantic graph validator, including requested topology. Both changed the requested exact labels. One tiny successful graph does not establish general drafting quality.
- Prompt-injection cases were included, but these failed overall acceptance; no general injection-resistance claim is made. Complete responses and per-case checks are preserved for inspection.

Generation rate: Llama first-matrix rates37.2–43.6 tokens/s. Qwen repeat healthy20.1 tokens/s and subsequent explanation rates63.3–78.1 tokens/s. These figures do not include cold-load latency and are not an application response-time guarantee. A schema-valid but wrong answer is not counted as usable.

## Memory and reliability

Initial free physical RAM was about1.07GB. During the first run the sampled minimum was261MiB; during the repeat326MiB. A later explicit Windows check observed371MiB free physical and418MiB free virtual memory out of32492MiB total virtual memory. These observations are not continuous commit-memory measurements.

The Llama repeat returned HTTP500 with `Insufficient system resources exist to complete the requested service.` Its unload request also returned that error; the model remained loaded. No further inference was run. Explicit `ollama stop llama3.2:3b` then succeeded. Ollama ps was empty and free memory recovered to approximately894MiB physical/3745MiB virtual at that check. No other apps or services were killed, and no pagefile/RAM settings were changed.

Read-only responsiveness probes:

| Run | API health | Public frontend |
| --- | --- | --- |
| Initial baseline |5/5 HTTP200;max192ms |5/5 HTTP200;max632ms |
| Initial inference period |8/34 HTTP200;26 connection failures |34/34 HTTP200;max113ms |
| Repeat baseline |5/5 HTTP200;max20ms |5/5 HTTP200;max78ms |
| Repeat inference period |19/19 HTTP200;max50ms |19/19 HTTP200;max22ms |

The API process changed from the inspected PID30868 to10036 during the first period. The benchmark did not restart/stop it. The cause of that external restart/interruption is unknown, so the26 connection failures cannot be confidently attributed to inference load. Do not omit them or claim uninterrupted first-run availability. The repeat provides a stable HTTP sample, not proof of full editor/simulation responsiveness. Browser frame rate, real save/simulation latency under inference and long-duration memory stability remain untested.

Final verification: API /v1/health HTTP200 with Postgres/Redis up; frontend3011 HTTP200; benchmark models unloaded. Historical docs/audit/m2-profile-source.json remains unchanged from its pre-M10 hash D0EDB982C694CF1983FFE36FAAC2F7C80ED77AC1A735852F03013E6C4A2F76DC and unstaged. Existing film/, landing work and planning files were preserved.

## Decision and next experiment

**NO-GO for integrating the current prompt/output configuration.** Warm generation speed is promising and both models were GPU-resident, but the cold timeout, semantic errors, truncation and explicit resource failure violate M10's reliability/quality gate. No production model/configuration or request budget is approved by these measurements.

Recommended M10 follow-up, before M11:

1. Restore sustainable RAM/commit headroom by closing unnecessary apps voluntarily; inspect current workload. Do not assume free GPU memory removes host-RAM requirements. A RAM upgrade is optional, not required before trying a lighter workload; no purchase was made.
2. Test Qwen first as the smaller installed candidate. Use a server-derived status/verdict/bottleneck and narrowly constrained evidence IDs; ask only for a short explanation. Test prose for factual contradictions separately. Forced fields are not evidence of model reasoning.
3. A prepared benchmark-grounded.cjs records this proposed diagnostic, but it was NOT EXECUTED because of resource pressure. Keep the same speed/quality targets and separately record any revised prompt/output settings; do not overwrite these baseline results or count planned fixes as passing.
4. Replace the physical-only safety guard with a verified host commit-headroom check before another full run; the256MiB free-physical guard did not prevent virtual-memory exhaustion. Stop on explicit resource errors and verify actual unloading.
5. Repeat the eight-case matrix, cold/warm measurements and real core-workflow responsiveness. If quality remains inadequate, assess a separately approved alternative model or narrower feature scope. Do not substitute scripted replies while claiming real AI.

## Evidence and reproduction boundaries

Evidence: [summary](audit/phase3/m10-2026-10-28/summary.json), [first run](audit/phase3/m10-2026-10-28/results.json), [repeat](audit/phase3/m10-2026-10-28/results-followup.json), [draft checks](audit/phase3/m10-2026-10-28/draft-validation.json). Synthetic cases, settings, model inventory, timings, responses, API/GPU observations and failures are retained. Local timestamps in evidence use UTC ISO strings; the report date uses Asia/Dhaka.

The archived benchmark.cjs and benchmark-followup.cjs reproduce the tested protocol, including its inadequate physical-only guard. **Do not rerun them unchanged under current memory pressure.** They are experiment artifacts, not an approved safe production inference adapter. The prepared grounded experiment is untested. verify-drafts.cjs only validates saved synthetic outputs against existing compiled backend code, with no inference or database mutation.

No application build/regression rerun was needed: this milestone added experiments/documentation only. The scripts received syntax checks, saved JSON was parsed, and draft contracts plus final local health were checked. M12/M14 and the later full quality rubric remain unimplemented/unverified.
