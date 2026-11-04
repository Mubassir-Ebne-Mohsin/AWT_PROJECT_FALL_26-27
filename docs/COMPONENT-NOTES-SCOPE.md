# Component-anchored notes: scope and plan

**Written 2026-11-04. Status: APPROVED by the owner ("Approve and build", recommended choices: orphans kept and labelled, components only, migration accepted, no markers on shared canvases). BUILT and tested (items 1 to 6 of section 3); see the handoff entry "Component-anchored notes". The migration `1794600000000-NoteComponent` must be run on the owner's development database: `pnpm migration:run`.** No AI is involved. The owner chose this from the "more features" list on 2026-11-04. The faculty's document has not arrived; if it names a notes or annotation feature, this scope is amended to match.

## 1. What exists today
- **Notes (M15.3):** owner-only, plain text, 2,000 characters, at most 100 per design, kind `decision` or `assumption`, tied to a saved **revision** (`design_notes`: id, designId, revision, kind, text, createdAt, updatedAt). Server: `DesignNotesService` (create, list, patch with `expectedUpdatedAt`, delete; every write locks the design row). Web: a Notes tab (`notes-tab.tsx`). The report and the shared snapshot already carry notes (`noteScope` all, decisions, none).
- **Canvas:** nodes have stable ids (`localId`, letters, digits, `_`, `-`, up to 64 characters) that persist across revisions; the editor draws nodes in `graph-nodes.tsx` and shows a selected node's settings in `node-properties.tsx`.
- What is missing: a note cannot say **which component** it is about, so "why is the cache here?" lives in a list far from the cache.

## 2. The feature in one sentence
A note can be **pinned to a component**: the canvas shows a small count marker on that component, the component's panel lists and adds its notes, the Notes tab can filter by component, and the report and PDF say which component each note is about.

## 3. In scope (v1)
1. **Pin a note to a component** (optional; an unpinned note works exactly as today).
2. **Canvas marker:** a small badge with the number of notes on a component; click it to open that component's notes.
3. **Component panel:** a "Notes on this component" section (list, add, edit, delete) using the same note rules.
4. **Notes tab:** a filter (All, Unpinned, or one component) and the component's label on each pinned note.
5. **Orphans:** if a component is later deleted, its notes are **kept** and shown as "Component removed" (never silently deleted).
6. **Report, shared snapshot and PDF:** each pinned note names its component ("On App servers: ...").

## 4. Out of scope (declared)
Pinning to a connection (edge) or to a region; replies or threads (reviewer comments already exist elsewhere); markers in read-only shared or reviewer views of the canvas; moving a note to another component after creation (delete and write again, in v1); rich text, mentions, attachments; any AI.

## 5. Design decisions and rules (fixed before code)
**R1. Anchor = the component id, stored as an optional column `componentId` on `design_notes`.** Nothing else about notes changes; the 100-note limit and the revision rule stay.
**R2. Validation:** a pinned note is accepted only if that id is a component of the **note's revision graph**. For the current revision the server checks the design's graph; a note about an older revision whose version is no longer retained cannot be pinned (it stays unpinned). An unknown id is refused with a plain reason, never accepted silently.
**R3. Orphans are labelled, not deleted.** On read, the server compares each pinned note with the **current** graph and returns `component: { id, label } | null` and `componentRemoved: true|false`. A removed component's notes show "Component removed" and keep their text.
**R4. The anchor is immutable in v1.** `patch` may change text or kind, not the pin.
**R5. Counts on the canvas come from the same list** the tab uses, so the marker and the tab cannot disagree; the marker is a button with an accessible name ("3 notes on App servers"), never colour alone.
**R6. Privacy and sharing unchanged:** notes stay owner-only; a shared link carries notes exactly as its `noteScope` already allows; the pin adds only the component's label, which the snapshot already shows.
**R7. No figure is added or changed.** This feature records words; it never touches the simulation.

