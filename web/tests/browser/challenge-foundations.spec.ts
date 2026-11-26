import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import challenges from "../fixtures/foundation-challenges.json";
const attemptId = "90000000-0000-4000-8000-000000000001",
  designId = "90000000-0000-4000-8000-000000000002",
  uid = "90000000-0000-4000-8000-000000000003";
async function fixture(
  page: Page,
  context: BrowserContext,
  signedIn = false,
  instructor = false,
) {
  await context.clearCookies();
  const origin = new URL(process.env.SF_WEB_URL ?? "http://localhost:3000")
    .origin;
  if (signedIn)
    await context.addCookies([{ name: "sf_session", value: "1", url: origin }]);
  let failCatalog = false,
    failProgress = false,
    secondAccount = false,
    completed = false, rejectRules = false;
  const errors: string[] = [],
    requests: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/v1/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      p = url.pathname;
    requests.push(p);
    let data: unknown = {};
    if (p === "/v1/challenges") {
      if (failCatalog) {
        failCatalog = false;
        return route.fulfill({
          status: 503,
          json: {
            error: { code: "UNAVAILABLE", message: "Controlled outage" },
          },
        });
      }
      data = challenges;
    } else if (p.startsWith("/v1/challenges/") && p.endsWith("/attempt"))
      data = {
        id: attemptId,
        challengeId: challenges[0].id,
        designId,
        createdAt: "2026-11-26T00:00:00Z",
      };
    else if (p.startsWith("/v1/challenges/"))
      data = challenges.find((c) => c.id === p.split("/").at(-1));
    else if (p.endsWith("/auth/refresh") || p.endsWith("/auth/me")) {
      const user = {
        id: secondAccount ? uid.replace(/3$/, "4") : uid,
        email: "builder@example.test",
        displayName: secondAccount ? "Second builder" : "Practice builder",
        role: "user",
      };
      data = p.endsWith("/refresh")
        ? { accessToken: "controlled-test-token", expiresIn: 900, user }
        : user;
    } else if (p.endsWith("/auth/providers"))
      data = { google: false, github: false };
    else if (p.endsWith("/account/roles"))
      data = { roles: instructor ? ["user", "instructor"] : ["user"] };
    else if (p === "/v1/instructor/challenges") data = [];
    else if (p.startsWith("/v1/designs") || p.startsWith("/v1/library/designs"))
      return route.fulfill({
        json: { data: [], meta: { page: 1, total: 0, limit: 20 } },
      });
    else if (p === "/v1/progress/challenges") {
      if (failProgress)
        return route.fulfill({
          status: 503,
          json: {
            error: {
              code: "UNAVAILABLE",
              message: "Controlled progress outage",
            },
          },
        });
      const items = secondAccount
        ? []
        : [
            {
              attemptId,
              challengeId: challenges[0].id,
              designId,
              title: challenges[0].title,
              archived: false,
              goal: challenges[0].goal,
              passed: completed,
              best: null,
              submissions: [],
            },
          ];
      data = {
        attempted: items.length,
        passed: completed && !secondAccount ? 1 : 0,
        items,
      };
    } else if (p.endsWith("/submissions") && req.method() === "POST") {
      if (rejectRules) return route.fulfill({status:422,json:{error:{code:"VALIDATION_FAILED",message:"This design is outside the challenge rules",details:{reason:"EXERCISE_RULES",issues:[{message:"App servers permits at most 3 replicas"}]}}}});
      completed = true;
      return route.fulfill({
        status: 202,
        json: {
          data: {
            id: "submission",
            attemptId,
            requestId: req.postDataJSON().requestId,
            designRevision: 1,
            status: "pending",
            passes: null,
            p95: null,
            errorRate: null,
            engineVersion: null,
            createdAt: "2026-11-26T00:00:00Z",
            completedAt: null,
          },
        },
      });
    } else if (p.startsWith("/v1/attempts/"))
      data = {
        attempt: {
          id: attemptId,
          challengeId: challenges[0].id,
          designId,
          createdAt: "2026-11-26T00:00:00Z",
        },
        challenge: {
          title: challenges[0].title,
          archived: false,
          goal: challenges[0].goal,
        },
        submissions: completed
          ? [
              {
                id: "submission",
                attemptId,
                requestId: "request",
                designRevision: 1,
                status: "completed",
                passes: true,
                p95: 42.72,
                errorRate: 0,
                engineVersion: "reference-port-v1",
                rulesVersion: 1,
                modelVerdict: "pass",
                createdAt: "2026-11-26T00:00:00Z",
                completedAt: "2026-11-26T00:00:01Z",
              },
            ]
          : [],
        feedback: [],
      };
    return route.fulfill({ json: { data } });
  });
  return {
    errors,
    requests,
    rejectRules: () => { rejectRules = true; },
    failCatalog: () => {
      failCatalog = true;
    },
    failProgress: (v: boolean) => {
      failProgress = v;
    },
    second: () => {
      secondAccount = true;
    },
  };
}
test("Challenge cards are styled, responsive, searchable and filterable", async ({
  page,
  context,
}, info) => {
  const f = await fixture(page, context);
  await page.goto("/challenges");
  await expect(page.locator(".challenge-card")).toHaveCount(6);
  for (const width of [1440, 1024, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect
      .poll(() =>
        page
          .locator(".challenge-grid")
          .evaluate(
            (e) => getComputedStyle(e).gridTemplateColumns.split(" ").length,
          ),
      )
      .toBe(width > 1100 ? 3 : width > 650 ? 2 : 1);
    await expect(page.locator(".challenge-card").first()).toHaveCSS(
      "border-top-width",
      "1px",
    );
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    if (width === 1440 || width === 320)
      await page.screenshot({
        path: info.outputPath(`challenges-${width}.png`),
        animations: "disabled",
      });
  }
  await page.getByLabel("Search challenges").fill("catalogue");
  await expect(page.locator(".challenge-card")).toHaveCount(1);
  await page
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption("Regions");
  await expect(
    page.getByRole("heading", { name: "No matching challenges" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(page.locator(".challenge-card")).toHaveCount(6);
  await page
    .getByRole("combobox", { name: "Difficulty", exact: true })
    .selectOption("beginner");
  await expect(page.locator(".challenge-card")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Reset filters", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Sort", exact: true })
    .selectOption("title");
  await expect(page.locator(".challenge-card h2").first()).toHaveText(
    [...challenges].sort((a, b) => a.title.localeCompare(b.title))[0].title,
  );
  expect(f.errors).toEqual([]);
});
test("Challenge briefing explains fixed workload, bounded edits, hints and safe guest return", async ({
  page,
  context,
}) => {
  const f = await fixture(page, context);
  await page.goto("/challenges/" + challenges[0].id);
  await expect(
    page.getByRole("heading", { name: "Your mission" }),
  ).toBeVisible();
  await expect(page.getByText("600 rps total", { exact: true })).toBeVisible();
  await expect(page.getByText(/1–3 replicas/)).toBeVisible();
  for (let n = 1; n <= 3; n++)
    await page
      .getByRole("button", { name: "Reveal hint " + n, exact: true })
      .click();
  await expect(page.getByText("All three hints are open.")).toBeVisible();
  await expect(page.locator('a[href="/learn/app-servers"]')).toHaveAttribute(
    "href",
    "/learn/app-servers",
  );
  const login = page.getByRole("link", {
    name: "Log in to start",
    exact: true,
  });
  await login.focus();
  await login.press("Enter");
  await expect(page).toHaveURL(/\/login\?next=/);
  expect(f.errors).toEqual([]);
});
test("Private progress, saved submission and account switch do not leak prior results", async ({
  page,
  context,
}) => {
  const f = await fixture(page, context, true);
  await page.goto("/challenges");
  await expect(
    page.getByRole("link", { name: "Continue latest attempt", exact: false }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Continue attempt", exact: false })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Your private attempt" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Edit and save your attempt" }),
  ).toHaveAttribute("href", `/designs/${designId}/edit?attempt=${attemptId}`);
  await page
    .getByRole("button", { name: "Submit saved revision", exact: true })
    .click();
  await expect(page.getByText(/Passed · p95 42.72/)).toBeVisible();
  await expect(page.getByText(/Exercise rules v1/)).toBeVisible();
  await page.goto("/challenges");
  await expect(
    page
      .locator(".challenge-card")
      .first()
      .getByText("Passed", { exact: true }),
  ).toBeVisible();
  f.second();
  await page.reload();
  await expect(
    page.locator(".challenge-card").getByText("Passed", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.locator(".challenge-card").getByText("Not started", { exact: true }),
  ).toHaveCount(6);
  expect(f.errors).toEqual([]);
});
test("Catalog and progress failures stay local and support retry", async ({
  page,
  context,
}) => {
  const f = await fixture(page, context, true);
  f.failCatalog();
  f.failProgress(true);
  await page.goto("/challenges");
  await expect(
    page.getByRole("heading", { name: "Challenges", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Challenges could not be loaded.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.locator(".challenge-card")).toHaveCount(6);
  await expect(
    page.locator(".challenge-card").getByText("Not started", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: "Progress", exact: true }),
  ).toBeDisabled();
  f.failProgress(false);
  await page
    .getByRole("button", { name: "Retry progress", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Progress", exact: true }),
  ).toBeEnabled();
  expect(f.errors).toEqual([]);
});
test("Instructor authoring has bounded profile choices and editable learning fields", async ({
  page,
  context,
}) => {
  const f = await fixture(page, context, true, true);
  await page.goto("/instructor/challenges");
  await page
    .getByRole("button", { name: "New challenge", exact: true })
    .click();
  await page
    .getByText("Learning guide and exercise rules", { exact: true })
    .click();
  await page
    .getByRole("combobox", { name: /Exercise profile/ })
    .selectOption("scale-app");
  await page.getByLabel("Add a learning guide", { exact: false }).check();
  await page
    .getByLabel("Learning objective", { exact: true })
    .fill("Scale replicas without changing service limits.");
  await page
    .getByLabel("Learn topic IDs (comma separated)", { exact: true })
    .fill("scaling");
  await page
    .getByLabel("Learn topic IDs (comma separated)", { exact: true })
    .pressSequentially(",utilization");
  await expect(
    page.getByLabel("Learn topic IDs (comma separated)", { exact: true }),
  ).toHaveValue("scaling,utilization");
  await expect(page.getByLabel("Hint 1", { exact: true })).toBeVisible();
  expect(f.errors).toEqual([]);
});

 test("Rule rejection explains the repair without inventing a graded result", async ({page,context}) => {
 const f=await fixture(page,context,true);f.rejectRules();await page.goto(`/challenges/${challenges[0].id}?attempt=${attemptId}`);
 await page.getByRole("button",{name:"Submit saved revision",exact:true}).click();await expect(page.getByText(/App servers permits at most 3 replicas/)).toBeVisible();await expect(page.getByText(/No graded submission was used/)).toBeVisible();await expect(page.getByText(/Passed · p95/)).toHaveCount(0);expect(f.errors).toEqual([]);
 });
