import { RegionalRuntime } from "@/modules/region-lab/engine/regional-runtime";
import type {
  RegionalInput,
  Region,
} from "@/modules/region-lab/engine/regional-input";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { EventHeap } from "@/modules/region-lab/engine/heap";
import { ArrivalSchedule } from "@/modules/region-lab/engine/arrivals";
import { choose, sample, uniform } from "@/modules/region-lab/engine/random";
import {
  FoundationError,
  FOUNDATION_LIMITS,
  type FoundationOptions,
} from "@/modules/region-lab/engine/engine";
import {
  componentInputSchema,
  type ComponentInput,
  type ComponentNode,
  type ComponentOperation,
} from "@/modules/region-lab/engine/component-input";
import {
  TokenBucket,
  SharedBandwidth,
} from "@/modules/region-lab/engine/component-resources";

type Reason = "QUEUE_FULL" | "RATE_LIMITED" | "DEADLINE" | "UNAVAILABLE";
type ServiceNode = Exclude<ComponentNode, { type: "client" | "queue" }>;
interface Counters {
  offered: number;
  successes: number;
  failures: number;
  attempts: number;
  reasons: Record<Reason, number>;
  latencies: number[];
}
const counter = (): Counters => ({
  offered: 0,
  successes: 0,
  failures: 0,
  attempts: 0,
  reasons: { QUEUE_FULL: 0, RATE_LIMITED: 0, DEADLINE: 0, UNAVAILABLE: 0 },
  latencies: [],
});
interface Context {
  key: string;
  origin: string;
  operation: ComponentOperation;
  measured: boolean;
  deadline: number;
  done: boolean;
  calls: Set<Call>;
  attempt: number;
  finish: (error: Reason | null) => void;
}
interface Pool {
  busy: number;
  waiting: Call[];
}
interface Call {
  ctx: Context;
  node: Runtime;
  pool: Pool;
  path: string;
  attempt: number;
  state: "queued" | "processing" | "children" | "done";
  started: number;
  callback: (error: Reason | null) => void;
  remaining: number;
  transportFrom?: Region;
}
interface Job {
  id: number;
  ctx: Context;
  acceptedAt: number;
  attempts: number;
  ready: boolean;
  delayed: boolean;
}
interface Runtime {
  definition: ComponentNode;
  pools: Pool[];
  bucket?: TokenBucket;
  bandwidth?: SharedBandwidth;
  offered: number;
  completed: number;
  failed: number;
  rejected: number;
  limited: number;
  hits: number;
  misses: number;
  bypasses: number;
  busyMs: number;
  peakBusy: number;
  peakQueue: number;
  late: number;
  jobs: Job[];
  accepted: number;
  jobCompleted: number;
  dropped: number;
  deadLettered: number;
  deliveries: number;
  redeliveries: number;
  inFlight: number;
  delayed: number;
  maxJobAgeMs: number;
  commits: number;
  applies: number;
  applyQueue: {
    committedAt: number;
    id: number;
    measured: boolean;
    ready: boolean;
  }[];
  applying: boolean;
  lagSum: number;
  maxLag: number;
}

