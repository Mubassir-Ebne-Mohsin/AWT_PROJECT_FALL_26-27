# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: direct-pdf.spec.ts >> an older selected run downloads its own revision, while the header uses the saved latest result and excludes drafts
- Location: tests\browser\direct-pdf.spec.ts:74:5

# Error details

```
TimeoutError: page.waitForEvent: Timeout 15000ms exceeded while waiting for event "download"
=========================== logs ===========================
waiting for event "download"
============================================================
```

# Page snapshot

```yaml
- generic [active] [ref=f3e1]:
  - link "Skip to content" [ref=f3e2] [cursor=pointer]:
    - /url: "#main"
  - generic [ref=f3e3]:
    - generic [ref=f3e4]:
      - banner [ref=f3e5]:
        - link "ArchitectureStress Test" [ref=f3e6] [cursor=pointer]:
          - /url: /dashboard
        - navigation "Main" [ref=f3e12]:
          - link "Dashboard" [ref=f3e13] [cursor=pointer]:
            - /url: /dashboard
          - link "Designs" [ref=f3e14] [cursor=pointer]:
            - /url: /designs
          - link "Templates" [ref=f3e15] [cursor=pointer]:
            - /url: /templates
          - link "Learn" [ref=f3e16] [cursor=pointer]:
            - /url: /learn
          - link "Challenges" [ref=f3e17] [cursor=pointer]:
            - /url: /challenges
          - link "Evaluation" [ref=f3e18] [cursor=pointer]:
            - /url: /evaluation/simulator
        - generic [ref=f3e19]:
          - button "Search and jump to a screen (Ctrl+K)" [ref=f3e20] [cursor=pointer]:
            - generic [ref=f3e24]: Jump to…
            - generic [ref=f3e25]: Ctrl K
          - link "New design" [ref=f3e26] [cursor=pointer]:
            - /url: /new
          - button "AI assistant" [ref=f3e29] [cursor=pointer]
          - button "Help for this screen" [ref=f3e33] [cursor=pointer]
          - button "Report a problem" [ref=f3e37] [cursor=pointer]
          - combobox "Color theme" [ref=f3e40] [cursor=pointer]:
            - option "Light"
            - option "Dark"
            - option "System" [selected]
          - button "Account menu" [ref=f3e42] [cursor=pointer]: DP
      - main [ref=f3e43]:
        - generic [ref=f3e44]:
          - generic [ref=f3e45]:
            - heading "Results" [level=1] [ref=f3e46]
            - navigation "Breadcrumb" [ref=f3e47]:
              - link "Dashboard" [ref=f3e49] [cursor=pointer]:
                - /url: /dashboard
              - link "Designs" [ref=f3e53] [cursor=pointer]:
                - /url: /designs
              - link "50749c07-d217-43c4-ac80-0705407c7551" [ref=f3e57] [cursor=pointer]:
                - /url: /designs/50749c07-d217-43c4-ac80-0705407c7551/edit
              - generic [ref=f3e58]: Results
            - generic [ref=f3e62]:
              - generic [ref=f3e63]:
                - generic [ref=f3e64]: Design name
                - textbox "Design name" [ref=f3e65]: PRIVATE UNSAVED DRAFT TITLE
                - status [ref=f3e66]: Saved · revision 3
              - generic [ref=f3e67]:
                - button "Save" [disabled] [ref=f3e68]
                - button "Check graph" [ref=f3e69] [cursor=pointer]
                - button "Run test" [ref=f3e70] [cursor=pointer]
                - generic [ref=f3e71]:
                  - generic [ref=f3e72]:
                    - button "Download PDF" [disabled] [ref=f3e73]
                    - generic [ref=f3e74]:
                      - checkbox "Include decisions and assumptions" [checked] [ref=f3e75]
                      - text: Include decisions and assumptions
                  - generic [ref=f3e76]: Saved revision 3, latest completed result. Run a simulation for this saved revision first.
                - link "Report & PDF" [ref=f3e77] [cursor=pointer]:
                  - /url: /designs/50749c07-d217-43c4-ac80-0705407c7551/report
                - link "Share" [ref=f3e78] [cursor=pointer]:
                  - /url: /designs/50749c07-d217-43c4-ac80-0705407c7551/share
                - button "Delete" [ref=f3e79] [cursor=pointer]
            - navigation "Design workspace" [ref=f3e80]:
              - link "Edit" [ref=f3e81] [cursor=pointer]:
                - /url: /designs/50749c07-d217-43c4-ac80-0705407c7551/edit?run=f35bd050-7b4d-454b-a23b-9d657b534efa
              - link "Traffic" [ref=f3e82] [cursor=pointer]:
                - /url: /designs/50749c07-d217-43c4-ac80-0705407c7551/traffic?run=f35bd050-7b4d-454b-a23b-9d657b534efa
              - link "Results" [ref=f3e83] [cursor=pointer]:
                - /url: /designs/50749c07-d217-43c4-ac80-0705407c7551/results?run=f35bd050-7b4d-454b-a23b-9d657b534efa
              - link "Limits" [ref=f3e84] [cursor=pointer]:
                - /url: /designs/50749c07-d217-43c4-ac80-0705407c7551/limits?run=f35bd050-7b4d-454b-a23b-9d657b534efa
              - link "Improve Later" [ref=f3e85] [cursor=pointer]:
                - /url: /designs/50749c07-d217-43c4-ac80-0705407c7551/improve?run=f35bd050-7b4d-454b-a23b-9d657b534efa
                - text: Improve
                - generic [ref=f3e86]: Later
              - link "History" [ref=f3e87] [cursor=pointer]:
                - /url: /designs/50749c07-d217-43c4-ac80-0705407c7551/history?run=f35bd050-7b4d-454b-a23b-9d657b534efa
              - link "Notes" [ref=f3e88] [cursor=pointer]:
                - /url: /designs/50749c07-d217-43c4-ac80-0705407c7551/notes?run=f35bd050-7b4d-454b-a23b-9d657b534efa
          - generic [ref=f3e89]:
            - paragraph [ref=f3e90]: Use Check graph to see problems and repair steps before running.
            - group [ref=f3e91]:
              - generic "Design description and assumptions" [ref=f3e92]
            - region "Recorded model results" [ref=f3e93]:
              - status [ref=f3e94]: Stale result — inputs changed. Run again after saving. All numbers below still describe the recorded snapshot.
              - generic [ref=f3e95]:
                - heading "Model results" [level=2] [ref=f3e96]
                - generic [ref=f3e97]: pass
              - generic [ref=f3e99]:
                - heading "Passes comfortably" [level=3] [ref=f3e100]
                - list [ref=f3e101]:
                  - listitem [ref=f3e102]: The recorded run meets its latency and error targets with utilization below the warning threshold.
              - generic [ref=f3e103]:
                - generic [ref=f3e104]:
                  - text: p50 latency
                  - generic [ref=f3e105]: 27.41 ms
                  - generic [ref=f3e106]: Half of requests are faster
                - generic [ref=f3e107]:
                  - text: p95 latency
                  - generic [ref=f3e108]: 43.14 ms
                  - generic [ref=f3e109]: Target 300 ms
                - generic [ref=f3e110]:
                  - text: p99 latency
                  - generic [ref=f3e111]: 52.06 ms
                  - generic [ref=f3e112]: One in 100 is slower
                - generic [ref=f3e113]:
                  - text: Errors
                  - generic [ref=f3e114]: 0%
                  - generic [ref=f3e115]: Budget 1%
                - generic [ref=f3e116]:
                  - text: Served
                  - generic [ref=f3e117]: 300 rps
                  - generic [ref=f3e118]: Of 300 average rps
                - generic [ref=f3e119]:
                  - text: Bottleneck
                  - generic [ref=f3e120]: App servers
                  - generic [ref=f3e121]: 60% utilization
              - paragraph [ref=f3e122]: Mathematical estimates, not measured infrastructure performance. Revision 1 · reference-port-v1 · 11/6/2026, 11:50:16 AM
              - group [ref=f3e123]:
                - generic "Tested inputs and fingerprint" [ref=f3e124]
              - generic [ref=f3e125]:
                - generic [ref=f3e126]:
                  - generic [ref=f3e127]:
                    - generic [ref=f3e128]:
                      - heading "Topology under load" [level=3] [ref=f3e129]
                      - generic [ref=f3e130]: Revision 1 snapshot
                    - generic [ref=f3e132]:
                      - generic [ref=f3e133]:
                        - 'group "Recorded topology under load: components are selectable" [ref=f3e134]':
                          - 'button "Connection: Users to App servers, modeled flow 360/s"'
                          - 'button "Connection: App servers to Database, modeled flow 360/s"'
                          - button "Users, client" [ref=f3e135] [cursor=pointer]:
                            - generic [ref=f3e144]: Users
                            - generic [ref=f3e145]: client · us-east
                          - button "App servers, app, modeled utilization 60%, healthy" [pressed] [ref=f3e146] [cursor=pointer]:
                            - generic [ref=f3e155]: App servers
                            - generic [ref=f3e156]: 60% · 360/s
                          - button "Database, db, modeled utilization 20%, healthy" [ref=f3e159] [cursor=pointer]:
                            - generic [ref=f3e167]: Database
                            - generic [ref=f3e168]: 20% · 360/s
                          - generic [aria-hidden]:
                            - generic: 360/s
                            - generic: 360/s
                        - generic "Load legend" [ref=f3e171]:
                          - generic [ref=f3e172]: healthy below 75%
                          - generic [ref=f3e174]: strained 75–under 100%
                          - generic [ref=f3e176]: failing at or above 100%
                      - paragraph [ref=f3e178]: Saved snapshot of this run. Edge widths show modeled request flow, not observed packets. Select a component to inspect its recorded metrics.
                  - generic [ref=f3e179]:
                    - heading "Test timeline" [level=3] [ref=f3e181]
                    - generic [ref=f3e183]:
                      - img "Recorded p95 latency and request rate; illustrative sampled timeline" [ref=f3e184]:
                        - generic [ref=f3e185]:
                          - generic [ref=f3e186]: "0"
                          - generic [ref=f3e187]: "0"
                          - generic [ref=f3e188]: 0 min
                        - generic [ref=f3e189]:
                          - generic [ref=f3e190]: "102.4"
                          - generic [ref=f3e191]: "98"
                          - generic [ref=f3e192]: 2.5 min
                        - generic [ref=f3e193]:
                          - generic [ref=f3e194]: "204.8"
                          - generic [ref=f3e195]: "197"
                          - generic [ref=f3e196]: 5 min
                        - generic [ref=f3e197]:
                          - generic [ref=f3e198]: "307.1"
                          - generic [ref=f3e199]: "295"
                          - generic [ref=f3e200]: 7.5 min
                        - generic [ref=f3e201]:
                          - generic [ref=f3e202]: "409.5"
                          - generic [ref=f3e203]: "393"
                          - generic [ref=f3e204]: 10 min
                        - generic [ref=f3e205]: Latency (ms)
                        - generic [ref=f3e206]: Traffic (rps)
                        - generic [ref=f3e209]: target 300 ms
                      - generic [ref=f3e210]:
                        - generic [ref=f3e211]: p95
                        - generic [ref=f3e213]: requests/s
                        - generic [ref=f3e215]: target
                      - paragraph [ref=f3e217]: Illustrative sampled timeline from this recorded run. Independent modeled samples; not measured infrastructure performance.
                      - group [ref=f3e218]:
                        - generic "Read timeline data" [ref=f3e219]
                  - generic [ref=f3e220]:
                    - generic [ref=f3e221]:
                      - heading "Components under load" [level=3] [ref=f3e222]
                      - generic [ref=f3e223]: Sorted by utilization
                    - table [ref=f3e225]:
                      - caption [ref=f3e226]: Recorded component metrics; choose a component to inspect it
                      - rowgroup [ref=f3e227]:
                        - row [ref=f3e228]:
                          - columnheader "Component" [ref=f3e229]
                          - columnheader "Peak load" [ref=f3e230]
                          - columnheader "Capacity" [ref=f3e231]
                          - columnheader "Utilization" [ref=f3e232]
                          - columnheader "Mean time" [ref=f3e233]
                          - columnheader "Rejected" [ref=f3e234]
                      - rowgroup [ref=f3e235]:
                        - row [ref=f3e236]:
                          - cell "App servers ok" [ref=f3e237]:
                            - button "App servers" [pressed] [ref=f3e238] [cursor=pointer]
                            - generic [ref=f3e239]: ok
                          - cell "360 rps" [ref=f3e240]
                          - cell "600 rps" [ref=f3e241]
                          - cell [ref=f3e242]
                          - cell "22.47 ms" [ref=f3e245]
                          - cell "0%" [ref=f3e246]
                        - row [ref=f3e247]:
                          - cell "Database ok" [ref=f3e248]:
                            - button "Database" [ref=f3e249] [cursor=pointer]
                            - generic [ref=f3e250]: ok
                          - cell "360 rps" [ref=f3e251]
                          - cell "1,800 rps" [ref=f3e252]
                          - cell [ref=f3e253]
                          - cell "6 ms" [ref=f3e256]
                          - cell "0%" [ref=f3e257]
                  - generic [ref=f3e258]:
                    - heading "How requests travel" [level=3] [ref=f3e260]
                    - generic [ref=f3e261]:
                      - generic [ref=f3e262]:
                        - generic [ref=f3e263]: Read
                        - generic [ref=f3e264]:
                          - paragraph [ref=f3e265]: Users → App servers → Database
                          - paragraph [ref=f3e266]: 80% of requests · 0% fail on this path
                          - paragraph [ref=f3e267]: Mean 28.47 ms · p95 43.14 ms
                      - generic [ref=f3e268]:
                        - generic [ref=f3e269]: Write
                        - generic [ref=f3e270]:
                          - paragraph [ref=f3e271]: Users → App servers → Database
                          - paragraph [ref=f3e272]: 20% of requests · 0% fail on this path
                          - paragraph [ref=f3e273]: Mean 28.47 ms · p95 43.14 ms
                      - paragraph [ref=f3e274]: Returned common paths only; this is not an exhaustive list of every possible route.
                - complementary [ref=f3e275]:
                  - generic [ref=f3e276]:
                    - heading "Component inspection" [level=3] [ref=f3e278]
                    - generic [ref=f3e279]:
                      - heading "App servers" [level=4] [ref=f3e280]
                      - generic [ref=f3e281]:
                        - term [ref=f3e282]: Peak load
                        - definition [ref=f3e283]: 360 rps
                        - term [ref=f3e284]: Capacity
                        - definition [ref=f3e285]: 600 rps
                        - term [ref=f3e286]: Utilization
                        - definition [ref=f3e287]: 60%
                        - term [ref=f3e288]: Mean service time
                        - definition [ref=f3e289]: 22 ms
                        - term [ref=f3e290]: Mean queue wait
                        - definition [ref=f3e291]: 0.47 ms
                        - term [ref=f3e292]: Hits 100% at
                        - definition [ref=f3e293]: 500 rps
                      - link "Edit App servers" [ref=f3e294] [cursor=pointer]:
                        - /url: /designs/50749c07-d217-43c4-ac80-0705407c7551/edit?node=n2&run=f35bd050-7b4d-454b-a23b-9d657b534efa
                      - paragraph [ref=f3e295]: Opens this component in the current draft if it still exists. Metrics here remain from the recorded run.
                  - generic [ref=f3e296]:
                    - heading "Where an average request spends its time" [level=3] [ref=f3e298]
                    - generic [ref=f3e299]:
                      - generic [ref=f3e300]:
                        - generic [ref=f3e301]:
                          - term [ref=f3e302]: App servers
                          - definition [ref=f3e303]: 22.47 ms
                        - generic [ref=f3e304]:
                          - term [ref=f3e305]: Database
                          - definition [ref=f3e306]: 6 ms
                      - paragraph [ref=f3e307]: "Modeled average: 28.47 ms per request. Components list their mean contributions; network travel and other modeled contributions can make up the remainder. These values are not a breakdown of p95."
                  - generic [ref=f3e308]:
                    - heading "Model assumptions" [level=3] [ref=f3e309]
                    - paragraph [ref=f3e310]: Queueing approximations estimate latency and rejected load. They do not measure hardware, cold starts or real retry storms. The illustrated timeline samples independent loads rather than evolving a real system.
            - region "Report and PDF" [ref=f3e311]:
              - heading "Save or share this result" [level=2] [ref=f3e312]
              - paragraph [ref=f3e313]: A printable report of this design and this result, whether it passed, was strained or failed, with a PDF download. The design has changed since this run, so the report describes the saved design as it was then.
              - generic [ref=f3e314]:
                - generic [ref=f3e315]:
                  - button "Download PDF" [ref=f3e316] [cursor=pointer]
                  - generic [ref=f3e317]:
                    - checkbox "Include decisions and assumptions" [checked] [ref=f3e318]
                    - text: Include decisions and assumptions
                - generic [ref=f3e319]: Recorded revision 1.
              - generic [ref=f3e320]:
                - link "Open report and download PDF" [ref=f3e321] [cursor=pointer]:
                  - /url: /designs/50749c07-d217-43c4-ac80-0705407c7551/report?run=f35bd050-7b4d-454b-a23b-9d657b534efa
                - link "Share" [ref=f3e322] [cursor=pointer]:
                  - /url: /designs/50749c07-d217-43c4-ac80-0705407c7551/share
            - region "Load ladder" [ref=f3e323]:
              - generic [ref=f3e324]:
                - heading "Where does it break?" [level=2] [ref=f3e325]
                - generic "Calculated by running the model at higher load, not by a language model." [ref=f3e326]: Calculated by the model, no AI
              - paragraph [ref=f3e327]: See this design at two, five and ten times its request rate, with the same traffic shape and targets.
              - generic [ref=f3e328]:
                - button "Show 2×, 5× and 10× load" [disabled] [ref=f3e329]
                - generic [ref=f3e330]: This result is not for the saved design. Save, then run the test again to see the ladder.
            - region "What if" [ref=f3e331]:
              - generic [ref=f3e332]:
                - heading "What if the traffic changed?" [level=2] [ref=f3e333]
                - generic "Calculated by running the model under the changed load, not by a language model." [ref=f3e334]: Calculated by the model, no AI
              - paragraph [ref=f3e335]: Choose a change and see the same design under it, next to the result you have.
              - generic [ref=f3e336]:
                - generic [ref=f3e337]:
                  - generic [ref=f3e338]: Request rate
                  - combobox "Request rate" [ref=f3e339]:
                    - option "Keep the request rate" [selected]
                    - option "Multiply the request rate by"
                    - option "Set the request rate to"
                - generic [ref=f3e340]:
                  - generic [ref=f3e341]:
                    - text: Shape
                    - combobox "Shape" [ref=f3e342]:
                      - option "Keep the shape" [selected]
                      - option "Steady"
                      - option "Ramp up"
                      - option "Spike"
                  - generic [ref=f3e343]:
                    - text: Reads and writes
                    - combobox "Reads and writes" [ref=f3e344]:
                      - option "Keep the read share" [selected]
                      - option "Mostly reads (90%)"
                      - option "Half and half (50%)"
                      - option "Mostly writes (10%)"
                - generic [ref=f3e345]:
                  - button "Run what-if" [disabled] [ref=f3e346]
                  - generic [ref=f3e347]: This result is not for the saved design. Save, then run the test again to ask a what-if.
    - region "Notifications alt+T"
  - alert [ref=f3e348]
```

