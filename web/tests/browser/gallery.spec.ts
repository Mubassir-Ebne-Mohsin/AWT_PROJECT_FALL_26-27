import { test, expect } from "@playwright/test";

const api = process.env.SF_API_URL ?? "http://localhost:5001/v1";

test("publish a tested design, find it in the gallery, remix it, then unpublish it", async ({ page }, info) => {
  const title = "Gallery check " + crypto.randomUUID().slice(0, 8);
  await page.goto("/register");
  await page.getByLabel("Name", { exact: true }).fill("Gallery Tester");
  await page.getByLabel("Email", { exact: true }).fill(`gallery-${crypto.randomUUID()}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("Lite-Audit-2026!");
  await page.locator("#reg-terms").check();
  const register = page.waitForResponse((r) => r.url() === api + "/auth/register" && r.status() === 201);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await register;
  await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();

  // An empty gallery says so and explains how to publish.
  await page.goto("/gallery");
  await expect(page.getByRole("heading", { name: "Gallery", exact: true })).toBeVisible();

  await page.goto("/new/template");
  await page.getByRole("button", { name: "Use Single-server MVP", exact: true }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/designs/") && u.pathname.endsWith("/edit"));
  const path = new URL(page.url()).pathname.replace(/\/edit$/, "");
  const accepted = page.waitForResponse((r) => r.url() === api + path + "/simulate" && [200, 202].includes(r.status()));
  await page.getByRole("button", { name: "Run test", exact: true }).click();
  await accepted;
  await expect(page.getByRole("heading", { name: "Model results", exact: true })).toBeVisible();

  // Publish from Results: the owner must tick the ownership statement.
  await page.getByTestId("gallery-publish-open").click();
  const form = page.getByRole("form", { name: "Publish to the gallery" });
  await form.getByLabel("Title").fill(title);
  await form.getByLabel(/Description/).fill("A small app that passes comfortably.");
  const publish = form.getByRole("button", { name: "Publish", exact: true });
  await expect(publish).toBeDisabled();
  await form.getByLabel("This design is mine to publish").check();
  await expect(publish).toBeEnabled();
  await publish.click();
  await expect(page.getByTestId("gallery-published")).toBeVisible();

  // The gallery lists it, and search finds it.
  await page.goto("/gallery");
  const items = page.getByTestId("gallery-items");
  await expect(items.getByRole("link", { name: title })).toBeVisible();
  await expect(items).toContainText("by Gallery Tester (you)");
  await page.getByLabel("Search the gallery").fill("no-such-title-xyz");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByTestId("gallery-empty")).toBeVisible();
  await page.getByLabel("Search the gallery").fill(title);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(items.getByRole("link", { name: title })).toBeVisible();
  await page.screenshot({ animations: "disabled", path: info.outputPath("gallery-list.png") });

  // The post page is a read-only snapshot.
  await items.getByRole("link", { name: title }).click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await expect(page.getByText(/read-only snapshot/)).toBeVisible();
  await page.screenshot({ animations: "disabled", path: info.outputPath("gallery-post.png") });

  // Remix makes a private copy with credit and opens it in the editor.
  await page.getByTestId("gallery-remix").click();
  await page.waitForURL((u) => u.pathname.startsWith("/designs/") && u.pathname.endsWith("/edit"));
  await expect(page.getByRole("textbox").first()).toHaveValue("Remix of " + title);

  // Unpublish removes it for everyone.
  await page.goto("/gallery");
  await items.getByRole("link", { name: title }).click();
  await expect(page.getByText(/remixed 1 time/)).toBeVisible();
  await page.getByTestId("gallery-unpublish").click();
  await page.waitForURL((u) => u.pathname === "/gallery");
  await expect(page.getByTestId("gallery-items").getByRole("link", { name: title })).toHaveCount(0);
});

test("the gallery needs a signed-in person", async ({ page }) => {
  await page.goto("/gallery");
  await expect(page).toHaveURL(/\/login/);
});
