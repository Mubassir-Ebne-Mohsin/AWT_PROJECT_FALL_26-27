const { test, afterEach } = require("node:test"),
  assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const dom = new JSDOM("<!doctype html><body></body>", {
  url: "http://localhost",
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
let hidden = false;
Object.defineProperty(document, "hidden", {
  configurable: true,
  get: () => hidden,
});
const React = require("react"),
  { act } = React,
  { createRoot } = require("react-dom/client");
let fetcher,
  reader,
  opener,
  requests = [],
  reads = [],
  opens = [],
  handle,
  root,
  timers = new Map(),
  counter = 1000;
const nativeSet = global.setTimeout,
  nativeClear = global.clearTimeout;
global.setTimeout = (fn, ms, ...args) => {
  if (ms >= 30000 && ms <= 240000) {
    const id = ++counter;
    timers.set(id, { fn, ms });
    return id;
  }
  return nativeSet(fn, ms, ...args);
};
global.clearTimeout = (id) => {
  if (timers.has(id)) timers.delete(id);
  else nativeClear(id);
};
require.cache[require.resolve("../src/lib/api/notifications.ts")] = {
  exports: {
    fetchNotifications: (...a) => {
      requests.push(a);
      return fetcher(...a);
    },
    readNotification: (...a) => {
      reads.push(a);
      return reader(...a);
    },
    openNotification: (...a) => {
      opens.push(a);
      return opener(...a);
    },
  },
};
const {
  useNotifications,
} = require("../src/components/notifications/use-notifications.ts");
const {
  notificationDelay,
  unreadLabel,
  NOTIFICATION_LABELS,
} = require("../src/lib/notifications.ts");
const page = (count = 1) => ({
  generatedAt: "2026-11-06T10:00:00Z",
  items: [
    {
      id: "one",
      kind: "support_reply",
      refId: "report",
      createdAt: "2026-11-06T10:00:00Z",
      readAt: null,
    },
  ],
  next: null,
  unreadCount: count,
});
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
const flush = () => new Promise((r) => setImmediate(r));
function Harness() {
  handle = useNotifications();
  return null;
}
async function mount() {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(Harness));
    await flush();
  });
}
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
  document.body.innerHTML = "";
  hidden = false;
  requests = [];
  reads = [];
  opens = [];
  timers.clear();
  fetcher = async () => page();
  reader = async () => ({ updated: 1 });
  opener = async () => ({ href: "/reports/report" });
});
fetcher = async () => page();
reader = async () => ({ updated: 1 });
opener = async () => ({ href: "/reports/report" });
test("closed labels and capped counts never use stored notification text; backoff is bounded", () => {
  assert.equal(Object.keys(NOTIFICATION_LABELS).length, 5);
  assert.equal(unreadLabel(100), "99+");
  assert.equal(unreadLabel(0), "0");
  assert.deepEqual(
    [0, 1, 2, 3, 8].map(notificationDelay),
    [30000, 60000, 120000, 240000, 240000],
  );
});
test("polls at 30 seconds, pauses while hidden and immediately refreshes on visibility", async () => {
  await mount();
  assert.equal(handle.data.unreadCount, 1);
  assert.equal([...timers.values()][0].ms, 30000);
  await act(async () => {
    hidden = true;
    document.dispatchEvent(new window.Event("visibilitychange"));
  });
  assert.equal(timers.size, 0);
  assert.equal(requests[0][1].aborted, true);
  await act(async () => {
    hidden = false;
    document.dispatchEvent(new window.Event("visibilitychange"));
    await flush();
  });
  assert.equal(requests.length, 2);
  await act(async () => handle.pause());
  assert.equal(timers.size, 0);
  assert.equal(handle.paused, true);
  await act(async () => {
    handle.pause();
    await flush();
  });
  assert.equal(requests.length, 3);
});
test("starts hidden without fetching, and retries failures locally with backoff", async () => {
  hidden = true;
  fetcher = async () => {
    throw Error("offline");
  };
  await mount();
  assert.equal(requests.length, 0);
  await act(async () => {
    hidden = false;
    document.dispatchEvent(new window.Event("visibilitychange"));
    await flush();
  });
  assert.equal(handle.error, "offline");
  assert.equal([...timers.values()][0].ms, 60000);
  fetcher = async () => page(2);
  await act(async () => {
    handle.refresh();
    await flush();
  });
  assert.equal(handle.data.unreadCount, 2);
  assert.equal(handle.error, "");
  assert.equal([...timers.values()][0].ms, 30000);
});
test("a newer request wins even when an aborted old response arrives last", async () => {
  const first = deferred();
  fetcher = () => first.promise;
  await mount();
  fetcher = async () => page(3);
  await act(async () => {
    handle.refresh();
    await flush();
  });
  assert.equal(handle.data.unreadCount, 3);
  await act(async () => {
    first.resolve(page(99));
    await flush();
  });
  assert.equal(handle.data.unreadCount, 3);
});
test("read/open invalidate old polls, ignore duplicate actions, and cancel late navigation on close/unmount", async () => {
  await mount();
  const wait = deferred();
  opener = () => wait.promise;
  let result;
  await act(async () => {
    result = handle.open("one");
    void handle.open("one");
  });
  assert.equal(opens.length, 1);
  await act(async () => handle.cancel());
  assert.equal(opens[0][1].aborted, true);
  await act(async () => {
    wait.resolve({ href: "/reports/report" });
    assert.equal(await result, undefined);
  });
  const pending = deferred();
  reader = () => pending.promise;
  await act(async () => {
    void handle.read();
  });
  const signal = reads[0][1];
  await act(async () => root.unmount());
  root = null;
  assert.equal(signal.aborted, true);
  await act(async () => {
    pending.resolve({ updated: 1 });
    await flush();
  });
});
test("pagination appends without duplicates; a refresh returns to the latest page", async () => {
  fetcher = async () => ({
    ...page(),
    next: { at: page().generatedAt, id: "one" },
  });
  await mount();
  fetcher = async () => ({
    ...page(2),
    items: [...page().items, { ...page().items[0], id: "two" }],
  });
  await act(async () => {
    handle.more();
    await flush();
  });
  assert.deepEqual(
    handle.data.items.map((x) => x.id),
    ["one", "two"],
  );
  fetcher = async () => page(3);
  await act(async () => {
    handle.refresh();
    await flush();
  });
  assert.equal(handle.data.items.length, 1);
  assert.equal(handle.data.unreadCount, 3);
});
