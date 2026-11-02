import { AppException } from "@/common/errors";
import { inputFingerprint } from "@/common/contracts/phase2/fingerprint";
import type { Graph, Traffic } from "@/common/contracts/phase2/graph.schema";
import { FixesService } from "@/modules/designs/fixes.service";
import { ExecutionError } from "@/modules/simulation/worker/executor-error";

// The fixes service with the design, the run and the calculation service replaced by scripted stand-ins, so that busy, cancelled,
// partial and many-helpful cases can be produced exactly. The real engine is covered by the engine spec and the e2e suite.
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
const design = { id: DESIGN, schemaVersion: 1, graph, traffic, revision: 4 };
const summary = (over: Record<string, unknown> = {}) => ({
  verdict: "fail", p95: 1000, errorRate: 0.3, maxRho: 2, bottleneckId: "a",
  nodes: [{ id: "c", type: "client", rho: 0 }, { id: "a", type: "app", rho: 2 }, { id: "d", type: "db", rho: 0.4 }],
  ...over,
});
const runOf = (over: Record<string, unknown> = {}, s = summary()) => ({
  id: RUN, kind: "simulation", status: "completed", designRevision: 4, engineVersion: "reference-port-v1",
  fingerprint: inputFingerprint({ schemaVersion: 1, graph, traffic }, "reference-port-v1"),
  result: { kind: "simulation", summary: s }, ...over,
});

type Outcome = { verdict: string; p95: number; errorRate: number; maxRho: number } | "busy" | "null" | "boom";
function service(outcomes: Outcome[] | ((i: number) => Outcome), run: unknown = runOf(), designOver: Record<string, unknown> = {}) {
  const calls: { session: string | undefined; sequence: number | undefined; graph: unknown }[] = [];
  const designs = {
    owned: jest.fn(async () => ({ ...design, ...designOver })),
    revision: jest.fn((d: { revision: number }, expected: number) => {
      if (d.revision !== expected) throw new AppException("CONFLICT", "stale", { reason: "REVISION_MISMATCH" });
    }),
  };
  const runs = { get: jest.fn(async () => run) };
  const simulation = {
    run: jest.fn(async (_owner: string, calc: { kind: string; snapshot: { graph: unknown; traffic: unknown } }, admission: { editorSessionId?: string; sequence?: number; signal?: AbortSignal }) => {
      const i = calls.length;
      calls.push({ session: admission.editorSessionId, sequence: admission.sequence, graph: calc.snapshot.graph });
      const o = typeof outcomes === "function" ? outcomes(i) : (outcomes[i] ?? outcomes[outcomes.length - 1]);
      if (o === "busy") throw new ExecutionError("RATE_LIMITED");
      if (o === "boom") throw new Error("engine exploded");
      return { preview: o === "null" ? null : o };
    }),
  };
  const svc = new FixesService(designs as never, runs as never, simulation as never);
  const ask = (signal: AbortSignal = new AbortController().signal, request = { expectedRevision: 4, runId: RUN }) => svc.suggest(OWNER, DESIGN, request, signal);
  return { svc, ask, calls, designs, runs, simulation };
}
const better = (p95: number, errorRate = 0.1, verdict = "fail") => ({ verdict, p95, errorRate, maxRho: 1 });
const reason = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return (e as AppException).details as { reason?: string };
  }
  throw new Error("expected a refusal");
};

