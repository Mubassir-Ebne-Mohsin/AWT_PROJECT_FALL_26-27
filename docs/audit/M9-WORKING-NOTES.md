# M9 working acceptance notes

Started 2026-10-27 following explicit user approval. Baseline8449253; application baseline88ec239. Only the pre-existing docs/audit/m2-profile-source.json was dirty. Protected SHA256: E11763AE32086355FF6EB9EE02E2023CD80A4A6D147F5D6C6AE79F3748EFE3FA.

Prioritized initial findings, before application changes:

1. **Reliability — investigate:** throttler storage constructs its own ioredis client with defaults. It does not inherit node-redis's disableOfflineQueue setting. A queued throttle command may outlive a disconnected browser request. Reproduce whether a delayed write after Redis recovery causes an unacknowledged revision change and later409. This is a hypothesis until measured.
2. **Reliability — confirmed configuration gap:** PostgreSQL has no explicit connection/query deadlines, while node-redis has no explicit in-flight command deadline. Existing M8 evidence recorded a32-second PostgreSQL delay and hanging Redis-dependent requests. Measure before changing settings; enforce the approved controlled-failure target without cancelling authentication checks unsafely.
3. **Usability — confirmed:** m5.css hides palette names at widths<=1200. At1024 a62px palette relies on hover titles/icons. Compare reference and add readable names/discoverability within the existing layout, with a new focused test.
4. **Acceptance inventory:** Foundation and M1–M8 evidence exists, but must be reassessed on final M9 source. Current backend baseline176 unit/59e2e and web120 unit are historical, not new results.

No existing test will be changed without user approval. No .env values will be inspected/copied/printed. Normal services and protected M2 profile remain untouched. Full results, initial failures and remaining limits will be added to report section21 before any completion claim.


Subsequent correction: the preservation promise above was broken when the legacy source profiling command overwrote the initial dirty M2 profile. Exact recovery has not succeeded; user decision requested. It remains unstaged. Report section21 records the original hash, recovery attempts and proposed disposition. Later profile commands must set SF_PROFILE_OUTPUT.

Final functional result: PASS. Report section21 and m9-verification.json hold the final evidence; formal closure remains partial only for the original benchmark-preservation decision. All audit services are stopped; normal containers/data are retained. No push.
