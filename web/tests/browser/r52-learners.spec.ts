import {
  test,
  expect,
  type Page,
} from "@playwright/test";
import { execFileSync } from "node:child_process";
const api = process.env.SF_API_URL ?? "http://localhost:5001/v1";
const PASSWORD = "R5-Challenges-2026!";

// There is deliberately no website path to the Instructor role. These journeys give their own throwaway account the role
// straight in Postgres, through the test container named in the environment (SF_PG_CONTAINER, SF_PG_USER, SF_PG_DB).
const pg = {
  container: process.env.SF_PG_CONTAINER,
  user: process.env.SF_PG_USER,
  db: process.env.SF_PG_DB,
};
const canPromote = !!(pg.container && pg.user && pg.db);
function makeInstructor(email: string) {
  execFileSync(
    "docker",
    [
      "exec",
      pg.container!,
      "psql",
      "-U",
      pg.user!,
      "-d",
      pg.db!,
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      `INSERT INTO user_roles(user_id, role, granted_by, granted_at) SELECT id, 'instructor', NULL, now() FROM users WHERE email = '${email}'`,
    ],
    { stdio: "pipe" },
  );
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
  const reg = page.waitForResponse(
    (r) => r.url() === api + "/auth/register" && r.status() === 201,
  );
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  const token = (await (await reg).json()).data.accessToken as string;
  await expect(
    page.getByRole("button", { name: "Account menu", exact: true }),
  ).toBeVisible();
  return { errors, email, token };
}
// Plain fetch, not page.request: the browser's request context shares cookies with the page, and registering here
// would replace the signed-in person's refresh cookie with the new account's.
async function registerViaApi(name: string, tag: string) {
  const email = "r5-" + Date.now() + "-" + tag + "@example.test";
  const res = await fetch(api + "/auth/register", {
    method: "POST",
    headers: json,
    body: JSON.stringify({ email, password: PASSWORD, displayName: name }),
  });
  expect(res.status).toBe(201);
  return { email };
}
const noOverflow = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth <=
      document.documentElement.clientWidth + 1,
  );

test("R5.2 browse, private attempt, saved submission and permanent progress", async ({
  page,
}, info) => {
  test.skip(!canPromote, "Requires isolated Postgres settings");
  const teacher = await registerViaApi(
    "Learner Test Instructor",
    info.project.name,
  );
  makeInstructor(teacher.email);
  const login = await (
    await fetch(api + "/auth/login", {
      method: "POST",
      headers: json,
      body: JSON.stringify({ email: teacher.email, password: PASSWORD }),
    })
  ).json();
  const headers = {
    ...json,
    Authorization: `Bearer ${login.data.accessToken}`,
  };
  const templates = await (await fetch(api + "/templates", { headers })).json();
  const t = templates.data[0];
  const d = await (
    await fetch(api + "/designs", {
      method: "POST",
      headers,
      body: JSON.stringify({
        schemaVersion: 1,
        name: "Starter",
        description: "Test",
        source: "template",
        templateId: t.id,
        graph: t.graph,
        traffic: t.traffic,
      }),
    })
  ).json();
  const title = "Learner goal " + Date.now();
  const c = await (
    await fetch(api + "/instructor/challenges", {
      method: "POST",
      headers,
      body: JSON.stringify({
        title,
        summary: "Meet the fixed targets",
        goal: { p95Ms: 60000, errorRate: 1 },
        traffic: {
          preset: "custom",
          rps: 1,
          burst: 1,
          readRatio: 0.8,
          durationMin: 10,
          shape: "steady",
        },
        from: { designId: d.data.id },
      }),
    })
  ).json();
  expect(
    (
      await fetch(api + `/instructor/challenges/${c.data.id}/publish`, {
        method: "POST",
        headers,
      })
    ).status,
  ).toBe(200);
  const learner = await signUp(page, "Learner", info.project.name);
  await page.goto("/challenges");
  await page.getByRole("link", { name: title, exact: true }).click();
  await page
    .getByRole("button", { name: "Start or resume private attempt" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your private attempt" }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Edit and save your attempt", exact: true })
    .click();
  await expect(page.getByText(/Challenge attempt:/)).toBeVisible();
  await page
    .getByLabel("Design name", { exact: true })
    .fill("My saved solution");
  await expect(
    page.getByRole("link", {
      name: "Return to challenge and submit",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Return to challenge and submit", exact: true })
    .click();
  let lost = false;
  await page.route(api + "/attempts/*/submissions", async (route) => {
    const response = await route.fetch();
    if (!lost) {
      lost = true;
      await route.abort();
    } else await route.fulfill({ response });
  });
  await page
    .getByRole("button", { name: "Submit saved revision", exact: true })
    .click();
  await expect(page.getByText(/Submission was not confirmed/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Revision 2 · Passed/)).toBeVisible();
  await page
    .getByRole("button", { name: "Submit saved revision", exact: true })
    .click();
  await expect(
    page.getByText("Recovered the recorded submission."),
  ).toBeVisible();
  expect(await page.getByText(/Revision 2 · Passed/).count()).toBe(1);
  await page.getByRole("link", { name: "My progress", exact: true }).click();
  await expect(page.getByText(/1 passed · 1 attempted/)).toBeVisible();
  expect(await noOverflow(page)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await noOverflow(page)).toBe(true);
  expect(learner.errors).toEqual([]);
});
