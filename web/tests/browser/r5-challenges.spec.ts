import { test, expect, type Browser, type Page, type TestInfo } from "@playwright/test";
import { execFileSync } from "node:child_process";
const api = process.env.SF_API_URL ?? "http://localhost:5001/v1";
const PASSWORD = "R5-Challenges-2026!";

// There is deliberately no website path to the Instructor role. These journeys give their own throwaway account the role
// straight in Postgres, through the test container named in the environment (SF_PG_CONTAINER, SF_PG_USER, SF_PG_DB).
const pg = { container: process.env.SF_PG_CONTAINER, user: process.env.SF_PG_USER, db: process.env.SF_PG_DB };
const canPromote = !!(pg.container && pg.user && pg.db);
function makeInstructor(email: string) {
  execFileSync("docker", ["exec", pg.container!, "psql", "-U", pg.user!, "-d", pg.db!, "-v", "ON_ERROR_STOP=1", "-c", `INSERT INTO user_roles(user_id, role, granted_by, granted_at) SELECT id, 'instructor', NULL, now() FROM users WHERE email = '${email}'`], { stdio: "pipe" });
}
const json = { "content-type": "application/json" };

async function signUp(page: Page, name: string, tag: string) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const email = "r5-" + Date.now() + "-" + tag + "@example.test";
  await page.goto("/register");
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.locator("#reg-terms").check();
  const reg = page.waitForResponse((r) => r.url() === api + "/auth/register" && r.status() === 201);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  const token = (await (await reg).json()).data.accessToken as string;
  await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();
  return { errors, email, token };
}
// Plain fetch, not page.request: the browser's request context shares cookies with the page, and registering here
// would replace the signed-in person's refresh cookie with the new account's.
async function registerViaApi(name: string, tag: string) {
  const email = "r5-" + Date.now() + "-" + tag + "@example.test";
  const res = await fetch(api + "/auth/register", { method: "POST", headers: json, body: JSON.stringify({ email, password: PASSWORD, displayName: name }) });
  expect(res.status).toBe(201);
  return { email };
}
async function seedDesign(token: string, name: string) {
  const headers = { ...json, Authorization: "Bearer " + token };
  const templates = ((await (await fetch(api + "/templates", { headers })).json()) as { data: Array<{ id: string; graph: unknown; traffic: unknown }> }).data;
  const t = templates[0];
  const res = await fetch(api + "/designs", { method: "POST", headers, body: JSON.stringify({ schemaVersion: 1, name, description: "Challenge journey design", source: "template", templateId: t.id, graph: t.graph, traffic: t.traffic }) });
  expect(res.status).toBe(201);
  return ((await res.json()) as { data: { id: string } }).data.id;
}
/** A separate signed-in person: a brand-new browser context shares nothing with the first one's session. */
async function sessionFor(browser: Browser, info: TestInfo, email: string) {
  const use = info.project.use;
  const context = await browser.newContext({ baseURL: use.baseURL, viewport: use.viewport ?? undefined, colorScheme: use.colorScheme ?? undefined });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.locator("form").getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();
  return { page, context, errors };
}
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

