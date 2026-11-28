import {
  simulateFoundation as run,
  FoundationError,
  FOUNDATION_LIMITS,
} from "@/modules/region-lab/engine/engine";
import { foundationSchema } from "@/modules/region-lab/engine/input";
import { EventHeap } from "@/modules/region-lab/engine/heap";
import { ArrivalSchedule } from "@/modules/region-lab/engine/arrivals";
import { uniform, sample, choose } from "@/modules/region-lab/engine/random";
import {
  fixture,
  horizon,
  service,
} from "@/modules/region-lab/engine/foundation.fixture";

// Explicit test-process-only mutation: production scheduling remains unchanged.
if (process.env.SF_REGION_FOUNDATION_FAULT === "deadline-order") {
  const push = EventHeap.prototype.push;
  jest.spyOn(EventHeap.prototype, "push").mockImplementation(function (
    this: EventHeap,
    event,
  ) {
    return push.call(this, {
      ...event,
      priority: event.priority === 0 ? 2 : event.priority,
    });
  });
}

function fault(fn: () => unknown, code: FoundationError["code"]) {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(FoundationError);
  expect((caught as FoundationError).code).toBe(code);
}

describe("Region Lab event foundation: hand-calculated behavior", () => {
  it("D/D/1 below capacity:50 roots,10ms latency and0.5 busy fraction", () => {
    const r = run(fixture());
    expect(r.summary.offeredRequests).toBe(50);
    expect(r.summary.successfulRequests).toBe(50);
    expect(r.summary.latency.meanMs).toBeCloseTo(10, 10);
    expect(r.summary.latency.p50Ms).toBe(10);
    expect(r.nodes[0].utilizationRatio).toBeCloseTo(0.5, 10);
    expect(r.nodes[0].peakQueueDepth).toBe(0);
    expect(r.summary.latency.p95Ms).toBeNull();
    expect(r.summary.verdict).toBe("indeterminate");
  });
  it("D/D/1 sustained overload keeps FIFO work until drain:mean515ms and median510ms", () => {
    const s = fixture();
    s.workload.baselineRps = 100;
    s.nodes[0].serviceTime = { kind: "constant", valueMs: 20 };
    const r = run(s);
    expect(r.summary.successfulRequests).toBe(100);
    expect(r.summary.failedRequests).toBe(0);
    expect(r.summary.latency.meanMs).toBeCloseTo(515, 10);
    expect(r.summary.latency.p50Ms).toBeCloseTo(510, 10);
    expect(r.summary.latency.maxMs).toBeCloseTo(1010, 10);
    expect(r.nodes[0].peakQueueDepth).toBe(50);
    expect(r.diagnostics.remainingWorkAtDrainEnd).toBe(0);
  });
  it("zero waiting capacity rejects excess calls rather than manufacturing throughput", () => {
    const s = fixture();
    s.workload.baselineRps = 200;
    s.nodes[0].waitingCapacityPerReplica = 0;
    const r = run(s);
    expect(r.summary.offeredRequests).toBe(200);
    expect(r.summary.successfulRequests).toBe(100);
    expect(r.summary.failedRequests).toBe(100);
    expect(r.nodes[0].rejectedCalls).toBe(100);
    expect(r.summary.errorRateRatio).toBe(0.5);
    expect(r.summary.verdict).toBe("fail");
  });
  it("adding a real replica or service slot changes capacity without changing service demand", () => {
    for (const change of ["replicas", "slotsPerReplica"] as const) {
      const s = fixture();
      s.workload.baselineRps = 200;
      s.nodes[0].waitingCapacityPerReplica = 0;
      s.nodes[0][change] = 2;
      const r = run(s);
      expect(r.summary.successfulRequests).toBe(200);
      expect(r.summary.failedRequests).toBe(0);
      expect(r.summary.latency.meanMs).toBe(10);
      expect(r.nodes[0].peakBusySlots).toBe(2);
    }
  });
  it("deadline wins a tie with service completion and never becomes a late success", () => {
    const s = horizon(fixture(), 10);
    s.workload.baselineRps = 1000;
    s.nodes[0].serviceTime = { kind: "constant", valueMs: 1 };
    s.nodes[0].waitingCapacityPerReplica = 0;
    s.workload.operations[0].deadlineMs = 1;
    const r = run(s);
    expect(r.summary.offeredRequests).toBe(10);
    expect(r.summary.successfulRequests).toBe(0);
    expect(r.summary.failures.DEADLINE).toBe(10);
    expect(r.nodes[0].lateServiceCompletions).toBe(10);
  });
  it("timed-out processing keeps its slot and still causes later rejection", () => {
    const s = fixture();
    s.workload.baselineRps = 200;
    s.workload.operations[0].deadlineMs = 2;
    s.nodes[0].waitingCapacityPerReplica = 0;
    const r = run(s);
    expect(r.summary.successfulRequests).toBe(0);
    expect(r.summary.failures.DEADLINE).toBe(100);
    expect(r.summary.failures.QUEUE_FULL).toBe(100);
    expect(r.nodes[0].lateServiceCompletions).toBe(100);
    expect(r.nodes[0].utilizationRatio).toBeCloseTo(0.9975, 10);
  });
  it("waiting requests expire without consuming processing slots", () => {
    const s = fixture();
    s.workload.baselineRps = 200;
    s.workload.operations[0].deadlineMs = 2;
    const r = run(s);
    expect(r.summary.failedRequests).toBe(200);
    expect(r.summary.successfulRequests).toBe(0);
    expect(r.nodes[0].queuedDeadlineExpirations).toBe(100);
    expect(r.nodes[0].endingQueueDepth).toBe(0);
  });
  it("late processing beyond the drain remains visible rather than being reported as completed", () => {
    const s = horizon(fixture(), 100);
    s.workload.baselineRps = 10;
    s.workload.operations[0].deadlineMs = 2;
    s.workload.drainMs = 2;
    s.nodes[0].serviceTime = { kind: "constant", valueMs: 1000 };
    const r = run(s);
    expect(r.summary.offeredRequests).toBe(1);
    expect(r.summary.failedRequests).toBe(1);
    expect(r.summary.unresolvedRequests).toBe(0);
    expect(r.diagnostics.remainingWorkAtDrainEnd).toBe(1);
    expect(r.nodes[0].utilizationRatio).toBe(0.5);
  });
  it("retries add attempts and backoff but never create extra unique roots", () => {
    const s = fixture();
    s.workload.baselineRps = 200;
    s.nodes[0].waitingCapacityPerReplica = 0;
    s.workload.operations[0].retry.maxAttempts = 3;
    const r = run(s);
    expect(r.summary.attempts).toBeGreaterThan(200);
    expect(r.summary.attempts).toBeLessThanOrEqual(600);
    expect(r.summary.offeredRequests).toBe(200);
    expect(r.summary.successfulRequests + r.summary.failedRequests).toBe(200);
    expect(r.nodes[0].offeredCalls).toBe(r.summary.attempts);
    expect(r.summary.latency.maxMs).toBeGreaterThan(10);
  });
  it("all attempts share the original deadline", () => {
    const s = fixture();
    s.workload.baselineRps = 200;
    s.nodes[0].waitingCapacityPerReplica = 0;
    s.workload.operations[0].deadlineMs = 6;
    s.workload.operations[0].retry.maxAttempts = 3;
    const r = run(s);
    expect(r.summary.successfulRequests).toBe(0);
    expect(r.summary.unresolvedRequests).toBe(0);
    expect(r.summary.attempts).toBeLessThanOrEqual(400);
  });
  it("synchronous calls include forward and return delay once:5+2+7+2=16ms", () => {
    const s = fixture();
    s.workload.baselineRps = 10;
    s.nodes = [service("app", 5), service("db", 7)];
    s.nodes[0].downstream = [
      { id: "app_db", target: "db", weight: 1, oneWayDelayMs: 2 },
    ];
    const r = run(s);
    expect(r.summary.latency.meanMs).toBe(16);
    expect(r.nodes.find((n) => n.id === "app")!.utilizationRatio).toBeCloseTo(
      0.16,
      10,
    );
    expect(r.nodes.find((n) => n.id === "db")!.utilizationRatio).toBeCloseTo(
      0.07,
      10,
    );
  });
  it("fan-out waits for the slowest concurrent child, not the sum:5+max(11,15)=20ms", () => {
    const s = fixture();
    s.workload.baselineRps = 10;
    s.nodes = [service("app", 5), service("a", 7), service("b", 11)];
    s.nodes[0].downstream = [
      { id: "to_a", target: "a", weight: 1, oneWayDelayMs: 2 },
      { id: "to_b", target: "b", weight: 1, oneWayDelayMs: 2 },
    ];
    const r = run(s);
    expect(r.summary.latency.meanMs).toBe(20);
    expect(r.nodes.every((n) => n.offeredCalls === 10)).toBe(true);
  });
  it("weighted dispatch selects one child and preserves call counts", () => {
    const s = fixture();
    s.workload.baselineRps = 1000;
    s.nodes = [service("app", 1), service("a", 2), service("b", 3)];
    s.nodes.forEach((n) => (n.slotsPerReplica = 100));
    s.nodes[0].dispatch = "weighted_one";
    s.nodes[0].downstream = [
      { id: "to_a", target: "a", weight: 2500, oneWayDelayMs: 0 },
      { id: "to_b", target: "b", weight: 7500, oneWayDelayMs: 0 },
    ];
    const r = run(s),
      a = r.nodes.find((n) => n.id === "a")!,
      b = r.nodes.find((n) => n.id === "b")!;
    expect(a.offeredCalls + b.offeredCalls).toBe(1000);
    expect(a.offeredCalls / 1000).toBeGreaterThan(0.2);
    expect(a.offeredCalls / 1000).toBeLessThan(0.3);
    expect(r.summary.latency.p95Ms).toBe(4);
  });
  it("global percentiles come from root observations rather than regional percentile averages", () => {
    const s = horizon(fixture(), 10000);
    s.workload.baselineRps = 400;
    s.nodes = [service("fast", 1), service("slow", 100)];
    s.nodes.forEach((n) => (n.slotsPerReplica = 1000));
    s.workload.origins = [
      { id: "us-east", shareBps: 5000, entryNodeId: "fast" },
      { id: "eu-west", shareBps: 5000, entryNodeId: "slow" },
    ];
    const r = run(s);
    expect(r.summary.offeredRequests).toBe(4000);
    expect(r.summary.latency.p95Ms).toBe(100);
    expect(r.origins["us-east"].latency.p95Ms).toBe(1);
    expect(r.origins["eu-west"].latency.p95Ms).toBe(100);
    expect(r.summary.latency.p95Ms).not.toBe(50.5);
    expect(
      Object.values(r.origins).reduce((sum, v) => sum + v.offeredRequests, 0),
    ).toBe(4000);
  });
  it("warmup has no measured roots but leaves real processing backlog", () => {
    const s = fixture();
    s.workload.baselineRps = 100;
    s.workload.warmupMs = 1000;
    s.workload.operations[0].deadlineMs = 6000;
    s.workload.drainMs = 6000;
    s.nodes[0].serviceTime = { kind: "constant", valueMs: 20 };
    s.nodes[0].waitingCapacityPerReplica = 500;
    const r = run(s);
    expect(r.warmupOfferedRequests).toBe(100);
    expect(r.summary.offeredRequests).toBe(100);
    expect(r.summary.latency.meanMs).toBeCloseTo(1515, 9);
    expect(r.nodes[0].utilizationRatio).toBeCloseTo(1, 10);
  });
  it("empty traffic is indeterminate with null error/percentiles and no fake activity", () => {
    for (const arrival of ["constant_rate", "poisson"] as const) {
      const s = fixture();
      s.workload.baselineRps = 0;
      s.workload.arrival = arrival;
      const r = run(s);
      expect(r.summary.offeredRequests).toBe(0);
      expect(r.summary.errorRateRatio).toBeNull();
      expect(r.summary.latency.p95Ms).toBeNull();
      expect(r.summary.verdict).toBe("indeterminate");
      expect(r.nodes[0].utilizationRatio).toBe(0);
    }
  });
  it("does not expose p99 without10000 successful roots", () => {
    const s = fixture();
    s.workload.baselineRps = 1000;
    s.nodes[0].slotsPerReplica = 100;
    s.nodes[0].serviceTime = { kind: "constant", valueMs: 1 };
    const r = run(s);
    expect(r.summary.latency.p95Ms).toBe(1);
    expect(r.summary.latency.p99Ms).toBeNull();
    expect(r.summary.verdict).toBe("pass");
  });
  it("has repeatable outputs, no input mutation and canonical node/edge ordering", () => {
    const s = fixture();
    s.nodes = [service("app", 5), service("db", 7)];
    s.nodes[0].downstream = [
      { id: "to_db", target: "db", weight: 1, oneWayDelayMs: 2 },
    ];
    const before = JSON.stringify(s),
      a = run(s);
    expect(run(s)).toEqual(a);
    expect(JSON.stringify(s)).toBe(before);
    s.nodes.reverse();
    expect(run(s)).toEqual(a);
  });
});

