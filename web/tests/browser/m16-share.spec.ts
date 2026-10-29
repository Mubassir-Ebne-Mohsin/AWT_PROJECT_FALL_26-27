import { test, expect, type Browser, type Page, type TestInfo } from "@playwright/test";
import { randomUUID } from "node:crypto";
const api = process.env.SF_API_URL ?? "http://localhost:5001/v1";
const origin = new URL(api).origin;

type Headers = Record<string, string>;

async function setup(page: Page, tag: string) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/register");
  await page.getByLabel("Name", { exact: true }).fill("M16 Share");
  await page.getByLabel("Email", { exact: true }).fill("m16s-" + Date.now() + "-" + tag + "@example.test");
  await page.getByLabel("Password", { exact: true }).fill("M16-Share-2026!");
  await page.locator("#reg-terms").check();
  const reg = page.waitForResponse((r) => r.url() === api + "/auth/register" && r.status() === 201);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  const token = (await (await reg).json()).data.accessToken as string;
  await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();
  return { errors, headers: { Authorization: "Bearer " + token } as Headers };
}
async function seedDesign(page: Page, headers: Headers, name: string) {
  const templates = (await (await page.request.get(api + "/templates", { headers })).json()).data as Array<{ id: string; graph: unknown; traffic: unknown }>;
  const t = templates[0];
  const res = await page.request.post(api + "/designs", {
    headers,
    data: { schemaVersion: 1, name, description: "Share journey design", source: "template", templateId: t.id, graph: t.graph, traffic: t.traffic },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).data as { id: string; revision: number };
}
async function simulate(page: Page, headers: Headers, id: string, revision: number) {
  const accepted = await page.request.post(`${api}/designs/${id}/simulate`, { headers, data: { expectedRevision: revision, requestId: randomUUID() } });
  expect(accepted.status()).toBe(202);
  const statusUrl = (await accepted.json()).data.statusUrl as string;
  for (let i = 0; i < 100; i++) {
    const run = (await (await page.request.get(origin + statusUrl, { headers })).json()).data;
    if (run.status !== "pending") return run;
    await page.waitForTimeout(100);
  }
  throw new Error("run stayed pending");
}
async function apiShare(page: Page, headers: Headers, id: string, body: Record<string, unknown>) {
  const res = await page.request.post(`${api}/designs/${id}/shares`, { headers, data: body });
  expect(res.status()).toBe(201);
  return (await res.json()).data as { id: string; token: string };
}
/** A visitor with no login: a brand-new browser context shares nothing with the owner's session. */
async function visitor(browser: Browser, info: TestInfo) {
  const use = info.project.use;
  const context = await browser.newContext({ baseURL: use.baseURL, viewport: use.viewport ?? undefined, colorScheme: use.colorScheme ?? undefined });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { page, context, errors };
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}
const doc = (page: Page) => page.getByRole("article", { name: "Design report" });

test("M16.3 the owner creates a link, copies it once, and it cannot be shown again", async ({ page, context }, info) => {
  const { errors, headers } = await setup(page, "create-" + info.project.name);
  const d = await seedDesign(page, headers, "Checkout platform");
  await simulate(page, headers, d.id, 1);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`/designs/${d.id}/share`);
  await expect(page.getByRole("heading", { level: 1, name: "Share settings" })).toBeVisible();
  await expect(page.getByTestId("share-empty")).toBeVisible();
  await expect(page.getByText("0 of 5 active links")).toBeVisible();
  await expect(page.getByText(/Later changes to your design, results or notes never appear/)).toBeVisible();
  await page.getByRole("button", { name: "Create link" }).click();
  const fresh = page.getByTestId("share-fresh");
  await expect(fresh).toContainText("shown only once");
  const url = await fresh.getByLabel("Share link").inputValue();
  expect(url).toMatch(/\/share\/[A-Za-z0-9_-]{43}$/);
  await fresh.getByRole("button", { name: "Copy link" }).click();
  await expect(fresh).toContainText("Link copied.");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);
  await fresh.getByRole("button", { name: "I have copied it" }).click();
  await expect(page.getByTestId("share-fresh")).toHaveCount(0);
  // The list describes the link but can never reveal the secret.
  const item = page.getByTestId("share-link");
  await expect(item).toHaveCount(1);
  await expect(item).toContainText("Design and report");
  await expect(item).toContainText("Active");
  await expect(item).toContainText("Not opened yet");
  await expect(page.getByText("1 of 5 active links")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("share-fresh")).toHaveCount(0);
  const token = url.split("/share/")[1];
  expect(await page.content()).not.toContain(token);
  await noOverflow(page);
  expect(errors).toEqual([]);
});