## 6. Technical plan
**Database:** one new migration adds `componentId varchar(64) NULL` to `design_notes`. **It must be run on your development database** (`pnpm migration:run`, as with the `ai` design-source migration earlier); the end-to-end suites run it on their own databases. The migration's `down` drops the column and refuses nothing (no data is lost for unpinned notes; pins are removed).
**Contract (additive):** `designNoteSchema` gains `componentId: localId.nullable()`, `component: { id, label } | null`, `componentRemoved: boolean`; `createNoteRequestSchema` gains optional `componentId`; the report's note gains `component: string | null` (the label). `phase3.openapi.json` and the web types are regenerated.
**Server:** `DesignNotesService.create` validates R2 inside the existing locked transaction; `list` attaches the component label and the orphan flag from the current graph (one graph read per list); `ReportService` adds the label for pinned notes at the note's revision where it can, else the current graph.
**Web:**
- `lib/notes-presentation.ts`: component label text, orphan text, filter logic, marker text.
- `components/canvas/graph-nodes.tsx`: the count marker (a button), fed by a notes-by-component count passed from the workspace.
- `components/canvas/node-properties.tsx`: the "Notes on this component" section (reuses the note form and rules from `notes-tab.tsx`, extracted into one shared component so the two cannot diverge).
- `components/workspace/notes-tab.tsx`: filter and component label.
- `components/report/report-document.tsx` and `lib/dossier/model.ts`: "On <component>:" prefix, covered by the existing PDF tests.
**Order of work:** (1) migration, contract, service with unit and end-to-end tests; (2) web library and the shared note form; (3) canvas marker and component panel; (4) Notes tab filter; (5) report and PDF wording; (6) browser tests, deliberate breaks, visual check of the canvas at three widths, regression, demo script line, handoff.

## 7. Test and verification plan
- **Server (e2e on real PostgreSQL):** create a pinned note; an unknown component id is refused (422, plain reason); a note without a pin works as before; a pin on a retained older revision is validated against that revision; deleting the component in a later revision keeps the note and flags `componentRemoved`; the 100-note limit counts pinned notes; patch cannot change the pin; another account cannot read or write notes of a design it does not own; the report and the shared snapshot carry the component label and no other new data; the leak-guard test of the report's key list is updated deliberately.
- **Unit (web):** marker text and counts; filters (All, Unpinned, one component, a removed one); the shared form enforces the same limits as before.
- **Browser (Chrome, real server):** add a note from a component's panel and see the marker count change on the canvas and in the Notes tab; click the marker to open the component's notes; delete the component and see "Component removed" with the text intact; keyboard use; no horizontal overflow at 320, 390 and 1024 px; the PDF's notes section names the component.
- **Deliberate breaks** (each must fail a test): skip the id validation, count unpinned notes in a marker, drop the orphan flag, let patch change the pin, omit the label in the report, hide the marker's accessible name.
- **Regression:** the existing notes, report, share, editor and canvas specs stay green.

## 8. Schedule and cut lines (written 4 November; the deadline is 8 November)
About one day: server and migration (about 3 hours), web (about 4 hours), tests, checks and visual review (about 2 hours). It competes with the acceptance run, the Evaluation update and the owner's rehearsal. **Cut order:** drop the Notes tab filter, then the PDF/report wording, then the orphan label (orphans would then simply read as unpinned), but never the validation (R2), the migration safety or the tests. Items 1 to 3 of section 3 are a complete, honest feature.

## 9. Questions for the owner
1. **Orphans:** keep a removed component's notes and label them (recommended), or delete them with the component?
2. **Pin target:** components only in v1 (recommended), or connections too?
3. **Migration:** is it acceptable that this adds one column that you run on your development database (`pnpm migration:run`)? Without that, the feature cannot work on your machine.
4. **Shared views:** keep markers off the read-only shared canvas (recommended), or show them there too?
5. **Faculty document:** has it arrived, and does it mention notes or annotations?

## 10. Definition of done
Items 1 to 6 of section 3 working in Chrome against the real server; every test in section 7 green and the breaks caught; the canvas looked at as screenshots at three widths and described in the handoff entry; the migration up and down tested on a real database; the demo script has one added step; the handoff entry says what is and is not covered; committed and pushed only on the owner's say.

## 11. What this feature does not claim
It does not analyse, summarise or judge the notes, and it changes no result. A note is the owner's own words, shown next to the thing it is about.
