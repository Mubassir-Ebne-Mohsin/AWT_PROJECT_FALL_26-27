const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  recoveryKey,
  readSubmissionIdentity,
  rememberSubmissionIdentity,
} = require("../src/lib/attempt-recovery.ts");
const request = {
  requestId: "11111111-1111-4111-8111-111111111111",
  expectedRevision: 2,
};
test("R5.2 recovery identity is scoped to account and attempt", () => {
  assert.notEqual(recoveryKey("a", "x"), recoveryKey("b", "x"));
  assert.notEqual(recoveryKey("a", "x"), recoveryKey("a", "y"));
});
test("R5.2 reload recovers only a valid identity, never prompt or credentials", () => {
  assert.deepEqual(
    readSubmissionIdentity({ getItem: () => JSON.stringify(request) }, "k"),
    request,
  );
  for (const raw of [
    "bad",
    "null",
    JSON.stringify({ ...request, expectedRevision: 0 }),
    JSON.stringify({ ...request, accessToken: "forged" }),
  ])
    assert.equal(readSubmissionIdentity({ getItem: () => raw }, "k"), null);
});
test("R5.2 storage refusal does not prevent in-memory recovery", () => {
  const fail = () => {
    throw Error("blocked");
  };
  assert.equal(readSubmissionIdentity({ getItem: fail }, "k"), null);
  assert.doesNotThrow(() =>
    rememberSubmissionIdentity(
      { setItem: fail, removeItem: fail },
      "k",
      request,
    ),
  );
  assert.doesNotThrow(() =>
    rememberSubmissionIdentity({ setItem: fail, removeItem: fail }, "k", null),
  );
});
