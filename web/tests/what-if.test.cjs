const { test } = require("node:test");
const assert = require("node:assert/strict");
const { ApiError } = require("../src/lib/api/errors.ts");
const W = require("../src/lib/what-if.ts");

// The words and rules around the what-if panel. Nothing here computes a figure: every figure comes from the server.
const change = (over = {}) => ({ ...W.NO_CHANGE, ...over });
const err = (status, code, details, message = "failed") => new ApiError(code, message, status, details);

test("a change that changes nothing, or a value outside the bounds, is described before it is sent", () => {
  assert.match(W.changeProblem(W.NO_CHANGE), /Choose something to change/);
  assert.equal(W.changeProblem(change({ shape: "spike" })), null);
  assert.equal(W.changeProblem(change({ readShare: "balanced" })), null);
  assert.equal(W.changeProblem(change({ trafficMode: "multiply", value: 2 })), null);
  for (const value of [0.09, 20.5, Number.NaN, -1]) assert.match(W.changeProblem(change({ trafficMode: "multiply", value })), /from 0\.1 to 20/);
  for (const value of [0, 10_000_001, Number.NaN]) assert.match(W.changeProblem(change({ trafficMode: "set", value })), /from 1 to 10,000,000 requests per second/);
  assert.equal(W.changeProblem(change({ trafficMode: "multiply", value: 0.1 })), null);
  assert.equal(W.changeProblem(change({ trafficMode: "set", value: 10_000_000 })), null);
});

test("the value is sent as 0 when the rate is kept", () => {
  assert.deepEqual(W.normalised(change({ value: 7, shape: "ramp" })), change({ value: 0, shape: "ramp" }));
  assert.deepEqual(W.normalised(change({ trafficMode: "set", value: 7 })), change({ trafficMode: "set", value: 7 }));
});

test("the sentence says what was changed, worded here from the form", () => {
  assert.equal(W.changeSentence(change({ trafficMode: "multiply", value: 2 })), "Changed: the request rate multiplied by 2.");
  assert.equal(W.changeSentence(change({ trafficMode: "set", value: 20000, shape: "spike" })), "Changed: the request rate set to 20,000 per second, a spike shape.");
  assert.match(W.changeSentence(change({ readShare: "mostly_writes" })), /mostly writes \(10%\)/);
  assert.equal(W.changeSentence(W.NO_CHANGE), "Nothing changed.");
});

test("a side that could not be calculated is never read as a pass", () => {
  const side = (over) => ({ rps: 1, shape: "steady", readRatio: 0.5, status: "OK", measure: { verdict: "pass", p95: 1, errorRate: 0, maxRho: 0.1 }, limiter: null, ...over });
  assert.equal(W.resultText(side({})), "passes");
  assert.equal(W.resultText(side({ measure: { verdict: "strained", p95: 1, errorRate: 0, maxRho: 1 } })), "is strained");
  assert.equal(W.resultText(side({ measure: { verdict: "fail", p95: 1, errorRate: 0.5, maxRho: 2 } })), "fails");
  assert.equal(W.resultText(side({ status: "TOO_LARGE", measure: null })), "Beyond the model's limit");
  assert.equal(W.resultText(side({ status: "UNAVAILABLE", measure: null })), "Could not be checked");
  assert.equal(W.resultText(side({ measure: null })), "Could not be checked");
});

test("every failure is put in plain words with what to do next", () => {
  const cases = [
    [new Error("boom"), /could not be calculated/],
    [err(401, "UNAUTHORIZED"), /session ended/],
    [err(422, "VALIDATION_FAILED", { reason: "WHATIF_OUT_OF_RANGE" }, "Multiply the traffic by a number from 0.1 to 20."), /outside the allowed range, so nothing was calculated\. Multiply the traffic/],
    [err(422, "VALIDATION_FAILED", { reason: "WHATIF_NOTHING_TO_CHANGE" }), /Choose something to change/],
    [err(422, "VALIDATION_FAILED", { reason: "RUN_NOT_CURRENT" }), /Save, then run the test again/],
    [err(422, "VALIDATION_FAILED", { reason: "RUN_NOT_USABLE" }), /completed test run/],
    [err(409, "CONFLICT"), /design changed/],
    [err(429, "RATE_LIMITED"), /busy/],
    [err(0, "NETWORK"), /Could not reach the server/],
    [err(500, "INTERNAL_ERROR"), /could not be calculated/],
  ];
  for (const [error, pattern] of cases) {
    const text = W.whatIfError(error);
    assert.match(text, pattern);
    assert.doesNotMatch(text, /boom|INTERNAL/);
  }
});

test("the choices are the ones the server knows, in a fixed order", () => {
  assert.deepEqual(W.TRAFFIC_CHOICES.map((c) => c.mode), ["keep", "multiply", "set"]);
  assert.deepEqual(W.SHAPE_CHOICES.map((c) => c.shape), ["keep", "steady", "ramp", "spike"]);
  assert.deepEqual(W.READ_SHARE_CHOICES.map((c) => c.share), ["keep", "mostly_reads", "balanced", "mostly_writes"]);
  assert.deepEqual(W.WHATIF_LIMITS, { multiply: { min: 0.1, max: 20 }, set: { min: 1, max: 10_000_000 } });
});

test("the note says the figures are estimates and nothing is saved, and never claims a measurement", () => {
  assert.match(W.WHATIF_NOTE, /estimates from a model, not measurements/);
  assert.match(W.WHATIF_NOTE, /Nothing is saved/);
  assert.doesNotMatch(W.WHATIF_NOTE, /verified|proven|guarantee/i);
});
