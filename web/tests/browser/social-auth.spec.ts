import { test, expect, type Page, type BrowserContext } from "@playwright/test";
const id = "10000000-0000-4000-8000-000000000001",
  proof = "p".repeat(43);
async function fixture(page: Page, context: BrowserContext) {
  await context.clearCookies();
  const root = new URL(process.env.SF_WEB_URL ?? "http://localhost:3000")
    .origin;
  const user = {
    id,
    displayName: "Social Builder",
    email: "social@example.test",
    role: "user",
    hasPassword: false,
    socialAuthEnabled: true,
  };
  let completion: {
      kind: string;
      next: string;
      proof?: string;
      owner?: string;
      action?: string;
    } = { kind: "login", next: "/settings/security" },
    selected = "google",
    configured = true;
  let enabled = { google: true, github: true };
  const errors: string[] = [],
    requests: { path: string; body: unknown }[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/v1/**", async (route) => {
    const url = new URL(route.request().url()),
      path = url.pathname;
    let data: unknown = {};
    const body =
      route.request().method() === "POST"
        ? route.request().postDataJSON()
        : null;
    requests.push({ path, body });
    if (path.endsWith("/auth/providers"))
      data = configured ? enabled : { google: false, github: false };
    else if (/\/auth\/(google|github)\/start$/.test(path)) {
      selected = path.includes("google") ? "google" : "github";
      completion = { kind: "login", next: "/settings/security" };
      return route.fulfill({
        status: 303,
        headers: { location: root + "/auth/complete?oauth=1" },
        body: "",
      });
    } else if (path.endsWith("/oauth/completion")) data = completion;
    else if (path.endsWith("/auth/refresh"))
      data = { accessToken: "fixture-session", expiresIn: 900, user };
    else if (path.endsWith("/auth/me")) data = user;
    else if (path.endsWith("/account/roles")) data = { roles: [] };
    else if (path.endsWith("/oauth/identities"))
      data = {
        hasPassword: user.hasPassword,
        available: enabled,
        providers: [
          {
            provider: selected,
            enabled: true,
            linkedAt: "2026-11-26T00:00:00Z",
            lastUsedAt: "2026-11-26T00:00:00Z",
          },
        ],
      };
    else if (path.endsWith("/reauth")) {
      completion = {
        kind: "proof",
        next: "/settings/security",
        proof,
        owner: id,
        action: body.action,
      };
      data = { url: root + "/auth/complete?oauth=1" };
    } else if (path.endsWith("/oauth/password")) {
      expect(body.proof).toBe(proof);
      expect(body.newPassword).toBe("My-new-password-2026!");
      user.hasPassword = true;
      data = { accessToken: "fresh-fixture", expiresIn: 900, user };
    } else if (path.endsWith("/oauth/pending"))
      data = {
        email: user.email,
        displayName: user.displayName,
        csrf: "c".repeat(43),
      };
    else if (path.endsWith("/oauth/register")) {
      expect(body).not.toHaveProperty("email");
      expect(body.terms).toBe(true);
      data = {
        accessToken: "new-fixture",
        expiresIn: 900,
        user,
        next: "/settings/security",
      };
    }
    return route.fulfill({ json: { data } });
  });
  return {
    errors,
    requests,
    disable: () => {
      configured = false;
    },
    provider: (p: "google" | "github") => {
      enabled =
        p === "google"
          ? { google: true, github: false }
          : { google: false, github: true };
    },
  };
}
for (const provider of ["Google", "GitHub"] as const)
  test(`Social ${provider}: clean-browser session completion, provider reauth and first password`, async ({
    page,
    context,
  }, info) => {
    const f = await fixture(page, context);
    f.provider(provider === "Google" ? "google" : "github");
    await page.goto("/login?next=%2Fsettings%2Fsecurity");
    await expect(
      page.getByRole("button", {
        name: "Continue with " + provider,
        exact: true,
      }),
    ).toBeVisible();
    for (const width of [1440, 1024, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
      await page.screenshot({
        path: info.outputPath(`social-${provider}-${width}.png`),
        animations: "disabled",
      });
    }
    await page
      .getByRole("button", { name: "Continue with " + provider, exact: true })
      .click();
    await expect(page).toHaveURL(/\/settings\/security$/);
    await expect(
      page.getByRole("heading", { name: "Connected accounts" }),
    ).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.cookie.includes("sf_session=")))
      .toBe(true);
    await page
      .getByLabel("Account action", { exact: true })
      .selectOption("set-password");
    await page
      .getByRole("button", {
        name: "Authenticate with " + provider,
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(/\/settings\/security$/);
    await expect(page.getByText(/Authenticated for this action/)).toBeVisible();
    await page
      .getByLabel("New password", { exact: true })
      .fill("My-new-password-2026!");
    await page
      .getByRole("button", { name: "Set password", exact: true })
      .click();
    await expect(page.getByText("Email/password is available.")).toBeVisible();
    expect(page.url()).not.toContain(proof);
    expect(
      await page.evaluate(() => JSON.stringify(localStorage)),
    ).not.toContain(proof);
    await page.screenshot({path: info.outputPath(`social-${provider}-settings.png`), animations: "disabled"});
    expect(f.errors).toEqual([]);
  });
test("Social registration requires consent and uses server-verified email without changing email signup", async ({
  page,
  context,
}) => {
  const f = await fixture(page, context);
  await page.goto("/register?social=1");
  await expect(
    page.getByRole("heading", { name: "Complete your account" }),
  ).toBeVisible();
  await expect(page.getByLabel("Verified email")).toHaveAttribute(
    "readonly",
    "",
  );
  await expect(
    page.getByRole("button", { name: "Create account", exact: true }),
  ).toBeDisabled();
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page).toHaveURL(/\/settings\/security$/);
  expect(f.errors).toEqual([]);
});
test("Unconfigured providers stay hidden; a bare completion route has no credential request", async ({
  page,
  context,
}) => {
  const f = await fixture(page, context);
  f.disable();
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "Log in", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Continue with/ })).toHaveCount(
    0,
  );
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  await page.goto("/auth/complete");
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Start sign-in",
  );
  expect(
    f.requests.filter((r) => r.path.endsWith("/oauth/completion")),
  ).toHaveLength(0);
  expect(f.errors).toEqual([]);
});

test("Canceled, unknown and expired completions give safe local feedback", async ({
  page,
  context,
}) => {
  const f = await fixture(page, context);
  await page.goto("/login?social_error=authorization-canceled");
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Authorization was canceled",
  );
  await page.goto("/login?social_error=constructor");
  await expect(
    page.getByRole("heading", { name: "Log in", exact: true }),
  ).toBeVisible();
  await expect(page.locator("main [role=alert]")).toHaveCount(0);
  let reads = 0;
  await page.route("**/v1/auth/oauth/completion", (route) => {
    reads++;
    return route.fulfill({
      status: 401,
      json: {
        error: {
          code: "UNAUTHENTICATED",
          message: "This sign-in request expired",
        },
      },
    });
  });
  await page.goto("/auth/complete?oauth=1");
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "expired",
  );
  await expect(
    page.getByRole("link", { name: "Return to Log in" }),
  ).toHaveAttribute("href", "/login");
  expect(reads).toBe(1);
  expect(f.errors).toEqual([]);
});

