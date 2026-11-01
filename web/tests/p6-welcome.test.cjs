const { test, afterEach, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", { url: "http://localhost:3000" });
for (const name of ["window", "document", "HTMLElement", "Element", "Node", "Event", "MouseEvent", "localStorage"]) {
  Object.defineProperty(global, name, { configurable: true, value: dom.window[name] });
}
global.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
const React = require("react");
const { act } = React;
const { createRoot } = require("react-dom/client");
const h = React.createElement;

// P6 Welcome: the tour steps, the sample design (created once, from a template that works), the first-run decision, and the
// "been through the tour" marker kept per account in this browser.
let authUser = null;
let authStatus = "anon";
const pushed = [];
require.cache[require.resolve("next/navigation")] = { exports: { usePathname: () => "/welcome", useRouter: () => ({ replace() {}, push: (to) => pushed.push(to) }), useSearchParams: () => new URLSearchParams(""), notFound() { throw new Error("NEXT_NOT_FOUND"); } } };
require.cache[require.resolve("next/link")] = { exports: { __esModule: true, default: ({ children, ...props }) => h("a", props, children) } };
require.cache[require.resolve("../src/components/auth/auth-provider.tsx")] = { exports: { useAuth: () => ({ user: authUser, status: authStatus, signOut() {} }), initialsOf: () => "X" } };
require.cache[require.resolve("@tanstack/react-query")] = { exports: { useQueryClient: () => ({ invalidateQueries: async () => {} }) } };
let templateCalls = 0;
let createCalls = [];
let createBehaviour = "ok";
let releaseCreate = null;
const TEMPLATE = { id: "mvp", name: "Single-server MVP", blurb: "b", graph: {}, traffic: {} };
require.cache[require.resolve("../src/lib/api/designs.ts")] = {
  exports: {
    fetchTemplates: async () => {
      templateCalls += 1;
      return [{ id: "three-tier", name: "x" }, TEMPLATE];
    },
    createDesign: (template) => {
      createCalls.push(template.id);
      if (createBehaviour === "fail") return Promise.reject(new Error("boom"));
      if (createBehaviour === "slow") return new Promise((resolve) => (releaseCreate = () => resolve({ id: "d-new" })));
      return Promise.resolve({ id: "d-new" });
    },
  },
};
const { WelcomePage } = require("../src/components/welcome/welcome.tsx");
const W = require("../src/lib/welcome.ts");
const { TEMPLATES } = require("../src/lib/examples.ts");
const { TOPICS } = require("../src/lib/learn-content.ts");

let fetchCalls = 0;
global.fetch = () => {
  fetchCalls += 1;
  return Promise.reject(new Error("the tour itself must not make requests"));
};
let roots = [];
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
async function render() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => root.render(h(WelcomePage)));
  await settle();
  return container;
}
const signIn = (id, displayName = "Ada Lovelace") => {
  authUser = { id, displayName };
  authStatus = "authed";
};
beforeEach(() => {
  window.localStorage.clear();
  authUser = null;
  authStatus = "anon";
  pushed.length = 0;
  templateCalls = 0;
  createCalls = [];
  createBehaviour = "ok";
  releaseCreate = null;
  fetchCalls = 0;
});
afterEach(async () => {
  for (const root of roots) await act(async () => root.unmount());
  roots = [];
  document.body.innerHTML = "";
});
const click = async (el) => { await act(async () => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }))); await settle(); };
const byId = (c, id) => c.querySelector(`[data-testid="${id}"]`);
const doneKey = (bucket) => `sf:welcome:v1:${bucket}`;

test("the sample design comes from a template that meets its own goal as shipped", () => {
  const t = TEMPLATES.find((x) => x.id === W.SAMPLE_TEMPLATE_ID);
  assert.ok(t, "the sample template exists in the shipped data");
  assert.equal(W.sampleTemplate().id, t.id);
  assert.equal(t.result.verdict, "pass");
  assert.equal(t.result.sloMet, true);
  assert.ok(t.limits.headroom > 1, "there is room to grow, so the first run is healthy");
});