describe("Region Lab event foundation: primitives and validation", () => {
  it("orders events by time, deadline priority and stable insertion sequence", () => {
    const h = new EventHeap();
    for (const [time, priority, sequence] of [
      [2, 0, 0],
      [1, 1, 1],
      [1, 0, 2],
      [1, 0, 3],
      [1, 3, 4],
    ])
      h.push({
        time,
        priority,
        sequence,
        run() {
          return undefined;
        },
      });
    expect(Array.from({ length: 5 }, () => h.pop()!.sequence)).toEqual([
      2, 3, 1, 4, 0,
    ]);
    expect(h.pop()).toBeUndefined();
  });
  it("pins the portable keyed-uniform reference vectors", () => {
    expect(uniform(0)).toBe(0.8153782527660951);
    expect(uniform(42, "arrival", 0)).toBe(0.9221178522566333);
    expect(uniform(42, "service", 7, 1, "app")).toBe(0.13982669764664024);
  });
  it("keeps draws strictly inside0..1 and separates stream keys", () => {
    const draws = Array.from({ length: 1000 }, (_, i) =>
      uniform(42, "check", i),
    );
    expect(draws.every((v) => v > 0 && v < 1)).toBe(true);
    expect(new Set(draws).size).toBe(1000);
    expect(uniform(42, "arrival", 0)).not.toBe(uniform(43, "arrival", 0));
  });
  it("uses explicit arithmetic-mean lognormal parameterization", () => {
    const draws = Array.from({ length: 10000 }, (_, i) =>
      sample(
        { kind: "lognormal", meanMs: 10, coefficientOfVariation: 0.5 },
        42,
        "distribution",
        i,
      ),
    );
    const mean = draws.reduce((a, b) => a + b, 0) / draws.length;
    expect(mean).toBeGreaterThan(9.7);
    expect(mean).toBeLessThan(10.3);
  });
  it("excludes zero-weight choices", () => {
    expect(
      choose(
        [
          { id: "zero", w: 0 },
          { id: "selected", w: 1 },
        ],
        (v) => v.w,
        0.00001,
      ).id,
    ).toBe("selected");
  });
  it("inverts linear-ramp intensity analytically and skips zero-rate intervals", () => {
    const s = fixture();
    s.workload.baselineRps = 100;
    s.workload.schedule = [
      { atMs: 0, multiplier: 0 },
      { atMs: 1000, multiplier: 2 },
    ];
    const schedule = new ArrivalSchedule(s.workload);
    expect(schedule.totalMass).toBe(100);
    expect(schedule.atMass(25)).toBeCloseTo(500, 10);
    expect(schedule.atMass(100)).toBeNull();
  });
  it("handles a declining rate and a zero-rate gap without negative/non-finite time", () => {
    const s = fixture();
    s.workload.baselineRps = 100;
    s.workload.schedule = [
      { atMs: 0, multiplier: 2 },
      { atMs: 250, multiplier: 0 },
      { atMs: 750, multiplier: 0 },
      { atMs: 1000, multiplier: 2 },
    ];
    const schedule = new ArrivalSchedule(s.workload);
    expect(schedule.totalMass).toBe(50);
    expect(schedule.atMass(25)).toBe(750);
    expect(schedule.atMass(49)).toBeLessThan(1000);
  });
  it.each([
    "shares",
    "unsafeRetries",
    "cycle",
    "unknownProfileProperty",
    "shortDrain",
    "badSchedule",
    "badWeights",
    "unreachable",
    "nonfinite",
  ] as const)("rejects invalid input: %s", (kind) => {
    const s = fixture();
    if (kind === "shares") s.workload.origins[0].shareBps = 9999;
    if (kind === "unsafeRetries") {
      s.workload.operations[0].idempotent = false;
      s.workload.operations[0].retry.maxAttempts = 2;
    }
    if (kind === "cycle")
      s.nodes[0].downstream = [
        { id: "self", target: "app", weight: 1, oneWayDelayMs: 0 },
      ];
    if (kind === "unknownProfileProperty")
      Object.assign(s.nodes[0], { cpuCores: 64 });
    if (kind === "shortDrain") s.workload.drainMs = 1;
    if (kind === "badSchedule") s.workload.schedule[1].atMs = 1001;
    if (kind === "badWeights") {
      s.nodes.push(service("db"));
      s.nodes[0].dispatch = "weighted_one";
      s.nodes[0].downstream = [
        { id: "to_db", target: "db", weight: 100, oneWayDelayMs: 0 },
      ];
    }
    if (kind === "unreachable") s.nodes.push(service("orphan"));
    if (kind === "nonfinite") s.workload.baselineRps = Infinity;
    expect(foundationSchema.safeParse(s).success).toBe(false);
    fault(() => run(s), "INVALID_INPUT");
  });
  it("rejects full Region Lab inputs rather than silently approximating unsupported capabilities", () => {
    fault(
      () =>
        run({ schemaVersion: 1, engineContract: "region-lab-event-v1-draft" }),
      "UNSUPPORTED_CAPABILITY",
    );
  });
});

