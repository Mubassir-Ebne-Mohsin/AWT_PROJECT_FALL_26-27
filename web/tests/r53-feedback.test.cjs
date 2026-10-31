const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", { url: "http://localhost:3000" });
for (const name of ["window", "document", "HTMLElement", "Element", "Node", "Event", "MouseEvent", "KeyboardEvent", "HTMLInputElement", "HTMLTextAreaElement", "HTMLSelectElement", "localStorage"]) {
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

// A stateful fake of the submissions API; every call is recorded.
const ME = { id: "me-1", displayName: "Tess Teacher", email: "tess@example.test" };
let subs = [];
let notes = {};
let calls = [];
let failNext = null;
const fail = () => {
  const e = failNext;
  failNext = null;
  return e;
};
const graph = { nodes: [{ id: "n1", label: "Edge cache", type: "cache" }, { id: "n2", label: "Orders DB", type: "database" }], edges: [{ from: "n1", to: "n2" }] };
const summary = (over = {}) => ({
  id: "s-1", attemptId: "a-1", learner: { displayName: "Lena Learner" }, designRevision: 3, passes: true, p95: 212.34, errorRate: 0.004,
  engineVersion: "reference-port-v1", createdAt: "2026-10-31T10:00:00.000Z", completedAt: "2026-10-31T10:00:01.000Z", feedbackCount: 0, ...over,
});
require.cache[require.resolve("../src/components/auth/auth-provider.tsx")] = { exports: { useAuth: () => ({ user: ME, status: "authed", signOut() {} }), initialsOf: () => "T" } };
require.cache[require.resolve("../src/lib/api/instructor-submissions.ts")] = {
  exports: {
    fetchChallengeSubmissions: (id) => {
      calls.push(["list", id]);
      const e = fail();
      return e ? Promise.reject(e) : Promise.resolve(subs.map((s) => ({ ...s, feedbackCount: (notes[s.id] ?? []).length })));
    },
    fetchSubmission: (id) => {
      calls.push(["get", id]);
      const e = fail();
      const s = subs.find((x) => x.id === id);
      if (e) return Promise.reject(e);
      if (!s) return Promise.reject(new ApiError("NOT_FOUND", "x", 404));
      return Promise.resolve({
        submission: { ...s, feedbackCount: (notes[id] ?? []).length },
        challenge: { id: "ch-1", title: "Fix checkout", goal: { p95Ms: 300, errorRate: 0.01 } },
        snapshot: { schemaVersion: 1, graph, traffic: { preset: "custom", rps: 500, burst: 1.5, readRatio: 0.8, durationMin: 10, shape: "steady", sloP95: 300, errorBudget: 0.01 } },
        feedback: notes[id] ?? [],
      });
    },
    sendFeedback: (id, text) => {
      calls.push(["send", id, text]);
      const e = fail();
      if (e) return Promise.reject(e);
      const f = { id: "f-" + calls.length, submissionId: id, author: { displayName: "Tess Teacher" }, text, createdAt: "2026-10-31T11:00:00.000Z" };
      notes[id] = [...(notes[id] ?? []), f];
      return Promise.resolve(f);
    },
  },
};
const { SubmissionsPanel } = require("../src/components/instructor/submissions-panel.tsx");
const P = require("../src/lib/challenge-presentation.ts");

let roots = [];
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } } });
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 40)); });
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
  subs = [];
  notes = {};
  calls = [];
  failNext = null;
});
const click = async (el) => { await act(async () => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }))); await settle(); };
const typeInto = async (el, value) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set.call(el, value);
    el.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
};
const sendForm = async (view) => {
  await act(async () => view.querySelector("form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
  await settle();
};
const testid = (root, id) => root.querySelector(`[data-testid='${id}']`);

test("R5.3 text: outcome lines say pass or fail with the model's numbers, and feedback failures are explained without echoing the server", () => {
  assert.equal(P.outcomeText({ passes: true, p95: 212.34, errorRate: 0.004 }), "Passed · p95 212.3 ms · errors 0.4%");
  assert.equal(P.outcomeText({ passes: false, p95: 900, errorRate: 0.1 }), "Not passed · p95 900 ms · errors 10%");
  const err = (status, code, details) => new ApiError(code, "SECRET SERVER TEXT", status, details);
  assert.match(P.feedbackErrorText(err(422, "VALIDATION_FAILED", { reason: "FEEDBACK_LIMIT" })), /20 notes/);
  assert.match(P.feedbackErrorText(err(422, "VALIDATION_FAILED")), /between 1 and 2000/);
  assert.match(P.feedbackErrorText(err(404, "NOT_FOUND")), /no longer available/);
  assert.match(P.feedbackErrorText(err(403, "FORBIDDEN")), /owns the challenge/);
  assert.match(P.feedbackErrorText(err(0, "NETWORK")), /could not be reached/);
  for (const e of [err(500, "INTERNAL"), new Error("boom")]) assert.doesNotMatch(P.feedbackErrorText(e), /SECRET|boom/);
});

test("R5.3 panel: with no graded submissions it says so and offers nothing to open", async () => {
  const view = await render(h(SubmissionsPanel, { challengeId: "ch-1" }));
  assert.ok(testid(view, "submissions-empty"));
  assert.equal(view.querySelectorAll("[data-testid='submission-row']").length, 0);
  assert.deepEqual(calls, [["list", "ch-1"]]);
});

test("R5.3 panel: each row shows the learner's display name, outcome and note count, and opening one shows the frozen design", async () => {
  subs = [summary(), summary({ id: "s-2", learner: { displayName: "Liam Learner" }, passes: false, p95: 640, errorRate: 0.05 })];
  const view = await render(h(SubmissionsPanel, { challengeId: "ch-1" }));
  const rows = [...view.querySelectorAll("[data-testid='submission-row']")];
  assert.equal(rows.length, 2);
  assert.match(rows[0].textContent, /Lena Learner.*Revision 3.*Passed · p95 212.3 ms · errors 0.4%.*0 notes/);
  assert.match(rows[1].textContent, /Liam Learner.*Not passed/);
  assert.doesNotMatch(view.textContent, /@example\.test/);
  assert.equal(testid(view, "submission-detail"), null, "nothing is opened until asked");
  await click(rows[0]);
  const detail = testid(view, "submission-detail");
  assert.ok(detail);
  assert.match(detail.textContent, /Edge cache \(cache\)/);
  assert.match(detail.textContent, /Orders DB \(database\)/);
  assert.match(detail.textContent, /Edge cache to Orders DB/);
  assert.match(detail.textContent, /2 components and 1 connections/);
  assert.match(detail.textContent, /p95 at or under 300 ms/);
  assert.match(detail.textContent, /No feedback sent yet/);
  assert.equal(rows[0].getAttribute("aria-pressed"), "true");
  await click(rows[0]);
  assert.equal(testid(view, "submission-detail"), null, "clicking again closes it");
});

test("R5.3 feedback: a blank note cannot be sent, a note is trimmed, sent once, shown as plain text and the form clears", async () => {
  subs = [summary()];
  const view = await render(h(SubmissionsPanel, { challengeId: "ch-1" }));
  await click(testid(view, "submission-row"));
  const input = testid(view, "feedback-input");
  const send = testid(view, "feedback-send");
  assert.equal(input.getAttribute("maxlength"), "2000");
  assert.equal(send.disabled, true, "nothing typed");
  await typeInto(input, "   \n  ");
  assert.equal(send.disabled, true, "whitespace only");
  await sendForm(view);
  assert.equal(calls.filter((c) => c[0] === "send").length, 0, "submitting a blank form sends nothing");
  await typeInto(input, "  Add a cache. <b>bold?</b>  ");
  assert.equal(send.disabled, false);
  await sendForm(view);
  assert.deepEqual(calls.filter((c) => c[0] === "send"), [["send", "s-1", "Add a cache. <b>bold?</b>"]]);
  assert.match(testid(view, "feedback-notice").textContent, /Feedback sent/);
  assert.equal(testid(view, "feedback-input").value, "", "the box is cleared");
  const item = testid(view, "feedback-item");
  assert.ok(item);
  assert.equal(item.querySelector("b"), null, "text is never interpreted as HTML");
  assert.match(item.textContent, /Tess Teacher.*Add a cache\. <b>bold\?<\/b>/);
  assert.match(testid(view, "submission-row").textContent, /1 note$/);
});

test("R5.3 feedback: a rejected note stays in the box with a reason, and nothing is added", async () => {
  subs = [summary()];
  const view = await render(h(SubmissionsPanel, { challengeId: "ch-1" }));
  await click(testid(view, "submission-row"));
  await typeInto(testid(view, "feedback-input"), "Keep this text");
  failNext = new ApiError("VALIDATION_FAILED", "SECRET SERVER TEXT", 422, { reason: "FEEDBACK_LIMIT" });
  await sendForm(view);
  const notice = testid(view, "feedback-notice");
  assert.equal(notice.getAttribute("role"), "alert");
  assert.match(notice.textContent, /20 notes/);
  assert.doesNotMatch(view.textContent, /SECRET/);
  assert.equal(testid(view, "feedback-input").value, "Keep this text");
  assert.equal(view.querySelectorAll("[data-testid='feedback-item']").length, 0);
});

test("R5.3 panel: a failed load says so, can be retried and then shows the list", async () => {
  subs = [summary()];
  failNext = new ApiError("NETWORK", "x", 0);
  const view = await render(h(SubmissionsPanel, { challengeId: "ch-1" }));
  assert.match(testid(view, "submissions-error").textContent, /could not be reached/);
  await click([...view.querySelectorAll("button")].find((b) => b.textContent.trim() === "Try again"));
  assert.equal(view.querySelectorAll("[data-testid='submission-row']").length, 1);
});
