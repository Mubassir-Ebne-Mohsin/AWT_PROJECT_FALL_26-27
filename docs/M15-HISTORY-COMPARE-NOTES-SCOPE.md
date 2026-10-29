# M15 plan: Designs, History, Notes and Compare

Prepared: 2026-10-29 (Asia/Dhaka) by Claude Code. Status: **proposed; awaiting implementation approval.** This document changes no application behaviour. It needs no AI, so it can proceed while the AI provider track waits for its key and quality gate. Outline source: [Phase 3 plan, M15](PHASE-3-PLAN.md).

## Goal

A user can open an owned design, see every saved version and recorded run, restore an earlier version safely, keep assumptions and decisions as notes tied to versions, and compare two versions only when the comparison is honest.

## Confirmed starting point (to be re-verified in Stage 1)

- M11 added immutable `design_versions` (one snapshot per saved revision, baseline for older designs) and `GET /designs/:id/versions` (owner-only, cursor pagination, limit 1-50). The latest 100 versions are kept, plus any version pinned by a retained AI job. There is no restore endpoint.
- Recorded runs and Limits searches are kept per design with the existing retention rules (retry guarantee, pruning after the first 50 terminal runs older than 24 hours). A run records its design revision and input fingerprint.
- The workspace shows placeholders for History and Notes (`web/src/lib/catalog.ts`); `/compare` and the Designs list exist only as registry routes.
- Revision conflicts (`expectedRevision`) and the "one pending durable job per owner" rule already protect saves and runs.

## Principles

- History is read-only evidence. Restore never edits or deletes an old version; it saves the old content as a **new** revision, subject to the normal revision-conflict check.
- Legacy baseline versions are labelled "imported current snapshot", never presented as reconstructed history.
- Compare shows deltas only for results computed from identical traffic and the same engine version. Otherwise it says why the pair is not comparable and offers an explicit rerun. It never subtracts incomparable numbers.
- Notes are the user's words. AI assumptions, when they exist later, are shown separately and are never silently promoted to a decision.
- Ownership is enforced on the API for every endpoint. Cross-account and foreign IDs return the existing 403/404 conventions without leaking metadata.

## Slices (each independently reviewable and gated)

| Slice | Deliverable | Backend | Frontend |
| --- | --- | --- | --- |
| M15.1 History | Timeline of versions and runs for a design, with explicit retention text, baseline label and pick-two-for-Compare | Reuse `GET /versions`; add a read-only merged listing of recorded runs by revision if the existing run listing cannot serve it | History tab: timeline, empty/loading/error states, pagination |
| M15.2 Restore | Restore a chosen version as a new revision | `POST /designs/:id/versions/:revision/restore` with `expectedRevision`; atomic with version insert; 409 on a stale revision | Confirm dialog showing what will change; unsaved-draft protection; conflict recovery |
| M15.3 Notes | Decision and assumption notes linked to a version | New `design_notes` table (owner-scoped, cascade with design), bounded length and count, create/edit/delete | Notes tab list and editor; text rendered as plain text |
| M15.4 Compare | Two versions (or runs) side by side | Read-only compare endpoint or client-side composition of existing reads; comparability decided on the server | `/compare`: topology and property diff, metric table with deltas only when comparable, clear incomparable state with rerun action |
| M15.5 Designs list | Owned search, sort, filters, duplicate, rename, archive | Archive flag (reversible); list filters; duplicate reuses creation rules | `/designs` page; designs with no result marked separately |

Suggested order: M15.1, M15.2, M15.3, M15.4, M15.5. Contracts and generated types come first for each slice.

## Decisions needed from the user before building

1. **Restore semantics:** new revision from the old snapshot (recommended), or something else?
2. **Compare scope:** versions of the same design only (simpler, recommended first), or also two different designs?
3. **Run choice in Compare:** use the latest completed run for each version, or require the user to pick runs? (Recommended: pick, with the latest preselected.)
4. **Notes limits:** proposed 2,000 characters per note and 100 notes per design.
5. **Archive:** hide from the default list and keep all evidence (recommended), never delete.
6. **Retention wording:** confirm showing "latest 100 versions kept" in the History tab.

## Test and acceptance matrix

- **API:** ownership and foreign-ID isolation for every endpoint; restore race and stale revision; version integrity (restore never mutates old rows); note limits and cascade on design deletion; archive and unarchive conflicts; pagination bounds; generated contract and live-type equality.
- **Compare correctness:** same-input pairs compare; different traffic, engine version or missing results are flagged incomparable with a reason; topology diff covers added, removed, changed and unchanged components and edges.
- **Frontend:** timeline for baseline-only, many versions and pruned history; unsaved-draft protection on restore; plain-text rendering of hostile note text; keyboard and focus; 1024/1440 light/dark and 390 px; no horizontal overflow.
- **Resilience:** restore and note saves with PostgreSQL/Redis interruption keep the draft and recover; session expiry during a restore.
- **Regression:** Phase 1 auth, Phase 2 save/run/preview/limits, M12 explanation flow.
- Mutation-check each new rule and record initial failures, as in M8.

## Out of scope

AI suggestions and drafting (M13/M14), reports and sharing (M16), role and permission work, real-time collaboration, offline storage.

## Risks

- Version pruning means very old revisions disappear; the UI must say so rather than imply full history.
- Restore plus unsaved edits is the riskiest interaction. It must never discard a draft silently.
- Comparing across engine versions is easy to get subtly wrong; the server, not the client, decides comparability.

## Recommendation

Approve M15.1 and M15.2 first (History and Restore), since the data foundation already exists. Notes, Compare and the Designs list follow once the decisions above are answered. No implementation has started.
