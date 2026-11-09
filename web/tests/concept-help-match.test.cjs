const { test } = require("node:test");
const assert = require("node:assert/strict");
const H = require("../src/lib/concept-help/index.ts");
const { rank, MIN_SCORE } = require("../src/lib/concept-help/match.ts");
const { ROUTES } = require("../src/lib/routes.ts");

const E = H.ENTRIES;

test("ids are unique and every entry has the parts the drawer needs", () => {
  assert.equal(new Set(E.map((e) => e.id)).size, E.length);
  assert.ok(E.length >= 100, `only ${E.length} entries`);
  for (const e of E) {
    assert.ok(e.title && e.a && e.q.length >= 2 && e.kw.length >= 2, e.id);
    assert.ok(e.a.split(/\s+/).length <= 110, `${e.id} answer is too long`);
    assert.ok((e.steps?.length ?? 0) <= 4, e.id);
  }
});

test("every related id exists, and every link goes to a real route", () => {
  const patterns = ROUTES.map((r) => new RegExp("^" + r.path.replace(/:[^/]+/g, "[^/]+") + "$"));
  for (const e of E) {
    for (const id of e.rel ?? []) assert.ok(H.entryById(id), `${e.id} -> rel ${id}`);
    for (const l of e.links ?? []) assert.ok(patterns.some((p) => p.test(l.href)), `${e.id} -> ${l.href}`);
  }
});

test("each entry's own example questions find that entry (top 3, and top 1 for most)", () => {
  let top1 = 0, total = 0;
  const miss = [];
  for (const e of E) for (const q of e.q) {
    total++;
    const r = rank(E, q).filter((x) => x.score >= MIN_SCORE);
    const i = r.findIndex((x) => x.entry.id === e.id);
    if (i === 0) top1++;
    if (i < 0 || i > 2) miss.push(`${e.id}: ${q}`);
  }
  assert.deepEqual(miss, []);
  assert.ok(top1 / total >= 0.85, `top-1 self retrieval ${top1}/${total}`);
});

test("answers keep the honest wording: no measurement or design-knowledge claims, no AI outside the AI topics", () => {
  for (const e of E) {
    const t = H.flatten(e);
    assert.doesNotMatch(t, /I (have )?(looked|checked|analy[sz]ed)|your design (is|has|will)|guarantee|verified|proven|phase \d|prototype/i, e.id);
    if (!e.id.startsWith("ai") && e.id !== "describe-words") assert.doesNotMatch(t.replace(/no AI/g, ""), /\bAI\b/, e.id);
  }
});

test("numbers quoted in answers match the engine's documented defaults", () => {
  const all = E.map((e) => e.a).join(" ");
  assert.match(all, /75 ms/);
  assert.match(all, /190 ms/);
  assert.match(H.entryById("limits-bounds").a, /50 components and 200 connections/);
});

test("off-topic questions fall back to nearest topics; empty input does not crash", () => {
  for (const q of ["What is the meaning of life?", "recipe for pasta", "asdf qwer", ""]) {
    const r = H.reply(q);
    assert.equal(r.kind, "fallback", q);
    assert.match(r.text, /fixed set of questions/);
  }
});

test("typos and screen context still find the right topic", () => {
  assert.equal(H.reply("what is utilisation").entry?.id, "utilization");
  assert.equal(H.reply("how do replikas help").entry?.id, "replica");
  assert.equal(H.reply("what is p95").entry?.id, "p95");
});

// Questions written independently of the entries' own wording. Measured, not tuned to 100%.
const INDEPENDENT = [
  ["why is my latency so high at the tail", "p95"], ["whats the difference between average and p95", "avg-vs-p95"],
  ["my database is at 100 percent", "utilization"], ["how do i make the database faster", "what-first"],
  ["can i add a cdn", "comp-cdn"], ["what does a load balancer do", "comp-lb"], ["is redis worth adding", "cache"],
  ["how do i share my design with a teacher", "reviewers"], ["can i download my result as pdf", "report-pdf"],
  ["how do i go back to an earlier version", "versions"], ["why did my run fail", "run-failed"],
  ["i forgot my password", "forgot-password"], ["what is an slo", "g-slo"], ["does it simulate retries", "retries"],
  ["what is a single point of failure", "single-point"], ["how big can my design be", "limits-bounds"],
  ["what is the load ladder", "ladder"], ["how do i import json", "import-json"], ["how do i see old reports", null],
  ["is ai making up the numbers", "ai-honest"], ["what is an api gateway", "comp-gateway"], ["what happens at 10x traffic", "ladder"],
  ["what is a worker", "comp-worker"], ["what does the burst multiplier do", "burst"], ["how long should the test run", "duration"],
];
test("independent questions: report the hit rate", () => {
  let top1 = 0, top3 = 0, n = 0;
  const bad = [];
  for (const [q, id] of INDEPENDENT) {
    if (!id) continue;
    n++;
    const r = rank(E, q).filter((x) => x.score >= MIN_SCORE).map((x) => x.entry.id);
    if (r[0] === id) top1++;
    if (r.slice(0, 3).includes(id)) top3++; else bad.push(`${q} -> ${r.slice(0, 3).join(",")} (want ${id})`);
  }
  console.log(`independent: top-1 ${top1}/${n}, top-3 ${top3}/${n}`, bad);
  assert.ok(top3 / n >= 0.7);
});