export const COMPONENT_ENGINE_VERSION = "region-lab-components-v1";
/** Offline stage4 typed components; full regional scenarios remain explicitly unsupported. */
export function simulateComponents(
  value: unknown,
  options: FoundationOptions = {},
) {
  if (typeof value === "object" && value !== null && "engineContract" in value)
    throw new FoundationError(
      "UNSUPPORTED_CAPABILITY",
      "Full scenarios require the stage5 regional adapter",
    );
  const parsed = componentInputSchema.safeParse(value);
  if (!parsed.success)
    throw new FoundationError(
      "INVALID_INPUT",
      parsed.error.issues
        .slice(0, 8)
        .map((i) => i.message)
        .join("; "),
    );
  return executeComponentModel(parsed.data, options);
}
/** Internal execution entry: callers must validate regional inputs before use. */
export function executeComponentModel(
  input: ComponentInput,
  options: FoundationOptions = {},
  regional?: RegionalInput,
) {
  const compare = (a: { id: string }, b: { id: string }) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  input.nodes.sort(compare);
  input.edges.sort(compare);
  input.edges.forEach((e) => e.operationIds.sort());
  input.workload.origins.sort(compare);
  input.workload.operations.sort(compare);
  const limits: Record<keyof typeof FOUNDATION_LIMITS, number> = {
    ...FOUNDATION_LIMITS,
  };
  for (const [k, v] of Object.entries(options.limits ?? {})) {
    const key = k as keyof typeof limits;
    if (
      !Object.hasOwn(limits, key) ||
      !Number.isSafeInteger(v) ||
      v < 1 ||
      v > limits[key]
    )
      throw new FoundationError("INVALID_INPUT", "Limits may only be lowered");
    limits[key] = v;
  }
  const clock = options.clock ?? (() => performance.now()),
    heap = options.heapUsed ?? (() => process.memoryUsage().heapUsed);
  const startWall = clock(),
    startHeap = heap(),
    events = new EventHeap();
  const w = input.workload,
    end = w.warmupMs + w.durationMs,
    stop = end + w.drainMs;
  let now = 0,
    sequence = 0,
    processed = 0,
    calls = 0,
    background = 0,
    observations = 0,
    roots = 0,
    jobIds = 0,
    warmup = 0,
    peakPending = 0;
  const live = new Set<Call>(),
    contexts = new Set<Context>();
  const total = counter(),
    origins = new Map(w.origins.map((o) => [o.id as string, counter()])),
    operations = new Map(w.operations.map((o) => [o.id, counter()]));
  const measuring = () => now >= w.warmupMs && now < end;
  const clipped = (a: number, b: number) =>
    Math.max(0, Math.min(b, end) - Math.max(a, w.warmupMs));
  function guard() {
    if (options.signal?.aborted)
      throw new FoundationError("CANCELLED", "Component calculation cancelled");
    if (clock() - startWall > limits.maxWallTimeMs)
      throw new FoundationError(
        "DEADLINE_EXCEEDED",
        "Component execution deadline exceeded",
      );
    if (
      calls + background > limits.maxLiveCalls ||
      events.size > limits.maxPendingEvents ||
      observations > limits.maxObservations ||
      heap() - startHeap > limits.maxHeapGrowthBytes ||
      (calls + background + events.size) * 1024 + observations * 16 >
        limits.maxHeapGrowthBytes
    )
      throw new FoundationError(
        "BUDGET_EXCEEDED",
        "Component execution budget exceeded",
      );
  }
  function schedule(at: number, priority: number, run: () => void) {
    if (!Number.isFinite(at) || at < now)
      throw new FoundationError("NUMERICAL_ERROR", "Invalid event time");
    events.push({ time: at, priority, sequence: sequence++, run });
    peakPending = Math.max(peakPending, events.size);
    guard();
  }
  const nodes = new Map<string, Runtime>(
    input.nodes.map((definition) => {
      const n: Runtime = {
        definition,
        pools:
          definition.type === "client" || definition.type === "queue"
            ? []
            : Array.from({ length: definition.replicas }, () => ({
                busy: 0,
                waiting: [],
              })),
        offered: 0,
        completed: 0,
        failed: 0,
        rejected: 0,
        limited: 0,
        hits: 0,
        misses: 0,
        bypasses: 0,
        busyMs: 0,
        peakBusy: 0,
        peakQueue: 0,
        late: 0,
        jobs: [],
        accepted: 0,
        jobCompleted: 0,
        dropped: 0,
        deadLettered: 0,
        deliveries: 0,
        redeliveries: 0,
        inFlight: 0,
        delayed: 0,
        maxJobAgeMs: 0,
        commits: 0,
        applies: 0,
        applyQueue: [],
        applying: false,
        lagSum: 0,
        maxLag: 0,
      };
      if (definition.type === "gateway" || definition.type === "external")
        n.bucket = new TokenBucket(
          definition.properties.rateLimitRps,
          definition.properties.rateLimitBurstRequests,
        );
      if (definition.type === "storage")
        n.bandwidth = new SharedBandwidth(
          (definition.properties.aggregateBandwidthMbps * 1000000) / 8 / 1000,
          () => now,
          (at, fn) => schedule(at, 1, fn),
        );
      return [definition.id, n];
    }),
  );
  let abortedCalls = 0;
  const net = regional
    ? new RegionalRuntime(
        regional,
        () => now,
        schedule,
        (ids, down) => {
          if (down) {
            for (const c of [...live])
              if (c.state !== "done" && ids.includes(c.node.definition.id)) {
                finishCall(c, "UNAVAILABLE");
              }
          } else
            for (const id of ids) {
              const n = nodes.get(id)!,
                d = n.definition;
              if (d.type === "gateway" || d.type === "external")
                n.bucket = new TokenBucket(
                  d.properties.rateLimitRps,
                  d.properties.rateLimitBurstRequests,
                );
            }
        },
        (delta) => {
          background += delta;
          guard();
        },
      )
    : undefined;
  function transit(
    from: Region,
    to: Region,
    bytes: number,
    key: string,
    done: () => void,
  ) {
    if (net) net.transfer(from, to, bytes, key, done);
    else done();
  }
  const edges = (node: string, op: string) =>
    input.edges.filter((e) => e.from === node && e.operationIds.includes(op));
  const scheduleShape = new ArrivalSchedule(w);
  // Conservative admission includes async deliveries and primary->replica apply work.
  const visitMemo = new Map<string, number>();
  function visits(id: string): number {
    if (visitMemo.has(id)) return visitMemo.get(id)!;
    const n = nodes.get(id)!.definition;
    let count =
      1 +
      input.edges
        .filter((e) => e.from === id)
        .reduce((sum, e) => sum + visits(e.to), 0);
    if (n.type === "queue") count *= n.properties.maxDeliveryAttempts;
    if (n.type === "db")
      count += input.nodes.filter((n) => n.type === "replica").length;
    visitMemo.set(id, count);
    return count;
  }
  const mass = scheduleShape.totalMass;
  const rootBound =
    mass === 0
      ? 0
      : w.arrival === "constant_rate"
        ? Math.floor(mass + 0.5)
        : Math.ceil(mass + 10 * Math.sqrt(mass) + 32);
  const estimatedEvents =
    rootBound *
    (5 +
      12 *
        Math.max(...w.operations.map((o) => o.retry.maxAttempts)) *
        Math.max(
          ...(regional
            ? regional.routing.flatMap((r) => [
                r.primaryEntryNodeId,
                ...r.fallbackEntryNodeIds,
              ])
            : w.origins.map((o) => o.entryNodeId)
          ).map((id) => visits(id)),
        ));
  if (estimatedEvents > limits.maxEvents)
    throw new FoundationError(
      "BUDGET_EXCEEDED",
      "Expanded component demand exceeds admission budget",
    );
  guard();
  function peaks(n: Runtime) {
    if (!measuring()) return;
    n.peakBusy = Math.max(
      n.peakBusy,
      n.pools.reduce((s, p) => s + p.busy, 0),
    );
    n.peakQueue = Math.max(
      n.peakQueue,
      n.definition.type === "queue"
        ? n.jobs.length
        : n.pools.reduce((s, p) => s + p.waiting.length, 0),
    );
  }
  function endContext(ctx: Context, error: Reason | null) {
    if (ctx.done) return;
    ctx.done = true;
    contexts.delete(ctx);
    ctx.finish(error);
    for (const c of [...ctx.calls])
      if (c.state === "queued" || c.state === "children")
        finishCall(c, error ?? "DEADLINE");
  }
  function expire(ctx: Context) {
    if (ctx.done) return;
    endContext(ctx, "DEADLINE");
    for (const c of [...ctx.calls])
      if (c.state === "queued" || c.state === "children")
        finishCall(c, "DEADLINE");
  }
  function drain(n: Runtime, pool: Pool) {
    if (net && !net.available(n.definition.id)) return;
    const def = n.definition as ServiceNode;
    while (
      pool.busy < def.properties.serviceSlotsPerReplica &&
      pool.waiting.length
    ) {
      const c = pool.waiting.shift()!;
      if (c.state !== "queued") continue;
      if (c.ctx.done || now >= c.ctx.deadline) finishCall(c, "DEADLINE");
      else startCall(c);
    }
    peaks(n);
    // A freed worker slot may take one retained background job.
    if (n.definition.type === "worker")
      for (const q of nodes.values())
        if (
          q.definition.type === "queue" &&
          input.edges.some(
            (e) => e.from === q.definition.id && e.to === n.definition.id,
          )
        )
          pump(q);
  }
  function finishCall(c: Call, error: Reason | null) {
    if (c.state === "done") return;
    if (error === "UNAVAILABLE" && net && !net.available(c.node.definition.id))
      abortedCalls++;
    const queued = c.state === "queued";
    c.state = "done";
    live.delete(c);
    c.ctx.calls.delete(c);
    calls--;
    if (queued) {
      const i = c.pool.waiting.indexOf(c);
      if (i >= 0) c.pool.waiting.splice(i, 1);
    } else {
      c.pool.busy--;
      c.node.busyMs += clipped(c.started, now);
    }
    if (c.ctx.measured) {
      if (error) c.node.failed++;
      else c.node.completed++;
    }
    c.callback(error);
    if (!queued) drain(c.node, c.pool);
  }
  function replicate(primary: Runtime, c: Call) {
    primary.commits++;
    for (const n of nodes.values())
      if (
        n.definition.type === "replica" &&
        n.definition.primaryNodeId === primary.definition.id
      ) {
        background++;
        const commit = {
          committedAt: now,
          id: primary.commits,
          measured: c.ctx.measured,
          ready: !net,
        };
        n.applyQueue.push(commit);
        if (net)
          transit(
            primary.definition.region,
            n.definition.region,
            c.ctx.operation.requestBytes,
            "commit:" + primary.commits + ":" + n.definition.id,
            () => {
              commit.ready = true;
              apply(n);
            },
          );
        apply(n);
      }
  }
  function apply(n: Runtime) {
    if (
      n.applying ||
      !n.applyQueue.length ||
      !n.applyQueue[0].ready ||
      n.definition.type !== "replica"
    )
      return;
    const commit = n.applyQueue[0];
    n.applying = true;
    const delay = sample(
      n.definition.properties.replicationApplyTime,
      input.seed,
      "apply",
      n.definition.id,
      commit.id,
    );
    schedule(now + delay, 1, () => {
      n.applyQueue.shift();
      n.applying = false;
      background--;
      n.applies++;
      n.lagSum += now - commit.committedAt;
      n.maxLag = Math.max(n.maxLag, now - commit.committedAt);
      apply(n);
    });
  }
  function dispatch(c: Call) {
    if (c.ctx.done || now >= c.ctx.deadline) {
      if (c.ctx.measured) c.node.late++;
      finishCall(c, "DEADLINE");
      return;
    }
    let out = edges(c.node.definition.id, c.ctx.operation.id);
    if (out.length && out[0].dispatch === "weighted_one")
      out = [
        choose(
          out,
          (e) => e.weight,
          uniform(input.seed, "dispatch", c.ctx.key, c.attempt, c.path),
        ),
      ];
    if (!out.length) {
      finishCall(c, null);
      return;
    }
    c.state = "children";
    c.remaining = out.length;
    for (const e of out) {
      const target = nodes.get(e.to)!,
        source = c.node.definition;
      const forward = () => {
        if (c.ctx.done || c.state === "done") return;
        const callback = (error: Reason | null) => {
          const returned = () => {
            if (c.state === "done") return;
            if (error) finishCall(c, error);
            else if (--c.remaining === 0) finishCall(c, null);
          };
          if (net)
            transit(
              target.definition.region,
              source.region,
              c.ctx.operation.responseBytes,
              c.ctx.key +
                ":" +
                c.attempt +
                ":" +
                c.path +
                "/" +
                e.id +
                ":return",
              returned,
            );
          else schedule(now + e.oneWayDelayMs, 1, returned);
        };
        if (e.mode === "async") enqueueJob(target, c.ctx, callback);
        else enter(c.ctx, e.to, c.path + "/" + e.id, callback);
      };
      if (net)
        transit(
          source.region,
          target.definition.region,
          c.ctx.operation.requestBytes,
          c.ctx.key + ":" + c.attempt + ":" + c.path + "/" + e.id + ":forward",
          forward,
        );
      else schedule(now + e.oneWayDelayMs, 3, forward);
    }
  }
  function startCall(c: Call) {
    const def = c.node.definition as ServiceNode,
      p = def.properties;
    c.state = "processing";
    c.started = now;
    c.pool.busy++;
    peaks(c.node);
    const hit =
      (def.type === "cache" || def.type === "cdn") &&
      c.ctx.operation.kind === "read" &&
      uniform(input.seed, "hit", c.ctx.key, c.attempt, c.path) <
        def.properties.hitRatio;
    if (def.type === "cache" || def.type === "cdn")
      if (c.ctx.measured) {
        if (c.ctx.operation.kind === "write") c.node.bypasses++;
        else if (hit) c.node.hits++;
        else c.node.misses++;
      }
    const distribution =
      hit && "hitTime" in p
        ? p.hitTime
        : "serviceTime" in p
          ? p.serviceTime
          : c.ctx.operation.kind === "read"
            ? p.readServiceTime
            : p.writeServiceTime;
    const delay = sample(
      distribution,
      input.seed,
      "service",
      c.ctx.key,
      c.attempt,
      c.path,
    );
    const process = () => {
      if (c.state === "done") return;
      schedule(now + delay, 1, () => {
        if (c.state === "done") return;
        if (def.type === "db" && c.ctx.operation.kind === "write")
          replicate(c.node, c);
        if (c.node.bandwidth)
          c.node.bandwidth.add(
            c.ctx.operation.requestBytes + c.ctx.operation.responseBytes,
            () => dispatch(c),
          );
        else if (hit) {
          if (c.ctx.done || now >= c.ctx.deadline) {
            if (c.ctx.measured) c.node.late++;
            finishCall(c, "DEADLINE");
          } else finishCall(c, null);
        } else dispatch(c);
      });
    };
    if (net && c.transportFrom)
      transit(
        c.transportFrom,
        def.region,
        c.ctx.operation.requestBytes,
        c.ctx.key + ":" + c.attempt + ":job-forward",
        process,
      );
    else process();
  }
  function available(n: Runtime, allowWait: boolean): Pool | undefined {
    if (net && !net.available(n.definition.id)) return undefined;
    const def = n.definition as ServiceNode;
    let best = Infinity,
      selected: Pool | undefined;
    for (const p of n.pools)
      if (
        (p.busy < def.properties.serviceSlotsPerReplica ||
          (allowWait && p.waiting.length < def.properties.waitingCapacity)) &&
        p.busy + p.waiting.length < best
      ) {
        selected = p;
        best = p.busy + p.waiting.length;
      }
    return selected;
  }
  function enter(
    ctx: Context,
    id: string,
    path: string,
    callback: (error: Reason | null) => void,
    transportFrom?: Region,
  ) {
    if (ctx.done || now >= ctx.deadline) {
      callback("DEADLINE");
      return;
    }
    const n = nodes.get(id)!;
    if (ctx.measured) n.offered++;
    if (net && !net.available(id)) {
      if (ctx.measured) n.failed++;
      callback("UNAVAILABLE");
      return;
    }
    if (n.bucket && !n.bucket.take(now)) {
      if (ctx.measured) {
        n.limited++;
        n.failed++;
      }
      callback("RATE_LIMITED");
      return;
    }
    const pool = available(n, true);
    if (!pool) {
      if (ctx.measured) {
        n.rejected++;
        n.failed++;
      }
      callback("QUEUE_FULL");
      return;
    }
    const c: Call = {
      ctx,
      node: n,
      pool,
      path,
      attempt: ctx.attempt,
      state: "queued",
      started: now,
      callback,
      remaining: 0,
      transportFrom,
    };
    calls++;
    live.add(c);
    ctx.calls.add(c);
    guard();
    if (
      pool.busy <
      (n.definition as ServiceNode).properties.serviceSlotsPerReplica
    )
      startCall(c);
    else {
      pool.waiting.push(c);
      peaks(n);
    }
  }
  function retain(q: Runtime, job: Job): boolean {
    if (q.definition.type !== "queue")
      throw new FoundationError("NUMERICAL_ERROR", "Expected queue");
    if (q.jobs.length >= q.definition.properties.maxDepthJobs) {
      if (q.definition.properties.overflowPolicy === "reject_new") return false;
      const discarded = q.jobs.shift()!;
      if (discarded.delayed) {
        q.delayed--;
        discarded.delayed = false;
      }
      background--;
      q.dropped++;
    }
    q.jobs.push(job);
    peaks(q);
    return true;
  }
  function enqueueJob(
    q: Runtime,
    parent: Context,
    callback: (error: Reason | null) => void,
  ) {
    if (q.definition.type !== "queue")
      throw new FoundationError("NUMERICAL_ERROR", "Expected async queue");
    if (parent.measured) q.offered++;
    const ctx: Context = {
      ...parent,
      key: "job:" + jobIds++,
      deadline: Infinity,
      done: false,
      calls: new Set(),
      attempt: 0,
      finish: () => undefined,
    };
    const job: Job = {
      id: jobIds,
      ctx,
      acceptedAt: now,
      attempts: 0,
      ready: false,
      delayed: false,
    };
    if (!retain(q, job)) {
      if (parent.measured) {
        q.rejected++;
        q.failed++;
      }
      callback("QUEUE_FULL");
      return;
    }
    background++;
    q.accepted++;
    const delay = sample(
      q.definition.properties.ackTime,
      input.seed,
      "ack",
      job.id,
      q.definition.id,
    );
    schedule(now + delay, 1, () => {
      if (parent.measured) q.completed++;
      callback(null);
      job.ready = true;
      pump(q);
    });
  }
  function pump(q: Runtime) {
    const definition = q.definition;
    if (definition.type !== "queue") return;
    const e = input.edges.find((e) => e.from === q.definition.id)!;
    const worker = nodes.get(e.to)!;
    while (q.jobs.length && available(worker, false)) {
      // Retained jobs become visible after their durable enqueue ACK.
      const i = 0;
      if (!q.jobs[0].ready) return;
      const job = q.jobs.splice(i, 1)[0];
      const ctx: Context = { ...job.ctx, calls: new Set(), done: false };
      job.attempts++;
      ctx.attempt = job.attempts;
      ctx.done = false;
      ctx.deadline = now + ctx.operation.deadlineMs;
      ctx.calls = new Set();
      contexts.add(ctx);
      q.inFlight++;
      q.deliveries++;
      q.maxJobAgeMs = Math.max(q.maxJobAgeMs, now - job.acceptedAt);
      ctx.finish = (error) => {
        q.inFlight--;
        if (!error) {
          background--;
          q.jobCompleted++;
        } else if (job.attempts >= definition.properties.maxDeliveryAttempts) {
          background--;
          q.deadLettered++;
        } else {
          job.ready = false;
          job.delayed = true;
          if (!retain(q, job)) {
            background--;
            q.dropped++;
            return;
          }
          q.delayed++;
          q.redeliveries++;
          schedule(now + definition.properties.redeliveryDelayMs, 3, () => {
            if (!q.jobs.includes(job)) return; // A dropped retry cannot resurrect.
            q.delayed--;
            job.delayed = false;
            job.ready = true;
            pump(q);
          });
        }
      };
      // Copy per-delivery deadline token: a stale prior-delivery timer must never expire a retry.
      const deadline = ctx.deadline;
      schedule(deadline, 0, () => expire(ctx));
      // Worker edge delay is explicitly accounted both ways, without adding regional latency.
      enter(
        ctx,
        e.to,
        q.definition.id + "/" + e.id + ":" + job.attempts,
        (error) => {
          const ack = () => {
            if (!ctx.done) endContext(ctx, error);
          };
          if (net)
            transit(
              worker.definition.region,
              q.definition.region,
              0,
              ctx.key + ":" + ctx.attempt + ":job-ack",
              ack,
            );
          else ack();
        },
        net ? q.definition.region : undefined,
      );
      peaks(q);
      // Synchronous reservation prevents dispatching the same free slot twice.
    }
  }
  function root(id: number) {
    const origin = choose(
      w.origins,
      (o) => o.shareBps,
      uniform(input.seed, "origin", id),
    );
    const operation = choose(
      w.operations,
      (o) => o.shareBps,
      uniform(input.seed, "operation", id),
    );
    const measured = measuring(),
      arrived = now,
      groups = [total, origins.get(origin.id)!, operations.get(operation.id)!];
    if (measured) { groups.forEach((c) => c.offered++); options.onRootEvent?.({kind:"offered",arrivedMs:arrived-w.warmupMs}); }
    else warmup++;
    const ctx: Context = {
      key: "root:" + id,
      origin: origin.id,
      operation,
      measured,
      deadline: now + operation.deadlineMs,
      done: false,
      calls: new Set(),
      attempt: 0,
      finish: (error) => {
        if(measured) options.onRootEvent?.({kind:"outcome",arrivedMs:arrived-w.warmupMs,latencyMs:now-arrived,error});
        if (measured)
          for (const c of groups) {
            if (error) {
              c.failures++;
              c.reasons[error]++;
            } else {
              c.successes++;
              c.latencies.push(now - arrived);
              observations++;
            }
          }
      },
    };
    contexts.add(ctx);
    const attempt = () => {
      if (ctx.done || now >= ctx.deadline) return;
      ctx.attempt++;
      if (measured) { groups.forEach((c) => c.attempts++); options.onRootEvent?.({kind:"attempt",arrivedMs:arrived-w.warmupMs}); }
      const selected = net
        ? net.route(origin.id, operation.id, ctx.key, measured)
        : origin.entryNodeId;
      const receive = (error: Reason | null) => {
        if (ctx.done) return;
        if (
          !error ||
          error === "DEADLINE" ||
          ctx.attempt >= operation.retry.maxAttempts ||
          now >= ctx.deadline
        )
          endContext(ctx, error);
        else {
          const r = operation.retry,
            delay =
              Math.min(
                r.maxBackoffMs,
                r.baseBackoffMs * 2 ** (ctx.attempt - 1),
              ) *
              (1 +
                (2 * uniform(input.seed, "retry", id, ctx.attempt) - 1) *
                  r.jitterRatio);
          const at = now + Math.min(r.maxBackoffMs, delay);
          if (at < ctx.deadline) schedule(at, 3, attempt);
        }
      };
      if (!selected) {
        receive("UNAVAILABLE");
        return;
      }
      const target = nodes.get(selected)!;
      const send = () =>
        enter(ctx, selected, selected + ":" + ctx.attempt, (error) => {
          if (net)
            transit(
              target.definition.region,
              origin.id,
              operation.responseBytes,
              ctx.key + ":" + ctx.attempt + ":client-return",
              () => receive(error),
            );
          else receive(error);
        });
      if (net)
        transit(
          origin.id,
          target.definition.region,
          operation.requestBytes,
          ctx.key + ":" + ctx.attempt + ":client-forward",
          send,
        );
      else send();
    };
    schedule(ctx.deadline, 0, () => expire(ctx));
    attempt();
  }
  let intensity =
    w.arrival === "constant_rate"
      ? 0.5
      : -Math.log(uniform(input.seed, "arrival", 0));
  function arrival() {
    const at = scheduleShape.atMass(intensity);
    if (at === null || at >= end) return;
    const id = roots++;
    schedule(at, 3, () => {
      root(id);
      intensity +=
        w.arrival === "constant_rate"
          ? 1
          : -Math.log(uniform(input.seed, "arrival", roots));
      arrival();
    });
  }
  schedule(w.warmupMs, 2, () => nodes.forEach(peaks));
  arrival();
  while (events.peek() && events.peek()!.time <= stop) {
    if (++processed > limits.maxEvents)
      throw new FoundationError(
        "BUDGET_EXCEEDED",
        "Component event limit exceeded",
      );
    guard();
    const event = events.pop()!;
    now = event.time;
    event.run();
    // Fill other worker slots after pending dispatch events have taken capacity.
    for (const n of nodes.values()) if (n.definition.type === "queue") pump(n);
  }
  for (const c of live)
    if (c.state !== "queued") c.node.busyMs += clipped(c.started, stop);
  function summarize(c: Counters, scope: string) {
    options.onSamples?.(scope,c.latencies);
    c.latencies.sort((a, b) => a - b);
    const q = (p: number) => c.latencies[Math.ceil(c.successes * p) - 1];
    const p50Ms = c.successes ? q(0.5) : null,
      p95Ms = c.successes >= 1000 ? q(0.95) : null,
      p99Ms = c.successes >= 10000 ? q(0.99) : null;
    const unresolvedRequests = c.offered - c.successes - c.failures,
      errorRateRatio = c.offered ? c.failures / c.offered : null;
    if (
      unresolvedRequests < 0 ||
      c.attempts < c.offered ||
      c.attempts > c.offered * 3
    )
      throw new FoundationError(
        "NUMERICAL_ERROR",
        "Root conservation violated",
      );
    return {
      offeredRequests: c.offered,
      successfulRequests: c.successes,
      failedRequests: c.failures,
      unresolvedRequests,
      attempts: c.attempts,
      failures: regional
        ? c.reasons
        : {
            QUEUE_FULL: c.reasons.QUEUE_FULL,
            RATE_LIMITED: c.reasons.RATE_LIMITED,
            DEADLINE: c.reasons.DEADLINE,
          },
      errorRateRatio,
      latency: {
        count: c.successes,
        meanMs: c.successes
          ? c.latencies.reduce((a, b) => a + b, 0) / c.successes
          : null,
        p50Ms,
        p95Ms,
        p99Ms,
      },
      verdict: unresolvedRequests
        ? "indeterminate"
        : (errorRateRatio !== null &&
              errorRateRatio > input.targets.errorBudgetRatio) ||
            (p95Ms !== null && p95Ms > input.targets.p95Ms)
          ? "fail"
          : p95Ms === null
            ? "indeterminate"
            : "pass",
    };
  }
  for (const n of nodes.values())
    if (
      n.definition.type === "queue" &&
      n.accepted !==
        n.jobCompleted + n.dropped + n.deadLettered + n.jobs.length + n.inFlight
    )
      throw new FoundationError(
        "NUMERICAL_ERROR",
        "Queue job conservation violated",
      );
  const result = {
    ...(net
      ? {
          regional: {
            ...net.result(),
            abortedCalls,
            storedObservations: observations,
          },
        }
      : {}),
    engineVersion: COMPONENT_ENGINE_VERSION,
    stage: "uncalibrated-components",
    inputHash: createHash("sha256").update(JSON.stringify(input)).digest("hex"),
    warmupOfferedRequests: warmup,
    summary: summarize(total,"global"),
    origins: Object.fromEntries(
      [...origins].map(([k, c]) => [k, summarize(c,"origin:"+k)]),
    ),
    operations: Object.fromEntries(
      [...operations].map(([k, c]) => [k, summarize(c,"operation:"+k)]),
    ),
    nodes: [...nodes].map(([id, n]) => {
      const d = n.definition;
      const utilizationRatio =
        d.type === "client" || d.type === "queue"
          ? null
          : n.busyMs /
            (w.durationMs * d.replicas * d.properties.serviceSlotsPerReplica);
      if (
        utilizationRatio !== null &&
        (!Number.isFinite(utilizationRatio) ||
          utilizationRatio < 0 ||
          utilizationRatio > 1 + 1e-9)
      )
        throw new FoundationError("NUMERICAL_ERROR", "Invalid utilization");
      return {
        id,
        type: d.type,
        offeredCalls: n.offered,
        completedCalls: n.completed,
        failedCalls: n.failed,
        rejectedCalls: n.rejected,
        rateLimitedCalls: n.limited,
        cacheHits: n.hits,
        cacheMisses: n.misses,
        cacheBypasses: n.bypasses,
        utilizationRatio,
        peakBusySlots: n.peakBusy,
        peakQueueDepth: n.peakQueue,
        lateCompletions: n.late,
        queue:
          d.type === "queue"
            ? {
                accounting: "all accepted jobs including warmup",
                accepted: n.accepted,
                completed: n.jobCompleted,
                dropped: n.dropped,
                deadLettered: n.deadLettered,
                deliveries: n.deliveries,
                redeliveries: n.redeliveries,
                waiting: n.jobs.length - n.delayed,
                inFlight: n.inFlight,
                delayed: n.delayed,
                maxStartedJobAgeMs: n.maxJobAgeMs,
              }
            : null,
        replication:
          d.type === "replica"
            ? {
                appliedCommits: n.applies,
                pendingCommits: n.applyQueue.length,
                meanCommitToApplyMs: n.applies ? n.lagSum / n.applies : null,
                maxCommitToApplyMs: n.applies ? n.maxLag : null,
              }
            : null,
      };
    }),
    diagnostics: {
      processedEvents: processed,
      peakPendingEvents: peakPending,
      estimatedEvents,
      remainingCalls: live.size,
      remainingBackgroundWork: background,
      pendingEvents: events.size,
    },
    warnings: [...nodes.values()]
      .filter(
        (n) =>
          n.definition.type === "queue" &&
          (n.jobs.length ||
            n.inFlight ||
            n.delayed ||
            n.dropped ||
            n.deadLettered),
      )
      .map((n) => "Background queue requires attention: " + n.definition.id),
    limitations: [
      "Single-region component model; explicit edge delays only",
      "No regional routing/outage or network link sharing",
      "Replica transport is zero; ordered serial apply is separate from read slots",
      "Exact internal observations; no HDR wire adapter or production calibration",
      "Synchronous local library; hosted worker isolation remains pending",
    ],
  };
  if (Buffer.byteLength(JSON.stringify(result)) > limits.maxResultBytes)
    throw new FoundationError("BUDGET_EXCEEDED", "Component result too large");
  guard();
  return result;
}
