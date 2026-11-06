# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: phase1.spec.ts >> 46 registry routes, auth forms, palette, drawers, themes, tab restores and logout
- Location: tests\browser\phase1.spec.ts:32:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('navigation', { name: 'Breadcrumb' })
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('navigation', { name: 'Breadcrumb' }) with timeout 15000ms
  - waiting for getByRole('navigation', { name: 'Breadcrumb' })

```

```yaml
- link "Skip to content":
  - /url: "#main"
- banner:
  - button "Open navigation"
  - link "ArchitectureStress Test":
    - /url: /dashboard
  - button "Search and jump to a screen (Ctrl+K)": Ctrl K
  - link "New design":
    - /url: /new
  - button "AI assistant"
  - button "Help for this screen"
  - button "Report a problem"
  - combobox "Color theme":
    - option "Light"
    - option "Dark"
    - option "System" [selected]
  - button "Account menu": FA
- main:
  - text: Admin
  - heading "StressForge right now" [level=1]
  - link "Back to the dashboard":
    - /url: /admin/dashboard
  - alert:
    - heading "This area is for Admin accounts" [level=2]
    - paragraph: Your account does not have that role. An Admin can grant it.
    - link "Back to your dashboard":
      - /url: /dashboard
- region "Notifications alt+T"
- alert: "Admin: Wall display · StressForge"
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
  8   | const samplePath = (path: string, designId = "frontend-audit", reportId = "frontend-audit-report") => path
  9   |   .replace(":topic", "p95").replace(":section", "profile")
  10  |   .replace(":token", "frontend-audit-share")
  11  |   .replace(":id", path.startsWith("/challenges") ? "flash-sale" : /^(\/reports\/|\/support\/)/.test(path) ? reportId : designId)
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
  32  | test("46 registry routes, auth forms, palette, drawers, themes, tab restores and logout", async ({ page, context }, testInfo) => {
  33  |   const email = `web-${Date.now()}-${testInfo.project.name}@example.test`;
  34  |   const unexpected: string[] = [];
  35  |   page.on("pageerror", error => unexpected.push(error.message));
  36  |   const consoleErrors: string[] = [];
  37  |   page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
  38  |   const scheme = testInfo.project.use.colorScheme as "light" | "dark";
  39  |   let accessToken = "";
  40  |
  41  |   await test.step("protected return-to, empty forms, signup and login/register links", async () => {
  42  |     await page.goto("/new/template?audit=1");
  43  |     await expect(page).toHaveURL(/\/login\?next=/);
  44  |     await page.locator("form").getByRole("button", { name: "Log in", exact: true }).click();
  45  |     await expect(page.locator("#login-email")).toHaveAttribute("aria-invalid", "true");
  46  |     await expect(page.locator("#login-pw")).toHaveAttribute("aria-invalid", "true");
  47  |     await page.locator(".auth-form").getByRole("link", { name: "Sign up", exact: true }).click();
  48  |     await expect(page).toHaveURL(/\/register\?next=/);
  49  |     await page.getByRole("button", { name: "Create account", exact: true }).click();
  50  |     for (const id of ["reg-name", "reg-email", "reg-pw", "reg-terms"]) await expect(page.locator(`#${id}`)).toHaveAttribute("aria-invalid", "true");
  51  |     await page.locator(".auth-form").getByRole("link", { name: "Log in", exact: true }).click();
  52  |     await expect(page).toHaveURL(/\/login\?next=/);
  53  |     await page.locator(".auth-form").getByRole("link", { name: "Sign up", exact: true }).click();
  54  |     const registration = page.waitForResponse(response => response.url() === apiBase + "/auth/register" && response.request().method() === "POST");
  55  |     await register(page, email);
  56  |     accessToken = (await (await registration).json()).data.accessToken;
  57  |     await expect(page).toHaveURL(/\/new\/template\?audit=1$/);
  58  |   });
  59  |
  60  |   await test.step("all 46 registered patterns resolve with correct document titles and no overflow", async () => {
  61  |     await page.goto("/new/template");
  62  |     await page.getByRole("button", { name: "Use Single-server MVP", exact: true }).click();
  63  |     await expect(page.getByLabel("Replicas (1–200)")).toBeVisible();
  64  |     const ownedDesignId = new URL(page.url()).pathname.split("/")[2];
  65  |     // A real owned report lets the detail route be checked without inventing an id or accepting a 404.
  66  |     const seed = await page.request.post(apiBase + "/support/reports", { headers: { Authorization: "Bearer " + accessToken }, data: { category: "bug", title: "Shell route fixture", body: "Disposable report for the registry route journey." } });
  67  |     expect(seed.status()).toBe(201);
  68  |     const ownedReportId = (await seed.json()).data.id as string;
  69  |     expect(ROUTES).toHaveLength(46);
  70  |     expect(ROUTES.map(route => route.id)).toEqual(expect.arrayContaining(["admin-dashboard", "admin-wall", "my-reports", "my-report", "support-inbox", "support-ticket"]));
  71  |     for (const route of ROUTES) {
  72  |       await test.step(route.path, async () => {
  73  |         const path = samplePath(route.path, ownedDesignId, ownedReportId);
  74  |         const navigable = ["learn-topic", "challenge", "evaluation", "settings"].includes(route.id) || (!route.path.includes(":") && !route.redirectTo);
  75  |         if (navigable) {
  76  |           await page.keyboard.press("Control+k");
  77  |           const title = resolveRoute(path).title;
  78  |           await page.getByRole("combobox", { name: "Command palette", exact: true }).fill(title);
  79  |           await page.getByRole("option").filter({ has: page.getByText(title, { exact: true }) }).last().click();
  80  |         } else {
  81  |           await page.goto(path);
  82  |         }
  83  |         if (route.redirectTo) await expect(page).toHaveURL(new RegExp(route.redirectTo(resolveRoute(path).params) + "$"));
  84  |         const expected = resolveRoute(route.redirectTo ? route.redirectTo(resolveRoute(path).params) : path);
  85  |         await expect(page).toHaveTitle(`${expected.title} · StressForge`);
  86  |         await expect(page.locator("main h1")).toBeVisible();
  87  |         if (!["login", "register"].includes(expected.route.id)) {
  88  |           const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
> 89  |           await expect(crumbs).toBeVisible();
      |                                ^ Error: expect(locator).toBeVisible() failed
  90  |           // Signed in, a public page starts at the person's Dashboard instead of the landing page's "Home".
  91  |           const labels = crumbsFor(expected).map((crumb, i) => (i === 0 && crumb.label === "Home" && crumb.to === "/" ? "Dashboard" : crumb.label));
  92  |           expect((await crumbs.locator(":scope > span").allTextContents()).map(text => text.trim())).toEqual(labels);
  93  |           await expect(crumbs.locator('[aria-current="page"]')).toHaveText(crumbsFor(expected).at(-1)!.label);
  94  |         }
  95  |         await expect(page.getByRole("heading", { name: /checking your session/i })).toHaveCount(0);
  96  |         await expect(page.locator("html")).toHaveAttribute("data-theme", scheme);
  97  |         await noOverflow(page);
  98  |       });
  99  |     }
  100 |     expect(consoleErrors).toEqual([]);
  101 |     expect(unexpected).toEqual([]);
  102 |   });
  103 |
  104 |   await page.goto("/dashboard");
  105 |   await expect(page.getByTestId("me-card")).toContainText(email);
  106 |   await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toHaveText("Dashboard");
  107 |   await test.step("palette keyboard focus, action navigation, Help and AI close paths", async () => {
  108 |     await page.keyboard.press("Control+k");
  109 |     await expect(page.getByRole("combobox", { name: "Command palette", exact: true })).toBeFocused();
  110 |     await page.getByRole("combobox", { name: "Command palette", exact: true }).fill("New design");
  111 |     await page.keyboard.press("Enter");
  112 |     await expect(page).toHaveURL(/\/new$/);
  113 |     await page.goto("/dashboard");
  114 |     for (const [opener, closer, initial] of [["Help for this screen", "Close help", "Close help"], ["AI assistant", "Close concept help", "Ask a concept question"]]) {
  115 |       for (const closeWith of ["Escape", "button"]) {
  116 |         const trigger = page.getByRole("button", { name: opener, exact: true });
  117 |         await trigger.click();
  118 |         await expect(page.getByLabel(initial, { exact: true })).toBeFocused();
  119 |         if (opener === "AI assistant") {
  120 |           await expect(page.getByRole("complementary", { name: "Concept help" }).getByText("Scripted mock", { exact: true })).toBeVisible();
  121 |           await page.getByLabel("Ask a concept question", { exact: true }).fill("Explain p95");
  122 |           await page.getByRole("button", { name: "Send", exact: true }).click();
  123 |           await expect(page.locator(".ai-msg.assistant")).toBeVisible();
  124 |         }
  125 |         if (closeWith === "Escape") await page.keyboard.press("Escape");
  126 |         else await page.getByRole("button", { name: closer, exact: true }).click();
  127 |         await expect(trigger).toBeFocused();
  128 |       }
  129 |     }
  130 |   });
  131 |   await test.step("shortcuts and persisted Support report controls", async () => {
  132 |     await page.locator("#main").focus();
  133 |     await page.keyboard.press("?");
  134 |     await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
  135 |     await page.keyboard.press("Escape");
  136 |     const feedbackTrigger = page.getByRole("button", { name: "Report a problem", exact: true });
  137 |     await feedbackTrigger.click();
  138 |     const feedback = page.getByRole("dialog", { name: "Report a problem", exact: true });
  139 |     await feedback.getByTestId("report-send").click();
  140 |     await expect(feedback.getByTestId("report-title")).toHaveAttribute("aria-invalid", "true");
  141 |     await expect(feedback.getByTestId("report-body")).toHaveAttribute("aria-invalid", "true");
  142 |     await feedback.getByRole("button", { name: "Bug or error", exact: true }).click();
  143 |     await expect(feedback.getByRole("button", { name: "Bug or error", exact: true })).toHaveAttribute("aria-pressed", "true");
  144 |     const title = "Shell report " + testInfo.project.name;
  145 |     const body = "Disposable shell audit report. This should be stored and readable by its author.";
  146 |     await feedback.getByTestId("report-title").fill(title);
  147 |     await feedback.getByTestId("report-body").fill(body);
  148 |     const submission = page.waitForResponse(response => response.url() === apiBase + "/support/reports" && response.request().method() === "POST");
  149 |     await feedback.getByTestId("report-send").click();
  150 |     const submitted = await submission;
  151 |     expect(submitted.status()).toBe(201);
  152 |     const saved = (await submitted.json()).data;
  153 |     const receipt = page.getByRole("dialog", { name: "Report received", exact: true });
  154 |     await expect(receipt.getByTestId("report-code")).toHaveText(saved.code);
  155 |     expect(saved.code).toMatch(/^SF-\d+$/);
  156 |     await receipt.getByRole("button", { name: "Done", exact: true }).click();
  157 |     await expect(receipt).toHaveCount(0);
  158 |     await expect(feedbackTrigger).toBeFocused();
  159 |     const readBack = await page.request.get(apiBase + "/support/reports/" + saved.id, { headers: { Authorization: "Bearer " + accessToken } });
  160 |     expect(readBack.status()).toBe(200);
  161 |     expect((await readBack.json()).data).toMatchObject({ id: saved.id, title, body, category: "bug" });
  162 |     await page.goto("/reports/" + saved.id);
  163 |     await expect(page.locator("main")).toContainText(body);
  164 |     await page.reload();
  165 |     await expect(page.locator("main")).toContainText(body);
  166 |     await page.goto("/dashboard");
  167 |     await expect(page.getByTestId("me-card")).toContainText(email);
  168 |   });
  169 |   await test.step("Light/Dark/System persistence, OS changes, and palette System action", async () => {
  170 |     const selector = page.getByRole("combobox", { name: "Color theme" });
  171 |     for (const theme of ["light", "dark", "system"]) {
  172 |       await selector.selectOption(theme);
  173 |       await page.reload({waitUntil:"domcontentloaded"});
  174 |       // Settle rotating-cookie restoration before the next reload can abort it.
  175 |       await expect(page.getByTestId("me-card")).toContainText(email);
  176 |       await expect(selector).toHaveValue(theme);
  177 |       await expect(page.locator("html")).toHaveAttribute("data-theme", theme === "system" ? scheme : theme);
  178 |       expect(await page.evaluate(() => localStorage.getItem("sf-theme"))).toBe(theme);
  179 |     }
  180 |     await page.emulateMedia({ colorScheme: "dark" });
  181 |     await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  182 |     await page.emulateMedia({ colorScheme: "light" });
  183 |     await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  184 |     await selector.selectOption("dark");
  185 |     await page.keyboard.press("Control+k");
  186 |     await page.getByRole("combobox", { name: "Command palette", exact: true }).fill("Use system theme");
  187 |     await page.keyboard.press("Enter");
  188 |     await expect(selector).toHaveValue("system");
  189 |     await page.emulateMedia({ colorScheme: scheme });
```