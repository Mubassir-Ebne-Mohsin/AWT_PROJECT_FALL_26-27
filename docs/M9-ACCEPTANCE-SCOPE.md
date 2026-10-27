# M9 — Phase 2 acceptance, reliability closure and documentation

**Date:** 2026-10-27 (Asia/Dhaka). **Status:** APPROVED; application acceptance PASS. Formal M9/Phase2 closure PARTIAL only for the historical benchmark-preservation decision. Final evidence is in progress-report section21.

## Purpose

Establish that Foundation and the complete Phase2 core loop work together, close demonstrated defects within that scope, and leave a reproducible, evidence-backed local release candidate. This is final acceptance of the existing features, with targeted reliability and usability fixes where the review finds problems. It does not add Phase3 features or certify production readiness.

Acceptance journey: **register/login → create → draw/connect/configure → save/reopen → Traffic → recorded Run/Results → live preview/Load overlay → saved Limits → manually improve/rerun → reopen the correct result → logout.**

Sources: [roadmap sections8–9](PHASE-2-PLAN.md), [living report](STRESSFORGE-PROGRESS-REPORT.md) including Foundation closure and M3–M8, [M8 guide](M8-LIVE-PREVIEW-LIMITS.md), [M8 evidence](audit/m8-verification.json), original Phase1 specification and prototype Sections6 and10–16. Read applicable repository instructions and current code before execution. Read selected prototype sections rather than loading the entire file.

## Starting evidence and rules

M8's historical report records backend176 unit/59e2e, frontend120 unit, and final Chrome220 production cases split into116+104 after its last application fix, plus Edge12 and dev4. These are prior results, not new M9 measurements or fixed minimum test counts. New relevant tests may change the totals. Current local checkpoint is88ec239 on codex/phase2-contracts; confirm this again at execution time.

- Preserve the unrelated modification docs/audit/m2-profile-source.json. Never stage, commit or revert it; check before every commit.
- Never read, print or copy .env values. Use documented examples and explicit disposable audit-process configuration, without exposing credentials or tokens.
- Leave normal services3000/5001 and stressforge-dev-* / sf-qa-p1-* containers and data alone. Use identity-checked, separately labelled audit services/databases on verified free ports.
- GateGuard stays enabled. Keep existing tests. If an existing assertion appears wrong, explain the specific contradiction and wait for user approval before changing it; M9 approval is not blanket permission to rewrite tests.
- Record every meaningful initial failed check and correction. For a corrected defect, show the focused regression failing before and passing after the fix where practical. Mutation checks must be controlled, restored and restricted to audit/test work.
- No push, merge, deployment, remote/global Git-setting change or Phase3 implementation without explicit user instruction. Local logical commits are allowed after verification.

## Required scope

### A. Requirements-to-evidence audit

Map every mandatory Phase2 requirement to inspected implementation, observed verification and status: verified, partial, missing or blocked. Distinguish actual features from placeholders and documentation promises. Review M1–M8 together: contracts/model, owned persistence, creation/dashboard, canvas/history/repair, Traffic/Results, Limits/preview/overlay and recovery.

Create a short prioritized findings list before implementing corrections. Close demonstrable in-scope correctness/security/reliability defects. Separate a weak test harness from an application defect; passing builds or existing milestones alone do not establish completion.

### B. Reliability investigation and bounded failure handling

**Post-Redis-recovery409:** reproduce with controlled timing and overlapping autosave/preview/recovery activity. Capture safe request ids, expected/current/submitted/acknowledged revisions, save ordering and remote-adoption events; never tokens or raw credentials. Test one tab and multiple tabs, edits/undo during an outstanding save, actual response loss and recovery refetches. Distinguish a legitimate conflicting revision from a duplicate/late write or a defect in acknowledgement handling. Fix only when evidence establishes the cause; add a focused regression.

Three clean M8 reruns did not establish a root cause. Use a bounded reproduction campaign, record its scenarios/attempts and keep an unreproduced observation labelled unresolved. If its residual risk materially prevents a reliable acceptance verdict, report the blocker and seek a decision; do not silently mark it fixed or search indefinitely.

