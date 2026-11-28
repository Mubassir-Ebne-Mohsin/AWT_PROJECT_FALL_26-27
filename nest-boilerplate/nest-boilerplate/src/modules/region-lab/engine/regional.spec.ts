import { EventHeap } from "@/modules/region-lab/engine/heap";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as random from "@/modules/region-lab/engine/random";
import { RegionalRuntime } from "@/modules/region-lab/engine/regional-runtime";
import {
  simulateRegional as run,
  simulateRegionalExperiment as experiment,
} from "@/modules/region-lab/engine/regional-engine";
import {
  simulateRegionLabScenario,
  adaptRegionalScenario,
} from "@/modules/region-lab/engine/regional-scenario";
import {
  regionalInputSchema,
  type RegionalInput,
} from "@/modules/region-lab/engine/regional-input";
import {
  regionalFixture as fixture,
  deploymentOutage as outage,
} from "@/modules/region-lab/engine/regional.fixture";
import { component, edge } from "@/modules/region-lab/engine/component.fixture";
if (process.env.SF_REGION_STAGE5_FAULT === "transport")
  jest
    .spyOn(RegionalRuntime.prototype, "transfer")
    .mockImplementation((_a, _b, _bytes, _key, done) => {
      done();
      return 0;
    });
if (process.env.SF_REGION_STAGE5_FAULT === "omniscient")
  jest.spyOn(RegionalRuntime.prototype, "route").mockImplementation(function (
    this: RegionalRuntime,
    origin,
    operation,
  ) {
    const r = this.input.routing.find(
      (r) => r.originRegion === origin && r.operationId === operation,
    )!;
    return (
      [r.primaryEntryNodeId, ...r.fallbackEntryNodeIds].find((id) =>
        this.available(id),
      ) ?? null
    );
  });
const node = (r: ReturnType<typeof run>, id: string) =>
  r.nodes.find((n) => n.id === id)!;
