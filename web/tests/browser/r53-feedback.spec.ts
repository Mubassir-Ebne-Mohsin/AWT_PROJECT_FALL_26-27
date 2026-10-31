import { test, expect, type Browser, type Page, type TestInfo } from "@playwright/test";
import { execFileSync } from "node:child_process";
const api = process.env.SF_API_URL ?? "http://localhost:5001/v1";
const PASSWORD = "R5-Feedback-2026!";

// There is deliberately no website path to the Instructor role. These journeys give their own throwaway account the role
// straight in Postgres, through the test container named in the environment (SF_PG_CONTAINER, SF_PG_USER, SF_PG_DB).
const pg = { container: process.env.SF_PG_CONTAINER, user: process.env.SF_PG_USER, db: process.env.SF_PG_DB };
const canPromote = !!(pg.container && pg.user && pg.db);
function makeInstructor(email: string) {
  execFileSync(
    "docker",
    ["exec", pg.container!, "psql", "-U", pg.user!, "-d", pg.db!, "-v", "ON_ERROR_STOP=1", "-c", `INSERT INTO user_roles(user_id, role, granted_by, granted_at) SELECT id, 'instructor', NULL, now() FROM users WHERE email = '${email}'`],
    { stdio: "pipe" },
  );
}
const json = { "content-type": "application/json" };
// Plain fetch, not page.request: registering here must not replace a signed-in browser's refresh cookie.
async function registerViaApi(name: string, tag: string) {
  const email = "r53-" + Date.now() + "-" + tag + "@example.test";
  const res = await fetch(api + "/auth/register", { method: "POST", headers: json, body: JSON.stringify({ email, password: PASSWORD, displayName: name }) });
  expect(res.status).toBe(201);
  return { email, token: (await res.json()).data.accessToken as string };
}
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

test("R5.3 the Instructor reads a submission, sends feedback, and only that learner reads it", async ({ browser }, info) => {
  test.skip(!canPromote, "Requires isolated Postgres settings");
  const tag = info.project.name;
  const teacher = await registerViaApi("Feedback Instructor", tag + "-t");
  makeInstructor(teacher.email);
  const tHeaders = { ...json, Authorization: `Bearer ${(await (await fetch(api + "/auth/login", { method: "POST", headers: json, body: JSON.stringify({ email: teacher.email, password: PASSWORD }) })).json()).data.accessToken}` };
  const t = (await (await fetch(api + "/templates", { headers: tHeaders })).json()).data[0];
  const d = await (await fetch(api + "/designs", { method: "POST", headers: tHeaders, body: JSON.stringify({ schemaVersion: 1, name: "Starter", description: "Test", source: "template", templateId: t.id, graph: t.graph, traffic: t.traffic }) })).json();
  const title = "Feedback goal " + Date.now();
  const c = await (
    await fetch(api + "/instructor/challenges", {
      method: "POST",
      headers: tHeaders,
      body: JSON.stringify({ title, summary: "Meet the fixed targets", goal: { p95Ms: 60000, errorRate: 1 }, traffic: { preset: "custom", rps: 1, burst: 1, readRatio: 0.8, durationMin: 10, shape: "steady" }, from: { designId: d.data.id } }),
    })
  ).json();
  expect((await fetch(api + `/instructor/challenges/${c.data.id}/publish`, { method: "POST", headers: tHeaders })).status).toBe(200);

  // Two learners each submit once, through the API, and wait until the server has graded them.
  const learners = [] as { email: string; name: string }[];
  for (const name of ["Ada Learner", "Bo Learner"]) {
    const l = await registerViaApi(name, tag + "-" + name.slice(0, 2));
    const h = { ...json, Authorization: "Bearer " + l.token };
    const a = (await (await fetch(api + `/challenges/${c.data.id}/attempt`, { method: "POST", headers: h })).json()).data;
    expect((await fetch(api + `/attempts/${a.id}/submissions`, { method: "POST", headers: h, body: JSON.stringify({ requestId: crypto.randomUUID(), expectedRevision: 1 }) })).status).toBe(202);
    for (let n = 0; n < 200; n++) {
      const v = (await (await fetch(api + `/attempts/${a.id}`, { headers: h })).json()).data;
      if (v.submissions.some((s: { status: string }) => s.status === "completed")) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    learners.push({ email: l.email, name });
  }

  const instructor = await sessionFor(browser, info, teacher.email);
  const p = instructor.page;
  await p.goto(`/instructor/challenges/${c.data.id}`);
  await expect(p.getByTestId("submissions-panel")).toBeVisible();
  const rows = p.getByTestId("submission-row");
  await expect(rows).toHaveCount(2);
  await expect(p.getByTestId("submissions-panel")).toContainText("Ada Learner");
  await expect(p.getByTestId("submissions-panel")).toContainText("Bo Learner");
  await expect(p.getByTestId("submissions-panel")).not.toContainText("@example.test");
  await rows.filter({ hasText: "Ada Learner" }).click();
  const detail = p.getByTestId("submission-detail");
  await expect(detail).toBeVisible();
  await expect(detail.getByTestId("submission-outcome")).toContainText("Passed");
  await expect(detail.getByTestId("submission-components").getByRole("listitem").first()).toBeVisible();
  const send = detail.getByTestId("feedback-send");
  await expect(send).toBeDisabled();
  await detail.getByLabel("Write feedback for Ada Learner").fill("Put a cache in front of the database <b>now</b>.");
  await send.click();
  await expect(detail.getByTestId("feedback-notice")).toContainText("Feedback sent");
  await expect(detail.getByTestId("feedback-item")).toHaveCount(1);
  await expect(detail.getByTestId("feedback-item")).toContainText("<b>now</b>");
  await expect(rows.filter({ hasText: "Ada Learner" })).toContainText("1 note");
  await expect(rows.filter({ hasText: "Bo Learner" })).toContainText("0 notes");
  expect(await noOverflow(p)).toBe(true);
  await p.setViewportSize({ width: 390, height: 844 });
  expect(await noOverflow(p)).toBe(true);
  expect(instructor.errors).toEqual([]);

  // Ada reads it on her attempt page; Bo sees nothing.
  const ada = await sessionFor(browser, info, learners[0].email);
  await ada.page.goto("/challenges");
  await ada.page.getByRole("link", { name: title, exact: true }).click();
  await ada.page.getByRole("button", { name: "Start or resume private attempt" }).click();
  await expect(ada.page.getByTestId("attempt-feedback")).toContainText("Put a cache in front of the database <b>now</b>.");
  await expect(ada.page.getByTestId("attempt-feedback")).toContainText("Feedback Instructor");
  await expect(ada.page.getByTestId("attempt-feedback-item")).toHaveCount(1);
  expect(await noOverflow(ada.page)).toBe(true);
  expect(ada.errors).toEqual([]);

  const bo = await sessionFor(browser, info, learners[1].email);
  await bo.page.goto("/challenges");
  await bo.page.getByRole("link", { name: title, exact: true }).click();
  await bo.page.getByRole("button", { name: "Start or resume private attempt" }).click();
  await expect(bo.page.getByRole("heading", { name: "Your private attempt" })).toBeVisible();
  await expect(bo.page.getByTestId("attempt-feedback")).toHaveCount(0);
  expect(bo.errors).toEqual([]);

  // A learner who opens the Instructor page is refused.
  await bo.page.goto(`/instructor/challenges/${c.data.id}`);
  await expect(bo.page.getByTestId("role-gate-denied")).toBeVisible();
  await expect(bo.page.getByTestId("submissions-panel")).toHaveCount(0);
  for (const s of [instructor, ada, bo]) await s.context.close();
});
