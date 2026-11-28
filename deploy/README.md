# Hosted deployment scaffold

Status: H2 implementation is local and acceptance is incomplete. Do not treat this as public-launch approval. H3 account operations and H4 release/recovery gates still apply. See docs/HOSTING-HARDENING-PLAN.md and the latest H2 integration evidence.

## Topology

One Caddy HTTPS proxy serves one origin. /v1 stays on the API; other paths go to the standalone Next.js server. Only the proxy publishes ports 80/443. PostgreSQL and Redis use a separate internal network without host ports. The API can reach both networks. There is one active API instance: the simulator admission gate is not distributed. Do not use replicas, PM2 clustering or overlapping blue/green API instances.

API and web runtime images use UID 1000, a read-only root and dropped capabilities. The proxy also runs as UID 1000 on internal high ports. Redis uses append-only persistence with fsync on each write and no eviction, so revocations are not sacrificed to cache eviction. Its limit leaves space above maxmemory for persistence work. These limits are safety bounds, not proof of user capacity.

Postgres initializes three distinct credentials: the postgres bootstrap account, sf_migrator (database/schema owner without superuser or role-creation powers), and sf_app (DML/sequence access without schema creation). Runtime API containers receive only the application credential. The explicit migration job receives the migration credential. Neither performs automatic destructive resets.

## Configuration and first release

1. Choose a public DNS hostname and reserve a maintenance window. The current cookies need the same HTTPS origin for web and API. Do not split them across unrelated sites.
2. Copy deploy/environment.example to a private configuration file outside Git. Generate six independent random values for its password/signing-secret settings. Passwords need at least 24 characters and JWT secrets at least 32; use cryptographic randomness, not memorable examples. Never paste secrets into chat, screenshots or reports. Keep development and hosted credentials separate.
3. Set PUBLIC_HOST to the hostname without scheme/port/path, PUBLIC_ORIGIN to its canonical HTTPS origin without trailing slash, and the three image names to reviewed release tags. The frontend API origin is baked into the image: changing it requires rebuilding web. Record image IDs/digests with the reviewed source revision; the current dirty tree is not a release manifest.
4. Build, validate, start data services, explicitly migrate, then start the app. Run commands from the STRESSFORGE root. Example PowerShell sequence (replace the private path):

```powershell
$cfg = 'C:\private\stressforge-hosted.conf'
docker compose --env-file "$cfg" -f deploy/compose.yml -p stressforge-hosted config --quiet
docker compose --env-file "$cfg" -f deploy/compose.yml -p stressforge-hosted build api web proxy
docker compose --env-file "$cfg" -f deploy/compose.yml -p stressforge-hosted run --rm --no-deps validate
docker compose --env-file "$cfg" -f deploy/compose.yml -p stressforge-hosted up -d --wait postgres redis
docker compose --env-file "$cfg" -f deploy/compose.yml -p stressforge-hosted run --rm migrate
docker compose --env-file "$cfg" -f deploy/compose.yml -p stressforge-hosted up -d --wait api web proxy
```

Never print the expanded Compose configuration with real values: it contains credentials. Use config --quiet. This sequence is for a reviewed deployment, not authorization to run it against the owner's machine or data now. The legacy backend docker-compose.yml forwards to this definition; development remains docker-compose.dev.yml.

The hosted API refuses HTTP/mismatched/wildcard origins, an unexpected proxy-hop count, weak signing/cache/database credentials, unencrypted external database/cache connections, and pending migrations. Development behavior stays unchanged unless HOSTED_MODE is enabled. A nonempty PostgreSQL volume skips initialization scripts; editing configuration later does not rotate stored database passwords. Do not delete a real volume to solve an initialization error.

Caddy's public configuration uses automatic HTTPS. Actual DNS/firewall/ACME acceptance needs an owner-authorized deployment. The isolated harness substitutes an internal test CA and does not install it into the host trust store. It verifies TLS independently before allowing that CA exception in the browser fixture.

## Managed dependencies

For a managed PostgreSQL service, configure DB_TLS=true and, if required, mount its public CA file read-only and set DB_TLS_CA_FILE to the in-container path. Certificate and hostname verification remain enabled; there is no rejectUnauthorized=false switch. REDIS_TLS=true selects rediss for the Redis clients. Use normal certificate trust, or a deliberately configured public CA bundle. Do not disable Node TLS verification globally.

Private non-TLS transports are allowed only for the declared postgres/redis services with HOSTED_PRIVATE_NETWORK=true. Adapt and review Compose explicitly for managed services; never expose their ports publicly to make connectivity work.

## Sessions and recovery

The timestamp fix waits at most the normal remainder of a second after revocation instead of future-dating JWTs. It rechecks the account and cutoff after waiting. Excessive clock skew fails closed. Keep host/database clocks synchronized. Redis cutoff updates are atomic and monotonic in both value and remaining lifetime. Suspension and restore retain an access-token cutoff before removing a suspension block.

Use fresh signing keys for a hosted environment. Do not reuse prototype sessions. If Redis data is lost or restored to an older state, keep traffic stopped and rotate signing keys or use a reviewed global-session invalidation procedure; ordinary restart durability is different from recovering stale revocation data. AI, Google and GitHub sign-in remain off in this deployment definition. Their production activation/live acceptance is separate work.

Take a backup before a migration or release. Store operational backups encrypted outside the host with a defined retention policy. Rehearse restoration on a separate database and verify accounts, designs, recorded runs and migration versions. Do not assume every down migration is safe after a feature has data: inspect its refusal rules. An old image rollback is only safe with a compatible schema; otherwise restore the tested backup during maintenance. Never use rollbackAll on user data.

## Isolated verification

The integration harness creates a unique stressforge-h2-qa-* project, generated test credentials and loopback-only test ports (5552, 6392, 5014, 15443, 15080; a separate TLS fixture uses 5553). It removes only its own containers and volumes. Evidence contains statuses and synthetic-account screenshots, never private configuration or dumps. It does not target the owner's 3000/5001 or stressforge-dev services.

Use an adequately provisioned machine. Leave roughly 2 GiB of physical RAM free before the rehearsal; verification containers may use 2 GiB. Do not compile images and run it concurrently on an 8 GB laptop. Runtime limits are separate from build/test memory. Builds use frozen lockfiles, pinned toolchains and platform-local compiler output; host .tsbuildinfo files are excluded.

Build the verification target and three local test images first, then run the harness only after every build command exits successfully:

```powershell
docker build --target verification -t stressforge-h2-test:local nest-boilerplate/nest-boilerplate
docker build -t stressforge-h2-api:local nest-boilerplate/nest-boilerplate
docker build --build-arg NEXT_PUBLIC_API_URL=https://localhost:15443/v1 -t stressforge-h2-web:local web
docker build -t stressforge-h2-proxy:local deploy/caddy
node --test deploy/environment.test.cjs
node deploy/verify-hosting.cjs
```

The harness expects installed host pg/redis and Playwright dependencies plus Chrome. It covers configuration, role privileges, migration, rootless runtime, verified HTTPS, secure cookies/CSRF, suspension and restore, a real compiled simulation worker, forwarding-header spoof resistance, durable Redis restart, backup/restore and rollback/reapply, unchanged account/role HTTP tests, PostgreSQL certificate/hostname rejection, API restart and a real browser login. A written check is not a passed check: consult docs/audit/h2-2026-11-27/integration.json and the preserved per-attempt reports.

Primary references: https://caddyserver.com/docs/caddyfile/directives/reverse_proxy ; https://caddyserver.com/docs/caddyfile/options ; https://node-postgres.com/features/ssl .
