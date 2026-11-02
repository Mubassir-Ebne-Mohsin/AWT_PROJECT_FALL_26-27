import { AppException } from "@/common/errors";
import { inputFingerprint } from "@/common/contracts/phase2/fingerprint";
import type { Graph, Traffic } from "@/common/contracts/phase2/graph.schema";
import { LADDER_MULTIPLIERS, LadderService } from "@/modules/designs/ladder.service";
import { ExecutionError } from "@/modules/simulation/worker/executor-error";

// The ladder service with the design, the run and the calculation service replaced by scripted stand-ins, so busy, cancelled and
// out-of-range cases can be produced exactly. The real engine is covered by the e2e suite.
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
const baseTraffic: Traffic = { preset: "custom", rps: 500, burst: 2.5, readRatio: 0.7, sloP95: 250, errorBudget: 0.02, durationMin: 15, shape: "spike" };
const OWNER = "owner-1";
const DESIGN = "11111111-1111-4111-8111-111111111111";
const RUN = "22222222-2222-4222-8222-222222222222";
const nodes = [{ id: "c", type: "client", label: "Users", rho: 0 }, { id: "a", type: "app", label: "App servers", rho: 0.4 }, { id: "d", type: "db", label: "Database", rho: 0.2 }];
const summary = (over: Record<string, unknown> = {}) => ({ verdict: "pass", p95: 40, errorRate: 0, maxRho: 0.4, bottleneckId: "a", nodes, ...over });
const runOf = (traffic: Traffic, over: Record<string, unknown> = {}, s = summary()) => ({
  id: RUN, kind: "simulation", status: "completed", designRevision: 4, engineVersion: "reference-port-v1",
  fingerprint: inputFingerprint({ schemaVersion: 1, graph, traffic }, "reference-port-v1"),
  result: { kind: "simulation", summary: s }, ...over,
});

type Outcome = Record<string, unknown> | "busy" | "null" | "boom";
function service(outcomes: Outcome[] | ((i: number) => Outcome), traffic: Traffic = baseTraffic, run: unknown = runOf(traffic)) {
  const calls: { session?: string; sequence?: number; snapshot: { graph: unknown; traffic: Traffic } }[] = [];
  const design = { id: DESIGN, schemaVersion: 1, graph, traffic, revision: 4 };
  const designs = {
    owned: jest.fn(async () => design),
    revision: jest.fn((d: { revision: number }, expected: number) => {
      if (d.revision !== expected) throw new AppException("CONFLICT", "stale", { reason: "REVISION_MISMATCH" });
    }),
  };
  const runs = { get: jest.fn(async () => run) };
  const simulation = {
    run: jest.fn(async (_o: string, calc: { kind: string; snapshot: { graph: unknown; traffic: Traffic } }, admission: { editorSessionId?: string; sequence?: number }) => {
      const i = calls.length;
      calls.push({ session: admission.editorSessionId, sequence: admission.sequence, snapshot: calc.snapshot });
      const o = typeof outcomes === "function" ? outcomes(i) : (outcomes[i] ?? outcomes[outcomes.length - 1]);
      if (o === "busy") throw new ExecutionError("RATE_LIMITED");
      if (o === "boom") throw new Error("engine exploded");
      return { preview: o === "null" ? null : o };
    }),
  };
  const svc = new LadderService(designs as never, runs as never, simulation as never);
  const climb = (signal: AbortSignal = new AbortController().signal, request = { expectedRevision: 4, runId: RUN }) => svc.climb(OWNER, DESIGN, request, signal);
  return { climb, calls, simulation, runs };
}
const at = (p95: number, errorRate: number, verdict = "fail", bottleneckId: string | null = "d") => summary({ verdict, p95, errorRate, maxRho: 1.5, bottleneckId });
const reason = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return (e as AppException).details as { reason?: string };
  }
  throw new Error("expected a refusal");
};