describe("fixes service", () => {
  it("offers only the fixes the engine says help, best first, with the engine's own numbers", async () => {
    // For the app limit the candidates are: +1 copy, x2 copies, a bigger size. Make them help by different amounts.
    const { ask } = service([better(900, 0.2), better(500, 0.05, "strained"), better(1200, 0.4)]);
    const out = await ask();
    expect(out.status).toBe("SUGGESTIONS");
    expect(out.suggestions.map((s) => s.after)).toEqual([
      { verdict: "strained", p95: 500, errorRate: 0.05, maxRho: 1 },
      { verdict: "fail", p95: 900, errorRate: 0.2, maxRho: 1 },
    ]);
    expect(out).toMatchObject({ tried: 3, skipped: 0, designId: DESIGN, runId: RUN, revision: 4, limiter: { id: "a", label: "App servers", type: "app" } });
    expect(out.baseline).toEqual({ verdict: "fail", p95: 1000, errorRate: 0.3, maxRho: 2 });
  });

  it("never offers a fix that is no better, or worse on any measure, whatever else improved", async () => {
    const { ask } = service([better(1000, 0.3), better(500, 0.31), better(1200, 0.1), { verdict: "fail", p95: 999.9, errorRate: 0.3, maxRho: 1 }]);
    const out = await ask();
    expect(out.status).toBe("NO_IMPROVEMENT_FOUND");
    expect(out.suggestions).toEqual([]);
    expect(out.tried).toBe(3);
  });

  it("keeps at most three, the best three, when more help", async () => {
    // A database limit gives four candidates here; all help, by a different amount each.
    const run = runOf({}, summary({ bottleneckId: "d", nodes: [{ id: "a", type: "app", rho: 0.3 }, { id: "d", type: "db", rho: 2 }] }));
    const { ask, calls } = service([better(800), better(700), better(600), better(500)], run);
    const out = await ask();
    expect(calls.length).toBe(4);
    expect(out.suggestions.length).toBe(3);
    expect(out.suggestions.map((s) => s.after.p95)).toEqual([500, 600, 700]);
  });

  it("reports nothing to fix, and tries nothing, for a run that passes", async () => {
    const { ask, simulation } = service([better(1)], runOf({}, summary({ verdict: "pass", p95: 20, errorRate: 0 })));
    const out = await ask();
    expect(out).toMatchObject({ status: "NOTHING_TO_FIX", suggestions: [], tried: 0, skipped: 0 });
    expect(simulation.run).not.toHaveBeenCalled();
  });

  it("says it is incomplete, not that nothing helps, when the calculation service was busy for every fix", async () => {
    const { ask } = service(["busy"]);
    const out = await ask();
    expect(out).toMatchObject({ status: "INCOMPLETE", suggestions: [], tried: 0, skipped: 3 });
  });

  it("keeps what it could check when some fixes were refused as busy, and counts the others as skipped", async () => {
    const { ask } = service(["busy", better(500, 0.05, "strained"), "busy"]);
    const out = await ask();
    expect(out).toMatchObject({ status: "SUGGESTIONS", tried: 1, skipped: 2 });
    expect(out.suggestions).toHaveLength(1);
  });

  it("skips a fix the engine could not calculate, and does not count it as tried", async () => {
    const { ask } = service(["null", better(500, 0.05, "strained"), "null"]);
    const out = await ask();
    expect(out).toMatchObject({ tried: 1, skipped: 2, status: "SUGGESTIONS" });
  });

  it("lets a failure that is not a calculation refusal through, instead of hiding it", async () => {
    const { ask } = service(["boom"]);
    await expect(ask()).rejects.toThrow("engine exploded");
  });

  it("runs the fixes in order inside one preview session with rising sequence numbers, each at the design's own traffic", async () => {
    const { ask, calls, simulation } = service([better(900)]);
    await ask();
    expect(calls.map((c) => c.sequence)).toEqual([0, 1, 2]);
    expect(new Set(calls.map((c) => c.session)).size).toBe(1);
    expect(calls[0].session).toMatch(/^[0-9a-f-]{36}$/);
    for (const [, calc] of simulation.run.mock.calls) {
      expect(calc.kind).toBe("preview");
      expect(calc.snapshot.traffic).toEqual(traffic);
    }
    expect(simulation.run.mock.calls.every((c) => c[0] === OWNER)).toBe(true);
  });

  it("stops asking for more calculations once the person has gone", async () => {
    const controller = new AbortController();
    const { ask, calls } = service((i) => {
      if (i === 0) controller.abort();
      return better(900);
    });
    expect(await reason(ask(controller.signal))).toEqual({ reason: "CANCELLED" });
    expect(calls.length).toBe(1);
  });

  it("does not start at all for a request already cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const { ask, calls } = service([better(900)]);
    expect(await reason(ask(controller.signal))).toEqual({ reason: "CANCELLED" });
    expect(calls.length).toBe(0);
  });

  it("refuses a stale revision before looking at the run", async () => {
    const { ask, runs } = service([better(900)]);
    await expect(ask(undefined, { expectedRevision: 3, runId: RUN })).rejects.toBeInstanceOf(AppException);
    expect(runs.get).not.toHaveBeenCalled();
  });

  it.each([
    ["a limits run", { kind: "limits" }, "RUN_NOT_USABLE"],
    ["a run that is still pending", { status: "pending" }, "RUN_NOT_USABLE"],
    ["a failed run", { status: "failed" }, "RUN_NOT_USABLE"],
    ["a result of another kind", { result: { kind: "limits" } }, "RUN_NOT_USABLE"],
    ["a run of an older revision", { designRevision: 3 }, "RUN_NOT_CURRENT"],
    ["a run whose input is not the saved design", { fingerprint: "a".repeat(64) }, "RUN_NOT_CURRENT"],
  ])("refuses %s", async (_name, over, expected) => {
    const { ask, simulation } = service([better(900)], runOf(over));
    expect(await reason(ask())).toEqual({ reason: expected });
    expect(simulation.run).not.toHaveBeenCalled();
  });

  it("aims at the busiest component when the run names no bottleneck, and never at the client", async () => {
    const run = runOf({}, summary({ bottleneckId: null, nodes: [{ id: "c", type: "client", rho: 9 }, { id: "a", type: "app", rho: 1.5 }, { id: "d", type: "db", rho: 0.4 }] }));
    const { ask } = service([better(900)], run);
    expect((await ask()).limiter?.id).toBe("a");
  });

  it("says there was nothing to aim at when no component is a candidate", async () => {
    const run = runOf({}, summary({ bottleneckId: null, nodes: [{ id: "c", type: "client", rho: 9 }] }));
    const { ask, simulation } = service([better(900)], run);
    const out = await ask();
    expect(out).toMatchObject({ status: "NO_IMPROVEMENT_FOUND", limiter: null, tried: 0, skipped: 0 });
    expect(simulation.run).not.toHaveBeenCalled();
  });
});
