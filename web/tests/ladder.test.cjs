const { test } = require("node:test");
const assert = require("node:assert/strict");
const { ApiError } = require("../src/lib/api/errors.ts");
const L = require("../src/lib/ladder.ts");

// The words of the load ladder. They describe only what the server reported, and never turn a missing row into a pass.
const m = (verdict, p95 = 100, errorRate = 0) => ({ verdict, p95, errorRate, maxRho: 1 });
const rung = (multiplier, verdict, over = {}) => ({ multiplier, rps: 500 * multiplier, status: "OK", measure: m(verdict), limiter: null, ...over });
const gap = (multiplier, status) => ({ multiplier, rps: 500 * multiplier, status, measure: null, limiter: null });
const ladder = (...verdicts) => [1, 2, 5, 10].slice(0, verdicts.length).map((x, i) => rung(x, verdicts[i]));

test("loads and rates are written plainly", () => {
  assert.equal(L.loadLabel(1), "Now");
  assert.equal(L.loadLabel(2), "2× load");
  assert.equal(L.loadLabel(10), "10× load");
  assert.equal(L.rate(500), "500");
  assert.equal(L.rate(1234567.891), "1,234,567.89");
});

test("a row's result says what happened, and says so when it could not be known", () => {
  assert.equal(L.resultText(rung(2, "pass")), "passes");
  assert.equal(L.resultText(rung(2, "strained")), "is strained");
  assert.equal(L.resultText(rung(2, "fail")), "fails");
  assert.equal(L.resultText(gap(5, "TOO_LARGE")), "Beyond the model's limit");
  assert.equal(L.resultText(gap(5, "UNAVAILABLE")), "Could not be checked");
  assert.equal(L.resultText({ multiplier: 5, rps: 1, status: "OK", measure: null, limiter: null }), "Could not be checked");
});

test("a design that passes everywhere says how far it was checked", () => {
  assert.equal(L.headline(ladder("pass", "pass", "pass", "pass")), "Passes at every load checked, up to 10× load (5,000 rps).");
  assert.equal(L.headline(ladder("pass")), "Passes at the recorded load.");
});

test("it says where a design stops passing and where it fails", () => {
  assert.equal(L.headline(ladder("pass", "pass", "strained", "fail")), "Passes up to 2× load (1,000 rps), then is strained at 5× load (2,500 rps), and fails at 10× load.");
  assert.equal(L.headline(ladder("pass", "strained", "strained", "strained")), "Passes up to the recorded load, then is strained at 2× load (1,000 rps).");
  assert.equal(L.headline(ladder("pass", "pass", "fail", "fail")), "Passes up to 2× load (1,000 rps), then fails at 5× load (2,500 rps).");
  assert.equal(L.headline(ladder("pass", "pass", "pass", "fail")), "Passes up to 5× load (2,500 rps), then fails at 10× load (5,000 rps).");
});

test("a design that is already in trouble says so, and does not talk about higher load as if it were fine", () => {
  assert.equal(L.headline(ladder("fail", "fail", "fail", "fail")), "Already fails at the recorded load.");
  assert.equal(L.headline(ladder("strained", "strained", "fail", "fail")), "Already strained at the recorded load.");
});

test("a rate the model does not accept is named as such, not described as a pass or a failure", () => {
  const rungs = [rung(1, "pass"), rung(2, "pass"), gap(5, "TOO_LARGE"), gap(10, "TOO_LARGE")];
  assert.equal(L.headline(rungs), "Passes at every load checked, up to 2× load (1,000 rps). 5× load and 10× load would be beyond the largest rate the model accepts.");
});

test("a row that could not be checked is never read as a pass", () => {
  const rungs = [rung(1, "pass"), rung(2, "pass"), gap(5, "UNAVAILABLE"), rung(10, "fail")];
  const text = L.headline(rungs);
  assert.match(text, /^Passes up to 2× load \(1,000 rps\), then fails at 10× load \(5,000 rps\)\./);
  assert.match(text, /5× load could not be checked, so nothing is said about it\.$/);
  assert.match(L.headline([rung(1, "pass"), gap(2, "UNAVAILABLE"), gap(5, "UNAVAILABLE"), gap(10, "UNAVAILABLE")]), /2× load and 5× load and 10× load could not be checked, so nothing is said about them\.$/);
});

test("with nothing known it says so", () => {
  assert.equal(L.headline([]), "No load could be checked.");
  assert.equal(L.headline([gap(2, "UNAVAILABLE")]), "No load could be checked.");
});

test("failures are explained with what to do, without leaking a server message", () => {
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
    const text = L.ladderError(error);
    assert.match(text, pattern);
    assert.doesNotMatch(text, /server detail|boom/);
  }
});

test("the note says only the rate changes, that the figures are a model's estimates, and that nothing is saved", () => {
  assert.match(L.LADDER_NOTE, /same traffic shape, bursts and targets; only the average request rate changes/);
  assert.match(L.LADDER_NOTE, /estimates from a model, not measurements of real infrastructure/);
  assert.match(L.LADDER_NOTE, /Nothing is saved/);
});