test("the post-registration destination: the tour, unless a page was asked for", () => {
  assert.equal(W.afterRegisterPath(null, "/dashboard"), "/welcome");
  assert.equal(W.afterRegisterPath("", "/dashboard"), "/welcome");
  assert.equal(W.afterRegisterPath("/designs/abc/edit", "/designs/abc/edit"), "/designs/abc/edit");
  // An unsafe requested page was already replaced by the fallback; it still counts as "asked", so it is not overridden.
  assert.equal(W.afterRegisterPath("https://evil.example", "/dashboard"), "/dashboard");
});

test("the tour marker: exact value only, per account, and storage failures are harmless", () => {
  assert.equal(W.parseTourDone("done"), true);
  for (const bad of [null, "", "true", "Done", "1", "{}"]) assert.equal(W.parseTourDone(bad), false, String(bad));
  W.markTourDone(window.localStorage, "user:a");
  assert.equal(W.parseTourDone(W.rawTourDone(window.localStorage, "user:a")), true);
  assert.equal(W.parseTourDone(W.rawTourDone(window.localStorage, "user:b")), false);
  assert.equal(W.parseTourDone(W.rawTourDone(null, "user:a")), false);
  const throwing = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() {} };
  assert.doesNotThrow(() => W.markTourDone(throwing, "user:a"));
  assert.equal(W.rawTourDone(throwing, "user:a"), null);
});

test("the tour has three steps, in the order draw, run, improve", () => {
  assert.deepEqual(W.TOUR_STEPS.map((s) => s.id), ["draw", "run", "improve"]);
  for (const s of W.TOUR_STEPS) assert.ok(s.title.length > 3 && s.body.length > 40);
});

test("the steps go forward and back, Back is off on the first, and the last step offers Finish instead of Next and Skip", async () => {
  signIn("u1");
  const c = await render();
  assert.equal(byId(c, "tour-step").dataset.step, "draw");
  assert.match(byId(c, "tour-counter").textContent, /Step 1 of 3/);
  assert.equal(byId(c, "tour-back").disabled, true);
  assert.ok(byId(c, "tour-skip"));
  await click(byId(c, "tour-next"));
  assert.equal(byId(c, "tour-step").dataset.step, "run");
  assert.match(byId(c, "tour-counter").textContent, /Step 2 of 3/);
  assert.equal(byId(c, "tour-back").disabled, false);
  await click(byId(c, "tour-back"));
  assert.equal(byId(c, "tour-step").dataset.step, "draw");
  await click(byId(c, "tour-next"));
  await click(byId(c, "tour-next"));
  assert.equal(byId(c, "tour-step").dataset.step, "improve");
  assert.equal(byId(c, "tour-next"), null);
  assert.equal(byId(c, "tour-skip"), null);
  assert.ok(byId(c, "tour-finish"));
});

test("Skip records the tour for this account only, and goes to the dashboard", async () => {
  signIn("u1");
  const c = await render();
  assert.equal(byId(c, "tour-done-note"), null);
  await click(byId(c, "tour-skip"));
  assert.deepEqual(pushed, ["/dashboard"]);
  assert.equal(window.localStorage.getItem(doneKey("user:u1")), "done");
  assert.equal(window.localStorage.getItem(doneKey("user:u2")), null);
  assert.ok(byId(c, "tour-done-note"), "the page now says the tour has been seen");
});

test("Finish records the tour and goes to the dashboard", async () => {
  signIn("u1");
  const c = await render();
  await click(byId(c, "tour-next"));
  await click(byId(c, "tour-next"));
  await click(byId(c, "tour-finish"));
  assert.deepEqual(pushed, ["/dashboard"]);
  assert.equal(window.localStorage.getItem(doneKey("user:u1")), "done");
});

