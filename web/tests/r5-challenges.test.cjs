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

// A stateful fake of the challenge API, the design list and the account's roles; every call is recorded.
const ME = { id: "me-1", displayName: "Me", email: "me@example.test" };
let myRoles = ["user", "instructor"];
let challenges = [];
let calls = [];
let pushed = [];
let failNext = null;
let seq = 0;
const fail = () => {
  const e = failNext;
  failNext = null;
  return e;
};
const make = (over = {}) => ({
  id: "ch-" + ++seq, title: "Survive the flash sale", summary: "Keep p95 low.", goal: { p95Ms: 300, errorRate: 0.01 },
  traffic: { preset: "custom", rps: 500, burst: 1.5, readRatio: 0.8, durationMin: 10, shape: "steady", sloP95: 300, errorBudget: 0.01 },
  status: "draft", baseline: null, componentCount: 6, createdAt: "2026-10-30T10:00:00.000Z", updatedAt: "2026-10-30T10:00:00.000Z", publishedAt: null, archivedAt: null, ...over,
});
require.cache[require.resolve("next/navigation")] = { exports: { useRouter: () => ({ push: (to) => pushed.push(to), replace() {} }), usePathname: () => "/instructor/challenges", useSearchParams: () => new URLSearchParams("") } };
require.cache[require.resolve("next/link")] = { exports: { __esModule: true, default: ({ children, ...props }) => h("a", props, children) } };
require.cache[require.resolve("../src/components/auth/auth-provider.tsx")] = { exports: { useAuth: () => ({ user: ME, status: "authed", signOut() {} }), initialsOf: () => "M" } };
require.cache[require.resolve("../src/lib/api/roles.ts")] = { exports: { fetchMyRoles: () => Promise.resolve({ roles: myRoles }) } };
require.cache[require.resolve("../src/lib/api/library.ts")] = {
  exports: { fetchLibrary: (q) => Promise.resolve({ data: [{ id: "d-1", name: "Checkout", description: "", revision: 2, nodeCount: 6, edgeCount: 5 }, { id: "d-2", name: "Search", description: "", revision: 1, nodeCount: 4, edgeCount: 3 }], meta: { page: 1, pageSize: 12, total: 2 }, q }) },
};
const swap = (id, over) => {
  challenges = challenges.map((c) => (c.id === id ? { ...c, ...over, updatedAt: "2026-10-31T10:00:00.000Z" } : c));
  return challenges.find((c) => c.id === id);
};
require.cache[require.resolve("../src/lib/api/challenges.ts")] = {
  exports: {
    fetchMyChallenges: () => Promise.resolve(challenges.map((c) => ({ ...c }))),
    fetchMyChallenge: (id) => {
      calls.push(["get", id]);
      const e = fail();
      const c = challenges.find((x) => x.id === id);
      return e ? Promise.reject(e) : c ? Promise.resolve({ ...c }) : Promise.reject(new ApiError("NOT_FOUND", "x", 404));
    },
    createChallenge: (body) => {
      calls.push(["create", body]);
      const e = fail();
      if (e) return Promise.reject(e);
      const c = make({ title: body.title, summary: body.summary, goal: body.goal });
      challenges = [c, ...challenges];
      return Promise.resolve(c);
    },
    patchChallenge: (id, body) => {
      calls.push(["patch", id, body]);
      const e = fail();
      return e ? Promise.reject(e) : Promise.resolve(swap(id, body));
    },
    publishChallenge: (id) => {
      calls.push(["publish", id]);
      const e = fail();
      return e ? Promise.reject(e) : Promise.resolve(swap(id, { status: "published", publishedAt: "2026-10-31T10:00:00.000Z", baseline: { p95: 412.34, errorRate: 0.004, passes: false, engineVersion: "reference-port-v1" } }));
    },
    archiveChallenge: (id) => {
      calls.push(["archive", id]);
      const e = fail();
      return e ? Promise.reject(e) : Promise.resolve(swap(id, { status: "archived", archivedAt: "2026-10-31T10:00:00.000Z" }));
    },
    duplicateChallenge: (id) => {
      calls.push(["duplicate", id]);
      const e = fail();
      if (e) return Promise.reject(e);
      const c = make({ title: "Copy" });
      challenges = [c, ...challenges];
      return Promise.resolve(c);
    },
  },
};
const { ChallengesList } = require("../src/components/instructor/challenges-list.tsx");
const { ChallengeDetail } = require("../src/components/instructor/challenge-detail.tsx");
const { TopBar } = require("../src/components/shell/top-bar.tsx");
const { UiProvider } = require("../src/components/shell/ui-provider.tsx");
const { ThemeProvider } = require("next-themes");
const P = require("../src/lib/challenge-presentation.ts");

