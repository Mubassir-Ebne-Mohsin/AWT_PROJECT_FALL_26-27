const { test } = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_QUERY, queryFromParams, paramsFromQuery, isFiltered, resultLabel } = require("../src/lib/library-presentation.ts");
const { libraryPath, LIBRARY_PAGE_SIZE } = require("../src/lib/api/library.ts");

const run = (over = {}) => ({ id: "r", kind: "simulation", status: "completed", designRevision: 3, createdAt: "2026-01-01T00:00:00.000Z", verdict: "pass", p95: 100, ...over });

test("M15.5 list: the plain URL is the default query and defaults are never written back", () => {
  assert.deepEqual(queryFromParams(new URLSearchParams("")), DEFAULT_QUERY);
  assert.equal(paramsFromQuery(DEFAULT_QUERY), "");
});

test("M15.5 list: filters round-trip through the URL", () => {
  const q = { q: "api", sort: "name", verdict: "fail", archived: "all", page: 3 };
  assert.deepEqual(queryFromParams(new URLSearchParams(paramsFromQuery(q))), q);
});

test("M15.5 list: unknown or hostile URL values fall back to defaults instead of reaching the API", () => {
  const q = queryFromParams(new URLSearchParams("sort=password&verdict=%27%3B--&archived=nope&page=-4"));
  assert.equal(q.sort, "updated");
  assert.equal(q.verdict, "");
  assert.equal(q.archived, "active");
  assert.equal(q.page, 1);
  assert.equal(queryFromParams(new URLSearchParams("page=2.5")).page, 1);
  assert.equal(queryFromParams(new URLSearchParams("q=" + "x".repeat(300))).q.length, 100);
});

test("M15.5 list: the request carries every filter, encoded, with the page size", () => {
  const path = libraryPath({ q: "a&b %", sort: "lastRun", verdict: "none", archived: "archived", page: 2 });
  const p = new URL("http://x" + path).searchParams;
  assert.equal(path.startsWith("/library/designs?"), true);
  assert.equal(p.get("q"), "a&b %");
  assert.equal(p.get("sort"), "lastRun");
  assert.equal(p.get("verdict"), "none");
  assert.equal(p.get("archived"), "archived");
  assert.equal(p.get("page"), "2");
  assert.equal(p.get("pageSize"), String(LIBRARY_PAGE_SIZE));
  assert.equal(new URL("http://x" + libraryPath(DEFAULT_QUERY)).searchParams.has("verdict"), false);
});

test("M15.5 list: filtered state ignores sort and page but counts search, result and archive filters", () => {
  assert.equal(isFiltered(DEFAULT_QUERY), false);
  assert.equal(isFiltered({ ...DEFAULT_QUERY, sort: "name", page: 4 }), false);
  assert.equal(isFiltered({ ...DEFAULT_QUERY, q: "  " }), false);
  assert.equal(isFiltered({ ...DEFAULT_QUERY, q: "x" }), true);
  assert.equal(isFiltered({ ...DEFAULT_QUERY, verdict: "pass" }), true);
  assert.equal(isFiltered({ ...DEFAULT_QUERY, archived: "all" }), true);
});

test("M15.5 list: the latest result is described honestly, and an earlier revision is never shown as current", () => {
  assert.deepEqual(resultLabel(null, 3), { label: "No result yet", tone: "" });
  assert.deepEqual(resultLabel(run(), 3), { label: "Passing", tone: "ok" });
  assert.deepEqual(resultLabel(run({ verdict: "strained" }), 3), { label: "Strained", tone: "warn" });
  assert.deepEqual(resultLabel(run({ verdict: "fail" }), 3), { label: "Missing target", tone: "fail" });
  assert.deepEqual(resultLabel(run(), 4), { label: "Earlier revision · Passing", tone: "" });
  assert.equal(resultLabel(run({ status: "pending", verdict: null }), 3).label, "Test running");
  assert.equal(resultLabel(run({ status: "pending", kind: "limits", verdict: null }), 3).label, "Limits search running");
  assert.deepEqual(resultLabel(run({ status: "failed", verdict: null }), 3), { label: "Calculation failed", tone: "fail" });
});
