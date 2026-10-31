const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

// The real account API module, with only the HTTP client and the cookie helper replaced and recorded.
let calls = [];
let hintCleared = 0;
let adopted = [];
let updated = [];
let failNext = null;
const reply = { id: "u1", displayName: "New", email: "e@example.test", role: "user", createdAt: "2026-10-01T00:00:00.000Z" };
require.cache[require.resolve("../src/lib/api/client.ts")] = {
  exports: {
    api: async (path, opts) => {
      calls.push([path, opts.method ?? "GET", opts.body, opts.scope]);
      if (failNext) {
        const e = failNext;
        failNext = null;
        throw e;
      }
      return path === "/auth/password" ? { accessToken: "t", expiresIn: 900, user: reply } : path === "/account/profile" ? reply : undefined;
    },
    adoptSession: (s) => adopted.push(s),
    updateSessionUser: (u) => updated.push(u),
  },
};
require.cache[require.resolve("../src/lib/session-hint.ts")] = { exports: { clearSessionHint: () => { hintCleared += 1; } } };
const A = require("../src/lib/api/account.ts");

beforeEach(() => {
  calls = [];
  hintCleared = 0;
  adopted = [];
  updated = [];
  failNext = null;
});

test("P4 api: a new display name goes to the profile route and updates the signed-in details", async () => {
  const user = await A.changeDisplayName("New");
  assert.deepEqual(calls, [["/account/profile", "PATCH", { displayName: "New" }, "local"]]);
  assert.deepEqual(updated, [reply]);
  assert.equal(user.displayName, "New");
});

test("P4 api: a password change adopts the fresh session the server returns for this device", async () => {
  await A.changePassword("old-pass-1", "new-pass-2");
  assert.deepEqual(calls, [["/auth/password", "POST", { currentPassword: "old-pass-1", newPassword: "new-pass-2" }, "local"]]);
  assert.equal(adopted.length, 1);
  assert.equal(adopted[0].accessToken, "t");
});

test("P4 api: a failed password change adopts nothing", async () => {
  failNext = new Error("rejected");
  await assert.rejects(() => A.changePassword("a", "b"), /rejected/);
  assert.deepEqual(adopted, []);
});

test("P4 api: a deleted account forgets the signed-in marker, and a refused deletion does not", async () => {
  await A.deleteAccount("pw-1", "delete my account");
  assert.deepEqual(calls, [["/account/delete", "POST", { password: "pw-1", confirmation: "delete my account" }, "local"]]);
  assert.equal(hintCleared, 1);
  failNext = new Error("refused");
  await assert.rejects(() => A.deleteAccount("pw-2", "delete my account"), /refused/);
  assert.equal(hintCleared, 1, "still signed in after a refusal");
});

test("P4 api: the export is a plain read on the account route", async () => {
  await A.exportAccount();
  assert.deepEqual(calls, [["/account/export", "GET", undefined, "local"]]);
});