describe("load ladder service", () => {
  it("climbs the recorded run, then two, five and ten times its request rate", async () => {
    expect(LADDER_MULTIPLIERS).toEqual([2, 5, 10]);
    const { climb } = service([at(80, 0, "pass", "a"), at(300, 0.05, "strained", "a"), at(1200, 0.4, "fail", "d")]);
    const out = await climb();
    expect(out).toMatchObject({ designId: DESIGN, runId: RUN, revision: 4 });
    expect(out.rungs.map((r) => [r.multiplier, r.rps, r.status])).toEqual([[1, 500, "OK"], [2, 1000, "OK"], [5, 2500, "OK"], [10, 5000, "OK"]]);
  });

  it("takes the first rung from the recorded run itself and the others from the calculation, with the limiting component named", async () => {
    const { climb } = service([at(80, 0, "pass", "a"), at(300, 0.05, "strained", "a"), at(1200, 0.4, "fail", "d")]);
    const [one, two, five, ten] = (await climb()).rungs;
    expect(one).toMatchObject({ measure: { verdict: "pass", p95: 40, errorRate: 0, maxRho: 0.4 }, limiter: { id: "a", label: "App servers", type: "app" } });
    expect(two).toMatchObject({ measure: { verdict: "pass", p95: 80, errorRate: 0, maxRho: 1.5 }, limiter: { id: "a", label: "App servers", type: "app" } });
    expect(five.measure).toEqual({ verdict: "strained", p95: 300, errorRate: 0.05, maxRho: 1.5 });
    expect(ten).toMatchObject({ measure: { verdict: "fail", p95: 1200, errorRate: 0.4 }, limiter: { id: "d", label: "Database", type: "db" } });
  });

  it("changes only the request rate: the same design, the same shape, bursts, read share and targets, through the preview path", async () => {
    const { climb, calls, simulation } = service([at(1, 0)]);
    await climb();
    expect(calls.map((c) => c.snapshot.traffic)).toEqual([2, 5, 10].map((m) => ({ ...baseTraffic, rps: baseTraffic.rps * m })));
    for (const c of calls) expect(c.snapshot.graph).toEqual(graph);
    for (const [, calc] of simulation.run.mock.calls) expect((calc as { kind: string }).kind).toBe("preview");
    expect(simulation.run.mock.calls.every((c) => c[0] === OWNER)).toBe(true);
  });

  it("uses one preview session with rising sequence numbers", async () => {
    const { climb, calls } = service([at(1, 0)]);
    await climb();
    expect(calls.map((c) => c.sequence)).toEqual([0, 1, 2]);
    expect(new Set(calls.map((c) => c.session)).size).toBe(1);
    expect(calls[0].session).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("reports a rate the model does not accept as too large, without calculating it", async () => {
    const big: Traffic = { ...baseTraffic, rps: 5_000_000 };
    const { climb, calls } = service([at(1, 0)], big);
    const out = await climb();
    expect(out.rungs.map((r) => [r.multiplier, r.status])).toEqual([[1, "OK"], [2, "OK"], [5, "TOO_LARGE"], [10, "TOO_LARGE"]]);
    expect(out.rungs[2]).toMatchObject({ rps: 25_000_000, measure: null, limiter: null });
    expect(calls.length).toBe(1);
  });

  it("allows exactly the largest rate the model accepts, and refuses anything above it", async () => {
    const edge: Traffic = { ...baseTraffic, rps: 1_000_000 };
    const { climb, calls } = service([at(1, 0)], edge);
    const out = await climb();
    expect(out.rungs.map((r) => r.status)).toEqual(["OK", "OK", "OK", "OK"]);
    expect(out.rungs[3].rps).toBe(10_000_000);
    expect(calls.length).toBe(3);
    const over = service([at(1, 0)], { ...baseTraffic, rps: 1_000_001 });
    expect((await over.climb()).rungs[3].status).toBe("TOO_LARGE");
  });

  it("marks only the rung that could not be calculated, and keeps the others", async () => {
    const { climb } = service([at(80, 0, "pass", "a"), "busy", at(1200, 0.4)]);
    const out = await climb();
    expect(out.rungs.map((r) => r.status)).toEqual(["OK", "OK", "UNAVAILABLE", "OK"]);
    expect(out.rungs[2]).toMatchObject({ multiplier: 5, rps: 2500, measure: null, limiter: null });
  });

  it("treats a calculation with no result as unavailable, never as a pass", async () => {
    const { climb } = service(["null"]);
    const out = await climb();
    expect(out.rungs.slice(1).every((r) => r.status === "UNAVAILABLE" && r.measure === null)).toBe(true);
  });

  it("lets a failure that is not a calculation refusal through, instead of hiding it", async () => {
    const { climb } = service(["boom"]);
    await expect(climb()).rejects.toThrow("engine exploded");
  });

  it("works for a design with no traffic at all", async () => {
    const quiet: Traffic = { ...baseTraffic, rps: 0 };
    const { climb } = service([at(1, 0, "pass")], quiet);
    const out = await climb();
    expect(out.rungs.map((r) => r.rps)).toEqual([0, 0, 0, 0]);
  });

  it("names no limiter when the model names none", async () => {
    const { climb } = service([at(1, 0, "pass", null)], baseTraffic, runOf(baseTraffic, {}, summary({ bottleneckId: null })));
    const out = await climb();
    expect(out.rungs.every((r) => r.limiter === null)).toBe(true);
  });

  it("stops asking for more calculations once the person has gone, and does not start for a cancelled request", async () => {
    const controller = new AbortController();
    const first = service((i) => {
      if (i === 0) controller.abort();
      return at(1, 0);
    });
    expect(await reason(first.climb(controller.signal))).toEqual({ reason: "CANCELLED" });
    expect(first.calls.length).toBe(1);
    const gone = new AbortController();
    gone.abort();
    const second = service([at(1, 0)]);
    expect(await reason(second.climb(gone.signal))).toEqual({ reason: "CANCELLED" });
    expect(second.calls.length).toBe(0);
  });

  it.each([
    ["a stale revision", { expectedRevision: 3, runId: RUN }, runOf(baseTraffic), "REVISION_MISMATCH"],
    ["a limits run", { expectedRevision: 4, runId: RUN }, runOf(baseTraffic, { kind: "limits" }), "RUN_NOT_USABLE"],
    ["a pending run", { expectedRevision: 4, runId: RUN }, runOf(baseTraffic, { status: "pending" }), "RUN_NOT_USABLE"],
    ["a run of an older revision", { expectedRevision: 4, runId: RUN }, runOf(baseTraffic, { designRevision: 3 }), "RUN_NOT_CURRENT"],
    ["a run whose input is not the saved design", { expectedRevision: 4, runId: RUN }, runOf(baseTraffic, { fingerprint: "a".repeat(64) }), "RUN_NOT_CURRENT"],
  ])("refuses %s and calculates nothing", async (_name, request, run, expected) => {
    const { climb, simulation } = service([at(1, 0)], baseTraffic, run);
    expect(await reason(climb(undefined, request))).toMatchObject({ reason: expected });
    expect(simulation.run).not.toHaveBeenCalled();
  });
});
