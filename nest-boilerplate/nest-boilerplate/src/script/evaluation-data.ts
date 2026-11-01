import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { calculate } from "@/modules/simulation/engine/compute";
import { nodeModel } from "@/modules/simulation/engine/distributions";
import { simulate, paths } from "@/modules/simulation/engine/simulate";
import { timeline } from "@/modules/simulation/engine/timeline";
import { getCatalog, getTemplates } from "@/modules/simulation/engine/templates";
import { fixturesMatch } from "@/src/script/learn-fixtures";
import type { Design, EngineNode } from "@/modules/simulation/engine/types";

/**
 * P5 Evaluation: the evidence the proof page shows, computed by running the REAL engine, never typed in. It holds
 *  - the engine's per-component waiting formula against the exact textbook answer (Erlang C), over a grid;
 *  - how closely the TypeScript engine reproduces the original prototype's reference fixtures;
 *  - consistency checks run on each shipped template.
 * Regenerate with `pnpm fixtures:evaluation`; the spec fails if the stored file is stale.
 */

// ---------- the exact textbook answer ----------

/** Erlang B by the stable recursion B(0)=1, B(k)=aB(k-1)/(k+aB(k-1)). */
export function erlangB(servers: number, offered: number): number {
  let b = 1;
  for (let k = 1; k <= servers; k++) b = (offered * b) / (k + offered * b);
  return b;
}
/** Probability an arriving request has to wait, for c servers at utilization rho (M/M/c). */
export function erlangC(servers: number, rho: number): number {
  const b = erlangB(servers, servers * rho);
  return b / (1 - rho * (1 - b));
}
/** Exact mean wait in the queue, in units of one service time: C(c, a) / (c (1 - rho)). */
export const exactWait = (servers: number, rho: number) => erlangC(servers, rho) / (servers * (1 - rho));

/** The engine's own waiting time for `servers` parallel servers at utilization `rho`, in units of one service time. */
export function modelWait(servers: number, rho: number, serviceMs = 10): number {
  // capacity x service time / 1000 = servers, so the engine infers exactly this many servers.
  const node = { id: "n", type: "app", label: "n", x: 0, y: 0, props: { capacity: (servers * 1000) / serviceMs, latency: serviceMs } } as unknown as EngineNode;
  const m = nodeModel(node, { load: { r: 0, w: 0, a: 0 }, peak: 0, cap: 0, rho, s: 1 });
  if (m.c !== servers) throw new Error(`Engine inferred ${m.c} servers, expected ${servers}`);
  return m.Wq / serviceMs;
}

const SERVERS = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 50, 75, 100, 150, 200, 480];
const GRID_RHO = Array.from({ length: 19 }, (_, i) => Math.round((i + 1) * 5) / 100); // 0.05 .. 0.95
const DENSE_RHO = Array.from({ length: 94 }, (_, i) => Math.round((i + 5) * 1) / 100); // 0.05 .. 0.98

function erlangEvidence() {
  const grid = SERVERS.flatMap((servers) =>
    GRID_RHO.map((rho) => {
      const exact = exactWait(servers, rho),
        model = modelWait(servers, rho);
      return { servers, rho, exact, model, gap: model - exact, relativeError: exact > 0 ? (model - exact) / exact : null };
    }),
  );
  let maxAbs = { value: 0, servers: 1, rho: 0.05, exact: 0, model: 0 };
  const bands = [0.01, 0.05, 0.2].map((minWaitShare) => ({ minWaitShare, points: 0, worstRelativeError: 0 }));
  let oneServerWorst = 0;
  for (const servers of SERVERS)
    for (const rho of DENSE_RHO) {
      const exact = exactWait(servers, rho),
        model = modelWait(servers, rho);
      const gap = Math.abs(model - exact);
      if (gap > maxAbs.value) maxAbs = { value: gap, servers, rho, exact, model };
      for (const band of bands)
        if (exact >= band.minWaitShare) {
          band.points += 1;
          band.worstRelativeError = Math.max(band.worstRelativeError, gap / exact);
        }
      if (servers === 1) oneServerWorst = Math.max(oneServerWorst, exact > 0 ? gap / exact : gap);
    }
  const catalog = getCatalog();
  const typical = catalog.components
    .filter((c) => c.capacity.kind === "finite" && c.latency > 0)
    .map((c) => {
      const capacity = (c.capacity as { value: number }).value;
      const servers = Math.max(1, Math.round((capacity * c.latency) / 1000));
      return {
        type: c.type,
        label: c.label,
        serviceMs: c.latency,
        servers,
        rows: [0.5, 0.7, 0.8, 0.9, 0.95].map((rho) => {
          const exactMs = exactWait(servers, rho) * c.latency,
            modelMs = modelWait(servers, rho, c.latency) * c.latency;
          return { rho, exactMs, modelMs, gapMs: modelMs - exactMs };
        }),
      };
    });
  return { servers: SERVERS, loads: GRID_RHO, grid, maxAbsoluteGap: maxAbs, bands, oneServerWorstRelativeError: oneServerWorst, typical };
}

