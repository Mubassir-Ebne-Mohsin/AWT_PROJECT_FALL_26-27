const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", { url: "http://localhost:3000" });
for (const name of ["window", "document", "HTMLElement", "Element", "Node", "Event", "MouseEvent", "KeyboardEvent", "HTMLInputElement", "HTMLSelectElement", "localStorage"]) {
  Object.defineProperty(global, name, { configurable: true, value: dom.window[name] });
}
global.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
const React = require("react");
const { act } = React;
const { createRoot } = require("react-dom/client");
const { QueryClient, QueryClientProvider } = require("@tanstack/react-query");
const h = React.createElement;
const { ApiError } = require("../src/lib/api/errors.ts");

// A small fake of the review API and of the account's roles; every call is recorded.
const ME = { id: "me-1", displayName: "Me", email: "me@example.test" };
let myRoles = ["user", "reviewer"];
let grants = [];
let inbox = [];
let review = null;
let calls = [];
let failNext = null;
const fail = () => {
  const e = failNext;
  failNext = null;
  return e;
};
require.cache[require.resolve("next/navigation")] = { exports: { useRouter: () => ({ push() {}, replace() {} }), usePathname: () => "/reviews", useSearchParams: () => new URLSearchParams("") } };
require.cache[require.resolve("next/link")] = { exports: { __esModule: true, default: ({ children, ...props }) => h("a", props, children) } };
require.cache[require.resolve("../src/components/auth/auth-provider.tsx")] = { exports: { useAuth: () => ({ user: ME, status: "authed", signOut() {} }), initialsOf: () => "M" } };
require.cache[require.resolve("../src/lib/api/roles.ts")] = { exports: { fetchMyRoles: () => Promise.resolve({ roles: myRoles }) } };
require.cache[require.resolve("../src/lib/api/history.ts")] = {
  exports: {
    fetchVersions: () => Promise.resolve([{ revision: 2, createdAt: "2026-10-02T10:00:00.000Z" }, { revision: 1, createdAt: "2026-10-01T10:00:00.000Z" }]),
    fetchRunSummaries: () => Promise.resolve([{ id: "run-1", kind: "simulation", status: "completed", designRevision: 2, createdAt: "2026-10-02T11:00:00.000Z", verdict: "pass" }]),
  },
};
require.cache[require.resolve("../src/components/report/report-document.tsx")] = { exports: { ReportDocument: ({ report }) => h("article", { "data-testid": "report-doc" }, report.name) } };
require.cache[require.resolve("../src/lib/api/reviews.ts")] = {
  exports: {
    createReview: (id, body) => {
      calls.push(["create", id, body]);
      const e = fail();
      if (e) return Promise.reject(e);
      const g = { id: "g-" + (grants.length + 1), designId: id, reviewer: { displayName: "Rhea Reviewer", email: body.email }, revision: body.revision ?? 2, runId: body.run ?? null, createdAt: "2026-10-30T10:00:00.000Z", revokedAt: null, status: "active" };
      grants = [g, ...grants];
      return Promise.resolve(g);
    },
    fetchReviews: () => Promise.resolve(grants),
    revokeReview: (id, grantId) => {
      calls.push(["revoke", id, grantId]);
      const e = fail();
      if (e) return Promise.reject(e);
      grants = grants.map((g) => (g.id === grantId ? { ...g, status: "revoked", revokedAt: "2026-10-31T10:00:00.000Z" } : g));
      return Promise.resolve(grants.find((g) => g.id === grantId));
    },
    fetchSharedWithMe: () => {
      calls.push(["inbox"]);
      const e = fail();
      return e ? Promise.reject(e) : Promise.resolve(inbox);
    },
    fetchReview: (id) => {
      calls.push(["open", id]);
      const e = fail();
      return e ? Promise.reject(e) : Promise.resolve(review);
    },
  },
};
const { ReviewShares } = require("../src/components/review/review-shares.tsx");
const { SharedWithMe } = require("../src/components/review/shared-with-me.tsx");
const { ReviewView } = require("../src/components/review/review-view.tsx");
const { TopBar } = require("../src/components/shell/top-bar.tsx");
const { UiProvider } = require("../src/components/shell/ui-provider.tsx");
const { ThemeProvider } = require("next-themes");
const P = require("../src/lib/review-presentation.ts");

test("R3 text: a failed share says what to do and never echoes the server's own message", () => {
  const err = (status, code, details) => new ApiError(code, "SECRET SERVER TEXT", status, details);
  assert.match(P.reviewErrorText(err(404, "NOT_FOUND", { reason: "NO_REVIEWER" })), /needs an account that an Admin has given the Reviewer role/);
  assert.match(P.reviewErrorText(err(409, "CONFLICT", { reason: "SELF" })), /yourself/);
  assert.match(P.reviewErrorText(err(409, "CONFLICT", { reason: "ALREADY_SHARED" })), /already shared/);
  assert.match(P.reviewErrorText(err(422, "VALIDATION_FAILED", { reason: "REVIEW_LIMIT_REACHED" })), /10 active reviews/);
  assert.match(P.reviewErrorText(err(403, "FORBIDDEN")), /another account/);
  assert.match(P.reviewErrorText(err(0, "NETWORK")), /could not be reached/);
  for (const e of [err(500, "INTERNAL"), new Error("boom")]) assert.doesNotMatch(P.reviewErrorText(e), /SECRET|boom/);
});

