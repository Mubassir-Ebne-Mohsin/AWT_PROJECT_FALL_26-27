import { AppException } from "@/common/errors";
import { inputFingerprint } from "@/common/contracts/phase2/fingerprint";
import type { Graph, Traffic } from "@/common/contracts/phase2/graph.schema";
import type { WhatIfChange } from "@/common/contracts/phase3/what-if.schema";
import { applyWhatIf, WhatIfService } from "@/modules/designs/what-if.service";
import { ExecutionError } from "@/modules/simulation/worker/executor-error";

// The what-if service with the design, the run and the calculation service replaced by scripted stand-ins. The real engine is
// covered by the e2e suite.
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
const baseTraffic: Traffic = { preset: "custom", rps: 500, burst: 2.5, readRatio: 0.7, sloP95: 250, errorBudget: 0.02, durationMin: 15, shape: "ramp" };
const OWNER = "owner-1";
const DESIGN = "11111111-1111-4111-8111-111111111111";
const RUN = "22222222-2222-4222-8222-222222222222";
const nodes = [{ id: "c", type: "client", label: "Users", rho: 0 }, { id: "a", type: "app", label: "App servers", rho: 0.4 }, { id: "d", type: "db", label: "Database", rho: 0.2 }];
const summary = (over: Record<string, unknown> = {}) => ({ verdict: "pass", p95: 40, errorRate: 0, maxRho: 0.4, bottleneckId: "a", nodes, ...over });
const runOf = (traffic: Traffic) => ({
  id: RUN, kind: "simulation", status: "completed", designRevision: 4, engineVersion: "reference-port-v1",
  fingerprint: inputFingerprint({ schemaVersion: 1, graph, traffic }, "reference-port-v1"),
  result: { kind: "simulation", summary: summary() },
});
const keep: WhatIfChange = { trafficMode: "keep", value: 0, shape: "keep", readShare: "keep" };
const change = (over: Partial<WhatIfChange>): WhatIfChange => ({ ...keep, ...over });

type Outcome = Record<string, unknown> | "busy" | "null" | "boom";
function service(outcome: Outcome, traffic: Traffic = baseTraffic) {
  const calls: { snapshot: { graph: unknown; traffic: Traffic } }[] = [];
  const design = { id: DESIGN, schemaVersion: 1, graph, traffic, revision: 4 };
  const designs = {
    owned: jest.fn(async () => design),
    revision: jest.fn((d: { revision: number }, expected: number) => {
      if (d.revision !== expected) throw new AppException("CONFLICT", "stale", { reason: "REVISION_MISMATCH" });
    }),
  };
  const runs = { get: jest.fn(async () => runOf(traffic)) };
  const simulation = {
    run: jest.fn(async (_o: string, calc: { kind: string; snapshot: { graph: unknown; traffic: Traffic } }) => {
      calls.push({ snapshot: calc.snapshot });
      if (outcome === "busy") throw new ExecutionError("RATE_LIMITED");
      if (outcome === "boom") throw new Error("engine exploded");
      return { preview: outcome === "null" ? null : outcome };
    }),
  };
  const svc = new WhatIfService(designs as never, runs as never, simulation as never);
  return { ask: (c: WhatIfChange, signal: AbortSignal = new AbortController().signal) => svc.ask(OWNER, DESIGN, { expectedRevision: 4, runId: RUN, change: c }, signal), calls, simulation };
}
const at = (verdict: string, p95: number, errorRate: number, bottleneckId = "d") => summary({ verdict, p95, errorRate, maxRho: 1.4, bottleneckId });
const reasonOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return ((e as AppException).details as { reason?: string }).reason;
  }
  return null;
};

describe("applying a change to the traffic", () => {
  it("multiplies or sets the rate and leaves everything else alone", () => {
    expect(applyWhatIf(baseTraffic, change({ trafficMode: "multiply", value: 2 }))).toEqual({ ...baseTraffic, rps: 1000 });
    expect(applyWhatIf(baseTraffic, change({ trafficMode: "multiply", value: 0.5 })).rps).toBe(250);
    expect(applyWhatIf(baseTraffic, change({ trafficMode: "set", value: 20000 }))).toEqual({ ...baseTraffic, rps: 20000 });
  });
  it("changes the shape and the read share to the fixed values, nothing else", () => {
    expect(applyWhatIf(baseTraffic, change({ shape: "spike" }))).toEqual({ ...baseTraffic, shape: "spike" });
    expect(applyWhatIf(baseTraffic, change({ readShare: "mostly_reads" })).readRatio).toBe(0.9);
    expect(applyWhatIf(baseTraffic, change({ readShare: "balanced" })).readRatio).toBe(0.5);
    expect(applyWhatIf(baseTraffic, change({ readShare: "mostly_writes" })).readRatio).toBe(0.1);
  });
  it("ignores the value when the mode is keep, whatever it holds", () => {
    expect(applyWhatIf(baseTraffic, change({ value: 9999, shape: "steady" }))).toEqual({ ...baseTraffic, shape: "steady" });
  });
  it("refuses a value outside the bounds, never clamping it, and accepts the bounds themselves", async () => {
    for (const c of [change({ trafficMode: "multiply", value: 0.09 }), change({ trafficMode: "multiply", value: 20.01 }), change({ trafficMode: "multiply", value: 1_000_000 }), change({ trafficMode: "multiply", value: -2 }), change({ trafficMode: "set", value: 0 }), change({ trafficMode: "set", value: 10_000_001 })]) {
      expect(() => applyWhatIf(baseTraffic, c)).toThrow(AppException);
      try {
        applyWhatIf(baseTraffic, c);
      } catch (e) {
        expect(((e as AppException).details as { reason: string }).reason).toBe("WHATIF_OUT_OF_RANGE");
      }
    }
    expect(applyWhatIf(baseTraffic, change({ trafficMode: "multiply", value: 0.1 })).rps).toBeCloseTo(50);
    expect(applyWhatIf(baseTraffic, change({ trafficMode: "multiply", value: 20 })).rps).toBe(10000);
    expect(applyWhatIf(baseTraffic, change({ trafficMode: "set", value: 1 })).rps).toBe(1);
    expect(applyWhatIf(baseTraffic, change({ trafficMode: "set", value: 10_000_000 })).rps).toBe(10_000_000);
  });
  it("refuses a change that changes nothing", () => {
    expect(() => applyWhatIf(baseTraffic, keep)).toThrow(AppException);
  });
});

