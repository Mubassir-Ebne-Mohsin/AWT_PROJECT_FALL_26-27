import { test, expect, type Page } from "@playwright/test";
const api = process.env.SF_API_URL ?? "http://localhost:5001/v1";

async function setup(page: Page, tag: string) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/register");
  await page.getByLabel("Name", { exact: true }).fill("M15 Notes");
  await page.getByLabel("Email", { exact: true }).fill("m15n-" + Date.now() + "-" + tag + "@example.test");
  await page.getByLabel("Password", { exact: true }).fill("M15-Notes-2026!");
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
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}
const notes = (page: Page) => page.getByRole("region", { name: "Design notes" });
const noteList = (page: Page) => notes(page).getByRole("list", { name: "Notes, newest first" });
const openNotes = async (page: Page) => {
  await page.getByRole("link", { name: /^Notes/ }).click();
  await expect(notes(page)).toBeVisible();
};
async function add(page: Page, text: string, kind: "decision" | "assumption" = "decision") {
  await notes(page).getByLabel("Kind of note").first().selectOption(kind);
  await notes(page).getByLabel("Note", { exact: true }).fill(text);
  await notes(page).getByRole("button", { name: /^Add note to revision/ }).click();
}

test("M15.3 Notes is a real tab: add decisions and assumptions tied to the current revision, and they persist", async ({ page }, info) => {
  const { errors } = await setup(page, "add-" + info.project.name);
  await openTemplate(page);
  await expect(page.getByRole("link", { name: /^Notes/ })).not.toContainText("Later");
  await openNotes(page);
  await expect(notes(page).getByText("0 of 100 notes")).toBeVisible();
  await expect(notes(page).getByText(/No notes yet/)).toBeVisible();
  await expect(notes(page).getByRole("button", { name: "Add note to revision 1" })).toBeDisabled();
  await add(page, "Keep one database until traffic proves otherwise.", "decision");
  await expect(notes(page).getByText("Note added to revision 1.")).toBeVisible();
  await add(page, "Reads are about 80% of traffic.", "assumption");
  await expect(notes(page).getByText("2 of 100 notes")).toBeVisible();
  const items = noteList(page).getByRole("listitem");
  await expect(items).toHaveCount(2);
  await expect(items.first()).toContainText("Assumption");
  await expect(items.first()).toContainText("Reads are about 80% of traffic.");
  await expect(items.nth(1)).toContainText("Decision");
  await expect(items.first().getByText("Current", { exact: true })).toBeVisible();
  await expect(notes(page).getByLabel("Note", { exact: true })).toHaveValue("");
  await page.reload();
  await expect(noteList(page).getByRole("listitem")).toHaveCount(2);
  await expect(page.getByRole("button", { name: /Explain this result/ })).toHaveCount(0); // AI stays out of Notes
  await noOverflow(page);
  expect(errors).toEqual([]);
});

