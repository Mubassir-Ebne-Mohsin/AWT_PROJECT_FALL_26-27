# Community gallery ("a feed for designs"): brainstorm, shaped scope and plan

**Written 2026-11-06. Status: F1 and F3 built 2026-11-09 (see HANDOFF-LOG); rest DRAFT for the owner's decisions.** No AI is involved. The owner's idea: a feed where people upload designs, anyone can see them, comment, and contribute to a design to fix it or improve it. The faculty extended the deadline, so this is sized by quality, not days. Read with [ROADMAP-NEXT-FEATURES.md](ROADMAP-NEXT-FEATURES.md) (order of work) and [SUPPORT-SYSTEM-SCOPE.md](SUPPORT-SYSTEM-SCOPE.md) (moderation reuses it).

## 1. The idea, taken apart

"Facebook for designs" bundles seven different things. Each has a different cost and risk, so they are separated before anything is promised.

| # | Piece | What it is | Verdict |
|---|---|---|---|
| 1 | **Publish** | An owner chooses to show one revision of a design (with its result) to others | **Keep (core)** |
| 2 | **Feed and browse** | A list of published designs, with filters | **Keep (core)**, simple and chronological |
| 3 | **View** | Anyone signed in opens a published design read-only: diagram, parameters, result, decisions | **Keep (core)**, reuses the share viewer |
| 4 | **Comment** | Plain-text discussion, optionally pinned to one component | **Keep**, reuses patterns from review comments and component-anchored notes |
| 5 | **Remix** | Copy a published design into your own account to experiment, with credit to the original | **Keep**, the safe way to "contribute" |
| 6 | **Suggest a change** | A contributor sends a proposed revision back to the owner, who reviews it and accepts or declines | **Keep, but later**, this is the real "contribute to fix it" and the largest piece |
| 7 | **Social extras** | Follows, a personalised or algorithmic feed, likes everywhere, direct messages, live co-editing | **Cut** (reasons in section 3) |

**The shape that makes it feasible:** nothing in a published post is ever live. A post is a **frozen snapshot of one revision**, exactly like the read-only share link already built (M16), so the owner's private design and everyone else's copies never interfere. People contribute by **copying (remix)** or by **proposing (suggestion)**, never by editing the owner's design. That removes the three hardest problems of a "shared editable design": conflicting edits, vandalism of someone's work, and access control on a living document.

## 2. What exists today that this builds on

- **Frozen snapshots:** `design_shares` with a frozen report, and the public read-only viewer (`/share/:token`). A post reuses that safe, allow-listed view of a design (no owner email, no unrelated runs, no private notes).
- **Versions and compare:** `design_versions` (immutable revisions), a compare view, `Duplicate` and `Restore`.
- **Verified fixes:** `POST /designs/:id/fixes` produces candidate changes that are checked against the model, so a suggestion can carry a **verified before-and-after** (for example p95 1,842 ms to 120 ms) computed by the server, not claimed by the contributor.
- **Component-anchored notes:** a note can be pinned to a component of the design, a ready-made model for pinned comments.
- **Roles and permissions:** one permission table, `@RequirePermission`, roles read from the database on every call, an append-only audit pattern, and the Support inbox for reports.
- **Not present:** any public listing of designs, any notification system (the bell is its own roadmap item and is a **prerequisite** here), any rating or reputation.

## 3. Brainstorm: ideas considered and why most are cut

**Kept for later phases (nice, cheap once the core exists):** tags and filters; "most remixed" and "newest" sorting; a "verified improvement" badge on a suggestion; a "contributors" strip on a post (people whose suggestions were accepted); a curated "Featured" shelf set by Support; one-click "remix this" from the examples page.

**Cut, with the reason:**
- **Live co-editing** (several people editing one design at once). Needs real-time sync, conflict handling and per-person permissions on a living document. Months of work and the biggest abuse surface. The suggestion flow gives the same outcome safely.
- **Direct edit access for others** ("contributors can change my design"). Rejected for the same reasons. The owner stays the only writer.
- **Follows, personalised feed, ranking algorithm.** Needs a lot of users to mean anything, and an empty personalised feed looks broken. A chronological feed with filters is honest and easy to verify.
- **Direct messages.** Moderation and abuse cost with no value over comments.
- **Images, file uploads, links that auto-open.** A post is only a graph, numbers and plain text. Nothing the server cannot validate is stored.
- **Reputation points and leaderboards.** Invite gaming. A plain "contributors" credit is enough.
- **Anonymous publishing.** Every post and comment belongs to an account, shown by display name only (never email), so reports and moderation work.

