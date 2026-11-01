const { test, afterEach, beforeEach } = require("node:test");
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
const h = React.createElement;

let pathname = "/learn";
let authUser = null;
let authStatus = "anon";
let notFoundCalled = false;
require.cache[require.resolve("next/navigation")] = {
  exports: {
    usePathname: () => pathname,
    useRouter: () => ({ replace() {}, push() {} }),
    useSearchParams: () => new URLSearchParams(""),
    notFound: () => {
      notFoundCalled = true;
      throw new Error("NEXT_NOT_FOUND");
    },
  },
};
require.cache[require.resolve("next/link")] = { exports: { __esModule: true, default: ({ children, ...props }) => h("a", props, children) } };
require.cache[require.resolve("../src/components/auth/auth-provider.tsx")] = { exports: { useAuth: () => ({ user: authUser, status: authStatus, signOut() {} }), initialsOf: () => "X" } };
const { LearnIndex, LearnTopic } = require("../src/components/learn/learn.tsx");
const C = require("../src/lib/learn-content.ts");
const P = require("../src/lib/learn-progress.ts");
const M = require("../src/lib/learn-model.ts");
const { LEARN_TOPICS } = require("../src/lib/catalog.ts");
const { ROUTES, resolveRoute } = require("../src/lib/routes.ts");

let fetchCalls = 0;
global.fetch = () => {
  fetchCalls += 1;
  return Promise.reject(new Error("the lessons must not make requests"));
};
let roots = [];
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
async function render(path) {
  pathname = path;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => root.render(h(path === "/learn" ? LearnIndex : LearnTopic)));
  await settle();
  return container;
}
beforeEach(() => {
  window.localStorage.clear();
  authUser = null;
  authStatus = "anon";
  notFoundCalled = false;
  fetchCalls = 0;
});
afterEach(async () => {
  for (const root of roots) await act(async () => root.unmount());
  roots = [];
  document.body.innerHTML = "";
});
const click = async (el) => { await act(async () => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }))); await settle(); };
const setRange = async (el, value) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(el, String(value));
    el.dispatchEvent(new window.Event("input", { bubbles: true }));
    el.dispatchEvent(new window.Event("change", { bubbles: true }));
  });
};
const setSelect = async (el, value) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set.call(el, String(value));
    el.dispatchEvent(new window.Event("change", { bubbles: true }));
  });
};
const byLabel = (root, text) => {
  const label = [...root.querySelectorAll("label")].find((l) => l.textContent.trim() === text);
  assert.ok(label, "no label " + text);
  return root.ownerDocument.getElementById(label.htmlFor);
};
const testid = (root, id) => root.querySelector(`[data-testid='${id}']`);
const summary = (root) => testid(root, "demo-summary").textContent;
const words = (text) => text.trim().split(/\s+/).length;

// ---------- content ----------

test("P2 content: exactly the eight registered topics, with the registered titles, in a sensible order", () => {
  assert.deepEqual([...C.TOPIC_IDS].sort(), Object.keys(LEARN_TOPICS).sort());
  for (const t of C.TOPICS) assert.equal(t.title, LEARN_TOPICS[t.id], t.id);
  assert.equal(C.TOPICS.length, 8);
});

test("P2 content: every lesson is short plain text with a place in the app, a takeaway and a two-question check", () => {
  for (const t of C.TOPICS) {
    assert.ok(t.body.length >= 3, t.id + " has an explanation");
    const total = words(t.body.join(" "));
    assert.ok(total >= 90 && total <= 260, `${t.id} explanation is ${total} words`);
    assert.match(t.seen, /Results|Limits|template|Each component/, t.id + " names where it shows up");
    assert.ok(t.takeaway.length > 20);
    assert.equal(t.quiz.length, 2);
    for (const q of t.quiz) {
      assert.equal(q.options.length, 4, t.id);
      assert.equal(new Set(q.options).size, 4, t.id + " options are different");
      assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4);
      assert.ok(q.why.length > 20);
    }
    const text = [t.summary, ...t.body, t.seen, t.takeaway].join(" ");
    assert.doesNotMatch(text, /guarantee|accurate prediction|real-world performance|will always/i, t.id);
    assert.doesNotMatch(text, /<|>/, t.id + " is plain text");
  }
  const answers = C.TOPICS.flatMap((t) => t.quiz.map((q) => q.answer));
  assert.ok(new Set(answers).size >= 3, "the right answer is not always in the same place");
});

