const { test } = require("node:test");
const assert = require("node:assert/strict");
const S = require("../src/lib/support.ts");
const { ApiError } = require("../src/lib/api/errors.ts");

const NOW = new Date("2026-11-05T10:15:30.456Z");
const input = (over = {}) => ({ routePattern: "/designs/:id/share", appVersion: "0.1.0", userAgent: "Mozilla/5.0 (Test) Chrome/130", width: 1024, height: 768, now: NOW, errorId: null, ...over });
const err = (status, code, details) => new ApiError(code, "server words that must never be shown", status, details);

test("the context holds only the fixed list of facts, with the route pattern and never an address", () => {
  const ctx = S.collectContext(input({ errorId: "req-1234-abcd" }));
  assert.deepEqual(Object.keys(ctx).sort(), ["app", "at", "browser", "errorId", "page", "screen"]);
  assert.deepEqual(ctx, { page: "/designs/:id/share", app: "0.1.0", browser: "Mozilla/5.0 (Test) Chrome/130", screen: { width: 1024, height: 768 }, at: "2026-11-05T10:15:30.456Z", errorId: "req-1234-abcd" });
});

test("a page with a query string, a fragment, spaces, a full address or control characters is left out, never trimmed into something else", () => {
  for (const bad of ["/reset?token=abc", "/x#access_token=abc", "/a b", "http://evil.test/x", "relative", "/a\u0007b", "/" + "x".repeat(200), "", null, undefined]) {
    assert.equal("page" in S.collectContext(input({ routePattern: bad })), false, String(bad));
  }
  assert.equal(S.collectContext(input({ routePattern: "/share/:token" })).page, "/share/:token");
});

test("version, browser, screen, time and error reference are checked one by one", () => {
  const ctx = S.collectContext(input({ appVersion: "1 0", userAgent: "a\u0000b", width: 0, height: 5, errorId: "<script>" }));
  assert.deepEqual(Object.keys(ctx).sort(), ["at", "page"]);
  assert.equal(S.collectContext(input({ userAgent: "x".repeat(500) })).browser.length, 200);
  assert.deepEqual(S.collectContext(input({ width: 1023.6, height: 767.4 })).screen, { width: 1024, height: 767 });
  assert.equal("at" in S.collectContext(input({ now: new Date("nope") })), false);
  assert.equal("errorId" in S.collectContext(input({ errorId: "x".repeat(65) })), false);
});

test("nothing is read beyond the named inputs: an object carrying a token and cookies leaves no trace", () => {
  const ctx = S.collectContext({ ...input(), token: "eyJhbGciOi", cookies: "sf_refresh=abc", localStorage: { a: 1 }, body: "secret" });
  assert.equal(JSON.stringify(ctx).includes("eyJ"), false);
  assert.equal(JSON.stringify(ctx).includes("sf_refresh"), false);
  assert.deepEqual(Object.keys(ctx).filter((k) => !S.CONTEXT_KEYS.includes(k)), []);
});

test("each item can be removed before sending, and the rows say exactly what will be sent", () => {
  const ctx = S.collectContext(input({ errorId: "req-1" }));
  const rows = S.contextRows(ctx);
  assert.deepEqual(rows.map((r) => r.key), ["page", "app", "browser", "screen", "at", "errorId"]);
  assert.equal(rows.find((r) => r.key === "screen").value, "1024 × 768");
  assert.equal(rows.find((r) => r.key === "at").value, "2026-11-05 10:15 UTC");
  const trimmed = S.withoutKeys(ctx, new Set(["browser", "at", "page", "nonsense"]));
  assert.deepEqual(Object.keys(trimmed).sort(), ["app", "errorId", "screen"]);
  assert.deepEqual(S.withoutKeys(ctx, new Set(S.CONTEXT_KEYS)), {});
});

test("the form is checked the way the server checks it", () => {
  const ok = { category: "bug", title: "Run does nothing", body: "I pressed Run and nothing happened.", expected: "" };
  assert.deepEqual(S.draftIssues(ok), {});
  assert.match(S.draftIssues({ ...ok, title: "ab" }).title, /at least 3/);
  assert.match(S.draftIssues({ ...ok, title: "   " }).title, /short title/);
  assert.match(S.draftIssues({ ...ok, title: "x".repeat(121) }).title, /120/);
  assert.match(S.draftIssues({ ...ok, body: "too short" }).body, /at least 10/);
  assert.match(S.draftIssues({ ...ok, body: "x".repeat(4001) }).body, /4000/);
  assert.match(S.draftIssues({ ...ok, expected: "x".repeat(2001) }).expected, /2000/);
  assert.match(S.draftIssues({ ...ok, body: "bad\u0000 text here" }).body, /cannot be sent/);
  assert.deepEqual(S.draftIssues({ ...ok, title: "x".repeat(120), body: "x".repeat(4000), expected: "x".repeat(2000) }), {});
  assert.equal(S.draftIssues({ ...ok, body: "line\none\ttab and more" }).body, undefined, "new lines and tabs are fine");
  assert.equal(S.messageIssue(""), "Write a message first.");
  assert.equal(S.messageIssue("  hi  "), null);
  assert.match(S.messageIssue("x".repeat(4001)), /4000/);
});

test("the request is trimmed, leaves out an empty 'expected', and only flags a duplicate when told to", () => {
  const draft = { category: "idea", title: "  Title here  ", body: "  A body that is long enough.  ", expected: "   " };
  const ctx = { page: "/x" };
  assert.deepEqual(S.buildRequest(draft, ctx), { category: "idea", title: "Title here", body: "A body that is long enough.", context: { page: "/x" } });
  assert.deepEqual(S.buildRequest({ ...draft, expected: " works " }, ctx, true), { category: "idea", title: "Title here", body: "A body that is long enough.", expected: "works", context: { page: "/x" }, confirmDuplicate: true });
});

