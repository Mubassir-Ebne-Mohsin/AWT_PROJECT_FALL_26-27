const { test } = require("node:test");
const assert = require("node:assert/strict");
const U = require("../src/lib/concept-help/unanswered.ts");

const memory = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
};

test("records newest first, ignores blanks and duplicates, caps at 20", () => {
  const s = memory();
  U.recordUnanswered("  how   do I fly ", s);
  U.recordUnanswered("", s);
  U.recordUnanswered("HOW DO I FLY", s);
  assert.deepEqual(U.readUnanswered(s), ["HOW DO I FLY"]);
  for (let i = 0; i < 30; i++) U.recordUnanswered("q" + i, s);
  const list = U.readUnanswered(s);
  assert.equal(list.length, U.UNANSWERED_MAX);
  assert.equal(list[0], "q29");
});

test("clear empties the list; bad stored data and missing storage are survived", () => {
  const s = memory();
  U.recordUnanswered("a question", s);
  U.clearUnanswered(s);
  assert.deepEqual(U.readUnanswered(s), []);
  s.setItem(U.UNANSWERED_KEY, "{not json");
  assert.deepEqual(U.readUnanswered(s), []);
  assert.deepEqual(U.readUnanswered(null), []);
  assert.deepEqual(U.recordUnanswered("x", null), ["x"]);
  const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("full"); }, removeItem: () => { throw new Error("x"); } };
  assert.deepEqual(U.readUnanswered(throwing), []);
  assert.doesNotThrow(() => U.recordUnanswered("x", throwing));
  assert.doesNotThrow(() => U.clearUnanswered(throwing));
});

test("long questions are cut to 200 characters", () => {
  const s = memory();
  U.recordUnanswered("x".repeat(500), s);
  assert.equal(U.readUnanswered(s)[0].length, 200);
});