test("P2 content: the numbers quoted in the lessons are the model's numbers", () => {
  const by = Object.fromEntries(C.TOPICS.map((t) => [t.id, t]));
  const text = (id) => [...by[id].body, by[id].quiz.map((q) => q.prompt + q.options.join(" ") + q.why).join(" ")].join(" ");
  assert.match(text("utilization"), new RegExp(`${M.COMPONENT.app.capacity} requests a second`));
  assert.match(text("utilization"), /Healthy below 75%, Warning from 75%, and Failing at 100%/);
  assert.match(text("utilization"), /98\.5%/);
  assert.match(text("queues"), new RegExp(`${M.BURST_SECONDS} seconds`));
  assert.match(text("queues"), new RegExp(`${M.WORKER_CAPACITY} jobs a second`));
  assert.match(text("replicas"), /25%/);
  assert.match(text("load-balancing"), /20,000 requests a second, far more than a typical app server's 600/);
  assert.ok(M.COMPONENT.lb.capacity > 10 * M.COMPONENT.app.capacity, "the claim 'far more' is true of the model's numbers");
  assert.match(text("cdn"), /60% by default/);
  assert.match(text("caching"), /80% to 95%/);
  const [US, EU, AP] = ["us-east", "eu-west", "ap-south"];
  assert.match(text("regions"), new RegExp(`${M.roundTripMs(US, EU)} ms between US East and EU West, ${M.roundTripMs(US, AP)} ms between US East and Asia South, and ${M.roundTripMs(EU, AP)} ms between EU West and Asia South`));
  const slow = M.percentiles({ fast: 20, slow: 400, share: 0.05 });
  assert.match(text("p95"), new RegExp(`${Math.round(slow.p95)} ms`));
  assert.match(text("p95"), new RegExp(`${Math.round(slow.p99)} ms`));
});

test("P2 content: every answer key is right, worked out from the model rather than read from the text", () => {
  const q = (id, i) => C.topicById(id).quiz[i];
  const right = (id, i) => q(id, i).options[q(id, i).answer];
  assert.equal(right("utilization", 0), `${Math.round(M.utilization({ rps: 450, burst: 1, replicas: 1, capacity: 600, latency: 22 }).rho * 100)}%`);
  assert.match(right("utilization", 1), /Adding a replica/);
  assert.ok(M.utilization({ rps: 500, burst: 1.5, replicas: 2, capacity: 600, latency: 22 }).rho < M.utilization({ rps: 500, burst: 1.5, replicas: 1, capacity: 600, latency: 22 }).rho);
  assert.equal(M.queue({ rps: 500, burst: 1, drain: M.WORKER_CAPACITY, maxDepth: 500000, durationMin: 10 }).state, "growing");
  assert.match(right("queues", 0), /grows the whole time/);
  assert.match(right("queues", 1), /burst pass if the workers keep up/);
  const base = M.percentiles({ fast: 20, slow: 400, share: 0 }), slow = M.percentiles({ fast: 20, slow: 400, share: 0.05 });
  const rise = { p50: slow.p50 / base.p50, p95: slow.p95 / base.p95, p99: slow.p99 / base.p99 };
  assert.ok(rise.p99 > rise.p95 && rise.p95 > rise.p50);
  assert.equal(right("p95", 0), "p99");
  assert.match(right("p95", 1), /95 of every 100 requests finish within 300 ms/);
  assert.equal(Number(right("caching", 0).replace(/,/g, "")), Math.round(M.caching({ rps: 1000, readRatio: 1, hit: 0.9, burst: 1 }).dbReads));
  assert.match(right("caching", 1), /Hardly at all/);
  assert.equal(Number(right("replicas", 0)), M.replicas({ rps: 600, readRatio: 1, replicas: 2, burst: 1 }).readsEach);
  assert.match(right("replicas", 1), /primary, which also sends them to every replica/);
  assert.equal(Number(right("load-balancing", 0)), M.loadBalancing({ rps: 1200, servers: 3, burst: 1 }).perServer);
  assert.match(right("load-balancing", 1), /splits the load evenly/);
  assert.equal(Number(right("cdn", 0).replace(/,/g, "")), Math.round(M.cdn({ rps: 2000, readRatio: 0.8, hit: 0.6, burst: 1 }).originReads));
  assert.match(right("cdn", 1), /writes/);
  assert.equal(right("regions", 0), `${3 * M.roundTripMs("us-east", "ap-south")} ms`);
  const smallest = [["us-east", "eu-west"], ["eu-west", "ap-south"], ["us-east", "ap-south"]].sort((a, b) => M.roundTripMs(...a) - M.roundTripMs(...b))[0];
  assert.deepEqual(smallest, ["us-east", "eu-west"]);
  assert.equal(right("regions", 1), "US East and EU West");
});

// ---------- progress storage ----------

test("P2 progress: buckets are per account, marks survive, passing implies opened, and clearing empties only that bucket", () => {
  const ids = C.TOPIC_IDS;
  const store = window.localStorage;
  assert.equal(P.bucketFor(null), "guest");
  assert.equal(P.bucketFor("u-1"), "user:u-1");
  P.markOpened(store, "user:a", "caching", ids);
  P.markPassed(store, "user:a", "queues", ids);
  assert.deepEqual(P.readProgress(store, "user:a", ids), { opened: ["caching", "queues"], passed: ["queues"] });
  assert.deepEqual(P.readProgress(store, "user:b", ids), { opened: [], passed: [] }, "another account sees nothing");
  assert.deepEqual(P.readProgress(store, "guest", ids), { opened: [], passed: [] });
  P.markOpened(store, "guest", "p95", ids);
  P.clearProgress(store, "user:a");
  assert.deepEqual(P.readProgress(store, "user:a", ids), { opened: [], passed: [] });
  assert.deepEqual(P.readProgress(store, "guest", ids), { opened: ["p95"], passed: [] }, "the guest bucket is untouched");
  assert.equal(P.markOf({ opened: ["a"], passed: ["a"] }, "a"), "passed");
});

test("P2 progress: unreadable, tampered or unknown data is ignored, and a blocked store never throws", () => {
  const ids = C.TOPIC_IDS;
  const store = window.localStorage;
  for (const raw of ["{not json", "null", "42", '"text"', "[]", '{"opened":"caching"}', '{"opened":[1,null,{}],"passed":[true]}']) {
    store.setItem("sf:learn:v1:guest", raw);
    assert.deepEqual(P.readProgress(store, "guest", ids), { opened: [], passed: [] }, raw);
  }
  store.setItem("sf:learn:v1:guest", JSON.stringify({ opened: ["caching", "nonsense", "caching"], passed: ["cdn", "__proto__"] }));
  assert.deepEqual(P.readProgress(store, "guest", ids), { opened: ["caching", "cdn"], passed: ["cdn"] });
  assert.deepEqual(P.markOpened(store, "guest", "not-a-topic", ids).opened, ["caching", "cdn"], "an unknown topic is never recorded");
  const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
  assert.deepEqual(P.readProgress(blocked, "guest", ids), { opened: [], passed: [] });
  assert.doesNotThrow(() => P.markOpened(blocked, "guest", "caching", ids));
  assert.doesNotThrow(() => P.markPassed(blocked, "guest", "caching", ids));
  assert.doesNotThrow(() => P.clearProgress(blocked, "guest"));
  assert.deepEqual(P.readProgress(null, "guest", ids), { opened: [], passed: [] });
  assert.doesNotThrow(() => P.markOpened(null, "guest", "caching", ids));
});

// ---------- registry ----------

test("P2 registry: the learn routes are complete, still 40 routes, and only the eight topics resolve", () => {
  assert.equal(ROUTES.length, 40);
  for (const id of ["learn", "learn-topic"]) assert.equal(ROUTES.find((r) => r.id === id).fidelity, "C");
  for (const id of Object.keys(LEARN_TOPICS)) assert.equal(resolveRoute("/learn/" + id).title, LEARN_TOPICS[id]);
  assert.equal(resolveRoute("/learn/not-a-topic").title, "Page not found");
  for (const name of ["__proto__", "constructor", "toString", "hasOwnProperty"]) {
    assert.equal(resolveRoute("/learn/" + name).title, "Page not found", "learn " + name);
    assert.equal(resolveRoute("/settings/" + name).title, "Page not found", "settings " + name);
    assert.equal(resolveRoute("/evaluation/" + name).title, "Page not found", "evaluation " + name);
  }
  for (const id of Object.keys(require("../src/lib/catalog.ts").SETTINGS_SECTIONS)) assert.notEqual(resolveRoute("/settings/" + id).title, "Page not found", "settings " + id);
  for (const id of Object.keys(require("../src/lib/catalog.ts").EVAL_TABS)) assert.notEqual(resolveRoute("/evaluation/" + id).title, "Page not found", "evaluation " + id);
});

// ---------- the index page ----------

test("P2 index: eight cards link to the topics, show a text mark for each, and count what is opened and passed", async () => {
  const view = await render("/learn");
  const cards = [...view.querySelectorAll("[data-testid='learn-card']")];
  assert.equal(cards.length, 8);
  assert.deepEqual(cards.map((c) => c.querySelector("a").getAttribute("href")), C.TOPIC_IDS.map((id) => "/learn/" + id));
  assert.ok(cards.every((c) => /Not opened yet/.test(c.textContent)));
  assert.equal(view.querySelectorAll("h1").length, 1);
  assert.match(testid(view, "learn-tally").textContent, /0 of 8 opened · 0 passed/);
  P.markPassed(window.localStorage, "guest", "caching", C.TOPIC_IDS);
  P.markOpened(window.localStorage, "guest", "cdn", C.TOPIC_IDS);
  document.body.innerHTML = "";
  const again = await render("/learn");
  assert.match(testid(again, "learn-tally").textContent, /2 of 8 opened · 1 passed/);
  const marks = Object.fromEntries([...again.querySelectorAll("[data-testid='learn-card']")].map((c) => [c.querySelector("a").textContent, c.getAttribute("data-mark")]));
  assert.equal(marks["Caching"], "passed");
  assert.equal(marks["CDNs"], "opened");
  assert.equal(marks["Queues"], "new");
});

test("P2 index: the marks belong to the signed-in account, not to the browser, and clearing removes only that account's", async () => {
  P.markPassed(window.localStorage, "user:me", "queues", C.TOPIC_IDS);
  P.markOpened(window.localStorage, "guest", "cdn", C.TOPIC_IDS);
  authUser = { id: "me" };
  authStatus = "authed";
  const view = await render("/learn");
  assert.match(testid(view, "learn-tally").textContent, /1 of 8 opened · 1 passed/, "my own marks, not the guest's");
  await click(testid(view, "learn-clear"));
  assert.match(testid(view, "learn-tally").textContent, /0 of 8 opened · 0 passed/);
  assert.ok(testid(view, "learn-cleared"));
  assert.deepEqual(P.readProgress(window.localStorage, "guest", C.TOPIC_IDS).opened, ["cdn"], "the guest marks are untouched");
  assert.equal(window.localStorage.getItem("sf:learn:v1:user:me"), null);
});

test("P2 index: nothing is read or written for a person whose sign-in is still being checked", async () => {
  authStatus = "loading";
  P.markOpened(window.localStorage, "guest", "cdn", C.TOPIC_IDS);
  const view = await render("/learn/caching");
  assert.ok(testid(view, "learn-topic"));
  assert.deepEqual(P.readProgress(window.localStorage, "guest", C.TOPIC_IDS).opened, ["cdn"], "caching was not recorded for a guest while loading");
});

// ---------- a topic page ----------

test("P2 topic: every topic renders one heading, its explanation, a demo, where it shows up, a takeaway and a check, with no request", async () => {
  for (const t of C.TOPICS) {
    document.body.innerHTML = "";
    const view = await render("/learn/" + t.id);
    assert.equal(view.querySelectorAll("h1").length, 1, t.id);
    assert.equal(view.querySelector("h1").textContent, t.title);
    assert.equal(view.querySelectorAll("[aria-label='Explanation'] p").length, t.body.length, t.id);
    assert.equal(view.querySelectorAll("[data-testid='demo']").length, 1, t.id);
    assert.match(testid(view, "demo").textContent, /Model estimate, not a measurement/);
    assert.ok(testid(view, "seen"));
    assert.match(testid(view, "takeaway").textContent, /Remember:/);
    assert.equal(view.querySelectorAll("[data-testid='question']").length, 2);
    assert.ok(testid(view, "demo-summary").getAttribute("role") === "status", "the result is announced as text");
    for (const input of view.querySelectorAll("input[type=range]")) {
      assert.ok(input.id && view.querySelector(`label[for='${input.id}']`), t.id + " every slider has a label");
      assert.ok(input.getAttribute("aria-valuetext"), t.id + " every slider says its value in words");
    }
  }
  assert.equal(fetchCalls, 0, "no lesson made a request");
});

test("P2 topic: opening a topic marks it opened for this person once, and an unknown topic is not found and marks nothing", async () => {
  const view = await render("/learn/caching");
  assert.match(testid(view, "topic-mark").textContent, /Opened/);
  assert.deepEqual(P.readProgress(window.localStorage, "guest", C.TOPIC_IDS), { opened: ["caching"], passed: [] });
  await assert.rejects(() => render("/learn/not-a-topic"), /NEXT_NOT_FOUND/);
  assert.equal(notFoundCalled, true);
  assert.deepEqual(P.readProgress(window.localStorage, "guest", C.TOPIC_IDS).opened, ["caching"]);
});

test("P2 topic: the check needs both answers right, lets a wrong one be retried, and records the pass once", async () => {
  const view = await render("/learn/caching");
  const qs = [...view.querySelectorAll("[data-testid='question']")];
  const pick = async (q, i) => click(q.querySelectorAll("input[type=radio]")[i]);
  const check = (q) => q.querySelector("[data-testid='check-answer']");
  assert.equal(check(qs[0]).disabled, true, "nothing picked yet");
  const key = C.topicById("caching").quiz;
  const wrong = (k) => (k.answer + 1) % 4;
  await pick(qs[0], wrong(key[0]));
  await click(check(qs[0]));
  assert.match(qs[0].querySelector("[data-testid='answer-result']").textContent, /Not quite\..*Pick another answer/);
  await pick(qs[0], key[0].answer);
  assert.equal(qs[0].querySelector("[data-testid='answer-result']"), null, "the old verdict is cleared when you change your pick");
  await click(check(qs[0]));
  assert.match(qs[0].querySelector("[data-testid='answer-result']").textContent, /Correct\./);
  assert.equal(testid(view, "check-passed"), null, "one right answer is not a pass");
  assert.deepEqual(P.readProgress(window.localStorage, "guest", C.TOPIC_IDS).passed, []);
  await pick(qs[1], key[1].answer);
  await click(check(qs[1]));
  assert.ok(testid(view, "check-passed"));
  assert.deepEqual(P.readProgress(window.localStorage, "guest", C.TOPIC_IDS), { opened: ["caching"], passed: ["caching"] });
  assert.match(testid(view, "topic-mark").textContent, /Passed the check/);
  const saved = window.localStorage.getItem("sf:learn:v1:guest");
  await click(check(qs[1]));
  assert.equal(window.localStorage.getItem("sf:learn:v1:guest"), saved, "nothing is rewritten after the pass");
});

test("P2 topic: a person who passed before is told so and can try again", async () => {
  P.markPassed(window.localStorage, "guest", "cdn", C.TOPIC_IDS);
  const view = await render("/learn/cdn");
  assert.match(testid(view, "check").textContent, /passed this check before/);
  assert.match(testid(view, "topic-mark").textContent, /Passed the check/);
});

test("P2 topic: previous and next links walk the eight topics in order", async () => {
  let view = await render("/learn/queues");
  let links = [...view.querySelectorAll("nav[aria-label='More concepts'] a")].map((a) => [a.textContent, a.getAttribute("href")]);
  assert.deepEqual(links, [["← Utilization (ρ)", "/learn/utilization"], ["All concepts", "/learn"], ["p95 latency →", "/learn/p95"]]);
  document.body.innerHTML = "";
  view = await render("/learn/utilization");
  assert.equal(view.querySelectorAll("nav[aria-label='More concepts'] a").length, 2, "no previous link on the first topic");
  document.body.innerHTML = "";
  view = await render("/learn/regions");
  assert.equal(view.querySelectorAll("nav[aria-label='More concepts'] a").length, 2, "no next link on the last topic");
});

test("P2 topic: answering the check while sign-in is still being confirmed never writes into a bucket", async () => {
  authStatus = "loading";
  const view = await render("/learn/caching");
  const key = C.topicById("caching").quiz;
  for (const [i, q] of [...view.querySelectorAll("[data-testid='question']")].entries()) {
    await click(q.querySelectorAll("input[type=radio]")[key[i].answer]);
    await click(q.querySelector("[data-testid='check-answer']"));
  }
  assert.ok(testid(view, "check-passed"), "the person still sees that they answered correctly");
  assert.equal(window.localStorage.getItem("sf:learn:v1:guest"), null, "but nothing was stored for a guest while we do not know who it is");
});

// ---------- the demos ----------

test("P2 demo: utilization follows the model as the load rises, from healthy to failing, and says it in words", async () => {
  const view = await render("/learn/utilization");
  const load = byLabel(view, "Steady load");
  await setRange(load, 0);
  assert.match(summary(view), /gets no traffic/);
  await setRange(load, 200);
  const ok = M.utilization({ rps: 200, burst: 1.5, replicas: 1, capacity: 600, latency: 22 });
  assert.equal(ok.status, "ok");
  assert.match(summary(view), /50% busy.*healthy/);
  await setRange(load, 500);
  assert.match(summary(view), /125% busy.*failing/);
  await setRange(byLabel(view, "Replicas"), 4);
  assert.match(summary(view), /31% busy.*healthy/);
  assert.match(testid(view, "readouts").textContent, /Healthy/);
  await setRange(byLabel(view, "Burst multiplier"), 3);
  const s = M.utilization({ rps: 500, burst: 3, replicas: 4, capacity: 600, latency: 22 });
  assert.match(summary(view), new RegExp(`${Math.round(s.rho * 100)}% busy`));
});

test("P2 demo: the queue demo shows clear, absorbing and growing, and the wait in readable time", async () => {
  const view = await render("/learn/queues");
  await setRange(byLabel(view, "Jobs arriving"), 100);
  await setRange(byLabel(view, "Burst multiplier"), 1);
  await setRange(byLabel(view, "Workers"), 1);
  assert.match(summary(view), /no backlog builds/);
  await setRange(byLabel(view, "Jobs arriving"), 200);
  await setRange(byLabel(view, "Burst multiplier"), 2);
  assert.match(summary(view), /keep up with the average.*not with the burst/);
  await setRange(byLabel(view, "Jobs arriving"), 500);
  assert.match(summary(view), /drain only 250.*backlog reaches 150,000 jobs.*waits 10 min/);
  await setSelect(byLabel(view, "Queue size limit"), 1000);
  assert.match(summary(view), /50% of jobs are lost because the queue is full/);
  await setRange(byLabel(view, "Jobs arriving"), 0);
  assert.match(summary(view), /No jobs are arriving/);
});

test("P2 demo: more slow requests barely move p50 but move p95 and p99", async () => {
  const view = await render("/learn/p95");
  const slider = byLabel(view, "Share of slow requests");
  await setRange(slider, 0);
  const none = M.percentiles({ fast: 20, slow: 400, share: 0 });
  assert.match(summary(view), new RegExp(`${Math.round(none.p50)} ms, p95 is ${Math.round(none.p95)} ms and p99 is ${Math.round(none.p99)} ms`));
  await setRange(slider, 0.05);
  const some = M.percentiles({ fast: 20, slow: 400, share: 0.05 });
  assert.match(summary(view), new RegExp(`p95 is ${Math.round(some.p95)} ms and p99 is ${Math.round(some.p99)} ms`));
  assert.match(slider.getAttribute("aria-valuetext"), /5%/);
});

test("P2 demo: caching, replicas, balancing, CDN and regions each follow the model and stay finite at the extremes", async () => {
  let view = await render("/learn/caching");
  await setRange(byLabel(view, "Cache hit ratio"), 1);
  await setRange(byLabel(view, "Share that are reads"), 1);
  assert.match(summary(view), /0 reads a second miss the cache.*0 writes.*gets no traffic/);
  await setRange(byLabel(view, "Cache hit ratio"), 0);
  await setRange(byLabel(view, "Steady load"), 3000);
  assert.doesNotMatch(summary(view), /NaN|Infinity|undefined/);
  assert.match(testid(view, "readouts").textContent, /Failing/);

  document.body.innerHTML = "";
  view = await render("/learn/replicas");
  await setRange(byLabel(view, "Replicas"), 0);
  assert.match(summary(view), /Each of the 1 server takes.*With no replicas, the primary takes every read/);
  assert.match(testid(view, "readouts").textContent, /no replicas/);
  await setRange(byLabel(view, "Replicas"), 4);
  assert.match(summary(view), /Each of the 5 servers.*Each replica also replays/);
  const r = M.replicas({ rps: 1000, readRatio: 0.8, replicas: 4, burst: 1.5 });
  assert.match(summary(view), new RegExp(`takes ${Math.round(r.readsEach)} reads a second`));

  document.body.innerHTML = "";
  view = await render("/learn/load-balancing");
  await setRange(byLabel(view, "Servers"), 1);
  assert.match(summary(view), /Each of 1 server gets 1,200 requests a second.*failing/);
  await setRange(byLabel(view, "Servers"), 6);
  assert.match(summary(view), /Each of 6 servers gets 200 requests a second.*healthy/);
  assert.match(summary(view), /best case/);

  document.body.innerHTML = "";
  view = await render("/learn/cdn");
  assert.match(summary(view), /answers 960 of the 1,600 reads a second at the edge.*640 reads and 400 writes/);
  await setRange(byLabel(view, "CDN hit ratio"), 0);
  assert.match(summary(view), /answers 0 of the 1,600 reads/);

  document.body.innerHTML = "";
  view = await render("/learn/regions");
  assert.match(summary(view), /US East and Asia South adds 190 ms\. 3 calls in a row add 570 ms/);
  await setSelect(byLabel(view, "Where the database runs"), "us-east");
  assert.match(summary(view), /both in US East.*no round-trip time/);
  await setSelect(byLabel(view, "Where the database runs"), "eu-west");
  await setRange(byLabel(view, "Calls in a row"), 1);
  assert.match(summary(view), /adds 75 ms\. 1 call in a row add 75 ms/);
});
