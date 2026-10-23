const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { apiEvents } = require("../src/lib/api/events.ts");
const originalFetch = global.fetch;
const originalNavigator = Object.getOwnPropertyDescriptor(global, "navigator");
const session = { accessToken: "memory-only", user: { id: "user", displayName: "Test", email: "test@example.test", role: "USER" } };
const response = (status, data) => new Response(JSON.stringify(status < 300 ? { data } : { error: { code: data, message: "test failure" } }), { status });
let client;
let events;
let offs;
function freshClient() {
  delete require.cache[require.resolve("../src/lib/api/client.ts")];
  return require("../src/lib/api/client.ts");
}
beforeEach(() => {
  client = freshClient();
  events = [];
  offs = ["session-expired", "unreachable", "rate-limited", "server-error", "forbidden", "not-found"].map(name => apiEvents.on(name, () => events.push(name)));
});
afterEach(() => {
  offs.forEach(off => off());
  global.fetch = originalFetch;
  Object.defineProperty(global, "navigator", originalNavigator);
});

test("terminal retry 401 forgets the token and emits session expiry exactly once", async () => {
  client.adoptSession(session);
  const replies = [response(401, "UNAUTHENTICATED"), response(200, session), response(401, "UNAUTHENTICATED")];
  global.fetch = async () => replies.shift();
  await assert.rejects(client.api("/auth/me"), { status: 401 });
  assert.equal(client.getAccessToken(), null);
  assert.deepEqual(events, ["session-expired"]);
  assert.equal(replies.length, 0);
});
for (const [status, code, event] of [[429, "RATE_LIMITED", "rate-limited"], [503, "UNAVAILABLE", "unreachable"], [403, "FORBIDDEN", "forbidden"]]) {
  test(`refresh ${status} preserves credentials and reports a temporary failure`, async () => {
    client.adoptSession(session);
    const replies = [response(401, "UNAUTHENTICATED"), response(status, code)];
    global.fetch = async () => replies.shift();
    await assert.rejects(client.api("/auth/me"));
    assert.equal(client.getAccessToken(), session.accessToken);
    assert.deepEqual(events, [event]);
    assert.equal(replies.length, 0);
  });
}
test("refresh credential rejection expires the session without retrying the resource", async () => {
  client.adoptSession(session);
  let count = 0;
  global.fetch = async () => { count++; return response(401, "SESSION_EXPIRED"); };
  await assert.rejects(client.api("/auth/me"), { status: 401 });
  assert.equal(count, 2);
  assert.equal(client.getAccessToken(), null);
  assert.deepEqual(events, ["session-expired"]);
});
test("refresh network failure preserves credentials and announces outage", async () => {
  client.adoptSession(session);
  global.fetch = async url => { if (url.endsWith("/auth/refresh")) throw new TypeError("offline"); return response(401, "UNAUTHENTICATED"); };
  await assert.rejects(client.api("/auth/me"), { code: "NETWORK" });
  assert.equal(client.getAccessToken(), session.accessToken);
  assert.deepEqual(events, ["unreachable"]);
});
test("successful refresh retries once with the new bearer and unwraps data", async () => {
  client.adoptSession({ ...session, accessToken: "old" });
  const seen = [];
  global.fetch = async (url, opts) => {
    seen.push([url, opts.headers.Authorization, opts.credentials]);
    return seen.length === 1 ? response(401, "UNAUTHENTICATED") : response(200, seen.length === 2 ? session : { value: 42 });
  };
  assert.deepEqual(await client.api("/resource"), { value: 42 });
  assert.deepEqual(seen.map(row => row[1]), ["Bearer old", undefined, "Bearer memory-only"]);
  assert.ok(seen.every(row => row[2] === "include"));
  assert.deepEqual(events, []);
});
for (const [status, code, event] of [[404, "NOT_FOUND", "not-found"], [403, "FORBIDDEN", "forbidden"], [429, "RATE_LIMITED", "rate-limited"], [500, "INTERNAL", "server-error"]]) {
  test(`API ${status} maps to its system event; silent requests leave UI to caller`, async () => {
    global.fetch = async () => response(status, code);
    await assert.rejects(client.api("/missing"), { code, status });
    assert.deepEqual(events, [event]);
    await assert.rejects(client.api("/missing", { silent: true }));
    assert.deepEqual(events, [event]);
  });
}
test("HTML gateway 404 still opens not-found", async () => {
  global.fetch = async () => new Response("<h1>missing</h1>", { status: 404 });
  await assert.rejects(client.api("/missing"), { code: "NOT_FOUND" });
  assert.deepEqual(events, ["not-found"]);
});
test("auth:false 401 is an inline credential failure with no refresh", async () => {
  client.adoptSession(session);
  let count = 0;
  global.fetch = async () => { count++; return response(401, "UNAUTHENTICATED"); };
  await assert.rejects(client.api("/auth/login", { auth: false, silent: true }));
  assert.equal(count, 1);
  assert.deepEqual(events, []);
});
test("caller cancellation is not an outage", async () => {
  const abort = new AbortController(); abort.abort();
  global.fetch = async () => { throw abort.signal.reason; };
  await assert.rejects(client.api("/resource", { signal: abort.signal }), { name: "AbortError" });
  assert.deepEqual(events, []);
});
test("same-tab restore callers share one rotating-cookie request", async () => {
  let count = 0;
  global.fetch = async () => { count++; return response(200, session); };
  const a = client.refreshSession(); const b = client.refreshSession();
  assert.equal(a, b);
  await Promise.all([a, b]);
  assert.equal(count, 1);
});
test("two isolated tab modules serialize cookie rotation via Web Locks without token storage or broadcast", async () => {
  let queue = Promise.resolve();
  const locks = [];
  Object.defineProperty(global, "navigator", { configurable: true, value: { locks: { request(name, run) {
    locks.push(name); const next = queue.then(run); queue = next.catch(() => {}); return next;
  } } } });
  const tabB = freshClient();
  let cookie = 0; let active = 0; let max = 0;
  global.fetch = async () => {
    const sent = cookie; active++; max = Math.max(max, active);
    await new Promise(resolve => setImmediate(resolve));
    active--;
    if (sent !== cookie) return response(401, "SESSION_EXPIRED");
    cookie++;
    return response(200, { ...session, accessToken: `tab-${cookie}` });
  };
  const result = await Promise.all([client.refreshSession(), tabB.refreshSession()]);
  assert.ok(result.every(r => r.ok));
  assert.equal(max, 1);
  assert.equal(cookie, 2);
  assert.deepEqual(locks, ["stressforge-auth-refresh", "stressforge-auth-refresh"]);
  assert.notEqual(client.getAccessToken(), tabB.getAccessToken());
  assert.deepEqual(events, []);
});