test("errors say what to do and never echo the server's own words", () => {
  const all = [
    err(429, "RATE_LIMITED", { reason: "REPORTS_PER_HOUR", retryAfterSeconds: 1500 }),
    err(429, "RATE_LIMITED", { reason: "REPORTS_PER_HOUR", retryAfterSeconds: 20 }),
    err(429, "RATE_LIMITED", { reason: "REPORTS_PER_DAY" }),
    err(429, "RATE_LIMITED", { reason: "MESSAGES_PER_HOUR" }),
    err(409, "CONFLICT", { reason: "REOPEN_WINDOW_PASSED" }),
    err(422, "VALIDATION_FAILED"),
    err(429, "RATE_LIMITED"),
    err(401, "UNAUTHENTICATED"),
    err(403, "FORBIDDEN"),
    err(404, "NOT_FOUND"),
    err(0, "NETWORK"),
    new Error("boom"),
  ].map(S.supportErrorText);
  assert.match(all[0], /about 25 minutes/);
  assert.match(all[1], /about a minute/);
  assert.match(all[2], /tomorrow/);
  assert.match(all[3], /wait a little/);
  assert.match(all[4], /14 days/);
  assert.match(all[10], /could not be reached/);
  for (const text of all) assert.equal(text.includes("server words"), false);
  assert.equal(new Set([0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((k) => all[k])).size, 11, "each different problem gets its own sentence");
});

test("a duplicate warning gives the reference of the report that is already open, and only for that case", () => {
  assert.equal(S.duplicateCode(err(409, "CONFLICT", { reason: "DUPLICATE_OPEN", code: "SF-1042" })), "SF-1042");
  assert.equal(S.duplicateCode(err(409, "CONFLICT", { reason: "REOPEN_WINDOW_PASSED" })), null);
  assert.equal(S.duplicateCode(err(409, "CONFLICT", { reason: "SOMETHING_ELSE", code: "SF-9999" })), null, "a different conflict that happens to carry a code is not a duplicate");
  assert.equal(S.duplicateCode(err(422, "VALIDATION_FAILED", { reason: "DUPLICATE_OPEN", code: "SF-1" })), null);
  assert.equal(S.duplicateCode(new Error("x")), null);
});

test("ages are written plainly and the badge turns amber after a day and red after three, never for a resolved report", () => {
  const now = Date.parse("2026-11-05T10:00:00.000Z");
  const ago = (ms) => new Date(now - ms).toISOString();
  assert.deepEqual([0, 59e3, 60e3, 3599e3, 3600e3, 86399e3, 86400e3, 3 * 86400e3 + 5].map((ms) => S.sinceText(ago(ms), now)), ["just now", "just now", "1 min", "59 min", "1 h", "23 h", "1 d", "3 d"]);
  assert.equal(S.sinceText(ago(-5000), now), "just now", "a clock a little ahead never shows a negative age");
  const tone = (ms, status = "open") => S.ageTone(ago(ms), status, now);
  assert.deepEqual([tone(0), tone(86399e3), tone(86400e3), tone(3 * 86400e3 - 1), tone(3 * 86400e3), tone(30 * 86400e3)], ["ok", "ok", "warn", "warn", "fail", "fail"]);
  assert.equal(tone(30 * 86400e3, "resolved"), "ok");
  assert.equal(tone(30 * 86400e3, "waiting"), "fail");
});

test("the inbox query names only the filters that are set, trims the search, and carries the cursor", () => {
  const f = S.emptyFilters();
  assert.equal(S.hasFilters(f), false);
  assert.equal(S.inboxQuery(f), "limit=25");
  const set = { ...f, status: "waiting", category: "bug", priority: "urgent", assignee: "me", q: "  SF-1042  ", unread: true };
  assert.equal(S.hasFilters(set), true);
  assert.equal(S.inboxQuery(set), "limit=25&status=waiting&category=bug&priority=urgent&assignee=me&q=SF-1042&unread=true");
  assert.equal(S.inboxQuery({ ...f, q: "a&b=c d" }), "limit=25&q=a%26b%3Dc+d", "a search cannot add its own parameters");
  assert.equal(S.inboxQuery({ ...f, q: "x".repeat(300) }).length, "limit=25&q=".length + 100);
  assert.equal(S.inboxQuery(f, { at: "2026-11-05T10:00:00.000Z", id: "11111111-1111-1111-1111-111111111111" }), "limit=25&before=2026-11-05T10%3A00%3A00.000Z&beforeId=11111111-1111-1111-1111-111111111111");
  assert.equal(S.hasFilters({ ...f, q: "   " }), false);
});

test("every category, status and priority has a plain label, and the two wordings for 'waiting' differ", () => {
  for (const c of S.CATEGORIES) assert.ok(S.CATEGORY_LABEL[c] && S.CATEGORY_HINT[c], c);
  for (const s of S.STATUSES) assert.ok(S.STATUS_LABEL[s] && S.STATUS_LABEL_SUPPORT[s] && S.STATUS_TONE[s], s);
  for (const p of S.PRIORITIES) assert.ok(S.PRIORITY_LABEL[p] && S.PRIORITY_TONE[p], p);
  assert.equal(S.STATUS_LABEL.waiting, "Waiting for you");
  assert.equal(S.STATUS_LABEL_SUPPORT.waiting, "Waiting for the reporter");
});
