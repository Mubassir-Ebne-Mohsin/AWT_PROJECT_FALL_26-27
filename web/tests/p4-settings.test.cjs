const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", { url: "http://localhost:3000" });
for (const name of ["window", "document", "HTMLElement", "Element", "Node", "Event", "MouseEvent", "KeyboardEvent", "HTMLInputElement", "HTMLTextAreaElement", "HTMLSelectElement", "localStorage", "Blob"]) {
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

// A stateful fake of the account API; every call is recorded.
const ME = { id: "me-1", displayName: "Pat Profile", email: "pat@example.test", createdAt: "2026-10-01T10:00:00.000Z", role: "user" };
let pathname = "/settings/profile";
let calls = [];
let failNext = null;
let navigated = [];
let toasts = [];
let themeSet = [];
let theme = "system";
let notFoundCalled = false;
let exported = null;
let download = null;
let roles = ["user"];
const fail = () => {
  const e = failNext;
  failNext = null;
  return e;
};
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
require.cache[require.resolve("next-themes")] = { exports: { useTheme: () => ({ theme, setTheme: (t) => { themeSet.push(t); theme = t; } }) } };
require.cache[require.resolve("../src/components/auth/auth-provider.tsx")] = { exports: { useAuth: () => ({ user: ME, status: "authed", signOut() {} }), initialsOf: () => "P" } };
require.cache[require.resolve("../src/components/auth/use-my-roles.ts")] = { exports: { useMyRoles: () => ({ roles, loading: false, failed: false }) } };
require.cache[require.resolve("../src/lib/notify.ts")] = { exports: { notify: (m, k) => toasts.push([m, k ?? "ok"]) } };
require.cache[require.resolve("../src/lib/navigation.ts")] = { exports: { hardNavigate: (url) => navigated.push(url) } };
require.cache[require.resolve("../src/lib/api/account.ts")] = {
  exports: {
    changeDisplayName: async (name) => {
      calls.push(["name", name]);
      const e = fail();
      if (e) throw e;
      ME.displayName = name;
      return { ...ME };
    },
    changePassword: async (cur, next) => {
      calls.push(["password", cur, next]);
      const e = fail();
      if (e) throw e;
    },
    exportAccount: async () => {
      calls.push(["export"]);
      const e = fail();
      if (e) throw e;
      return exported;
    },
    deleteAccount: async (pw, phrase) => {
      calls.push(["delete", pw, phrase]);
      const e = fail();
      if (e) throw e;
    },
  },
};
const { SettingsPage } = require("../src/components/settings/settings.tsx");
const S = require("../src/lib/settings-presentation.ts");

let roots = [];
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
async function render(path) {
  pathname = path;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => root.render(h(QueryClientProvider, { client: client() }, h(SettingsPage))));
  await settle();
  return container;
}
afterEach(async () => {
  for (const root of roots) await act(async () => root.unmount());
  roots = [];
  document.body.innerHTML = "";
  calls = [];
  failNext = null;
  navigated = [];
  toasts = [];
  themeSet = [];
  theme = "system";
  notFoundCalled = false;
  ME.displayName = "Pat Profile";
  roles = ["user"];
  exported = null;
  download = null;
});
const click = async (el) => { await act(async () => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }))); await settle(); };
const typeInto = async (el, value) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(el, value);
    el.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
};
const submit = async (view, name) => {
  await act(async () => view.querySelector(`form[aria-label='${name}']`).dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
  await settle();
};
const byLabel = (root, text) => {
  const label = [...root.querySelectorAll("label")].find((l) => l.textContent.trim() === text);
  assert.ok(label, "no label " + text);
  return root.ownerDocument.getElementById(label.htmlFor);
};
const testid = (root, id) => root.querySelector(`[data-testid='${id}']`);

test("P4 checks: display names, passwords and the deletion phrase are checked at their exact edges", () => {
  assert.equal(S.validateDisplayName("x".repeat(60)), null);
  assert.match(S.validateDisplayName("x".repeat(61)), /at most 60/);
  assert.match(S.validateDisplayName("   "), /Enter a display name/);
  assert.match(S.validateDisplayName("tab\there"), /plain text/);
  assert.equal(S.validateDisplayName("  Pat <b>  "), null, "markup is just text");
  assert.equal(S.validateNewPassword("abcdefg1"), null);
  assert.match(S.validateNewPassword("abcde1"), /at least 8/);
  assert.match(S.validateNewPassword("a1" + "b".repeat(127)), /at most 128/);
  assert.equal(S.validateNewPassword("a1" + "b".repeat(126)), null);
  assert.match(S.validateNewPassword("abcdefgh"), /letter and one number/);
  assert.match(S.validateNewPassword("12345678"), /letter and one number/);
  assert.deepEqual(S.validatePasswordChange({ current: "old-pass-1", next: "new-pass-2", confirm: "new-pass-2" }), {});
  assert.deepEqual(Object.keys(S.validatePasswordChange({ current: "", next: "x", confirm: "y" })).sort(), ["confirm", "current", "next"]);
  assert.match(S.validatePasswordChange({ current: "same-pass-1", next: "same-pass-1", confirm: "same-pass-1" }).next, /not already using/);
  assert.equal(S.phraseMatches("  Delete My Account "), true);
  assert.equal(S.phraseMatches("delete my accoun"), false);
  assert.equal(S.canDelete("", "delete my account"), false);
  assert.equal(S.canDelete("pw", "delete my account"), true);
  assert.equal(S.exportFileName(new Date("2026-11-01T23:59:59Z")), "stressforge-export-2026-11-01.json");
  assert.equal(S.exportSummary({ designs: [1], challengeAttempts: [], challengesIManage: [1, 2] }), "Saved 1 design, 0 challenge attempts and 2 challenges you manage.");
});

test("P4 checks: failures are explained in words and never echo the server's own message", () => {
  const err = (status, code, details) => new ApiError(code, "SECRET SERVER TEXT", status, details);
  assert.match(S.accountErrorText(err(409, "CONFLICT", { reason: "LAST_ADMIN" }), "delete"), /only working Admin/);
  assert.match(S.accountErrorText(err(429, "RATE_LIMITED"), "password"), /Too many tries/);
  assert.match(S.accountErrorText(err(401, "UNAUTHENTICATED"), "name"), /Log in again/);
  assert.match(S.accountErrorText(err(422, "VALIDATION_FAILED"), "delete"), /Nothing was deleted/);
  assert.match(S.accountErrorText(err(0, "NETWORK"), "export"), /could not be reached/);
  for (const e of [err(500, "INTERNAL"), new Error("boom")]) for (const what of ["name", "password", "export", "delete"]) assert.doesNotMatch(S.accountErrorText(e, what), /SECRET|boom/);
  assert.deepEqual(S.serverFields(new Error("x")), {});
});

test("P4 settings: six sections are listed, the current one is marked, and an unknown section is not found", async () => {
  const view = await render("/settings/profile");
  const links = [...view.querySelectorAll("nav[aria-label='Settings sections'] a")];
  assert.deepEqual(links.map((a) => a.textContent), ["Profile", "Security", "AI usage", "Data", "Appearance", "Preferences"]);
  assert.deepEqual(links.filter((a) => a.getAttribute("aria-current") === "page").map((a) => a.textContent), ["Profile"]);
  assert.equal(view.querySelectorAll("h1").length, 1);
  await assert.rejects(() => render("/settings/nope"), /NEXT_NOT_FOUND/);
  assert.equal(notFoundCalled, true);
});

test("P4 profile: shows the account, sends a trimmed name once, refuses a blank one, and shows a server rejection", async () => {
  roles = ["user", "reviewer"];
  const view = await render("/settings/profile");
  assert.equal(testid(view, "profile-email").textContent, "pat@example.test");
  assert.match(view.textContent, /User, Reviewer/);
  const input = byLabel(view, "Display name");
  const save = [...view.querySelectorAll("button")].find((b) => b.textContent === "Save name");
  assert.equal(save.disabled, true, "nothing changed yet");
  await typeInto(input, "   ");
  await submit(view, "Change display name");
  assert.deepEqual(calls, [], "a blank name sends nothing");
  assert.match(view.textContent, /Enter a display name/);
  assert.equal(input.getAttribute("aria-invalid"), "true");
  await typeInto(input, "  Pat <b>Q</b>  ");
  await submit(view, "Change display name");
  assert.deepEqual(calls, [["name", "Pat <b>Q</b>"]]);
  assert.match(testid(view, "profile-notice").textContent, /Saved/);
  assert.equal(view.querySelector("b"), null, "the name is shown as text");
  failNext = new ApiError("VALIDATION_FAILED", "SECRET SERVER TEXT", 422, { fields: [{ path: "displayName", message: "Use at most 60 characters" }] });
  await typeInto(input, "Another");
  await submit(view, "Change display name");
  assert.match(view.textContent, /Use at most 60 characters/);
  assert.doesNotMatch(view.textContent, /SECRET/);
});

test("P4 security: nothing is sent until the form is valid; success clears the boxes and says other devices were signed out", async () => {
  const view = await render("/settings/security");
  await submit(view, "Change password");
  assert.deepEqual(calls, []);
  assert.match(view.textContent, /Enter your current password/);
  await typeInto(byLabel(view, "Current password"), "old-pass-1");
  await typeInto(byLabel(view, "New password"), "weak");
  await typeInto(byLabel(view, "Confirm new password"), "other");
  await submit(view, "Change password");
  assert.deepEqual(calls, []);
  assert.match(view.textContent, /at least 8 characters/);
  assert.match(view.textContent, /do not match/);
  await typeInto(byLabel(view, "New password"), "new-pass-2");
  await typeInto(byLabel(view, "Confirm new password"), "new-pass-2");
  await submit(view, "Change password");
  assert.deepEqual(calls, [["password", "old-pass-1", "new-pass-2"]]);
  assert.match(testid(view, "password-notice").textContent, /every other device has been signed out/);
  assert.equal(byLabel(view, "Current password").value, "");
  assert.equal(byLabel(view, "New password").value, "");
  assert.equal(byLabel(view, "Confirm new password").value, "");
});

test("P4 security: a wrong current password is shown next to its box and the new password is kept out of the message", async () => {
  const view = await render("/settings/security");
  await typeInto(byLabel(view, "Current password"), "wrong-pass-1");
  await typeInto(byLabel(view, "New password"), "new-pass-2");
  await typeInto(byLabel(view, "Confirm new password"), "new-pass-2");
  failNext = new ApiError("VALIDATION_FAILED", "SECRET", 422, { fields: [{ path: "currentPassword", message: "Incorrect password" }] });
  await submit(view, "Change password");
  assert.match(view.textContent, /Incorrect password/);
  assert.equal(byLabel(view, "Current password").getAttribute("aria-invalid"), "true");
  assert.doesNotMatch(view.textContent, /new-pass-2|SECRET/);
  failNext = new ApiError("NETWORK", "x", 0);
  await submit(view, "Change password");
  assert.match(testid(view, "password-notice").textContent, /could not be reached/);
});

test("P4 data: the export downloads one JSON file with the right name and content, and says what it saved", async () => {
  exported = { format: "stressforge-export-v1", designs: [{ id: "d1" }, { id: "d2" }], challengeAttempts: [], challengesIManage: [{ id: "c1" }] };
  let blob = null;
  URL.createObjectURL = (b) => { blob = b; return "blob:fake"; };
  URL.revokeObjectURL = () => {};
  const realCreate = document.createElement.bind(document);
  document.createElement = (tag) => {
    const el = realCreate(tag);
    if (tag === "a") el.click = () => { download = { name: el.download, href: el.href }; };
    return el;
  };
  try {
    const view = await render("/settings/data");
    await click(testid(view, "export-button"));
    assert.deepEqual(calls, [["export"]]);
    assert.equal(download.name, S.exportFileName(new Date()));
    assert.equal(download.href, "blob:fake");
    assert.deepEqual(JSON.parse(await blob.text()), exported);
    assert.equal(blob.type, "application/json");
    assert.equal(testid(view, "export-notice").textContent, "Saved 2 designs, 0 challenge attempts and 1 challenge you manage.");
    failNext = new ApiError("NETWORK", "x", 0);
    await click(testid(view, "export-button"));
    assert.match(testid(view, "export-notice").getAttribute("role"), /alert/);
  } finally {
    document.createElement = realCreate;
  }
});

test("P4 data: deleting is hidden behind a button, needs the password and the exact words, and sends exactly that", async () => {
  const view = await render("/settings/data");
  assert.equal(view.querySelector("form[aria-label='Confirm account deletion']"), null, "nothing to press by accident");
  assert.match(testid(view, "delete-section").textContent, /cannot be undone/);
  assert.match(testid(view, "delete-section").textContent, /Former Instructor/);
  await click(testid(view, "delete-open"));
  const confirm = testid(view, "delete-confirm");
  assert.equal(confirm.disabled, true);
  await typeInto(byLabel(view, "Your password"), "right-pass-1");
  assert.equal(confirm.disabled, true, "words not typed yet");
  await typeInto(byLabel(view, 'Type "delete my account" to confirm'), "delete my accoun");
  assert.equal(confirm.disabled, true);
  await submit(view, "Confirm account deletion");
  assert.deepEqual(calls, [], "a disabled form still sends nothing");
  await typeInto(byLabel(view, 'Type "delete my account" to confirm'), "Delete My Account");
  assert.equal(confirm.disabled, false);
  await submit(view, "Confirm account deletion");
  assert.deepEqual(calls, [["delete", "right-pass-1", "Delete My Account"]]);
  assert.deepEqual(navigated, ["/"], "a full page load to the home page, not a route change to the login screen");
});

test("P4 data: a refused deletion stays on the screen with the reason, deletes nothing here, and can be cancelled", async () => {
  const view = await render("/settings/data");
  await click(testid(view, "delete-open"));
  await typeInto(byLabel(view, "Your password"), "wrong-pass-1");
  await typeInto(byLabel(view, 'Type "delete my account" to confirm'), "delete my account");
  failNext = new ApiError("VALIDATION_FAILED", "SECRET", 422, { fields: [{ path: "password", message: "Incorrect password" }] });
  await submit(view, "Confirm account deletion");
  assert.match(view.textContent, /Incorrect password/);
  assert.match(testid(view, "delete-notice").textContent, /Nothing was deleted/);
  assert.deepEqual(navigated, [], "a refused deletion goes nowhere");
  failNext = new ApiError("CONFLICT", "SECRET", 409, { reason: "LAST_ADMIN" });
  await submit(view, "Confirm account deletion");
  assert.match(testid(view, "delete-notice").textContent, /only working Admin/);
  assert.doesNotMatch(view.textContent, /SECRET/);
  await click([...view.querySelectorAll("button")].find((b) => b.textContent === "Cancel"));
  assert.equal(view.querySelector("form[aria-label='Confirm account deletion']"), null);
  await click(testid(view, "delete-open"));
  assert.equal(byLabel(view, "Your password").value, "", "the password is not kept after cancelling");
});

test("P4 appearance, AI usage and preferences say only what is true", async () => {
  let view = await render("/settings/appearance");
  const radios = [...view.querySelectorAll("input[type=radio]")];
  assert.deepEqual(radios.map((r) => r.value), ["light", "dark", "system"]);
  assert.equal(radios.find((r) => r.checked).value, "system");
  await click(radios[1]);
  assert.deepEqual(themeSet, ["dark"]);
  assert.doesNotMatch(view.textContent, /Color theme/, "no clash with the top bar's own theme control");
  document.body.innerHTML = "";
  view = await render("/settings/ai-usage");
  assert.match(testid(view, "ai-off").textContent, /switched off.*nothing is sent/);
  document.body.innerHTML = "";
  view = await render("/settings/preferences");
  assert.match(testid(view, "preferences-empty").textContent, /nothing else to set yet/);
});
