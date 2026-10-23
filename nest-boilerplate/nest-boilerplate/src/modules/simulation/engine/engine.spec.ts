import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  snapshotSchema,
  Snapshot,
} from "@/common/contracts/phase2/graph.schema";
import { calculate } from "@/modules/simulation/engine/compute";
import { simulate, paths } from "@/modules/simulation/engine/simulate";
import { timeline, successful } from "@/modules/simulation/engine/timeline";
import { buildFromSpec } from "@/modules/simulation/engine/builders";
import { validate } from "@/modules/simulation/engine/graph";
import {
  getCatalog,
  getTemplates,
} from "@/modules/simulation/engine/templates";
import { importDesign } from "@/modules/simulation/engine/import-design";
import { WorkBudget, EngineFault } from "@/modules/simulation/engine/budget";
import { nodeModel } from "@/modules/simulation/engine/distributions";
import { bounded } from "@/modules/simulation/engine/wire";

const evidence = JSON.parse(
  readFileSync(
    resolve(
      __dirname,
      "../../../../../../docs/contracts/reference-fixtures.json",
    ),
    "utf8",
  ),
);
const fixtures: {
  id: string;
  input: Snapshot;
  expected: Record<string, any>;
}[] = evidence.templates;
const sample = () =>
  structuredClone(fixtures.find((t) => t.id === "mvp")!.input);
