const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", { url: "http://localhost:3000" });
for (const name of ["window", "document", "HTMLElement", "Element", "Node", "Event", "MouseEvent", "KeyboardEvent", "HTMLInputElement", "localStorage"]) {
  Object.defineProperty(global, name, { configurable: true, value: dom.window[name] });
}
global.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
const React = require("react");
const { act } = React;
const { createRoot } = require("react-dom/client");
const { QueryClient, QueryClientProvider } = require("@tanstack/react-query");
const h = React.createElement;

// A small fake of the Admin API: accounts and an audit list the tests can change, and a record of every call made.
let accounts = [];
let auditEntries = [];
let myRoles = ["user", "admin"];
let calls = [];
let failNext = null;
const fail = () => {
  const e = failNext;
  failNext = null;
  return e;
};
const ME = { id: "me-1", displayName: "Me Admin", email: "me@example.test" };
const { ApiError } = require("../src/lib/api/errors.ts");

require.cache[require.resolve("next/navigation")] = { exports: { useRouter: () => ({ push() {}, replace() {} }), usePathname: () => "/admin/users", useSearchParams: () => new URLSearchParams("") } };
require.cache[require.resolve("next/link")] = { exports: { __esModule: true, default: ({ children, ...props }) => h("a", props, children) } };
require.cache[require.resolve("../src/components/auth/auth-provider.tsx")] = { exports: { useAuth: () => ({ user: ME, status: "authed", signOut() {} }), initialsOf: () => "M" } };
require.cache[require.resolve("../src/lib/api/roles.ts")] = { exports: { fetchMyRoles: () => Promise.resolve({ roles: myRoles }) } };
const change = (id, mutate) => {
  const a = accounts.find((x) => x.id === id);
  mutate(a);
  return Promise.resolve({ userId: id, roles: a.roles, status: a.status });
};
require.cache[require.resolve("../src/lib/api/admin.ts")] = {
  exports: {
    AUDIT_PAGE: 20,
    searchUsers: (q) => {
      calls.push(["search", q]);
      const e = fail();
      return e ? Promise.reject(e) : Promise.resolve(accounts.filter((a) => (a.email + a.displayName).toLowerCase().includes(q.toLowerCase())));
    },
    grantRole: (id, role) => {
      calls.push(["grant", id, role]);
      const e = fail();
      return e ? Promise.reject(e) : change(id, (a) => { a.roles = [...a.roles, role]; });
    },
    revokeRole: (id, role) => {
      calls.push(["revoke", id, role]);
      const e = fail();
      return e ? Promise.reject(e) : change(id, (a) => { a.roles = a.roles.filter((r) => r !== role); });
    },
    suspendUser: (id) => {
      calls.push(["suspend", id]);
      const e = fail();
      return e ? Promise.reject(e) : change(id, (a) => { a.status = "suspended"; });
    },
    restoreUser: (id) => {
      calls.push(["restore", id]);
      const e = fail();
      return e ? Promise.reject(e) : change(id, (a) => { a.status = "active"; });
    },
    fetchAudit: (after) => {
      calls.push(["audit", after ? after.id : null]);
      if (!after) return Promise.resolve(auditEntries.slice(0, 20));
      const i = auditEntries.findIndex((x) => x.id === after.id);
      return Promise.resolve(auditEntries.slice(i + 1, i + 21));
    },
  },
};
const { AdminUsers } = require("../src/components/admin/admin-users.tsx");
const P = require("../src/lib/admin-presentation.ts");

const acct = (over = {}) => ({ id: "u-1", displayName: "Pat Doe", email: "pat@example.test", roles: ["user"], status: "active", createdAt: "2026-10-01T10:00:00.000Z", ...over });
const entry = (over = {}) => ({ id: "e-" + Math.random(), at: "2026-10-30T10:00:00.000Z", action: "grant", role: "reviewer", actor: { id: "a", email: "root@example.test" }, target: { id: "t", email: "pat@example.test" }, ...over });

