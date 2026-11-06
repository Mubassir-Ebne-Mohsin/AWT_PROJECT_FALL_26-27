const { test, afterEach } = require("node:test"),
  assert = require("node:assert/strict"),
  { JSDOM } = require("jsdom");
const dom = new JSDOM("<!doctype html><body></body>", {
  url: "http://localhost",
});
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require("react"),
  { act } = React,
  { createRoot } = require("react-dom/client");
const labels =
  require("../src/lib/notifications.ts").NOTIFICATION_PREFERENCE_LABELS;
const initial = () =>
  Object.keys(labels).map((kind) => ({ kind, muted: false }));
let owner = "one",
  root,
  save,
  signal;
require.cache[require.resolve("../src/components/auth/auth-provider.tsx")] = {
  exports: { useAuth: () => ({ user: { id: owner } }) },
};
require.cache[require.resolve("../src/lib/api/notifications.ts")] = {
  exports: {
    getNotificationPreferences: async () => initial(),
    setNotificationPreference: (...a) => {
      signal = a[2];
      return save(...a);
    },
  },
};
const {
  NotificationPreferences,
} = require("../src/components/notifications/notification-preferences.tsx");
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
const flush = () => new Promise((r) => setImmediate(r));
async function mount() {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(NotificationPreferences));
    await flush();
  });
}
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
  owner = "one";
  document.body.innerHTML = "";
});
test("mute responds immediately, stays disabled during saving, and rolls back failed changes", async () => {
  await mount();
  const wait = deferred();
  save = () => wait.promise;
  const box = document.querySelector("input");
  await act(async () => box.click());
  assert.equal(box.checked, true);
  assert.equal(box.disabled, true);
  await act(async () => {
    wait.reject(Error("Saving unavailable"));
    await flush();
  });
  assert.equal(box.checked, false);
  assert.equal(box.disabled, false);
  assert.match(document.body.textContent, /Saving unavailable/);
});
test("successful save reconciles all server values and account change cancels late state", async () => {
  await mount();
  save = async () => initial().map((p) => ({ ...p, muted: true }));
  await act(async () => {
    document.querySelector("input").click();
    await flush();
  });
  assert.ok([...document.querySelectorAll("input")].every((x) => x.checked));
  const wait = deferred();
  save = () => wait.promise;
  await act(async () => document.querySelector("input").click());
  owner = "two";
  await act(async () => {
    root.render(React.createElement(NotificationPreferences));
    await flush();
  });
  assert.equal(signal.aborted, true);
  await act(async () => {
    wait.resolve(initial().map((p) => ({ ...p, muted: true })));
    await flush();
  });
  assert.ok([...document.querySelectorAll("input")].every((x) => !x.checked));
});
