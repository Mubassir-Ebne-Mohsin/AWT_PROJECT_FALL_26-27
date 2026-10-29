import { test, expect, type Page } from "@playwright/test";
const api = process.env.SF_API_URL ?? "http://localhost:5001/v1";

async function setup(page: Page, tag: string) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/register");
  await page.getByLabel("Name", { exact: true }).fill("M15 History");
  await page.getByLabel("Email", { exact: true }).fill("m15-" + Date.now() + "-" + tag + "@example.test");
  await page.getByLabel("Password", { exact: true }).fill("M15-History-2026!");
  await page.locator("#reg-terms").check();
  const reg = page.waitForResponse((r) => r.url() === api + "/auth/register" && r.status() === 201);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  const token = (await (await reg).json()).data.accessToken as string;
  await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();
  return { errors, headers: { Authorization: "Bearer " + token } };
}
async function openTemplate(page: Page) {
  await page.goto("/new/template");
  await page.getByRole("button", { name: "Use Single-server MVP", exact: true }).click();
  await expect(page.getByLabel("Component", { exact: true })).toBeVisible();
  return new URL(page.url()).pathname.split("/")[2];
}
const saved = (page: Page) => expect(page.getByRole("status").filter({ hasText: /^Saved ·/ })).toBeVisible({ timeout: 15_000 });
const rps = (page: Page) => page.getByLabel("Average requests per second", { exact: true });
async function setRps(page: Page, value: string) {
  await page.getByRole("link", { name: /^Traffic/ }).click();
  await rps(page).fill(value);
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}
const history = (page: Page) => page.getByRole("region", { name: "Version history" });
const version = (page: Page, revision: number) => history(page).getByRole("listitem").filter({ has: page.getByRole("heading", { name: `Revision ${revision}`, exact: true }) });
const openHistory = async (page: Page) => {
  await page.getByRole("link", { name: /^History/ }).click();
  await expect(history(page)).toBeVisible();
};

test("M15 History is a real tab: honest retention text, baseline-free single version, no restore for the current version", async ({ page }, info) => {
  const { errors } = await setup(page, "single-" + info.project.name);
  await openTemplate(page);
  const tab = page.getByRole("link", { name: /^History/ });
  await expect(tab).not.toContainText("Later");
  await openHistory(page);
  await expect(history(page).getByText(/latest 100 versions are kept; older ones may be removed/i)).toBeVisible();
  await expect(history(page).getByText("Revision 1 is current")).toBeVisible();
  await expect(version(page, 1).getByText("Current", { exact: true })).toBeVisible();
  await expect(version(page, 1).getByText("Created", { exact: true })).toBeVisible();
  await expect(history(page).getByText(/Only the current version exists so far/)).toBeVisible();
  await expect(history(page).getByRole("button", { name: /^Restore revision/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Explain this result/ })).toHaveCount(0); // AI stays out of History
  await noOverflow(page);
  expect(errors).toEqual([]);
});

test("M15 restore saves an old version as a NEW revision, keeps history and recorded runs, and the editor follows", async ({ page }, info) => {
  const { headers } = await setup(page, "restore-" + info.project.name);
  const id = await openTemplate(page);
  await setRps(page, "777");
  await saved(page);
  const accepted = page.waitForResponse((r) => r.url().endsWith("/simulate") && [200, 202].includes(r.status()));
  await page.getByRole("button", { name: "Run test", exact: true }).click();
  const run = (await (await accepted).json()).data.run;
  await expect(page).toHaveURL(new RegExp("/results\\?run=" + run.id));
  await expect(page.getByRole("heading", { name: "Topology under load" })).toBeVisible({ timeout: 30_000 });
  await openHistory(page);
  await expect(version(page, 2).getByText("Saved edit", { exact: true })).toBeVisible();
  await expect(version(page, 2).getByRole("link", { name: "Test run" })).toBeVisible();
  await expect(version(page, 2).getByText(/777 rps/)).toBeVisible();
  await expect(version(page, 1).getByText(/300 rps/)).toBeVisible();
  await version(page, 1).getByRole("button", { name: "Restore revision 1" }).click();
  const confirm = history(page).getByRole("group", { name: "Confirm restoring revision 1" });
  await expect(confirm.getByText(/saves revision 1.s content as revision 3\. Revision 2 stays in History/)).toBeVisible();
  await expect(confirm.getByText("Traffic: 777 rps → 300 rps")).toBeVisible();
  await confirm.getByRole("button", { name: "Restore as revision 3" }).click();
  await expect(history(page).getByText(/Restored revision 1 as revision 3\. Revision 2 is still in History/)).toBeVisible();
  await expect(version(page, 3).getByText("Restored from revision 1")).toBeVisible();
  await expect(version(page, 3).getByText("Current", { exact: true })).toBeVisible();
  await expect(version(page, 2)).toBeVisible();
  await expect(version(page, 1)).toBeVisible();
  await expect(version(page, 2).getByRole("link", { name: "Test run" })).toBeVisible(); // runs stay with their revision
  // The server holds the same truth, and old versions were never touched.
  const design = (await (await page.request.get(api + "/designs/" + id, { headers })).json()).data;
  expect(design.revision).toBe(3);
  expect(design.traffic.rps).toBe(300);
  const versions = (await (await page.request.get(api + "/designs/" + id + "/versions", { headers })).json()).data;
  expect(versions.map((v: { revision: number }) => v.revision)).toEqual([3, 2, 1]);
  expect(versions[1].snapshot.traffic.rps).toBe(777);
  // The editor adopted the restored revision without a reload.
  await page.getByRole("link", { name: /^Traffic/ }).click();
  await expect(rps(page)).toHaveValue("300");
  await expect(page.getByText(/Saved · revision 3/)).toBeVisible();
});