**Slow dependency failure:** measure separate Redis/PostgreSQL connect, command/query, health and in-flight request behavior with actual outages. Inspect the effective clients and retry paths before configuring anything. Recommended target for approval: new dependency-bound API requests should produce a controlled unavailable response within5seconds during the isolated local audit; this is a test target, not a production SLA. State separately how already in-flight requests behave and their bounded deadline. Do not rely solely on the browser's request timeout to mask a hanging backend. Any necessary timeout/retry configuration must be documented and tested for healthy startup, transient recovery and normal operation.

Auth/session checks and throttling must fail closed on dependency failure without mislabelling the outage as wrong credentials, session expiry or a successful logout/revocation. Redis/PostgreSQL recovery must retain drafts and allow explicit retry. Preserve one pending durable job per owner, saved-job priority, bounded preview bookkeeping, cancellation, deletion, startup INTERRUPTED reconciliation, finalization recovery and request-id guarantees.

### C. Full integrated user acceptance

Exercise all four creation modes, all six templates and all12 component types. Cover arrows, reverse/delete/duplicate, grouped undo/redo, zoomed movement, graph repair and valid-but-unrunnable saved drafts. Verify every Traffic control, saved simulation Results, live preview, Load overlay and each Limits result state. Verify improvement/rerun, save/reopen and restart persistence.

Explicitly check simulation-versus-Limits selection in the workspace, dashboard and direct URLs. Preview must create no run rows. Recorded topology/targets/labels/metrics belong to the selected snapshot, while stale draft output stays visibly stale. Verify two-user ownership, two-tab changes, accepted-but-response-lost retries, unknown acceptance boundaries and no duplicate calculations/creation.

Do not broaden History/Compare/Report, Learn, settings, public sharing or other later-phase placeholders into features. They should remain honest, navigable placeholders with no misleading success actions.

### D. Prototype fidelity and practical accessibility

Compare the implemented dashboard, creation screens, Edit, Traffic, Results and Limits against the corresponding prototype sections. Check fonts, tokens, semantic colours versus cobalt accent, spacing, card/table geometry, arrows/flow labels, chart legibility, loading/error/stale states and light/dark appearance at1440 and1024 widths.

Include palette discoverability at1024: users must be able to identify the12 available component types and discover scrolling/controls. Improve missing labels, clipping or obstructed controls where demonstrated; retain the existing design language and scope. Snapshot-based results and honest backend progress need not reproduce the prototype's fake instantaneous calculations or scripted progress percentages.

Check keyboard-only completion, visible focus, labels, dialogs/drawers, connection/property alternatives, non-colour status text, chart data tables, reduced motion and horizontal overflow. Reuse available tooling. Record concrete limitations; a practical keyboard/contrast review is not a claim of formal assistive-technology certification.

### E. Foundation/security/model reassessment

Reassess affected Phase1 requirements: real JWT/roles/current-user/public behavior; register/login/me/refresh/logout, rotation/replay and two-tab sessions; credentialed CORS/OPTIONS; validation/errors; safe logging; health; /docs and /docs-json; seeding/migrations; theme, palette/help/state screens and protected return-to flows.

Review the current dependency audit and the reachability of previously triaged advisories using current primary advisory evidence. Apply scoped compatible fixes where justified, preserving lockfile/package-manager consistency and rerunning affected checks. Do not mass-upgrade frameworks or claim a clean security audit while advisories remain. Document residual risks and required follow-ups.

Recheck the six numerical parity fixtures and declared exceptions; zero/burst/overload/cache/replica/queue/region/branching cases; finite/unbounded serialization; Limits bracket/minimum/cap/headroom labels; and model versus measured-performance wording. This is verification, not formula redesign or calibration against real infrastructure.

### F. Reproducibility, bounded soak and final documentation

Run migrations and seed from scratch only in a fresh isolated database and verify documented Windows setup/run commands. Check Node22, existing pnpm versions, frozen lockfiles, boot-time validation, schema/type generation and source/compiled worker operation. Improve audit setup instructions so relevant checks are reproducible without relying on deleted temporary scripts or secret files.

Recommended bounded local soak: at least10minutes of realistic, limited-rate edits/previews and explicit calculations with more than one editor session. Record queue/worker state, released capacity, expired preview entries, run-row counts, errors and memory observations. Test retention using disposable aged fixtures/controlled test time, not normal data or a24-hour wait. Keep this distinct from long-duration load/storage-growth assurance; it cannot prove those properties.

