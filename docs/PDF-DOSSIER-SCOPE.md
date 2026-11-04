# Design dossier (downloadable PDF): scope and plan

**Written 2026-11-04. Status: APPROVED by the owner ("Approve and build", with the recommended answers: browser `pdf-lib`, P0 first, Latin-only, owner-only). P0 and the notes tick-box are BUILT and tested; the ladder, fixes and what-if tick-boxes (items 9) are NOT built (see the handoff entry of 2026-11-04, "PDF dossier").** No AI is involved anywhere in this feature. It is a non-AI addition requested by the owner on 2026-11-04 ("downloadable pdf design with details"). The faculty's own document of required features has not arrived; if it names a report or export, this scope is amended to match it.

## 1. Why, and what already exists
- The **Report** page (`/designs/:id/report`, M16.1) already shows one chosen revision and one recorded result: summary and verdict, traffic, components with utilization, connections as a list, Limits search, notes, limitations. It has **"Print or save as PDF"**, which opens the browser's print dialog, and the route registry (`web/src/lib/routes.ts`) already promises "Charts, component table and the decisions log" and "**Download as PDF**".
- What is missing: a real downloadable **file**, the **architecture diagram** (the report lists connections as text), the **per-component properties**, and the project's own differentiators (the load ladder, the suggested fixes, the what-if), which the report does not carry.
- Because the report document is assembled by the server (`ReportService.assemble`, contract `report.schema.ts`) and is "pure display", the PDF can be made from exactly the same document, so it cannot disagree with the page.

## 2. The feature in one sentence
A **Download PDF** button on the Report page produces an A4 file, named after the design and revision, that contains the architecture diagram, the design's details, the recorded result against its targets and, if ticked, the load ladder, the suggested fixes and a what-if, all marked as model estimates.

