# M10 experiment archive — 2026-10-28

See [feasibility verdict](../../../M10-LOCAL-AI-FEASIBILITY.md).

- benchmark.cjs → results.json: first sequential protocol run.
- benchmark-followup.cjs → results-followup.json: same protocol repeated; initial failures retained.
- summary.json: derived counters/latencies; percentages refer to separate matrices, not independent evaluations of every generated sentence.
- verify-drafts.cjs → draft-validation.json: offline existing-backend schema/graph checks.
- benchmark-grounded.cjs: prepared diagnostic, NEVER RUN. No results-grounded.json exists.

Do not rerun generation scripts unchanged: the measured workload exhausted virtual-memory headroom even above the physical-only guard. Follow the documented memory/commit preflight and revise that guard before the next experiment. No secrets or private design/user data were used. These artifacts are not application code or proof of successful integration.
