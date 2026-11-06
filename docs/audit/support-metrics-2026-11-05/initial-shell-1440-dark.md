# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: phase1.spec.ts >> 40 registry routes, auth forms, palette, drawers, themes, tab restores and logout
- Location: tests\browser\phase1.spec.ts:32:5

# Error details

```
Error: expect(received).toHaveLength(expected)

Expected length: 40
Received length: 46
Received array:  [{"area": "public", "description": "The public architecture lab introduction: draw, model and refine a system, with an illustrated scroll-driven anatomy and account entry.", "fidelity": "C", "id": "landing", "path": "/", "phase": 4, "planned": ["Exploded architecture illustration (not a live simulation)", "Available simulation features and model limitations", "Create an account or log in"], "title": "Architecture Stress Test"}, {"area": "public", "description": undefined, "fidelity": "C", "id": "login", "path": "/login", "phase": 1, "planned": undefined, "title": "Log in"}, {"area": "public", "description": undefined, "fidelity": "C", "id": "register", "path": "/register", "phase": 1, "planned": undefined, "title": "Sign up"}, {"area": "public", "description": "Example designs anyone can open and stress-test without an account.", "fidelity": "C", "id": "examples", "path": "/examples", "phase": 4, "planned": ["Six examples, each with its breaking point", "Open an example read-only and move the traffic slider", "Copy it to your account after signing up"], "title": "Examples"}, {"area": "public", "description": "The model behind the numbers: assumptions, formulas and what the simulator leaves out.", "fidelity": "C", "id": "how", "path": "/how-it-works", "phase": 4, "planned": ["Each component as an M/M/c queue, with one diagram", "How request paths combine into p50, p95 and p99", "Known limits: no GC pauses, cold caches or retry storms"], "title": "How it works"}, {"area": "public", "description": "A concept library for the ideas behind the results.", "fidelity": "C", "id": "learn", "path": "/learn", "phase": 4, "planned": ["Cards for p95, caching, queues, replicas, load balancing, CDNs and regions", "Each card links to the place it shows up in your results", "Progress marks for concepts you have opened"], "title": "Learn"}, {"accepts": [Function accepts], "area": "public", "description": "One concept, explained in plain words, with a live mini-demo you can drag.", "fidelity": "C", "id": "learn-topic", "path": "/learn/:topic", "phase": 4, "planned": ["A slider demo, such as cache hit rate against database load", "Where this concept shows up in your own designs", "A two-question check at the end"], "title": [Function anonymous]}, {"area": "public", "description": "Practice architecture scenarios against fixed latency and error targets.", "fidelity": "P", "id": "challenges", "path": "/challenges", "phase": 4, "planned": ["Four starter challenges, from easy to hard", "Each shows its latency and error targets", "Open one to start the practice workspace"], "title": "Challenges"}, {"area": "public", "description": "A read-only view of a design or report someone shared with a link.", "fidelity": "S", "id": "share-view", "path": "/share/:token", "phase": 3, "planned": ["Canvas and latest results, read-only", "Owner, date and the traffic it was tested at", "Copy to your account"], "title": "Shared design"}, {"area": "public", "description": "The project, the stack, credits and the source.", "fidelity": "C", "id": "about", "path": "/about", "phase": 4, "planned": ["Why this exists and who it is for", "Stack: Next.js, NestJS, TypeScript", "Credits and a link to the source"], "title": "About"}, …]
```

# Page snapshot

