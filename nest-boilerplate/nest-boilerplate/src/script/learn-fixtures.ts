import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { simulate } from "@/modules/simulation/engine/simulate";
import { quantile, toLogn } from "@/modules/simulation/engine/distributions";
import { BURST_SECONDS, REPLICATION_COST, RTT, STATUS, rtt } from "@/modules/simulation/engine/catalog";
import type { Design, EngineNode, Simulation, Traffic } from "@/modules/simulation/engine/types";

/**
 * P2 Learn: the numbers the browser demos must reproduce. Every value below is produced by running the REAL simulator
 * (`simulate`, `quantile`, `rtt`) on a tiny design, so the demos in the web app are checked against the engine and
 * not against a copy of its formulas. Regenerate with `pnpm fixtures:learn`; the spec fails if this file is stale.
 */

const traffic = (t: Partial<Traffic>): Traffic => ({ preset: "custom", rps: 500, burst: 1.5, readRatio: 1, sloP95: 300, errorBudget: 0.01, durationMin: 10, shape: "steady", ...t });
const node = (id: string, type: EngineNode["type"], props: Record<string, unknown> = {}): EngineNode => ({ id, type, label: id, x: 0, y: 0, props: props as EngineNode["props"] });
const chain = (nodes: EngineNode[], edges: Array<[string, string]>): Design => ({ nodes, edges: edges.map(([from, to], i) => ({ id: "e" + i, from, to })) });
const run = (design: Design, t: Traffic): Simulation => {
  const s = simulate(design, t);
  if (!s.ok) throw new Error("Learn fixture design is invalid: " + JSON.stringify(s.validation));
  return s;
};
const pick = (s: Simulation, id: string) => {
  const n = s.nodes.find((x) => x.id === id)!;
  return { peak: n.peak, cap: n.cap, rho: n.rho, status: n.status, S: n.S, Wq: n.Wq, T: n.T, servers: n.servers, reads: n.reads, writes: n.writes, async: n.async };
};

