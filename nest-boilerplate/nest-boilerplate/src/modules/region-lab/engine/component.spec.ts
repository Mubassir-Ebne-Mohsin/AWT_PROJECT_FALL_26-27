import * as random from "@/modules/region-lab/engine/random";
import { simulateComponents as run } from "@/modules/region-lab/engine/component-engine";
import {
  componentInputSchema,
  type ComponentInput,
} from "@/modules/region-lab/engine/component-input";
import {
  component,
  componentFixture as fixture,
  edge,
  setHorizon,
} from "@/modules/region-lab/engine/component.fixture";
import {
  SharedBandwidth,
  TokenBucket,
} from "@/modules/region-lab/engine/component-resources";
import { EventHeap } from "@/modules/region-lab/engine/heap";

if (process.env.SF_REGION_COMPONENT_FAULT === "quota")
  jest.spyOn(TokenBucket.prototype, "take").mockReturnValue(true);
if (process.env.SF_REGION_COMPONENT_FAULT === "bandwidth")
  jest
    .spyOn(SharedBandwidth.prototype, "add")
    .mockImplementation((_bytes, done) => done());
const node = (r: ReturnType<typeof run>, id: string) =>
  r.nodes.find((n) => n.id === id)!;
function between(type: "cache" | "cdn" | "gateway" | "lb") {
  const s = fixture(),
    n = component(type);
  s.nodes.push(n);
  s.edges = [edge("app", type), edge(type, "db")];
  return { s, n };
}
function jobs() {
  const s = fixture(),
    q = component("queue"),
    worker = component("worker");
  if (worker.type !== "worker") throw Error("fixture");
  worker.properties.serviceSlotsPerReplica = 1;
  worker.properties.waitingCapacity = 0;
  worker.properties.serviceTime = { kind: "constant", valueMs: 100 };
  s.nodes.push(q, worker);
  s.edges.push(edge("app", "queue", "async"), edge("queue", "worker"));
  return { s, q, worker };
}
describe("Region Lab typed component behavior", () => {
  it("client traffic produces100 roots without adding demand; app and DB add4ms", () => {
    const r = run(fixture());
    expect(r.summary.offeredRequests).toBe(100);
    expect(r.summary.successfulRequests).toBe(100);
    expect(r.summary.latency.meanMs).toBe(4);
    expect(node(r, "users").utilizationRatio).toBeNull();
    expect(node(r, "app").utilizationRatio).toBeCloseTo(0.004);
    expect(node(r, "db").utilizationRatio).toBeCloseTo(0.003);
  });
  it.each(["cache", "cdn"] as const)(
    "%s hit ratio0/1 changes origin load and hitTime replaces miss service",
    (type) => {
      const { s, n } = between(type);
      if (n.type !== type) throw Error("fixture");
      n.properties.hitRatio = 1;
      const hits = run(s);
      expect(node(hits, "db").offeredCalls).toBe(0);
      expect(node(hits, type).cacheHits).toBe(100);
      expect(hits.summary.latency.meanMs).toBe(1.25);
      n.properties.hitRatio = 0;
      const misses = run(s);
      expect(node(misses, "db").offeredCalls).toBe(100);
      expect(misses.summary.latency.meanMs).toBe(5);
      n.properties.serviceTime = { kind: "constant", valueMs: 5 };
      expect(run(s).summary.latency.meanMs).toBe(9);
      n.properties.hitRatio = 1;
      n.properties.hitTime = { kind: "constant", valueMs: 2 };
      expect(run(s).summary.latency.meanMs).toBe(3);
    },
  );
  it.each(["cache", "cdn"] as const)(
    "%s writes bypass cache despite hit ratio1",
    (type) => {
      const { s, n } = between(type);
      if (n.type !== type) throw Error("fixture");
      n.properties.hitRatio = 1;
      s.workload.operations[0].kind = "write";
      const r = run(s);
      expect(node(r, "db").offeredCalls).toBe(100);
      expect(node(r, type).cacheHits).toBe(0);
      expect(r.summary.latency.meanMs).toBe(9);
    },
  );
  it("seeded Bernoulli cache hits are reproducible and conserve downstream calls", () => {
    const { s, n } = between("cache");
    if (n.type !== "cache") throw Error("fixture");
    n.properties.hitRatio = 0.5;
    const r = run(s),
      c = node(r, "cache");
    expect(run(s)).toEqual(r);
    expect(c.cacheHits + c.cacheMisses).toBe(100);
    expect(node(r, "db").offeredCalls).toBe(c.cacheMisses);
    expect(c.cacheHits).toBeGreaterThan(30);
    expect(c.cacheHits).toBeLessThan(70);
  });
  it.each(["gateway", "external"] as const)(
    "%s rate and burst limits reject before service",
    (type) => {
      const s = fixture(),
        n = component(type);
      if (n.type !== type) throw Error("fixture");
      n.properties.rateLimitRps = 1;
      n.properties.rateLimitBurstRequests = 1;
      s.nodes.push(n);
      if (type === "gateway") s.edges = [edge("app", type), edge(type, "db")];
      else s.edges.push(edge("app", type));
      const r = run(s);
      expect(node(r, type).rateLimitedCalls).toBe(99);
      expect(node(r, type).completedCalls).toBe(1);
      expect(r.summary.successfulRequests).toBe(1);
      n.properties.rateLimitBurstRequests = 3;
      expect(node(run(s), type).completedCalls).toBe(3);
      n.properties.rateLimitRps = 100;
      expect(node(run(s), type).completedCalls).toBe(100);
    },
  );
  it("gateway replicas add pools without multiplying the logical quota", () => {
    const { s, n } = between("gateway");
    if (n.type !== "gateway") throw Error("fixture");
    n.replicas = 2;
    n.properties.rateLimitRps = 1;
    n.properties.rateLimitBurstRequests = 1;
    expect(node(run(s), "gateway").completedCalls).toBe(1);
  });
  it("app replicas and slots relieve saturation; finite FIFO affects rejection", () => {
    const s = fixture(),
      a = s.nodes.find((n) => n.type === "app")!;
    if (a.type !== "app") throw Error("fixture");
    s.workload.baselineRps = 200;
    a.properties.serviceSlotsPerReplica = 1;
    a.properties.serviceTime = { kind: "constant", valueMs: 10 };
    a.properties.waitingCapacity = 0;
    const low = run(s);
    expect(low.summary.failedRequests).toBeGreaterThan(0);
    a.properties.waitingCapacity = 1000;
    const queued = run(s);
    expect(queued.summary.successfulRequests).toBe(200);
    expect(node(queued, "app").peakQueueDepth).toBeGreaterThan(0);
    a.properties.waitingCapacity = 0;
    a.replicas = 3;
    expect(run(s).summary.successfulRequests).toBe(200);
    a.replicas = 1;
    a.properties.serviceSlotsPerReplica = 3;
    expect(run(s).summary.successfulRequests).toBe(200);
  });
  it("LB service overhead precedes weighted dispatch and explicit round-trip delay", () => {
    const { s, n } = between("lb");
    if (n.type !== "lb") throw Error("fixture");
    n.properties.serviceTime = { kind: "constant", valueMs: 2 };
    s.edges[1].oneWayDelayMs = 3;
    expect(run(s).summary.latency.meanMs).toBe(12);
    s.edges[1].dispatch = "weighted_one";
    s.edges[1].weight = 10000;
    expect(run(s).summary.latency.meanMs).toBe(12);
  });
  it("DB read and write properties are separate and contend for one service pool", () => {
    const s = fixture();
    s.workload.operations[0].kind = "write";
    expect(run(s).summary.latency.meanMs).toBe(8);
    const db = s.nodes.find((n) => n.type === "db")!;
    if (db.type !== "db") throw Error("fixture");
    db.properties.writeServiceTime = { kind: "constant", valueMs: 12 };
    expect(run(s).summary.latency.meanMs).toBe(13);
    s.workload.operations[0].kind = "read";
    expect(run(s).summary.latency.meanMs).toBe(4);
    db.properties.serviceSlotsPerReplica = 1;
    db.properties.waitingCapacity = 0;
    s.workload.baselineRps = 1000;
    expect(node(run(s), "db").rejectedCalls).toBeGreaterThan(0);
  });
  it("replica commits apply serially:4ms then7ms lag, independent of root success", () => {
    const s = setHorizon(fixture(), 2),
      rep = component("replica");
    s.nodes.push(rep);
    s.workload.baselineRps = 1000;
    s.workload.operations[0].kind = "write";
    for (const n of s.nodes)
      if (n.type === "app")
        n.properties.serviceTime = { kind: "constant", valueMs: 0.1 };
      else if (n.type === "db")
        n.properties.writeServiceTime = { kind: "constant", valueMs: 0.1 };
    const r = node(run(s), "replica").replication!;
    expect(r.appliedCommits).toBe(2);
    expect(r.meanCommitToApplyMs).toBeCloseTo(5.5);
    expect(r.maxCommitToApplyMs).toBeCloseTo(7);
    expect(r.pendingCommits).toBe(0);
    if (rep.type !== "replica") throw Error("fixture");
    rep.properties.replicationApplyTime = { kind: "constant", valueMs: 1 };
    expect(
      node(run(s), "replica").replication!.meanCommitToApplyMs,
    ).toBeCloseTo(1);
  });
  it("read-only replica service properties control its response time", () => {
    const s = fixture(),
      rep = component("replica");
    s.nodes.push(rep);
    s.edges.push(edge("app", "replica"));
    if (rep.type !== "replica") throw Error("fixture");
    rep.properties.serviceTime = { kind: "constant", valueMs: 9 };
    expect(run(s).summary.latency.meanMs).toBe(10);
    expect(node(run(s), "replica").completedCalls).toBe(100);
  });
  it("async queue ACK adds2ms, not100ms of worker processing; jobs survive parent completion", () => {
    const { s } = jobs();
    s.workload.baselineRps = 10;
    const r = run(s);
    expect(r.summary.latency.meanMs).toBe(4);
    expect(node(r, "queue").queue!.accepted).toBe(10);
    expect(node(r, "queue").queue!.completed).toBe(10);
    expect(node(r, "worker").completedCalls).toBe(10);
    expect(node(r, "queue").utilizationRatio).toBeNull();
  });
  it("queue ackTime changes foreground latency while worker service remains detached", () => {
    const { s, q } = jobs();
    if (q.type !== "queue") throw Error("fixture");
    q.properties.ackTime = { kind: "constant", valueMs: 20 };
    expect(run(s).summary.latency.meanMs).toBe(21);
  });
  it("queue reject_new vs drop_oldest retain a bounded waiting backlog", () => {
    const { s, q, worker } = jobs();
    if (q.type !== "queue" || worker.type !== "worker") throw Error("fixture");
    q.properties.maxDepthJobs = 1;
    worker.properties.serviceTime = { kind: "constant", valueMs: 1000 };
    const rejected = run(s);
    expect(node(rejected, "queue").rejectedCalls).toBe(98);
    expect(node(rejected, "queue").queue!.completed).toBe(2);
    q.properties.overflowPolicy = "drop_oldest";
    const dropped = run(s);
    expect(dropped.summary.successfulRequests).toBe(100);
    expect(node(dropped, "queue").queue!.dropped).toBe(98);
    expect(node(dropped, "queue").queue!.completed).toBe(2);
    expect(dropped.warnings.length).toBe(1);
    q.properties.maxDepthJobs = 100;
    expect(node(run(s), "queue").queue!.dropped).toBe(0);
  });
  it("worker replicas and slots increase queue drain capacity", () => {
    const { s, worker } = jobs();
    if (worker.type !== "worker") throw Error("fixture");
    s.workload.drainMs = 5000;
    const baseline = node(run(s), "queue").queue!.completed;
    worker.replicas = 10;
    const faster = node(run(s), "queue").queue!.completed;
    expect(faster).toBeGreaterThan(baseline);
    expect(faster).toBe(100);
    worker.replicas = 1;
    worker.properties.serviceSlotsPerReplica = 10;
    expect(node(run(s), "queue").queue!.completed).toBe(100);
  });
  it("job deadlines redeliver at most3 times; root attempts are separate", () => {
    const { s, q, worker } = jobs();
    if (q.type !== "queue" || worker.type !== "worker") throw Error("fixture");
    setHorizon(s, 100);
    s.workload.baselineRps = 10;
    s.workload.operations[0].deadlineMs = 10;
    worker.properties.serviceTime = { kind: "constant", valueMs: 20 };
    const r = run(s),
      stats = node(r, "queue").queue!;
    expect(r.summary.successfulRequests).toBe(1);
    expect(r.summary.attempts).toBe(1);
    expect(stats.deliveries).toBe(3);
    expect(stats.deadLettered).toBe(1);
    expect(stats.redeliveries).toBe(2);
    q.properties.maxDeliveryAttempts = 1;
    expect(node(run(s), "queue").queue!.deliveries).toBe(1);
    q.properties.maxDeliveryAttempts = 3;
    q.properties.redeliveryDelayMs = 10000;
    expect(node(run(s), "queue").queue!.deliveries).toBe(1);
    expect(node(run(s), "queue").queue!.delayed).toBe(1);
  });
  it("storage read/write service adds to bytes serialized by its shared bandwidth", () => {
    const s = fixture(),
      storage = component("storage");
    s.nodes.push(storage);
    s.edges.push(edge("app", "storage"));
    s.workload.baselineRps = 1;
    s.workload.operations[0].responseBytes = 1000000;
    expect(run(s).summary.latency.meanMs).toBe(1004);
    if (storage.type !== "storage") throw Error("fixture");
    storage.properties.aggregateBandwidthMbps = 16;
    expect(run(s).summary.latency.meanMs).toBe(504);
    s.workload.operations[0].kind = "write";
    expect(run(s).summary.latency.meanMs).toBe(508);
  });
  it("timed-out storage transfers retain shared resource occupancy", () => {
    const s = fixture(),
      storage = component("storage");
    s.nodes.push(storage);
    s.edges.push(edge("app", "storage"));
    s.workload.baselineRps = 2;
    s.workload.operations[0].responseBytes = 1000000;
    s.workload.operations[0].deadlineMs = 10;
    const r = run(s);
    expect(r.summary.successfulRequests).toBe(0);
    expect(node(r, "storage").lateCompletions).toBe(2);
    expect(node(r, "storage").utilizationRatio).toBeGreaterThan(0);
  });
  it("profiles, operation IDs, replicas and topology canonicalize without mutating callers", () => {
    const s = fixture(),
      original = JSON.stringify(s),
      r = run(s);
    expect(JSON.stringify(s)).toBe(original);
    s.nodes.reverse();
    s.edges.reverse();
    expect(run(s)).toEqual(r);
  });
});
describe("component integration and background accounting", () => {
  it("all12 component types run together with mixed read/write paths and detached jobs", () => {
    const s = fixture();
    const read = s.workload.operations[0];
    read.shareBps = 8000;
    read.requestBytes = 100;
    read.responseBytes = 1000;
    s.workload.operations.push({
      ...read,
      id: "order",
      kind: "write",
      shareBps: 2000,
    });
    for (const type of [
      "cdn",
      "lb",
      "gateway",
      "cache",
      "replica",
      "queue",
      "worker",
      "storage",
      "external",
    ] as const)
      s.nodes.push(component(type));
    s.workload.origins[0].entryNodeId = "lb";
    s.edges = [
      edge("lb", "cdn"),
      edge("cdn", "gateway"),
      edge("gateway", "app"),
      edge("app", "cache"),
      edge("cache", "db"),
      edge("cache", "replica"),
      edge("app", "queue", "async"),
      edge("queue", "worker"),
      edge("worker", "db"),
      edge("app", "storage"),
      edge("app", "external"),
    ];
    for (const e of s.edges)
      e.operationIds = e.to === "replica" ? ["browse"] : ["browse", "order"];
    for (const n of s.nodes)
      if (n.type === "cdn" || n.type === "cache") n.properties.hitRatio = 0.25;
    const r = run(s);
    expect(new Set(r.nodes.map((n) => n.type)).size).toBe(12);
    expect(r.summary.successfulRequests).toBe(100);
    expect(r.summary.failedRequests).toBe(0);
    for (const n of r.nodes)
      if (n.type !== "client") expect(n.offeredCalls).toBeGreaterThan(0);
    const q = node(r, "queue").queue!;
    expect(q.accepted).toBe(q.completed);
    expect(r.diagnostics.remainingBackgroundWork).toBe(0);
    expect(node(r, "replica").replication!.appliedCommits).toBeGreaterThan(0);
    expect(run(s)).toEqual(r);
  });
  it("worker-side waiting buffers are rejected so broker backlog cannot be bypassed", () => {
    const { s, worker } = jobs();
    if (worker.type !== "worker") throw Error("fixture");
    Object.assign(worker.properties, { waitingCapacity: 2 });
    expect(() => run(s)).toThrow();
  });
  it("failed fanout roots release callers even when a child dispatch is still pending", () => {
    const s = fixture(),
      external = component("external");
    if (external.type !== "external") throw Error("fixture");
    external.properties.rateLimitRps = 0.001;
    external.properties.rateLimitBurstRequests = 1;
    s.nodes.push(external);
    s.edges.push(edge("app", "external"));
    s.edges[0].oneWayDelayMs = 100;
    s.workload.baselineRps = 10;
    const r = run(s);
    expect(r.summary.failedRequests).toBe(9);
    expect(r.diagnostics.remainingCalls).toBe(0);
    expect(r.diagnostics.pendingEvents).toBe(0);
  });
  it("warmup jobs and retries conserve physical backlog independently of measured roots", () => {
    const { s, worker, q: queue } = jobs();
    if (worker.type !== "worker" || queue.type !== "queue")
      throw Error("fixture");
    queue.properties.maxDepthJobs = 1000;
    s.workload.warmupMs = 1000;
    worker.properties.serviceTime = { kind: "constant", valueMs: 200 };
    const r = run(s),
      q = node(r, "queue").queue!;
    expect(r.summary.offeredRequests).toBe(100);
    expect(r.warmupOfferedRequests).toBe(100);
    expect(q.accepted).toBe(200);
    expect(q.accepted).toBe(
      q.completed +
        q.dropped +
        q.deadLettered +
        q.waiting +
        q.inFlight +
        q.delayed,
    );
  });
  it("background work remains after foreground timeout without resurrecting the root", () => {
    const { s, q } = jobs();
    if (q.type !== "queue") throw Error("fixture");
    setHorizon(s, 100);
    s.workload.baselineRps = 10;
    s.workload.operations[0].deadlineMs = 10;
    q.properties.ackTime = { kind: "constant", valueMs: 20 };
    const r = run(s);
    expect(r.summary.failedRequests).toBe(1);
    expect(r.summary.successfulRequests).toBe(0);
    expect(node(r, "queue").queue!.deadLettered).toBe(1);
    expect(node(r, "worker").lateCompletions).toBe(3);
  });
  it("write service completion can still commit after the client times out", () => {
    const s = fixture();
    s.nodes.push(component("replica"));
    s.workload.operations[0].kind = "write";
    s.workload.operations[0].deadlineMs = 2;
    const r = run(s);
    expect(r.summary.failedRequests).toBe(100);
    expect(node(r, "replica").replication!.appliedCommits).toBe(100);
    expect(node(r, "db").lateCompletions).toBe(100);
  });
});

