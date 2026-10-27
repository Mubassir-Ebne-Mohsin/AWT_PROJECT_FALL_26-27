import { test, expect, type Page } from "@playwright/test";
const api = process.env.SF_API_URL ?? "http://localhost:5001/v1";
async function setup(page: Page, tag: string) {
  await page.goto("/register");
  await page.getByLabel("Name", { exact: true }).fill("M9 Acceptance");
  await page
    .getByLabel("Email", { exact: true })
    .fill("m9-" + Date.now() + "-" + tag + "@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("M9-Acceptance-Only!");
  await page.locator("#reg-terms").check();
  const registered = page.waitForResponse(
    (r) => r.url() === api + "/auth/register" && r.status() === 201,
  );
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  const auth = (await (await registered).json()).data;
  await expect(
    page.getByRole("button", { name: "Account menu", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("me-card")).toContainText("M9 Acceptance");
  await expect(page.locator(".readouts .readout .v").first()).toHaveText("0");
  await page.screenshot({ path: "../docs/audit/m9-dashboard-" + tag + ".png" });
  await page.goto("/new/template");
  await expect(page.getByRole("button", { name: "Use Single-server MVP", exact: true })).toBeVisible();
  await page.screenshot({ path: "../docs/audit/m9-templates-" + tag + ".png" });
  await page
    .getByRole("button", { name: "Use Single-server MVP", exact: true })
    .click();
  await expect(page).toHaveURL(/\/designs\/[0-9a-f-]+\/edit/);
  await expect(page.getByLabel("Component", { exact: true })).toBeVisible();
  const id = new URL(page.url()).pathname.split("/")[2],
    headers = { Authorization: "Bearer " + auth.accessToken };
  const read = async () =>
    (await (await page.request.get(api + "/designs/" + id, { headers })).json())
      .data;
  const fetchRun = async (runId: string) => {
    for (let i = 0; i < 60; i++) {
      const r = (
        await (
          await page.request.get(api + "/designs/" + id + "/runs/" + runId, {
            headers,
          })
        ).json()
      ).data;
      if (r.status !== "pending") return r;
      await page.waitForTimeout(100);
    }
    throw Error("Run did not terminate");
  };
  return { id, headers, read, fetchRun };
}
async function saved(page: Page) {
  await expect(
    page.getByRole("status").filter({ hasText: /^Saved ·/ }),
  ).toBeVisible();
}
async function calculate(page: Page, kind: "simulation" | "limits") {
  const endpoint = kind === "simulation" ? "/simulate" : "/limits";
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith(endpoint) &&
      r.request().method() === "POST" &&
      [200, 202].includes(r.status()),
  );
  await page
    .getByRole("button", {
      name: kind === "simulation" ? "Run test" : "Find limits",
      exact: true,
    })
    .click();
  const run = (await (await response).json()).data.run;
  await expect(page).toHaveURL(
    new RegExp((kind === "simulation" ? "run" : "limits") + "=" + run.id),
  );
  return run;
}
test("M9 component palette has readable names and discoverable scrolling at laptop widths", async ({
  page,
}, info) => {
  const { read } = await setup(page, "palette-" + info.project.name);
  const palette = page.getByRole("complementary", {
    name: "Component palette",
    exact: true,
  });
  await expect(palette.locator(".pal-item")).toHaveCount(12);
  for (const label of await palette.locator(".pal-item .nm").all()) {
    await label.scrollIntoViewIfNeeded();
    await expect(label).toBeVisible();
    expect(
      await label.evaluate((e) => e.getBoundingClientRect().width > 0),
    ).toBe(true);
  }
  await expect(palette.getByText(/12 component types/)).toBeVisible();
  const d = await read();
  const last = palette.getByRole("button").last();
  await last.focus();
  await page.keyboard.press("Enter");
  await saved(page);
  expect((await read()).graph.nodes).toHaveLength(d.graph.nodes.length + 1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "../docs/audit/m9-palette-" + info.project.name + ".png",
  });
});
test("M9 complete saved simulation, improvement, live overlay and Limits journey stays kind-aware", async ({
  page,
}, info) => {
  const { id, fetchRun, read } = await setup(
    page,
    "journey-" + info.project.name,
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.getByRole("link", { name: "Traffic", exact: true }).click();
  await page
    .getByLabel("Average requests per second", { exact: true })
    .fill("400");
  await page.getByLabel("Burst multiplier", { exact: true }).fill("1.2");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "../docs/audit/m9-traffic-" + info.project.name + ".png" });
  const first = await calculate(page, "simulation");
  const before = await fetchRun(first.id);
  expect(before.status).toBe("completed");
  await expect(
    page.getByRole("heading", { name: "Model results", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Edit", exact: true }).click();
  const d = await read(),
    app = d.graph.nodes.find((n: { type: string }) => n.type === "app");
  await page.getByLabel("Component", { exact: true }).selectOption(app.id);
  await page.getByLabel("Replicas (1–200)", { exact: true }).fill("4");
  const second = await calculate(page, "simulation");
  const improved = await fetchRun(second.id);
  expect(improved.result.summary.p95).toBeLessThan(before.result.summary.p95);
  await expect(
    page.getByRole("heading", { name: "Model results", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "../docs/audit/m9-results-" + info.project.name + ".png",
  });
  await page.getByRole("link", { name: "Edit", exact: true }).click();
  const preview = page.waitForResponse(
    (r) => r.url() === api + "/simulation/preview" && r.status() === 200,
  );
  await page.getByRole("button", { name: "Load (L)", exact: true }).click();
  await preview;
  await expect(
    page.getByText("Live preview — unsaved inputs").first(),
  ).toBeVisible();
  expect(
    await page
      .locator(".cv-legend")
      .evaluate(
        (e) =>
          e.getBoundingClientRect().right <=
          e.parentElement!.querySelector(".cv-mini")!.getBoundingClientRect()
            .left -
            8,
      ),
  ).toBe(true);
  await page.screenshot({
    path: "../docs/audit/m9-edit-" + info.project.name + ".png",
  });
  await page.getByRole("link", { name: "Limits", exact: true }).click();
  const limits = await calculate(page, "limits");
  const limitResult = await fetchRun(limits.id);
  expect(limitResult.result.kind).toBe("limits");
  await expect(
    page.getByText("Saturation order", { exact: true }),
  ).toBeVisible();
  const headlines = page.locator(".m9-limits-readouts .v");
  await expect(headlines).toHaveCount(4);
  for (const value of await headlines.all()) {
    expect(
      await value.evaluate(
        (e) =>
          e.scrollWidth <= e.clientWidth + 1 &&
          getComputedStyle(e).whiteSpace !== "nowrap",
      ),
    ).toBe(true);
  }
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    page.getByText("Saturation order", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "../docs/audit/m9-limits-" + info.project.name + ".png",
  });
  await page.getByRole("link", { name: "Results", exact: true }).click();
  await expect(page).toHaveURL(new RegExp("run=" + second.id));
  await expect(
    page.getByRole("heading", { name: "Model results", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Dashboard", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId("me-card")).toBeVisible();
  await page.screenshot({ path: "../docs/audit/m9-dashboard-populated-" + info.project.name + ".png" });
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Log out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Account menu", exact: true }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(id).toMatch(/^[0-9a-f-]{36}$/);
});
test("M9 lost save acknowledgement produces a safe inspectable conflict without discarding the draft", async ({
  page,
}, info) => {
  const { id, read } = await setup(page, "lost-ack-" + info.project.name);
  await page.getByRole("link", { name: "Traffic", exact: true }).click();
  let first = true;
  await page.route(api + "/designs/" + id, async (route) => {
    if (first && route.request().method() === "PATCH") {
      first = false;
      await route.fetch();
      await route.abort("connectionreset");
    } else await route.continue();
  });
  await page
    .getByLabel("Average requests per second", { exact: true })
    .fill("975");
  await expect(
    page.getByLabel("Average requests per second", { exact: true }),
  ).toHaveValue("975");
  await expect(
    page.getByRole("button", { name: "Save", exact: true }),
  ).toBeEnabled();
  await expect.poll(async () => (await read()).revision).toBe(2);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Inspect current saved version",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Average requests per second", { exact: true }),
  ).toHaveValue("975");
  expect((await read()).traffic.rps).toBe(975);
  await page
    .getByRole("button", { name: "Inspect current saved version", exact: true })
    .click();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Discard draft and reload", exact: true })
    .click();
  await saved(page);
  await expect(
    page.getByLabel("Average requests per second", { exact: true }),
  ).toHaveValue("975");
  expect((await read()).revision).toBe(2);
});