## 4. Scope

**Phase F1: Publish, feed, view**
1. **Publish:** from a design's header or the Report page, "Publish to the gallery". The owner picks a **revision** and the **result** to show (like the share link), writes a title (default: the design name) and a short plain-text description, may add tags from a closed list (derived from the design, as the examples page already does), and **ticks two statements**: that they own this design, and whether others may **remix** it (default yes, can choose view-only). Notes: decisions may be included by a tick-box, as in sharing; assumptions and private notes never.
2. **Gallery** (`/gallery`): newest first, cards showing the diagram thumbnail (the same vector drawing as the PDF), title, owner display name, verdict badge, tags, comment count, remix count. Filters: tag, verdict (passes, strained, fails), component type used, "mine". Search by title. Pagination by cursor.
3. **Post page** (`/gallery/:id`): read-only view (diagram, components and settings, traffic, result, decisions if included), the owner's description, the revision shown, and the controls for the later phases. **Unpublish** by the owner at any time. **Update:** publishing a newer revision adds it to the same post (the post shows a revision picker); old revisions stay readable.
4. **Rules of publishing:** a design must have at least one completed test run to be published (so the post is never an empty box); at most 5 posts per account per day and 25 active; plain text only; length limits; published content is the snapshot, never the live design.

**Phase F2: Comments and reactions**
5. **Comments** on a post: plain text, 2,000 characters, one level of replies, optionally **pinned to a component** of the shown revision (the marker appears on the diagram, as with component-anchored notes). Authors can edit within 10 minutes and delete their own. The post owner can hide a comment on their post (hidden, not erased, so moderation can still see it).
6. **"Useful"** reaction (one per person per post, no other reactions). It is the only popularity signal and it is never used for ranking.
7. **Report** button on every post and comment, which creates a Support report with the category "Community content" (reuses the Support inbox, rate limits and activity log).

**Phase F3: Remix**
8. **Remix:** one click copies the shown revision into the person's own account as a **new private design** (`source: "remix"`), with the original's title, a visible "Remixed from <title> by <name>" credit that stays in the design's history and on the report/PDF, and nothing else (no notes, no runs). It counts toward the post's remix number. The new design is entirely independent: later changes to or removal of the original do not affect it. Blocked when the owner chose view-only.

**Phase F4: Suggest a change** (the real "contribute")
9. From a remix, **"Suggest this change to the original"** sends a **proposal**: a frozen snapshot of the contributor's revision plus a message (what changed and why, plain text). Limits: 3 open proposals per person per post.
10. The server **runs both versions under the original's traffic** and attaches a **verified comparison** (verdict, p95, error rate, bottleneck before and after). The owner never has to trust a claim.
11. The owner sees **Suggestions** on their post (and in the bell): the diff (added, removed and changed components and settings, using the compare logic), the verified comparison, the contributor's message. Actions: **Accept** (creates a **new revision on the owner's design** from the proposal, with a "Based on a suggestion by <name>" credit, through the normal revision rules, so an unsaved or newer owner edit produces a clear conflict instead of an overwrite), **Decline** (with an optional plain reason shown to the contributor), or leave it open. Accepting adds the contributor to the post's **Contributors**.
12. A proposal is only ever **a snapshot with a message**. It can never change the owner's design by itself.

**Phase F5: Moderation, dashboards, polish**
13. **Moderation** by Support (a new permission `community.moderate` on the Support role only): remove or hide a post or comment, restore it, with a reason; every action in an append-only log with no foreign keys (like `support_activity`). Removal notifies the owner through the bell with the reason. Repeat offenders: a Support account can **suspend publishing** for an account (the account still signs in; the Admin Accounts page shows the state).
14. **Admin dashboard counts** (aggregate only): posts, comments, remixes, open suggestions, reports. No content.
15. **Seed data:** `pnpm demo:community` publishes the six template designs under a clearly named demo account and a few demo comments, so the gallery is never empty at the demo; `pnpm demo:community:clean` removes exactly those.

