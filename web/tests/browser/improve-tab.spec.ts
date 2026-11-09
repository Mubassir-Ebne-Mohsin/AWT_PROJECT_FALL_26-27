import { test, expect, type APIRequestContext } from "@playwright/test";

const api = process.env.SF_API_URL ?? "http://localhost:5001/v1";
const PASSWORD = "Lite-Audit-2026!";

async function register(request: APIRequestContext, name: string) {
  const res = await request.post(api + "/auth/register", { data: { email: `${name.replace(/\W/g, "").toLowerCase()}-${crypto.randomUUID()}@example.test`, password: PASSWORD, displayName: name } });
  expect(res.status()).toBe(201);
  return (await res.json()).data.accessToken as string;
}
async function seedPost(request: APIRequestContext, title: string, rps: number) {
  const token = await register(request, "Quiet Builder");
  const headers = { Authorization: "Bearer " + token };
  const tpl = (await (await request.get(api + "/templates", { headers })).json()).data.find((t: { id: string }) => t.id === "mvp");
  const made = (await (await request.post(api + "/designs", { headers, data: { schemaVersion: 1, name: tpl.name, description: tpl.blurb, source: "template", templateId: tpl.id, graph: tpl.graph, traffic: { ...tpl.traffic, rps, burst: 1.1 } } })).json()).data;
  const started = await request.post(`${api}/designs/${made.id}/simulate`, { headers, data: { expectedRevision: 1, requestId: crypto.randomUUID() } });
  expect(started.status()).toBe(202);
  const statusUrl = api + ((await started.json()).data.statusUrl as string).replace(/^.*\/v1/, "");
  for (let i = 0; i < 100; i++) {
    const r = (await (await request.get(statusUrl, { headers })).json()).data;
    if (r.status !== "pending") break;
    await new Promise((res) => setTimeout(res, 100));
  }
  const post = await request.post(`${api}/designs/${made.id}/gallery`, { headers, data: { title, description: "Seeded for the Improve spec.", allowRemix: true, confirmOwnership: true } });
  expect(post.status()).toBe(201);
}

test("Improve tab: what limits the design, the fix loop, and passing designs from the gallery", async ({ page, request }, info) => {
  const title = "Quiet shop " + crypto.randomUUID().slice(0, 8);
  const failingTitle = "Overloaded shop " + crypto.randomUUID().slice(0, 8);
  await seedPost(request, title, 60);
  await seedPost(request, failingTitle, 900);

  await page.goto("/register");
  await page.getByLabel("Name", { exact: true }).fill("Improve Tester");
  await page.getByLabel("Email", { exact: true }).fill(`improve-${crypto.randomUUID()}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.locator("#reg-terms").check();
  const registered = page.waitForResponse((r) => r.url() === api + "/auth/register" && r.status() === 201);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await registered;
  await page.goto("/new/template");
  await page.getByRole("button", { name: "Use Single-server MVP", exact: true }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/designs/") && u.pathname.endsWith("/edit"));
  const path = new URL(page.url()).pathname.replace(/\/edit$/, "");

  // No completed run yet: the tab says what to do instead of showing a placeholder.
  await page.getByRole("link", { name: "Improve", exact: true }).click();
  await expect(page.getByTestId("improve-empty")).toBeVisible();
  await expect(page.getByText(/Phase 3|Planned for this screen|placeholder/i)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Improve", exact: true })).not.toContainText("Later");

  // Make the design strained or failing, run it, and open Improve.
  await page.goto(path + "/traffic");
  const rps = page.getByLabel("Average requests per second", { exact: true });
  await rps.fill("700");
  await rps.blur();
  await expect(page.getByRole("status").filter({ hasText: /^Saved ·/ })).toBeVisible();
  const accepted = page.waitForResponse((r) => r.url() === api + path + "/simulate" && [200, 202].includes(r.status()));
  await page.getByRole("button", { name: "Run test", exact: true }).click();
  await accepted;
  await expect(page.getByRole("heading", { name: "Model results", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Improve", exact: true }).click();
  await expect(page).toHaveURL(/\/improve/);

  const header = page.getByTestId("improve-header");
  await expect(header).toContainText("What limits this design");
  await expect(header).toContainText("utilization");
  await expect(page.getByRole("heading", { name: "Suggested fixes" })).toBeVisible();
  await expect(page.getByText("Where does it break?").first()).toBeVisible();
  await expect(page.getByText("What if the traffic changed?").first()).toBeVisible();

  // Gallery section: a passing design with the same limiting component, honestly worded.
  const similar = page.getByTestId("similar-designs");
  await expect(similar).toContainText("See how others solved this");
  await expect(similar).toContainText(/not as proof/);
  await expect(similar.getByTestId("similar-item").filter({ hasText: title })).toBeVisible();
  // A post with the same limiting component that does not pass is never offered as an example.
  await expect(similar.getByTestId("similar-item").filter({ hasText: failingTitle })).toHaveCount(0);
  await similar.scrollIntoViewIfNeeded();
  await page.screenshot({ animations: "disabled", path: info.outputPath("improve.png") });

  // Remix opens a private copy in the editor.
  await similar.getByTestId("similar-item").filter({ hasText: title }).getByRole("button", { name: "Remix" }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/designs/") && u.pathname.endsWith("/edit") && !u.pathname.includes(path));
  await expect(page.getByRole("textbox").first()).toHaveValue("Remix of " + title);
});