const FORM = { ...P.EMPTY_FORM, title: "A title", summary: "A summary", designId: "d-1" };

test("R5 form: a valid form becomes the request the server expects, with percentages turned into ratios and text trimmed", () => {
  const r = P.toBody({ ...FORM, title: "  A title  ", summary: "  A summary  ", p95Ms: "250", errorPct: "2.5", rps: "800", burst: "2", readPct: "70", durationMin: "15", shape: "spike" }, { needDesign: true });
  assert.equal(r.ok, true);
  assert.deepEqual(r.body, { title: "A title", summary: "A summary", goal: { p95Ms: 250, errorRate: 0.025 }, traffic: { preset: "custom", rps: 800, burst: 2, readRatio: 0.7, durationMin: 15, shape: "spike" }, from: { designId: "d-1" } });
  assert.equal(P.toBody({ ...FORM, designId: "" }, { needDesign: false }).body.from, undefined, "no design chosen means keep the current one");
});

test("R5 form: every limit the server has is checked next to its box, at the edge and just past it", () => {
  const bad = (over, key, needDesign = true) => {
    const r = P.toBody({ ...FORM, ...over }, { needDesign });
    assert.equal(r.ok, false, JSON.stringify(over));
    assert.ok(r.errors[key], key + " " + JSON.stringify(over));
  };
  const good = (over) => assert.equal(P.toBody({ ...FORM, ...over }, { needDesign: true }).ok, true, JSON.stringify(over));
  bad({ title: "" }, "title"); bad({ title: "   " }, "title"); bad({ title: "x".repeat(81) }, "title"); good({ title: "x".repeat(80) });
  bad({ summary: "" }, "summary"); bad({ summary: "y".repeat(2001) }, "summary"); good({ summary: "y".repeat(2000) });
  bad({ designId: "" }, "designId"); assert.equal(P.toBody({ ...FORM, designId: "" }, { needDesign: false }).ok, true);
  bad({ p95Ms: "0" }, "p95Ms"); bad({ p95Ms: "60001" }, "p95Ms"); bad({ p95Ms: "" }, "p95Ms"); bad({ p95Ms: "fast" }, "p95Ms"); good({ p95Ms: "1" }); good({ p95Ms: "60000" });
  bad({ errorPct: "-1" }, "errorPct"); bad({ errorPct: "101" }, "errorPct"); good({ errorPct: "0" }); good({ errorPct: "100" });
  bad({ rps: "-1" }, "rps"); bad({ rps: "10000001" }, "rps"); good({ rps: "0" }); good({ rps: "10000000" });
  bad({ burst: "0.9" }, "burst"); bad({ burst: "101" }, "burst"); good({ burst: "1" }); good({ burst: "100" });
  bad({ readPct: "-1" }, "readPct"); bad({ readPct: "101" }, "readPct"); good({ readPct: "0" }); good({ readPct: "100" });
  bad({ durationMin: "0" }, "durationMin"); bad({ durationMin: "1441" }, "durationMin"); good({ durationMin: "1" }); good({ durationMin: "1440" });
  const many = P.toBody({ ...FORM, title: "", p95Ms: "0", rps: "-5" }, { needDesign: true });
  assert.deepEqual(Object.keys(many.errors).sort(), ["p95Ms", "rps", "title"]);
});

