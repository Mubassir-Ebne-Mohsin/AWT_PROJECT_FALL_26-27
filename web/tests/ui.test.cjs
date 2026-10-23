const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", { url: "http://localhost:3000" });
for (const name of ["window", "document", "HTMLElement", "Element", "Node", "Event", "MouseEvent", "KeyboardEvent", "localStorage"]) {
  Object.defineProperty(global, name, { configurable: true, value: dom.window[name] });
}
global.IS_REACT_ACT_ENVIRONMENT = true;
const mediaListeners = new Set();
let osDark = false;
window.matchMedia = () => ({ matches: osDark, addListener: fn => mediaListeners.add(fn), removeListener: fn => mediaListeners.delete(fn) });
HTMLElement.prototype.scrollTo = () => {};
const React = require("react");
const { act } = React;
const { createRoot } = require("react-dom/client");
const h = React.createElement;
let currentSearch = "next=%2Fnew%2Ftemplate%3Faudit%3D1";
let currentPath = "/dashboard";
const router = { push() {}, replace() {}, refresh() {} };
require.cache[require.resolve("next/navigation")] = { exports: { useRouter: () => router, usePathname: () => currentPath, useSearchParams: () => new URLSearchParams(currentSearch) } };
require.cache[require.resolve("next/link")] = { exports: { __esModule: true, default: ({ children, ...props }) => h("a", props, children) } };
require.cache[require.resolve("../src/components/auth/auth-provider.tsx")] = { exports: {
  useAuth: () => ({ user: { displayName: "Test", email: "test@example.test" }, status: "authed", signOut() {} }), initialsOf: () => "T",
} };
const { ThemeProvider } = require("next-themes");
const { ThemeSelect } = require("../src/components/shell/theme-select.tsx");
const { UiProvider } = require("../src/components/shell/ui-provider.tsx");
// Avoid loading the development-only switcher; React itself stays in development for act().
const originalEnv = process.env.NODE_ENV;
process.env.NODE_ENV = "production";
const { AppShell } = require("../src/components/shell/app-shell.tsx");
process.env.NODE_ENV = originalEnv;
let roots = [];
async function render(content) {
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container); roots.push(root);
  await act(async () => root.render(content));
  return container;
}
afterEach(async () => {
  await act(async () => roots.forEach(root => root.unmount()));
  roots = []; document.body.innerHTML = ""; localStorage.clear();
});
const click = async target => { target.focus(); await act(async () => target.click()); };
const byLabel = (el, label) => el.querySelector(`[aria-label="${label}"]`);
const themeTree = child => h(ThemeProvider, { attribute: "data-theme", storageKey: "sf-theme", defaultTheme: "system", enableSystem: true }, child);

test("Light/Dark/System select persists, follows OS changes and reloads System", async () => {
  const container = await render(themeTree(h(ThemeSelect)));
  let select = byLabel(container, "Color theme");
  assert.deepEqual([...select.options].map(o => o.value), ["light", "dark", "system"]);
  const choose = async value => act(async () => { select.value = value; select.dispatchEvent(new Event("change", { bubbles: true })); });
  await choose("dark");
  assert.equal(document.documentElement.dataset.theme, "dark");
  assert.equal(localStorage.getItem("sf-theme"), "dark");
  await choose("light");
  assert.equal(document.documentElement.dataset.theme, "light");
  await choose("system");
  assert.equal(localStorage.getItem("sf-theme"), "system");
  await act(async () => { osDark = true; for (const fn of mediaListeners) fn({ matches: true }); });
  assert.equal(document.documentElement.dataset.theme, "dark");
  await act(async () => { osDark = false; for (const fn of mediaListeners) fn({ matches: false }); });
  assert.equal(document.documentElement.dataset.theme, "light");
  await act(async () => roots.pop().unmount());
  const reloaded = await render(themeTree(h(ThemeSelect)));
  select = byLabel(reloaded, "Color theme");
  assert.equal(select.value, "system");
  assert.equal(document.documentElement.dataset.theme, "light");
});
for (const [opener, closer, initial] of [["Help for this screen", "Close help", "Close help"], ["AI assistant", "Close assistant", "Message the assistant"]]) {
  for (const closeWith of ["button", "Escape"]) {
    test(`${opener} returns focus on ${closeWith} through the actual shell`, async () => {
      const container = await render(themeTree(h(UiProvider, null, h(AppShell, null, h("button", { id: "content" }, "Content")))));
      const trigger = byLabel(container, opener);
      await click(trigger);
      assert.equal(document.activeElement, byLabel(container, initial));
      if (closeWith === "button") await click(byLabel(container, closer));
      else await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
      assert.equal(document.activeElement, trigger);
      assert.equal(container.querySelector("aside"), null);
    });
  }
}
test("nonmodal drawer does not steal focus back after focus moves into page content", async () => {
  const container = await render(themeTree(h(UiProvider, null, h(AppShell, null, h("button", { id: "content" }, "Content")))));
  await click(byLabel(container, "Help for this screen"));
  const content = container.querySelector("#content"); content.focus();
  await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  assert.equal(document.activeElement, content);
});
test("auth form links carry the same validated destination", async () => {
  currentSearch = "next=%2Fnew%2Ftemplate%3Faudit%3D1";
  const { LoginForm } = require("../src/components/auth/login-form.tsx");
  const { RegisterForm } = require("../src/components/auth/register-form.tsx");
  const login = await render(h(LoginForm));
  assert.equal(new URL(login.querySelector('a[href^="/register?"]').href).searchParams.get("next"), "/new/template?audit=1");
  const register = await render(h(RegisterForm));
  assert.equal(new URL(register.querySelector('a[href^="/login?"]').href).searchParams.get("next"), "/new/template?audit=1");
});

test("real error screen focuses its heading and the segment Retry invokes Next's retry callback", async () => {
  const { QueryClient, QueryClientProvider } = require("@tanstack/react-query");
  const { default: ErrorPage } = require("../src/app/error.tsx");
  const originalError = console.error;
  const error = new Error("test-only boundary failure");
  console.error = value => { if (value !== error) originalError(value); };
  try {
    let retries = 0;
    const container = await render(h(QueryClientProvider, { client: new QueryClient() }, h(UiProvider, null, h(ErrorPage, { error, retry: () => { retries++; } }))));
    assert.equal(document.activeElement, container.querySelector(".sys-title"));
    const button = [...container.querySelectorAll("button")].find(button => button.textContent.includes("Try again"));
    await click(button);
    await act(async () => new Promise(resolve => setTimeout(resolve, 750)));
    assert.equal(retries, 1);
  } finally { console.error = originalError; }
});
test("global boundary is self-contained and Try again invokes Next's retry callback", async () => {
  const { default: GlobalError } = require("../src/app/global-error.tsx");
  const originalError = console.error;
  const error = new Error("test-only root failure");
  console.error = value => { if (value !== error) originalError(value); };
  const doc = document.implementation.createHTMLDocument("boundary");
  const root = createRoot(doc); roots.push(root);
  let retries = 0;
  try {
    await act(async () => root.render(h(GlobalError, { error, retry: () => { retries++; } })));
    assert.equal(doc.title, "Server error · StressForge");
    await act(async () => doc.querySelector("button").click());
    assert.equal(retries, 1);
  } finally { console.error = originalError; }
});