// Full recursive parity, with exact fields/array order; no rounded assertions.
function parity(actual: any, expected: any, path = "") {
  if (expected?.$number) {
    if (expected.$number === "Infinity") expect(actual).toBe(Infinity);
    else if (expected.$number === "NaN" && /servers$/.test(path))
      expect(actual).toBeNull();
    else throw new Error("Unapproved non-finite oracle field " + path);
  } else if (typeof expected === "number") {
    if (
      !Number.isFinite(actual) ||
      Math.abs(actual - expected) > 1e-6 + 1e-6 * Math.abs(expected)
    )
      throw new Error(
        "Parity failed at " + path + ": " + actual + " vs " + expected,
      );
  } else if (expected && typeof expected === "object") {
    expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort());
    for (const key of Object.keys(expected))
      parity(actual[key], expected[key], path + "." + key);
  } else expect(actual).toEqual(expected);
}
describe("Typed model and source parity", () => {
  it.each(fixtures)(
    "$id full simulation/path/timeline/limits parity",
    (fixture) => {
      const snapshot = snapshotSchema.parse(fixture.input),
        { graph, traffic } = snapshot;
      parity(validate(graph), fixture.expected.validation);
      parity(simulate(graph, traffic), fixture.expected.simulation);
      parity(paths(graph, traffic), fixture.expected.paths);
      parity(timeline(graph, traffic), fixture.expected.timeline);
      expect(calculate({ kind: "simulation", snapshot }).output?.kind).toBe(
        "simulation",
      );
      const result = calculate({ kind: "limits", snapshot }).output;
      if (result?.kind !== "limits") throw new Error("Missing limits");
      const source = fixture.expected.limits;
      expect(result.state).toBe(source.floor ? "failsAtMinimumLoad" : "found");
      if (result.state === "found") {
        parity(result.failingRps, source.breakRps);
        parity(result.curve, source.curve);
        parity(result.headroom, { kind: "finite", value: source.headroom });
        expect(
          successful(simulate(graph, traffic, { rps: result.passingRps }))
            .sloMet,
        ).toBe(true);
        expect(
          successful(simulate(graph, traffic, { rps: result.failingRps }))
            .sloMet,
        ).toBe(false);
        parity(
          successful(simulate(graph, traffic, { rps: result.failingRps })),
          source.at,
        );
        parity(result.at.p95, source.at.p95);
        parity(result.at.errorRate, source.at.errorRate);
      }
      parity(result.current.p95, source.current.p95);
      expect(result.cause).toBe(source.cause);
      expect(result.firstId).toBe(source.firstId);
      expect(result.order.map((n) => n.id)).toEqual(
        source.order.map((n: any) => n.id),
      );
      result.order.forEach((n, i) =>
        parity(n.satRps, { kind: "finite", value: source.order[i].satRps }),
      );
    },
  );
  it("template builders and catalog match source inputs", () => {
    const templates = getTemplates();
    expect(templates).toHaveLength(6);
    expect(getCatalog().components).toHaveLength(12);
    templates.forEach((t, i) =>
      expect({
        schemaVersion: t.schemaVersion,
        graph: t.graph,
        traffic: t.traffic,
      }).toEqual(fixtures[i].input),
    );
  });
  it("is deterministic and does not mutate inputs", () => {
    const snapshot = sample(),
      before = JSON.stringify(snapshot);
    expect(calculate({ kind: "simulation", snapshot })).toEqual(
      calculate({ kind: "simulation", snapshot }),
    );
    expect(JSON.stringify(snapshot)).toBe(before);
  });
  it("returns structured semantic validation without rejecting safe drafts", () => {
    for (const graph of [
      { nodes: [], edges: [] },
      { nodes: [sample().graph.nodes[1]], edges: [] },
      { nodes: [sample().graph.nodes[0]], edges: [] },
      {
        ...sample().graph,
        edges: [
          ...sample().graph.edges,
          {
            id: "reverse",
            from: sample().graph.nodes[2].id,
            to: sample().graph.nodes[1].id,
          },
        ],
      },
    ]) {
      const result = calculate({
        kind: "simulation",
        snapshot: { ...sample(), graph },
      });
      expect(result.validation.ok).toBe(false);
      expect(result.output).toBeNull();
      expect(result.validation.errors[0].repair).toBeTruthy();
    }
  });
  it("handles zero load and zero client share with finite JSON", () => {
    for (const share of [undefined, 0]) {
      const snapshot = sample();
      snapshot.traffic.rps = 0;
      if (share === 0) snapshot.graph.nodes[0].props = { share };
      const out = calculate({ kind: "simulation", snapshot }).output;
      if (out?.kind !== "simulation") throw new Error("Missing simulation");
      expect(out.summary.throughput).toBe(0);
      expect(out.summary.nodes.every((n) => n.status === "idle")).toBe(true);
    }
  });
  it("replicas, regions, burst and cache settings change the modeled load", () => {
    const base = sample(),
      overloaded = sample();
    overloaded.traffic.rps = 1000;
    const before = successful(simulate(overloaded.graph, overloaded.traffic));
    const scaled = structuredClone(overloaded);
    scaled.graph.nodes[1].props = { replicas: 10 };
    expect(
      successful(simulate(scaled.graph, scaled.traffic)).errorRate,
    ).toBeLessThan(before.errorRate);
    const remote = structuredClone(base);
    remote.graph.nodes[0].props = { region: "ap-south" };
    expect(
      successful(simulate(remote.graph, remote.traffic)).p95,
    ).toBeGreaterThan(successful(simulate(base.graph, base.traffic)).p95);
    const burst = structuredClone(base);
    burst.traffic.burst = 4;
    expect(
      successful(simulate(burst.graph, burst.traffic)).maxRho,
    ).toBeGreaterThan(successful(simulate(base.graph, base.traffic)).maxRho);
    const content = structuredClone(
      fixtures.find((t) => t.id === "content")!.input,
    );
    const cached = successful(simulate(content.graph, content.traffic));
    content.graph.nodes.find((n) => n.type === "cdn")!.props = { hitRatio: 0 };
    expect(
      successful(simulate(content.graph, content.traffic)).nodes.find(
        (n) => n.type === "app",
      )!.peak,
    ).toBeGreaterThan(cached.nodes.find((n) => n.type === "app")!.peak);
  });
  it("reports a queue with no consumer and unbounded lag", () => {
    const snapshot = sample(),
      graph = buildFromSpec({ queue: { workers: 1 }, appReplicas: 10 });
    graph.nodes = graph.nodes.filter((n) => n.type !== "worker");
    graph.edges = graph.edges.filter(
      (e) =>
        graph.nodes.some((n) => n.id === e.from) &&
        graph.nodes.some((n) => n.id === e.to),
    );
    const result = successful(simulate(graph, snapshot.traffic));
    expect(
      result.validation.warnings.some((w) => w.code === "QUEUE_NO_CONSUMER"),
    ).toBe(true);
    expect(result.queues[0].lag).toBe(Infinity);
  });
  it("matches the M/M/1 waiting-time formula for one inferred server below the clamp", () => {
    const n = sample().graph.nodes[1];
    n.props = { capacity: 100, latency: 10 };
    const m = nodeModel(n, {
      load: { r: 50, w: 0, a: 0 },
      peak: 50,
      cap: 100,
      rho: 0.5,
      s: 1,
    });
    expect(m.c).toBe(1);
    expect(m.Wq).toBeCloseTo(10, 10);
    expect(m.T).toBeCloseTo(20, 10);
  });
  it("keeps a failed minimum threshold unknown", () => {
    const snapshot = evidence.minimumLoadCounterexample.input;
    expect(calculate({ kind: "limits", snapshot }).output).toMatchObject({
      state: "failsAtMinimumLoad",
      minimumTestedRps: 1,
      lowerThreshold: "unknown",
      headroom: null,
    });
    expect(
      successful(simulate(snapshot.graph, snapshot.traffic, { rps: 0.1 }))
        .sloMet,
    ).toBe(true);
  });
  it("caps a search without declaring infinite capacity", () => {
    const snapshot = sample();
    snapshot.graph.nodes.forEach((n) => {
      if (n.type !== "client")
        n.props = { capacity: 1e9, latency: 0, replicas: 200 };
    });
    expect(calculate({ kind: "limits", snapshot }).output).toMatchObject({
      state: "notReachedWithinRange",
      maximumTestedRps: 1e7,
      headroomIsLowerBound: true,
      at: null,
    });
  });
  it("imports omitted positions deterministically without edge-id collisions", () => {
    const text = JSON.stringify({
      nodes: [
        { id: "e1", type: "client" },
        { id: "a", type: "app" },
      ],
      edges: [{ from: "e1", to: "a" }],
    });
    const a = importDesign(text);
    expect(a).toEqual(importDesign(text));
    expect(a.snapshot.graph.edges[0].id).toBe("e2");
    expect(a.snapshot.graph.nodes.every((n) => Number.isFinite(n.x))).toBe(
      true,
    );
    expect(importDesign('{"nodes":[]}').snapshot.graph.nodes).toHaveLength(0);
  });
  it("rejects unexpected non-finite numbers and explicit complexity exhaustion", () => {
    expect(() => bounded(NaN)).toThrow(EngineFault);
    expect(() => bounded(-Infinity)).toThrow(EngineFault);
    const budget = new WorkBudget();
    budget.pairAttempts = 2_000_000;
    expect(() => budget.pair()).toThrow("path-expansion");
  });
});
