const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", { url: "http://localhost:3000" });
for (const name of ["window", "document", "HTMLElement", "Element", "Node", "Event", "MouseEvent", "KeyboardEvent", "HTMLInputElement", "HTMLTextAreaElement", "localStorage"]) {
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

// A stateful fake of the comment API; every call is recorded.
const ME = { id: "me-1", displayName: "Me", email: "me@example.test" };
let thread = [];
let calls = [];
let failNext = null;
let seq = 0;
const fail = () => {
  const e = failNext;
  failNext = null;
  return e;
};
const make = (over) => ({ id: "c-" + ++seq, parentId: null, author: { role: "reviewer", displayName: "Rhea Reviewer" }, text: "A comment", removed: false, createdAt: "2026-10-30T10:00:00.000Z", editedAt: null, ...over });
require.cache[require.resolve("next/navigation")] = { exports: { useRouter: () => ({ push() {}, replace() {} }), usePathname: () => "/reviews/g-1", useSearchParams: () => new URLSearchParams("") } };
require.cache[require.resolve("next/link")] = { exports: { __esModule: true, default: ({ children, ...props }) => h("a", props, children) } };
require.cache[require.resolve("../src/components/auth/auth-provider.tsx")] = { exports: { useAuth: () => ({ user: ME, status: "authed", signOut() {} }), initialsOf: () => "M" } };
require.cache[require.resolve("../src/lib/api/reviews.ts")] = {
  exports: {
    fetchThread: (id) => {
      calls.push(["thread", id]);
      const e = fail();
      return e ? Promise.reject(e) : Promise.resolve(thread.map((c) => ({ ...c })));
    },
    addComment: (id, text) => {
      calls.push(["add", id, text]);
      const e = fail();
      if (e) return Promise.reject(e);
      const c = make({ text });
      thread = [...thread, c];
      return Promise.resolve(c);
    },
    editComment: (id, commentId, text) => {
      calls.push(["edit", id, commentId, text]);
      const e = fail();
      if (e) return Promise.reject(e);
      thread = thread.map((c) => (c.id === commentId ? { ...c, text, editedAt: "2026-10-31T10:00:00.000Z" } : c));
      return Promise.resolve(thread.find((c) => c.id === commentId));
    },
    removeComment: (id, commentId) => {
      calls.push(["remove", id, commentId]);
      const e = fail();
      if (e) return Promise.reject(e);
      thread = thread.map((c) => (c.id === commentId ? { ...c, text: null, removed: true } : c));
      return Promise.resolve(thread.find((c) => c.id === commentId));
    },
    fetchOwnerThread: (designId, grantId) => {
      calls.push(["ownerThread", designId, grantId]);
      const e = fail();
      return e ? Promise.reject(e) : Promise.resolve(thread.map((c) => ({ ...c })));
    },
    replyToComment: (designId, grantId, parentId, text) => {
      calls.push(["reply", designId, grantId, parentId, text]);
      const e = fail();
      if (e) return Promise.reject(e);
      const c = make({ parentId, text, author: { role: "owner", displayName: "Olivia Owner" } });
      thread = [...thread, c];
      return Promise.resolve(c);
    },
  },
};
const { ReviewerComments } = require("../src/components/review/reviewer-comments.tsx");
const { OwnerFeedback } = require("../src/components/review/owner-feedback.tsx");
const P = require("../src/lib/review-presentation.ts");

test("R4 text: the counter counts what the server counts, and 2,000 is the edge", () => {
  assert.deepEqual(P.charCount(""), { used: 0, left: 2000, ok: false });
  assert.equal(P.charCount("   \n ").ok, false);
  assert.equal(P.charCount("  hi  ").used, 2);
  assert.equal(P.charCount("x".repeat(2000)).ok, true);
  assert.equal(P.charCount("x".repeat(2001)).ok, false);
  assert.equal(P.charCount("x".repeat(2001)).left, -1);
});

test("R4 text: counts and thread grouping", () => {
  assert.equal(P.commentCountText(0), "No feedback yet");
  assert.equal(P.commentCountText(1), "1 comment");
  assert.equal(P.commentCountText(7), "7 comments");
  const a = { id: "a", parentId: null };
  const b = { id: "b", parentId: null };
  const r1 = { id: "r1", parentId: "a" };
  const r2 = { id: "r2", parentId: "a" };
  const grouped = P.buildThread([a, r1, b, r2]);
  assert.deepEqual(grouped.map((g) => [g.comment.id, g.replies.map((r) => r.id)]), [["a", ["r1", "r2"]], ["b", []]]);
  assert.deepEqual(P.buildThread([]), []);
});

test("R4 text: failures are explained in words and never echo the server's message", () => {
  const err = (status, code, details) => new ApiError(code, "SECRET SERVER TEXT", status, details);
  assert.match(P.commentErrorText(err(422, "VALIDATION_FAILED", { reason: "COMMENT_LIMIT_REACHED" })), /50 comments/);
  assert.match(P.commentErrorText(err(409, "CONFLICT", { reason: "REVIEW_STOPPED" })), /stopped, so replies are closed/);
  assert.match(P.commentErrorText(err(404, "NOT_FOUND")), /no longer available/);
  assert.match(P.commentErrorText(err(422, "VALIDATION_FAILED")), /1 to 2,000 characters/);
  assert.match(P.commentErrorText(err(0, "NETWORK")), /could not be reached/);
  for (const e of [err(500, "INTERNAL"), new Error("boom")]) assert.doesNotMatch(P.commentErrorText(e), /SECRET|boom/);
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
  thread = [];
  calls = [];
  failNext = null;
});
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
const click = async (el) => { await act(async () => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }))); await settle(); };
const typeInto = async (el, value) => {
  await act(async () => {
    const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
};
const buttonNamed = (root, text) => [...root.querySelectorAll("button")].find((b) => (b.getAttribute("aria-label") || b.textContent).trim() === text);
const submit = async (view) => {
  await act(async () => view.querySelector("form[aria-label='Add a comment']").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
  await settle();
};

test("R4 reviewer: posting needs 1 to 2,000 characters, trims what is sent, and shows the comment as theirs", async () => {
  const view = await render(h(ReviewerComments, { id: "g-1" }));
  assert.match(view.textContent, /No feedback yet/);
  const box = view.querySelector("form textarea");
  assert.equal(buttonNamed(view, "Post comment").disabled, true);
  await typeInto(box, "   \n  ");
  assert.equal(buttonNamed(view, "Post comment").disabled, true);
  await typeInto(box, "x".repeat(2001));
  assert.equal(buttonNamed(view, "Post comment").disabled, true);
  assert.match(view.querySelector("[data-testid=comment-counter]").textContent, /2001 \/ 2000/);
  await typeInto(box, "  The cache is too small.  ");
  assert.equal(buttonNamed(view, "Post comment").disabled, false);
  await submit(view);
  assert.deepEqual(calls.filter((c) => c[0] === "add"), [["add", "g-1", "The cache is too small."]]);
  assert.equal(view.querySelector("form textarea").value, "", "the box is cleared after posting");
  const row = view.querySelector("[data-testid=comment]");
  assert.match(row.textContent, /You ·/);
  assert.match(row.textContent, /The cache is too small\./);
  assert.match(view.querySelector("[data-testid=comment-notice]").textContent, /Comment added/);
  assert.match(view.textContent, /1 comment/);
});

test("R4 reviewer: editing starts from the current text, saves trimmed text, and marks the comment edited", async () => {
  thread = [make({ id: "c-own", text: "First draft." })];
  const view = await render(h(ReviewerComments, { id: "g-1" }));
  await click(buttonNamed(view, "Edit"));
  const box = view.querySelector("[data-testid=comment] textarea");
  assert.equal(box.value, "First draft.");
  await typeInto(box, "   ");
  assert.equal(buttonNamed(view, "Save").disabled, true);
  await typeInto(box, "  Better wording.  ");
  await click(buttonNamed(view, "Save"));
  assert.deepEqual(calls.filter((c) => c[0] === "edit"), [["edit", "g-1", "c-own", "Better wording."]]);
  const row = view.querySelector("[data-testid=comment]");
  assert.match(row.textContent, /Better wording\./);
  assert.match(row.textContent, /· edited/);
  await click(buttonNamed(view, "Edit"));
  await click(buttonNamed(view, "Cancel edit"));
  assert.equal(calls.filter((c) => c[0] === "edit").length, 1, "cancelling sends nothing");
});

test("R4 reviewer: deleting asks first, then leaves a placeholder with no further buttons", async () => {
  thread = [make({ id: "c-own", text: "Remove me later." })];
  const view = await render(h(ReviewerComments, { id: "g-1" }));
  await click(buttonNamed(view, "Delete"));
  assert.deepEqual(calls.filter((c) => c[0] === "remove"), [], "the first click only asks");
  await click(buttonNamed(view, "Cancel"));
  assert.deepEqual(calls.filter((c) => c[0] === "remove"), []);
  await click(buttonNamed(view, "Delete"));
  await click(buttonNamed(view, "Confirm delete"));
  assert.deepEqual(calls.filter((c) => c[0] === "remove"), [["remove", "g-1", "c-own"]]);
  const row = view.querySelector("[data-testid=comment]");
  assert.match(row.textContent, /Comment removed/);
  assert.doesNotMatch(view.textContent, /Remove me later/);
  assert.equal(buttonNamed(row, "Edit"), undefined);
  assert.equal(buttonNamed(row, "Delete"), undefined);
});

test("R4 reviewer: the owner's replies appear under the comment, named as the owner, with no edit buttons on them", async () => {
  thread = [make({ id: "c-own", text: "A question." }), make({ id: "c-reply", parentId: "c-own", text: "Here is the answer.", author: { role: "owner", displayName: "Olivia Owner" } })];
  const view = await render(h(ReviewerComments, { id: "g-1" }));
  const reply = view.querySelector("[data-testid=reply]");
  assert.match(reply.textContent, /Olivia Owner \(owner\)/);
  assert.match(reply.textContent, /Here is the answer\./);
  assert.equal(reply.querySelectorAll("button").length, 0, "a Reviewer cannot change the owner's words");
  assert.match(view.textContent, /2 comments/);
});

test("R4 reviewer: markup in a comment is shown as plain text and never becomes elements", async () => {
  const nasty = `<b>bold</b><img src=x onerror=alert(1)><script>alert(1)</script> [link](javascript:alert(1))`;
  thread = [make({ text: nasty })];
  const view = await render(h(ReviewerComments, { id: "g-1" }));
  const body = view.querySelector("[data-testid=comment] .r4-text");
  assert.equal(body.textContent, nasty);
  assert.equal(body.querySelectorAll("*").length, 0, "no child elements were created from the text");
  assert.equal(view.querySelectorAll("img, script, b, a").length, 0);
});

test("R4 reviewer: a refused comment is explained in words and the box keeps what was typed", async () => {
  const view = await render(h(ReviewerComments, { id: "g-1" }));
  await typeInto(view.querySelector("form textarea"), "One more thing.");
  failNext = new ApiError("VALIDATION_FAILED", "raw", 422, { reason: "COMMENT_LIMIT_REACHED" });
  await submit(view);
  const notice = view.querySelector("[data-testid=comment-notice]");
  assert.match(notice.textContent, /50 comments/);
  assert.equal(notice.getAttribute("role"), "alert");
  assert.equal(view.querySelector("form textarea").value, "One more thing.");
  assert.equal(view.querySelectorAll("[data-testid=comment]").length, 0);
});

test("R4 reviewer: when the thread cannot be loaded, it says so", async () => {
  failNext = new ApiError("NOT_FOUND", "x", 404);
  const view = await render(h(ReviewerComments, { id: "g-1" }));
  assert.match(view.querySelector("[role=alert]").textContent, /no longer available/);
});

const grantOf = (over = {}) => ({ id: "g-1", designId: "d-1", reviewer: { displayName: "Rhea Reviewer", email: "rhea@example.test" }, revision: 2, runId: null, createdAt: "2026-10-30T10:00:00.000Z", revokedAt: null, status: "active", commentCount: 1, ...over });

test("R4 owner: the thread stays closed until asked for, then lists what the Reviewer wrote by display name", async () => {
  thread = [make({ id: "c-1", text: "Please add a queue." })];
  const view = await render(h(OwnerFeedback, { designId: "d-1", grant: grantOf() }));
  assert.match(view.textContent, /Feedback \(1\)/);
  assert.deepEqual(calls, [], "nothing is fetched until the owner opens it");
  await click(buttonNamed(view, "Feedback from Rhea Reviewer"));
  assert.deepEqual(calls, [["ownerThread", "d-1", "g-1"]]);
  const row = view.querySelector("[data-testid=owner-comment]");
  assert.match(row.textContent, /Rhea Reviewer/);
  assert.match(row.textContent, /Please add a queue\./);
  assert.doesNotMatch(view.textContent, /@/, "no email address appears in the thread");
  assert.match(view.textContent, /cannot change what a Reviewer wrote/);
});

test("R4 owner: a reply needs text, goes to the right comment, and appears under it", async () => {
  thread = [make({ id: "c-1", text: "Question one." }), make({ id: "c-2", text: "Question two." })];
  const view = await render(h(OwnerFeedback, { designId: "d-1", grant: grantOf({ commentCount: 2 }) }));
  await click(buttonNamed(view, "Feedback from Rhea Reviewer"));
  const replyButtons = [...view.querySelectorAll("button")].filter((b) => b.textContent.trim() === "Reply");
  assert.equal(replyButtons.length, 2);
  await click(replyButtons[1]);
  const box = view.querySelectorAll("[data-testid=owner-comment]")[1].querySelector("textarea");
  assert.equal(buttonNamed(view, "Send reply").disabled, true);
  await typeInto(box, "  We will add one.  ");
  await click(buttonNamed(view, "Send reply"));
  assert.deepEqual(calls.filter((c) => c[0] === "reply"), [["reply", "d-1", "g-1", "c-2", "We will add one."]]);
  const second = view.querySelectorAll("[data-testid=owner-comment]")[1];
  assert.match(second.querySelector("[data-testid=owner-reply]").textContent, /We will add one\./);
  assert.match(view.querySelector("[data-testid=reply-notice]").textContent, /Reply sent/);
  assert.equal(view.querySelectorAll("[data-testid=owner-comment]")[0].querySelectorAll("[data-testid=owner-reply]").length, 0);
});

test("R4 owner: a removed comment shows as removed with no way to reply, and the owner cannot edit or delete Reviewer text", async () => {
  thread = [make({ id: "c-1", text: null, removed: true }), make({ id: "c-2", text: "Still here." })];
  const view = await render(h(OwnerFeedback, { designId: "d-1", grant: grantOf({ commentCount: 2 }) }));
  await click(buttonNamed(view, "Feedback from Rhea Reviewer"));
  const [gone, live] = view.querySelectorAll("[data-testid=owner-comment]");
  assert.match(gone.textContent, /Comment removed/);
  assert.equal(buttonNamed(gone, "Reply"), undefined);
  assert.ok(buttonNamed(live, "Reply"));
  assert.equal([...view.querySelectorAll("button")].some((b) => /^(Edit|Delete|Remove)/.test(b.textContent.trim())), false);
});

test("R4 owner: after the review is stopped the thread is still readable but replies are closed", async () => {
  thread = [make({ id: "c-1", text: "Kept feedback." })];
  const view = await render(h(OwnerFeedback, { designId: "d-1", grant: grantOf({ status: "revoked", revokedAt: "2026-10-31T10:00:00.000Z" }) }));
  await click(buttonNamed(view, "Feedback from Rhea Reviewer"));
  assert.match(view.querySelector("[data-testid=owner-comment]").textContent, /Kept feedback\./);
  assert.match(view.querySelector("[data-testid=replies-closed]").textContent, /Replies are closed/);
  assert.equal(buttonNamed(view, "Reply"), undefined);
});

test("R4 owner: a refused reply is explained, and an empty thread says so", async () => {
  thread = [make({ id: "c-1", text: "Question." })];
  let view = await render(h(OwnerFeedback, { designId: "d-1", grant: grantOf() }));
  await click(buttonNamed(view, "Feedback from Rhea Reviewer"));
  await click(buttonNamed(view, "Reply"));
  await typeInto(view.querySelector("[data-testid=owner-comment] textarea"), "An answer.");
  failNext = new ApiError("CONFLICT", "raw", 409, { reason: "REVIEW_STOPPED" });
  await click(buttonNamed(view, "Send reply"));
  const notice = view.querySelector("[data-testid=reply-notice]");
  assert.match(notice.textContent, /replies are closed/);
  assert.equal(notice.getAttribute("role"), "alert");
  for (const root of roots) await act(async () => root.unmount());
  roots = [];
  document.body.innerHTML = "";
  thread = [];
  view = await render(h(OwnerFeedback, { designId: "d-1", grant: grantOf({ commentCount: 0 }) }));
  await click(buttonNamed(view, "Feedback from Rhea Reviewer"));
  assert.match(view.textContent, /Nothing written yet/);
});