test("another account in the same browser is not told it has seen the tour", async () => {
  window.localStorage.setItem(doneKey("user:u1"), "done");
  signIn("u2");
  const c = await render();
  assert.equal(byId(c, "tour-done-note"), null);
  for (const root of roots) await act(async () => root.unmount());
  roots = [];
  document.body.innerHTML = "";
  signIn("u1");
  const again = await render();
  assert.ok(byId(again, "tour-done-note"));
});

test("the sample button creates exactly one design from the sample template, opens it, and records the tour", async () => {
  signIn("u1");
  const c = await render();
  await click(byId(c, "start-sample"));
  assert.deepEqual(createCalls, ["mvp"]);
  assert.deepEqual(pushed, ["/designs/d-new/edit"]);
  assert.equal(window.localStorage.getItem(doneKey("user:u1")), "done");
});

test("clicking the sample button again while it is working does not create a second design", async () => {
  signIn("u1");
  createBehaviour = "slow";
  const c = await render();
  const button = byId(c, "start-sample");
  await click(button);
  assert.equal(byId(c, "start-sample").disabled, true);
  assert.match(byId(c, "start-sample").textContent, /Creating/);
  await click(byId(c, "start-sample"));
  await act(async () => button.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
  assert.equal(createCalls.length, 1);
  await act(async () => { releaseCreate(); await new Promise((r) => setTimeout(r, 20)); });
  assert.deepEqual(pushed, ["/designs/d-new/edit"]);
  assert.equal(createCalls.length, 1);
});

test("two clicks in the same instant, before the page redraws, still make only one design", async () => {
  signIn("u1");
  createBehaviour = "slow";
  const c = await render();
  const button = byId(c, "start-sample");
  await act(async () => {
    button.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    button.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
  await settle();
  assert.equal(createCalls.length, 1);
  await act(async () => { releaseCreate(); await new Promise((r) => setTimeout(r, 20)); });
  assert.equal(createCalls.length, 1);
});

test("when the sample cannot be created, the page says so, stays put, is not recorded as done, and can be retried", async () => {
  signIn("u1");
  createBehaviour = "fail";
  const c = await render();
  await click(byId(c, "start-sample"));
  assert.match(byId(c, "sample-error").textContent, /could not be created/);
  assert.deepEqual(pushed, []);
  assert.equal(window.localStorage.getItem(doneKey("user:u1")), null);
  assert.equal(byId(c, "start-sample").disabled, false);
  createBehaviour = "ok";
  await click(byId(c, "start-sample"));
  assert.deepEqual(pushed, ["/designs/d-new/edit"]);
  assert.equal(byId(c, "sample-error"), null);
});

test("nothing is created until the button is pressed, and the tour makes no requests of its own", async () => {
  signIn("u1");
  const c = await render();
  await click(byId(c, "tour-next"));
  assert.equal(createCalls.length, 0);
  assert.equal(templateCalls, 0);
  assert.equal(fetchCalls, 0);
  assert.ok(c);
});

test("every Learn topic is offered, and the greeting uses the first name", async () => {
  signIn("u1", "Ada Lovelace");
  const c = await render();
  const links = [...byId(c, "learn-links").querySelectorAll("a")].map((a) => a.getAttribute("href"));
  for (const t of TOPICS) assert.ok(links.includes(`/learn/${t.id}`), t.id);
  assert.ok(links.includes("/dashboard"));
  assert.equal(c.querySelector("h1").textContent, "Welcome, Ada");
});

test("exactly one level-one heading, and headings never skip a level", async () => {
  signIn("u1");
  const c = await render();
  assert.equal(c.querySelectorAll("h1").length, 1);
  const levels = [...c.querySelectorAll("h1,h2,h3")].map((e) => Number(e.tagName[1]));
  for (let i = 1; i < levels.length; i++) assert.ok(levels[i] - levels[i - 1] <= 1, levels.join(","));
});
