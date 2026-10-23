const { test } = require("node:test");
const assert = require("node:assert/strict");
const { apiEvents } = require("../src/lib/api/events.ts");

test("409 conflict stays inline, preserves credentials and exposes revision details", async () => {
  const original = global.fetch;
  const client = require("../src/lib/api/client.ts");
  const events = [];
  const off = ["server-error", "session-expired", "not-found", "unreachable"].map(name => apiEvents.on(name, () => events.push(name)));
  client.adoptSession({ accessToken: "memory-token", user: { id: "u", displayName: "Test", email: "test@example.test", role: "USER" } });
  const details = { reason: "REVISION_MISMATCH", currentRevision: 2 };
  try {
    for (const body of [{ error: { code: "CONFLICT", message: "Stale revision", details } }, null]) {
      global.fetch = async () => new Response(body ? JSON.stringify(body) : "gateway conflict", { status: 409 });
      await assert.rejects(client.api("/designs/draft", { method: "PATCH", body: { expectedRevision: 1 } }), error => {
        assert.equal(error.code, "CONFLICT"); assert.equal(error.status, 409);
        if (body) assert.deepEqual(error.details, details);
        return true;
      });
    }
    assert.equal(client.getAccessToken(), "memory-token");
    assert.deepEqual(events, []);
  } finally { global.fetch = original; off.forEach(f => f()); client.dropSession(); }
});
