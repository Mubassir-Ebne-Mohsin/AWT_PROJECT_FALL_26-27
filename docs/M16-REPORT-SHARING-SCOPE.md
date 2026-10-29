# M16 Report and read-only sharing: scope and decisions

Status: **proposed 2026-10-29, awaiting the user's decisions.** Source: [Phase 3 plan, M16](PHASE-3-PLAN.md). Works with AI off; no AI surface.

## What gets built

| Slice | Delivers |
| --- | --- |
| M16.1 Report | `/designs/:id/report`: a printable report of one chosen revision and run. Graph, traffic, measured numbers, assumptions and decisions (notes), model limitations, and whether Limits was run. Print CSS and the browser's Save as PDF; no export engine. |
| M16.2 Share API | Owner issues and revokes a read-only snapshot link. Secret is high entropy and stored only as a hash. Public read returns a purpose-built safe DTO. |
| M16.3 Share settings and viewer | `/designs/:id/share` (create, revoke, last opened) and public `/share/:token` (read-only snapshot, no edit, run or AI). |

Each slice keeps the usual gates: e2e against the isolated database, mutation checks, browser journeys in 4 projects, full regression, commit by path, and the protected audit file never staged.

## Decisions needed

1. **Report content source.** Recommended: the owner picks one revision and one completed run (latest preselected); the report states that revision and run id, and says plainly when the run belongs to an earlier revision. Alternative: always the latest only.
2. **Which notes appear.** Recommended: in the owner's own report all notes for that design are listed; in a shared snapshot **no notes are included by default**, and the owner ticks "include decisions" to share Decision notes only (assumptions and others stay private). Alternative: never share notes.
3. **Link scope.** Recommended: two scopes, "design only" or "design plus report", fixed when the link is created (to change scope, revoke and create a new link).
4. **Snapshot meaning.** Recommended: a link freezes the chosen revision and run at creation time. Later owner edits never appear. Alternative: a live link (rejected in the plan).
5. **Expiry and count.** Recommended: optional expiry chosen at creation (7, 30 or 90 days, default 30), at most 5 active links per design, expired and revoked links answer the same "no longer available" page. Alternative: no expiry.
6. **Opened tracking.** Recommended: store only last-opened time and an open counter on the link. No visitor identity, IP or user agent.
7. **Copy to your account.** The placeholder promises it. Recommended: **not in M16**; the viewer is read-only and signed-out friendly. Copying would need a signed-in flow and ownership rules, so it is a later, separate approval.

## Security rules (not optional)

- Token: at least 256 bits from a CSPRNG, shown to the owner once, stored as a hash, compared in constant time.
- Public endpoint: no auth, strict rate limit, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`, token never logged.
- Safe DTO: no owner email, name or id, no credentials, no unrelated runs, no private notes. A leak test compares the DTO against an allow-list.
- Revocation and expiry are checked on every read. Another account cannot create, list or revoke someone else's links.
- Honest boundary text on the settings page: revoking stops new views but cannot recall copies already viewed or printed.

## Operator step

One additive migration (share links table). Run `pnpm migration:run`.