## 3. In scope
**P0 (the first version; must ship):**
1. A "Download PDF" button beside the existing "Print or save as PDF" (print stays).
2. **Page 1, cover and summary:** design name, description, revision, "current revision" or not, the chosen recorded run and its date, the verdict and the headline figures (p50, p95, p99, error rate, throughput against the p95 target and the error budget), the limiting component, and a plain "Model estimate, not a measurement of real infrastructure" line.
3. **Architecture diagram** drawn as vector art from the graph's own node positions and edges, each component labelled, with its result status shown **as text and border style** (not colour alone, so it reads in grey-scale print).
4. **Details:** a table of components (type, region, the component's own properties such as copies, hit ratio or workers, peak load, utilization, status, errors); a connections table (from to); the traffic settings the design is saved with and the traffic the run was recorded at.
5. **Result:** the Limits search result if one exists, or the plain line that it was not run.
6. **Limitations** (the server's list, verbatim) and a **provenance footer** on every page: design id, revision, run id, engine version, generated date, page x of y.
7. Marking: a design whose source is `ai` carries "AI-drafted, reviewed and created by the owner"; a `scripted` one carries "Keyword-rules draft". No AI-written text is ever in the file (the report has none).

**P1 (only after P0 is verified; each is an independent tick-box):**
8. **Notes** (decisions and assumptions), as the owner's report already shows them.
9. **Load ladder** (2x, 5x, 10x), **Suggested fixes** (with before and after figures and the stated assumption) and a **What-if** (chosen change, two columns, no difference column), each fetched from the existing endpoints when ticked, for the same saved revision and run. A tick-box is disabled with a reason when the run is not current.

## 4. Out of scope (and why)
- PDF for a **shared-link visitor** (the share page already prints; adding it widens the leak surface the M16.2 design checks in one place). Possible later.
- **Unicode text beyond Latin** in v1 (see rule R3). Honest limitation, shown in the file when it applies.
- Charts of results over time, a cost estimate, branding or themes, letter-size paper, a table of contents, bookmarks, tagged-PDF accessibility (the web report remains the accessible version).
- Any change to the simulation, the report numbers or the existing Print path.
- Anything written by a model.

## 5. Design decisions
**D1. Where the PDF is made: in the browser, with `pdf-lib`.**
| Option | Pros | Cons |
|---|---|---|
| **A. Browser, `pdf-lib`** (recommended) | Pure JavaScript, no dependencies of its own, standard fonts built in, drawing primitives (rectangles, lines, text) are all this needs; the layout code is plain functions that run in Node tests; no server endpoint, no new load on the API | Adds one web dependency; layout is ours to write |
| B. Server, `pdfkit` | Same file for everyone; fits "server computes" | New endpoint to secure and rate-limit, heavier dependency, more to deploy |
| C. Improve print CSS only | No dependency | Still a dialog, no file name control, diagram only if the page draws it, cannot be tested as a file |
The owner decides (section 10, Q1). Everything below holds for A; B would move the same pure layout code to the API.

**D2. Draw the diagram from the graph, not from the screen.** The editor's canvas is DOM (`graph-canvas.tsx`); capturing it would depend on the browser and the zoom level. The graph already has `x`, `y`, a type, a label and edges for every node (`graphSchema`), so the diagram is drawn with rectangles, lines and arrowheads directly, scaled to the page. This also keeps it deterministic and testable.

**D3. One additive contract change:** `report.schema.ts` components gain `id` (the node id), because today a component is identified by label only and two components can share a label. The diagram needs to match a result to a node. Additive and optional-safe: older shared snapshots without it fall back to matching by label only when the label is unique, and otherwise draw the node with no status ("not matched"), stated in the file.

**D4. The extras (ladder, fixes, what-if) are not stored,** so they are fetched at export time through the existing endpoints (`/ladder`, `/fixes`, `/what-if`) with the same revision and run, exactly as the page does. Nothing new is computed by the PDF code. If a call fails or is busy, that section says "could not be calculated" and the rest still downloads.

**D5. File name:** `<design-name-slug>-rev<N>-report.pdf` (lower case, a-z 0-9 and hyphen, 60 characters at most). A name with no usable characters becomes `design`.

## 6. Rules declared before any code
**R1. The PDF adds no figure of its own.** Every number comes from the report document or from the three existing endpoints, formatted by the same helpers the page uses (`report-presentation.ts`, `result-presentation.ts`). A test compares the text in the file with the document.
**R2. Layout is a pure function** of (report, options): same input, same page contents, byte-for-byte except the generated-at line, which is passed in. No random, no clock inside.
**R3. Text encoding.** Standard Helvetica handles Latin text only. Any character the font cannot draw is replaced with `?`, and if any was replaced the footer of the affected page says "Some characters could not be shown." The replacement is counted and tested. (A Unicode font can be embedded later; it adds about half a megabyte.)
**R4. Nothing is cut silently.** Long text wraps; a table that does not fit continues on the next page with its header repeated; a long note is wrapped in full. A name longer than its box in the diagram is shortened with an ellipsis **in the diagram only**, and the full label appears in the component table.
**R5. The diagram scales, and says when it cannot be read.** It is fitted to the page width. If the scale would fall below 0.45 (so labels are under about 5 pt), the diagram gets its own **landscape** page at the largest scale that fits; if it still falls below 0.3, the page says "Too many components to draw legibly; see the tables." and the tables carry the details.
**R6. Status is never colour only.** Each node shows a text status ("fails 167%", "strained 83%", "ok 41%", "idle") and a border style (solid, dashed, double). The legend says so.
**R7. Honesty lines.** Page 1 says "Model estimate, not a measurement of real infrastructure". A run recorded for a different revision than the report's is stated plainly (the report already computes `matchesRevision`). A report with no recorded run says "No test run recorded" and shows no figures. Extras say which saved revision and run they used.
**R8. Owner only.** The button is on the owner's report page and uses the owner's session. No new public route. The `noteScope` is the owner's `all`; the tick-box can remove notes, never add more than the report holds.
**R9. Failure leaves the page usable.** If PDF generation throws, the page shows a plain message ("The PDF could not be made. You can still print this page.") and the Print button still works.

## 7. Technical plan
**Files (new unless noted):**
- `web/src/lib/dossier/model.ts`: builds the **document model** (an ordered list of pages, each a list of drawing operations: text, line, rectangle, arrow) from the report and the options. Pure; no PDF library imported.
- `web/src/lib/dossier/diagram.ts`: graph to drawing operations (scale, node boxes, edges with arrowheads, legend, status text), implementing R5 and R6.
- `web/src/lib/dossier/text.ts`: wrapping, WinAnsi encoding and counting of replaced characters (R3), measuring with the font's metrics.
- `web/src/lib/dossier/render.ts`: turns the model into bytes with `pdf-lib` (the only file that imports it); sets the document title, author "StressForge", subject and creation date.
- `web/src/lib/dossier/extras.ts`: fetches ladder, fixes and what-if for the chosen run (reusing `requestLadder`, `requestFixes`, `requestWhatIf`).
- `web/src/components/report/report-view.tsx` (edit): the Download button, the tick-boxes, the busy state and the error message.
- `nest-boilerplate/.../report.schema.ts` and `report.service.ts` (edit): additive component `id` (D3); contract and web types regenerated.
- `web/package.json`: add `pdf-lib` (one dependency, pinned).

**Page structure (A4, 595 x 842 pt, 40 pt margins, Helvetica 9 to 18 pt):**
1. Cover and summary. 2. Diagram (own page if R5 says so; otherwise below the summary). 3. Component table, connections, traffic. 4. Result and Limits. 5. (P1) Ladder, fixes, what-if. 6. (P1) Notes. 7. Limitations. Every page: header with the design name and a footer with provenance and page x of y.

**Order of work:**
1. Contract: component `id`; regenerate; update the report e2e and web types. (small)
2. `text.ts` and `model.ts` for the summary and tables, with unit tests. (medium)
3. `diagram.ts` with unit tests on the geometry (no overlap of node boxes is not promised; only containment in the page, scale rules, edge endpoints on box edges, status text). (medium)
4. `render.ts` and the button; a first real PDF, looked at by eye. (small)
5. Browser test of the download. (small)
6. P1 extras and notes, behind tick-boxes. (medium)
7. Full test run, visual review of PDFs for five templates and one large graph, handoff entry, demo script step. (small)

## 8. Test and verification plan
- **Unit (Node):** wrapping never loses a character; WinAnsi replacement is counted; filename slug rules; diagram scale rules (R5 at 0.45 and 0.3, one-node and 50-node graphs); every edge endpoint lies on its nodes' boxes; every number in the model equals the report document (a property test over the five templates' reports); the model is identical for identical input (R2).
- **File-level:** generate a PDF in a test, reload it with `pdf-lib` (it parses, page count as expected, title and subject set), and extract its text by decoding the page content streams, then assert the design name, verdict, p95 and every component label appear and that no `NaN`, `undefined` or `[object` appears.
- **Browser (Chrome, real server):** click Download on the Report page of a finished run; a non-empty file named `...-rev<N>-report.pdf` downloads; reading it back shows the design name and the p95 shown on the page; the Print button still opens print; with the PDF library forced to throw, the plain message appears and the page stays usable (R9); no console errors.
- **Deliberate breaks** (each must make a test fail): drop the status text, scale the diagram wrong, lose a component row, change a number's formatting, cut long text, ignore the `matchesRevision` line, leave the `?` count out.
- **Visual review by me and by you:** PDFs for the five templates, a 50-node graph, a failing run, a passing run, a design with no run, an AI-drafted design, and a name with non-Latin characters (R3). I look at them as images before calling it done; layout is where this kind of feature fails and tests alone cannot show it.
- **Regression:** the existing report, share, print and results specs stay green (the Print path is untouched).

## 9. Schedule and cut lines (written 4 November; the deadline is 8 November)
| When | Work |
|---|---|
| Owner's approval | Questions in section 10 answered |
| Day 1 (about 5 to 6 hours) | Steps 1 to 5: P0 working end to end with tests and a looked-at PDF |
| Day 2 (about 3 to 4 hours) | Step 6 (extras and notes) and step 7 (verification, handoff, demo-script line) |
This competes with the acceptance run, the Evaluation update and the owner's rehearsal. **Cut order if time runs short:** drop the extras tick-boxes (keep notes), then notes, then the landscape-diagram rule (use the "see the tables" line), but **never** cut the diagram, the details tables, R1, R3, R7 or the verification. P0 alone is a complete, honest feature.

## 10. Questions for the owner
1. **Approach:** A (browser, `pdf-lib`, recommended), B (server) or C (better print only)?
2. **Extras in the first version:** ladder, fixes and what-if as tick-boxes now, or P0 first and the extras only if time remains (recommended)?
3. **Language:** is Latin-only acceptable for the first version (design names and notes in Bengali would show as `?` with a note)? If Bengali is needed, add the font (about half a megabyte) to P0.
4. **Shared links:** keep the PDF owner-only (recommended) or also on the shared page?
5. **Faculty document:** has it arrived, and does it name a report or export?

## 11. Definition of done
P0 items 1 to 7 working in Chrome against the real server; every test in section 8 green; the deliberate breaks caught; PDFs for the listed cases looked at and described in the handoff entry; the Print path unchanged; the route registry text matches what the page does; the demo script has one added step; the handoff entry says what is and is not covered; committed by explicit path on the owner's say.

## 12. What this feature does not claim
It does not make the numbers more accurate, does not validate the model against real infrastructure (the Calibration tab covers that, narrowly), and does not use or need AI. A PDF of a failing design says it fails.
