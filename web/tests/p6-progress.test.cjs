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

// P6 Progress: the concepts part of /progress. The tally, the one suggestion (a fixed rule with its reason), the per-topic
// marks, and the promise that nothing here claims more than is known.
let authUser = { id: "u1", displayName: "Ada" };
let authStatus = "authed";
require.cache[require.resolve("next/navigation")] = { exports: { usePathname: () => "/progress", useRouter: () => ({ replace() {}, push() {} }), useSearchParams: () => new URLSearchParams(""), notFound() { throw new Error("NEXT_NOT_FOUND"); } } };
require.cache[require.resolve("next/link")] = { exports: { __esModule: true, default: ({ children, ...props }) => h("a", props, children) } };
require.cache[require.resolve("../src/components/auth/auth-provider.tsx")] = { exports: { useAuth: () => ({ user: authUser, status: authStatus, signOut() {} }), initialsOf: () => "X" } };
const { NextStep, ConceptsProgress } = require("../src/components/learner/concepts.tsx");
const P = require("../src/lib/progress-concepts.ts");
const { TOPICS } = require("../src/lib/learn-content.ts");
const L = require("../src/lib/learn-progress.ts");

const IDS = TOPICS.map((t) => t.id);
const none = { opened: [], passed: [] };
const allOpened = { opened: [...IDS], passed: [] };
const allPassed = { opened: [...IDS], passed: [...IDS] };
const ch = (challengeId, passed, extra = {}) => ({ challengeId, title: "Challenge " + challengeId, passed, archived: false, ...extra });

let fetchCalls = 0;
global.fetch = () => {
  fetchCalls += 1;
  return Promise.reject(new Error("the concepts section must not make requests"));
};
let roots = [];
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
async function render(element) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => root.render(element));
  await settle();
  return container;
}
beforeEach(() => {
  window.localStorage.clear();
  authUser = { id: "u1", displayName: "Ada" };
  authStatus = "authed";
  fetchCalls = 0;
});
afterEach(async () => {
  for (const root of roots) await act(async () => root.unmount());
  roots = [];
  document.body.innerHTML = "";
});
const byId = (c, id) => c.querySelector(`[data-testid="${id}"]`);

test("the tally counts only known topics, opened and passed separately", () => {
  assert.deepEqual(P.conceptTally(none, TOPICS), { total: TOPICS.length, opened: 0, passed: 0 });
  assert.deepEqual(P.conceptTally({ opened: [IDS[0], IDS[1], "ghost"], passed: [IDS[0], "ghost"] }, TOPICS), { total: TOPICS.length, opened: 2, passed: 1 });
  assert.deepEqual(P.conceptTally(allPassed, TOPICS), { total: TOPICS.length, opened: TOPICS.length, passed: TOPICS.length });
});

test("suggestion 1: the first topic not yet opened, in the order the topics are listed", () => {
  const s = P.nextSuggestion(none, TOPICS, null);
  assert.equal(s.kind, "topic");
  assert.equal(s.href, `/learn/${IDS[0]}`);
  assert.match(s.reason, /first concept you have not opened/);
  const second = P.nextSuggestion({ opened: [IDS[0]], passed: [] }, TOPICS, null);
  assert.equal(second.href, `/learn/${IDS[1]}`);
  // A topic that is passed counts as opened even if the stored list missed it.
  assert.equal(P.nextSuggestion({ opened: [], passed: [IDS[0]] }, TOPICS, null).href, `/learn/${IDS[1]}`);
});

test("suggestion 2: when every topic is opened, the first one not yet passed", () => {
  const s = P.nextSuggestion({ opened: [...IDS], passed: [IDS[0], IDS[2]] }, TOPICS, null);
  assert.equal(s.kind, "check");
  assert.equal(s.href, `/learn/${IDS[1]}`);
  assert.match(s.reason, /not passed its check/);
  assert.equal(P.nextSuggestion(allOpened, TOPICS, null).href, `/learn/${IDS[0]}`);
});

test("suggestion 3: with every concept passed, a challenge that was attempted and not passed", () => {
  const s = P.nextSuggestion(allPassed, TOPICS, { items: [ch("a", true), ch("b", false), ch("c", false)] });
  assert.equal(s.kind, "challenge");
  assert.equal(s.href, "/challenges/b");
  assert.match(s.reason, /attempted it and have not passed/);
});