// ---------- fidelity to the original prototype ----------

type Walk = { values: number; maxAbs: number; maxRel: number; where: string };
function walk(actual: unknown, expected: unknown, path: string, acc: Walk) {
  const tagged = expected as { $number?: string } | null;
  if (tagged && typeof tagged === "object" && "$number" in tagged) return; // the prototype's infinities and NaN are compared by the spec; not counted here
  if (typeof expected === "number") {
    if (typeof actual !== "number" || !Number.isFinite(actual)) throw new Error("Port differs from the prototype at " + path);
    const abs = Math.abs(actual - expected);
    const rel = abs / Math.max(1e-12, Math.abs(expected));
    acc.values += 1;
    if (abs > acc.maxAbs) {
      acc.maxAbs = abs;
      acc.where = path;
    }
    if (rel > acc.maxRel && Math.abs(expected) > 1e-9) acc.maxRel = rel;
  } else if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) throw new Error("Port differs in length at " + path);
    expected.forEach((e, i) => walk(actual[i], e, `${path}[${i}]`, acc));
  } else if (expected && typeof expected === "object") {
    const a = actual as Record<string, unknown>;
    for (const key of Object.keys(expected)) walk(a?.[key], (expected as Record<string, unknown>)[key], `${path}.${key}`, acc);
  }
}

function fidelityEvidence() {
  const reference = JSON.parse(readFileSync(resolve(__dirname, "../../../../docs/contracts/reference-fixtures.json"), "utf8"));
  const acc: Walk = { values: 0, maxAbs: 0, maxRel: 0, where: "" };
  const perFixture: Array<{ id: string; values: number }> = [];
  for (const fixture of reference.templates) {
    const before = acc.values;
    const { graph, traffic } = fixture.input;
    const plain = (v: unknown) => JSON.parse(JSON.stringify(v));
    walk(plain(simulate(graph, traffic)), fixture.expected.simulation, fixture.id + ".simulation", acc);
    walk(plain(paths(graph, traffic)), fixture.expected.paths, fixture.id + ".paths", acc);
    walk(plain(timeline(graph, traffic)), fixture.expected.timeline, fixture.id + ".timeline", acc);
    const limits = calculate({ kind: "limits", snapshot: { schemaVersion: 1, graph, traffic } }).output;
    if (limits?.kind !== "limits" || limits.state !== "found") throw new Error("Expected a found breaking point for " + fixture.id);
    walk(limits.failingRps, fixture.expected.limits.breakRps, fixture.id + ".limits.breakRps", acc);
    walk(plain(limits.curve), fixture.expected.limits.curve, fixture.id + ".limits.curve", acc);
    perFixture.push({ id: fixture.id, values: acc.values - before });
  }
  return { fixtures: reference.templates.length, valuesCompared: acc.values, largestAbsoluteDifference: acc.maxAbs, largestRelativeDifference: acc.maxRel, tolerance: { absolute: 1e-6, relative: 1e-6 }, perFixture };
}

// ---------- consistency checks on each shipped template ----------

type CurvePoint = { p95: number; err: number; maxRho: number };
/** True when p95, errors and the busiest component's utilization never fall as the load rises along a curve. */
export const curveNeverImproves = (curve: CurvePoint[]) =>
  curve.every((p, i) => i === 0 || (p.p95 >= curve[i - 1].p95 - 1e-9 && p.err >= curve[i - 1].err - 1e-9 && p.maxRho >= curve[i - 1].maxRho - 1e-9));