test("direct SESSION_EXPIRED without an in-memory token still announces reauthentication", async () => {
  global.fetch = async () => response(401, "SESSION_EXPIRED");
  await assert.rejects(client.api("/resource"), { code: "SESSION_EXPIRED" });
  assert.deepEqual(events, ["session-expired"]);
});
test("malformed successful refresh preserves credentials and announces outage", async () => {
  client.adoptSession(session);
  global.fetch = async () => new Response("not-json", { status: 200 });
  assert.deepEqual(await client.refreshSession(), { ok: false, reason: "unreachable" });
  assert.equal(client.getAccessToken(), session.accessToken);
  assert.deepEqual(events, ["unreachable"]);
});
test("logout 503 clears the local token but rejects so the UI cannot claim server success", async () => {
  const { logout } = require("../src/lib/api/auth.ts");
  // auth.ts imports the current module instance when first required here.
  const boundClient = require("../src/lib/api/client.ts");
  boundClient.adoptSession(session);
  global.fetch = async () => response(503, "UNAVAILABLE");
  await assert.rejects(logout(), { code: "UNAVAILABLE", status: 503 });
  assert.equal(boundClient.getAccessToken(), null);
  assert.deepEqual(events, []);
});

for (const data of [null, {}, { accessToken: "invalid", user: null }]) {
  test(`invalid refresh envelope ${JSON.stringify(data)} cannot overwrite the current session`, async () => {
    client.adoptSession(session);
    global.fetch = async () => response(200, data);
    assert.equal((await client.refreshSession()).ok, false);
    assert.equal(client.getAccessToken(), session.accessToken);
    assert.deepEqual(events, ["unreachable"]);
  });
}
