import { test, expect, type Browser, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
const api = process.env.SF_API_URL ?? "http://localhost:5001/v1";
const web = process.env.SF_WEB_URL ?? "http://localhost:3000";
const PASSWORD = "Support-Chrome-2026!";

// A Support or Admin account is made by granting the role straight in Postgres, through the test container named in the environment
// (SF_PG_CONTAINER, SF_PG_USER, SF_PG_DB): there is deliberately no website path to a first privileged account.
const pg = { container: process.env.SF_PG_CONTAINER, user: process.env.SF_PG_USER, db: process.env.SF_PG_DB };
const canPromote = !!(pg.container && pg.user && pg.db);
const sql = (statement: string) => execFileSync("docker", ["exec", pg.container!, "psql", "-U", pg.user!, "-d", pg.db!, "-v", "ON_ERROR_STOP=1", "-c", statement], { stdio: "pipe" });
const grant = (email: string, role: "support" | "admin") => sql(`INSERT INTO user_roles(user_id, role, granted_by, granted_at) SELECT id, '${role}', NULL, now() FROM users WHERE email = '${email}' ON CONFLICT DO NOTHING`);
const TAG = Date.now().toString(36);
let counter = 0;
const unique = (label: string) => `${label}-${TAG}-${++counter}`;

async function signUp(page: Page, label: string) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const email = `sup-${unique(label)}@example.test`;
  await page.goto("/register");
  await page.getByLabel("Name", { exact: true }).fill("Sup " + label);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.locator("#reg-terms").check();
  const reply = page.waitForResponse((r) => r.url() === api + "/auth/register");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  const res = await reply;
  expect(res.status()).toBe(201);
  const token = (await res.json()).data.accessToken as string;
  await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();
  return { errors, email, token };
}
/** Plain fetch, not page.request: the page's own cookie jar must keep its own refresh cookie. */
async function viaApi(token: string, path: string, body?: unknown, method = body === undefined ? "GET" : "POST") {
  const res = await fetch(api + path, { method, headers: { "content-type": "application/json", authorization: "Bearer " + token }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as { data?: Record<string, unknown> & { id: string; code: string }; error?: unknown } };
}
const report = (token: string, over: Record<string, unknown> = {}) =>
  viaApi(token, "/support/reports", { category: "bug", title: unique("Report"), body: "Something went wrong when I pressed run.", ...over });
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
/** Every element inside `root` must sit within the screen, except inside a table that is meant to scroll sideways. */
const stray = (page: Page, root: string) =>
  page.evaluate((selector) => {
    const vw = document.documentElement.clientWidth;
    const base = document.querySelector(selector);
    if (!base) return ["missing " + selector];
    const out: string[] = [];
    for (const el of base.querySelectorAll("*")) {
      if (el.closest(".tbl-wrap")) continue;
      const b = el.getBoundingClientRect();
      if (b.width > 0 && (b.right > vw + 1 || b.left < -1)) out.push(`${el.tagName}.${String(el.getAttribute("class") ?? "").slice(0, 30)} ${Math.round(b.left)}..${Math.round(b.right)} of ${vw}`);
    }
    return out.slice(0, 5);
  }, root);
const reportButton = (page: Page) => page.getByRole("button", { name: "Report a problem", exact: true });

/** A second, separate browser: its own cookies, so two accounts can be signed in at once. */
async function otherBrowser(browser: Browser, page: Page) {
  const ctx = await browser.newContext({ baseURL: web, viewport: page.viewportSize() ?? { width: 1024, height: 900 }, colorScheme: "light" });
  return { ctx, page: await ctx.newPage() };
}
async function supportAccount(page: Page, label = "agent") {
  const who = await signUp(page, label);
  grant(who.email, "support");
  return who;
}

test.describe("Support: problem reports and the inbox", () => {
  test.skip(!canPromote, "Set SF_PG_CONTAINER, SF_PG_USER and SF_PG_DB to run the Support journeys.");

  test("a person reports a problem from the dialog, sees exactly what is sent with it, can switch items off, and gets a reference", async ({ page }) => {
    const { errors, token } = await signUp(page, "reporter");
    await page.goto("/dashboard");
    await reportButton(page).click();
    const dialog = page.getByTestId("report-dialog");
    await expect(dialog).toBeVisible();
    // The facts that would be sent are listed, each with a tick-box; the screen is the route, never the address.
    for (const key of ["page", "app", "browser", "screen", "at"]) await expect(page.getByTestId(`ctx-${key}`)).toBeChecked();
    await expect(page.getByTestId("report-context")).toContainText("/dashboard");
    await expect(page.getByTestId("report-context")).toContainText("Never sent: your password");
    await page.getByTestId("ctx-browser").uncheck();

    // Sending an empty form shows what is missing and sends nothing.
    let posts = 0;
    page.on("request", (r) => r.method() === "POST" && r.url() === api + "/support/reports" && (posts += 1));
    await page.getByTestId("report-send").click();
    await expect(dialog.getByRole("alert").first()).toBeVisible();
    await expect(dialog).toContainText("short title");
    await expect(dialog).toContainText("say a little more");
    expect(posts).toBe(0);

    const title = `Wrong p95 <b>bold</b> ${unique("t")}`;
    await page.getByTestId("report-category-wrong_result").click();
    await page.getByTestId("report-title").fill(title);
    await page.getByTestId("report-body").fill("The p95 shows 4 ms but the queue is full.\nSecond line.");
    await page.getByTestId("report-expected").fill("A much higher p95.");
    const sending = page.waitForRequest((r) => r.method() === "POST" && r.url() === api + "/support/reports");
    await page.getByTestId("report-send").click();
    const payload = JSON.parse((await sending).postData()!);
    expect(payload).toMatchObject({ category: "wrong_result", title, expected: "A much higher p95." });
    expect(payload.context.page).toBe("/dashboard");
    expect(payload.context.browser).toBeUndefined(); // switched off
    expect(Object.keys(payload.context).sort()).toEqual(["app", "at", "page", "screen"]);
    expect(JSON.stringify(payload)).not.toContain(token);
    expect(JSON.stringify(payload).toLowerCase()).not.toContain("cookie");
    expect(Object.keys(payload).sort()).toEqual(["body", "category", "context", "expected", "title"]);

    await expect(page.getByTestId("report-sent")).toBeVisible();
    const code = (await page.getByTestId("report-code").innerText()).trim();
    expect(code).toMatch(/^SF-\d{4,}$/);
    await page.getByRole("link", { name: "My reports" }).click();
    await expect(page.getByTestId("report-title-text")).toHaveText(title);
    await expect(page.locator("[data-testid=report-title-text] b")).toHaveCount(0); // markup is shown as text
    await expect(page.getByTestId("thread-empty")).toBeVisible();
    await expect(page.getByTestId("report-context-list")).toContainText("/dashboard");
    await expect(page.getByTestId("report-context-list")).not.toContainText("Browser");
    await page.goto("/reports");
    await expect(page.getByTestId("report-item-code").first()).toHaveText(code);
    expect(errors).toEqual([]);
  });

  test("a report travels from the person to Support and back: unread, reply, private note, status, and the person never sees the note", async ({ page, browser }) => {
    const { token } = await signUp(page, "asker");
    const title = unique("Round trip");
    const made = await report(token, { title });
    const id = made.body.data!.id;
    const code = made.body.data!.code;
    await page.goto(`/reports/${id}`);
    await expect(page.getByTestId("report-title-text")).toHaveText(title);

    const agent = await otherBrowser(browser, page);
    try {
      await supportAccount(agent.page);
      await agent.page.goto("/support");
      await agent.page.getByTestId("inbox-search").fill(code);
      const row = agent.page.getByTestId("inbox-row");
      await expect(row).toHaveCount(1);
      await expect(row).toHaveAttribute("data-unread", "true");
      await row.getByTestId("inbox-title").click();
      await expect(agent.page.getByTestId("ticket-title")).toHaveText(title);
      await expect(agent.page.getByTestId("ticket")).toContainText("Something went wrong when I pressed run.");
      // Opening it marks it read for this account only.
      await agent.page.goto("/support");
      await agent.page.getByTestId("inbox-search").fill(code);
      await expect(agent.page.getByTestId("inbox-row")).toHaveCount(1); // the filtered list, not the one before the search
      await expect(agent.page.getByTestId("inbox-row")).toHaveAttribute("data-unread", "false");

      await agent.page.getByTestId("inbox-title").click();
      const PUBLIC = "Thanks, we are looking into it " + TAG;
      const NOTE = "PRIVATE-NOTE do not tell them " + TAG;
      await agent.page.getByTestId("reply-box").fill(PUBLIC);
      await agent.page.getByTestId("reply-send").click();
      await expect(agent.page.getByTestId("msg-support")).toContainText(PUBLIC);
      await expect(agent.page.getByTestId("ticket").getByTestId("status-pill").first()).toHaveText(/In progress/);
      await agent.page.getByTestId("mode-note").click();
      await agent.page.getByTestId("reply-box").fill(NOTE);
      await agent.page.getByTestId("reply-send").click();
      await expect(agent.page.getByTestId("msg-note")).toContainText(NOTE);
      await expect(agent.page.getByTestId("msg-note")).toContainText("the reporter cannot see this");
      await agent.page.getByTestId("ctl-priority").selectOption("urgent");
      await expect(agent.page.getByTestId("ticket").getByTestId("priority-pill").first()).toHaveText("Urgent");
      await agent.page.getByTestId("ctl-take").click();
      await expect(agent.page.getByTestId("ctl-take")).toHaveCount(0);
      await agent.page.getByTestId("ctl-status").selectOption("waiting");
      await expect(agent.page.getByTestId("ticket").getByTestId("status-pill").first()).toHaveText(/Waiting for the reporter/);

      // The person sees the reply and the wait, never the note.
      await page.reload();
      await expect(page.getByTestId("msg-support")).toContainText(PUBLIC);
      await expect(page.getByTestId("status-pill")).toHaveText(/Waiting for you/);
      await expect(page.getByTestId("msg-note")).toHaveCount(0);
      expect(await page.locator("body").innerText()).not.toContain("PRIVATE-NOTE");
      expect(await page.locator("body").innerText()).not.toContain("urgent");

      await page.getByTestId("message-box").fill("Here is more detail from me.");
      await page.getByTestId("message-send").click();
      await expect(page.getByTestId("msg-you")).toContainText("more detail");
      await expect(page.getByTestId("status-pill")).toHaveText(/Open/);

      // Support sees the answer as unread again.
      await agent.page.goto("/support");
      await agent.page.getByTestId("inbox-search").fill(code);
      await expect(agent.page.getByTestId("inbox-row")).toHaveCount(1);
      await expect(agent.page.getByTestId("inbox-row")).toHaveAttribute("data-unread", "true");

      // Resolved: the person can reopen it by writing.
      await agent.page.getByTestId("inbox-title").click();
      await agent.page.getByTestId("ctl-status").selectOption("resolved");
      await expect(agent.page.getByTestId("ticket").getByTestId("status-pill").first()).toHaveText(/Resolved/);
      await page.reload();
      await expect(page.getByTestId("reopen-note")).toBeVisible();
      await page.getByTestId("message-box").fill("It is back again.");
      await expect(page.getByTestId("message-send")).toHaveText("Reopen and send");
      await page.getByTestId("message-send").click();
      await expect(page.getByTestId("status-pill")).toHaveText(/Open/);
      await expect(page.getByTestId("reopen-note")).toHaveCount(0);
    } finally {
      await agent.ctx.close();
    }
  });

  test("a report resolved more than 14 days ago can no longer be reopened, and says so", async ({ page }) => {
    const { token } = await signUp(page, "late");
    const made = await report(token);
    sql(`UPDATE support_tickets SET status = 'resolved', resolved_at = now() - interval '15 days' WHERE id = '${made.body.data!.id}'`);
    await page.goto(`/reports/${made.body.data!.id}`);
    await expect(page.getByTestId("closed-note")).toContainText("more than 14 days ago");
    await expect(page.getByTestId("message-box")).toHaveCount(0);
    await expect(page.getByTestId("message-send")).toHaveCount(0);
  });

  test("only Support reaches the inbox: a plain account, an Admin and Support-less roles see a denial, and the server refuses them too", async ({ page, browser }) => {
    const plain = await signUp(page, "plain");
    const made = await report(plain.token);
    for (const path of ["/support", `/support/${made.body.data!.id}`]) {
      await page.goto(path);
      await expect(page.getByTestId("role-gate-denied")).toBeVisible();
      await expect(page.getByTestId("inbox-table")).toHaveCount(0);
      await expect(page.getByTestId("ticket")).toHaveCount(0);
    }
    await expect(page).toHaveTitle(/Support/);
    expect((await viaApi(plain.token, "/support/inbox")).status).toBe(403);
    await page.getByRole("button", { name: "Account menu", exact: true }).click();
    await expect(page.getByRole("menuitem", { name: "Support inbox" })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: "My reports" })).toBeVisible();

    const adminSide = await otherBrowser(browser, page);
    try {
      const admin = await signUp(adminSide.page, "adminonly");
      grant(admin.email, "admin");
      await adminSide.page.goto("/support");
      await expect(adminSide.page.getByTestId("role-gate-denied")).toBeVisible();
      expect((await viaApi(admin.token, "/support/inbox")).status).toBe(403);
    } finally {
      await adminSide.ctx.close();
    }

    const agent = await otherBrowser(browser, page);
    try {
      const s = await supportAccount(agent.page);
      await agent.page.goto("/admin/users");
      await expect(agent.page.getByTestId("role-gate-denied")).toBeVisible();
      await agent.page.goto("/admin/dashboard");
      await expect(agent.page.getByTestId("role-gate-denied")).toBeVisible();
      expect((await viaApi(s.token, "/admin/audit")).status).toBe(403);
      expect((await viaApi(s.token, "/admin/metrics")).status).toBe(403);
      await agent.page.getByRole("button", { name: "Account menu", exact: true }).click();
      await expect(agent.page.getByRole("menuitem", { name: "Support inbox" })).toBeVisible();
    } finally {
      await agent.ctx.close();
    }
  });

  test("hostile text is shown as text everywhere and never runs", async ({ page, browser }) => {
    const { token } = await signUp(page, "hostile");
    const title = `<img src=x onerror="window.__pwned=1"> ${unique("h")}`;
    const body = `<script>window.__pwned=2</script> <a href="javascript:window.__pwned=3">click</a> {{7*7}}\n<iframe src="http://evil.test"></iframe>`;
    const made = await report(token, { title, body });
    await page.goto(`/reports/${made.body.data!.id}`);
    await expect(page.getByTestId("report-title-text")).toHaveText(title);
    await expect(page.getByText("{{7*7}}")).toBeVisible();
    await page.goto("/reports");
    await expect(page.getByTestId("report-item-title").first()).toHaveText(title);
    const agent = await otherBrowser(browser, page);
    try {
      await supportAccount(agent.page);
      await agent.page.goto("/support");
      await agent.page.getByTestId("inbox-search").fill(made.body.data!.code);
      await expect(agent.page.getByTestId("inbox-row")).toHaveCount(1);
      await expect(agent.page.getByTestId("inbox-title")).toHaveText(title);
      await agent.page.getByTestId("inbox-title").click();
      await expect(agent.page.getByTestId("ticket-title")).toHaveText(title);
      await expect(agent.page.getByTestId("ticket")).toContainText("javascript:window.__pwned=3");
      for (const p of [page, agent.page]) {
        expect(await p.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
        await expect(p.locator("img[src='x'], iframe, main script, main a[href^='javascript']")).toHaveCount(0);
      }
    } finally {
      await agent.ctx.close();
    }
  });

  test("a second report with the same title warns once, names the open one, and can still be sent", async ({ page }) => {
    await signUp(page, "dup");
    await page.goto("/dashboard");
    const title = unique("Same title");
    const send = async () => {
      await reportButton(page).click();
      await page.getByTestId("report-title").fill(title);
      await page.getByTestId("report-body").fill("The same problem described again here.");
      await page.getByTestId("report-send").click();
    };
    await send();
    const first = (await page.getByTestId("report-code").innerText()).trim();
    await page.getByRole("button", { name: "Done" }).click();
    await send();
    const warn = page.getByTestId("report-duplicate");
    await expect(warn).toBeVisible();
    await expect(warn).toContainText(first);
    await expect(page.getByTestId("report-sent")).toHaveCount(0);
    await page.getByTestId("report-send-anyway").click();
    await expect(page.getByTestId("report-sent")).toBeVisible();
    expect((await page.getByTestId("report-code").innerText()).trim()).not.toBe(first);
  });

  test("the sixth report in an hour is refused with a plain explanation, and nothing is lost from the form", async ({ page }) => {
    const { token } = await signUp(page, "limit");
    for (let i = 0; i < 5; i++) expect((await report(token)).status).toBe(201);
    await page.goto("/dashboard");
    await reportButton(page).click();
    await page.getByTestId("report-title").fill(unique("Sixth"));
    await page.getByTestId("report-body").fill("I keep finding problems today.");
    await page.getByTestId("report-send").click();
    await expect(page.getByTestId("report-error")).toContainText("several reports this hour");
    await expect(page.getByTestId("report-error")).not.toContainText("REPORTS_PER_HOUR");
    await expect(page.getByTestId("report-title")).toHaveValue(/Sixth/);
    await expect(page.getByTestId("report-send")).toBeEnabled();
  });

  test("the error screen has a one-click way to report, and the dialog opens on top of it", async ({ page }) => {
    await signUp(page, "broken");
    await page.route("**/v1/designs/**", (route) => (route.request().method() === "GET" ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { code: "INTERNAL", message: "boom" } }) }) : route.continue()));
    await page.goto("/designs/11111111-1111-4111-8111-111111111111/edit");
    const button = page.getByTestId("system-report");
    await expect(button).toBeVisible();
    await button.click();
    await expect(page.getByTestId("report-dialog")).toBeVisible();
    await expect(page.getByTestId("report-context")).toContainText("/designs/:id");
    await expect(page.getByTestId("report-context")).not.toContainText("1111-4111");
  });

  test("signed out, the report button explains that a login is needed instead of showing a form", async ({ page }) => {
    await page.goto("/how-it-works");
    await reportButton(page).click();
    await expect(page.getByTestId("report-signin")).toBeVisible();
    await expect(page.getByTestId("report-dialog")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Log in" }).last()).toBeVisible();
  });

  test("the dialog works from the keyboard: Escape closes it and focus returns to the button that opened it", async ({ page }) => {
    await signUp(page, "keys");
    await page.goto("/dashboard");
    const opener = reportButton(page);
    await opener.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("report-dialog")).toBeVisible();
    await expect(page.getByTestId("report-title")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("report-dialog")).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test("the inbox filters by status, category, priority, owner, unread and search, pages with Show more, and says when nothing matches", async ({ page, browser }) => {
    const { token } = await signUp(page, "many");
    const word = `zq${TAG.replace(/[^a-z0-9]/g, "")}`;
    const a = await report(token, { category: "bug", title: `Alpha ${word}`, body: "Alpha body for the filter test." });
    const b = await report(token, { category: "idea", title: `Beta ${word}`, body: "Beta body for the filter test." });
    const c = await report(token, { category: "account", title: `Gamma ${word}`, body: "Gamma body for the filter test." });
    const agent = await otherBrowser(browser, page);
    try {
      const me = await supportAccount(agent.page);
      const p = agent.page;
      await viaApi(me.token, `/support/inbox/${b.body.data!.id}`, { priority: "urgent" }, "PATCH");
      await viaApi(me.token, `/support/inbox/${c.body.data!.id}`, { status: "waiting" }, "PATCH");
      await p.goto("/support");
      await p.getByTestId("inbox-search").fill(word);
      await expect(p.getByTestId("inbox-row")).toHaveCount(3);
      await expect(p.getByTestId("inbox-row").first()).toContainText(`Gamma ${word}`); // newest first
      await p.getByTestId("in-status").selectOption("waiting");
      await expect(p.getByTestId("inbox-row")).toHaveCount(1);
      await expect(p.getByTestId("inbox-row")).toContainText("Gamma");
      await p.getByTestId("in-status").selectOption("");
      await p.getByTestId("in-cat").selectOption("idea");
      await expect(p.getByTestId("inbox-row")).toHaveCount(1);
      await p.getByTestId("in-cat").selectOption("");
      await p.getByTestId("in-pri").selectOption("urgent");
      await expect(p.getByTestId("inbox-row")).toHaveCount(1);
      await expect(p.getByTestId("inbox-row").getByTestId("priority-pill")).toHaveText("Urgent");
      await p.getByTestId("in-pri").selectOption("");
      await p.getByTestId("in-owner").selectOption("me");
      await expect(p.getByTestId("inbox-empty")).toBeVisible();
      await expect(p.getByTestId("inbox-empty")).toContainText("No report matches");
      await p.getByTestId("inbox-clear").click();
      await expect(p.getByTestId("inbox-search")).toHaveValue("");
      await p.getByTestId("inbox-search").fill(word);
      await expect(p.getByTestId("inbox-row")).toHaveCount(3);
      await p.getByTestId("in-owner").selectOption("none");
      await expect(p.getByTestId("inbox-row")).toHaveCount(3);
      await p.getByTestId("in-owner").selectOption("");
      await p.getByTestId("inbox-unread").check();
      await expect(p.getByTestId("inbox-row")).toHaveCount(3);
      await p.getByTestId("inbox-title").first().click();
      await expect(p.getByTestId("ticket")).toBeVisible();
      await p.goto("/support");
      await p.getByTestId("inbox-search").fill(word);
      await p.getByTestId("inbox-unread").check();
      await expect(p.getByTestId("inbox-row")).toHaveCount(2);
      await p.getByTestId("inbox-clear").click();
      await p.getByTestId("inbox-search").fill(a.body.data!.code);
      await expect(p.getByTestId("inbox-row")).toHaveCount(1);
      await p.getByTestId("inbox-clear").click();
      await p.getByTestId("inbox-search").fill("%%%" + word);
      await expect(p.getByTestId("inbox-empty")).toBeVisible();

      // Paging: 27 more reports in the same search, added directly so the per-account limit does not get in the way.
      sql(`INSERT INTO support_tickets (author_id, category, title, body, context, created_at, updated_at, last_user_activity_at)
           SELECT (SELECT id FROM users WHERE email = '${me.email}'), 'other', 'Paging ${word} ' || n, 'A paging test body text.', '{}'::jsonb, now() - (n || ' minutes')::interval, now(), now() FROM generate_series(1, 27) n`);
      await p.getByTestId("inbox-clear").click();
      await p.getByTestId("inbox-search").fill(`Paging ${word}`);
      // Wait for the filtered list itself: the list before the search also has 25 rows.
      await expect(p.getByTestId("inbox-title").last()).toContainText(`Paging ${word}`);
      await expect(p.getByTestId("inbox-row")).toHaveCount(25);
      await p.getByTestId("inbox-more").click();
      await expect(p.getByTestId("inbox-row")).toHaveCount(27);
      await expect(p.getByTestId("inbox-more")).toHaveCount(0);
      const titles = await p.getByTestId("inbox-title").allInnerTexts();
      expect(new Set(titles).size).toBe(27);
      sql(`DELETE FROM support_tickets WHERE title LIKE 'Paging ${word}%'`);
    } finally {
      await agent.ctx.close();
    }
  });

  for (const width of [320, 390]) {
    test(`the dialog, My reports, the inbox and a report fit a ${width}px phone`, async ({ page, browser }) => {
      await page.setViewportSize({ width, height: 800 });
      const { token } = await signUp(page, "phone" + width);
      const made = await report(token, { title: "Phone " + unique("p") + " with a rather long title that has to wrap on a narrow screen", body: "A".repeat(300) + " " + "B".repeat(120) });
      await page.goto("/reports");
      expect(await noOverflow(page)).toBe(true);
      await page.goto(`/reports/${made.body.data!.id}`);
      await expect(page.getByTestId("report-title-text")).toBeVisible();
      expect(await noOverflow(page)).toBe(true);
      expect(await stray(page, "main")).toEqual([]);
      await page.goto("/dashboard");
      await page.getByRole("button", { name: "Account menu", exact: true }).click();
      await page.getByRole("menuitem", { name: "My reports" }).click();
      await page.getByTestId("new-report").click();
      await expect(page.getByTestId("report-dialog")).toBeVisible();
      await page.getByTestId("report-send").click();
      expect(await noOverflow(page)).toBe(true);
      expect(await stray(page, ".modal")).toEqual([]);
      const box = await page.getByTestId("report-dialog").boundingBox();
      expect(box!.width).toBeLessThanOrEqual(width);
      expect(box!.x).toBeGreaterThanOrEqual(0);

      const agent = await otherBrowser(browser, page);
      try {
        await agent.page.setViewportSize({ width, height: 800 });
        await supportAccount(agent.page);
        await agent.page.goto("/support");
        await expect(agent.page.getByTestId("inbox-table")).toBeVisible();
        expect(await noOverflow(agent.page)).toBe(true);
        expect(await stray(agent.page, "main")).toEqual([]);
        // The table itself does not need to scroll sideways, and status and priority are still shown under the title.
        expect(await agent.page.locator(".tbl-wrap").first().evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
        await expect(agent.page.getByTestId("status-pill-narrow").first()).toBeVisible();
        await expect(agent.page.getByTestId("status-pill").first()).toBeHidden();
        await agent.page.goto(`/support/${made.body.data!.id}`);
        await expect(agent.page.getByTestId("ticket")).toBeVisible();
        expect(await noOverflow(agent.page)).toBe(true);
        expect(await stray(agent.page, "main")).toEqual([]);
      } finally {
        await agent.ctx.close();
      }
    });
  }
});
