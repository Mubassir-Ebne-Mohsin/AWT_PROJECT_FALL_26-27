import { test, expect, type Page } from "@playwright/test";
const api = process.env.SF_API_URL ?? "http://localhost:5001/v1";

// Component-anchored notes (docs/COMPONENT-NOTES-SCOPE.md), against the real server. No AI is involved.
type Headers = { Authorization: string };
async function setup(page: Page, tag: string) {
  await page.goto("/register");
  await page.getByLabel("Name", { exact: true }).fill("Anchored");
  await page.getByLabel("Email", { exact: true }).fill("an-" + Date.now() + "-" + tag + "@example.test");
  await page.getByLabel("Password", { exact: true }).fill("Anchored-Journey-2026!");
  await page.locator("#reg-terms").check();
  const reg = page.waitForResponse((r) => r.url() === api + "/auth/register" && r.status() === 201);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  const token = (await (await reg).json()).data.accessToken as string;
  await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();
  return { Authorization: "Bearer " + token } as Headers;
}
async function openTemplate(page: Page) {
  await page.goto("/new/template");
  await page.getByRole("button", { name: "Use Single-server MVP", exact: true }).click();
  await expect(page.getByLabel("Component", { exact: true })).toBeVisible();
  return new URL(page.url()).pathname.split("/")[2];
}
type Node = { id: string; label: string; type: string };
const getDesign = async (page: Page, headers: Headers, id: string) => (await (await page.request.get(api + "/designs/" + id, { headers })).json()).data;
const addNote = (page: Page, headers: Headers, id: string, body: Record<string, unknown>) => page.request.post(api + "/designs/" + id + "/notes", { headers, data: body });
const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

async function editor(page: Page, tag: string) {
  const headers = await setup(page, tag);
  const id = await openTemplate(page);
  const design = await getDesign(page, headers, id);
  const target = design.graph.nodes.find((n: Node) => n.type === "app") as Node;
  return { headers, id, design, target };
}

test("a note added from a component's panel is pinned to it, and the canvas marker counts it", async ({ page }, info) => {
  const { target } = await editor(page, "add-" + info.project.name);
  await page.getByLabel("Component", { exact: true }).selectOption({ label: target.label });
  const panel = page.getByTestId("component-notes");
  await expect(panel).toContainText("Notes on " + target.label);
  await expect(panel).toContainText("No notes on this component yet.");
  await expect(page.locator("[data-notes-marker]")).toHaveCount(0);
  await panel.getByLabel("Note about " + target.label).fill("Two copies is enough for launch.");
  await panel.getByRole("button", { name: "Add note to this component" }).click();
  await expect(panel).toContainText("Note added to revision 1.");
  await expect(panel).toContainText("Two copies is enough for launch.");
  const marker = page.getByRole("button", { name: "1 note on " + target.label });
  await expect(marker).toBeVisible();
  await panel.getByLabel("Note about " + target.label).fill("The cache hit ratio is a guess.");
  await panel.getByLabel("Kind of note").selectOption("assumption");
  await panel.getByRole("button", { name: "Add note to this component" }).click();
  await expect(page.getByRole("button", { name: "2 notes on " + target.label })).toBeVisible();
});

test("the marker opens the component's notes with the mouse and the keyboard", async ({ page }, info) => {
  const { headers, id, design, target } = await editor(page, "open-" + info.project.name);
  await addNote(page, headers, id, { kind: "decision", text: "Pinned for the marker test.", componentId: target.id });
  await page.reload();
  const other = design.graph.nodes.find((n: Node) => n.id !== target.id) as Node;
  await page.getByLabel("Component", { exact: true }).selectOption({ label: other.label });
  await expect(page.getByTestId("component-notes")).toContainText("Notes on " + other.label);
  const marker = page.getByRole("button", { name: "1 note on " + target.label });
  await marker.click();
  await expect(page.getByTestId("component-notes")).toContainText("Notes on " + target.label);
  await expect(page.getByTestId("component-notes")).toContainText("Pinned for the marker test.");
  await expect(page.locator("#component-notes-heading")).toBeFocused();
  await page.getByLabel("Component", { exact: true }).selectOption({ label: other.label });
  await marker.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("component-notes")).toContainText("Notes on " + target.label);
});

