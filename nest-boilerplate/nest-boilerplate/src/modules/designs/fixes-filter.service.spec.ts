import { inputFingerprint } from "@/common/contracts/phase2/fingerprint";
import type { Graph, Traffic } from "@/common/contracts/phase2/graph.schema";
import { fixesSchema } from "@/common/contracts/phase3/fixes.schema";
import { FixesService } from "@/modules/designs/fixes.service";
import type { FixFilter } from "@/modules/simulation/engine/fixes";

// The fixes service with a goal's filter. The same scripted stand-ins as fixes.service.spec.ts: what the filter does to which fixes
// are even simulated, and to their order, is checked exactly; the engine itself is covered by the engine spec and the e2e suite.
const graph = {
  nodes: [
    { id: "c", type: "client", label: "Users", x: 0, y: 0, props: { region: "us-east" } },
    { id: "a", type: "app", label: "App servers", x: 240, y: 0, props: { replicas: 2, region: "us-east" } },
    { id: "d", type: "db", label: "Database", x: 480, y: 0, props: { region: "us-east" } },
  ],
  edges: [
    { id: "e1", from: "c", to: "a" },
    { id: "e2", from: "a", to: "d" },
  ],
} as unknown as Graph;
const traffic: Traffic = { preset: "custom", rps: 3000, burst: 1.5, readRatio: 0.9, sloP95: 300, errorBudget: 0.01, durationMin: 10, shape: "steady" };
const OWNER = "owner-1";
const DESIGN = "11111111-1111-4111-8111-111111111111";
const RUN = "22222222-2222-4222-8222-222222222222";
const summary = { verdict: "fail", p95: 1000, errorRate: 0.3, maxRho: 2, bottleneckId: "d", nodes: [{ id: "c", type: "client", rho: 0 }, { id: "a", type: "app", rho: 0.5 }, { id: "d", type: "db", rho: 2 }] };
const run = { id: RUN, kind: "simulation", status: "completed", designRevision: 4, engineVersion: "reference-port-v1", fingerprint: inputFingerprint({ schemaVersion: 1, graph, traffic }, "reference-port-v1"), result: { kind: "simulation", summary } };

/** With the database as the limit and 90% reads, the candidates are, in order: more copies (+1), doubled... no: db has no replicas set, so +1 copy, a bigger size, a cache, a read replica. */
const KINDS = ["replicas", "capacity", "cache", "readReplica"];
function service(helps: (kind: string, index: number) => { verdict: string; p95: number; errorRate: number; maxRho: number }) {
  const simulated: string[] = [];
  const designs = { owned: jest.fn(async () => ({ id: DESIGN, schemaVersion: 1, graph, traffic, revision: 4 })), revision: jest.fn() };
  const simulation = {
    run: jest.fn(async (_o: string, calc: { snapshot: { graph: Graph } }) => {
      const g = calc.snapshot.graph;
      const dbNode = g.nodes.find((n) => n.id === "d")!;
      const kind = g.nodes.some((n) => n.type === "replica") ? "readReplica" : g.nodes.some((n) => n.type === "cache") ? "cache" : (dbNode.props as { capacity?: number }).capacity ? "capacity" : "replicas";
      simulated.push(kind);
      return { preview: helps(kind, simulated.length - 1) };
    }),
  };
  const svc = new FixesService(designs as never, { get: jest.fn(async () => run) } as never, simulation as never);
  const ask = (filter?: FixFilter) => svc.suggest(OWNER, DESIGN, { expectedRevision: 4, runId: RUN, ...(filter ? { filter } : {}) }, new AbortController().signal);
  return { ask, simulated, simulation };
}
const result = (p95: number, errorRate: number, verdict = "fail") => ({ verdict, p95, errorRate, maxRho: 1 });
const allHelp = (kind: string) => ({ replicas: result(900, 0.25), capacity: result(500, 0.1), cache: result(300, 0.05, "strained"), readReplica: result(700, 0.15) })[kind as "replicas"];

describe("fix suggestions with a goal's filter", () => {
  it("without a filter behaves as before and reports that nothing was excluded", async () => {
    const { ask, simulated } = service(allHelp);
    const out = await ask();
    expect(simulated.sort()).toEqual([...KINDS].sort());
    expect(out.filter).toEqual({ exclude: [], preference: "default" });
    expect(out.suggestions.map((s) => s.kind)).toEqual(["cache", "capacity", "readReplica"]);
    expect(fixesSchema.safeParse(out).success).toBe(true);
  });

  it("never simulates, and never offers, a kind of fix the person left out", async () => {
    const { ask, simulated } = service(allHelp);
    const out = await ask({ exclude: ["cache", "readReplica"], preference: "default" });
    expect(simulated.sort()).toEqual(["capacity", "replicas"]);
    expect(out.suggestions.map((s) => s.kind).sort()).toEqual(["capacity", "replicas"]);
    expect(out.tried).toBe(2);
    expect(out.filter).toEqual({ exclude: ["cache", "readReplica"], preference: "default" });
  });

  it("orders the suggestions by the preference, with the engine's own numbers, and never adds a fix the engine did not verify", async () => {
    const lowest = await service(allHelp).ask({ exclude: [], preference: "lowest_latency" });
    expect(lowest.suggestions.map((s) => s.kind)).toEqual(["cache", "capacity", "readReplica"]);
    const simplest = await service(allHelp).ask({ exclude: [], preference: "simplest" });
    expect(simplest.suggestions.map((s) => s.kind)).toEqual(["replicas", "capacity", "cache"]);
    const fewest = await service(allHelp).ask({ exclude: [], preference: "fewest_errors" });
    expect(fewest.suggestions.map((s) => s.kind)).toEqual(["cache", "capacity", "readReplica"]);
    expect(simplest.suggestions[0].after).toEqual(result(900, 0.25));
  });

  it("says ALL_EXCLUDED, with nothing simulated, when the person left out every fix that could have been tried", async () => {
    const { ask, simulation } = service(allHelp);
    const out = await ask({ exclude: [...KINDS] as never, preference: "default" });
    expect(out).toMatchObject({ status: "ALL_EXCLUDED", suggestions: [], tried: 0, skipped: 0 });
    expect(simulation.run).not.toHaveBeenCalled();
  });

  it("says NO_IMPROVEMENT_FOUND, not ALL_EXCLUDED, when allowed fixes were tried and none helped", async () => {
    const { ask } = service(() => result(2000, 0.9));
    const out = await ask({ exclude: ["cache"], preference: "default" });
    expect(out.status).toBe("NO_IMPROVEMENT_FOUND");
    expect(out.tried).toBe(3);
  });

  it("a run that already passes has nothing to fix, whatever the filter, and still echoes the filter", async () => {
    const passing = { ...run, result: { kind: "simulation", summary: { ...summary, verdict: "pass" } } };
    const svc = new FixesService({ owned: jest.fn(async () => ({ id: DESIGN, schemaVersion: 1, graph, traffic, revision: 4 })), revision: jest.fn() } as never, { get: jest.fn(async () => passing) } as never, { run: jest.fn() } as never);
    const out = await svc.suggest(OWNER, DESIGN, { expectedRevision: 4, runId: RUN, filter: { exclude: ["cache"], preference: "simplest" } }, new AbortController().signal);
    expect(out).toMatchObject({ status: "NOTHING_TO_FIX", filter: { exclude: ["cache"], preference: "simplest" } });
  });
});
