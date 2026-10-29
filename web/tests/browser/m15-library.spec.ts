import { test, expect, type Page } from "@playwright/test";
const api = process.env.SF_API_URL ?? "http://localhost:5001/v1";

async function setup(page: Page, tag: string) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/register");
  await page.getByLabel("Name", { exact: true }).fill("M15 Library");
  await page.getByLabel("Email", { exact: true }).fill("m15l-" + Date.now() + "-" + tag + "@example.test");
  await page.getByLabel("Password", { exact: true }).fill("M15-Library-2026!");
  await page.locator("#reg-terms").check();
  const reg = page.waitForResponse((r) => r.url() === api + "/auth/register" && r.status() === 201);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  const token = (await (await reg).json()).data.accessToken as string;
  await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();
  return { errors, headers: { Authorization: "Bearer " + token } };
}

/** Real designs through the real API, so the list is exercised against genuine rows. */
async function seed(page: Page, headers: Record<string, string>, names: string[], description = "") {
  const templates = (await (await page.request.get(api + "/templates", { headers })).json()).data as Array<{ id: string; graph: unknown; traffic: unknown }>;
  const t = templates[0];
  const ids: string[] = [];
  for (const name of names) {
    const res = await page.request.post(api + "/designs", {
      headers,
      data: { schemaVersion: 1, name, description, source: "template", templateId: t.id, graph: t.graph, traffic: t.traffic },
    });
    expect(res.status()).toBe(201);
    ids.push((await res.json()).data.id);
  }
  return ids;
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}
const items = (page: Page) => page.getByTestId("library-item");
const card = (page: Page, name: string) => items(page).filter({ has: page.getByRole("heading", { name, exact: true }) });

test("M15.5 Designs lists every design, with honest state and no AI surface", async ({ page }, info) => {
  const { errors, headers } = await setup(page, "list-" + info.project.name);
  await seed(page, headers, ["Orders platform", "Billing service"], "Handles invoices");
  await page.goto("/designs");
  await expect(page.getByRole("heading", { level: 1, name: "Designs" })).toBeVisible();
  await expect(items(page)).toHaveCount(2);
  await expect(page.getByTestId("library-count")).toHaveText("2 designs");
  const orders = card(page, "Orders platform");
  await expect(orders).toContainText("Handles invoices");
  await expect(orders).toContainText("Revision 1");
  await expect(orders.getByText("No result yet", { exact: true })).toBeVisible();
  await expect(orders.getByRole("link", { name: "Open" })).toHaveAttribute("href", /\/designs\/[0-9a-f-]+\/edit$/);
  await expect(page.getByRole("button", { name: /Explain/ })).toHaveCount(0);
  await expect(page.getByText(/Later/)).toHaveCount(0);
  await noOverflow(page);
  expect(errors).toEqual([]);
});

test("M15.5 search is debounced, mirrored in the URL, survives reload and has a clear-filters way out", async ({ page }, info) => {
  const { headers } = await setup(page, "search-" + info.project.name);
  await seed(page, headers, ["Orders platform", "Billing service", "100% uptime_plan"]);
  await page.goto("/designs");
  await expect(items(page)).toHaveCount(3);
  await page.getByLabel("Search", { exact: true }).fill("bill");
  await expect(items(page)).toHaveCount(1);
  await expect(card(page, "Billing service")).toBeVisible();
  await expect(page).toHaveURL(/[?&]q=bill/);
  await expect(page.getByTestId("library-count")).toHaveText("1 design match");
  await page.reload();
  await expect(page.getByLabel("Search", { exact: true })).toHaveValue("bill");
  await expect(items(page)).toHaveCount(1);
  // LIKE wildcards in the box are matched literally, never as patterns.
  await page.getByLabel("Search", { exact: true }).fill("%");
  await expect(items(page)).toHaveCount(1);
  await expect(card(page, "100% uptime_plan")).toBeVisible();
  await page.getByLabel("Search", { exact: true }).fill("zzz-nothing");
  await expect(page.getByTestId("library-empty")).toContainText("No designs match");
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(items(page)).toHaveCount(3);
  await expect(page.getByLabel("Search", { exact: true })).toHaveValue("");
  await expect(page).not.toHaveURL(/q=/);
});