test("the Notes tab names the component, filters by it, and can pin a new note", async ({ page }, info) => {
  const { headers, id, design, target } = await editor(page, "tab-" + info.project.name);
  await addNote(page, headers, id, { kind: "decision", text: "Pinned to the app tier.", componentId: target.id });
  await addNote(page, headers, id, { kind: "assumption", text: "About the whole design." });
  await page.goto("/designs/" + id + "/notes");
  const items = page.locator(".m15-note");
  await expect(items).toHaveCount(2);
  await expect(page.getByTestId("note-about")).toHaveText("On " + target.label);
  const filter = page.getByTestId("note-filter");
  await filter.selectOption({ label: "About the whole design (1)" });
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText("About the whole design.");
  await filter.selectOption({ label: target.label + " (1)" });
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText("Pinned to the app tier.");
  await filter.selectOption("all");
  // Pin a new note from here.
  const db = design.graph.nodes.find((n: Node) => n.type === "db") as Node;
  await page.getByTestId("note-about-select").selectOption({ label: db.label });
  await page.getByLabel("Note", { exact: true }).fill("The database stays single for now.");
  await page.getByRole("button", { name: /^Add note to revision/ }).click();
  await expect(page.getByText("Note added to revision 1.")).toBeVisible();
  await filter.selectOption({ label: db.label + " (1)" });
  await expect(items.first()).toContainText("The database stays single for now.");
});

test("when its component is deleted the note stays, says so, and the marker is gone", async ({ page }, info) => {
  const { headers, id, design, target } = await editor(page, "orphan-" + info.project.name);
  await addNote(page, headers, id, { kind: "decision", text: "Why this tier exists.", componentId: target.id });
  // Remove the component the way the editor's save would: a new revision without it.
  const keep = design.graph.nodes.filter((n: Node) => n.id !== target.id);
  const edges = design.graph.edges.filter((e: { from: string; to: string }) => e.from !== target.id && e.to !== target.id);
  const saved = await page.request.patch(api + "/designs/" + id, { headers, data: { expectedRevision: design.revision, graph: { nodes: keep, edges } } });
  expect(saved.status()).toBe(200);
  await page.goto("/designs/" + id + "/edit");
  await expect(page.getByLabel("Component", { exact: true })).toBeVisible();
  await expect(page.locator("[data-notes-marker]")).toHaveCount(0);
  await page.goto("/designs/" + id + "/notes");
  await expect(page.getByTestId("note-about")).toHaveText("Component removed");
  await expect(page.locator(".m15-note")).toContainText("Why this tier exists.");
  await page.getByTestId("note-filter").selectOption({ label: "Component removed (1)" });
  await expect(page.locator(".m15-note")).toHaveCount(1);
});

test("the report names the component of a pinned note", async ({ page }, info) => {
  const { headers, id, target } = await editor(page, "report-" + info.project.name);
  await addNote(page, headers, id, { kind: "decision", text: "Report me.", componentId: target.id });
  await page.goto("/designs/" + id + "/report");
  await expect(page.locator(".m16-notes")).toContainText("on " + target.label);
  await expect(page.locator(".m16-notes")).toContainText("Report me.");
});

test("the notes controls fit at every width and a component panel can be used by keyboard", async ({ page }, info) => {
  const { headers, id, target } = await editor(page, "fit-" + info.project.name);
  await addNote(page, headers, id, { kind: "decision", text: "Fit test.", componentId: target.id });
  // The Notes tab at every width. (The editor itself is a desktop-width screen by design, so its panel is checked at 1024.)
  for (const width of [320, 390, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/designs/" + id + "/notes");
    await expect(page.getByTestId("note-about")).toBeVisible();
    await noOverflow(page);
  }
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto("/designs/" + id + "/edit");
  await expect(page.getByLabel("Component", { exact: true })).toBeVisible();
  await noOverflow(page);
  await page.getByLabel("Component", { exact: true }).selectOption({ label: target.label });
  const area = page.getByTestId("component-notes").getByLabel("Note about " + target.label);
  await area.focus();
  await page.keyboard.type("Keyboard note.");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("component-notes")).toContainText("Keyboard note.");
});
