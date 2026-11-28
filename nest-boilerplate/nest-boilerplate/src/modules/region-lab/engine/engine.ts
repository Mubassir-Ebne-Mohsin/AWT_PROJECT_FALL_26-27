import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import {
  foundationSchema,
  type FoundationInput,
  type Operation,
  type ProcessingNode,
} from "@/modules/region-lab/engine/input";
import { EventHeap } from "@/modules/region-lab/engine/heap";
import { ArrivalSchedule } from "@/modules/region-lab/engine/arrivals";
import { choose, sample, uniform } from "@/modules/region-lab/engine/random";

export const FOUNDATION_VERSION = "region-lab-foundation-v1" as const;
export const FOUNDATION_LIMITS = Object.freeze({
  maxEvents: 2_000_000,
  maxPendingEvents: 200_000,
  maxLiveCalls: 100_000,
  maxObservations: 600_000,
  maxWallTimeMs: 45_000,
  maxHeapGrowthBytes: 256 * 1024 * 1024,
  maxResultBytes: 2 * 1024 * 1024,
});
type Limits = typeof FOUNDATION_LIMITS;
export type FoundationFailure =
  | "INVALID_INPUT"
  | "UNSUPPORTED_CAPABILITY"
  | "BUDGET_EXCEEDED"
  | "DEADLINE_EXCEEDED"
  | "CANCELLED"
  | "NUMERICAL_ERROR";
export class FoundationError extends Error {
  constructor(
    readonly code: FoundationFailure,
    message: string,
  ) {
    super(message);
    this.name = "FoundationError";
  }
}
export interface FoundationOptions {
  onSamples?: (scope: string, samples: readonly number[]) => void;
  onRootEvent?: (event: {kind: string; arrivedMs: number; latencyMs?: number; error?: string | null}) => void;
  limits?: Partial<Record<keyof Limits, number>>;
  signal?: AbortSignal;
  clock?: () => number;
  heapUsed?: () => number;
}
type Reason = "QUEUE_FULL" | "DEADLINE";
interface Counts {
  offered: number;
  successful: number;
  failed: number;
  attempts: number;
  reasons: Record<Reason, number>;
  latencies: number[];
}
interface Root {
  id: number;
  origin: string;
  operation: Operation;
  arrivedAt: number;
  deadline: number;
  measured: boolean;
  done: boolean;
  attempt: number;
  calls: Set<Call>;
}
interface Pool {
  busy: number;
  waiting: Call[];
}
interface RuntimeNode {
  definition: ProcessingNode;
  pools: Pool[];
  calls: number;
  completed: number;
  failed: number;
  rejected: number;
  queuedExpired: number;
  lateServices: number;
  busySlotMs: number;
  peakBusy: number;
  peakQueue: number;
}
interface Call {
  root: Root;
  node: RuntimeNode;
  pool: Pool;
  path: string;
  state: "queued" | "processing" | "children" | "done";
  startedAt: number | null;
  remainingChildren: number;
  callback: (error: Reason | null) => void;
}
const counts = (): Counts => ({
  offered: 0,
  successful: 0,
  failed: 0,
  attempts: 0,
  reasons: { QUEUE_FULL: 0, DEADLINE: 0 },
  latencies: [],
});

