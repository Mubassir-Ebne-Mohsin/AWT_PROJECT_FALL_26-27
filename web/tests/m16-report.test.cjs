const { test } = require("node:test");
const assert = require("node:assert/strict");
const { runStatement, limitsStatement, noteScopeText, trafficRows, verdictSentence, reportFileTitle } = require("../src/lib/report-presentation.ts");

const run = (over = {}) => ({
  id: "r", kind: "simulation", status: "completed", designRevision: 3, matchesRevision: true, engineVersion: "e1",
  createdAt: "2026-01-01T10:00:00.000Z", traffic: {}, simulation: {}, failure: null, ...over,
});

test("M16 report: a missing result is stated, not filled in", () => {
  const s = runStatement(null, 4);
  assert.match(s.text, /No test result has been recorded for revision 4/);
  assert.equal(s.warn, false);
});

test("M16 report: a result recorded for another revision is never presented as this revision's", () => {
  const s = runStatement(run({ designRevision: 2, matchesRevision: false }), 4);
  assert.equal(s.warn, true);
  assert.match(s.text, /recorded for revision 2, not revision 4/);
  assert.match(s.text, /describe revision 2/);
  assert.match(runStatement(run(), 3).text, /^Recorded for revision 3 on /);
  assert.equal(runStatement(run(), 3).warn, false);
});

test("M16 report: running, failed and Limits runs are described for what they are", () => {
  assert.match(runStatement(run({ status: "pending" }), 3).text, /still running/);
  const failed = runStatement(run({ status: "failed", failure: { code: "TIMEOUT", message: "took too long" } }), 3);
  assert.equal(failed.warn, true);
  assert.match(failed.text, /failed \(took too long\)\. No numbers were produced/);
  assert.match(runStatement(run({ kind: "limits" }), 3).text, /not a simulation/);
});

test("M16 report: Limits is always disclosed, and a missing search states no breaking point", () => {
  assert.match(limitsStatement(null), /was not run for this revision, so this report states no breaking point/);
  const found = { runId: "x", createdAt: "x", state: "found", passingRps: 1200, failingRps: 1500, headroom: 1.2, firstComponent: "Database", cause: "latency" };
  const text = limitsStatement(found);
  assert.match(text, /passes at 1,200 requests per second and fails at 1,500/);
  assert.match(text, /Database saturates first \(latency\)/);
  assert.match(limitsStatement({ ...found, cause: "both" }), /\(latency and errors\)/);
  assert.match(limitsStatement({ ...found, state: "failsAtMinimumLoad", passingRps: null, failingRps: null, headroom: null }), /already fails its targets at the lowest load tested/);
  const open = limitsStatement({ ...found, state: "notReachedWithinRange", passingRps: null, failingRps: null, headroom: 3.5, firstComponent: null, cause: null });
  assert.match(open, /did not fail within the tested range; at least 3\.5x headroom \(a lower bound\)/);
  assert.doesNotMatch(limitsStatement({ ...found, state: "notReachedWithinRange", headroom: null }), /headroom/);
});

test("M16 report: verdicts, note scopes, traffic rows and the print title use plain wording", () => {
  assert.equal(verdictSentence("pass"), "Meets its targets");
  assert.equal(verdictSentence("fail"), "Misses its targets");
  assert.match(verdictSentence("strained"), /^Strained/);
  assert.equal(noteScopeText("all"), "All notes for this design.");
  assert.equal(noteScopeText("decisions"), "Decision notes only.");
  assert.equal(noteScopeText("none"), "Notes are not included.");
  const rows = Object.fromEntries(trafficRows({ preset: "custom", rps: 500, burst: 1.5, readRatio: 0.8, sloP95: 300, errorBudget: 0.01, durationMin: 10, shape: "steady" }));
  assert.equal(rows["Requests per second"], "500");
  assert.equal(rows["Reads"], "80%");
  assert.equal(rows["Error budget"], "1%");
  assert.equal(rows["p95 latency target"], "300 ms");
  assert.equal(reportFileTitle({ name: "Shop", revision: 7 }), "Shop - revision 7 report");
});