describe("regional network and traffic accounting", () => {
  it("counts propagation and bytes once per direction, including client entry", () => {
    const s = fixture();
    s.workload.baselineRps = 1;
    s.workload.operations[0].requestBytes = 1000;
    for (const n of s.network)
      if (n.from === n.to) n.oneWayDelay = { kind: "constant", valueMs: 2 };
    const r = run(s);
    expect(r.summary.successfulRequests).toBe(1);
    expect(r.summary.latency.meanMs).toBeCloseTo(14);
    expect(r.regional!.links.reduce((a, n) => a + n.bytes, 0)).toBe(2000);
    expect(r.regional!.links.reduce((a, n) => a + n.transfers, 0)).toBe(4);
    s.workload.origins[0].shareBps = 0;
    s.workload.origins[1].shareBps = 10000;
    expect(run(s).summary.latency.meanMs).toBeCloseTo(40);
  });
  it("global arrivals split among origins without multiplying total RPS", () => {
    const s = fixture();
    s.workload.origins[0].shareBps = 3000;
    s.workload.origins[1].shareBps = 7000;
    const r = run(s);
    expect(r.summary.offeredRequests).toBe(100);
    expect(
      Object.values(r.origins).reduce((sum, o) => sum + o.offeredRequests, 0),
    ).toBe(100);
    expect(r.origins["us-east"].offeredRequests).toBeGreaterThan(15);
    expect(r.origins["eu-west"].offeredRequests).toBeGreaterThan(50);
  });
  it("nearest healthy uses expected asymmetric RTT, stable IDs, and no capacity oracle", () => {
    const s = fixture();
    s.workload.origins[0].shareBps = 0;
    s.workload.origins[1].shareBps = 10000;
    s.routing.forEach((r) => (r.policy = "nearest_healthy"));
    const r = run(s);
    expect(r.regional!.attemptRoutes["eu-west>browse>app_eu"]).toBe(100);
    expect(r.regional!.reroutedRoots).toBe(0);
    for (const n of s.network) n.oneWayDelay = { kind: "constant", valueMs: 0 };
    const tied = run(s);
    expect(tied.regional!.attemptRoutes["eu-west>browse>app"]).toBe(100);
  });
  it("network serialization still progresses for tiny payloads at high bandwidth", () => {
    const s = fixture();
    s.workload.baselineRps = 1;
    s.workload.operations[0].requestBytes = 1;
    s.network.forEach((n) => (n.bandwidthMbps = 1000000));
    const r = run(s, { limits: { maxEvents: 500 } });
    expect(r.summary.successfulRequests).toBe(1);
    expect(r.summary.latency.meanMs).toBeCloseTo(4.000000016, 8);
    expect(r.diagnostics.processedEvents).toBeLessThan(50);
  });
});
describe("three-region execution", () => {
  it("uses all9 directed pairs and allocates a single global arrival stream", () => {
    const s = fixture(),
      ap = component("app", "app_ap");
    ap.region = "ap-south";
    s.nodes.push(ap, { id: "users_ap", type: "client", region: "ap-south" });
    s.edges.push(edge("app_ap", "db"));
    s.workload.origins[0].shareBps = 3000;
    s.workload.origins[1].shareBps = 3000;
    s.workload.origins.push({
      id: "ap-south",
      shareBps: 4000,
      clientNodeId: "users_ap",
      entryNodeId: "app_ap",
    });
    s.routing.push({
      ...s.routing[0],
      originRegion: "ap-south",
      primaryEntryNodeId: "app_ap",
      fallbackEntryNodeIds: ["app", "app_eu"],
    });
    for (const other of ["us-east", "eu-west", "ap-south"] as const) {
      s.network.push({
        from: "ap-south",
        to: other,
        oneWayDelay: {
          kind: "constant",
          valueMs: other === "ap-south" ? 0 : 70,
        },
        bandwidthMbps: 8,
        provenance: "Synthetic reference",
      });
      if (other !== "ap-south")
        s.network.push({
          from: other,
          to: "ap-south",
          oneWayDelay: { kind: "constant", valueMs: 70 },
          bandwidthMbps: 8,
          provenance: "Synthetic reference",
        });
    }
    const r = run(s);
    expect(r.summary.offeredRequests).toBe(100);
    expect(r.summary.successfulRequests).toBe(100);
    expect(Object.keys(r.origins)).toHaveLength(3);
    expect(r.regional!.links).toHaveLength(9);
    expect(
      Object.values(r.origins).reduce((a, o) => a + o.offeredRequests, 0),
    ).toBe(100);
    expect(r.origins["ap-south"].latency.meanMs).toBeCloseTo(144);
  });
});

