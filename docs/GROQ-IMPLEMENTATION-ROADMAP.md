# Groq feasibility and implementation roadmap

Research date: 2026-10-29. Status: proposal, not provider implementation approval or model certification. No Groq requests, account setup or paid usage performed.

## Recommendation

Evaluate Groq as an optional hosted provider for M12B after completing M12A. Start with openai/gpt-oss-20b for explanations and compare openai/gpt-oss-120b on the same cases. Do not assume either passes domain reasoning. Retain Ollama as an explicitly selected alternative, with no silent cloud fallback. Cloud inference removes local model residency but introduces network, quota and external-data dependencies.

## Sources checked

- https://console.groq.com/docs/models — both GPT-OSS models listed as production, 131072-token context; model availability must be checked for the actual account.
- https://console.groq.com/docs/structured-outputs — both support strict JSON Schema, requiring required fields and additionalProperties:false. Streaming/tool use are not supported with this feature. Schema validity does not establish factual truth.
- https://console.groq.com/docs/rate-limits — published free limits for each candidate:30 RPM,1000 RPD,8000 TPM,200000 TPD. Limits are organization-wide; account settings are authoritative. Do not confuse large context windows with free throughput.
- https://console.groq.com/docs/your-data — inference content not retained by default; reliability/abuse exceptions can retain it up to30 days, with data controls. Usage metadata remains retained. Do not describe hosted requests as local/private-only.
- Local sources: PHASE-3-PLAN.md, M12-EXPLANATION-SCOPE.md, STRESSFORGE-PROGRESS-REPORT.md; ai.settings.ts, ollama.provider.ts, ai.service.ts and grounding.ts.

## Fit to operations (assessment, not observed model performance)

M12 explanations: strong interface fit. Send bounded authoritative facts; validate typed claims; display numerical facts separately from experimental prose.
M13 suggestions: plausible, unverified. Restrict patch operations and component IDs, preview differences, require user approval, enforce revision conflicts, rerun the deterministic engine. Never accept a claimed improvement as measured evidence.
M14 drafting: plausible for bounded graphs. Supply the actual component catalog/schema, reject invalid node/edge references and semantic topology, require preview before save. Large50-node/200-edge drafts are not certified and may exceed free token budgets.
Simulation/limits: remain deterministic backend operations. AI never replaces metric calculation, graph validation, ownership, roles or persistence. M15 history/notes/compare and M16 reports/shares remain ordinary app features; Groq does not complete those milestones.

## Ordered delivery

### G0 — Decision and free-account preflight

Confirm externally hosted inference is acceptable for the course's zero-cost requirement. User creates a Free account and stores GROQ_API_KEY only in backend .env; never paste/log it or expose NEXT_PUBLIC credentials. Verify actual model availability and limits, billing status and data controls. Do not enable paid upgrades, auto recharge or purchase credits. Account configuration is part of the zero-cost gate; code budgets alone cannot guarantee free billing.

### G1 — Complete provider-independent M12A

Finish typed-claim contract/predicate integration, legacy artifact compatibility, context/reload/idempotency recovery and controlled browser matrix. Existing helper predicates alone are not integration. Preserve drafts, account isolation, exact run/revision/fingerprint binding and inline optional errors. Preserve auth refresh/session expiry behavior. Build/lint/types/unit/e2e and browser evidence must pass before claiming completion.

### G2 — Provider abstraction and opt-in Groq transport

Inspect applicable repository instructions before choosing file layout. Replace direct Ollama coupling with a small injected provider interface and explicit disabled/ollama/groq configuration. Keep native fetch unless an SDK provides a demonstrated benefit; fixed HTTPS Groq origin, redirects rejected, request/response limits, deadline and server-held credentials. Use chat completions with strict JSON Schema, stream:false and no tools. Compile a compatible transport schema while keeping full application Zod and semantic validation. Reject refusals, missing/truncated content and unsupported claims.