test("M16.3 a signed-out visitor sees a read-only snapshot; the secret travels only in a POST body", async ({ page, browser }, info) => {
  const { headers } = await setup(page, "view-" + info.project.name);
  const d = await seedDesign(page, headers, "Orders service");
  const run = await simulate(page, headers, d.id, 1);
  const link = await apiShare(page, headers, d.id, { scope: "design_report" });
  const v = await visitor(browser, info);
  const seen: Array<{ url: string; method: string; body: string | null }> = [];
  v.page.on("request", (r) => {
    if (r.url().startsWith(origin)) seen.push({ url: r.url(), method: r.method(), body: r.postData() });
  });
  await v.page.goto(`/share/${link.token}`);
  await expect(v.page.getByRole("heading", { level: 1, name: "Shared design" })).toBeVisible();
  await expect(doc(v.page).getByRole("heading", { level: 2, name: "Orders service" })).toBeVisible();
  await expect(v.page.getByTestId("report-verdict")).toBeVisible();
  await expect(v.page.getByTestId("report-run-statement")).toContainText("Recorded for revision 1");
  await expect(v.page.getByTestId("share-banner")).toContainText("Read-only copy");
  await expect(v.page.getByTestId("share-banner")).toContainText("you cannot edit, run or change it");
  expect(run.status).toBe("completed");
  // No edit surface, no account, no AI.
  await expect(v.page.getByRole("button", { name: "Account menu", exact: true })).toHaveCount(0);
  await expect(v.page.getByRole("button", { name: /Explain/ })).toHaveCount(0);
  await expect(v.page.getByRole("textbox")).toHaveCount(0);
  // The secret never appears in an API URL; it is in the POST body.
  const opens = seen.filter((r) => r.url.includes("/shares/open"));
  expect(opens.length).toBe(1);
  expect(opens[0].method).toBe("POST");
  expect(opens[0].url).not.toContain(link.token);
  expect(opens[0].body).toContain(link.token);
  expect(seen.filter((r) => r.url.includes(link.token))).toEqual([]);
  // Never indexed and never leaked through the Referer header.
  expect(await v.page.locator('meta[name="robots"]').getAttribute("content")).toMatch(/noindex/);
  expect(await v.page.locator('meta[name="referrer"]').getAttribute("content")).toBe("no-referrer");
  // Focus and reconnect events do not make extra reads: each read is counted for the owner.
  await v.page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("online"));
    document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
  });
  await v.page.waitForTimeout(500);
  expect(seen.filter((r) => r.url.includes("/shares/open")).length).toBe(1);
  await noOverflow(v.page);
  expect(v.errors).toEqual([]);
  await v.context.close();
  // The owner sees the open.
  await page.goto(`/designs/${d.id}/share`);
  await expect(page.getByTestId("share-link")).toContainText("Opened 1 time");
});

test("M16.3 a design-only link hides results, and a link is a frozen snapshot", async ({ page, browser }, info) => {
  const { headers } = await setup(page, "frozen-" + info.project.name);
  const d = await seedDesign(page, headers, "Original name");
  await simulate(page, headers, d.id, 1);
  const onlyDesign = await apiShare(page, headers, d.id, { scope: "design" });
  const withReport = await apiShare(page, headers, d.id, { scope: "design_report" });
  const rename = await page.request.patch(`${api}/designs/${d.id}`, { headers, data: { expectedRevision: 1, name: "Renamed after sharing" } });
  expect(rename.status()).toBe(200);
  const v = await visitor(browser, info);
  await v.page.goto(`/share/${onlyDesign.token}`);
  await expect(doc(v.page).getByRole("heading", { level: 2, name: "Original name" })).toBeVisible();
  await expect(doc(v.page)).toContainText("The owner shared the design only, without results, Limits or notes.");
  await expect(v.page.getByTestId("report-verdict")).toHaveCount(0);
  await expect(v.page.getByTestId("report-run-statement")).toHaveCount(0);
  await expect(v.page.getByTestId("report-limits")).toHaveCount(0);
  await expect(doc(v.page).getByRole("heading", { name: "Decisions and assumptions" })).toHaveCount(0);
  await expect(doc(v.page).getByRole("heading", { name: "Components" })).toBeVisible();
  // The full link still shows the name it had when it was made, not the later edit.
  await v.page.goto(`/share/${withReport.token}`);
  await expect(doc(v.page).getByRole("heading", { level: 2, name: "Original name" })).toBeVisible();
  await expect(v.page.getByTestId("report-verdict")).toBeVisible();
  await expect(v.page.getByText("Renamed after sharing")).toHaveCount(0);
  await v.context.close();
});