test("a challenge counts as passed if any attempt of it passed, archived ones are skipped, and each shows once", () => {
  const items = [ch("a", false), ch("a", true), ch("b", false, { archived: true }), ch("c", false), ch("c", false)];
  assert.deepEqual(P.unpassedChallenges(items).map((i) => i.challengeId), ["c"]);
  assert.equal(P.nextSuggestion(allPassed, TOPICS, { items }).href, "/challenges/c");
});

test("suggestion 4: concepts all passed and no challenge attempted yet points to the challenges list", () => {
  const s = P.nextSuggestion(allPassed, TOPICS, { items: [] });
  assert.equal(s.kind, "browse");
  assert.equal(s.href, "/challenges");
  assert.match(s.reason, /not attempted a challenge yet/);
});

test("suggestion 5: done only when concepts are passed and every attempted challenge is passed", () => {
  const s = P.nextSuggestion(allPassed, TOPICS, { items: [ch("a", true), ch("b", true)] });
  assert.equal(s.kind, "done");
  assert.equal(s.href, null);
  // Only archived challenges left unpassed: nothing to continue, so it is done.
  assert.equal(P.nextSuggestion(allPassed, TOPICS, { items: [ch("a", true), ch("b", false, { archived: true })] }).kind, "done");
});

test("while challenge results are unknown, 'everything is done' is never claimed", () => {
  const s = P.nextSuggestion(allPassed, TOPICS, null);
  assert.notEqual(s.kind, "done");
  assert.equal(s.href, "/challenges");
});

test("the suggestion never says the person has covered everything while a concept is unpassed", () => {
  for (const progress of [none, allOpened, { opened: [...IDS], passed: IDS.slice(1) }]) {
    for (const challenges of [null, { items: [] }, { items: [ch("a", true)] }]) {
      assert.notEqual(P.nextSuggestion(progress, TOPICS, challenges).kind, "done");
    }
  }
});

test("the concepts list shows every topic with its mark, a link to it, and says where the marks are kept", async () => {
  L.markOpened(window.localStorage, "user:u1", IDS[0], IDS);
  L.markPassed(window.localStorage, "user:u1", IDS[1], IDS);
  const c = await render(h(ConceptsProgress));
  const rows = [...c.querySelectorAll('[data-testid="concept-row"]')];
  assert.equal(rows.length, TOPICS.length);
  assert.equal(rows[0].dataset.mark, "opened");
  assert.equal(rows[1].dataset.mark, "passed");
  assert.equal(rows[2].dataset.mark, "new");
  assert.match(rows[1].textContent, /Passed the check/);
  assert.match(rows[2].textContent, /Not opened yet/);
  assert.equal(rows[0].querySelector("a").getAttribute("href"), `/learn/${IDS[0]}`);
  assert.equal(byId(c, "concepts-tally").textContent, `2 of ${TOPICS.length} opened · 1 passed the check`);
  assert.match(c.textContent, /Kept in this browser, not on your account/);
  assert.equal(fetchCalls, 0);
});

test("each account sees its own marks, and nothing from another account", async () => {
  L.markPassed(window.localStorage, "user:other", IDS[0], IDS);
  const c = await render(h(ConceptsProgress));
  assert.equal(byId(c, "concepts-tally").textContent, `0 of ${TOPICS.length} opened · 0 passed the check`);
});

test("the next-step box shows the suggestion with its reason, and a finished state has no link", async () => {
  const c = await render(h(NextStep, { challenges: null }));
  assert.equal(byId(c, "next-step").dataset.kind, "topic");
  assert.equal(byId(c, "next-step").querySelector("a").getAttribute("href"), `/learn/${IDS[0]}`);
  assert.match(byId(c, "next-reason").textContent, /first concept/);
  for (const id of IDS) L.markPassed(window.localStorage, "user:u1", id, IDS);
  const done = await render(h(NextStep, { challenges: { items: [ch("a", true)] } }));
  const box = [...document.querySelectorAll('[data-testid="next-step"]')].pop();
  assert.equal(box.dataset.kind, "done");
  assert.equal(box.querySelector("a"), null);
  assert.ok(done);
});

test("nothing is shown until we know who is signed in", async () => {
  authUser = null;
  authStatus = "loading";
  const c = await render(h(NextStep, { challenges: null }));
  assert.equal(byId(c, "next-step"), null);
});

test("no streak anywhere", async () => {
  const c = await render(h(ConceptsProgress));
  assert.doesNotMatch(c.textContent, /streak/i);
});
