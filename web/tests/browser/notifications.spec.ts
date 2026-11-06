import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
const api = process.env.SF_API_URL ?? "http://localhost:5001/v1";
const pg = {
  container: process.env.SF_PG_CONTAINER,
  user: process.env.SF_PG_USER,
  db: process.env.SF_PG_DB,
};
const isolated =
  pg.container === "stressforge-m9-postgres" &&
  pg.user === "sf_audit" &&
  /^sf_notifications_[a-z0-9_]+$/.test(pg.db ?? "");
const PASSWORD = "Notifications-Chrome-2026!";
type User = { id: string; token: string; email: string };
function sql(text: string) {
  if (!isolated) throw Error("Requires C disposable database");
  return execFileSync(
    "docker",
    [
      "exec",
      pg.container!,
      "psql",
      "-U",
      pg.user!,
      "-d",
      pg.db!,
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      text,
    ],
    { stdio: "pipe" },
  );
}
async function call(
  u: User,
  path: string,
  body?: unknown,
  method = body ? "POST" : "GET",
) {
  const res = await fetch(api + path, {
    method,
    headers: {
      Authorization: "Bearer " + u.token,
      "content-type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  expect(res.ok).toBe(true);
  return (await res.json()).data;
}
async function other(staff = false): Promise<User> {
  const email = "notice-" + randomUUID() + "@example.test";
  const res = await fetch(api + "/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password: PASSWORD,
      displayName: "PRIVATE STAFF NAME",
    }),
  });
  expect(res.status).toBe(201);
  const data = (await res.json()).data;
  const u = { email, id: data.user.id, token: data.accessToken };
  if (staff)
    sql(
      `INSERT INTO user_roles(user_id,role,granted_by,granted_at) VALUES('${u.id}','support',NULL,now())`,
    );
  return u;
}
async function signUp(page: Page, staff = false) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.clock.install();
  const email = "notice-ui-" + randomUUID() + "@example.test";
  await page.goto("/register");
  await page.getByLabel("Name", { exact: true }).fill("Notification User");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.locator("#reg-terms").check();
  const pending = page.waitForResponse(
    (r) => r.url() === api + "/auth/register" && r.status() === 201,
  );
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  const data = (await (await pending).json()).data;
  const u = { email, id: data.user.id, token: data.accessToken };
  await expect(
    page.getByRole("button", { name: "Account menu", exact: true }),
  ).toBeVisible();
  if (staff) {
    sql(
      `INSERT INTO user_roles(user_id,role,granted_by,granted_at) VALUES('${u.id}','support',NULL,now())`,
    );
    await page.goto("/dashboard");
  }
  await expect(
    page.getByRole("button", { name: /^Notifications, 0 unread/ }),
  ).toBeVisible();
  return { u, errors };
}
const bell = (p: Page) => p.getByRole("button", { name: /^Notifications,/ });
const dialog = (p: Page) =>
  p.getByRole("dialog", { name: "Notifications", exact: true });
const report = (u: User) =>
  call(u, "/support/reports", {
    category: "bug",
    title: "PRIVATE TICKET TITLE " + randomUUID(),
    body: "PRIVATE REPORT CONTENT never belongs in a notification",
  });
const reply = (u: User, id: string, internal = false) =>
  call(u, `/support/inbox/${id}/messages`, {
    body: "PRIVATE REPLY CONTENT",
    internal,
  });
async function tick(page: Page, count: string) {
  await page.clock.fastForward(31000);
  await expect(bell(page)).toHaveAccessibleName(
    new RegExp(`^Notifications, ${count.replace("+", "\\+")} unread`),
  );
}
test.beforeEach(() =>
  test.skip(!isolated, "Requires explicitly labelled C database"),
);