describe("regional observed health and recovery clocks", () => {
  it("retains stale routing until detection plus switching, then fails back after recovery", () => {
    const r = run(outage(fixture()));
    expect(r.summary.successfulRequests).toBe(90);
    expect(r.summary.failures.UNAVAILABLE).toBe(10);
    expect(r.regional!.reroutedRoots).toBe(40);
    expect(
      r
        .regional!.phases.filter((p) => p.route === "us-east>browse")
        .map((p) => [p.atMs, p.phase, p.entry]),
    ).toEqual([
      [250, "switching", "app"],
      [300, "rerouted", "app_eu"],
      [650, "recovery_detected", "app_eu"],
      [700, "recovered", "app"],
    ]);
    expect(r.diagnostics.remainingCalls).toBe(0);
    expect(r.diagnostics.remainingBackgroundWork).toBe(0);
  });
  it("each route has its own observation clock", () => {
    const s = outage(fixture());
    s.routing[1].detectionMs = 200;
    s.routing[1].switchMs = 0;
    const phases = run(s).regional!.phases.filter(
      (p) => p.phase === "rerouted",
    );
    expect(phases.find((p) => p.route === "us-east>browse")!.atMs).toBe(300);
    expect(phases.find((p) => p.route === "eu-west>browse")!.atMs).toBe(400);
  });
  it("a short outage does not invent a failover after its detection timer was invalidated", () => {
    const s = outage(fixture());
    s.outage!.durationMs = 20;
    const r = run(s);
    expect(r.summary.failedRequests).toBe(2);
    expect(r.regional!.phases.some((p) => p.phase === "rerouted")).toBe(false);
    expect(r.regional!.reroutedRoots).toBe(0);
  });
  it("returnOnRecovery=false keeps the selected fallback", () => {
    const s = outage(fixture());
    s.routing.forEach((r) => (r.returnOnRecovery = false));
    const r = run(s);
    expect(r.regional!.reroutedRoots).toBe(70);
    expect(
      r
        .regional!.phases.filter((p) => p.phase === "recovered")
        .every((p) => p.entry === "app_eu"),
    ).toBe(true);
  });
  it("no surviving enumerated candidate produces unavailability, never a magic fallback", () => {
    const s = outage(fixture()),
      other = component("app", "app_two");
    s.nodes.push(other);
    s.edges.push(edge("app_two", "db"));
    s.outage!.affectedNodeIds.push("app_two");
    s.routing.forEach((r) => (r.fallbackEntryNodeIds = ["app_two"]));
    s.nodes = s.nodes.filter((n) => n.id !== "app_eu");
    s.edges = s.edges.filter((e) => e.from !== "app_eu");
    const r = run(s);
    expect(r.summary.failedRequests).toBe(50);
    expect(r.regional!.attemptRoutes["us-east>browse>null"]).toBe(40);
    expect(r.warnings.some((w) => w.includes("No surviving"))).toBe(true);
  });
  it("failure beats exact-time service completion and restarts with configured capacity", () => {
    const s = outage(fixture());
    s.workload.baselineRps = 1;
    s.outage!.startMs = 600;
    s.outage!.durationMs = 300;
    const app = s.nodes.find((n) => n.id === "app")!;
    if (app.type !== "app") throw Error("fixture");
    app.properties.serviceTime = { kind: "constant", valueMs: 100 };
    const r = run(s);
    expect(r.summary.failures.UNAVAILABLE).toBe(1);
    expect(r.regional!.abortedCalls).toBe(1);
    expect(node(r, "db").offeredCalls).toBe(0);
    expect(r.diagnostics.remainingCalls).toBe(0);
  });
  it("healthy downstream work keeps its resource after the caller deployment fails", () => {
    const s = outage(fixture());
    s.workload.baselineRps = 1;
    s.outage!.startMs = 600;
    s.outage!.durationMs = 300;
    const db = s.nodes.find((n) => n.type === "db")!;
    if (db.type !== "db") throw Error("fixture");
    db.properties.readServiceTime = { kind: "constant", valueMs: 200 };
    const r = run(s);
    expect(r.summary.failedRequests).toBe(1);
    expect(node(r, "db").lateCompletions).toBe(1);
    expect(node(r, "db").utilizationRatio).toBeCloseTo(0.002);
    expect(r.diagnostics.remainingCalls).toBe(0);
  });
  it("safe retries re-evaluate observed routing within one original deadline", () => {
    const s = outage(fixture());
    s.workload.baselineRps = 2;
    const op = s.workload.operations[0];
    op.deadlineMs = 150;
    op.retry = {
      maxAttempts: 3,
      baseBackoffMs: 50,
      maxBackoffMs: 50,
      jitterRatio: 0,
    };
    const r = run(s);
    expect(r.summary.successfulRequests).toBe(2);
    expect(r.summary.attempts).toBe(3);
    expect(r.summary.latency.meanMs).toBeCloseTo(59);
    expect(r.regional!.reroutedRoots).toBe(1);
    op.deadlineMs = 100;
    const expired = run(s);
    expect(expired.summary.successfulRequests).toBe(1);
    expect(expired.summary.failures.DEADLINE).toBe(1);
    expect(expired.summary.attempts).toBe(3);
  });
});
describe("regional replication and async work", () => {
  it("orders commit application despite out-of-order transport arrivals", () => {
    const s = fixture();
    s.workload.baselineRps = 1000;
    s.workload.durationMs = 2;
    s.workload.schedule[1].atMs = 2;
    s.workload.operations[0].kind = "write";
    for (const n of s.nodes)
      if (n.type === "app")
        n.properties.serviceTime = { kind: "constant", valueMs: 0.1 };
      else if (n.type === "db")
        n.properties.writeServiceTime = { kind: "constant", valueMs: 0.1 };
    const replica = component("replica");
    replica.region = "eu-west";
    s.nodes.push(replica);
    const real = random.sample,
      spy = jest
        .spyOn(random, "sample")
        .mockImplementation((d, seed, ...keys) =>
          keys[0] === "network" && String(keys[1]).startsWith("commit:")
            ? String(keys[1]).startsWith("commit:1:")
              ? 30
              : 0
            : real(d, seed, ...keys),
        );
    try {
      const r = node(run(s), "replica").replication!;
      expect(r.appliedCommits).toBe(2);
      expect(r.meanCommitToApplyMs).toBeCloseTo(35.5);
      expect(r.maxCommitToApplyMs).toBeCloseTo(37);
      expect(r.pendingCommits).toBe(0);
    } finally {
      spy.mockRestore();
    }
  });
  it("worker cross-region fetch/ACK is detached and redelivers through deployment outage", () => {
    const s = outage(fixture()),
      q = component("queue"),
      worker = component("worker");
    worker.region = "eu-west";
    s.nodes.push(q, worker);
    s.edges.push(edge("app", "queue", "async"), edge("queue", "worker"));
    s.outage = { ...s.outage!, region: "eu-west", affectedNodeIds: ["worker"] };
    s.workload.baselineRps = 10;
    const r = run(s),
      stats = node(r, "queue").queue!;
    expect(r.summary.successfulRequests).toBe(10);
    expect(stats.accepted).toBe(
      stats.completed +
        stats.dropped +
        stats.deadLettered +
        stats.waiting +
        stats.delayed +
        stats.inFlight,
    );
    expect(r.diagnostics.remainingBackgroundWork).toBe(0);
    expect(
      r.regional!.links.find((l) => l.pair === "us-east>eu-west")!.transfers,
    ).toBeGreaterThan(0);
  });
});
describe("regional resource boundary references", () => {
  it("directed links share active transfers equally and preserve independent reverse capacity", () => {
    const events = new EventHeap();
    let now = 0,
      sequence = 0,
      pending = 0;
    const done: number[] = [];
    const n = new RegionalRuntime(
      fixture(),
      () => now,
      (time, priority, run) =>
        events.push({ time, priority, sequence: sequence++, run }),
      () => undefined,
      (delta) => {
        pending += delta;
      },
    );
    n.transfer("us-east", "eu-west", 1000000, "a", () => done.push(now));
    n.transfer("us-east", "eu-west", 1000000, "b", () => done.push(now));
    n.transfer("eu-west", "us-east", 1000000, "c", () => done.push(now));
    while (events.peek()) {
      const e = events.pop()!;
      now = e.time;
      e.run();
    }
    expect(done).toEqual([1020, 2010, 2010]);
    expect(pending).toBe(0);
    expect(
      n.result().links.find((l) => l.pair === "us-east>eu-west")!.bytes,
    ).toBe(2000000);
  });
  it("replica log transport adds serialization plus propagation without blocking primary success", () => {
    const s = fixture();
    s.workload.baselineRps = 10;
    s.workload.operations[0].kind = "write";
    s.workload.operations[0].requestBytes = 1000;
    const replica = component("replica");
    replica.region = "eu-west";
    s.nodes.push(replica);
    const r = run(s);
    expect(r.summary.latency.meanMs).toBe(10);
    expect(node(r, "replica").replication!.meanCommitToApplyMs).toBe(15);
    expect(node(r, "replica").replication!.appliedCommits).toBe(10);
  });
  it("worker fetch interrupted by outage retries after recovery with no leaked reservation", () => {
    const s = fixture(),
      q = component("queue"),
      worker = component("worker");
    worker.region = "eu-west";
    s.nodes.push(q, worker);
    s.edges.push(edge("app", "queue", "async"), edge("queue", "worker"));
    s.workload.baselineRps = 1;
    s.outage = {
      id: "worker_fault",
      scope: "application_deployment",
      region: "eu-west",
      affectedNodeIds: ["worker"],
      startMs: 510,
      durationMs: 400,
      inFlightPolicy: "abort_at_failed_node",
    };
    const r = run(s),
      stats = node(r, "queue").queue!;
    expect(r.summary.successfulRequests).toBe(1);
    expect(stats.deliveries).toBe(2);
    expect(stats.completed).toBe(1);
    expect(stats.deadLettered).toBe(0);
    expect(r.regional!.abortedCalls).toBe(1);
    expect(
      r.diagnostics.remainingCalls + r.diagnostics.remainingBackgroundWork,
    ).toBe(0);
  });
  it("gateway recovery resets its token bucket to the configured startup burst", () => {
    const s = outage(fixture()),
      gateway = component("gateway");
    if (gateway.type !== "gateway") throw Error("fixture");
    gateway.properties.rateLimitRps = 0.001;
    gateway.properties.rateLimitBurstRequests = 1;
    s.nodes = s.nodes.filter((n) => n.id !== "app");
    s.nodes.push(gateway);
    s.edges = s.edges.filter((e) => e.from !== "app");
    s.edges.push(edge("gateway", "db"));
    s.workload.origins.forEach((o) => (o.entryNodeId = "gateway"));
    s.routing.forEach((r) => (r.primaryEntryNodeId = "gateway"));
    s.outage!.affectedNodeIds = ["gateway"];
    expect(node(run(s), "gateway").completedCalls).toBe(2);
  });
});