test("R3 text: grant lines, and an email must look like one before anything is sent", () => {
  assert.match(P.grantStatusText({ status: "active", createdAt: "2026-10-30T10:00:00.000Z", revokedAt: null }), /^Shared Oct 30, 2026/);
  assert.match(P.grantStatusText({ status: "revoked", createdAt: "2026-10-30T10:00:00.000Z", revokedAt: "2026-10-31T10:00:00.000Z" }), /^Stopped Oct 31, 2026/);
  assert.equal(P.grantStatusText({ status: "revoked", createdAt: "2026-10-30T10:00:00.000Z", revokedAt: null }), "Stopped");
  for (const ok of ["a@b.co", " rhea@example.test "]) assert.equal(P.looksLikeEmail(ok), true);
  for (const bad of ["", "rhea", "rhea@", "@example.test", "a b@c.de", "a@b"]) assert.equal(P.looksLikeEmail(bad), false);
});

let roots = [];
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } } });
async function render(content) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => root.render(h(QueryClientProvider, { client: client() }, content)));
  await settle();
  return container;
}
afterEach(async () => {
  for (const root of roots) await act(async () => root.unmount());
  roots = [];
  document.body.innerHTML = "";
  myRoles = ["user", "reviewer"];
  grants = [];
  inbox = [];
  review = null;
  calls = [];
  failNext = null;
});
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
const click = async (el) => { await act(async () => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }))); await settle(); };
const typeInto = async (input, value) => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, value);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
};
const choose = async (select, value) => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
    setter.call(select, value);
    select.dispatchEvent(new window.Event("change", { bubbles: true }));
  });
};
const buttonNamed = (root, text) => [...root.querySelectorAll("button")].find((b) => (b.getAttribute("aria-label") || b.textContent).trim() === text);
const submit = async (view) => {
  await act(async () => view.querySelector("form[aria-label='Share with a Reviewer']").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
  await settle();
};

test("R3 owner: sharing needs an email-shaped address, sends the choices, and shows who has a copy", async () => {
  const view = await render(h(ReviewShares, { id: "d-1" }));
  assert.match(view.textContent, /Nobody yet/);
  const send = buttonNamed(view, "Share with Reviewer");
  assert.equal(send.disabled, true);
  await typeInto(view.querySelector("input[type=email]"), "not-an-email");
  assert.equal(buttonNamed(view, "Share with Reviewer").disabled, true);
  await typeInto(view.querySelector("input[type=email]"), "rhea@example.test");
  assert.equal(buttonNamed(view, "Share with Reviewer").disabled, false);
  await submit(view);
  assert.deepEqual(calls.filter((c) => c[0] === "create"), [["create", "d-1", { email: "rhea@example.test" }]]);
  assert.match(view.querySelector("[data-testid=review-notice]").textContent, /Shared revision 2 with Rhea Reviewer/);
  assert.equal(view.querySelector("input[type=email]").value, "", "the box is cleared after sharing");
  const row = view.querySelector("[data-testid=review-grant]");
  assert.match(row.textContent, /Rhea Reviewer/);
  assert.match(row.textContent, /rhea@example.test/);
  assert.match(row.textContent, /Revision 2/);
});

test("R3 owner: the chosen revision and result are sent as numbers and ids", async () => {
  const view = await render(h(ReviewShares, { id: "d-1" }));
  await typeInto(view.querySelector("input[type=email]"), "rhea@example.test");
  const [revision, result] = view.querySelectorAll("select");
  await choose(revision, "1");
  await choose(result, "run-1");
  await submit(view);
  assert.deepEqual(calls.find((c) => c[0] === "create")[2], { email: "rhea@example.test", revision: 1, run: "run-1" });
});

test("R3 owner: a refused share is explained in words and nothing looks shared", async () => {
  const view = await render(h(ReviewShares, { id: "d-1" }));
  await typeInto(view.querySelector("input[type=email]"), "plain@example.test");
  failNext = new ApiError("NOT_FOUND", "raw", 404, { reason: "NO_REVIEWER" });
  await submit(view);
  const notice = view.querySelector("[data-testid=review-notice]");
  assert.match(notice.textContent, /Admin has given the Reviewer role/);
  assert.equal(notice.getAttribute("role"), "alert");
  assert.equal(view.querySelectorAll("[data-testid=review-grant]").length, 0);
  assert.equal(view.querySelector("input[type=email]").value, "plain@example.test", "what was typed is kept so it can be fixed");
});

test("R3 owner: stopping a review asks first, then stops it and shows it as stopped", async () => {
  grants = [{ id: "g-1", designId: "d-1", reviewer: { displayName: "Rhea Reviewer", email: "rhea@example.test" }, revision: 2, runId: null, createdAt: "2026-10-30T10:00:00.000Z", revokedAt: null, status: "active" }];
  const view = await render(h(ReviewShares, { id: "d-1" }));
  await click(buttonNamed(view, "Stop sharing with Rhea Reviewer"));
  assert.deepEqual(calls.filter((c) => c[0] === "revoke"), [], "the first click only asks");
  await click(buttonNamed(view, "Cancel"));
  assert.deepEqual(calls.filter((c) => c[0] === "revoke"), []);
  await click(buttonNamed(view, "Stop sharing with Rhea Reviewer"));
  await click(buttonNamed(view, "Confirm stop"));
  assert.deepEqual(calls.filter((c) => c[0] === "revoke"), [["revoke", "d-1", "g-1"]]);
  assert.match(view.querySelector("[data-testid=review-notice]").textContent, /can no longer open it/);
  const row = view.querySelector("[data-testid=review-grant]");
  assert.match(row.textContent, /Stopped/);
  assert.equal(buttonNamed(row, "Stop sharing with Rhea Reviewer"), undefined);
});

test("R3 reviewer inbox: an account without the Reviewer role sees a denial and never asks for the list", async () => {
  myRoles = ["user", "admin"];
  const view = await render(h(SharedWithMe));
  assert.ok(view.querySelector("[data-testid=role-gate-denied]"));
  assert.match(view.textContent, /Reviewer accounts/);
  assert.deepEqual(calls, []);
});

test("R3 reviewer inbox: lists designs with the owner's display name and result, and links to each", async () => {
  inbox = [
    { id: "r-1", designName: "Checkout service", ownerDisplayName: "Olivia Owner", revision: 3, sharedAt: "2026-10-30T10:00:00.000Z", verdict: "fail" },
    { id: "r-2", designName: "Search", ownerDisplayName: "Omar Owner", revision: 1, sharedAt: "2026-10-29T10:00:00.000Z", verdict: null },
  ];
  const view = await render(h(SharedWithMe));
  const rows = view.querySelectorAll("[data-testid=shared-item]");
  assert.equal(rows.length, 2);
  assert.match(rows[0].textContent, /Checkout service/);
  assert.match(rows[0].textContent, /From Olivia Owner/);
  assert.match(rows[1].textContent, /no result recorded/);
  assert.equal(rows[0].querySelector("a").getAttribute("href"), "/reviews/r-1");
  assert.doesNotMatch(view.textContent, /@/, "no email address appears anywhere");
});

test("R3 reviewer inbox: says so when nothing is shared, and offers a retry when the list fails", async () => {
  let view = await render(h(SharedWithMe));
  assert.match(view.textContent, /Nothing has been shared with you yet/);
  failNext = new ApiError("INTERNAL", "x", 500);
  view = await render(h(SharedWithMe));
  assert.ok([...view.querySelectorAll("button")].some((b) => b.textContent.trim() === "Try again"));
});

test("R3 reviewer view: shows the frozen document with who shared it, and no way to change it", async () => {
  review = { id: "r-1", ownerDisplayName: "Olivia Owner", sharedAt: "2026-10-30T10:00:00.000Z", report: { name: "Checkout service" } };
  const view = await render(h(ReviewView, { id: "r-1" }));
  assert.deepEqual(calls, [["open", "r-1"]]);
  assert.match(view.querySelector("[data-testid=review-banner]").textContent, /Shared by Olivia Owner/);
  assert.match(view.querySelector("[data-testid=report-doc]").textContent, /Checkout service/);
  assert.match(view.textContent, /cannot edit, run or change it/);
  assert.equal([...view.querySelectorAll("button")].length, 0, "nothing to press: read-only");
});

test("R3 reviewer view: a stopped or unknown review reads as unavailable, and a non-Reviewer never asks for it", async () => {
  failNext = new ApiError("NOT_FOUND", "x", 404);
  let view = await render(h(ReviewView, { id: "r-1" }));
  assert.match(view.querySelector("[data-testid=review-gone]").textContent, /no longer available/);
  for (const root of roots) await act(async () => root.unmount());
  roots = [];
  document.body.innerHTML = "";
  calls = [];
  myRoles = ["user"];
  view = await render(h(ReviewView, { id: "r-1" }));
  assert.ok(view.querySelector("[data-testid=role-gate-denied]"));
  assert.deepEqual(calls, []);
});

test("R3 menu: only a Reviewer sees the Shared with me link in the account menu", async () => {
  const shell = () => h(ThemeProvider, null, h(UiProvider, null, h(TopBar, { pathname: "/dashboard" })));
  const open = async (view) => {
    await act(async () => view.querySelector("button[aria-label='Account menu']").dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
    await settle();
  };
  myRoles = ["user", "reviewer"];
  let view = await render(shell());
  await open(view);
  const link = [...view.querySelectorAll("a")].find((a) => a.textContent.includes("Shared with me"));
  assert.equal(link.getAttribute("href"), "/reviews");
  for (const root of roots) await act(async () => root.unmount());
  roots = [];
  document.body.innerHTML = "";
  myRoles = ["user", "admin"];
  view = await render(shell());
  await open(view);
  assert.ok(view.querySelector("[role=menu]"));
  assert.equal([...view.querySelectorAll("a")].some((a) => a.textContent.includes("Shared with me")), false);
});
