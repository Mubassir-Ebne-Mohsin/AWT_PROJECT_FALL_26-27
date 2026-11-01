const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", { url: "http://localhost:3000" });
for (const name of ["window", "document", "HTMLElement", "Element", "Node", "Event", "MouseEvent"]) {
  Object.defineProperty(global, name, { configurable: true, value: dom.window[name] });
}
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require("react");
const { act } = React;
const { createRoot } = require("react-dom/client");
const h = React.createElement;

// The first breadcrumb on a public page is "Home" (the landing page) for a guest, and "Dashboard" for someone signed in.
let mode = "anon"; // "anon" | "authed" | "loading" | "no-provider"
require.cache[require.resolve("next/link")] = { exports: { __esModule: true, default: ({ children, ...props }) => h("a", props, children) } };
require.cache[require.resolve("../src/components/auth/auth-provider.tsx")] = {
  exports: {
    useAuth: () => {
      if (mode === "no-provider") throw new Error("useAuth must be used inside <AuthProvider>");
      return { user: mode === "authed" ? { id: "u1", displayName: "Ada" } : null, status: mode, signOut() {} };
    },
    initialsOf: () => "X",
  },
};
const { Crumbs } = require("../src/components/shell/crumbs.tsx");
const { resolveRoute } = require("../src/lib/routes.ts");

let roots = [];
async function crumbs(path) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => root.render(h(Crumbs, { resolved: resolveRoute(path) })));
  return [...container.querySelectorAll("nav > span")].map((s) => {
    const a = s.querySelector("a");
    return { text: s.textContent, href: a ? a.getAttribute("href") : null };
  });
}
afterEach(async () => {
  for (const root of roots) await act(async () => root.unmount());
  roots = [];
  document.body.innerHTML = "";
});

test("a guest on a public page starts at Home, the landing page", async () => {
  mode = "anon";
  const list = await crumbs("/examples");
  assert.deepEqual(list[0], { text: "Home", href: "/" });
  assert.equal(list[list.length - 1].text, "Examples");
});

test("a signed-in person on a public page starts at Dashboard, not the landing page", async () => {
  mode = "authed";
  for (const path of ["/examples", "/learn", "/evaluation/simulator", "/how-it-works"]) {
    const list = await crumbs(path);
    assert.deepEqual(list[0], { text: "Dashboard", href: "/dashboard" }, path);
    assert.ok(!list.some((c) => c.text === "Home"), path);
  }
});

test("while we do not yet know who is signed in, the page keeps Home", async () => {
  mode = "loading";
  assert.deepEqual((await crumbs("/examples"))[0], { text: "Home", href: "/" });
});

test("with no auth provider at all it still renders, with Home", async () => {
  mode = "no-provider";
  assert.deepEqual((await crumbs("/examples"))[0], { text: "Home", href: "/" });
});

test("pages inside the app are unchanged for everyone, and the last crumb is never a link", async () => {
  for (const m of ["anon", "authed"]) {
    mode = m;
    const list = await crumbs("/progress");
    assert.deepEqual(list[0], { text: "Dashboard", href: "/dashboard" });
    assert.equal(list[list.length - 1].href, null);
  }
});