test("R5 form: an existing challenge fills the form back in, with ratios shown as percentages", () => {
  const f = P.fromChallenge(make({ goal: { p95Ms: 120, errorRate: 0.0125 }, traffic: { rps: 800, burst: 2, readRatio: 0.65, durationMin: 20, shape: "ramp" } }));
  assert.deepEqual(f, { title: "Survive the flash sale", summary: "Keep p95 low.", designId: "", p95Ms: "120", errorPct: "1.25", rps: "800", burst: "2", readPct: "65", durationMin: "20", shape: "ramp" });
  assert.equal(P.fromChallenge(make({ traffic: { rps: 1, burst: 1, readRatio: 0, durationMin: 1, shape: "weird" } })).shape, "steady");
  assert.equal(P.pct(0.01), "1");
  assert.equal(P.pct(0.1234), "12.34");
});

test("R5 text: goal, traffic and baseline are said plainly, including when nothing was measured or nothing is left to solve", () => {
  assert.equal(P.goalText({ p95Ms: 300, errorRate: 0.01 }), "p95 at or under 300 ms and errors at or under 1%");
  assert.equal(P.trafficText({ rps: 500, burst: 1.5, readRatio: 0.8, durationMin: 10, shape: "steady" }), "500 requests/s, burst x1.5, 80% reads, 10 min, steady");
  assert.match(P.baselineText(null), /Not measured yet/);
  assert.match(P.baselineText({ p95: 412.34, errorRate: 0.004, passes: false }), /does not meet the goal yet \(p95 412.3 ms, 0.4% errors\)/);
  assert.match(P.baselineText({ p95: 80, errorRate: 0, passes: true }), /already meets the goal.*nothing for learners to fix/);
  assert.equal(P.statusLabel("draft"), "Draft");
  assert.equal(P.statusLabel("published"), "Published");
  assert.equal(P.statusLabel("archived"), "Archived");
});