## 5. Out of scope (declared)
Live co-editing; direct edit access; follows or personalised ranking; direct messages; images, files and link previews; anonymous posts; reputation points; email notifications (the bell is in-app only); search engine indexing of the gallery; embedding a design on another website; paid or private groups; AI summaries or AI moderation; importing designs from outside StressForge.

## 6. Design decisions (recommendation first)
**D1. Signed-in viewers only in version 1 (recommended).** The gallery and every post need an account. It makes reports, rate limits and blocking work, and avoids exposing people's designs to the open web. A **signed-out read-only page** for a post (`/gallery/:id`, `noindex`, no comments) can be added later as a single switch. Alternative: public from day one, which the owner may prefer for the demo ("anyone can see"). If chosen, the same post page is served without login, comments stay sign-in-only, and the rate limits and `noindex` become mandatory.
**D2. A post is a frozen revision plus a result, never the live design (recommended, fixed).** Reasons in section 1.
**D3. Owner chooses remix or view-only per post (recommended).** Default allowed. A published design carries a plain licence line: "Others may copy and change this in their own account, with credit."
**D4. Chronological feed, filters, no ranking (recommended).** Alternative: "most remixed" as a second sort (cheap, allowed in F2).
**D5. Moderation is done by the Support role, not the Admin (recommended).** Admin never reads design content today; published content is public, but keeping one reviewer role avoids widening the Admin's powers. Admin sees counts only.
**D6. Display name only (recommended).** Never email. A person can change their display name; posts show the current name.
**D7. When an account is deleted (recommended):** its **posts and suggestions are removed** (it is the owner's content, as with their designs), its **comments are kept and anonymised** ("deleted account") so other people's replies still make sense, and **remixes other people already made stay** (they are their own designs) with the credit line reading "deleted account". Alternative: remove everything.
**D8. Block and mute are not in version 1.** Reports and moderation come first. A per-person "hide this person's posts" can follow.
**D9. The bell comes first.** Comments, replies, suggestions, accept or decline and moderation notices all need it; building the feed without notifications would make the owner poll their own posts.

## 7. Rules declared before code
**R1. Published means a snapshot.** The viewer reads only the frozen, allow-listed snapshot. A leak test compares the snapshot against an allow-list: no email, no user id, no private notes, no unrelated runs, no AI text, no tokens.
**R2. Nothing is published by accident.** Publishing needs a deliberate action with the two ticks; unpublishing is one click and immediate; a draft is never visible to anyone else.
**R3. Only the owner writes the owner's design.** Remix creates a copy; a suggestion is a snapshot with a message; acceptance goes through the normal revision and concurrency rules. There is no route by which another account changes a design.
**R4. Plain text everywhere**, bounded, control characters refused, stored verbatim and shown as text (tested with hostile text, as for Support).
**R5. Permissions in the one table.** `community.publish` is implicit for signed-in accounts that meet the publishing rules; `community.moderate` belongs to Support only; Admin gets neither and sees counts.
**R6. Limits on the server:** 5 posts a day, 25 active posts, 20 comments an hour, 3 open suggestions per post per person, 10 remixes an hour. A new account must have run at least one test before it can publish.
**R7. Every moderation action is logged** in an append-only table with no foreign keys.
**R8. Honest states:** empty gallery, no results for a filter, "this post was removed", "the owner chose view-only", "the design changed, review the conflict".
**R9. Verified numbers only:** a suggestion's before-and-after comes from the server's model run, never from the contributor.
**R10. No new power as a side effect:** publishing does not grant anyone access to the private design, its notes or its other revisions.

## 8. Technical plan

**Database (additive migrations, one per phase; the owner runs `pnpm migration:run`):**
- F1 `gallery_posts(id, owner_id, design_id, title, description, tags, remix_allowed, created_at, unpublished_at, removed_at, removed_reason)`, `gallery_revisions(post_id, revision, frozen_report jsonb, created_at)` (the snapshot, same allow-listed shape as a share), indexes on created_at and tags.
- F2 `gallery_comments(id, post_id, author_id, parent_id, component_id, body, created_at, edited_at, hidden_at)`, `gallery_useful(post_id, user_id)`.
- F3 design `source` gains `remix`; `design_remix_of(design_id, post_id, revision, credit_name)`.
- F4 `gallery_suggestions(id, post_id, base_revision, contributor_id, snapshot, message, status, verified jsonb, decided_at, decline_reason)`.
- F5 `community_activity` (append-only, no foreign keys), a publishing-suspension column or table.
- Foreign keys use ON DELETE SET NULL or CASCADE as in D7. Down migrations refuse when data would be lost, like Support.

**Contract (additive):** `gallery.schema.ts` (strict zod), added to `phase3.openapi.json`, web types regenerated. The snapshot type is shared with the share link so there is one allow-list.

**Server:** `modules/gallery/` (posts, comments, remix, suggestions, moderation services; controllers `/v1/gallery/...`), a verification step that reuses the simulation engine and `fixes` machinery, the rate limits, the permission additions, and the Support "Community content" category.

**Web:** `/gallery` and `/gallery/:id`; a **Publish** dialog; the remix button; the Suggestions panel with the diff; moderation views inside the Support inbox; the bell entries (from the notification feature); a shared thumbnail component reusing `web/src/lib/dossier/diagram.ts`. The route registry, navigation and Help gain entries.

## 9. Test and verification plan
- **Server e2e (real PostgreSQL):** publish rules (needs a run, ticks required, limits, hostile text stored verbatim); the snapshot leak test; unpublish and removal hide a post everywhere at once; a view-only post refuses remix; remix copies only what it should and keeps credit; **a contributor can never change an owner's design by any route**; a suggestion's verified comparison equals an independent engine run; accept creates exactly one new revision and handles a conflict; decline and expiry; comment permissions, edit window, hide, delete; Support-only moderation; Admin refused; account deletion per D7; every limit; the migration up, down and up on a database with data.
- **Unit (web):** filter and cursor logic, publish validation mirrors the server, diff presentation, thumbnails.
- **Chrome (real server, production build):** publish, find it in the feed, open it in a second browser, comment, pin a comment to a component, remix, edit the remix, suggest, review the diff and accept, see the credit; hostile text; report to Support and moderate; keyboard use; widths 320, 390, 1024 and 1440, light and dark.
- **Deliberate breaks** (each must fail a test): publish without a run, leak a private note into a snapshot, let a non-owner accept a suggestion, let remix ignore view-only, skip a rate limit, render a comment as HTML, let Admin moderate, let a suggestion carry a claimed (unverified) number.
- **Visual review:** screenshots of the gallery, a post, the publish dialog, comments, the suggestion diff and the moderation view, in every state, looked at before it is called done.

## 10. Phases and sequencing
**F1 → F2 → F3 → F4 → F5**, each independently verified and demoable. F1 to F3 together are a complete "gallery with discussion and remix" and the right first target. F4 is the largest and is built after the bell and after F3. If the scope must shrink, cut in this order: F5's extras, the "Useful" reaction, pinned comments, F4, and never R1 to R3 or the tests.

## 11. Questions for the owner (with my recommendation)
1. **Who can view:** signed-in only (recommended), or public without login from day one?
2. **Remix:** allowed by default with an opt-out per post (recommended)?
3. **Contribute:** is "remix, then suggest a change that the owner accepts or declines" the right meaning of "contribute to the design", or did you mean something closer to editing together?
4. **Moderation:** by the Support role (recommended), or a new Moderator role?
5. **Account deletion:** posts removed, comments anonymised, remixes kept (recommended)?
6. **Publishing bar:** must have run at least one test (recommended). Anything stricter for new accounts?
7. **Seed content:** may I publish the six template designs under a clearly named demo account so the gallery is never empty at the demo (recommended)?
8. **Name:** "Gallery", "Community" or something else?
9. **Faculty document:** has it arrived, and does it describe anything like this?

## 12. What this feature does not claim
It does not rank designs by quality, does not certify a design as correct (every result is a model estimate, as everywhere in StressForge), does not guarantee a response to a suggestion, and does not make a published design private again once someone has copied it (unpublishing stops new views and new remixes; it cannot recall copies).
