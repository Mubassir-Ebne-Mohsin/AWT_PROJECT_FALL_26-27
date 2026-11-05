const { test } = require("node:test");
const assert = require("node:assert/strict");
const m = require("../src/lib/admin-metrics.ts");

const snap = (iso, extra = {}) => ({ generatedAt: iso, ...extra });
const T0 = "2026-11-05T10:00:00.000Z";
const T1 = "2026-11-05T10:00:05.000Z";

test("backoff doubles from 5 seconds and stops at 40", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 9].map(m.nextDelay), [5000, 10000, 20000, 40000, 40000, 40000, 40000]);
  assert.equal(m.nextDelay(-3), 5000);
});

test("a good answer resets failures and records when it arrived", () => {
  let s = m.initialLive();
  s = m.onFailure(m.onFailure(s));
  assert.equal(s.failures, 2);
  s = m.onSuccess(s, snap(T0), 1000);
  assert.equal(s.failures, 0);
  assert.equal(s.lastGoodAt, 1000);
  assert.equal(s.data.generatedAt, T0);
});

test("an older snapshot that arrives late is ignored whole", () => {
  let s = m.onSuccess(m.initialLive(), snap(T1, { tag: "new" }), 2000);
  const after = m.onSuccess(s, snap(T0, { tag: "old" }), 3000);
  assert.equal(after, s);
  assert.equal(after.data.tag, "new");
  assert.equal(after.lastGoodAt, 2000);
});

test("a snapshot from the same instant is accepted (the server shares one cached read)", () => {
  const s = m.onSuccess(m.initialLive(), snap(T0, { tag: "a" }), 1000);
  const next = m.onSuccess(m.onFailure(s), snap(T0, { tag: "b" }), 2000);
  assert.equal(next.data.tag, "b");
  assert.equal(next.failures, 0);
});

test("status: live, paused by hand, paused by a hidden tab, reconnecting, then stale after a minute", () => {
  let s = m.onSuccess(m.initialLive(), snap(T0), 0);
  assert.equal(m.liveStatus(s, 1000), "live");
  assert.equal(m.liveStatus(m.withPaused(s, true), 1000), "paused");
  assert.equal(m.liveStatus(m.withHidden(s, true), 1000), "paused");
  s = m.onFailure(s);
  assert.equal(m.liveStatus(s, 10000), "reconnecting");
  assert.equal(m.liveStatus(s, m.STALE_AFTER_MS), "reconnecting");
  assert.equal(m.liveStatus(s, m.STALE_AFTER_MS + 1), "stale");
  assert.equal(m.liveStatus(m.onFailure(m.initialLive()), 5), "reconnecting", "never had data: still only reconnecting");
});

test("polling runs only when neither paused nor hidden", () => {
  const s = m.initialLive();
  assert.equal(m.shouldPoll(s), true);
  assert.equal(m.shouldPoll(m.withPaused(s, true)), false);
  assert.equal(m.shouldPoll(m.withHidden(s, true)), false);
  assert.equal(m.shouldPoll(m.withHidden(m.withPaused(s, true), false)), false);
});

test("a tab coming back fetches at once when nothing recent is on screen", () => {
  const s = m.onSuccess(m.initialLive(), snap(T0), 1000);
  assert.equal(m.needsFetchNow(m.initialLive(), 1), true);
  assert.equal(m.needsFetchNow(s, 1000 + m.POLL_MS - 1), false);
  assert.equal(m.needsFetchNow(s, 1000 + m.POLL_MS), true);
});

test("status wording says how old the numbers are", () => {
  let s = m.onSuccess(m.initialLive(), snap(T0), 0);
  s = m.onFailure(s);
  assert.match(m.statusDetail(s, "reconnecting", 20000), /20 s ago/);
  assert.match(m.statusDetail(s, "stale", 150000), /2 min old and may be wrong/);
  assert.match(m.statusDetail(m.withPaused(s, true), "paused", 0), /not changing/);
  assert.match(m.statusDetail(m.withHidden(s, true), "paused", 0), /background/);
});

test("compact keeps small numbers whole and shortens large ones without overflow", () => {
  assert.deepEqual([0, 7, 9999, 10000, 12345, 100000, 999999, 1000000, 2500000, 12000000].map(m.compact), ["0", "7", "9,999", "10k", "12.3k", "100k", "1M", "1M", "2.5M", "12M"]);
  assert.equal(m.compact(NaN), "–");
});

test("ageText", () => {
  assert.deepEqual([0, 59, 60, 119, 3600, 3660, 7500].map(m.ageText), ["0 s", "59 s", "1 min", "1 min", "1 h", "1 h 1 min", "2 h 5 min"]);
});

test("bucket labels count hours from the oldest bucket and wrap at midnight UTC", () => {
  assert.equal(m.bucketLabel("2026-11-04T23:00:00.000Z", 0), "23:00 UTC");
  assert.equal(m.bucketLabel("2026-11-04T23:00:00.000Z", 1), "00:00 UTC");
  assert.equal(m.bucketLabel("2026-11-04T11:00:00.000Z", 23), "10:00 UTC");
  assert.equal(m.utcTime("2026-11-05T10:01:02.345Z"), "10:01:02 UTC");
});

test("percent never divides by zero; bar heights keep small non-zero values visible", () => {
  assert.equal(m.percent(1, 0), 0);
  assert.equal(m.percent(1, 3), 33);
  assert.deepEqual(m.barHeights([0, 0]), [0, 0]);
  assert.deepEqual(m.barHeights([0, 1, 100]), [0, 0.06, 1]);
  assert.deepEqual(m.barHeights([5, 10]), [0.5, 1]);
});

test("alerts are sorted most serious first and every key has a sentence", () => {
  const sorted = m.sortedAlerts([
    { key: "cache_down", level: "warning" },
    { key: "queue_backlog", level: "critical" },
    { key: "ai_quota_near", level: "warning" },
  ]);
  assert.deepEqual(sorted.map((a) => a.key), ["queue_backlog", "ai_quota_near", "cache_down"]);
  for (const key of ["queue_backlog", "run_failures_high", "ai_failures_high", "ai_quota_near", "database_slow", "cache_down"]) assert.ok(m.alertText(key).length > 10);
});

test("the wall display moves to the next panel every ten seconds, wraps, and stands still when motion is reduced", () => {
  assert.deepEqual([0, 9, 10, 19, 20, 29, 30, 45].map((t) => m.wallPanel(t, 3, true)), [0, 0, 1, 1, 2, 2, 0, 1]);
  assert.deepEqual([0, 10, 25, 999].map((t) => m.wallPanel(t, 3, false)), [0, 0, 0, 0]);
});

test("every component type and AI outcome has a plain name", () => {
  assert.equal(Object.keys(m.COMPONENT_TEXT).length, 12);
  assert.equal(Object.keys(m.OUTCOME_TEXT).length, 6);
  for (const text of [...Object.values(m.COMPONENT_TEXT), ...Object.values(m.OUTCOME_TEXT)]) assert.ok(text.length > 2);
});