describe("common pool properties across typed components", () => {
  it.each([
    "app",
    "lb",
    "gateway",
    "cdn",
    "cache",
    "db",
    "replica",
    "storage",
    "external",
  ] as const)("%s demand/slots/FIFO have observable effects", (type) => {
    const s = fixture();
    let target = s.nodes.find((n) => n.type === type);
    if (!target) {
      target = component(type);
      s.nodes.push(target);
      if (
        type === "lb" ||
        type === "gateway" ||
        type === "cdn" ||
        type === "cache"
      )
        s.edges = [edge("app", type), edge(type, "db")];
      else s.edges.push(edge("app", type));
    }
    if (target.type === "client" || target.type === "queue")
      throw Error("fixture");
    const p = target.properties;
    if ("serviceTime" in p) p.serviceTime = { kind: "constant", valueMs: 20 };
    else p.readServiceTime = { kind: "constant", valueMs: 20 };
    p.serviceSlotsPerReplica = 1;
    p.waitingCapacity = 0;
    s.workload.baselineRps = 200;
    const saturated = run(s);
    expect(node(saturated, type).rejectedCalls).toBeGreaterThan(0);
    p.waitingCapacity = 1000;
    const buffered = run(s);
    expect(buffered.summary.successfulRequests).toBe(200);
    expect(node(buffered, type).peakQueueDepth).toBeGreaterThan(0);
    p.waitingCapacity = 0;
    p.serviceSlotsPerReplica = 5;
    const parallel = run(s);
    expect(parallel.summary.successfulRequests).toBe(200);
    expect(parallel.summary.latency.meanMs!).toBeLessThan(
      buffered.summary.latency.meanMs!,
    );
  });
  it("variable queue ACK durations preserve acceptance FIFO", () => {
    const { s, worker } = jobs();
    if (worker.type !== "worker") throw Error("fixture");
    setHorizon(s, 100);
    s.workload.baselineRps = 20;
    worker.properties.serviceTime = { kind: "constant", valueMs: 1 };
    const starts: string[] = [];
    const real = random.sample;
    const spy = jest
      .spyOn(random, "sample")
      .mockImplementation((distribution, seed, ...keys) => {
        if (keys[0] === "ack") return keys[1] === 1 ? 100 : 0;
        if (keys[0] === "service" && String(keys.at(-1)).startsWith("queue/"))
          starts.push(String(keys[1]));
        return real(distribution, seed, ...keys);
      });
    try {
      const r = run(s);
      expect(starts).toEqual(["job:0", "job:1"]);
      expect(node(r, "queue").queue!.completed).toBe(2);
    } finally {
      spy.mockRestore();
    }
  });
  it("guards background apply/live memory, wall execution and option bounds", () => {
    const s = fixture();
    s.nodes.push(component("replica"));
    s.workload.operations[0].kind = "write";
    expect(() => run(s, { limits: { maxLiveCalls: 1 } })).toThrow("budget");
    let h = 0;
    expect(() =>
      run(s, {
        heapUsed: () => (h++ ? 1000000 : 0),
        limits: { maxHeapGrowthBytes: 1 },
      }),
    ).toThrow("budget");
    let t = 0;
    expect(() =>
      run(s, { clock: () => t++, limits: { maxWallTimeMs: 1 } }),
    ).toThrow("deadline");
    expect(() => run(s, { limits: { maxEvents: 3000000 } })).toThrow("lowered");
  });
});