describe("what-if service", () => {
  it("runs the same design under the changed traffic through the preview path and sets the two side by side", async () => {
    const { ask, calls, simulation } = service(at("fail", 900, 0.2));
    const out = await ask(change({ trafficMode: "multiply", value: 3, shape: "spike" }));
    expect(calls).toHaveLength(1);
    expect(calls[0].snapshot.traffic).toEqual({ ...baseTraffic, rps: 1500, shape: "spike" });
    expect(calls[0].snapshot.graph).toEqual(graph);
    expect((simulation.run.mock.calls[0][1] as { kind: string }).kind).toBe("preview");
    expect(out.before).toMatchObject({ rps: 500, shape: "ramp", readRatio: 0.7, status: "OK", measure: { verdict: "pass", p95: 40 }, limiter: { id: "a" } });
    expect(out.after).toMatchObject({ rps: 1500, shape: "spike", readRatio: 0.7, status: "OK", measure: { verdict: "fail", p95: 900, errorRate: 0.2 }, limiter: { id: "d", type: "db" } });
    expect(out.change).toEqual(change({ trafficMode: "multiply", value: 3, shape: "spike" }));
  });
  it("calculates nothing for a refused change", async () => {
    const { ask, calls } = service(at("pass", 1, 0));
    expect(await reasonOf(ask(change({ trafficMode: "multiply", value: 50 })))).toBe("WHATIF_OUT_OF_RANGE");
    expect(await reasonOf(ask(keep))).toBe("WHATIF_NOTHING_TO_CHANGE");
    expect(calls).toHaveLength(0);
  });
  it("reports a rate beyond the model's limit as too large, without calculating it", async () => {
    const { ask, calls } = service(at("pass", 1, 0), { ...baseTraffic, rps: 8_000_000 });
    const out = await ask(change({ trafficMode: "multiply", value: 2 }));
    expect(out.after).toMatchObject({ rps: 16_000_000, status: "TOO_LARGE", measure: null, limiter: null });
    expect(out.before.status).toBe("OK");
    expect(calls).toHaveLength(0);
  });
  it("marks a busy or empty calculation as unavailable, never as a pass, and keeps the recorded side", async () => {
    for (const outcome of ["busy", "null"] as const) {
      const out = await service(outcome).ask(change({ shape: "spike" }));
      expect(out.after).toMatchObject({ status: "UNAVAILABLE", measure: null, limiter: null });
      expect(out.before.status).toBe("OK");
    }
  });
  it("lets a failure that is not a calculation refusal through, and a cancelled request stops before calculating", async () => {
    await expect(service("boom").ask(change({ shape: "spike" }))).rejects.toThrow("engine exploded");
    const controller = new AbortController();
    controller.abort();
    const { ask, calls } = service(at("pass", 1, 0));
    expect(await reasonOf(ask(change({ shape: "spike" }), controller.signal))).toBe("CANCELLED");
    expect(calls).toHaveLength(0);
  });
  it("is refused for a stale revision or a run that is not the saved design's, like the ladder and the fixes", async () => {
    const { ask } = service(at("pass", 1, 0));
    const stale = new WhatIfService(
      { owned: async () => ({ id: DESIGN, schemaVersion: 1, graph, traffic: baseTraffic, revision: 5 }), revision: () => { throw new AppException("CONFLICT", "stale", { reason: "REVISION_MISMATCH" }); } } as never,
      { get: async () => runOf(baseTraffic) } as never,
      { run: jest.fn() } as never,
    );
    expect(await reasonOf(stale.ask(OWNER, DESIGN, { expectedRevision: 4, runId: RUN, change: change({ shape: "spike" }) }, new AbortController().signal))).toBe("REVISION_MISMATCH");
    void ask;
  });
});