test("M15.5 sorting by name is applied by the server and kept in the URL", async ({ page }, info) => {
  const { headers } = await setup(page, "sort-" + info.project.name);
  await seed(page, headers, ["Charlie", "alpha", "Bravo"]);
  await page.goto("/designs");
  await expect(items(page).first().getByRole("heading")).toHaveText("Bravo"); // most recently created first by default
  await page.getByLabel("Sort by").selectOption("name");
  await expect(page).toHaveURL(/sort=name/);
  await expect(items(page).getByRole("heading")).toHaveText(["alpha", "Bravo", "Charlie"]);
});

test("M15.5 duplicate makes an independent copy; archive hides with undo and keeps the design", async ({ page }, info) => {
  const { errors, headers } = await setup(page, "act-" + info.project.name);
  const [id] = await seed(page, headers, ["Orders platform"]);
  await page.goto("/designs");
  await card(page, "Orders platform").getByRole("button", { name: "Duplicate" }).click();
  await expect(page.getByTestId("library-notice")).toContainText("Duplicated “Orders platform”");
  await expect(items(page)).toHaveCount(2);
  await expect(card(page, "Copy of Orders platform")).toBeVisible();

  await card(page, "Orders platform").getByRole("button", { name: "Archive" }).click();
  await expect(page.getByTestId("library-notice")).toContainText("versions, results and notes are kept");
  await expect(items(page)).toHaveCount(1);
  await expect(card(page, "Orders platform")).toHaveCount(0);
  // Hidden, not deleted: the design is still reachable and listed under Archived.
  expect((await page.request.get(api + "/designs/" + id, { headers })).status()).toBe(200);
  await page.getByLabel("Show").selectOption("archived");
  await expect(items(page)).toHaveCount(1);
  await expect(card(page, "Orders platform").getByText("Archived", { exact: true })).toBeVisible();
  await expect(card(page, "Orders platform").getByRole("button", { name: "Unarchive" })).toBeVisible();
  await page.getByLabel("Show").selectOption("active");
  await expect(items(page)).toHaveCount(1);

  // Undo straight after archiving restores it to the active list.
  await card(page, "Copy of Orders platform").getByRole("button", { name: "Archive" }).click();
  await expect(items(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByTestId("library-notice")).toContainText("Restored “Copy of Orders platform”");
  await expect(items(page)).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("M15.5 long lists are paged, 12 at a time", async ({ page }, info) => {
  test.skip(!/1440.*light/.test(info.project.name), "Seeds 13 designs once");
  const { headers } = await setup(page, "page-" + info.project.name);
  await seed(page, headers, Array.from({ length: 13 }, (_, i) => "Design " + String(i + 1).padStart(2, "0")));
  await page.goto("/designs?sort=name");
  await expect(items(page)).toHaveCount(12);
  await expect(page.getByText("Page 1 of 2")).toBeVisible();
  await expect(page.getByRole("button", { name: "Previous" })).toBeDisabled();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(items(page)).toHaveCount(1);
  await expect(card(page, "Design 13")).toBeVisible();
  await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();
});

test("M15.5 a failing list shows a local error with a retry, and never a global system screen", async ({ page }, info) => {
  await setup(page, "fail-" + info.project.name);
  let fail = true;
  await page.route("**/library/designs**", (route) =>
    fail ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { code: "INTERNAL", message: "boom" } }) }) : route.continue(),
  );
  await page.goto("/designs");
  await expect(page.getByRole("heading", { name: "Designs could not be loaded" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Designs" })).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByTestId("library-empty")).toContainText("No designs yet");
});