describe("retained retry capacity", () => {
  it("delayed redeliveries consume broker depth and cannot form a hidden backlog", () => {
    const { s, q, worker } = jobs();
    if (q.type !== "queue" || worker.type !== "worker") throw Error("fixture");
    s.workload.baselineRps = 10;
    s.workload.operations[0].deadlineMs = 10;
    q.properties.maxDepthJobs = 1;
    q.properties.redeliveryDelayMs = 1000;
    worker.properties.serviceTime = { kind: "constant", valueMs: 20 };
    const r = run(s),
      stats = node(r, "queue").queue!;
    expect(stats.accepted).toBe(1);
    expect(node(r, "queue").rejectedCalls).toBe(9);
    expect(stats.deliveries).toBe(3);
    expect(stats.deadLettered).toBe(1);
    expect(node(r, "queue").peakQueueDepth).toBe(1);
    expect(stats.accepted).toBe(
      stats.completed +
        stats.dropped +
        stats.deadLettered +
        stats.waiting +
        stats.inFlight +
        stats.delayed,
    );
  });
  it("drop_oldest removes delayed retries without resurrecting discarded jobs", () => {
    const { s, q, worker } = jobs();
    if (q.type !== "queue" || worker.type !== "worker") throw Error("fixture");
    s.workload.baselineRps = 10;
    s.workload.operations[0].deadlineMs = 10;
    q.properties.maxDepthJobs = 1;
    q.properties.overflowPolicy = "drop_oldest";
    q.properties.redeliveryDelayMs = 1000;
    worker.properties.serviceTime = { kind: "constant", valueMs: 20 };
    const stats = node(run(s), "queue").queue!;
    expect(stats.accepted).toBe(10);
    expect(stats.dropped).toBe(9);
    expect(stats.deadLettered).toBe(1);
    expect(stats.deliveries).toBe(12);
    expect(stats.waiting + stats.delayed + stats.inFlight).toBe(0);
  });
});