test("R2 text: audit entries read as plain sentences, with the server operator named as such", () => {
  assert.equal(P.auditText(entry()), "root@example.test gave the Reviewer role to pat@example.test");
  assert.equal(P.auditText(entry({ action: "revoke", role: "admin" })), "root@example.test removed the Admin role from pat@example.test");
  assert.equal(P.auditText(entry({ action: "suspend", role: null })), "root@example.test suspended pat@example.test");
  assert.equal(P.auditText(entry({ action: "restore", role: null })), "root@example.test restored pat@example.test");
  assert.equal(P.auditText(entry({ action: "bootstrap", role: "admin", actor: { id: null, email: "operator" } })), "The server operator made pat@example.test the first Admin");
  assert.equal(P.auditText(entry({ actor: { id: "x", email: "pat@example.test" } })), "pat@example.test gave themselves the Reviewer role");
});

test("R2 text: failures say what happened and never echo the server's own message", () => {
  const err = (status, code, details) => new ApiError(code, "SECRET SERVER TEXT", status, details);
  assert.match(P.adminErrorText(err(409, "CONFLICT", { reason: "LAST_ADMIN" })), /last working Admin/);
  assert.match(P.adminErrorText(err(409, "CONFLICT", { reason: "SELF" })), /your own account/);
  assert.match(P.adminErrorText(err(403, "FORBIDDEN")), /Only Admins/);
  assert.match(P.adminErrorText(err(404, "NOT_FOUND")), /no longer exists/);
  assert.match(P.adminErrorText(err(0, "NETWORK")), /could not be reached/);
  for (const e of [err(500, "INTERNAL"), new Error("boom")]) assert.doesNotMatch(P.adminErrorText(e), /SECRET|boom/);
});

test("R2 text: a search needs two real characters", () => {
  assert.equal(P.canSearch(""), false);
  assert.equal(P.canSearch(" a "), false);
  assert.equal(P.canSearch("ab"), true);
  assert.equal(P.searchTerm("  pat "), "pat");
  assert.equal(P.statusLabel("suspended"), "Suspended");
  assert.equal(P.statusLabel("active"), "Active");
});