test("M15 restore is blocked while there are unsaved or saving edits, and nothing is lost", async ({ page }, info) => {
  await setup(page, "blocked-" + info.project.name);
  const id = await openTemplate(page);
  await setRps(page, "500");
  await saved(page);
  let release: () => void = () => undefined;
  const gate = new Promise<void>((r) => (release = r));
  await page.route(api + "/designs/" + id, async (route) => {
    if (route.request().method() === "PATCH") await gate;
    await route.continue();
  });
  await rps(page).fill("650");
  await openHistory(page);
  await expect(history(page).getByText(/You have unsaved changes\. Save them first so nothing is lost/)).toBeVisible();
  await expect(version(page, 1).getByRole("button", { name: "Restore revision 1" })).toBeDisabled();
  release();
  await expect(history(page).getByText(/You have unsaved changes/)).toHaveCount(0, { timeout: 15_000 });
  await expect(version(page, 3).getByText("Current", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(version(page, 1).getByRole("button", { name: "Restore revision 1" })).toBeEnabled();
  await page.getByRole("link", { name: /^Traffic/ }).click();
  await expect(rps(page)).toHaveValue("650");
});

test("M15 a design changed elsewhere gets a conflict message, nothing is restored and History refreshes", async ({ page }, info) => {
  const { headers } = await setup(page, "conflict-" + info.project.name);
  const id = await openTemplate(page);
  await setRps(page, "400");
  await saved(page);
  await openHistory(page);
  await expect(version(page, 2).getByText("Current", { exact: true })).toBeVisible();
  // Another tab or device saves revision 3 while this History view still shows revision 2.
  const current = (await (await page.request.get(api + "/designs/" + id, { headers })).json()).data;
  const other = await page.request.patch(api + "/designs/" + id, { headers, data: { expectedRevision: current.revision, name: "Edited elsewhere" } });
  expect(other.status()).toBe(200);
  await version(page, 1).getByRole("button", { name: "Restore revision 1" }).click();
  await history(page).getByRole("group", { name: "Confirm restoring revision 1" }).getByRole("button", { name: "Restore as revision 3" }).click();
  await expect(history(page).getByText(/This design changed elsewhere \(it is now revision 3\)\. History was refreshed; nothing was changed/)).toBeVisible();
  const after = (await (await page.request.get(api + "/designs/" + id, { headers })).json()).data;
  expect(after.revision).toBe(3);
  expect(after.name).toBe("Edited elsewhere");
  expect(after.traffic.rps).toBe(400);
  await expect(version(page, 3).getByText("Current", { exact: true })).toBeVisible({ timeout: 15_000 });
});

test("M15 many versions load in pages, newest first, with an honest older-versions control", async ({ page }, info) => {
  const { headers } = await setup(page, "pages-" + info.project.name);
  const id = await openTemplate(page);
  let revision = 1;
  for (let i = 0; i < 24; i++) {
    const r = await page.request.patch(api + "/designs/" + id, { headers, data: { expectedRevision: revision, description: "edit " + i } });
    expect(r.status()).toBe(200);
    revision++;
  }
  await page.reload();
  await openHistory(page);
  await expect(version(page, 25).getByText("Current", { exact: true })).toBeVisible();
  await expect(history(page).getByRole("listitem").filter({ has: page.getByRole("heading", { name: /^Revision \d+$/ }) })).toHaveCount(20);
  await history(page).getByRole("button", { name: "Load older versions" }).click();
  await expect(version(page, 1)).toBeVisible();
  await expect(history(page).getByRole("button", { name: "Load older versions" })).toHaveCount(0);
  await noOverflow(page);
});

test("M15 a History outage stays inside the tab and never replaces the workspace", async ({ page }, info) => {
  await setup(page, "outage-" + info.project.name);
  await openTemplate(page);
  await page.route("**/designs/*/versions*", (route) => route.abort("failed"));
  await openHistory(page);
  await expect(history(page).getByText(/History could not be loaded\. Your design is unaffected/)).toBeVisible();
  await expect(page.locator(".sys-title")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Run test", exact: true })).toBeEnabled();
  await page.unroute("**/designs/*/versions*");
  await history(page).getByRole("button", { name: "Try again" }).click();
  await expect(version(page, 1)).toBeVisible();
});

test("M15 History works by keyboard and at 390 px without horizontal overflow", async ({ page }, info) => {
  await setup(page, "a11y-" + info.project.name);
  await openTemplate(page);
  await setRps(page, "450");
  await saved(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await openHistory(page);
  const restore = version(page, 1).getByRole("button", { name: "Restore revision 1" });
  await restore.focus();
  await page.keyboard.press("Enter");
  await expect(restore).toHaveAttribute("aria-expanded", "true");
  const confirm = history(page).getByRole("group", { name: "Confirm restoring revision 1" });
  await expect(confirm).toBeVisible();
  await noOverflow(page);
  await confirm.getByRole("button", { name: "Cancel" }).focus();
  await page.keyboard.press("Enter");
  await expect(confirm).toHaveCount(0);
  await expect(restore).toHaveAttribute("aria-expanded", "false");
});