# Test source

```ts
  1   | import { test, expect, type Page } from "@playwright/test";
  2   | import { readFileSync } from "node:fs";
  3   | import { inflateSync } from "node:zlib";
  4   | import { PDFDocument } from "pdf-lib";
  5   | const api = process.env.SF_API_URL ?? "http://localhost:5001/v1";
  6   | type Headers = { Authorization: string };
  7   | async function setup(page: Page, tag: string) {
  8   |   await page.goto("/register");
  9   |   await page.getByLabel("Name", { exact: true }).fill("Direct PDF");
  10  |   await page.getByLabel("Email", { exact: true }).fill("directpdf-" + Date.now() + "-" + tag + "@example.test");
  11  |   await page.getByLabel("Password", { exact: true }).fill("Direct-Pdf-Only-2026!");
  12  |   await page.locator("#reg-terms").check();
  13  |   const response = page.waitForResponse(r => r.url() === api + "/auth/register" && r.status() === 201);
  14  |   await page.getByRole("button", { name: "Create account", exact: true }).click();
  15  |   const headers = { Authorization: "Bearer " + (await (await response).json()).data.accessToken };
  16  |   await page.goto("/new/template");
  17  |   await page.getByRole("button", { name: "Use Single-server MVP", exact: true }).click();
  18  |   await page.waitForURL(/\/designs\/[0-9a-f-]{36}\//);
  19  |   const id = new URL(page.url()).pathname.split("/")[2];
  20  |   const design = (await (await page.request.get(api + "/designs/" + id, { headers })).json()).data;
  21  |   return { headers, id, design };
  22  | }
  23  | async function run(page: Page, headers: Headers, id: string, revision: number) {
  24  |   const accepted = await page.request.post(api + "/designs/" + id + "/simulate", { headers, data: { expectedRevision: revision, requestId: crypto.randomUUID() } });
  25  |   expect(accepted.status()).toBe(202);
  26  |   const url = (await accepted.json()).data.statusUrl as string;
  27  |   for (let i = 0; i < 150; i++) {
  28  |     const current = (await (await page.request.get(url.startsWith("http") ? url : api.replace(/\/v1$/, "") + url, { headers })).json()).data;
  29  |     if (current.status !== "pending") { expect(current.status).toBe("completed"); return current; }
  30  |     await page.waitForTimeout(50);
  31  |   }
  32  |   throw Error("Simulation remained pending");
  33  | }
  34  | async function prepared(page: Page, tag: string) {
  35  |   const state = await setup(page, tag);
  36  |   const result = await run(page, state.headers, state.id, state.design.revision);
  37  |   await page.goto("/designs/" + state.id + "/results?run=" + result.id);
  38  |   await expect(page.getByTestId("quick-pdf-download-header")).toBeEnabled();
  39  |   await expect(page.getByTestId("quick-pdf-download-results")).toBeEnabled();
  40  |   return { ...state, result };
  41  | }
  42  | async function pdf(bytes: Buffer) {
  43  |   const doc = await PDFDocument.load(bytes); const lines: string[] = [];
  44  |   for (const [, object] of doc.context.enumerateIndirectObjects()) {
  45  |     const stream = object as unknown as { contents?: Uint8Array; dict?: { get(key: unknown): unknown } };
  46  |     if (!stream.contents) continue;
  47  |     let data: Buffer = Buffer.from(stream.contents);
  48  |     try { if (stream.dict?.get(doc.context.obj("Filter"))) data = inflateSync(data); } catch { continue; }
  49  |     for (const match of data.toString("latin1").matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) lines.push(Buffer.from(match[1], "hex").toString("latin1"));
  50  |   }
  51  |   return { doc, text: lines.join("\n"), bytes };
  52  | }
  53  | async function download(page: Page, testId: string) {
> 54  |   const event = page.waitForEvent("download");
      |                      ^ TimeoutError: page.waitForEvent: Timeout 15000ms exceeded while waiting for event "download"
  55  |   await page.getByTestId(testId).click();
  56  |   const file = await event; const path = await file.path();
  57  |   expect(file.suggestedFilename()).toMatch(/-rev\d+-report\.pdf$/);
  58  |   return pdf(readFileSync(path!));
  59  | }
  60  |
  61  | test("direct Results and Report page give identical bytes for the identical real report document", async ({ page }, info) => {
  62  |   const { headers, id, design, result } = await prepared(page, "equal-" + info.project.name);
  63  |   const payload = await (await page.request.get(api + "/designs/" + id + "/report?revision=" + design.revision + "&run=" + result.id, { headers })).json();
  64  |   const requests: string[] = [];
  65  |   // Freeze only this real server document (including generatedAt) to test byte identity, not changing timestamps.
  66  |   await page.route(api + "/designs/" + id + "/report**", route => { requests.push(route.request().url()); return route.fulfill({ status: 200, json: payload }); });
  67  |   const direct = await download(page, "quick-pdf-download-results");
  68  |   expect(direct.text).toContain("run " + result.id);
  69  |   expect(requests.some(url => new URL(url).searchParams.get("revision") === String(design.revision) && new URL(url).searchParams.get("run") === result.id)).toBe(true);
  70  |   await page.getByTestId("results-report-link").click();
  71  |   const report = await download(page, "report-download-pdf");
  72  |   expect(direct.bytes.equals(report.bytes)).toBe(true); expect(direct.text).toBe(report.text);
  73  | });
  74  | test("an older selected run downloads its own revision, while the header uses the saved latest result and excludes drafts", async ({ page }, info) => {
  75  |   const { headers, id, design, result: old } = await prepared(page, "history-" + info.project.name);
  76  |   const changed = await page.request.patch(api + "/designs/" + id, { headers, data: { expectedRevision: design.revision, name: "Newest saved PDF", traffic: { ...design.traffic, rps: 9000 } } });
  77  |   expect(changed.status()).toBe(200); const current = (await changed.json()).data;
  78  |   const latest = await run(page, headers, id, current.revision);
  79  |   await page.goto("/designs/" + id + "/results?run=" + old.id);
  80  |   await expect(page.getByTestId("quick-pdf-download-header")).toBeEnabled();
  81  |   await page.locator("#design-name").fill("PRIVATE UNSAVED DRAFT TITLE");
  82  |   await expect(page.getByTestId("quick-pdf-header")).toContainText("Unsaved changes are not included");
  83  |   const earlier = await download(page, "quick-pdf-download-results");
  84  |   expect(earlier.text).toContain(design.name); expect(earlier.text).toContain("run " + old.id);
  85  |   expect(earlier.text).not.toContain(latest.id); expect(earlier.text).not.toContain("PRIVATE UNSAVED DRAFT TITLE");
  86  |   const newest = await download(page, "quick-pdf-download-header");
  87  |   expect(newest.text).toContain("Newest saved PDF"); expect(newest.text).toContain("run " + latest.id);
  88  |   expect(newest.text).not.toContain(old.id); expect(newest.text).not.toContain("PRIVATE UNSAVED DRAFT TITLE");
  89  | });
  90  | test("no-result downloads are disabled; finishing a run enables them, while saving a new revision disables the header again", async ({ page }, info) => {
  91  |   const { id } = await setup(page, "ready-" + info.project.name);
  92  |   await expect(page.getByTestId("quick-pdf-header")).toContainText("Run a simulation for this saved revision first.");
  93  |   await expect(page.getByTestId("quick-pdf-download-header")).toBeDisabled();
  94  |   await expect(page.getByTestId("ws-report-link")).toBeVisible();
  95  |   await page.getByRole("button", { name: "Run test", exact: true }).click();
  96  |   await page.getByRole("link", { name: "Results", exact: true }).click();
  97  |   await expect(page.getByTestId("quick-pdf-download-header")).toBeEnabled();
  98  |   await expect(page.getByTestId("quick-pdf-download-results")).toBeEnabled();
  99  |   await page.locator("#design-name").fill("New saved revision without a run");
  100 |   await page.getByRole("button", { name: "Save", exact: true }).click();
  101 |   await expect(page.getByTestId("quick-pdf-header")).toContainText("Run a simulation for this saved revision first.");
  102 |   await expect(page.getByTestId("quick-pdf-download-header")).toBeDisabled();
  103 |   await expect(page.getByTestId("quick-pdf-download-results")).toBeEnabled();
  104 |   expect(new URL(page.url()).pathname).toBe("/designs/" + id + "/results");
  105 | });
  106 | test("API and PDF-save failures stay inline with an exact fallback, then an explicit retry downloads", async ({ page }, info) => {
  107 |   const { id, design, result } = await prepared(page, "fail-" + info.project.name);
  108 |   await page.route(api + "/designs/" + id + "/report**", route => route.fulfill({ status: 503, json: { error: { code: "UNAVAILABLE", message: "Audit failure" } } }));
  109 |   await page.getByTestId("quick-pdf-download-results").click();
  110 |   const error = page.getByTestId("quick-pdf-error-results");
  111 |   await expect(error).toBeVisible();
  112 |   await expect(error.getByRole("link", { name: "Open the Report page" })).toHaveAttribute("href", "/designs/" + id + "/report?revision=" + design.revision + "&run=" + result.id);
  113 |   await expect(page.getByRole("heading", { name: "Model results", exact: true })).toBeVisible();
  114 |   await page.unroute(api + "/designs/" + id + "/report**");
  115 |   await page.evaluate(() => {
  116 |     const Real = window.Blob;
  117 |     (window as unknown as { restorePdfBlob: () => void }).restorePdfBlob = () => { window.Blob = Real; };
  118 |     window.Blob = class extends Real {
  119 |       constructor(parts?: BlobPart[], options?: BlobPropertyBag) { if (options?.type === "application/pdf") throw Error("Audit PDF save failure"); super(parts, options); }
  120 |     } as typeof Blob;
  121 |   });
  122 |   await page.getByTestId("quick-pdf-download-results").click();
  123 |   await expect(error).toContainText("PDF could not be made");
  124 |   await page.evaluate(() => (window as unknown as { restorePdfBlob: () => void }).restorePdfBlob());
  125 |   expect((await download(page, "quick-pdf-download-results")).text).toContain(result.id);
  126 |   await expect(error).toHaveCount(0);
  127 | });
  128 | test("notes selection is keyboard accessible and shared with Report after reload", async ({ page }, info) => {
  129 |   const { headers, id, result } = await prepared(page, "notes-" + info.project.name);
  130 |   const note = "Direct PDF note must respect my choice";
  131 |   expect((await page.request.post(api + "/designs/" + id + "/notes", { headers, data: { kind: "decision", text: note } })).status()).toBe(201);
  132 |   const header = page.getByTestId("quick-pdf-notes-header");
  133 |   await header.focus(); await page.keyboard.press("Space");
  134 |   await expect(header).not.toBeChecked(); await expect(page.getByTestId("quick-pdf-notes-results")).not.toBeChecked();
  135 |   await page.reload(); await expect(page.getByTestId("quick-pdf-notes-results")).not.toBeChecked();
  136 |   expect((await download(page, "quick-pdf-download-results")).text).not.toContain(note);
  137 |   await page.getByTestId("results-report-link").click();
  138 |   await expect(page.getByTestId("report-pdf-notes")).not.toBeChecked();
  139 |   await page.getByTestId("report-pdf-notes").check();
  140 |   expect((await download(page, "report-download-pdf")).text).toContain(note);
  141 |   await page.goto("/designs/" + id + "/results?run=" + result.id);
  142 |   await expect(page.getByTestId("quick-pdf-notes-results")).toBeChecked();
  143 | });
  144 | test("leaving Results while the report request is pending never starts a late download", async ({ page }, info) => {
  145 |   const { id } = await prepared(page, "late-" + info.project.name);
  146 |   let release!: () => void; const wait = new Promise<void>(resolve => { release = resolve; });
  147 |   let started!: () => void; const incoming = new Promise<void>(resolve => { started = resolve; });
  148 |   let downloads = 0; page.on("download", () => downloads++);
  149 |   await page.route(api + "/designs/" + id + "/report**", async route => {
  150 |     started(); await wait;
  151 |     try { await route.continue(); } catch { /* Navigation may already have cancelled the browser request. */ }
  152 |   });
  153 |   await page.getByTestId("quick-pdf-download-results").click(); await incoming;
  154 |   await expect(page.getByTestId("quick-pdf-download-results")).toHaveText("Making the PDF…");
```