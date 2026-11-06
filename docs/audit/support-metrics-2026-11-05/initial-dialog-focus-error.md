# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: support.spec.ts >> Support: problem reports and the inbox >> the dialog works from the keyboard: Escape closes it and focus returns to the button that opened it
- Location: tests\browser\support.spec.ts:341:7

# Error details

```
Error: expect(locator).toBeFocused() failed

Locator:  getByTestId('report-title')
Expected: focused
Received: inactive
Timeout:  15000ms

Call log:
  - Expect "toBeFocused" getByTestId('report-title') with timeout 15000ms
  - waiting for getByTestId('report-title')
    33 × locator resolved to <input value="" id="rp-title" class="input" maxlength="140" aria-invalid="false" data-autofocus="true" data-testid="report-title"/>
       - unexpected value "inactive"

```

```yaml
- textbox "Title"
```

# Test source

```ts
  248 |       await agent.page.getByRole("button", { name: "Account menu", exact: true }).click();
  249 |       await expect(agent.page.getByRole("menuitem", { name: "Support inbox" })).toBeVisible();
  250 |     } finally {
  251 |       await agent.ctx.close();
  252 |     }
  253 |   });
  254 |
  255 |   test("hostile text is shown as text everywhere and never runs", async ({ page, browser }) => {
  256 |     const { token } = await signUp(page, "hostile");
  257 |     const title = `<img src=x onerror="window.__pwned=1"> ${unique("h")}`;
  258 |     const body = `<script>window.__pwned=2</script> <a href="javascript:window.__pwned=3">click</a> {{7*7}}\n<iframe src="http://evil.test"></iframe>`;
  259 |     const made = await report(token, { title, body });
  260 |     await page.goto(`/reports/${made.body.data!.id}`);
  261 |     await expect(page.getByTestId("report-title-text")).toHaveText(title);
  262 |     await expect(page.getByText("{{7*7}}")).toBeVisible();
  263 |     await page.goto("/reports");
  264 |     await expect(page.getByTestId("report-item-title").first()).toHaveText(title);
  265 |     const agent = await otherBrowser(browser, page);
  266 |     try {
  267 |       await supportAccount(agent.page);
  268 |       await agent.page.goto("/support");
  269 |       await agent.page.getByTestId("inbox-search").fill(made.body.data!.code);
  270 |       await expect(agent.page.getByTestId("inbox-row")).toHaveCount(1);
  271 |       await expect(agent.page.getByTestId("inbox-title")).toHaveText(title);
  272 |       await agent.page.getByTestId("inbox-title").click();
  273 |       await expect(agent.page.getByTestId("ticket-title")).toHaveText(title);
  274 |       await expect(agent.page.getByTestId("ticket")).toContainText("javascript:window.__pwned=3");
  275 |       for (const p of [page, agent.page]) {
  276 |         expect(await p.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
  277 |         await expect(p.locator("img[src='x'], iframe, main script, main a[href^='javascript']")).toHaveCount(0);
  278 |       }
  279 |     } finally {
  280 |       await agent.ctx.close();
  281 |     }
  282 |   });
  283 |
  284 |   test("a second report with the same title warns once, names the open one, and can still be sent", async ({ page }) => {
  285 |     await signUp(page, "dup");
  286 |     await page.goto("/dashboard");
  287 |     const title = unique("Same title");
  288 |     const send = async () => {
  289 |       await reportButton(page).click();
  290 |       await page.getByTestId("report-title").fill(title);
  291 |       await page.getByTestId("report-body").fill("The same problem described again here.");
  292 |       await page.getByTestId("report-send").click();
  293 |     };
  294 |     await send();
  295 |     const first = (await page.getByTestId("report-code").innerText()).trim();
  296 |     await page.getByRole("button", { name: "Done" }).click();
  297 |     await send();
  298 |     const warn = page.getByTestId("report-duplicate");
  299 |     await expect(warn).toBeVisible();
  300 |     await expect(warn).toContainText(first);
  301 |     await expect(page.getByTestId("report-sent")).toHaveCount(0);
  302 |     await page.getByTestId("report-send-anyway").click();
  303 |     await expect(page.getByTestId("report-sent")).toBeVisible();
  304 |     expect((await page.getByTestId("report-code").innerText()).trim()).not.toBe(first);
  305 |   });
  306 |
  307 |   test("the sixth report in an hour is refused with a plain explanation, and nothing is lost from the form", async ({ page }) => {
  308 |     const { token } = await signUp(page, "limit");
  309 |     for (let i = 0; i < 5; i++) expect((await report(token)).status).toBe(201);
  310 |     await page.goto("/dashboard");
  311 |     await reportButton(page).click();
  312 |     await page.getByTestId("report-title").fill(unique("Sixth"));
  313 |     await page.getByTestId("report-body").fill("I keep finding problems today.");
  314 |     await page.getByTestId("report-send").click();
  315 |     await expect(page.getByTestId("report-error")).toContainText("several reports this hour");
  316 |     await expect(page.getByTestId("report-error")).not.toContainText("REPORTS_PER_HOUR");
  317 |     await expect(page.getByTestId("report-title")).toHaveValue(/Sixth/);
  318 |     await expect(page.getByTestId("report-send")).toBeEnabled();
  319 |   });
  320 |
  321 |   test("the error screen has a one-click way to report, and the dialog opens on top of it", async ({ page }) => {
  322 |     await signUp(page, "broken");
  323 |     await page.route("**/v1/designs/**", (route) => (route.request().method() === "GET" ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { code: "INTERNAL", message: "boom" } }) }) : route.continue()));
  324 |     await page.goto("/designs/11111111-1111-4111-8111-111111111111/edit");
  325 |     const button = page.getByTestId("system-report");
  326 |     await expect(button).toBeVisible();
  327 |     await button.click();
  328 |     await expect(page.getByTestId("report-dialog")).toBeVisible();
  329 |     await expect(page.getByTestId("report-context")).toContainText("/designs/:id");
  330 |     await expect(page.getByTestId("report-context")).not.toContainText("1111-4111");
  331 |   });
  332 |
  333 |   test("signed out, the report button explains that a login is needed instead of showing a form", async ({ page }) => {
  334 |     await page.goto("/how-it-works");
  335 |     await reportButton(page).click();
  336 |     await expect(page.getByTestId("report-signin")).toBeVisible();
  337 |     await expect(page.getByTestId("report-dialog")).toHaveCount(0);
  338 |     await expect(page.getByRole("link", { name: "Log in" }).last()).toBeVisible();
  339 |   });
  340 |
  341 |   test("the dialog works from the keyboard: Escape closes it and focus returns to the button that opened it", async ({ page }) => {
  342 |     await signUp(page, "keys");
  343 |     await page.goto("/dashboard");
  344 |     const opener = reportButton(page);
  345 |     await opener.focus();
  346 |     await page.keyboard.press("Enter");
  347 |     await expect(page.getByTestId("report-dialog")).toBeVisible();
> 348 |     await expect(page.getByTestId("report-title")).toBeFocused();
      |                                                    ^ Error: expect(locator).toBeFocused() failed
  349 |     await page.keyboard.press("Escape");
  350 |     await expect(page.getByTestId("report-dialog")).toHaveCount(0);
  351 |     await expect(opener).toBeFocused();
  352 |   });
  353 |
  354 |   test("the inbox filters by status, category, priority, owner, unread and search, pages with Show more, and says when nothing matches", async ({ page, browser }) => {
  355 |     const { token } = await signUp(page, "many");
  356 |     const word = `zq${TAG.replace(/[^a-z0-9]/g, "")}`;
  357 |     const a = await report(token, { category: "bug", title: `Alpha ${word}`, body: "Alpha body for the filter test." });
  358 |     const b = await report(token, { category: "idea", title: `Beta ${word}`, body: "Beta body for the filter test." });
  359 |     const c = await report(token, { category: "account", title: `Gamma ${word}`, body: "Gamma body for the filter test." });
  360 |     const agent = await otherBrowser(browser, page);
  361 |     try {
  362 |       const me = await supportAccount(agent.page);
  363 |       const p = agent.page;
  364 |       await viaApi(me.token, `/support/inbox/${b.body.data!.id}`, { priority: "urgent" }, "PATCH");
  365 |       await viaApi(me.token, `/support/inbox/${c.body.data!.id}`, { status: "waiting" }, "PATCH");
  366 |       await p.goto("/support");
  367 |       await p.getByTestId("inbox-search").fill(word);
  368 |       await expect(p.getByTestId("inbox-row")).toHaveCount(3);
  369 |       await expect(p.getByTestId("inbox-row").first()).toContainText(`Gamma ${word}`); // newest first
  370 |       await p.getByTestId("in-status").selectOption("waiting");
  371 |       await expect(p.getByTestId("inbox-row")).toHaveCount(1);
  372 |       await expect(p.getByTestId("inbox-row")).toContainText("Gamma");
  373 |       await p.getByTestId("in-status").selectOption("");
  374 |       await p.getByTestId("in-cat").selectOption("idea");
  375 |       await expect(p.getByTestId("inbox-row")).toHaveCount(1);
  376 |       await p.getByTestId("in-cat").selectOption("");
  377 |       await p.getByTestId("in-pri").selectOption("urgent");
  378 |       await expect(p.getByTestId("inbox-row")).toHaveCount(1);
  379 |       await expect(p.getByTestId("inbox-row").getByTestId("priority-pill")).toHaveText("Urgent");
  380 |       await p.getByTestId("in-pri").selectOption("");
  381 |       await p.getByTestId("in-owner").selectOption("me");
  382 |       await expect(p.getByTestId("inbox-empty")).toBeVisible();
  383 |       await expect(p.getByTestId("inbox-empty")).toContainText("No report matches");
  384 |       await p.getByTestId("inbox-clear").click();
  385 |       await expect(p.getByTestId("inbox-search")).toHaveValue("");
  386 |       await p.getByTestId("inbox-search").fill(word);
  387 |       await expect(p.getByTestId("inbox-row")).toHaveCount(3);
  388 |       await p.getByTestId("in-owner").selectOption("none");
  389 |       await expect(p.getByTestId("inbox-row")).toHaveCount(3);
  390 |       await p.getByTestId("in-owner").selectOption("");
  391 |       await p.getByTestId("inbox-unread").check();
  392 |       await expect(p.getByTestId("inbox-row")).toHaveCount(3);
  393 |       await p.getByTestId("inbox-title").first().click();
  394 |       await expect(p.getByTestId("ticket")).toBeVisible();
  395 |       await p.goto("/support");
  396 |       await p.getByTestId("inbox-search").fill(word);
  397 |       await p.getByTestId("inbox-unread").check();
  398 |       await expect(p.getByTestId("inbox-row")).toHaveCount(2);
  399 |       await p.getByTestId("inbox-clear").click();
  400 |       await p.getByTestId("inbox-search").fill(a.body.data!.code);
  401 |       await expect(p.getByTestId("inbox-row")).toHaveCount(1);
  402 |       await p.getByTestId("inbox-clear").click();
  403 |       await p.getByTestId("inbox-search").fill("%%%" + word);
  404 |       await expect(p.getByTestId("inbox-empty")).toBeVisible();
  405 |
  406 |       // Paging: 27 more reports in the same search, added directly so the per-account limit does not get in the way.
  407 |       sql(`INSERT INTO support_tickets (author_id, category, title, body, context, created_at, updated_at, last_user_activity_at)
  408 |            SELECT (SELECT id FROM users WHERE email = '${me.email}'), 'other', 'Paging ${word} ' || n, 'A paging test body text.', '{}'::jsonb, now() - (n || ' minutes')::interval, now(), now() FROM generate_series(1, 27) n`);
  409 |       await p.getByTestId("inbox-clear").click();
  410 |       await p.getByTestId("inbox-search").fill(`Paging ${word}`);
  411 |       // Wait for the filtered list itself: the list before the search also has 25 rows.
  412 |       await expect(p.getByTestId("inbox-title").last()).toContainText(`Paging ${word}`);
  413 |       await expect(p.getByTestId("inbox-row")).toHaveCount(25);
  414 |       await p.getByTestId("inbox-more").click();
  415 |       await expect(p.getByTestId("inbox-row")).toHaveCount(27);
  416 |       await expect(p.getByTestId("inbox-more")).toHaveCount(0);
  417 |       const titles = await p.getByTestId("inbox-title").allInnerTexts();
  418 |       expect(new Set(titles).size).toBe(27);
  419 |       sql(`DELETE FROM support_tickets WHERE title LIKE 'Paging ${word}%'`);
  420 |     } finally {
  421 |       await agent.ctx.close();
  422 |     }
  423 |   });
  424 |
  425 |   for (const width of [320, 390]) {
  426 |     test(`the dialog, My reports, the inbox and a report fit a ${width}px phone`, async ({ page, browser }) => {
  427 |       await page.setViewportSize({ width, height: 800 });
  428 |       const { token } = await signUp(page, "phone" + width);
  429 |       const made = await report(token, { title: "Phone " + unique("p") + " with a rather long title that has to wrap on a narrow screen", body: "A".repeat(300) + " " + "B".repeat(120) });
  430 |       await page.goto("/reports");
  431 |       expect(await noOverflow(page)).toBe(true);
  432 |       await page.goto(`/reports/${made.body.data!.id}`);
  433 |       await expect(page.getByTestId("report-title-text")).toBeVisible();
  434 |       expect(await noOverflow(page)).toBe(true);
  435 |       expect(await stray(page, "main")).toEqual([]);
  436 |       await page.goto("/dashboard");
  437 |       await page.getByRole("button", { name: "Account menu", exact: true }).click();
  438 |       await page.getByRole("menuitem", { name: "My reports" }).click();
  439 |       await page.getByTestId("new-report").click();
  440 |       await expect(page.getByTestId("report-dialog")).toBeVisible();
  441 |       await page.getByTestId("report-send").click();
  442 |       expect(await noOverflow(page)).toBe(true);
  443 |       expect(await stray(page, ".modal")).toEqual([]);
  444 |       const box = await page.getByTestId("report-dialog").boundingBox();
  445 |       expect(box!.width).toBeLessThanOrEqual(width);
  446 |       expect(box!.x).toBeGreaterThanOrEqual(0);
  447 |
  448 |       const agent = await otherBrowser(browser, page);
```