```yaml
- generic [active] [ref=f1e1]:
  - link "Skip to content" [ref=f1e2] [cursor=pointer]:
    - /url: "#main"
  - generic [ref=f1e3]:
    - generic [ref=f1e4]:
      - banner [ref=f1e5]:
        - link "ArchitectureStress Test" [ref=f1e6] [cursor=pointer]:
          - /url: /dashboard
        - navigation "Main" [ref=f1e12]:
          - link "Dashboard" [ref=f1e13] [cursor=pointer]:
            - /url: /dashboard
          - link "Designs" [ref=f1e14] [cursor=pointer]:
            - /url: /designs
          - link "Templates" [ref=f1e15] [cursor=pointer]:
            - /url: /templates
          - link "Learn" [ref=f1e16] [cursor=pointer]:
            - /url: /learn
          - link "Challenges" [ref=f1e17] [cursor=pointer]:
            - /url: /challenges
          - link "Evaluation" [ref=f1e18] [cursor=pointer]:
            - /url: /evaluation/simulator
        - generic [ref=f1e19]:
          - button "Search and jump to a screen (Ctrl+K)" [ref=f1e20] [cursor=pointer]:
            - generic [ref=f1e24]: Jump to…
            - generic [ref=f1e25]: Ctrl K
          - link "New design" [ref=f1e26] [cursor=pointer]:
            - /url: /new
          - button "AI assistant" [ref=f1e29] [cursor=pointer]
          - button "Help for this screen" [ref=f1e33] [cursor=pointer]
          - button "Report a problem" [ref=f1e37] [cursor=pointer]
          - combobox "Color theme" [ref=f1e40] [cursor=pointer]:
            - option "Light"
            - option "Dark"
            - option "System" [selected]
          - button "Account menu" [ref=f1e42] [cursor=pointer]: FA
      - main [ref=f1e43]:
        - generic [ref=f1e44]:
          - generic [ref=f1e45]:
            - heading "Edit" [level=1] [ref=f1e46]
            - navigation "Breadcrumb" [ref=f1e47]:
              - link "Dashboard" [ref=f1e49] [cursor=pointer]:
                - /url: /dashboard
              - link "Designs" [ref=f1e53] [cursor=pointer]:
                - /url: /designs
              - link "fb5c647b-79e6-4c76-bf86-08132326a3d5" [ref=f1e57] [cursor=pointer]:
                - /url: /designs/fb5c647b-79e6-4c76-bf86-08132326a3d5/edit
              - generic [ref=f1e58]: Edit
            - generic [ref=f1e62]:
              - generic [ref=f1e63]:
                - generic [ref=f1e64]: Design name
                - textbox "Design name" [ref=f1e65]: Single-server MVP
                - status [ref=f1e66]: Saved · revision 1
              - generic [ref=f1e67]:
                - button "Save" [disabled] [ref=f1e68]
                - button "Check graph" [ref=f1e69] [cursor=pointer]
                - button "Run test" [ref=f1e70] [cursor=pointer]
                - button "Delete" [ref=f1e71] [cursor=pointer]
            - navigation "Design workspace" [ref=f1e72]:
              - link "Edit" [ref=f1e73] [cursor=pointer]:
                - /url: /designs/fb5c647b-79e6-4c76-bf86-08132326a3d5/edit
              - link "Traffic" [ref=f1e74] [cursor=pointer]:
                - /url: /designs/fb5c647b-79e6-4c76-bf86-08132326a3d5/traffic
              - link "Results" [ref=f1e75] [cursor=pointer]:
                - /url: /designs/fb5c647b-79e6-4c76-bf86-08132326a3d5/results
              - link "Limits" [ref=f1e76] [cursor=pointer]:
                - /url: /designs/fb5c647b-79e6-4c76-bf86-08132326a3d5/limits
              - link "Improve Later" [ref=f1e77] [cursor=pointer]:
                - /url: /designs/fb5c647b-79e6-4c76-bf86-08132326a3d5/improve
                - text: Improve
                - generic [ref=f1e78]: Later
              - link "History" [ref=f1e79] [cursor=pointer]:
                - /url: /designs/fb5c647b-79e6-4c76-bf86-08132326a3d5/history
              - link "Notes" [ref=f1e80] [cursor=pointer]:
                - /url: /designs/fb5c647b-79e6-4c76-bf86-08132326a3d5/notes
          - generic [ref=f1e81]:
            - generic [ref=f1e82]:
              - group "Graph editing tools" [ref=f1e83]:
                - button "Connect tool" [ref=f1e84] [cursor=pointer]: Connect (C)
                - button "Load (L)" [ref=f1e85] [cursor=pointer]
                - button "Undo" [disabled] [ref=f1e86]
                - button "Redo" [disabled] [ref=f1e87]
                - button "Duplicate component" [ref=f1e88] [cursor=pointer]
                - button "Delete selection" [ref=f1e89] [cursor=pointer]
              - generic [ref=f1e90]:
                - complementary "Component palette" [ref=f1e91]:
                  - paragraph [ref=f1e92]: 12 component types · Scroll for more
                  - generic [ref=f1e93]:
                    - heading "Entry" [level=2] [ref=f1e94]
                    - button "Add Clients" [ref=f1e95]:
                      - generic [ref=f1e101]:
                        - text: Clients
                        - generic [ref=f1e102]: traffic entry
                  - generic [ref=f1e103]:
                    - heading "Edge" [level=2] [ref=f1e104]
                    - button "Add CDN" [ref=f1e105]:
                      - generic [ref=f1e110]:
                        - text: CDN
                        - generic [ref=f1e111]: 40,000/s · 12 ms
                  - generic [ref=f1e112]:
                    - heading "Routing" [level=2] [ref=f1e113]
                    - button "Add Load balancer" [ref=f1e114]:
                      - generic [ref=f1e122]:
                        - text: Load balancer
                        - generic [ref=f1e123]: 20,000/s · 1 ms
                    - button "Add API gateway" [ref=f1e124]:
                      - generic [ref=f1e128]:
                        - text: API gateway
                        - generic [ref=f1e129]: 8,000/s · 3 ms
                  - generic [ref=f1e130]:
                    - heading "Compute" [level=2] [ref=f1e131]
                    - button "Add App server" [ref=f1e132]:
                      - generic [ref=f1e138]:
                        - text: App server
                        - generic [ref=f1e139]: 600/s · 22 ms
                    - button "Add Worker" [ref=f1e140]:
                      - generic [ref=f1e146]:
                        - text: Worker
                        - generic [ref=f1e147]: 250/s · 60 ms
                  - generic [ref=f1e148]:
                    - heading "Data" [level=2] [ref=f1e149]
                    - button "Add Cache" [ref=f1e150]:
                      - generic [ref=f1e154]:
                        - text: Cache
                        - generic [ref=f1e155]: 30,000/s · 1.2 ms
                    - button "Add Database" [ref=f1e156]:
                      - generic [ref=f1e161]:
                        - text: Database
                        - generic [ref=f1e162]: 1,800/s · 6 ms
                    - button "Add Read replica" [ref=f1e163]:
                      - generic [ref=f1e170]:
                        - text: Read replica
                        - generic [ref=f1e171]: 1,800/s · 6 ms
                    - button "Add Object storage" [ref=f1e172]:
                      - generic [ref=f1e177]:
                        - text: Object storage
                        - generic [ref=f1e178]: 3,500/s · 35 ms
                  - generic [ref=f1e179]:
                    - heading "Async" [level=2] [ref=f1e180]
                    - button "Add Queue" [ref=f1e181]:
                      - generic [ref=f1e187]:
                        - text: Queue
                        - generic [ref=f1e188]: 12,000/s · 2 ms
                  - generic [ref=f1e189]:
                    - heading "External" [level=2] [ref=f1e190]
                    - button "Add Third-party API" [ref=f1e191]:
                      - generic [ref=f1e196]:
                        - text: Third-party API
                        - generic [ref=f1e197]: 150/s · 180 ms
                  - paragraph [ref=f1e198]: Drag onto the canvas, or click to add in the middle. 50 components maximum.
                - region "Architecture canvas" [ref=f1e200]:
                  - group "Architecture graph" [ref=f1e201]:
                    - generic [ref=f1e202]:
                      - 'button "Connection: Users to App servers"'
                      - 'button "Connection: App servers to Database"'
                      - button "Users, client" [ref=f1e204] [cursor=pointer]:
                        - generic [ref=f1e213]: Users
                        - generic [ref=f1e214]: client · us-east
                      - button "App servers, app" [pressed] [ref=f1e215] [cursor=pointer]:
                        - generic [ref=f1e224]: App servers
                        - generic [ref=f1e225]: app ×1 · us-east
                      - button "Database, db" [ref=f1e226] [cursor=pointer]:
                        - generic [ref=f1e234]: Database
                        - generic [ref=f1e235]: db · us-east
                  - toolbar "Canvas tools" [ref=f1e236]:
                    - button "Select and move" [ref=f1e237] [cursor=pointer]
                    - button "Zoom out" [ref=f1e240] [cursor=pointer]
                    - status "Canvas zoom" [ref=f1e244]: 115%
                    - button "Zoom in" [ref=f1e245] [cursor=pointer]
                    - button "Fit to screen" [ref=f1e249] [cursor=pointer]
                    - button "Focus selected component" [ref=f1e252] [cursor=pointer]
                  - 'button "Minimap: centre the view. Fit to screen is the keyboard alternative." [ref=f1e256] [cursor=pointer]'
                - complementary "Component properties" [ref=f1e262]:
                  - generic [ref=f1e263]:
                    - heading "Component properties" [level=2] [ref=f1e264]
                    - generic [ref=f1e265]: Component
                    - combobox "Component" [ref=f1e266]:
                      - option "Select a component"
                      - option "Users"
                      - option "App servers" [selected]
                      - option "Database"
                  - generic [ref=f1e267]:
                    - generic [ref=f1e273]:
                      - text: Compute
                      - heading "App server" [level=3] [ref=f1e274]
                    - paragraph [ref=f1e275]: Runs your request handlers. Scale out with replicas.
                    - generic [ref=f1e276]:
                      - generic [ref=f1e277]: Component name
                      - textbox "Component name" [ref=f1e278]: App servers
                  - generic [ref=f1e279]:
                    - generic [ref=f1e280]:
                      - generic [ref=f1e281]: Replicas (1–200)
                      - spinbutton "Replicas (1–200)" [ref=f1e283]: "1"
                    - generic [ref=f1e284]:
                      - generic [ref=f1e285]: Capacity per replica
                      - generic [ref=f1e286]:
                        - spinbutton "Capacity per replica" [ref=f1e287]: "600"
                        - generic [ref=f1e288]: requests/s
                    - generic [ref=f1e289]:
                      - generic [ref=f1e290]: Service time
                      - generic [ref=f1e291]:
                        - spinbutton "Service time" [ref=f1e292]: "22"
                        - generic [ref=f1e293]: ms
                    - generic [ref=f1e294]:
                      - generic [ref=f1e295]: Region
                      - combobox "Region" [ref=f1e296]:
                        - option "US East" [selected]
                        - option "EU West"
                        - option "Asia South"
                  - generic [ref=f1e297]:
                    - heading "Position" [level=3] [ref=f1e298]
                    - paragraph [ref=f1e299]: x 280 · y 228
                    - group "Move selected component" [ref=f1e300]:
                      - button "Move Left" [ref=f1e301] [cursor=pointer]: Left
                      - button "Move Up" [ref=f1e302] [cursor=pointer]: Up
                      - button "Move Down" [ref=f1e303] [cursor=pointer]: Down
                      - button "Move Right" [ref=f1e304] [cursor=pointer]: Right
                    - paragraph [ref=f1e305]: Canvas arrows move 12 units; Shift + arrows move 48.
                  - paragraph [ref=f1e307]: Use the toolbar to duplicate or delete this component. Deleting also removes its connections; Undo restores them.
                  - generic [ref=f1e308]:
                    - heading "Notes on App servers" [level=3] [ref=f1e309]
                    - paragraph [ref=f1e310]: No notes on this component yet.
                    - list "Notes on App servers"
                    - generic [ref=f1e311]:
                      - generic [ref=f1e312]:
                        - generic [ref=f1e313]: Kind of note
                        - combobox "Kind of note" [ref=f1e314]:
                          - option "Decision" [selected]
                          - option "Assumption"
                        - generic [ref=f1e315]: A choice you made and why.
                      - generic [ref=f1e316]:
                        - generic [ref=f1e317]: Note about App servers
                        - textbox "Note about App servers" [ref=f1e318]
                        - status [ref=f1e320]: 2,000 characters left
                      - button "Add note to this component" [disabled] [ref=f1e322]
                  - generic [ref=f1e323]:
                    - heading "Connections" [level=3] [ref=f1e324]
                    - generic [ref=f1e325]:
                      - generic [ref=f1e326]: Connection
                      - combobox "Connection" [ref=f1e327]:
                        - option "Select a connection" [selected]
                        - option "Users → App servers"
                        - option "App servers → Database"
                    - generic [ref=f1e328]:
                      - generic [ref=f1e329]: Source component
                      - combobox "Source component" [ref=f1e330]:
                        - option "Choose source" [selected]
                        - option "Users"
                        - option "App servers"
                        - option "Database"
                    - generic [ref=f1e331]:
                      - generic [ref=f1e332]: Destination component
                      - combobox "Destination component" [ref=f1e333]:
                        - option "Choose destination" [selected]
                        - option "Users"
                        - option "App servers"
                        - option "Database"
                    - button "Add connection" [disabled] [ref=f1e334]
                    - paragraph [ref=f1e335]: Arrows show traffic direction. Clients can only be the source. Cycles can be saved but must be repaired before Run.
                - generic [ref=f1e336]:
                  - region "Live traffic and preview" [ref=f1e337]:
                    - generic [ref=f1e338]:
                      - generic [ref=f1e339]: Traffic
                      - slider "Traffic" [ref=f1e340]: "399"
                      - generic [ref=f1e341]: 300 rps
                    - status [ref=f1e343]: Live preview off
                  - generic [ref=f1e344]: Select and move · drag background to pan · wheel or +/− to zoom · F to fit · C to connect · L for load · Esc to cancel · Delete selection · Ctrl+Z to undo. Load colours are modeled estimates, not observed traffic.
              - paragraph [ref=f1e345]: Use Check graph to see problems and repair steps before running.
            - group [ref=f1e346]:
              - generic "Design description and assumptions" [ref=f1e347]
            - generic [ref=f1e348]: Run the saved design to see model estimates.
    - region "Notifications alt+T"
  - alert [ref=f1e349]: Edit · StressForge
```