export function buildLearnFixtures() {
  const cases: Record<string, unknown[]> = {
    utilization: [],
    queues: [],
    percentiles: [],
    caching: [],
    replicas: [],
    loadBalancing: [],
    cdn: [],
    regions: [],
  };

  // Utilization: one app, a given number of replicas, steady load times a burst multiplier.
  for (const rps of [0, 50, 300, 500, 800, 1000, 3000])
    for (const burst of [1, 1.5, 3])
      for (const replicas of [1, 2, 4])
        for (const [capacity, latency] of [[600, 22]]) {
          const s = run(chain([node("c", "client"), node("a", "app", { replicas, capacity, latency })], [["c", "a"]]), traffic({ rps, burst }));
          cases.utilization.push({ input: { rps, burst, replicas, capacity, latency }, expected: pick(s, "a") });
        }

  // Queues: all writes go app -> queue -> workers; the workers' combined rate is what drains it. The app tier is sized
  // so it is never the limit: the demo is about the queue, and an overloaded app would shed work before it got there.
  for (const rps of [100, 500, 2000])
    for (const burst of [1, 2, 4])
      for (const workers of [1, 2, 8])
        for (const maxDepth of [1000, 500000]) {
          const s = run(
            chain([node("c", "client"), node("a", "app", { replicas: 30 }), node("q", "queue", { maxDepth }), node("w", "worker", { replicas: workers })], [["c", "a"], ["a", "q"], ["q", "w"]]),
            traffic({ rps, burst, readRatio: 0 }),
          );
          const q = s.queues.find((x) => x.id === "q")!;
          cases.queues.push({ input: { rps, burst, workers, maxDepth, durationMin: 10 }, expected: { arrival: q.arrival, peakArrival: q.peakArrival, drain: q.drain, backlog: q.backlog, lag: q.lag === Infinity ? "Infinity" : q.lag, overflow: q.overflow, state: q.state } });
        }

  // Percentiles: a fast path mixed with a slow one, read with the engine's own lognormal mixture.
  for (const [fast, slow] of [[20, 400], [20, 200], [50, 1000]])
    for (const share of [0, 0.01, 0.03, 0.05, 0.1, 0.2, 0.5, 1]) {
      const part = (p: number, m: number) => toLogn({ p, m, v: Math.pow(0.35 * m, 2), ok: 1 });
      const comps = [part(1 - share, fast), part(share, slow)].filter((c) => c.p > 0);
      cases.percentiles.push({ input: { fast, slow, share }, expected: { p50: quantile(comps, 0.5), p95: quantile(comps, 0.95), p99: quantile(comps, 0.99) } });
    }

  // Caching: reads that miss the cache reach the database; writes always do.
  for (const rps of [200, 1000])
    for (const readRatio of [0.8, 1])
      for (const hit of [0, 0.5, 0.8, 0.95, 1]) {
        const s = run(chain([node("c", "client"), node("a", "app", { replicas: 8 }), node("k", "cache", { hitRatio: hit }), node("d", "db")], [["c", "a"], ["a", "k"], ["a", "d"]]), traffic({ rps, readRatio, burst: 1.5 }));
        cases.caching.push({ input: { rps, readRatio, hit, burst: 1.5 }, expected: { db: pick(s, "d"), cache: pick(s, "k") } });
      }

  // Read replicas: reads are shared by the primary and its replicas; every replica also replays the writes.
  for (const rps of [200, 1000, 3000])
    for (const readRatio of [0.8, 0.95])
      for (const n of [0, 1, 2, 4]) {
        const nodes = [node("c", "client"), node("a", "app", { replicas: 8 }), node("d", "db")];
        const edges: Array<[string, string]> = [["c", "a"], ["a", "d"]];
        for (let i = 0; i < n; i++) {
          nodes.push(node("r" + i, "replica"));
          edges.push(["d", "r" + i]);
        }
        const s = run(chain(nodes, edges), traffic({ rps, readRatio, burst: 1.5 }));
        cases.replicas.push({ input: { rps, readRatio, replicas: n, burst: 1.5 }, expected: { primary: pick(s, "d"), replica: n > 0 ? pick(s, "r0") : null } });
      }

  // Load balancing: a balancer spreads the load evenly over identical servers.
  for (const rps of [300, 1200])
    for (const n of [1, 2, 3, 6]) {
      const nodes = [node("c", "client"), node("l", "lb")];
      const edges: Array<[string, string]> = [["c", "l"]];
      for (let i = 0; i < n; i++) {
        nodes.push(node("s" + i, "app", { replicas: 1 }));
        edges.push(["l", "s" + i]);
      }
      const s = run(chain(nodes, edges), traffic({ rps, burst: 1.5 }));
      cases.loadBalancing.push({ input: { rps, servers: n, burst: 1.5 }, expected: { server: pick(s, "s0"), lb: pick(s, "l") } });
    }

  // CDNs: cacheable reads are answered at the edge, so only misses and writes reach the origin.
  for (const rps of [500, 2000])
    for (const readRatio of [0.8, 1])
      for (const hit of [0, 0.3, 0.6, 0.9, 1]) {
        const s = run(chain([node("c", "client"), node("e", "cdn", { hitRatio: hit }), node("o", "app", { replicas: 8 })], [["c", "e"], ["e", "o"]]), traffic({ rps, readRatio, burst: 1.5 }));
        cases.cdn.push({ input: { rps, readRatio, hit, burst: 1.5 }, expected: { origin: pick(s, "o"), edge: pick(s, "e") } });
      }

  // Regions: the round trip added when a request crosses regions.
  const regions = ["us-east", "eu-west", "ap-south"] as const;
  for (const a of regions) for (const b of regions) cases.regions.push({ input: { from: a, to: b }, expected: { rtt: rtt(a, b) } });

  return {
    note: "Generated from the real simulator by `pnpm fixtures:learn`. Do not edit by hand.",
    constants: { statusOk: STATUS.ok, statusFail: STATUS.fail, replicationCost: REPLICATION_COST, burstSeconds: BURST_SECONDS, rtt: RTT },
    cases,
  };
}

/**
 * Same structure and strings, numbers equal within a tiny relative tolerance. V8 can return a last-digit different
 * Math.pow from the interpreter and from optimized code, so the same engine writes slightly different digits in
 * different processes; a byte comparison would fail for no real reason.
 */
export function fixturesMatch(a: unknown, b: unknown, rel = 1e-9): boolean {
  if (typeof a === "number" && typeof b === "number") return a === b || Math.abs(a - b) <= rel * Math.max(1, Math.abs(a), Math.abs(b));
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => fixturesMatch(x, b[i], rel));
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
    return ka.length === kb.length && ka.every((k, i) => k === kb[i] && fixturesMatch((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], rel));
  }
  return a === b;
}

const destination = resolve(__dirname, "../../../../docs/contracts/learn-fixtures.json");
export const learnFixturesText = () => JSON.stringify(buildLearnFixtures(), null, 2) + "\n";

if (require.main === module) {
  const output = learnFixturesText();
  if (process.argv.includes("--check")) {
    if (!fixturesMatch(JSON.parse(readFileSync(destination, "utf8")), JSON.parse(output))) throw new Error("Learn fixtures are stale: run pnpm fixtures:learn");
    console.log("Learn fixtures match the simulator");
  } else {
    writeFileSync(destination, output);
    console.log("Wrote learn fixtures");
  }
}