test("a real Support reply updates the badge automatically, opens the right report and supports keyboard read-all", async ({
  page,
}, info) => {
  if (process.env.SF_NOTIFICATIONS_REDUCED === "1") {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/login");
    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  }
  const { u, errors } = await signUp(page);
  const ticket = await report(u),
    staff = await other(true);
  await reply(staff, ticket.id);
  await tick(page, "2");
  await bell(page).focus();
  await page.keyboard.press("Enter");
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page)).not.toContainText("PRIVATE");
  await expect(dialog(page).getByTestId("notification-item")).toHaveCount(2);
  const firstNotice = dialog(page).getByTestId("notification-item").first();
  const timestampId = await firstNotice.locator("time").getAttribute("id");
  expect(timestampId).toBeTruthy();
  await expect(firstNotice.locator(".notification-open")).toHaveAttribute("aria-describedby", timestampId!);
  await dialog(page)
    .getByRole("button", { name: /^Support replied to your report/ })
    .click();
  await page.waitForURL(`**/reports/${ticket.id}`);
  await expect(bell(page)).toHaveAccessibleName(/^Notifications, 1 unread/);
  await bell(page).click();
  await dialog(page)
    .getByRole("button", { name: "Mark all as read", exact: true })
    .click();
  await expect(bell(page)).toHaveAccessibleName(/^Notifications, 0 unread/);
  for (const width of [320, 390, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
      over: [...document.querySelectorAll("body *")].map((e) => ({
        tag: e.tagName, cls: e.className, right: e.getBoundingClientRect().right,
      })).filter((e) => e.right > document.documentElement.clientWidth + 1).slice(0, 12),
    }));
    // Responsive media/font layout can settle after the viewport protocol call.
    await expect.poll(
      () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
      { message: JSON.stringify(layout) },
    ).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: `../docs/audit/notifications-2026-11-06/${info.project.name}-${width}.png`,
    });
  }
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
  await expect(bell(page)).toBeFocused();
  await bell(page).click();
  await page.keyboard.press("Control+k");
  await expect(dialog(page)).toHaveCount(0);
  await expect(
    page.getByRole("dialog", { name: "Command palette", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
});

test("five saved mute controls persist and suppress only future matching events", async ({
  page,
}) => {
  const { u } = await signUp(page);
  const ticket = await report(u),
    staff = await other(true);
  await page.goto("/settings/preferences");
  const replyBox = page.getByLabel("Mute Support replies", { exact: true }),
    statusBox = page.getByLabel("Mute Report status changes", { exact: true });
  await expect(page.getByRole("checkbox")).toHaveCount(5);
  await replyBox.check();
  await expect(replyBox).toBeEnabled();
  await statusBox.check();
  await expect(statusBox).toBeEnabled();
  await reply(staff, ticket.id);
  await tick(page, "0");
  await page.reload();
  await expect(replyBox).toBeChecked();
  await expect(statusBox).toBeChecked();
  await replyBox.uncheck();
  await expect(replyBox).toBeEnabled();
  await reply(staff, ticket.id);
  await tick(page, "1");
  await bell(page).click();
  await expect(dialog(page).getByTestId("notification-item")).toHaveCount(1);
});

test("Support gets new-report, assignment and reporter events; revoked access opens unavailable without content", async ({
  page,
}) => {
  const { u } = await signUp(page, true);
  const author = await other(),
    ticket = await report(author);
  await tick(page, "1");
  await bell(page).click();
  await dialog(page)
    .getByRole("button", { name: /^A new report arrived/ })
    .click();
  await page.waitForURL(`**/support/${ticket.id}`);
  const colleague = await other(true);
  await call(
    colleague,
    `/support/inbox/${ticket.id}`,
    { assigneeId: u.id },
    "PATCH",
  );
  await call(author, `/support/reports/${ticket.id}/messages`, {
    body: "A private reporter reply",
  });
  await page.goto("/dashboard");
  await expect(bell(page)).toHaveAccessibleName(/^Notifications, 2 unread/);
  sql(`DELETE FROM user_roles WHERE user_id='${u.id}' AND role='support'`);
  await bell(page).click();
  await dialog(page)
    .getByRole("button", { name: /^A report was assigned to you/ })
    .click();
  await expect(dialog(page)).toContainText("no longer available to you");
  expect(new URL(page.url()).pathname).toBe("/dashboard");
  await expect(dialog(page)).not.toContainText("PRIVATE");
});

test("local outages recover and closing a pending open never navigates later", async ({
  page,
}) => {
  const { u } = await signUp(page);
  const ticket = await report(u),
    staff = await other(true);
  await reply(staff, ticket.id);
  await page.route(api + "/notifications", (route) =>
    route.fulfill({
      status: 503,
      json: {
        error: { code: "UNAVAILABLE", message: "Notification audit offline" },
      },
    }),
  );
  await page.clock.fastForward(31000);
  await bell(page).click();
  await expect(dialog(page)).toContainText("Notification audit offline");
  await page.unroute(api + "/notifications");
  await dialog(page)
    .getByRole("button", { name: "Refresh notifications", exact: true })
    .click();
  await expect(dialog(page).getByTestId("notification-item")).toHaveCount(2);
  let finish!: () => void;
  const hold = new Promise<void>((r) => (finish = r));
  let reached = false;
  await page.route(api + "/notifications/*/open", async (route) => {
    reached = true;
    await hold;
    await route
      .fulfill({
        status: 200,
        json: { data: { href: `/reports/${ticket.id}` } },
      })
      .catch(() => {});
  });
  const before = page.url();
  await dialog(page)
    .getByRole("button", { name: /^Support replied to your report/ })
    .click();
  await expect.poll(() => reached).toBe(true);
  await dialog(page)
    .getByRole("button", { name: "Close notifications", exact: true })
    .click();
  finish();
  await page.clock.fastForward(1000);
  expect(page.url()).toBe(before);
  await expect(dialog(page)).toHaveCount(0);
});

test("99+ cap, pagination, mark-one/all and pause/resume operate on real own rows", async ({
  page,
}) => {
  const { u } = await signUp(page);
  const ticket = await report(u);
  sql(
    `INSERT INTO notifications(user_id,kind,ref_id) SELECT '${u.id}','support_reply','${ticket.id}' FROM generate_series(1,100)`,
  );
  await tick(page, "99+");
  await bell(page).click();
  await dialog(page)
    .getByRole("button", { name: "Pause updates", exact: true })
    .click();
  await expect(dialog(page).getByTestId("notification-item")).toHaveCount(20);
  await dialog(page)
    .getByRole("button", { name: "Load earlier notifications", exact: true })
    .click();
  await expect(dialog(page).getByTestId("notification-item")).toHaveCount(40);
  await dialog(page)
    .getByRole("button", { name: /^Mark as read:/ })
    .first()
    .click();
  await expect(bell(page)).toHaveAccessibleName(/^Notifications, 99 unread/);
  await dialog(page)
    .getByRole("button", { name: "Mark all as read", exact: true })
    .click();
  await expect(bell(page)).toHaveAccessibleName(/^Notifications, 0 unread/);
  sql(
    `INSERT INTO notifications(user_id,kind,ref_id) VALUES('${u.id}','support_reply','${ticket.id}')`,
  );
  await page.clock.fastForward(61000);
  await expect(bell(page)).toHaveAccessibleName(/^Notifications, 0 unread/);
  await dialog(page)
    .getByRole("button", { name: "Resume updates", exact: true })
    .click();
  await expect(bell(page)).toHaveAccessibleName(/^Notifications, 1 unread/);
});
