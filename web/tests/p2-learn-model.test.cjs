const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const M = require("../src/lib/learn-model.ts");

const root = path.resolve(__dirname, "../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const fixtures = JSON.parse(read("docs/contracts/learn-fixtures.json"));
const engine = (p) => read("nest-boilerplate/nest-boilerplate/src/modules/simulation/engine/" + p).replace(/\r\n/g, "\n");

// The model must give the engine's numbers. Same arithmetic, so the tolerance is tiny.
const close = (actual, expected, label) => {
  if (expected === "Infinity") return assert.equal(actual, Infinity, label);
  if (typeof expected === "string") return assert.equal(actual, expected, label);
  assert.ok(Number.isFinite(actual) || actual === expected, label + " is finite: " + actual);
  const tol = 1e-9 * Math.max(1, Math.abs(expected));
  assert.ok(Math.abs(actual - expected) <= tol, `${label}: got ${actual}, engine says ${expected}`);
};
const sameNode = (got, want, label) => {
  for (const k of ["peak", "cap", "rho", "S", "Wq", "T", "servers"]) close(got[k], want[k], `${label}.${k}`);
  assert.equal(got.status, want.status, `${label}.status`);
};

test("P2 model: the fixtures are real, cover every demo, and carry the engine's constants", () => {
  for (const k of ["utilization", "queues", "percentiles", "caching", "replicas", "loadBalancing", "cdn", "regions"]) assert.ok(fixtures.cases[k].length >= 6, k + " has cases");
  assert.equal(fixtures.cases.utilization.length, 63);
  assert.equal(fixtures.cases.queues.length, 54);
  assert.equal(fixtures.constants.statusOk, M.STATUS.ok);
  assert.equal(fixtures.constants.statusFail, M.STATUS.fail);
  assert.equal(fixtures.constants.replicationCost, M.REPLICATION_COST);
  assert.equal(fixtures.constants.burstSeconds, M.BURST_SECONDS);
  assert.deepEqual(fixtures.constants.rtt, M.RTT_MS);
});

test("P2 model: utilization, status and waiting time equal the engine on every fixture, including idle and saturated", () => {
  for (const c of fixtures.cases.utilization) sameNode(M.utilization(c.input), c.expected, JSON.stringify(c.input));
  const states = new Set(fixtures.cases.utilization.map((c) => c.expected.status));
  assert.deepEqual([...states].sort(), ["fail", "idle", "ok", "warn"], "the grid reaches every status");
});

test("P2 model: queue backlog, lag, overflow and state equal the engine, for clear, absorbing and growing queues", () => {
  for (const c of fixtures.cases.queues) {
    const { rps, burst, workers, maxDepth, durationMin } = c.input;
    const got = M.queue({ rps, burst, drain: workers * M.WORKER_CAPACITY, maxDepth, durationMin });
    for (const k of ["arrival", "peakArrival", "drain", "backlog", "lag", "overflow"]) close(got[k], c.expected[k], `${JSON.stringify(c.input)}.${k}`);
    assert.equal(got.state, c.expected.state);
  }
  assert.deepEqual([...new Set(fixtures.cases.queues.map((c) => c.expected.state))].sort(), ["absorbing", "clear", "growing"]);
});

test("P2 model: p50, p95 and p99 of the fast/slow mixture equal the engine", () => {
  for (const c of fixtures.cases.percentiles) {
    const got = M.percentiles(c.input);
    for (const k of ["p50", "p95", "p99"]) close(got[k], c.expected[k], `${JSON.stringify(c.input)}.${k}`);
  }
});

test("P2 model: cache misses, read replicas, balancing and CDN loads equal the engine, including an overloaded primary", () => {
  for (const c of fixtures.cases.caching) {
    const got = M.caching(c.input);
    sameNode(got.db, c.expected.db, "cache " + JSON.stringify(c.input));
    close(got.dbReads, c.expected.db.reads, "dbReads");
    close(got.dbWrites, c.expected.db.writes, "dbWrites");
  }
  let overloaded = 0;
  for (const c of fixtures.cases.replicas) {
    const got = M.replicas(c.input);
    sameNode(got.primary, c.expected.primary, "primary " + JSON.stringify(c.input));
    if (c.expected.replica) sameNode(got.replica, c.expected.replica, "replica " + JSON.stringify(c.input));
    else assert.equal(got.replica, null);
    if (c.expected.primary.rho > 1) overloaded += 1;
  }
  assert.ok(overloaded >= 4, "the replica grid includes an overloaded primary");
  for (const c of fixtures.cases.loadBalancing) {
    const got = M.loadBalancing(c.input);
    sameNode(got.server, c.expected.server, "lb " + JSON.stringify(c.input));
    close(got.perServer, c.expected.server.reads, "perServer");
  }
  for (const c of fixtures.cases.cdn) {
    const got = M.cdn(c.input);
    sameNode(got.origin, c.expected.origin, "cdn " + JSON.stringify(c.input));
    close(got.originReads, c.expected.origin.reads, "originReads");
  }
});

test("P2 model: the region round trip equals the engine for every pair, and is zero within a region", () => {
  assert.equal(fixtures.cases.regions.length, 9);
  for (const c of fixtures.cases.regions) assert.equal(M.roundTripMs(c.input.from, c.input.to), c.expected.rtt, JSON.stringify(c.input));
  assert.equal(M.roundTripMs("us-east", "us-east"), 0);
  assert.equal(M.roundTripMs(null, "eu-west"), 0);
  assert.equal(M.roundTripMs("us-east", "eu-west"), M.roundTripMs("eu-west", "us-east"));
});

test("P2 model: the constants and component figures it quotes are the ones in the engine's source", () => {
  const catalog = engine("catalog.ts");
  const block = (name) => catalog.split(new RegExp(`\\n  ${name}: \\{`))[1].split(/\n  \w+: \{/)[0];
  const num = (b, key) => Number(new RegExp(key + ": ([0-9.]+)").exec(b)[1]);
  for (const name of ["app", "db", "replica"]) {
    const b = block(name);
    assert.equal(M.COMPONENT[name].capacity, num(b, "capacity"), name + " capacity");
    assert.equal(M.COMPONENT[name].latency, num(b, "latency"), name + " latency");
  }
  assert.equal(M.WORKER_CAPACITY, num(block("worker"), "capacity"));
  assert.equal(M.CDN_DEFAULT_HIT, Number(/hitRatio: ([0-9.]+)/.exec(block("cdn"))[1]));
  assert.equal(M.CACHE_DEFAULT_HIT, Number(/hitRatio: ([0-9.]+)/.exec(block("cache"))[1]));
  assert.match(catalog, new RegExp(`REPLICATION_COST = ${M.REPLICATION_COST};`));
  assert.match(catalog, new RegExp(`BURST_SECONDS = ${M.BURST_SECONDS};`));
  assert.match(catalog, new RegExp(`STATUS = \\{ ok: ${M.STATUS.ok}, fail: ${M.STATUS.fail} \\}`));
  const dist = engine("distributions.ts");
  assert.match(dist, new RegExp(`Math\\.min\\(rho, ${M.SATURATION_CLAMP}\\)`));
  assert.match(dist, new RegExp(`rho > ${M.SATURATION_CLAMP}`));
  assert.match(dist, /S \* 25 \* Math\.min\(1, \(rho - 0\.985\) \/ 0\.15\)/);
  assert.match(catalog, /\|\| 120;/, "unknown region pairs fall back to 120 ms");
  assert.equal(M.UNKNOWN_RTT_MS, 120);
});

test("P2 model: behaviour the lessons rely on holds across the demo ranges (monotonic, finite, bounded)", () => {
  let last = -1;
  for (let rps = 0; rps <= 2000; rps += 50) {
    const s = M.utilization({ rps, burst: 1.5, replicas: 1, capacity: 600, latency: 22 });
    assert.ok(Number.isFinite(s.T) && s.T >= s.S, "latency finite and at least the service time");
    assert.ok(s.rho >= last, "utilization never falls as load rises");
    last = s.rho;
  }
  let prev = Infinity;
  for (let hit = 0; hit <= 1.0001; hit += 0.1) {
    const c = M.caching({ rps: 1000, readRatio: 0.8, hit: Math.min(hit, 1), burst: 1.5 });
    assert.ok(c.db.peak <= prev + 1e-9, "a better hit ratio never raises database load");
    prev = c.db.peak;
  }
  assert.equal(M.caching({ rps: 1000, readRatio: 1, hit: 1, burst: 1.5 }).db.status, "idle");
  const p = (share) => M.percentiles({ fast: 20, slow: 400, share });
  assert.ok(p(0.05).p95 > 2 * p(0).p95, "5% slow requests more than double p95");
  assert.ok(p(0.05).p99 > 10 * p(0).p99, "and move p99 by more than ten times");
  assert.ok(Math.abs(p(0.05).p50 - p(0).p50) < 2, "while p50 barely moves");
  assert.equal(M.queue({ rps: 0, burst: 2, drain: 250, maxDepth: 1000, durationMin: 10 }).state, "idle");
  assert.equal(M.queue({ rps: 100, burst: 1, drain: 0, maxDepth: 1000, durationMin: 10 }).lag, Infinity);
  for (const n of [1, 2, 4, 8]) assert.ok(M.loadBalancing({ rps: 1000, servers: n, burst: 1 }).perServer * n - 1000 < 1e-9);
});