test("M16.3 revoking stops a link at once, and every unusable link shows the same sentence", async ({ page, browser }, info) => {
  const { headers } = await setup(page, "revoke-" + info.project.name);
  const d = await seedDesign(page, headers, "Revoke me");
  const link = await apiShare(page, headers, d.id, { scope: "design" });
  const v = await visitor(browser, info);
  await v.page.goto(`/share/${link.token}`);
  await expect(doc(v.page)).toBeVisible();
  await page.goto(`/designs/${d.id}/share`);
  const item = page.getByTestId("share-link");
  await item.getByRole("button", { name: "Revoke" }).click();
  await expect(page.getByText("People who already opened it keep what they saw.")).toBeVisible();
  await page.getByRole("button", { name: "Keep link" }).click();
  await expect(item).toContainText("Active");
  await item.getByRole("button", { name: "Revoke" }).click();
  await page.getByRole("button", { name: "Revoke link" }).click();
  await expect(page.getByTestId("share-notice")).toContainText("Link revoked. It stops working straight away.");
  await expect(item).toContainText("Revoked");
  await expect(item.getByRole("button", { name: "Revoke" })).toHaveCount(0);
  await expect(item).toContainText("Opened 1 time"); // statistics are kept
  await expect(page.getByText(/cannot take back anything someone has already seen, copied or printed/)).toBeVisible();
  const gone = "This link is no longer available.";
  await v.page.goto(`/share/${link.token}`);
  await expect(v.page.getByTestId("share-gone")).toContainText(gone);
  await expect(doc(v.page)).toHaveCount(0);
  const requests: string[] = [];
  v.page.on("request", (r) => requests.push(r.url()));
  await v.page.goto(`/share/${"A".repeat(43)}`);
  await expect(v.page.getByTestId("share-gone")).toContainText(gone);
  // A malformed token is unavailable without a request being made at all.
  await v.page.goto("/share/short");
  await expect(v.page.getByTestId("share-gone")).toContainText(gone);
  expect(requests.filter((u) => u.includes("/shares/open")).length).toBe(1);
  await v.context.close();
});

test("M16.3 five active links is the limit, and a failed creation is explained without losing the form", async ({ page }, info) => {
  const { headers } = await setup(page, "limit-" + info.project.name);
  const d = await seedDesign(page, headers, "Limit design");
  let fail = true;
  await page.route(/\/v1\/designs\/[^/]+\/shares$/, (route) =>
    route.request().method() === "POST" && fail
      ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { code: "INTERNAL", message: "boom" } }) })
      : route.continue(),
  );
  await page.goto(`/designs/${d.id}/share`);
  await page.getByLabel("Expires").selectOption("never");
  await page.getByRole("button", { name: "Create link" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Nothing was changed" })).toBeVisible();
  await expect(page.getByTestId("share-fresh")).toHaveCount(0);
  await expect(page.getByLabel("Expires")).toHaveValue("never");
  fail = false;
  for (let i = 0; i < 5; i++) await apiShare(page, headers, d.id, { scope: "design" });
  await page.reload();
  await expect(page.getByText(/5 of 5 active links/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Create link" })).toBeDisabled();
  await expect(page.getByTestId("share-link")).toHaveCount(5);
});

test("M16.3 printing a shared design shows only the document", async ({ page, browser }, info) => {
  const { headers } = await setup(page, "print-" + info.project.name);
  const d = await seedDesign(page, headers, "Print shared");
  await simulate(page, headers, d.id, 1);
  const link = await apiShare(page, headers, d.id, { scope: "design_report" });
  const v = await visitor(browser, info);
  await v.page.goto(`/share/${link.token}`);
  await expect(doc(v.page)).toBeVisible();
  await expect(v.page.getByRole("button", { name: "Print or save as PDF" })).toBeEnabled();
  await v.page.emulateMedia({ media: "print" });
  await expect(v.page.getByRole("button", { name: "Print or save as PDF" })).toBeHidden();
  await expect(v.page.getByTestId("share-banner")).toBeHidden();
  await expect(v.page.getByRole("heading", { level: 1, name: "Shared design" })).toBeHidden();
  await expect(doc(v.page)).toBeVisible();
  await noOverflow(v.page);
  await v.context.close();
});
