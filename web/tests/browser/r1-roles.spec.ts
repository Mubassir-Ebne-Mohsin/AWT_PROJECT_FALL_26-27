import { test, expect, type Page } from "@playwright/test";
const api = process.env.SF_API_URL ?? "http://localhost:5001/v1";

async function signUp(page: Page, tag: string) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/register");
  await page.getByLabel("Name", { exact: true }).fill("R1 Roles");
  await page.getByLabel("Email", { exact: true }).fill("r1-" + Date.now() + "-" + tag + "@example.test");
  await page.getByLabel("Password", { exact: true }).fill("R1-Roles-2026!");
  await page.locator("#reg-terms").check();
  const reg = page.waitForResponse((r) => r.url() === api + "/auth/register" && r.status() === 201);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  const token = (await (await reg).json()).data.accessToken as string;
  await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();
  return { errors, token };
}

test.describe("R1 roles in the account menu", () => {
  test("a new account is a plain User: the server says so and the menu names no extra role", async ({ page }) => {
    const { errors, token } = await signUp(page, "plain");
    const reply = page.waitForResponse((r) => r.url() === api + "/account/roles");
    await page.getByRole("button", { name: "Account menu", exact: true }).click();
    const res = await reply;
    expect(res.status()).toBe(200);
    expect((await res.json()).data.roles).toEqual(["user"]);
    await expect(page.getByRole("menu")).toBeVisible();
    await expect(page.getByTestId("account-roles")).toHaveCount(0);
    // The real server also refuses the admin area to this account.
    const refused = await page.request.get(api + "/admin/audit", { headers: { Authorization: "Bearer " + token } });
    expect(refused.status()).toBe(403);
    expect(errors).toEqual([]);
  });

  test("granted roles are named in the menu, in a fixed order", async ({ page }) => {
    await signUp(page, "named");
    await page.route(api + "/account/roles", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { roles: ["user", "admin", "instructor"] } }) }),
    );
    await page.getByRole("button", { name: "Account menu", exact: true }).click();
    await expect(page.getByTestId("account-roles")).toHaveText("Instructor, Admin");
  });

  test("when the roles cannot be read the menu still works and shows no roles", async ({ page }) => {
    await signUp(page, "down");
    await page.route(api + "/account/roles", (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { code: "INTERNAL", message: "x" } }) }));
    await page.getByRole("button", { name: "Account menu", exact: true }).click();
    await expect(page.getByRole("menuitem", { name: /Log out/ })).toBeVisible();
    await expect(page.getByTestId("account-roles")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0); // a roles failure never opens a system screen
  });
});