describe("storage timestamp precision", () => {
  it.each([1, 3, 1000])(
    "completes%s bytes at high bandwidth without zero-time event loops",
    (bytes) => {
      const s = fixture(),
        storage = component("storage");
      if (storage.type !== "storage") throw Error("fixture");
      storage.properties.aggregateBandwidthMbps = 1000000;
      s.nodes.push(storage);
      s.edges.push(edge("app", "storage"));
      s.workload.baselineRps = 1;
      s.workload.operations[0].requestBytes = bytes;
      const r = run(s, { limits: { maxEvents: 500 } });
      expect(r.summary.successfulRequests).toBe(1);
      expect(r.summary.latency.meanMs).toBeCloseTo(
        4 + (bytes * 8) / 1000000000,
        8,
      );
      expect(r.diagnostics.processedEvents).toBeLessThan(40);
      expect(r.diagnostics.remainingCalls).toBe(0);
    },
  );
});

describe("component resource numerical references", () => {
  it("token bucket is full, caps idle refill and admits exactly at500ms", () => {
    const b = new TokenBucket(2, 2);
    expect(b.take(0)).toBe(true);
    expect(b.take(0)).toBe(true);
    expect(b.take(0)).toBe(false);
    expect(b.take(499)).toBe(false);
    expect(b.take(500)).toBe(true);
    expect(b.take(100000)).toBe(true);
    expect(b.take(100000)).toBe(true);
    expect(b.take(100000)).toBe(false);
  });
  it.each([false, true])(
    "8Mbps equal-share transfer, staggered=%s",
    (staggered) => {
      const events = new EventHeap();
      let now = 0,
        seq = 0;
      const done: number[] = [];
      const schedule = (at: number, run: () => void) =>
        events.push({ time: at, priority: 1, sequence: seq++, run });
      const link = new SharedBandwidth(1000, () => now, schedule);
      link.add(1000000, () => done.push(now));
      schedule(staggered ? 500 : 0, () =>
        link.add(1000000, () => done.push(now)),
      );
      while (events.peek()) {
        const e = events.pop()!;
        now = e.time;
        e.run();
      }
      expect(done).toEqual(staggered ? [1500, 2000] : [2000, 2000]);
      expect(link.active).toBe(0);
    },
  );
});
describe("component boundaries reject unsupported imports", () => {
  const invalid: [string, (s: ComponentInput) => void][] = [
    [
      "CPU knobs",
      (s) => {
        Object.assign(s.nodes[1], { cpu: 8 });
      },
    ],
    [
      "provider replicas",
      (s) => {
        const n = component("external");
        Object.assign(n, { replicas: 2 });
        s.nodes.push(n);
        s.edges.push(edge("app", "external"));
      },
    ],
    [
      "cross-region inference",
      (s) => {
        s.nodes[2].region = "eu-west";
      },
    ],
    [
      "unsafe retries",
      (s) => {
        s.workload.operations[0].idempotent = false;
        s.workload.operations[0].retry.maxAttempts = 2;
      },
    ],
    [
      "missing profile version",
      (s) => {
        Object.assign(s.nodes[1], { profileVersion: undefined });
      },
    ],
    [
      "write into replica",
      (s) => {
        s.nodes.push(component("replica"));
        s.edges.push(edge("app", "replica"));
        s.workload.operations[0].kind = "write";
      },
    ],
    [
      "sync queue target",
      (s) => {
        s.nodes.push(component("queue"), component("worker"));
        s.edges.push(edge("app", "queue"), edge("queue", "worker"));
      },
    ],
    [
      "ambiguous worker consumers",
      (s) => {
        s.nodes.push(component("queue"), component("worker"));
        s.edges.push(
          edge("app", "queue", "async"),
          edge("queue", "worker"),
          edge("db", "worker"),
        );
      },
    ],
    [
      "unsupported primary promotion",
      (s) => {
        Object.assign(s, { promotion: true });
      },
    ],
    [
      "conflicting profile identity",
      (s) => {
        const n = component("lb");
        Object.assign(n, { profileId: "app_profile" });
        s.nodes.push(n);
        s.edges.push(edge("app", "lb"));
      },
    ],
  ];
  it.each(invalid)("rejects%s", (_label, change) => {
    const s = fixture();
    change(s);
    expect(componentInputSchema.safeParse(s).success).toBe(false);
    expect(() => run(s)).toThrow();
  });
  it("refuses full regional scenarios and enforces event/heap/result/cancellation bounds", () => {
    expect(() => run({ engineContract: "region-lab-event-v1-draft" })).toThrow(
      "stage5",
    );
    expect(() => run(fixture(), { limits: { maxEvents: 1 } })).toThrow(
      "admission",
    );
    expect(() => run(fixture(), { limits: { maxResultBytes: 1 } })).toThrow(
      "result",
    );
    expect(() => run(fixture(), { limits: { maxPendingEvents: 1 } })).toThrow(
      "budget",
    );
    const c = new AbortController();
    c.abort();
    expect(() => run(fixture(), { signal: c.signal })).toThrow("cancelled");
  });
});
