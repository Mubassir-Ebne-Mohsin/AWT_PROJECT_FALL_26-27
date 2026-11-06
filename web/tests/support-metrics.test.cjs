const { test } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { JSDOM } = require("jsdom");
const {
  SupportMetrics,
} = require("../src/components/admin/support-metrics.tsx");
const blank = () => ({
  total: 0,
  unresolved: 0,
  responded: 0,
  medianFirstResponseMs: null,
  byCategory: {
    bug: 0,
    wrong_result: 0,
    account: 0,
    performance: 0,
    idea: 0,
    other: 0,
  },
  byStatus: { open: 0, in_progress: 0, waiting: 0, resolved: 0 },
});
const render = (metrics) =>
  new JSDOM(
    renderToStaticMarkup(React.createElement(SupportMetrics, { metrics })),
  ).window.document;
const value = (d, id) => d.querySelector(`[data-testid="${id}"]`).textContent;

test("Support metrics: no recorded replies is unavailable, and every closed category/status shows zero", () => {
  const d = render(blank());
  assert.equal(value(d, "support-first-response"), "No replies yet");
  assert.equal(value(d, "support-unresolved"), "0");
  assert.match(
    value(d, "support-response-samples"),
    /0 of 0 reports.*Internal notes do not count/,
  );
  assert.equal(
    d
      .querySelector('[aria-label="Reports by category"]')
      .querySelectorAll("tbody tr").length,
    6,
  );
  assert.equal(
    d
      .querySelector('[aria-label="Reports by status"]')
      .querySelectorAll("tbody tr").length,
    4,
  );
  assert.ok(
    [...d.querySelectorAll("tbody td")].every((c) => c.textContent === "0"),
  );
});
test("Support metrics: exact counts, response denominator and readable median agree with supplied aggregates", () => {
  const m = blank();
  Object.assign(m, {
    total: 6,
    unresolved: 4,
    responded: 4,
    medianFirstResponseMs: 90000,
  });
  m.byCategory.bug = 6;
  m.byStatus.open = 2;
  m.byStatus.waiting = 2;
  m.byStatus.resolved = 2;
  const d = render(m);
  assert.equal(value(d, "support-total"), "6");
  assert.equal(value(d, "support-unresolved"), "4");
  assert.equal(value(d, "support-first-response"), "1.5 min");
  assert.match(value(d, "support-response-samples"), /4 of 6 reports/);
  assert.match(d.body.textContent, /Unanswered reports are excluded/);
  const row = [
    ...d.querySelectorAll('[aria-label="Reports by status"] tbody tr'),
  ].find((r) => r.textContent.includes("Waiting for the reporter"));
  assert.equal(row.querySelector("td").textContent, "2");
});
test("Support metrics: zero-duration reply is real data and private extra fields are never rendered", () => {
  const m = blank();
  Object.assign(m, {
    total: 1,
    responded: 1,
    medianFirstResponseMs: 0,
    title: "Secret canary",
    reporter: "private@example.test",
  });
  m.byCategory.bug = 1;
  m.byCategory.extra = "Secret canary";
  const d = render(m);
  assert.equal(value(d, "support-first-response"), "0 ms");
  assert.doesNotMatch(d.body.textContent, /Secret canary|private@example/);
});