test.describe("R5.1 Instructor challenges", () => {
  test("a plain account is shown a denial at /instructor/challenges, never the tools, and the server refuses it too", async ({ page }) => {
    const plain = await signUp(page, "R5 Plain", "plain");
    await page.goto("/instructor/challenges");
    await expect(page.getByTestId("role-gate-denied")).toBeVisible();
    await expect(page.getByRole("button", { name: "New challenge", exact: true })).toHaveCount(0);
    await expect(page).toHaveTitle("My challenges · StressForge");
    expect((await fetch(api + "/instructor/challenges", { headers: { Authorization: "Bearer " + plain.token } })).status).toBe(403);
    expect(await noOverflow(page)).toBe(true);
    await page.getByRole("button", { name: "Account menu", exact: true }).click();
    await expect(page.getByRole("menuitem", { name: /My challenges/ })).toHaveCount(0);
    expect(plain.errors).toEqual([]);
  });

  test("an Instructor writes a challenge from one of their designs, publishes it to see where learners start, fixes the wording, archives it and duplicates it", async ({ page }) => {
    test.skip(!canPromote, "Set SF_PG_CONTAINER, SF_PG_USER and SF_PG_DB to run the Instructor journeys.");
    const teacher = await signUp(page, "R5 Teacher", "teacher");
    makeInstructor(teacher.email);
    const designName = "R5 Starting design " + Date.now();
    await seedDesign(teacher.token, designName);

    await page.goto("/instructor/challenges");
    await expect(page.getByTestId("my-challenges")).toContainText("You have not made a challenge yet");
    await page.getByRole("button", { name: "New challenge", exact: true }).click();
    const form = page.getByRole("form", { name: "New challenge" });

    // An empty form sends nothing and says what is wrong next to each box.
    await form.getByRole("button", { name: "Create draft", exact: true }).click();
    await expect(form.getByRole("alert").first()).toBeVisible();
    await expect(page.getByTestId("my-challenges")).toContainText("You have not made a challenge yet");

    await form.getByRole("textbox", { name: "Title", exact: true }).fill("R5 Survive the flash sale");
    await form.getByRole("textbox", { name: "What learners should achieve" }).fill("Keep p95 under the goal when traffic spikes.");
    const picker = form.getByRole("combobox", { name: "Starting design", exact: true });
    const optionLabel = ((await picker.locator("option", { hasText: designName }).first().textContent()) ?? "").trim();
    await picker.selectOption({ label: optionLabel });
    await form.getByRole("textbox", { name: "p95 latency goal (ms)" }).fill("250");
    await form.getByRole("textbox", { name: "Error limit (%)" }).fill("2");
    await form.getByRole("button", { name: "Create draft", exact: true }).click();

    // The new draft opens on its own page.
    await expect(page).toHaveURL(/\/instructor\/challenges\/[0-9a-f-]{36}$/);
    const challengeUrl = page.url();
    await expect(page.getByTestId("challenge-status")).toHaveText("Draft");
    const summary = page.getByTestId("challenge-summary");
    await expect(summary).toContainText("p95 at or under 250 ms and errors at or under 2%");
    await expect(summary).toContainText("500 requests/s, burst x1.5, 80% reads, 10 min, steady");
    await expect(page.getByTestId("baseline-text")).toContainText("Not measured yet");
    expect(await noOverflow(page)).toBe(true);

    // Publishing measures the starting design with the model.
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByTestId("challenge-status")).toHaveText("Published");
    await expect(page.getByTestId("baseline-text")).toContainText(/p95 [\d.]+ ms, [\d.]+% errors/);
    await expect(page.getByTestId("challenge-notice")).toContainText("Published");
    await expect(page.getByRole("button", { name: "Publish", exact: true })).toHaveCount(0);

    // After publishing only the wording can change.
    const edit = page.getByRole("form", { name: "Edit challenge" });
    await expect(edit.getByRole("textbox", { name: "p95 latency goal (ms)" })).toHaveCount(0);
    await edit.getByRole("textbox", { name: "Title", exact: true }).fill("R5 Survive the flash sale (clearer)");
    await edit.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(page.getByTestId("challenge-summary")).toContainText("R5 Survive the flash sale (clearer)");
    await expect(page.getByTestId("challenge-summary")).toContainText("p95 at or under 250 ms"); // the goal did not move

    // Archive asks first, then closes the challenge to changes.
    await page.getByRole("button", { name: "Archive", exact: true }).click();
    await expect(page.getByTestId("challenge-status")).toHaveText("Published");
    await page.getByRole("button", { name: "Confirm archive", exact: true }).click();
    await expect(page.getByTestId("challenge-status")).toHaveText("Archived");
    await expect(page.getByRole("form", { name: "Edit challenge" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Publish", exact: true })).toHaveCount(0);

    // A copy is a fresh editable draft.
    await page.getByRole("button", { name: "Duplicate as a new draft", exact: true }).click();
    await expect(page).not.toHaveURL(challengeUrl);
    await expect(page.getByTestId("challenge-status")).toHaveText("Draft");
    await expect(page.getByRole("form", { name: "Edit challenge" }).getByRole("textbox", { name: "p95 latency goal (ms)" })).toBeVisible();

    await page.goto("/instructor/challenges");
    const items = page.getByTestId("challenge-item");
    await expect(items).toHaveCount(2);
    await expect(items.filter({ hasText: "Archived" })).toHaveCount(1);
    await expect(items.filter({ hasText: "Draft" })).toHaveCount(1);
    expect(await noOverflow(page)).toBe(true);
    await page.getByRole("button", { name: "Account menu", exact: true }).click();
    await expect(page.getByRole("menuitem", { name: /My challenges/ })).toBeVisible();
    expect(teacher.errors).toEqual([]);
  });

  test("another Instructor cannot open someone else's challenge", async ({ page, browser }, info) => {
    test.skip(!canPromote, "Set SF_PG_CONTAINER, SF_PG_USER and SF_PG_DB to run the Instructor journeys.");
    const teacher = await signUp(page, "R5 Owner Teacher", "owner");
    makeInstructor(teacher.email);
    const designId = await seedDesign(teacher.token, "R5 Private design " + Date.now());
    const made = await fetch(api + "/instructor/challenges", {
      method: "POST",
      headers: { ...json, Authorization: "Bearer " + teacher.token },
      body: JSON.stringify({ title: "R5 Private challenge", summary: "Only mine.", goal: { p95Ms: 300, errorRate: 0.01 }, traffic: { preset: "steady", rps: 500, burst: 1.5, readRatio: 0.8, durationMin: 10, shape: "steady" }, from: { designId } }),
    });
    expect(made.status).toBe(201);
    const id = ((await made.json()) as { data: { id: string } }).data.id;

    const other = await registerViaApi("R5 Other Teacher", "other");
    makeInstructor(other.email);
    const person = await sessionFor(browser, info, other.email);
    await person.page.goto(`/instructor/challenges/${id}`);
    await expect(person.page.getByTestId("challenge-gone")).toBeVisible();
    await expect(person.page.getByTestId("challenge-summary")).toHaveCount(0);
    await person.page.goto("/instructor/challenges");
    await expect(person.page.getByTestId("my-challenges")).toContainText("You have not made a challenge yet");
    expect(person.errors).toEqual([]);
    await person.context.close();
  });
});
