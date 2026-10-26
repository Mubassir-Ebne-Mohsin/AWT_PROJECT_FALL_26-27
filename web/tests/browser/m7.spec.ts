import { test, expect, type Page } from "@playwright/test";
const api = process.env.SF_API_URL ?? "http://localhost:5001/v1";
async function setup(page: Page, tag: string, template = "Single-server MVP") {
  await page.goto("/register");
  await page.getByLabel("Name", { exact: true }).fill("M7 Traffic");
  await page
    .getByLabel("Email", { exact: true })
    .fill("m7-" + Date.now() + "-" + tag + "@example.test");
  await page.getByLabel("Password", { exact: true }).fill("M7-Traffic-2026!");
  await page.locator("#reg-terms").check();
  const reg = page.waitForResponse(
    (r) => r.url() === api + "/auth/register" && r.status() === 201,
  );
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  const token = (await (await reg).json()).data.accessToken;
  await expect(
    page.getByRole("button", { name: "Account menu", exact: true }),
  ).toBeVisible();
  await page.goto("/new/template");
  await page
    .getByRole("button", { name: "Use " + template, exact: true })
    .click();
  await expect(page.getByLabel("Component", { exact: true })).toBeVisible();
  const id = new URL(page.url()).pathname.split("/")[2],
    headers = { Authorization: "Bearer " + token };
  const read = async () =>
    (await (await page.request.get(api + "/designs/" + id, { headers })).json())
      .data;
  return { id, headers, read };
}
async function saved(page: Page) {
  await expect(
    page.getByRole("status").filter({ hasText: /^Saved ·/ }),
  ).toBeVisible();
}
async function traffic(page: Page) {
  await page.getByRole("link", { name: "Traffic", exact: true }).click();
  await expect(
    page.getByLabel("Average requests per second", { exact: true }),
  ).toBeVisible();
}
async function run(page: Page) {
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/simulate") && [200, 202].includes(r.status()),
  );
  await page.getByRole("button", { name: "Run test", exact: true }).click();
  const accepted = (await (await response).json()).data;
  await expect(page).toHaveURL(
    new RegExp("/results\\?run=" + accepted.run.id + "$"),
  );
  await expect(
    page.getByRole("heading", { name: "Model results", exact: true }),
  ).toBeVisible();
  return accepted.run;
}
test("M7 all presets and settings persist, undo/redo and region update work", async ({
  page,
}, info) => {
  const { read, headers } = await setup(page, "settings-" + info.project.name);
  await traffic(page);
  const catalog = (
    await (
      await page.request.get(api + "/simulation/catalog", { headers })
    ).json()
  ).data;
  expect(catalog.presets).toHaveLength(5);
  for (const preset of catalog.presets) {
    const p = page.getByRole("button", { name: new RegExp("^" + preset.name) });
    await p.click();
    await expect(p).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByLabel("Average requests per second", { exact: true }),
    ).toHaveValue(String(preset.traffic.rps));
  }
  await page
    .getByLabel("Average requests per second", { exact: true })
    .fill("825");
  await page.getByLabel("Burst multiplier", { exact: true }).fill("2");
  await page.getByLabel("p95 target", { exact: true }).fill("450");
  await page.getByLabel("Error budget", { exact: true }).selectOption("0.02");
  await page.getByLabel("Test length", { exact: true }).selectOption("30");
  await page
    .getByRole("button", { name: "Climbs all day", exact: true })
    .click();
  await page
    .getByLabel("Users are in", { exact: true })
    .selectOption("eu-west");
  await saved(page);
  const d = await read();
  expect(d.traffic).toMatchObject({
    rps: 825,
    burst: 2,
    sloP95: 450,
    errorBudget: 0.02,
    durationMin: 30,
    shape: "ramp",
    preset: "custom",
  });
  expect(
    d.graph.nodes
      .filter((n: { type: string }) => n.type === "client")
      .every(
        (n: { props: { region: string } }) => n.props.region === "eu-west",
      ),
  ).toBe(true);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await saved(page);
  expect((await read()).graph).not.toEqual(d.graph);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await saved(page);
  expect((await read()).graph).toEqual(d.graph);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    page.getByLabel("Average requests per second", { exact: true }),
  ).toHaveValue("825");
  await expect(page.getByLabel("Users are in", { exact: true })).toHaveValue(
    "eu-west",
  );
  await expect(page.getByLabel("Test length", { exact: true })).toHaveValue(
    "30",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "../docs/audit/m7-traffic-" + info.project.name + ".png",
    fullPage: true,
  });
  await page
    .getByLabel("Users are in", { exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "../docs/audit/m7-traffic-settings-" + info.project.name + ".png",
  });
});
test("M7 invalid fields block Run and saving, Escape recovers, zero load renders and reloads", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const { read } = await setup(page, "zero-" + info.project.name);
  await traffic(page);
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  const before = await read();
  await page
    .getByLabel("Average requests per second", { exact: true })
    .fill("");
  await expect(
    page.getByRole("button", { name: "Run test", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("alert").filter({ hasText: "Enter a number" }),
  ).toBeVisible();
  await page
    .getByLabel("Average requests per second", { exact: true })
    .press("Escape");
  await expect(
    page.getByLabel("Average requests per second", { exact: true }),
  ).toHaveValue(String(before.traffic.rps));
  await page
    .getByLabel("Average requests per second", { exact: true })
    .fill("0");
  await run(page);
  await expect(
    page.getByRole("heading", { name: "Passes comfortably", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Test timeline", exact: true }),
  ).toBeVisible();
  await page.getByText("Read timeline data", { exact: true }).click();
  await expect(
    page.getByRole("table", { name: "Recorded timeline samples" }),
  ).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: "Model results", exact: true }),
  ).toBeVisible();
  expect((await read()).traffic.rps).toBe(0);
  expect(errors).toEqual([]);
});
test("M7 server results expose metrics, paths, component editing, snapshot targets and stale recovery", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const { id, headers, read } = await setup(
    page,
    "results-" + info.project.name,
  );
  await traffic(page);
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page
    .getByLabel("Average requests per second", { exact: true })
    .fill("400");
  await page.getByLabel("Burst multiplier", { exact: true }).fill("1.2");
  await page.getByLabel("p95 target", { exact: true }).fill("300");
  const accepted = await run(page);
  const result = (
    await (
      await page.request.get(api + "/designs/" + id + "/runs/" + accepted.id, {
        headers,
      })
    ).json()
  ).data;
  expect(result.status).toBe("completed");
  expect(result.result.kind).toBe("simulation");
  for (const name of [
    "p50 latency",
    "p95 latency",
    "p99 latency",
    "Errors",
    "Served",
    "Bottleneck",
  ])
    await expect(
      page
        .locator(".readout")
        .filter({ has: page.getByText(name, { exact: true }) }),
    ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "How requests travel", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Component inspection", exact: true }),
  ).toBeVisible();
  const app = result.result.summary.nodes.find(
    (n: { type: string }) => n.type === "app",
  );
  await page.getByRole("button", { name: app.label, exact: true }).click();
  await page
    .getByRole("link", { name: "Edit " + app.label, exact: true })
    .click();
  await expect(page.getByLabel("Component", { exact: true })).toHaveValue(
    app.id,
  );
  await traffic(page);
  await page.getByLabel("p95 target", { exact: true }).fill("600");
  await saved(page);
  await page.getByRole("link", { name: "Results", exact: true }).click();
  await expect(page.getByText(/^Stale result —/)).toBeVisible();
  await expect(page.getByText("Target 300 ms", { exact: true })).toBeVisible();
  await run(page);
  await expect(page.getByText("Target 600 ms", { exact: true })).toBeVisible();
  await expect(page.getByText(/^Stale result —/)).toHaveCount(0);
  expect((await read()).traffic.sloP95).toBe(600);
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "../docs/audit/m7-results-" + info.project.name + ".png",
    fullPage: true,
  });
  await page
    .getByRole("heading", { name: "How requests travel", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "../docs/audit/m7-results-detail-" + info.project.name + ".png",
  });
});
test("M7 failed traffic save retains inputs and undo; retry and Run recover", async ({
  page,
}, info) => {
  const { id, read } = await setup(page, "429-" + info.project.name);
  await traffic(page);
  const original = await read();
  let posts = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/simulate")) posts++;
  });
  await page.route(api + "/designs/" + id, async (route) => {
    if (route.request().method() === "PATCH")
      await route.fulfill({
        status: 429,
        json: {
          error: { code: "RATE_LIMITED", message: "M7 retry traffic save" },
        },
      });
    else await route.continue();
  });
  await page
    .getByLabel("Average requests per second", { exact: true })
    .fill("975");
  await expect(
    page.getByText("M7 retry traffic save", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Run test", exact: true }).click();
  await expect(
    page.getByText("M7 retry traffic save", { exact: true }),
  ).toBeVisible();
  expect(posts).toBe(0);
  expect((await read()).traffic).toEqual(original.traffic);
  await expect(
    page.getByLabel("Average requests per second", { exact: true }),
  ).toHaveValue("975");
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeEnabled();
  await page.unroute(api + "/designs/" + id);
  await run(page);
  expect((await read()).traffic.rps).toBe(975);
});
test("M7 edits during a delayed save are flushed before Run", async ({
  page,
}, info) => {
  const { id, read } = await setup(page, "race-" + info.project.name);
  await traffic(page);
  let release!: () => void,
    entered!: () => void,
    held = false;
  const gate = new Promise<void>((r) => (release = r)),
    started = new Promise<void>((r) => (entered = r));
  await page.route(api + "/designs/" + id, async (route) => {
    if (route.request().method() === "PATCH" && !held) {
      held = true;
      entered();
      await gate;
    }
    await route.continue();
  });
  await page
    .getByLabel("Average requests per second", { exact: true })
    .fill("700");
  await started;
  await page.getByLabel("Burst multiplier", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Run test", exact: true }).click();
  release();
  await expect(
    page.getByRole("heading", { name: "Model results", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/^Stale result —/)).toHaveCount(0);
  const d = await read();
  expect(d.traffic).toMatchObject({ rps: 700, burst: 2 });
});
test("M7 409 keeps traffic draft and deliberate reapply preserves it", async ({
  page,
}, info) => {
  const { id, headers, read } = await setup(
    page,
    "conflict-" + info.project.name,
  );
  await traffic(page);
  const d = await read();
  const update = await page.request.patch(api + "/designs/" + id, {
    headers,
    data: { expectedRevision: d.revision, name: "Other tab changed" },
  });
  expect(update.status()).toBe(200);
  await page
    .getByLabel("Average requests per second", { exact: true })
    .fill("1125");
  await expect(
    page.getByText("Save conflict", { exact: false }).first(),
  ).toBeVisible();
  await expect(
    page.getByLabel("Average requests per second", { exact: true }),
  ).toHaveValue("1125");
  await page
    .getByRole("button", { name: "Inspect current saved version", exact: true })
    .click();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Reapply my draft deliberately", exact: true })
    .click();
  await saved(page);
  expect((await read()).traffic.rps).toBe(1125);
});
test("M7 real overload and replica increase change backend results", async ({
  page,
}, info) => {
  const { id, headers, read } = await setup(
    page,
    "overload-" + info.project.name,
  );
  await traffic(page);
  await page
    .getByLabel("Average requests per second", { exact: true })
    .fill("2000");
  await page.getByLabel("Burst multiplier", { exact: true }).fill("1");
  let accepted = await run(page);
  let result = (
    await (
      await page.request.get(api + "/designs/" + id + "/runs/" + accepted.id, {
        headers,
      })
    ).json()
  ).data;
  const initial = result.result.summary;
  expect(initial.verdict).toBe("fail");
  await page.getByRole("link", { name: "Edit", exact: true }).click();
  const d = await read(),
    app = d.graph.nodes.find((n: { type: string }) => n.type === "app");
  await page.getByLabel("Component", { exact: true }).selectOption(app.id);
  await page.getByLabel("Replicas (1–200)", { exact: true }).fill("4");
  accepted = await run(page);
  result = (
    await (
      await page.request.get(api + "/designs/" + id + "/runs/" + accepted.id, {
        headers,
      })
    ).json()
  ).data;
  expect(
    result.result.summary.nodes.find((n: { id: string }) => n.id === app.id)
      .rho,
  ).toBeLessThan(
    initial.nodes.find((n: { id: string }) => n.id === app.id).rho,
  );
});
test("M7 selected result fetch failure retries and never fabricates results", async ({
  page,
}, info) => {
  const { id } = await setup(page, "fetch-" + info.project.name);
  const accepted = await run(page);
  const url = api + "/designs/" + id + "/runs/" + accepted.id;
  await page.route(api + "/health", (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: "UNAVAILABLE", message: "M7 recovery test" } },
    }),
  );
  await page.route(url, (route) =>
    route.fulfill({
      status: 503,
      json: {
        error: { code: "UNAVAILABLE", message: "M7 result unavailable" },
      },
    }),
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(".sys-title")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Model results", exact: true }),
  ).toHaveCount(0);
  await page.unroute(url);
  await page.unroute(api + "/health");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: "Model results", exact: true }),
  ).toBeVisible();
});