Keep host RAM/commit guards and runner unload/idle checks specific to Ollama. Groq admission uses application quotas/concurrency and provider availability. Remote abort means stop accepting results locally, not proof of remote compute cancellation; never poll Ollama to release a Groq slot. Preserve durable jobs, owner checks, restart interruption, replay and retention. Do not automatically resend generation after an ambiguous transport failure.

Version provenance: provider, requested/returned model, prompt/schema versions, usage/latency, request ID if available. Cloud does not expose an Ollama model digest: represent unavailable identity explicitly, never fabricate one. Migrate/read old artifacts compatibly. Change local-only wording to Hosted by Groq and explain what leaves the machine. Keep simulation available during missing-key,401,429,5xx,timeout and network failures.

### G3 — Quota and recovery tests

Start with one active generation and a bounded queue/rejection policy. Enforce both per-user fairness and a shared application budget (Redis available), not just requests/minute. Bound input/output separately for explanation vs drafting; include any reasoning tokens in measured usage. Honor Retry-After and available rate-limit headers. No unbounded SDK retries or hidden repair generations. Explicitly recover the same application job/request identity without duplicate remote submissions. Test quota exhaustion, concurrent users, stale completion after cancel, cross-account access, secret redaction and restart recovery.

Illustration only:2500 counted tokens/request allows about3 requests/minute and80/day under8000 TPM/200000 TPD, before other traffic/retries. Real usage must be measured; this is not a service guarantee. Never use extra keys/accounts to bypass limits.

### G4 — M12B real-provider evaluation

Only after account/key setup and explicit hosted execution approval: run the eight established cases three times per model, sequentially and within quotas. Preserve every rejection/failure. Include healthy,strained,failed,no bottleneck,shared DB,stale/missing inputs and injection. Server rejects ineligible stale/missing jobs without provider calls; record those as application validation, not model reasoning.

Record acceptance rate, claim correctness, useful-answer rubric, total token usage, latency and core-app responsiveness. Proposed inherited gate:all accepted artifacts pass identity/schema/claim checks; at least90% useful responses and zero accepted critical fabricated metrics/bottlenecks or authentication-disabling claims; concise explanations within30 seconds as initial target. Do not silently extend targets or count rejection as usefulness. Select the smallest/fastest candidate that actually passes. No model quality certification from documentation or strict JSON alone.

### G5 — Later milestone integration

M13 and M14 retain separate approvals and acceptance suites. Use120B only if evaluation demonstrates value within quota. Test valid and invalid patches, revision races, approval/revert, rerun comparison, catalog-constrained drafts and topology validation. M17 retains24 fixed cases x3 generations and the integrated course demo; do not replace it with M12 tests.

## Verification and maintenance

Browser:1024/1440 light/dark plus390 mobile, keyboard and reduced motion; real login/saved run to controlled answer; disabled/missing-key/busy/outage/session-expired; lost acknowledgement/reload/cancel/restart; preserve unsaved changes. Add Groq live smoke only after controlled integration passes and explicit execution approval.

Update the same progress report, architecture, .env.example, setup guide, contracts and generated types. Preserve earlier milestone evidence, protected unstaged docs/audit/m2-profile-source.json, film/ and unrelated landing work. No broad staging, GitHub push or paid services under this research task.

Verdict: conditional GO for an opt-in prototype evaluation. Not a guarantee of perpetual zero-cost capacity, offline operation, large-class concurrency or correct model answers. M12A remains incomplete; no Groq model was tested in this research.

## Approved direction — 2026-10-29

User confirmed a single-operator showcase and authorized proceeding with Groq. Use GPT-OSS20B as the first explanation candidate, with120B only as a measured comparison. Keep Free plan, explicit generation, server-only credentials, bounded token use and inline quota errors. This approval permits hosted integration and evaluation with synthetic test evidence after credentials are available; it does not authorize paid upgrades or publication of private designs. The provider remains unimplemented at this checkpoint. M12A and real-model quality gates still apply. Key availability requested without asking the user to disclose its value.