test("M15.3 notes can be edited and deleted, with a confirmation that can be declined", async ({ page }, info) => {
  await setup(page, "edit-" + info.project.name);
  await openTemplate(page);
  await openNotes(page);
  await add(page, "First wording");
  const item = noteList(page).getByRole("listitem").first();
  await item.getByRole("button", { name: "Edit" }).click();
  await item.getByLabel("Edit note").fill("Second wording");
  await item.getByLabel("Kind of note").selectOption("assumption");
  await item.getByRole("button", { name: "Save changes" }).click();
  await expect(notes(page).getByText("Note updated.")).toBeVisible();
  await expect(item).toContainText("Second wording");
  await expect(item).toContainText("Assumption");
  await expect(item).toContainText("Edited");
  await item.getByRole("button", { name: "Delete" }).click();
  const confirm = item.getByRole("group", { name: "Confirm deleting this note" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Keep" }).click();
  await expect(noteList(page).getByRole("listitem")).toHaveCount(1);
  await item.getByRole("button", { name: "Delete" }).click();
  await confirm.getByRole("button", { name: "Delete note" }).click();
  await expect(notes(page).getByText("Note deleted.")).toBeVisible();
  await expect(noteList(page).getByRole("listitem")).toHaveCount(0);
  await expect(notes(page).getByText("0 of 100 notes")).toBeVisible();
});

test("M15.3 hostile text is shown as plain text and never runs", async ({ page }, info) => {
  await setup(page, "xss-" + info.project.name);
  await openTemplate(page);
  await openNotes(page);
  const hostile = `<img src=x onerror="window.__xss=1">\n<script>window.__xss=2</script>\n\${process.env.SECRET} {{7*7}} 'quoted'`;
  await add(page, hostile);
  const text = noteList(page).getByRole("listitem").first().locator(".m15-note-text");
  await expect(text).toContainText('<img src=x onerror="window.__xss=1">');
  await expect(text).toContainText("<script>window.__xss=2</script>");
  await expect(text).toContainText("{{7*7}}");
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  expect(await text.locator("img, script").count()).toBe(0);
  expect(await text.evaluate((el) => (el as HTMLElement).innerText.includes("\n"))).toBe(true); // line breaks preserved
});

test("M15.3 the counter explains the 2,000-character limit before anything is lost", async ({ page }, info) => {
  await setup(page, "counter-" + info.project.name);
  await openTemplate(page);
  await openNotes(page);
  const box = notes(page).getByLabel("Note", { exact: true });
  const addButton = notes(page).getByRole("button", { name: "Add note to revision 1" });
  await box.fill("x".repeat(2000));
  await expect(notes(page).getByText("0 characters left")).toBeVisible();
  await expect(addButton).toBeEnabled();
  await box.fill("x".repeat(2001));
  await expect(notes(page).getByText("Too long by 1 character.")).toBeVisible();
  await expect(addButton).toBeDisabled();
  await expect(box).toHaveValue("x".repeat(2001)); // the text is kept, never trimmed away
  await box.fill("x".repeat(2000));
  await expect(addButton).toBeEnabled();
});

// Seeding 100 notes is heavy on the API's per-minute rate limit and the rule is viewport-independent (the API
// e2e suite also covers it, including parallel requests), so it runs in one project only.
test("M15.3 the 100-note limit is explained and the form is disabled", async ({ page }, info) => {
  test.skip(info.project.name !== "1440-light", "rate-limit heavy and viewport-independent; covered by the API e2e suite");
  const { headers } = await setup(page, "full-" + info.project.name);
  const id = await openTemplate(page);
  await openNotes(page);
  for (let i = 0; i < 100; i++) {
    const r = await page.request.post(api + "/designs/" + id + "/notes", { headers, data: { kind: "assumption", text: "api note " + i } });
    expect(r.status()).toBe(201);
  }
  await page.reload();
  await expect(notes(page).getByText("100 of 100 notes")).toBeVisible();
  await expect(notes(page).getByText(/maximum of 100 notes/)).toBeVisible();
  await expect(notes(page).getByLabel("Note", { exact: true })).toBeDisabled();
  await expect(notes(page).getByRole("button", { name: /^Add note to revision/ })).toBeDisabled();
  // Let the API per-minute rate-limit window clear so the next tests are not throttled by this seeding.
  await page.waitForTimeout(62_000);
});

test("M15.3 an edit from a stale view is refused and the newer text is kept", async ({ page }, info) => {
  const { headers } = await setup(page, "stale-" + info.project.name);
  const id = await openTemplate(page);
  await openNotes(page);
  await add(page, "Original");
  const item = noteList(page).getByRole("listitem").first();
  await item.getByRole("button", { name: "Edit" }).click();
  const list = (await (await page.request.get(api + "/designs/" + id + "/notes", { headers })).json()).data;
  const other = await page.request.patch(api + "/designs/" + id + "/notes/" + list[0].id, { headers, data: { expectedUpdatedAt: list[0].updatedAt, text: "Changed in another tab" } });
  expect(other.status()).toBe(200);
  await item.getByLabel("Edit note").fill("My stale edit");
  await item.getByRole("button", { name: "Save changes" }).click();
  await expect(notes(page).getByText(/This note changed elsewhere, so your edit was not saved/)).toBeVisible();
  await expect(noteList(page).getByRole("listitem").first()).toContainText("Changed in another tab");
  await expect(noteList(page).getByText("My stale edit")).toHaveCount(0);
});

test("M15.3 a revision link opens History, and a Notes outage stays inside the tab", async ({ page }, info) => {
  await setup(page, "link-" + info.project.name);
  await openTemplate(page);
  await openNotes(page);
  await add(page, "About the first version");
  await noteList(page).getByRole("link", { name: "Revision 1" }).click();
  await expect(page.getByRole("region", { name: "Version history" })).toBeVisible();
  await page.route("**/designs/*/notes", (route) => route.abort("failed"));
  await page.getByRole("link", { name: /^Notes/ }).click();
  await expect(notes(page).getByText(/Notes could not be loaded\. Your design is unaffected/)).toBeVisible();
  await expect(page.locator(".sys-title")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Run test", exact: true })).toBeEnabled();
  await page.unroute("**/designs/*/notes");
  await notes(page).getByRole("button", { name: "Try again" }).click();
  await expect(noteList(page).getByRole("listitem")).toHaveCount(1);
});

test("M15.3 Notes works by keyboard and at 390 px without horizontal overflow", async ({ page }, info) => {
  await setup(page, "a11y-" + info.project.name);
  await openTemplate(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await openNotes(page);
  await notes(page).getByLabel("Note", { exact: true }).focus();
  await page.keyboard.type("Typed with the keyboard");
  await page.keyboard.press("Tab");
  await expect(notes(page).getByRole("button", { name: "Add note to revision 1" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(noteList(page).getByRole("listitem")).toHaveCount(1);
  await noOverflow(page);
  const edit = noteList(page).getByRole("button", { name: "Edit" });
  await edit.focus();
  await page.keyboard.press("Enter");
  await expect(noteList(page).getByLabel("Edit note")).toBeVisible();
  await noOverflow(page);
});