test("M7 traffic history survives reauthentication and is cleared on logout", async ({
  page,
}, info) => {
  const { id, headers, read } = await setup(
    page,
    "session-" + info.project.name,
  );
  await traffic(page);
  const owner = (
    await (await page.request.get(api + "/auth/me", { headers })).json()
  ).data;
  await page.route(api + "/designs/" + id, async (route) => {
    if (route.request().method() === "PATCH")
      await route.fulfill({
        status: 401,
        json: { error: { code: "SESSION_EXPIRED", message: "M7 expired" } },
      });
    else await route.continue();
  });
  await page.route(api + "/auth/refresh", (route) =>
    route.fulfill({
      status: 401,
      json: { error: { code: "SESSION_EXPIRED", message: "M7 expired" } },
    }),
  );
  await page
    .getByLabel("Average requests per second", { exact: true })
    .fill("725");
  await expect(
    page.getByRole("alertdialog", {
      name: "Your session expired",
      exact: true,
    }),
  ).toBeVisible();
  await page.unroute(api + "/designs/" + id);
  await page.unroute(api + "/auth/refresh");
  await page.locator("#sess-pw").fill("M7-Traffic-2026!");
  await page.getByRole("button", { name: "Log in again", exact: true }).click();
  await expect(
    page.getByRole("alertdialog", {
      name: "Your session expired",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Average requests per second", { exact: true }),
  ).toHaveValue("725");
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await saved(page);
  expect((await read()).traffic.rps).toBe(725);
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Log out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Account menu", exact: true }),
  ).toHaveCount(0);
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(owner.email);
  await page.getByLabel("Password", { exact: true }).fill("M7-Traffic-2026!");
  await page
    .locator("form")
    .getByRole("button", { name: "Log in", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Account menu", exact: true }),
  ).toBeVisible();
  await page.goto("/designs/" + id + "/traffic");
  await expect(
    page.getByLabel("Average requests per second", { exact: true }),
  ).toHaveValue("725");
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeDisabled();
});

test("M7 maximum supported traffic and keyboard controls stay finite and within the viewport", async ({
  page,
}, info) => {
  await setup(page, "bounds-" + info.project.name);
  await traffic(page);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page
    .getByLabel("Average requests per second", { exact: true })
    .fill("10000000");
  await page.getByLabel("Burst multiplier", { exact: true }).fill("100");
  await page.getByLabel("p95 target", { exact: true }).fill("60000");
  await page.getByLabel("Reads percentage", { exact: true }).focus();
  await page.keyboard.press("End");
  await page.getByLabel("Test length", { exact: true }).selectOption("60");
  await run(page);
  await expect(
    page.getByRole("heading", { name: "Breaks under this load", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".m7-chart")).toBeVisible();
  expect(
    await page
      .locator(".m7-chart")
      .evaluate(
        (el) =>
          el.outerHTML.includes("NaN") || el.outerHTML.includes("Infinity"),
      ),
  ).toBe(false);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("M7 queue backlog, background failures and cross-region details use actual model outputs", async ({
  page,
}, info) => {
  const { id, headers, read } = await setup(
    page,
    "analysis-" + info.project.name,
    "Write-heavy ingest pipeline",
  );
  const d = await read(),
    worker = d.graph.nodes.find((n: { type: string }) => n.type === "worker");
  await page.getByLabel("Component", { exact: true }).selectOption(worker.id);
  await page.getByLabel("Replicas (1–200)", { exact: true }).fill("1");
  await page.getByLabel("Capacity per replica", { exact: true }).fill("1");
  await traffic(page);
  await page
    .getByLabel("Users are in", { exact: true })
    .selectOption("ap-south");
  const accepted = await run(page);
  const record = (
    await (
      await page.request.get(api + "/designs/" + id + "/runs/" + accepted.id, {
        headers,
      })
    ).json()
  ).data;
  expect(record.result.summary.queues.length).toBeGreaterThan(0);
  expect(
    record.result.summary.queues.some(
      (q: { state: string }) => q.state === "growing",
    ),
  ).toBe(true);
  expect(record.result.summary.backgroundIssues.length).toBeGreaterThan(0);
  expect(record.result.summary.crossRegion.length).toBeGreaterThan(0);
  for (const name of [
    "Background queues",
    "Background failures",
    "Cross-region calls",
  ])
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
  await page
    .getByRole("heading", { name: "Background queues", exact: true })
    .scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "../docs/audit/m7-background-" + info.project.name + ".png",
  });
});
