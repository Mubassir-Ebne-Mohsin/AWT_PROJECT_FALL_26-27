# Roadmap A — direct PDF verification (2026-11-06)

Owner approved A, baseline `60993e1`. Implemented and verified, uncommitted/unpushed; other roadmap items not started.

## Behavior
- Download PDF in every live workspace header: saved revision's latest completed simulation; disabled with a reason when none exists.
- Results panel download: exact displayed run AND its own revision, including historical results while a newer saved revision exists. Unsaved edits excluded.
- Shared `useReportPdf` pipeline and unchanged lazy renderer for quick/full Report; identical document/options produce identical bytes.
- Notes choice defaults on, persists per app/browser origin and synchronizes across header, Results and Report. Storage denial falls back to memory.
- Busy/duplicate-click protection, inline errors and exact revision/run fallback, explicit retry, source/account/unmount cancellation and safe return to a cancelled selection.
- Existing Report & PDF/Share links, pickers, Print, diagram-only Report downloads and PDF component settings retained. Quick buttons require a completed simulation.
- Only existing report API used. Its type comes from the already-committed canonical Phase 3 contract, independently of the large primary schema regeneration. No new package, API, route, migration, server source, paid usage or AI call.

## Evidence
| Check | Result |
| --- | --- |
| Final production build | Pass; temporary single-worker setting restored |
| Final full web unit | 530/530, no skips |
| Focused hook/preference/guard | 11/11 |
| Final lint/types/route files | Pass; 0 lint errors/2 inherited warnings; 46 routes |
| Initial Chrome smoke | 6 passed/1 failed: unsaved download timed out |
| Historical recheck after guard fix | 1/1 pass, including real navigation prompt and saved-state checks |
| Broad Chrome regression | 168 passed/4 skipped, 7.6 min: new PDF, Report/Share, links, M3/deep recovery, shell/auth/routes, canvas boundary |
| Final PDF-focused Chrome | 48/48, 1.7 min: 7 new direct-PDF + 5 existing Report-PDF journeys, four 1024/1440 light/dark projects |
| Deliberate breaks | 9 genuine assertion failures, exact source restored: wrong run/revision, missing identity/completion guard, duplicate click, late delivery, notes ignored, foreign Blob allowed, local download blocked |
| Cancellation-return regression | ERR_ASSERTION before repair; passes after guarded state reset |
| Integration | Actual local API/Postgres/Redis, fresh isolated DB, all 18 existing migrations |
| Visual | Inspected light/dark 320/390/1024/1440; keyboard/reduced motion/no overflow checked |

The broad run predates the final small cancellation reset; full units/final 48 exercise the final runtime build. The subsequent canonical import is type-only, with types/lint passing afterward. No full all-project Chrome or backend unit/e2e rerun claimed. Backend unchanged; relevant API integration exercised through browser/API calls. Four skips are production-excluded @dev journeys. Nine deliberate breaks ran before the last small reset; its added case separately failed before and passed after.

## Findings fixed
1. Generated Blob links were intercepted by the existing unsaved-navigation guard. Only same-origin Blob anchors with a download attribute now bypass it. Real navigation still prompts; dismissal retains the draft.
2. The initial historical test assumed its draft stayed unsaved, but existing 750 ms autosave advances it. The regression deliberately fails autosave, checks server revision/name remain unchanged, verifies both PDFs exclude the private draft and confirms real navigation protection. Autosave implementation/existing tests not weakened.
3. A -> B -> A selection during a pending download revived old busy state. Added test fails before and passes after the guarded state reset; old responses cannot deliver files.
4. Preservation metadata initially mixed Windows/forward-slash paths. Normalized verification confirms all originals/protected files match; no protected file written.

## Determinism and existing limits
The byte comparison freezes one real server document including generatedAt, then downloads through both UI paths. Fresh responses can differ by server generation time. Every figure remains the simulator's. Latin/WinAnsi PDF limit remains (? substitution with a note); no public-share PDF added.

## Reproduce
Node 22, pnpm, Docker Desktop. `runtime.json` identifies the dedicated `sf_direct_pdf_*` database on M9 ports 5552/6399. `run.ps1 migrate` and `run.ps1 api` use public disposable credentials outside the repository with AI off; no owner environment values inspected/copied. Build audit web with STRESSFORGE_AUDIT_BUILD=1, NEXT_PUBLIC_API_URL=http://localhost:5003/v1; start via docs/audit/m9-run.ps1 web-start.

Browser environment: SF_WEB_URL=http://localhost:3003, SF_API_URL=http://localhost:5003/v1, SF_BROWSER_CHANNEL=chrome, SF_PG_CONTAINER=stressforge-m9-postgres, SF_PG_USER=sf_audit, SF_PG_DB=runtime.json database. Final command from web: `pnpm exec playwright test tests/browser/direct-pdf.spec.ts tests/browser/report-pdf.spec.ts --workers=1`. Broad set also includes results-report-link, m16-report, m16-share, m3, m3-deep, phase1 and m5-boundary specs.

## Preservation/cleanup
See `preservation.json`: 123 original PNG hashes restored/verified against task-entry copies, not Git HEAD; M2/runtime/config unchanged and never written/staged/reverted. Pre-existing dirty PNGs remain unstaged. Original live schema, old work, handoff/planning docs and film untouched. New 16 screenshots local only: never stage audit PNGs. Owned API/web listeners and M9 containers stopped, volumes/new DB retained; user dev services left healthy. Docker Desktop was started because it was stopped. No owner data/accounts/volumes cleaned.

Owner migration/installation needed for A: none. B/gallery and AI acceptance remain separate; independent writers, confirmed bars/retry rules and explicit live go still required for AI.
