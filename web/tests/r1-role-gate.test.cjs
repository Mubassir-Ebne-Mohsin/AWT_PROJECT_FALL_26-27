const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", { url: "http://localhost:3000" });
for (const name of ["window", "document", "HTMLElement", "Element", "Node", "Event", "MouseEvent", "KeyboardEvent", "localStorage"]) {
  Object.defineProperty(global, name, { configurable: true, value: dom.window[name] });
}
global.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
const React = require("react");
const { act } = React;
const { createRoot } = require("react-dom/client");
const { QueryClient, QueryClientProvider } = require("@tanstack/react-query");
const h = React.createElement;

// What the server says the account's roles are; each test sets this. A function so a test can make it fail or hang.
let serverRoles = () => Promise.resolve({ roles: ["user"] });
require.cache[require.resolve("next/navigation")] = { exports: { useRouter: () => ({ push() {}, replace() {} }), usePathname: () => "/dashboard", useSearchParams: () => new URLSearchParams("") } };
require.cache[require.resolve("next/link")] = { exports: { __esModule: true, default: ({ children, ...props }) => h("a", props, children) } };
require.cache[require.resolve("../src/components/auth/auth-provider.tsx")] = { exports: {
  useAuth: () => ({ user: { id: "u1", displayName: "Test", email: "test@example.test" }, status: "authed", signOut() {} }), initialsOf: () => "T",
} };
require.cache[require.resolve("../src/lib/api/roles.ts")] = { exports: { fetchMyRoles: () => serverRoles() } };
const { RoleGate } = require("../src/components/auth/role-gate.tsx");
const { TopBar } = require("../src/components/shell/top-bar.tsx");
const { UiProvider } = require("../src/components/shell/ui-provider.tsx");
const { ThemeProvider } = require("next-themes");

let roots = [];
async function render(content) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await act(async () => root.render(h(QueryClientProvider, { client }, content)));
  return container;
}
afterEach(async () => {
  for (const root of roots) await act(async () => root.unmount());
  roots = [];
  document.body.innerHTML = "";
});
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
const secret = h("p", { id: "secret-area" }, "reviewer workspace");

test("R1 gate: an account without the role sees the denial, never the area", async () => {
  serverRoles = () => Promise.resolve({ roles: ["user"] });
  const view = await render(h(RoleGate, { role: "reviewer" }, secret));
  await settle();
  assert.equal(view.querySelector("#secret-area"), null);
  assert.match(view.querySelector("[data-testid=role-gate-denied]").textContent, /Reviewer accounts/);
});

test("R1 gate: the right role opens the area, and Admin does not stand in for another role", async () => {
  serverRoles = () => Promise.resolve({ roles: ["user", "reviewer"] });
  let view = await render(h(RoleGate, { role: "reviewer" }, secret));
  await settle();
  assert.ok(view.querySelector("#secret-area"));
  serverRoles = () => Promise.resolve({ roles: ["user", "admin"] });
  view = await render(h(RoleGate, { role: "reviewer" }, secret));
  await settle();
  assert.equal(view.querySelector("#secret-area"), null);
});

test("R1 gate: while the roles are loading, and when they cannot be read, the area stays closed", async () => {
  serverRoles = () => new Promise(() => {});
  let view = await render(h(RoleGate, { role: "admin" }, secret));
  await settle();
  assert.equal(view.querySelector("#secret-area"), null);
  assert.match(view.textContent, /Checking your access/);
  serverRoles = () => Promise.reject(new Error("down"));
  view = await render(h(RoleGate, { role: "admin" }, secret));
  await settle();
  assert.equal(view.querySelectorAll("#secret-area").length, 0);
  assert.ok(view.querySelector("[data-testid=role-gate-unavailable]"));
});

test("R1 menu: the account menu names granted roles, and says nothing for a plain account", async () => {
  const open = async (view) => {
    await act(async () => view.querySelector("button[aria-label='Account menu']").dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
    await settle();
  };
  const shell = () => h(ThemeProvider, null, h(UiProvider, null, h(TopBar, { pathname: "/dashboard" })));
  serverRoles = () => Promise.resolve({ roles: ["user", "admin", "reviewer"] });
  let view = await render(shell());
  await open(view);
  assert.equal(view.querySelector("[data-testid=account-roles]").textContent, "Reviewer, Admin");
  for (const root of roots) await act(async () => root.unmount());
  roots = [];
  document.body.innerHTML = "";
  serverRoles = () => Promise.resolve({ roles: ["user"] });
  view = await render(shell());
  await open(view);
  assert.ok(view.querySelector("[role=menu]"), "the menu opened");
  assert.equal(view.querySelector("[data-testid=account-roles]"), null);
});