let roots = [];
async function render() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } } });
  await act(async () => root.render(h(QueryClientProvider, { client }, h(AdminUsers))));
  await settle();
  return container;
}
afterEach(async () => {
  for (const root of roots) await act(async () => root.unmount());
  roots = [];
  document.body.innerHTML = "";
  accounts = [];
  auditEntries = [];
  myRoles = ["user", "admin"];
  calls = [];
  failNext = null;
});
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
const click = async (el) => { await act(async () => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }))); await settle(); };
const type = async (input, value) => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, value);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
};
const buttonNamed = (root, text) => [...root.querySelectorAll("button")].find((b) => (b.getAttribute("aria-label") || b.textContent).trim() === text);
async function search(view, text) {
  await type(view.querySelector("input"), text);
  await act(async () => view.querySelector("form[aria-label='Find an account']").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
  await settle();
}

test("R2 screen: an account without the Admin role sees a denial, and no Admin call is ever made", async () => {
  myRoles = ["user", "reviewer"];
  const view = await render();
  assert.ok(view.querySelector("[data-testid=role-gate-denied]"));
  assert.equal(view.querySelector("form"), null);
  assert.deepEqual(calls, []);
});

test("R2 screen: search lists accounts with their status, and short text is not sent", async () => {
  accounts = [acct(), acct({ id: "u-2", displayName: "Sam Roe", email: "sam@example.test", status: "suspended" })];
  const view = await render();
  assert.equal(buttonNamed(view, "Search").disabled, true);
  await type(view.querySelector("input"), "p");
  assert.equal(buttonNamed(view, "Search").disabled, true);
  await search(view, "example");
  assert.deepEqual(calls.filter((c) => c[0] === "search"), [["search", "example"]]);
  const rows = view.querySelectorAll("section[aria-label='Search results'] li");
  assert.equal(rows.length, 2);
  assert.match(rows[1].textContent, /Suspended/);
});

test("R2 screen: giving a role is one click; removing a role and suspending each need a confirmation", async () => {
  accounts = [acct({ roles: ["user", "admin"] })];
  const view = await render();
  await search(view, "pat");
  await click(view.querySelector("section[aria-label='Search results'] button"));
  const panel = () => view.querySelector("[data-testid=admin-account]");
  await click(buttonNamed(panel(), "Give Reviewer role"));
  assert.deepEqual(calls.filter((c) => c[0] === "grant"), [["grant", "u-1", "reviewer"]]);
  assert.match(view.querySelector("[data-testid=admin-notice]").textContent, /Reviewer role given/);
  assert.match(panel().querySelector("[data-testid=role-reviewer]").textContent, /held/);

  await click(buttonNamed(panel(), "Remove Admin role"));
  assert.deepEqual(calls.filter((c) => c[0] === "revoke"), [], "the first click only asks");
  await click(buttonNamed(panel(), "Cancel"));
  assert.deepEqual(calls.filter((c) => c[0] === "revoke"), []);
  await click(buttonNamed(panel(), "Remove Admin role"));
  await click(buttonNamed(panel(), "Confirm remove Admin"));
  assert.deepEqual(calls.filter((c) => c[0] === "revoke"), [["revoke", "u-1", "admin"]]);
  assert.match(view.querySelector("[data-testid=admin-notice]").textContent, /Admin role removed/);

  await click(buttonNamed(panel(), "Suspend account"));
  assert.deepEqual(calls.filter((c) => c[0] === "suspend"), []);
  await click(buttonNamed(panel(), "Confirm suspend"));
  assert.deepEqual(calls.filter((c) => c[0] === "suspend"), [["suspend", "u-1"]]);
  assert.match(panel().textContent, /Suspended/);
  await click(buttonNamed(panel(), "Restore account"));
  assert.deepEqual(calls.filter((c) => c[0] === "restore"), [["restore", "u-1"]]);
  assert.match(panel().textContent, /Active/);
});

test("R2 screen: an Admin's own account offers no suspend button", async () => {
  accounts = [acct({ id: ME.id, email: ME.email, displayName: ME.displayName, roles: ["user", "admin"] })];
  const view = await render();
  await search(view, "me@");
  await click(view.querySelector("section[aria-label='Search results'] button"));
  const panel = view.querySelector("[data-testid=admin-account]");
  assert.equal(buttonNamed(panel, "Suspend account"), undefined);
  assert.match(panel.textContent, /your own account/);
});

test("R2 screen: a refused change is explained in words and nothing looks changed", async () => {
  accounts = [acct({ roles: ["user", "admin"] })];
  const view = await render();
  await search(view, "pat");
  await click(view.querySelector("section[aria-label='Search results'] button"));
  failNext = new ApiError("CONFLICT", "raw", 409, { reason: "LAST_ADMIN" });
  await click(buttonNamed(view, "Remove Admin role"));
  await click(buttonNamed(view, "Confirm remove Admin"));
  const notice = view.querySelector("[data-testid=admin-notice]");
  assert.match(notice.textContent, /last working Admin/);
  assert.equal(notice.getAttribute("role"), "alert");
  assert.match(view.querySelector("[data-testid=role-admin]").textContent, /held/);
});

test("R2 screen: the audit log reads as sentences and pages older entries without repeats", async () => {
  auditEntries = Array.from({ length: 25 }, (_, i) => entry({ id: "e-" + String(i).padStart(2, "0"), target: { id: "t", email: `user${i}@example.test` } }));
  const view = await render();
  const log = () => view.querySelector("[data-testid=admin-audit]");
  assert.equal(log().querySelectorAll("li").length, 20);
  assert.match(log().textContent, /root@example.test gave the Reviewer role to user0@example.test/);
  await click(buttonNamed(log(), "Show older"));
  assert.equal(log().querySelectorAll("li").length, 25);
  assert.equal(buttonNamed(log(), "Show older"), undefined);
  const texts = [...log().querySelectorAll("li")].map((li) => li.textContent);
  assert.equal(new Set(texts).size, 25);
  assert.deepEqual(calls.filter((c) => c[0] === "audit"), [["audit", null], ["audit", "e-19"]]);
});

test("R2 screen: an empty audit log says so", async () => {
  const view = await render();
  assert.match(view.querySelector("[data-testid=admin-audit]").textContent, /Nothing has been changed yet/);
});
