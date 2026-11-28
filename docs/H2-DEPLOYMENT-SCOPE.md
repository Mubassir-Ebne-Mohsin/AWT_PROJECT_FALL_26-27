# H2 deployment and durable-session acceptance

Approved 27 November 2026. Before code changes, register these adversarial checks:

1. Same-second login after a session cutoff must never mint a future-dated JWT; a second cutoff must reject the earlier refresh token.
2. Suspension followed by restore must not revive an earlier access token. A new login must work. Preserve the existing admin-status tests unchanged.
3. Cutoff storage must be monotonic under delayed/concurrent writes and retain its lifetime. Verify the atomic operation against real isolated Redis, including restart with durable storage.
4. Build the real API/frontend images with frozen lockfiles and pinned package-manager versions. Runtime must be non-root, no credentials in build context, and health must use /v1/health. No replica rollout while admission is single-instance.
5. Validate HTTPS origin/proxy configuration before hosted API start; reject unknown/HTTP/wildcard origins and inconsistent frontend/API build URLs. Preserve local development paths.
6. TLS-enabled PostgreSQL must validate its CA/hostname; reject bad CA rather than silently downgrading. Local private Docker Postgres can explicitly use non-TLS.
7. Validate the reverse proxy and run a disposable migration, API health/auth and backup/restore rehearsal. Never point this exercise at owner data.

No real deployment, domain purchase, owner migration, secret changes, live OAuth or AI call is authorized. Actual public DNS/ACME/live provider acceptance remains owner-dependent; use controlled local fixtures where possible and mark remaining gaps honestly.