test("Keyboard entry and an expired action proof preserve the valid account session", async ({page,context})=>{
 const f=await fixture(page,context);f.provider("google");
 await page.goto("/login");
 const enter=page.getByRole("button",{name:"Continue with Google",exact:true});await enter.focus();await expect(enter).toBeFocused();await enter.press("Enter");
 await expect(page).toHaveURL(/\/settings\/security$/);
 await page.getByLabel("Account action",{exact:true}).selectOption("set-password");
 await page.getByRole("button",{name:"Authenticate with Google",exact:true}).click();
 await expect(page.getByText(/Authenticated for this action/)).toBeVisible();
 const refreshes=f.requests.filter(r=>r.path.endsWith("/auth/refresh")).length;
 await page.route("**/v1/auth/oauth/password",route=>route.fulfill({status:403,json:{error:{code:"FORBIDDEN",message:"Authenticate again for this action"}}}));
 await page.getByLabel("New password",{exact:true}).fill("Another-password-2026!");
 await page.getByRole("button",{name:"Set password",exact:true}).click();
 await expect(page.getByText("Authenticate again for this action",{exact:true})).toBeVisible();
 await expect(page).toHaveURL(/\/settings\/security$/);
 await expect(page.getByRole("button",{name:"Authenticate with Google",exact:true})).toBeVisible();
 expect(f.requests.filter(r=>r.path.endsWith("/auth/refresh"))).toHaveLength(refreshes);
 expect(f.errors).toEqual([]);
});
