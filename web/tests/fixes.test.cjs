const { test } = require("node:test");
const assert = require("node:assert/strict");
const { ApiError } = require("../src/lib/api/errors.ts");
const F = require("../src/lib/fixes.ts");

// The words around verified fixes. Every figure in them comes from the server's measures; none is computed here.
const m = (verdict, p95, errorRate, maxRho = 1) => ({ verdict, p95, errorRate, maxRho });
const fixes = (over = {}) => ({
  designId: "d", runId: "r", revision: 1, status: "SUGGESTIONS", baseline: m("fail", 1842, 0.672), limiter: { id: "n4", label: "App servers", type: "app" },
  suggestions: [], tried: 3, skipped: 0, ...over,
});

test("a fix that makes the design pass says so, with what changed", () => {
  assert.equal(F.changeText(m("fail", 914, 0.067), m("pass", 46, 0)), "The design would pass. Errors fall from 6.7% to 0% and p95 falls from 914 ms to 46 ms.");
});

test("a fix that only helps says it would still fail, never that it fixes the design", () => {
  const text = F.changeText(m("fail", 1842, 0.672), m("fail", 1788, 0.343));
  assert.match(text, /^It would still fail, but less badly\./);
  assert.match(text, /errors fall from 67.2% to 34.3%/i);
  assert.match(text, /p95 falls from 1,842 ms to 1,788 ms/);
  assert.doesNotMatch(text, /would pass|fixes/);
});

test("a fix that moves a failing design to strained says exactly that", () => {
  assert.match(F.changeText(m("fail", 900, 0.2), m("strained", 115, 0)), /^The design would be strained instead of failing\./);
  assert.match(F.changeText(m("strained", 200, 0), m("strained", 100, 0)), /^It would still be strained, but less badly\. P95 falls from 200 ms to 100 ms\.$/);
});

test("it mentions only the measures that really improved", () => {
  assert.equal(F.changeText(m("fail", 1000, 0.3), m("fail", 1000, 0.2)), "It would still fail, but less badly. Errors fall from 30% to 20%.");
  assert.equal(F.changeText(m("fail", 1000, 0.3), m("fail", 900, 0.3)), "It would still fail, but less badly. P95 falls from 1,000 ms to 900 ms.");
  assert.equal(F.changeText(m("fail", 1000, 0.3), m("fail", 999.5, 0.3)), "It would still fail, but less badly.");
});

test("each status has its own plain sentence, and the useful one says what was aimed at", () => {
  assert.equal(F.statusText(fixes({ status: "SUGGESTIONS" })), "");
  assert.equal(F.statusText(fixes({ status: "NOTHING_TO_FIX" })), "This run passes, so there is nothing to fix.");
  assert.match(F.statusText(fixes({ status: "INCOMPLETE" })), /busy.*no fix could be checked/);
  assert.match(F.statusText(fixes({ status: "NO_IMPROVEMENT_FOUND" })), /None of the 3 fixes tried for "App servers" improved this design\./);
  assert.match(F.statusText(fixes({ status: "NO_IMPROVEMENT_FOUND", limiter: null })), /no single component to aim at/);
});

test("verdicts are put in plain words", () => {
  assert.deepEqual(["pass", "strained", "fail"].map(F.verdictWord), ["passes", "is strained", "fails"]);
});

test("every failure is explained and says what to do, without leaking a server message", () => {
  const err = (status, code, details) => new ApiError(code, "server detail", status, details);
  const cases = [
    [err(422, "VALIDATION_FAILED", { reason: "RUN_NOT_CURRENT" }), /not for the saved design.*run the test again/i],
    [err(422, "VALIDATION_FAILED", { reason: "RUN_NOT_USABLE" }), /completed test run/],
    [err(409, "CONFLICT"), /design changed.*run the test again/],
    [err(429, "RATE_LIMITED"), /capacity is busy/],
    [err(401, "UNAUTHENTICATED"), /session ended/],
    [err(0, "NETWORK"), /Could not reach the server/],
    [err(500, "INTERNAL"), /could not be made/],
    [new Error("boom"), /could not be made/],
  ];
  for (const [error, pattern] of cases) {
    const text = F.fixesError(error);
    assert.match(text, pattern);
    assert.doesNotMatch(text, /server detail|boom/);
  }
});

test("the note says the figures are a model's estimates and that nothing changes until the person saves", () => {
  assert.match(F.FIXES_NOTE, /same model as your test runs/);
  assert.match(F.FIXES_NOTE, /estimates from a model, not measurements of real infrastructure/);
  assert.match(F.FIXES_NOTE, /Nothing changes until you apply a fix and save/);
});