Update README files, architecture/model/known-limit/test guides and the same living progress report. Add section21 with requirement mapping, findings, all final results, initial failures/fixes, Phase1 reassessment and a clear Phase2 verdict. Preserve earlier history. Include sanitized screenshots and verification JSON; restore earlier screenshots regenerated by this audit before committing. Review diffs and actual local/remote commit identities without publishing. Nothing updates automatically.

## Execution checkpoints

| Step | Work | Observable output |
| --- | --- | --- |
| M9.1 Inventory | Inspect instructions/Git/current code; map scope and historical evidence | Baseline SHA, protected-work inventory, requirements checklist and prioritized findings |
| M9.2 Reliability | Investigate409; bound dependency waits; prove cancellation/recovery guarantees | Reproduction logs, focused regressions and measured failure/recovery behavior |
| M9.3 User journey/fidelity | Exercise complete flows and compare implemented screens with prototype | Correctness/usability fixes with keyboard and width/theme evidence |
| M9.4 Foundation/security/model | Reassess auth/contracts/advisories/parity and fresh setup | Updated Foundation assessment and documented model/security limits |
| M9.5 Final gates | Rebuild final source; regression matrix, actual outages, restart, soak/retention | Exact commands/status/counts and verified environment/cleanup |
| M9.6 Acceptance packet | Update the same report and guides; commit verified work locally | Phase2 verdict, remaining risks, local SHAs and publication-ready review summary |

These are checkpoints within one proposed M9 scope. They are not work already performed or automatic approvals for later phases/publication.

## Verification gates

- Backend: pnpm build, pnpm typecheck, pnpm lint:check, pnpm test --runInBand with the existing opt-in real Redis coverage, pnpm test:e2e on a dedicated database, contract:phase2:check and fixtures:phase2. Zero lint errors; classify the22 inherited warnings rather than hiding them.
- Frontend: production build, typecheck, lint, unit tests, check:routes and live API-type equality; regenerate API types if mounted contracts change.
- Browser: all production Foundation/M3–M8 cases plus focused M9 cases on the final built source;1024/1440 light/dark. Edge scoped acceptance and separate next-dev state matrix. Do not add overlapping runs into a fictitious unique-test total. If a source change invalidates earlier evidence, repeat the affected coverage and the required final integration gates.
- Firefox/WebKit targeted smoke if available; otherwise explicitly record unverified support rather than silently treating Chrome+Edge as different rendering engines.
- Actual services: independently interrupt only identity-checked audit Postgres/Redis/API; include paused requests, saved-job restart/deletion and safe recovery. Verify healthy recovery before cleanup and retain audit data as appropriate.
- Fresh setup, bounded soak, retention and resource cleanup checks as above. Keep traces/storage-state exports off where they would persist auth material.

## Definition of done and verdict rules

M9 completes Phase2 for the stated **local course-project scope** only when all mandatory requirements have implementation and verification evidence; required final gates pass; no unresolved mandatory correctness/security/data-loss issue remains; and the report/guides accurately describe what can be run and what remains limited.

An unexplained409 is not automatically a defect or automatically safe. Its reproduction evidence, actual draft/revision behavior and residual risk must inform the verdict. Failed service deadlines or material unresolved recovery risks keep the relevant gate incomplete unless a concrete scope exception is explicitly accepted by the user. Unknown causes are never labelled resolved merely because reruns passed.

Publication is separate: M9 can produce a locally accepted release candidate and review packet while the report clearly says not pushed. Show exact verified commits and outstanding changes; push, merge or deployment requires the user's separate explicit instruction. Phase2 acceptance is not completion of the whole project: real AI remains an essential later course requirement.

## Out of scope

New AI integrations, new component types, numerical-model redesign, real infrastructure stress generation, version-history/Compare/Report/export, collaboration/public sharing, offline persistence, multi-instance/distributed execution, framework redesign, production hosting and unapproved publication. Avoid unrelated refactoring or cosmetic churn; fix demonstrated acceptance defects within the current scope.

## Recommendation

Approve M9 as an acceptance-and-closure milestone, with narrowly justified application fixes included. Prioritize recovery/revision integrity before visual refinements and final regression. The scope should end in a credible Phase2 verdict and reproducible local project, not merely a larger test count. The user subsequently approved execution with “Start M9”; publication remains separately unauthorized.