# Test source

```ts
  1   | import { test, expect, type Page } from "@playwright/test";
  2   | import { ROUTES, resolveRoute, crumbsFor } from "../../src/lib/routes";
  3   | import { SYSTEM_STATES } from "../../src/lib/system-states";
  4   |
  5   | const apiBase = process.env.SF_API_URL ?? "http://localhost:5001/v1";
  6   | const password = "Frontend-Audit-123!";
  7   | const devStates = process.env.SF_DEV_STATES === "1";
  8   | const samplePath = (path: string, designId = "frontend-audit") => path
  9   |   .replace(":topic", "p95").replace(":section", "profile")
  10  |   .replace(":token", "frontend-audit-share")
  11  |   .replace(":id", path.startsWith("/challenges") ? "flash-sale" : designId)
  12  |   .replace(":tab", path.startsWith("/evaluation") ? "simulator" : "results");
  13  |
  14  | async function noOverflow(page: Page) {
  15  |   expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  16  | }
  17  | async function logout(page: Page) {
  18  |   await page.getByRole("button", { name: "Account menu", exact: true }).click();
  19  |   await page.getByRole("menuitem", { name: "Log out", exact: true }).click();
  20  |   await expect(page.getByRole("button", { name: "Account menu", exact: true })).toHaveCount(0);
  21  |   expect(await page.evaluate(() => document.cookie.includes("sf_session="))).toBe(false);
  22  | }
  23  | async function register(page: Page, email: string) {
  24  |   await page.getByLabel("Name", { exact: true }).fill("Frontend Audit");
  25  |   await page.getByLabel("Email", { exact: true }).fill(email);
  26  |   await page.getByLabel("Password", { exact: true }).fill(password);
  27  |   await page.locator("#reg-terms").check();
  28  |   await page.getByRole("button", { name: "Create account", exact: true }).click();
  29  |   await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();
  30  | }
  31  |
  32  | test("40 registry routes, auth forms, palette, drawers, themes, tab restores and logout", async ({ page, context }, testInfo) => {
  33  |   const email = `web-${Date.now()}-${testInfo.project.name}@example.test`;
  34  |   const unexpected: string[] = [];
  35  |   page.on("pageerror", error => unexpected.push(error.message));
  36  |   const consoleErrors: string[] = [];
  37  |   page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
  38  |   const scheme = testInfo.project.use.colorScheme as "light" | "dark";
  39  |
  40  |   await test.step("protected return-to, empty forms, signup and login/register links", async () => {
  41  |     await page.goto("/new/template?audit=1");
  42  |     await expect(page).toHaveURL(/\/login\?next=/);
  43  |     await page.locator("form").getByRole("button", { name: "Log in", exact: true }).click();
  44  |     await expect(page.locator("#login-email")).toHaveAttribute("aria-invalid", "true");
  45  |     await expect(page.locator("#login-pw")).toHaveAttribute("aria-invalid", "true");
  46  |     await page.locator(".auth-form").getByRole("link", { name: "Sign up", exact: true }).click();
  47  |     await expect(page).toHaveURL(/\/register\?next=/);
  48  |     await page.getByRole("button", { name: "Create account", exact: true }).click();
  49  |     for (const id of ["reg-name", "reg-email", "reg-pw", "reg-terms"]) await expect(page.locator(`#${id}`)).toHaveAttribute("aria-invalid", "true");
  50  |     await page.locator(".auth-form").getByRole("link", { name: "Log in", exact: true }).click();
  51  |     await expect(page).toHaveURL(/\/login\?next=/);
  52  |     await page.locator(".auth-form").getByRole("link", { name: "Sign up", exact: true }).click();
  53  |     await register(page, email);
  54  |     await expect(page).toHaveURL(/\/new\/template\?audit=1$/);
  55  |   });
  56  |
  57  |   await test.step("all 40 registered patterns resolve with correct document titles and no overflow", async () => {
  58  |     await page.goto("/new/template");
  59  |     await page.getByRole("button", { name: "Use Single-server MVP", exact: true }).click();
  60  |     await expect(page.getByLabel("Replicas (1–200)")).toBeVisible();
  61  |     const ownedDesignId = new URL(page.url()).pathname.split("/")[2];
> 62  |     expect(ROUTES).toHaveLength(40);
      |                    ^ Error: expect(received).toHaveLength(expected)
  63  |     for (const route of ROUTES) {
  64  |       await test.step(route.path, async () => {
  65  |         const path = samplePath(route.path, ownedDesignId);
  66  |         const navigable = ["learn-topic", "challenge", "evaluation", "settings"].includes(route.id) || (!route.path.includes(":") && !route.redirectTo);
  67  |         if (navigable) {
  68  |           await page.keyboard.press("Control+k");
  69  |           const title = resolveRoute(path).title;
  70  |           await page.getByRole("combobox", { name: "Command palette", exact: true }).fill(title);
  71  |           await page.getByRole("option").filter({ has: page.getByText(title, { exact: true }) }).last().click();
  72  |         } else {
  73  |           await page.goto(path);
  74  |         }
  75  |         if (route.redirectTo) await expect(page).toHaveURL(new RegExp(route.redirectTo(resolveRoute(path).params) + "$"));
  76  |         const expected = resolveRoute(route.redirectTo ? route.redirectTo(resolveRoute(path).params) : path);
  77  |         await expect(page).toHaveTitle(`${expected.title} · StressForge`);
  78  |         await expect(page.locator("main h1")).toBeVisible();
  79  |         if (!["login", "register"].includes(expected.route.id)) {
  80  |           const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
  81  |           await expect(crumbs).toBeVisible();
  82  |           // Signed in, a public page starts at the person's Dashboard instead of the landing page's "Home".
  83  |           const labels = crumbsFor(expected).map((crumb, i) => (i === 0 && crumb.label === "Home" && crumb.to === "/" ? "Dashboard" : crumb.label));
  84  |           expect((await crumbs.locator(":scope > span").allTextContents()).map(text => text.trim())).toEqual(labels);
  85  |           await expect(crumbs.locator('[aria-current="page"]')).toHaveText(crumbsFor(expected).at(-1)!.label);
  86  |         }
  87  |         await expect(page.getByRole("heading", { name: /checking your session/i })).toHaveCount(0);
  88  |         await expect(page.locator("html")).toHaveAttribute("data-theme", scheme);
  89  |         await noOverflow(page);
  90  |       });
  91  |     }
  92  |     expect(consoleErrors).toEqual([]);
  93  |     expect(unexpected).toEqual([]);
  94  |   });
  95  |
  96  |   await page.goto("/dashboard");
  97  |   await expect(page.getByTestId("me-card")).toContainText(email);
  98  |   await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toHaveText("Dashboard");
  99  |   await test.step("palette keyboard focus, action navigation, Help and AI close paths", async () => {
  100 |     await page.keyboard.press("Control+k");
  101 |     await expect(page.getByRole("combobox", { name: "Command palette", exact: true })).toBeFocused();
  102 |     await page.getByRole("combobox", { name: "Command palette", exact: true }).fill("New design");
  103 |     await page.keyboard.press("Enter");
  104 |     await expect(page).toHaveURL(/\/new$/);
  105 |     await page.goto("/dashboard");
  106 |     for (const [opener, closer, initial] of [["Help for this screen", "Close help", "Close help"], ["AI assistant", "Close concept help", "Ask a concept question"]]) {
  107 |       for (const closeWith of ["Escape", "button"]) {
  108 |         const trigger = page.getByRole("button", { name: opener, exact: true });
  109 |         await trigger.click();
  110 |         await expect(page.getByLabel(initial, { exact: true })).toBeFocused();
  111 |         if (opener === "AI assistant") {
  112 |           await expect(page.getByRole("complementary", { name: "Concept help" }).getByText("Scripted mock", { exact: true })).toBeVisible();
  113 |           await page.getByLabel("Ask a concept question", { exact: true }).fill("Explain p95");
  114 |           await page.getByRole("button", { name: "Send", exact: true }).click();
  115 |           await expect(page.locator(".ai-msg.assistant")).toBeVisible();
  116 |         }
  117 |         if (closeWith === "Escape") await page.keyboard.press("Escape");
  118 |         else await page.getByRole("button", { name: closer, exact: true }).click();
  119 |         await expect(trigger).toBeFocused();
  120 |       }
  121 |     }
  122 |   });
  123 |   await test.step("shortcuts and local feedback normal controls", async () => {
  124 |     await page.locator("#main").focus();
  125 |     await page.keyboard.press("?");
  126 |     await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
  127 |     await page.keyboard.press("Escape");
  128 |     const feedbackTrigger = page.getByRole("button", { name: "Send feedback", exact: true });
  129 |     await feedbackTrigger.click();
  130 |     const feedback = page.getByRole("dialog", { name: "Send feedback" });
  131 |     await feedback.getByRole("button", { name: "Something broke", exact: true }).click();
  132 |     await expect(feedback.getByRole("button", { name: "Something broke", exact: true })).toHaveAttribute("aria-pressed", "true");
  133 |     await feedback.getByLabel("What happened, or what would help?", { exact: true }).fill("Disposable browser audit feedback. Nothing should be sent.");
  134 |     await feedback.getByRole("button", { name: "Send feedback", exact: true }).click();
  135 |     await expect(feedback).toHaveCount(0);
  136 |     await expect(page.getByText("Thanks. Feedback is not stored yet, so nothing was sent.", { exact: true })).toBeVisible();
  137 |     await expect(feedbackTrigger).toBeFocused();
  138 |   });
  139 |   await test.step("Light/Dark/System persistence, OS changes, and palette System action", async () => {
  140 |     const selector = page.getByRole("combobox", { name: "Color theme" });
  141 |     for (const theme of ["light", "dark", "system"]) {
  142 |       await selector.selectOption(theme);
  143 |       await page.reload({waitUntil:"domcontentloaded"});
  144 |       // Settle rotating-cookie restoration before the next reload can abort it.
  145 |       await expect(page.getByTestId("me-card")).toContainText(email);
  146 |       await expect(selector).toHaveValue(theme);
  147 |       await expect(page.locator("html")).toHaveAttribute("data-theme", theme === "system" ? scheme : theme);
  148 |       expect(await page.evaluate(() => localStorage.getItem("sf-theme"))).toBe(theme);
  149 |     }
  150 |     await page.emulateMedia({ colorScheme: "dark" });
  151 |     await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  152 |     await page.emulateMedia({ colorScheme: "light" });
  153 |     await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  154 |     await selector.selectOption("dark");
  155 |     await page.keyboard.press("Control+k");
  156 |     await page.getByRole("combobox", { name: "Command palette", exact: true }).fill("Use system theme");
  157 |     await page.keyboard.press("Enter");
  158 |     await expect(selector).toHaveValue("system");
  159 |     await page.emulateMedia({ colorScheme: scheme });
  160 |   });
  161 |   await test.step("concurrent tabs restore through the real rotating refresh cookie", async () => {
  162 |     const a = await context.newPage(); const b = await context.newPage();
```