/** Stage3 kernel only. Not a Region Lab scenario adapter, HTTP service, regional-failure model or calibrated component model. */
export function simulateFoundation(
  value: unknown,
  options: FoundationOptions = {},
) {
  if (typeof value === "object" && value !== null && "engineContract" in value)
    throw new FoundationError(
      "UNSUPPORTED_CAPABILITY",
      "Full Region Lab scenarios require later typed-component and regional adapters",
    );
  const parsed = foundationSchema.safeParse(value);
  if (!parsed.success)
    throw new FoundationError(
      "INVALID_INPUT",
      parsed.error.issues
        .slice(0, 8)
        .map((i) => i.message)
        .join("; "),
    );
  const input: FoundationInput = parsed.data;
  input.nodes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  input.nodes.forEach((n) =>
    n.downstream.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  );
  input.workload.origins.sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  input.workload.operations.sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  const limits: Record<keyof Limits, number> = { ...FOUNDATION_LIMITS };
  for (const key of Object.keys(options.limits ?? {}) as (keyof Limits)[]) {
    const limit = options.limits![key]!;
    if (
      !Object.hasOwn(FOUNDATION_LIMITS, key) ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > FOUNDATION_LIMITS[key]
    )
      throw new FoundationError(
        "INVALID_INPUT",
        "Budget overrides may only lower authoritative positive integer limits",
      );
    limits[key] = limit;
  }
  const clock = options.clock ?? (() => performance.now()),
    heapUsed = options.heapUsed ?? (() => process.memoryUsage().heapUsed);
  const wallStart = clock(),
    heapStart = heapUsed();
  const events = new EventHeap(),
    workload = input.workload,
    schedule = new ArrivalSchedule(workload);
  const measureStart = workload.warmupMs,
    measureEnd = measureStart + workload.durationMs,
    stopAt = measureEnd + workload.drainMs;
  const total = counts(),
    byOrigin = new Map(workload.origins.map((o) => [o.id as string, counts()])),
    byOperation = new Map(workload.operations.map((o) => [o.id, counts()]));
  const runtime = new Map<string, RuntimeNode>(
    input.nodes.map((definition) => [
      definition.id,
      {
        definition,
        pools: Array.from({ length: definition.replicas }, () => ({
          busy: 0,
          waiting: [],
        })),
        calls: 0,
        completed: 0,
        failed: 0,
        rejected: 0,
        queuedExpired: 0,
        lateServices: 0,
        busySlotMs: 0,
        peakBusy: 0,
        peakQueue: 0,
      },
    ]),
  );
  let now = 0,
    sequence = 0,
    processedEvents = 0,
    liveCalls = 0,
    observationCount = 0,
    peakPendingEvents = 0,
    peakLiveCalls = 0,
    pendingRoots = 0,
    warmupOffered = 0;
  const active = new Set<Call>();
  const measuredTime = () => now >= measureStart && now < measureEnd;
  const groups = (root: Root) => [
    total,
    byOrigin.get(root.origin)!,
    byOperation.get(root.operation.id)!,
  ];
  const clipped = (start: number, end: number) =>
    Math.max(0, Math.min(end, measureEnd) - Math.max(start, measureStart));
  function guard() {
    if (options.signal?.aborted)
      throw new FoundationError(
        "CANCELLED",
        "Foundation calculation cancelled; no completed result",
      );
    if (clock() - wallStart > limits.maxWallTimeMs)
      throw new FoundationError(
        "DEADLINE_EXCEEDED",
        "Foundation execution wall deadline exceeded",
      );
    const estimatedLiveBytes =
      events.size * 768 + liveCalls * 768 + observationCount * 16;
    if (
      events.size > limits.maxPendingEvents ||
      liveCalls > limits.maxLiveCalls ||
      observationCount > limits.maxObservations ||
      estimatedLiveBytes > limits.maxHeapGrowthBytes ||
      heapUsed() - heapStart > limits.maxHeapGrowthBytes
    )
      throw new FoundationError(
        "BUDGET_EXCEEDED",
        "Foundation memory/event/observation budget exceeded",
      );
  }
  function enqueue(time: number, priority: number, run: () => void) {
    if (!Number.isFinite(time) || time < now)
      throw new FoundationError(
        "NUMERICAL_ERROR",
        "Non-finite or backwards event time",
      );
    events.push({ time, priority, sequence: sequence++, run });
    peakPendingEvents = Math.max(peakPendingEvents, events.size);
    if (events.size > limits.maxPendingEvents)
      throw new FoundationError(
        "BUDGET_EXCEEDED",
        "Pending-event budget exceeded",
      );
  }
  const expandedVisits = new Map<string, number>();
  function visits(id: string): number {
    if (expandedVisits.has(id)) return expandedVisits.get(id)!;
    const n = runtime.get(id)!.definition,
      children = n.downstream.map((e) => visits(e.target));
    const v =
      1 +
      (n.dispatch === "all"
        ? children.reduce((sum, c) => sum + c, 0)
        : Math.max(0, ...children));
    expandedVisits.set(id, v);
    return v;
  }
  const requestsBound =
    schedule.totalMass === 0
      ? 0
      : workload.arrival === "constant_rate"
        ? Math.floor(schedule.totalMass + 0.5)
        : Math.ceil(
            schedule.totalMass + 10 * Math.sqrt(schedule.totalMass) + 32,
          );
  const visitsBound = Math.max(
    ...workload.origins
      .filter((o) => o.shareBps > 0)
      .map((o) => visits(o.entryNodeId)),
  );
  const attemptsBound = Math.max(
    ...workload.operations.map((o) => o.retry.maxAttempts),
  );
  const estimatedEvents = requestsBound * (3 + attemptsBound * visitsBound * 4);
  if (estimatedEvents > limits.maxEvents)
    throw new FoundationError(
      "BUDGET_EXCEEDED",
      "Expanded arrival/call demand exceeds the event admission budget",
    );
  guard();

  function peaks(n: RuntimeNode) {
    if (!measuredTime()) return;
    n.peakBusy = Math.max(
      n.peakBusy,
      n.pools.reduce((sum, p) => sum + p.busy, 0),
    );
    n.peakQueue = Math.max(
      n.peakQueue,
      n.pools.reduce((sum, p) => sum + p.waiting.length, 0),
    );
  }
  function finishRoot(root: Root, error: Reason | null) {
    if (root.done) return;
    root.done = true;
    if (!root.measured) return;
    pendingRoots--;
    for (const c of groups(root)) {
      if (error) {
        c.failed++;
        c.reasons[error]++;
      } else {
        c.successful++;
        c.latencies.push(now - root.arrivedAt);
        observationCount++;
      }
    }
  }
  function retryOrFinish(root: Root, error: Reason | null) {
    if (root.done) return;
    if (!error) {
      finishRoot(root, null);
      return;
    }
    if (
      error === "DEADLINE" ||
      now >= root.deadline ||
      root.attempt >= root.operation.retry.maxAttempts
    ) {
      finishRoot(root, error);
      return;
    }
    const retry = root.operation.retry;
    const base = Math.min(
      retry.maxBackoffMs,
      retry.baseBackoffMs * 2 ** (root.attempt - 1),
    );
    const jitter =
      1 +
      (2 * uniform(input.seed, "retry", root.id, root.attempt) - 1) *
        retry.jitterRatio;
    const at = now + Math.min(retry.maxBackoffMs, base * jitter);
    if (at < root.deadline) enqueue(at, 3, () => attempt(root));
  }
  function drain(n: RuntimeNode, pool: Pool) {
    while (pool.busy < n.definition.slotsPerReplica && pool.waiting.length) {
      const next = pool.waiting.shift()!;
      if (next.state !== "queued") continue;
      if (next.root.done || now >= next.root.deadline) {
        if (next.root.measured) n.queuedExpired++;
        finishCall(next, "DEADLINE");
      } else start(next);
    }
    peaks(n);
  }
  function finishCall(call: Call, error: Reason | null) {
    if (call.state === "done") return;
    const wasQueued = call.state === "queued";
    call.state = "done";
    active.delete(call);
    call.root.calls.delete(call);
    liveCalls--;
    if (wasQueued) {
      const at = call.pool.waiting.indexOf(call);
      if (at >= 0) call.pool.waiting.splice(at, 1);
    } else {
      call.node.busySlotMs += clipped(call.startedAt!, now);
      call.pool.busy--;
    }
    if (call.root.measured) {
      if (error) call.node.failed++;
      else call.node.completed++;
    }
    call.callback(error);
    if (!wasQueued) drain(call.node, call.pool);
  }
  function start(call: Call) {
    call.state = "processing";
    call.startedAt = now;
    call.pool.busy++;
    peaks(call.node);
    const duration = sample(
      call.node.definition.serviceTime,
      input.seed,
      "service",
      call.root.id,
      call.root.attempt,
      call.path,
    );
    if (!Number.isFinite(duration) || duration < 0)
      throw new FoundationError("NUMERICAL_ERROR", "Invalid service-time draw");
    enqueue(now + duration, 1, () => {
      if (call.state === "done") return;
      if (call.root.done || now >= call.root.deadline) {
        if (call.root.measured) call.node.lateServices++;
        finishCall(call, "DEADLINE");
        return;
      }
      const definition = call.node.definition;
      const children =
        definition.dispatch === "all" || !definition.downstream.length
          ? definition.downstream
          : [
              choose(
                definition.downstream,
                (e) => e.weight,
                uniform(
                  input.seed,
                  "dispatch",
                  call.root.id,
                  call.root.attempt,
                  call.path,
                ),
              ),
            ];
      if (!children.length) {
        finishCall(call, null);
        return;
      }
      call.state = "children";
      call.remainingChildren = children.length;
      for (const edge of children)
        enqueue(now + edge.oneWayDelayMs, 3, () => {
          if (call.root.done || call.state === "done") return;
          enter(call.root, edge.target, call.path + "/" + edge.id, (error) =>
            enqueue(now + edge.oneWayDelayMs, 1, () => {
              if (call.state === "done") return;
              if (error) finishCall(call, error);
              else if (--call.remainingChildren === 0) finishCall(call, null);
            }),
          );
        });
    });
  }
  function enter(
    root: Root,
    nodeId: string,
    path: string,
    callback: (error: Reason | null) => void,
  ) {
    if (root.done || now >= root.deadline) {
      callback("DEADLINE");
      return;
    }
    const n = runtime.get(nodeId)!;
    if (root.measured) n.calls++;
    let pool: Pool | undefined,
      best = Infinity;
    for (const candidate of n.pools)
      if (
        (candidate.busy < n.definition.slotsPerReplica ||
          candidate.waiting.length < n.definition.waitingCapacityPerReplica) &&
        candidate.busy + candidate.waiting.length < best
      ) {
        pool = candidate;
        best = candidate.busy + candidate.waiting.length;
      }
    if (!pool) {
      if (root.measured) {
        n.rejected++;
        n.failed++;
      }
      callback("QUEUE_FULL");
      return;
    }
    const call: Call = {
      root,
      node: n,
      pool,
      path,
      state: "queued",
      startedAt: null,
      remainingChildren: 0,
      callback,
    };
    liveCalls++;
    peakLiveCalls = Math.max(peakLiveCalls, liveCalls);
    active.add(call);
    root.calls.add(call);
    if (liveCalls > limits.maxLiveCalls)
      throw new FoundationError("BUDGET_EXCEEDED", "Live-call budget exceeded");
    if (pool.busy < n.definition.slotsPerReplica) start(call);
    else {
      pool.waiting.push(call);
      peaks(n);
    }
  }
  function attempt(root: Root) {
    if (root.done || now >= root.deadline) return;
    root.attempt++;
    if (root.measured) for (const c of groups(root)) c.attempts++;
    const origin = workload.origins.find((o) => o.id === root.origin)!;
    enter(
      root,
      origin.entryNodeId,
      origin.entryNodeId + ":" + root.attempt,
      (error) => retryOrFinish(root, error),
    );
  }
  let nextRoot = 0;
  let mass =
    workload.arrival === "constant_rate"
      ? 0.5
      : -Math.log(uniform(input.seed, "arrival", 0));
  function nextArrival() {
    const at = schedule.atMass(mass);
    if (at === null || at >= measureEnd) return;
    const rootId = nextRoot++;
    enqueue(at, 3, () => {
      const origin = choose(
        workload.origins,
        (o) => o.shareBps,
        uniform(input.seed, "origin", rootId),
      );
      const operation = choose(
        workload.operations,
        (o) => o.shareBps,
        uniform(input.seed, "operation", rootId),
      );
      const measured = measuredTime();
      const root: Root = {
        id: rootId,
        origin: origin.id,
        operation,
        arrivedAt: now,
        deadline: now + operation.deadlineMs,
        measured,
        done: false,
        attempt: 0,
        calls: new Set(),
      };
      if (measured) {
        pendingRoots++;
        for (const c of groups(root)) c.offered++;
      } else warmupOffered++;
      enqueue(root.deadline, 0, () => {
        if (root.done) return;
        finishRoot(root, "DEADLINE");
        for (const call of [...root.calls])
          if (call.state === "queued" || call.state === "children") {
            if (call.state === "queued" && root.measured)
              call.node.queuedExpired++;
            finishCall(call, "DEADLINE");
          }
      });
      attempt(root);
      mass +=
        workload.arrival === "constant_rate"
          ? 1
          : -Math.log(uniform(input.seed, "arrival", nextRoot));
      nextArrival();
    });
  }
  enqueue(measureStart, 2, () => runtime.forEach(peaks));
  nextArrival();
  while (events.peek() && events.peek()!.time <= stopAt) {
    if (++processedEvents > limits.maxEvents)
      throw new FoundationError(
        "BUDGET_EXCEEDED",
        "Processed-event budget exceeded",
      );
    guard();
    const event = events.pop()!;
    now = event.time;
    event.run();
  }
  guard();
  for (const call of active)
    if (call.startedAt !== null)
      call.node.busySlotMs += clipped(call.startedAt, stopAt);
  function summarize(c: Counts) {
    c.latencies.sort((a, b) => a - b);
    const quantile = (q: number) =>
      c.latencies[Math.max(0, Math.ceil(q * c.latencies.length) - 1)];
    const p50Ms = c.successful ? quantile(0.5) : null,
      p95Ms = c.successful >= 1000 ? quantile(0.95) : null,
      p99Ms = c.successful >= 10000 ? quantile(0.99) : null;
    const unresolved = c.offered - c.successful - c.failed,
      errorRateRatio = c.offered ? c.failed / c.offered : null;
    if (unresolved < 0 || c.attempts < c.offered || c.attempts > c.offered * 3)
      throw new FoundationError(
        "NUMERICAL_ERROR",
        "Root conservation or attempt bounds violated",
      );
    const knownFailure =
      (errorRateRatio !== null &&
        errorRateRatio > input.targets.errorBudgetRatio) ||
      (p95Ms !== null && p95Ms > input.targets.p95Ms);
    const verdict = unresolved
      ? "indeterminate"
      : knownFailure
        ? "fail"
        : p95Ms === null
          ? "indeterminate"
          : "pass";
    return {
      offeredRequests: c.offered,
      successfulRequests: c.successful,
      failedRequests: c.failed,
      unresolvedRequests: unresolved,
      attempts: c.attempts,
      errorRateRatio,
      failures: c.reasons,
      latency: {
        count: c.successful,
        minMs: c.successful ? c.latencies[0] : null,
        maxMs: c.successful ? c.latencies.at(-1)! : null,
        meanMs: c.successful
          ? c.latencies.reduce((sum, n) => sum + n, 0) / c.successful
          : null,
        p50Ms,
        p95Ms,
        p99Ms,
        percentileStatus: {
          p50: p50Ms === null ? "insufficient_samples" : "available",
          p95: p95Ms === null ? "insufficient_samples" : "available",
          p99: p99Ms === null ? "insufficient_samples" : "available",
        },
      },
      verdict,
    };
  }
  const output = {
    engineVersion: FOUNDATION_VERSION,
    stage: "uncalibrated-foundation" as const,
    inputHash: createHash("sha256").update(JSON.stringify(input)).digest("hex"),
    measurementMs: workload.durationMs,
    warmupOfferedRequests: warmupOffered,
    summary: summarize(total),
    origins: Object.fromEntries(
      [...byOrigin].map(([id, c]) => [id, summarize(c)]),
    ),
    operations: Object.fromEntries(
      [...byOperation].map(([id, c]) => [id, summarize(c)]),
    ),
    nodes: [...runtime].map(([id, n]) => ({
      id,
      offeredCalls: n.calls,
      completedCalls: n.completed,
      failedCalls: n.failed,
      rejectedCalls: n.rejected,
      queuedDeadlineExpirations: n.queuedExpired,
      lateServiceCompletions: n.lateServices,
      utilizationRatio:
        n.busySlotMs /
        (workload.durationMs *
          n.definition.replicas *
          n.definition.slotsPerReplica),
      peakBusySlots: n.peakBusy,
      peakQueueDepth: n.peakQueue,
      endingQueueDepth: n.pools.reduce((sum, p) => sum + p.waiting.length, 0),
      activeCallsAtDrainEnd: [...active].filter((c) => c.node === n).length,
    })),
    diagnostics: {
      processedEvents,
      peakPendingEvents,
      peakLiveCalls,
      estimatedEvents,
      pendingRoots,
      remainingWorkAtDrainEnd: active.size,
      pendingEventsAtDrainEnd: events.size,
    },
    limitations: [
      "Generic blocking service pools only; no typed12-component adapter",
      "No regional routing/failure or shared-bandwidth model",
      "Exact internal observations; HDR wire serialization deferred",
      "No real-system calibration or production-accuracy claim",
    ],
  };
  for (const n of output.nodes)
    if (
      !Number.isFinite(n.utilizationRatio) ||
      n.utilizationRatio < 0 ||
      n.utilizationRatio > 1 + 1e-10
    )
      throw new FoundationError(
        "NUMERICAL_ERROR",
        "Invalid clipped service-pool utilization",
      );
  if (Buffer.byteLength(JSON.stringify(output), "utf8") > limits.maxResultBytes)
    throw new FoundationError("BUDGET_EXCEEDED", "Result-size budget exceeded");
  guard();
  return output;
}