describe("Region Lab event foundation: execution controls", () => {
  it("rejects expanded work before executing an oversized scenario", () => {
    fault(
      () => run(fixture(), { limits: { maxEvents: 10 } }),
      "BUDGET_EXCEEDED",
    );
  });
  it("enforces pending-event and live-call bounds", () => {
    fault(
      () => run(fixture(), { limits: { maxPendingEvents: 1 } }),
      "BUDGET_EXCEEDED",
    );
    const s = fixture();
    s.nodes = [service("app", 5), service("db", 7)];
    s.nodes[0].downstream = [
      { id: "to_db", target: "db", weight: 1, oneWayDelayMs: 0 },
    ];
    fault(() => run(s, { limits: { maxLiveCalls: 1 } }), "BUDGET_EXCEEDED");
  });
  it("enforces observation and serialized result bounds", () => {
    fault(
      () => run(fixture(), { limits: { maxObservations: 1 } }),
      "BUDGET_EXCEEDED",
    );
    fault(
      () => run(fixture(), { limits: { maxResultBytes: 1 } }),
      "BUDGET_EXCEEDED",
    );
  });
  it("enforces measured heap growth and wall deadline", () => {
    let reads = 0;
    fault(
      () =>
        run(fixture(), {
          heapUsed: () => (reads++ ? 10000000 : 0),
          limits: { maxHeapGrowthBytes: 1 },
        }),
      "BUDGET_EXCEEDED",
    );
    let tick = 0;
    fault(
      () =>
        run(fixture(), { clock: () => tick++, limits: { maxWallTimeMs: 1 } }),
      "DEADLINE_EXCEEDED",
    );
  });
  it("honors cancellation without returning a partial pass", () => {
    const controller = new AbortController();
    controller.abort();
    fault(() => run(fixture(), { signal: controller.signal }), "CANCELLED");
  });
  it("cannot raise server budgets or invent unknown limits", () => {
    fault(
      () =>
        run(fixture(), {
          limits: { maxEvents: FOUNDATION_LIMITS.maxEvents + 1 },
        }),
      "INVALID_INPUT",
    );
    fault(
      () => run(fixture(), { limits: { unknown: 1 } as never }),
      "INVALID_INPUT",
    );
  });
});
