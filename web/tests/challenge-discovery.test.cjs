const { test } = require("node:test"),
  assert = require("node:assert/strict");
const {
  discoverChallenges,
  challengeCategory,
} = require("../src/lib/challenge-discovery.ts");
const fixtures = require("./fixtures/foundation-challenges.json");
const all = {
  search: "",
  category: "",
  difficulty: "",
  state: "",
  sort: "recommended",
};
test("discovery filters actual metadata and does not mutate the source order", () => {
  const order = fixtures.map((c) => c.id);
  assert.equal(
    discoverChallenges(fixtures, { ...all, search: " CATALOGUE " }, new Map())
      .length,
    1,
  );
  assert.equal(
    discoverChallenges(fixtures, { ...all, category: "Regions" }, new Map())[0]
      .id,
    fixtures[4].id,
  );
  assert.equal(
    discoverChallenges(fixtures, { ...all, difficulty: "beginner" }, new Map())
      .length,
    2,
  );
  assert.equal(
    discoverChallenges(fixtures, { ...all, search: "nonexistent" }, new Map())
      .length,
    0,
  );
  assert.deepEqual(
    fixtures.map((c) => c.id),
    order,
  );
});
test("progress filtering trusts recorded pass, not simulation verdict or UI visits", () => {
  const p = new Map([
    [fixtures[0].id, { passed: true }],
    [fixtures[1].id, { passed: false }],
  ]);
  assert.deepEqual(
    discoverChallenges(fixtures, { ...all, state: "passed" }, p).map(
      (c) => c.id,
    ),
    [fixtures[0].id],
  );
  assert.deepEqual(
    discoverChallenges(fixtures, { ...all, state: "in-progress" }, p).map(
      (c) => c.id,
    ),
    [fixtures[1].id],
  );
  assert.equal(
    discoverChallenges(fixtures, { ...all, state: "not-started" }, p).length,
    4,
  );
  assert.equal(
    discoverChallenges(fixtures, { ...all, state: "passed" }, new Map()).length,
    0,
  );
});
test("legacy metadata stays unclassified and sorts after authored difficulty", () => {
  const old = {
    id: "legacy",
    title: "A legacy item",
    summary: "old",
    goal: { p95Ms: 300, errorRate: 0.01 },
  };
  assert.equal(challengeCategory(old), "Unclassified");
  const sorted = discoverChallenges(
    [...fixtures, old],
    { ...all, sort: "difficulty" },
    new Map(),
  );
  assert.equal(sorted.at(-1).id, "legacy");
  assert.equal(
    discoverChallenges(
      [...fixtures, old],
      { ...all, category: "Unclassified" },
      new Map(),
    ).length,
    1,
  );
});
