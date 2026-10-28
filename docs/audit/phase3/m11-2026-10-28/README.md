# M11 verification evidence

Date:2026-10-28 (Asia/Dhaka). [Implementation guide](../../../M11-AI-FOUNDATION.md).

- verification.json: final build/test/type/health/preservation summary.
- development-migration.json: additive migration names, before/after aggregate design count/digest, baseline/job counts. No user identifiers, content or credentials recorded.
- compose.yml: disposable M11 Postgres only, bound to127.0.0.1:5553. Stopped after tests; named volume retained.
- run.ps1: explicit disposable configuration and fresh timestamped test DB; temp cwd without .env. Uses Node22 on PATH or the verified task-local fallback. Integration generations use a test-owned mock HTTP server, never Ollama's actual port.
- Ignored local logs: unit-final.log (201 pass/2 existing skips), e2e-full-final.log (76 pass). The two skip cases require opt-in Redis-compose testing; they are not reported as passing.

17 M11 integration cases include migration upgrade/backfill/rollback/re-upgrade, owner/cursor/conflict controls, durable lifecycle/provenance, held capacity after cancel, provider/digest faults, memory gates, expiry, restart and snapshot pinning. Unit coverage additionally checks bounded telemetry concurrency. Actual GPU/model quality is not re-certified by mock HTTP tests. No inferred measurements replace M10 evidence.

Primary API types were regenerated from the actual development /docs-json and checked byte-stable. Canonical standalone contract is docs/contracts/phase3.openapi.json; full isolated runtime export is docs/contracts/m11-runtime.openapi.json. These describe endpoints, not a newly implemented AI frontend.