/** True when a component is no busier after its replicas were doubled than before. */
export const utilizationDidNotRise = (before: number, after: number) => after <= before + 1e-9;

function consistencyEvidence() {
  const checks: Array<{ id: string; text: string; results: Array<{ template: string; passed: boolean; detail: string }> }> = [
    { id: "deterministic", text: "The same design and traffic always give exactly the same result", results: [] },
    { id: "zero-load", text: "With no traffic every component is idle and every time stays finite", results: [] },
    { id: "monotone-load", text: "Along the load curve, p95, errors and the busiest component's utilization never fall as load rises", results: [] },
    { id: "breaking-point", text: "Just under the breaking point the goal is met; at the breaking point it is not", results: [] },
    { id: "more-replicas", text: "Doubling a component's replicas never raises its utilization", results: [] },
  ];
  const by = (id: string) => checks.find((c) => c.id === id)!;
  for (const t of getTemplates()) {
    const design = { nodes: t.graph.nodes, edges: t.graph.edges } as unknown as Design;
    const record = (id: string, passed: boolean, detail: string) => by(id).results.push({ template: t.id, passed, detail });
    const a = simulate(design, t.traffic),
      b = simulate(design, t.traffic);
    record("deterministic", JSON.stringify(a) === JSON.stringify(b), "two runs compared field by field");

    const zero = simulate(design, t.traffic, { rps: 0 });
    const idle = zero.ok && zero.nodes.every((n) => n.status === "idle" && Number.isFinite(n.T) && n.rho === 0);
    record("zero-load", idle, zero.ok ? `${zero.nodes.length} components checked` : "invalid");

    const limits = calculate({ kind: "limits", snapshot: { schemaVersion: 1, graph: t.graph, traffic: t.traffic } }).output;
    if (limits?.kind !== "limits" || limits.state !== "found") throw new Error("Expected a found breaking point for " + t.id);
    const curve = limits.curve;
    record("monotone-load", curveNeverImproves(curve), `${curve.length} load levels checked`);

    const under = simulate(design, t.traffic, { rps: limits.passingRps }),
      over = simulate(design, t.traffic, { rps: limits.failingRps });
    record("breaking-point", under.ok && over.ok && under.sloMet === true && over.sloMet === false, `goal met at ${Math.round(limits.passingRps)} requests a second, not at ${Math.round(limits.failingRps)}`);

    let checked = 0,
      ok = true;
    for (const node of t.graph.nodes) {
      if (node.type === "client" || node.type === "worker") continue;
      const doubled = structuredClone(t.graph) as typeof t.graph;
      const target = doubled.nodes.find((n) => n.id === node.id)!;
      const replicas = Number((target.props as { replicas?: number }).replicas ?? 1);
      (target.props as { replicas?: number }).replicas = replicas * 2;
      const before = a.ok ? a.nodes.find((n) => n.id === node.id) : undefined;
      const after = simulate({ nodes: doubled.nodes, edges: doubled.edges } as unknown as Design, t.traffic);
      const next = after.ok ? after.nodes.find((n) => n.id === node.id) : undefined;
      if (before && next) {
        checked += 1;
        if (!utilizationDidNotRise(before.rho, next.rho)) ok = false;
      }
    }
    record("more-replicas", ok && checked > 0, `${checked} components checked`);
  }
  return checks.map((c) => ({ ...c, passed: c.results.every((r) => r.passed) }));
}

export function buildEvaluationData() {
  return {
    note: "Generated from the real engine by `pnpm fixtures:evaluation`. Do not edit by hand.",
    engineVersion: getCatalog().engineVersion,
    erlang: erlangEvidence(),
    fidelity: fidelityEvidence(),
    consistency: consistencyEvidence(),
  };
}

const destination = resolve(__dirname, "../../../../web/src/lib/evaluation-data.json");
export const evaluationDataText = () => JSON.stringify(buildEvaluationData(), null, 2) + "\n";

if (require.main === module) {
  const output = evaluationDataText();
  if (process.argv.includes("--check")) {
    if (!fixturesMatch(JSON.parse(readFileSync(destination, "utf8")), JSON.parse(output))) throw new Error("Evaluation data is stale: run pnpm fixtures:evaluation");
    console.log("Evaluation data matches the engine");
  } else {
    writeFileSync(destination, output);
    console.log("Wrote evaluation data");
  }
}