describe("regional validation, targets and paired execution", () => {
  const invalid: [string, (s: RegionalInput) => void][] = [
    [
      "missing reverse link",
      (s) => {
        s.network.splice(
          s.network.findIndex(
            (n) => n.from === "eu-west" && n.to === "us-east",
          ),
          1,
        );
      },
    ],
    [
      "extra RTT",
      (s) => {
        s.edges[0].oneWayDelayMs = 5;
      },
    ],
    [
      "unknown route",
      (s) => {
        s.routing[0].fallbackEntryNodeIds = ["unknown"];
      },
    ],
    [
      "missing route",
      (s) => {
        s.routing.pop();
      },
    ],
    [
      "duplicate candidate",
      (s) => {
        s.routing[0].fallbackEntryNodeIds = ["app"];
      },
    ],
    [
      "database failover",
      (s) => {
        s.outage = {
          id: "bad",
          scope: "application_deployment",
          region: "us-east",
          affectedNodeIds: ["db"],
          startMs: 0,
          durationMs: 1,
          inFlightPolicy: "abort_at_failed_node",
        };
      },
    ],
    [
      "outage outside test",
      (s) => {
        outage(s);
        s.outage!.durationMs = 1000;
      },
    ],
    [
      "unsafe retry",
      (s) => {
        s.workload.operations[0].idempotent = false;
        s.workload.operations[0].retry.maxAttempts = 2;
      },
    ],
    [
      "unknown transport knob",
      (s) => {
        Object.assign(s.network[0], { packetLoss: 0.5 });
      },
    ],
  ];
  it.each(invalid)("rejects%s", (_name, change) => {
    const s = fixture();
    change(s);
    expect(regionalInputSchema.safeParse(s).success).toBe(false);
    expect(() => run(s)).toThrow();
  });
  it("canonical hashes ignore collection order and preserve caller input", () => {
    const s = outage(fixture()),
      original = JSON.stringify(s),
      r = run(s);
    expect(JSON.stringify(s)).toBe(original);
    s.nodes.reverse();
    s.network.reverse();
    s.routing.reverse();
    s.edges.reverse();
    expect(run(s)).toEqual(r);
  });
  it("configured regional targets can prevent a global pass with pooled observed latencies", () => {
    const s = fixture();
    s.workload.baselineRps = 2000;
    const r = run(s);
    expect(r.summary.verdict).toBe("pass");
    s.regionalTargets = [
      { region: "eu-west", p95Ms: 300, errorBudgetRatio: 0.01 },
    ];
    expect(run(s).summary.verdict).toBe("indeterminate");
    s.regionalTargets = [
      { region: "us-east", p95Ms: 1, errorBudgetRatio: 0.01 },
    ];
    expect(run(s).summary.verdict).toBe("fail");
  });
  it("paired sides share offered streams and report individual derived-seed repetitions", () => {
    const s = outage(fixture());
    const r = experiment(s, "paired", 2);
    expect(r.repetitions).toHaveLength(2);
    expect(r.repetitions[0].seed).toBe(42);
    expect(r.repetitions[1].seed).not.toBe(42);
    for (const rep of r.repetitions) {
      expect(rep.baseline!.summary.offeredRequests).toBe(
        rep.outage!.summary.offeredRequests,
      );
      expect(rep.baseline!.summary.failedRequests).toBe(0);
      expect(rep.outage!.summary.failedRequests).toBe(10);
    }
    expect(experiment(s, "paired", 2)).toEqual(r);
  });
  it("aggregate execution cannot multiply event/observation/wall/result budgets", () => {
    const s = outage(fixture());
    const single = experiment(s, "paired", 1);
    const limit =
      single.repetitions[0].baseline!.diagnostics.processedEvents +
      single.repetitions[0].outage!.diagnostics.estimatedEvents;
    expect(() =>
      experiment(s, "paired", 1, { limits: { maxEvents: limit } }),
    ).not.toThrow();
    expect(() =>
      experiment(s, "paired", 2, { limits: { maxEvents: limit } }),
    ).toThrow();
    expect(() =>
      experiment(s, "paired", 1, { limits: { maxResultBytes: 1 } }),
    ).toThrow("result");
    expect(() =>
      experiment(s, "paired", 1, { limits: { maxObservations: 400 } }),
    ).toThrow("observation");
    expect(() => experiment(s, "paired", 6)).toThrow("mode/repetitions");
  });
  it("imports the draft scenario with strict profile resolution and seconds conversion", () => {
    const examples = JSON.parse(
      readFileSync(
        resolve(process.cwd(), "../../docs/region-lab/examples.json"),
        "utf8",
      ),
    );
    const adapted = adaptRegionalScenario(examples.baseline);
    expect(adapted.input.workload.durationMs).toBe(
      examples.baseline.workload.durationSeconds * 1000,
    );
    // Keep this import rehearsal small without claiming calibrated performance.
    examples.baseline.workload.arrival = "constant_rate";
    examples.baseline.workload.warmupSeconds = 0;
    examples.baseline.workload.baselineRps = 1;
    examples.baseline.workload.durationSeconds = 10;
    examples.baseline.workload.schedule = [
      { atSeconds: 0, multiplier: 1 },
      { atSeconds: 10, multiplier: 1 },
    ];
    const r = simulateRegionLabScenario(examples.baseline);
    expect(r.repetitions[0].baseline!.summary.offeredRequests).toBe(10);
    expect(r.provenance.length).toBeGreaterThan(0);
    examples.baseline.profiles[0].properties = Object.fromEntries(
      Object.entries(examples.baseline.profiles[0].properties).reverse(),
    );
    expect(simulateRegionLabScenario(examples.baseline).scenarioHash).toBe(
      r.scenarioHash,
    );
    examples.baseline.profiles[0].properties.cpu = 8;
    expect(() => adaptRegionalScenario(examples.baseline)).toThrow(
      "Unsupported typed profile",
    );
  });
});
