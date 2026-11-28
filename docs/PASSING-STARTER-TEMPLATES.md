# Passing starter templates

All six starter templates now pass at their supplied traffic with zero errors and max utilization below80%. Default rps changed only for three-tier1200→800, ingest1500→600 and checkout1400→600; topology, properties, targets, bursts and failure logic unchanged. Generated Examples data regenerated from the real engine; Templates verdict badges removed. Applies to new copies, not existing saved designs.

| Starter | Baseline rps | Burst | p95 ms | Max utilization |
| --- | ---: | ---: | ---: | ---: |
| Classic three-tier | 800 | 1.5 | 41.07 | 66.7% |
| Read-heavy content | 2000 | 1.5 | 45.74 | 44.0% |
| Write-heavy ingest | 600 | 1.3 | 42.21 | 51.0% |
| E-commerce checkout | 600 | 3 | 61.58 | 52.5% |
| Single-server MVP | 300 | 1.2 | 43.14 | 60.0% |
| Photo sharing | 800 | 1.5 | 60.17 | 32.5% |

Every row is a model estimate, not a hardware measurement. Target p95/error budgets were not relaxed. New copies still require Run test to create their own recorded run; the app never fabricates a completed run on creation. Increase traffic or change components to explore failures.

## Sources and verification

- Backend engine/templates.ts is the canonical starting configuration served by the API.
- web/src/lib/examples-data.json is regenerated using pnpm fixtures:examples, never hand-edited.
- Templates cards no longer display MISSES GOAL, MEETS GOAL or NEAR LIMIT. Examples/Results and load explorer remain truthful.
- 47 backend tests,15 web tests,14 controlled Chrome journeys, types/scoped lints/both builds pass.
- Historical reference simulation/path/timeline/limits parity remains intact. All six fail under20x overload; the original three-tier1200rps baseline also still fails.
- Browser copy/run transport uses fixtures from actual canonical offline calculations. Dedicated database/queue acceptance was not run, and the real authenticated template API was not read (anonymous GET returns401).
- Evidence: audit/passing-templates-2026-11-27/. Existing designs retain their saved settings; select a fresh template to use the safer defaults.

All changes local/uncommitted. No migration/dependency, live AI/provider call, owner-data write or push.

Additional final evidence: the updated existing guest Examples browser check passed (one additional unique journey,15 unique Chrome checks total). A test-only injected MISSES GOAL badge caused the no-badge assertion to fail as expected. The calculated browser fixtures are also saved in web/tests/fixtures/passing-template-runs.json so the suite has no dependency on optional audit files; frontend types passed after that import move.