test("R5 text: failures are explained in words and never echo the server's own message", () => {
  const err = (status, code, details) => new ApiError(code, "SECRET SERVER TEXT", status, details);
  assert.match(P.challengeErrorText(err(422, "VALIDATION_FAILED", { reason: "CHALLENGE_LIMIT_REACHED" })), /50 challenges/);
  assert.match(P.challengeErrorText(err(409, "CONFLICT", { reason: "PUBLISHED_FROZEN" })), /cannot change.*Duplicate/);
  assert.match(P.challengeErrorText(err(409, "CONFLICT", { reason: "ARCHIVED" })), /archived/);
  assert.match(P.challengeErrorText(err(422, "VALIDATION_FAILED", { reason: "STARTING_DESIGN_INVALID" })), /problems the model cannot test/);
  assert.match(P.challengeErrorText(err(409, "CONFLICT", { reason: "CHANGED_DURING_PUBLISH" })), /Try publishing again/);
  assert.match(P.challengeErrorText(err(403, "FORBIDDEN")), /your own designs/);
  assert.match(P.challengeErrorText(err(0, "NETWORK")), /could not be reached/);
  for (const e of [err(500, "INTERNAL"), new Error("boom")]) assert.doesNotMatch(P.challengeErrorText(e), /SECRET|boom/);
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
  myRoles = ["user", "instructor"];
  challenges = [];
  calls = [];
  pushed = [];
  failNext = null;
});
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 40)); });
const click = async (el) => { await act(async () => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }))); await settle(); };
const typeInto = async (el, value) => {
  await act(async () => {
    const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : el.tagName === "SELECT" ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(new window.Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  });
};
const buttonNamed = (root, text) => [...root.querySelectorAll("button")].find((b) => (b.getAttribute("aria-label") || b.textContent).trim() === text);
const labelled = (root, text) => {
  const label = [...root.querySelectorAll("label")].find((l) => l.textContent.trim() === text);
  assert.ok(label, "no label " + text);
  return root.ownerDocument.getElementById(label.htmlFor);
};
const submit = async (view, name) => {
  await act(async () => view.querySelector(`form[aria-label='${name}']`).dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
  await settle();
};
async function fillNew(view) {
  await typeInto(labelled(view, "Title"), "  Fix the slow checkout  ");
  await typeInto(labelled(view, "What learners should achieve"), "Bring p95 down.");
  await typeInto(labelled(view, "Starting design"), "d-2");
  await typeInto(labelled(view, "p95 latency goal (ms)"), "250");
  await typeInto(labelled(view, "Error limit (%)"), "2");
}

test("R5 list: an account without the Instructor role sees a denial and never asks for the list", async () => {
  myRoles = ["user", "reviewer"];
  const view = await render(h(ChallengesList));
  assert.ok(view.querySelector("[data-testid=role-gate-denied]"));
  assert.match(view.textContent, /Instructor accounts/);
  assert.equal(view.querySelector("[data-testid=my-challenges]"), null);
  assert.equal(buttonNamed(view, "New challenge"), undefined);
});

test("R5 list: the Instructor's challenges are shown with status, goal and what the model said about the starting design", async () => {
  challenges = [make({ id: "a", title: "Published one", status: "published", baseline: { p95: 500, errorRate: 0.02, passes: false, engineVersion: "v" } }), make({ id: "b", title: "A draft" })];
  const view = await render(h(ChallengesList));
  const items = view.querySelectorAll("[data-testid=challenge-item]");
  assert.equal(items.length, 2);
  assert.match(items[0].textContent, /Published one/);
  assert.match(items[0].textContent, /Published/);
  assert.match(items[0].textContent, /p95 at or under 300 ms and errors at or under 1%/);
  assert.match(items[0].textContent, /does not meet the goal yet/);
  assert.match(items[1].textContent, /Draft/);
  assert.match(items[1].textContent, /Not measured yet/);
  assert.equal(items[0].querySelector("a").getAttribute("href"), "/instructor/challenges/a");
});

test("R5 list: with no challenges it says so", async () => {
  const view = await render(h(ChallengesList));
  assert.match(view.textContent, /You have not made a challenge yet/);
});

test("R5 list: a new challenge needs every box right before anything is sent, then sends the exact request and opens the draft", async () => {
  const view = await render(h(ChallengesList));
  await click(buttonNamed(view, "New challenge"));
  assert.ok(view.querySelector("form[aria-label='New challenge']"));
  await submit(view, "New challenge");
  assert.deepEqual(calls.filter((c) => c[0] === "create"), [], "an empty form sends nothing");
  assert.ok(view.querySelectorAll("form [role=alert]").length >= 3, "each wrong box says what is wrong");
  await fillNew(view);
  await submit(view, "New challenge");
  const sent = calls.find((c) => c[0] === "create")[1];
  assert.deepEqual(sent, { title: "Fix the slow checkout", summary: "Bring p95 down.", goal: { p95Ms: 250, errorRate: 0.02 }, traffic: { preset: "custom", rps: 500, burst: 1.5, readRatio: 0.8, durationMin: 10, shape: "steady" }, from: { designId: "d-2" } });
  assert.deepEqual(pushed, [`/instructor/challenges/${challenges[0].id}`]);
});

test("R5 list: a refused creation is explained in words and the form keeps what was typed", async () => {
  const view = await render(h(ChallengesList));
  await click(buttonNamed(view, "New challenge"));
  await fillNew(view);
  failNext = new ApiError("VALIDATION_FAILED", "raw", 422, { reason: "CHALLENGE_LIMIT_REACHED" });
  await submit(view, "New challenge");
  assert.match(view.querySelector("[data-testid=challenge-error]").textContent, /50 challenges/);
  assert.equal(labelled(view, "p95 latency goal (ms)").value, "250");
  assert.deepEqual(pushed, []);
});

test("R5 detail: a draft shows its numbers, and Publish measures it and shows what the model found", async () => {
  challenges = [make({ id: "ch-d" })];
  const view = await render(h(ChallengeDetail, { id: "ch-d" }));
  assert.match(view.querySelector("[data-testid=challenge-status]").textContent, /Draft/);
  assert.match(view.querySelector("[data-testid=challenge-summary]").textContent, /500 requests\/s, burst x1.5, 80% reads, 10 min, steady/);
  assert.match(view.querySelector("[data-testid=baseline-text]").textContent, /Not measured yet/);
  assert.ok(view.querySelector("form[aria-label='Edit challenge']"));
  await click(buttonNamed(view, "Publish"));
  assert.deepEqual(calls.filter((c) => c[0] === "publish"), [["publish", "ch-d"]]);
  assert.match(view.querySelector("[data-testid=challenge-status]").textContent, /Published/);
  assert.match(view.querySelector("[data-testid=baseline-text]").textContent, /does not meet the goal yet \(p95 412.3 ms, 0.4% errors\)/);
  assert.match(view.querySelector("[data-testid=challenge-notice]").textContent, /Published/);
  assert.equal(buttonNamed(view, "Publish"), undefined, "nothing left to publish");
});

test("R5 detail: saving a draft sends every box, and the starting design only when a new one was chosen", async () => {
  challenges = [make({ id: "ch-d" })];
  const view = await render(h(ChallengeDetail, { id: "ch-d" }));
  await typeInto(labelled(view, "Title"), "New title");
  await typeInto(labelled(view, "p95 latency goal (ms)"), "150");
  await submit(view, "Edit challenge");
  const first = calls.find((c) => c[0] === "patch");
  assert.equal(first[2].title, "New title");
  assert.deepEqual(first[2].goal, { p95Ms: 150, errorRate: 0.01 });
  assert.equal(first[2].from, undefined, "the current starting design is kept");
  assert.match(view.querySelector("[data-testid=challenge-notice]").textContent, /Saved/);
  await typeInto(labelled(view, "Starting design"), "d-1");
  await submit(view, "Edit challenge");
  assert.deepEqual(calls.filter((c) => c[0] === "patch")[1][2].from, { designId: "d-1" });
});

test("R5 detail: once published only the wording can change, and the form offers nothing else", async () => {
  challenges = [make({ id: "ch-p", status: "published", publishedAt: "2026-10-30T11:00:00.000Z", baseline: { p95: 90, errorRate: 0, passes: true, engineVersion: "v" } })];
  const view = await render(h(ChallengeDetail, { id: "ch-p" }));
  assert.match(view.textContent, /frozen now that this is published/);
  const form = view.querySelector("form[aria-label='Edit challenge']");
  assert.equal([...form.querySelectorAll("label")].map((l) => l.textContent.trim()).join("|"), "Title|What learners should achieve");
  await typeInto(labelled(view, "Title"), "Better title");
  await submit(view, "Edit challenge");
  assert.deepEqual(calls.find((c) => c[0] === "patch").slice(1), ["ch-p", { title: "Better title", summary: "Keep p95 low." }]);
  failNext = new ApiError("CONFLICT", "raw", 409, { reason: "PUBLISHED_FROZEN" });
  await submit(view, "Edit challenge");
  assert.match(view.querySelector("[data-testid=challenge-error]").textContent, /cannot change/);
});

test("R5 detail: archiving asks first, and an archived challenge offers no editing or publishing", async () => {
  challenges = [make({ id: "ch-a", status: "published", publishedAt: "2026-10-30T11:00:00.000Z" })];
  const view = await render(h(ChallengeDetail, { id: "ch-a" }));
  await click(buttonNamed(view, "Archive"));
  assert.deepEqual(calls.filter((c) => c[0] === "archive"), [], "the first click only asks");
  await click(buttonNamed(view, "Cancel"));
  assert.deepEqual(calls.filter((c) => c[0] === "archive"), []);
  await click(buttonNamed(view, "Archive"));
  await click(buttonNamed(view, "Confirm archive"));
  assert.deepEqual(calls.filter((c) => c[0] === "archive"), [["archive", "ch-a"]]);
  assert.match(view.querySelector("[data-testid=challenge-status]").textContent, /Archived/);
  assert.equal(view.querySelector("form"), null, "no form");
  assert.equal(buttonNamed(view, "Publish"), undefined);
  assert.equal(buttonNamed(view, "Archive"), undefined);
  assert.match(view.textContent, /archived challenge cannot be changed/);
  assert.ok(buttonNamed(view, "Duplicate as a new draft"), "a copy can still be made");
});

test("R5 detail: duplicating opens the new draft", async () => {
  challenges = [make({ id: "ch-x", status: "published", publishedAt: "2026-10-30T11:00:00.000Z" })];
  const view = await render(h(ChallengeDetail, { id: "ch-x" }));
  await click(buttonNamed(view, "Duplicate as a new draft"));
  assert.deepEqual(calls.filter((c) => c[0] === "duplicate"), [["duplicate", "ch-x"]]);
  assert.deepEqual(pushed, [`/instructor/challenges/${challenges[0].id}`]);
});

test("R5 detail: a refused publish is explained, and the challenge stays a draft", async () => {
  challenges = [make({ id: "ch-d" })];
  const view = await render(h(ChallengeDetail, { id: "ch-d" }));
  failNext = new ApiError("VALIDATION_FAILED", "raw", 422, { reason: "STARTING_DESIGN_INVALID" });
  await click(buttonNamed(view, "Publish"));
  const notice = view.querySelector("[data-testid=challenge-notice]");
  assert.match(notice.textContent, /problems the model cannot test/);
  assert.equal(notice.getAttribute("role"), "alert");
  assert.match(view.querySelector("[data-testid=challenge-status]").textContent, /Draft/);
});

test("R5 detail: someone else's or a missing challenge reads as unavailable, and a non-Instructor never asks for it", async () => {
  let view = await render(h(ChallengeDetail, { id: "nope" }));
  assert.ok(view.querySelector("[data-testid=challenge-gone]"));
  for (const root of roots) await act(async () => root.unmount());
  roots = [];
  document.body.innerHTML = "";
  calls = [];
  myRoles = ["user"];
  view = await render(h(ChallengeDetail, { id: "nope" }));
  assert.ok(view.querySelector("[data-testid=role-gate-denied]"));
  assert.deepEqual(calls, []);
});

test("R5 detail: challenge wording is shown as plain text and never becomes elements", async () => {
  const nasty = `<b>bold</b><img src=x onerror=alert(1)><script>alert(1)</script>`;
  challenges = [make({ id: "ch-n", title: nasty, summary: nasty })];
  const view = await render(h(ChallengeDetail, { id: "ch-n" }));
  const summary = view.querySelector("[data-testid=challenge-summary]");
  assert.ok(summary.textContent.includes(nasty));
  assert.equal(summary.querySelectorAll("img, script, b").length, 0);
});

test("R5 menu: only an Instructor sees My challenges in the account menu", async () => {
  const shell = () => h(ThemeProvider, null, h(UiProvider, null, h(TopBar, { pathname: "/dashboard" })));
  const open = async (view) => {
    await act(async () => view.querySelector("button[aria-label='Account menu']").dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
    await settle();
  };
  let view = await render(shell());
  await open(view);
  const link = [...view.querySelectorAll("a")].find((a) => a.textContent.includes("My challenges"));
  assert.equal(link.getAttribute("href"), "/instructor/challenges");
  for (const root of roots) await act(async () => root.unmount());
  roots = [];
  document.body.innerHTML = "";
  myRoles = ["user", "reviewer"];
  view = await render(shell());
  await open(view);
  assert.ok(view.querySelector("[role=menu]"));
  assert.equal([...view.querySelectorAll("a")].some((a) => a.textContent.includes("My challenges")), false);
});
