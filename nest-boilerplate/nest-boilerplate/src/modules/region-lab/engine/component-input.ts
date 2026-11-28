import { z } from "zod";
import { foundationSchema } from "@/modules/region-lab/engine/input";

const id = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/)
  .refine((v) => !["constructor", "prototype", "__proto__"].includes(v));
const int = (min: number, max: number) => z.number().int().min(min).max(max);
const num = (min: number, max: number) => z.number().min(min).max(max);
export const demand = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("constant"), valueMs: num(0, 60000) }),
  z.strictObject({ kind: z.literal("exponential"), meanMs: num(0.001, 60000) }),
  z.strictObject({
    kind: z.literal("lognormal"),
    meanMs: num(0.001, 60000),
    coefficientOfVariation: num(0.01, 3),
  }),
]);
const service = {
  serviceTime: demand,
  serviceSlotsPerReplica: int(1, 1024),
  waitingCapacity: int(0, 100000),
};
const rw = {
  readServiceTime: demand,
  writeServiceTime: demand,
  serviceSlotsPerReplica: int(1, 1024),
  waitingCapacity: int(0, 100000),
};
const quota = {
  rateLimitRps: num(0.001, 1000000),
  rateLimitBurstRequests: int(1, 1000000),
};
const common = { id, region: z.enum(["us-east", "eu-west", "ap-south"]) };
const profile = { profileId: id, profileVersion: int(1, 1000000) };
function node<T extends string, P extends z.ZodRawShape>(
  type: T,
  properties: P,
  scalable: boolean,
) {
  return z.strictObject({
    ...common,
    ...profile,
    type: z.literal(type),
    replicas: scalable ? int(1, 200) : z.literal(1),
    properties: z.strictObject(properties),
  });
}
export const componentNodeSchema = z.discriminatedUnion("type", [
  z.strictObject({ ...common, type: z.literal("client") }),
  node("cdn", { ...service, hitRatio: num(0, 1), hitTime: demand }, true),
  node("lb", service, true),
  node("gateway", { ...service, ...quota }, true),
  node("app", service, true),
  node("worker", { ...service, waitingCapacity: z.literal(0) }, true),
  node("cache", { ...service, hitRatio: num(0, 1), hitTime: demand }, true),
  node("db", rw, false),
  z.strictObject({
    ...common,
    ...profile,
    type: z.literal("replica"),
    replicas: z.literal(1),
    primaryNodeId: id,
    properties: z.strictObject({ ...service, replicationApplyTime: demand }),
  }),
  node(
    "queue",
    {
      maxDepthJobs: int(1, 1000000),
      ackTime: demand,
      overflowPolicy: z.enum(["reject_new", "drop_oldest"]),
      maxDeliveryAttempts: int(1, 3),
      redeliveryDelayMs: int(1, 60000),
    },
    false,
  ),
  node(
    "storage",
    { ...rw, aggregateBandwidthMbps: num(0.001, 1000000) },
    false,
  ),
  node("external", { ...service, ...quota }, false),
]);
const operations = z
  .array(
    foundationSchema.shape.workload.shape.operations.element.extend({
      requestBytes: int(0, 16777216),
      responseBytes: int(0, 16777216),
    }),
  )
  .min(1)
  .max(8);
const workload = foundationSchema.shape.workload.extend({
  operations,
  origins: z
    .array(
      foundationSchema.shape.workload.shape.origins.element.extend({
        clientNodeId: id,
      }),
    )
    .min(1)
    .max(3),
});
export const componentInputBase = z.strictObject({
  componentVersion: z.literal(1),
  seed: int(0, 4294967295),
  workload,
  nodes: z.array(componentNodeSchema).min(2).max(36),
  edges: z
    .array(
      z.strictObject({
        id,
        from: id,
        to: id,
        operationIds: z.array(id).min(1).max(8),
        mode: z.enum(["sync", "async"]),
        dispatch: z.enum(["all", "weighted_one"]),
        weight: int(1, 10000),
        oneWayDelayMs: num(0, 30000),
      }),
    )
    .max(120),
  targets: foundationSchema.shape.targets,
});
export type ComponentInput = z.infer<typeof componentInputBase>;
export function componentSemantics(
  s: ComponentInput,
  ctx: z.RefinementCtx,
  regionalEntries?: { entry: string; operation: string }[],
) {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  const unique = (a: string[]) => new Set(a).size === a.length;
  const nodes = new Map(s.nodes.map((n) => [n.id, n]));
  const opIds = s.workload.operations.map((o) => o.id);
  if (!unique([...s.nodes.map((n) => n.id), ...s.edges.map((e) => e.id)]))
    fail("Unique global node/edge IDs required");
  if (s.nodes.filter((n) => n.type === "db").length !== 1)
    fail("Exactly one primary required");
  if (!regionalEntries && new Set(s.nodes.map((n) => n.region)).size !== 1)
    fail("Cross-region component runs require the stage5 network adapter");
  const profileKeys = new Map<string, string>();
  for (const n of s.nodes)
    if (n.type !== "client") {
      const key = n.profileId + "@" + n.profileVersion;
      const value = JSON.stringify({
        type: n.type,
        properties: n.properties,
      });
      if (profileKeys.has(key) && profileKeys.get(key) !== value)
        fail("Conflicting immutable profile version");
      profileKeys.set(key, value);
      if (n.type === "replica" && nodes.get(n.primaryNodeId)?.type !== "db")
        fail("Replica needs a valid primary");
      const p = n.properties;
      for (const k of [
        "serviceTime",
        "readServiceTime",
        "writeServiceTime",
      ] as const)
        if (k in p) {
          const d = demand.parse(Reflect.get(p, k));
          if (d.kind === "constant" && d.valueMs <= 0)
            fail("Processing demand must be positive");
        }
    }
  const w = s.workload;
  if (
    !unique(w.origins.map((o) => o.id)) ||
    w.origins.reduce((a, o) => a + o.shareBps, 0) !== 10000
  )
    fail("Unique origin shares must total10000");
  if (
    !unique(opIds) ||
    w.operations.reduce((a, o) => a + o.shareBps, 0) !== 10000
  )
    fail("Unique operation shares must total10000");
  for (const o of w.origins) {
    const c = nodes.get(o.clientNodeId),
      entry = nodes.get(o.entryNodeId);
    if (c?.type !== "client" || c.region !== o.id)
      fail("Origin must reference its client");
    if (!entry || !["app", "lb", "gateway"].includes(entry.type))
      fail("Entry must be app/lb/gateway");
  }
  if (s.nodes.filter((n) => n.type === "client").length !== w.origins.length)
    fail("One client per origin required");
  for (const o of w.operations) {
    if (!o.idempotent && o.retry.maxAttempts > 1)
      fail("Retries require idempotency");
    if (o.retry.baseBackoffMs > o.retry.maxBackoffMs)
      fail("Backoff cap below base");
    if (o.deadlineMs > w.drainMs) fail("Drain must cover deadlines");
  }
  if (
    w.schedule[0].atMs !== 0 ||
    w.schedule.at(-1)!.atMs !== w.durationMs ||
    w.schedule.some((k, i) => i > 0 && k.atMs <= w.schedule[i - 1].atMs)
  )
    fail("Ordered schedule must span measurement");
  const pairs = new Set<string>();
  for (const e of s.edges) {
    const from = nodes.get(e.from),
      to = nodes.get(e.to),
      pair = e.from + ">" + e.to;
    if (
      !from ||
      !to ||
      from.type === "client" ||
      to.type === "client" ||
      e.from === e.to
    )
      fail("Invalid request edge");
    if (pairs.has(pair)) fail("Duplicate edge");
    pairs.add(pair);
    if (
      !unique(e.operationIds) ||
      e.operationIds.some((o) => !opIds.includes(o))
    )
      fail("Unknown operation edge");
    if ((e.mode === "async") !== (to?.type === "queue"))
      fail("Only async edges may target a queue");
    if (
      from?.type === "queue" &&
      (to?.type !== "worker" ||
        e.mode !== "sync" ||
        e.dispatch !== "all" ||
        e.oneWayDelayMs !== 0)
    )
      fail("Queue must have worker consumers");
    if (to?.type === "worker" && from?.type !== "queue")
      fail("Workers must consume a queue");
    if (
      to?.type === "replica" &&
      e.operationIds.some(
        (id) => w.operations.find((o) => o.id === id)?.kind === "write",
      )
    )
      fail("Replicas are read only");
    if (from && ["db", "replica", "storage", "external"].includes(from.type))
      fail("Data/provider components must be leaves");
    if (e.dispatch === "all" && e.weight !== 1) fail("Fanout weight must be1");
  }
  for (const n of s.nodes) {
    if (
      n.type === "worker" &&
      s.edges.filter((e) => e.to === n.id).length !== 1
    )
      fail("Worker must consume exactly one queue");
    if (n.type === "queue") {
      const consumers = s.edges.filter((e) => e.from === n.id);
      if (consumers.length !== 1)
        fail("Queue requires one explicitly scalable worker deployment");
      if (
        s.edges
          .filter((e) => e.to === n.id)
          .some((e) =>
            e.operationIds.some(
              (op) => !consumers[0]?.operationIds.includes(op),
            ),
          )
      )
        fail("Consumer must support all queued operations");
    }
    for (const op of opIds) {
      const out = s.edges.filter(
        (e) => e.from === n.id && e.operationIds.includes(op),
      );
      if (
        out.length &&
        (out.some((e) => e.dispatch !== out[0].dispatch) ||
          (out[0].dispatch === "weighted_one" &&
            out.reduce((sum, e) => sum + e.weight, 0) !== 10000))
      )
        fail("Consistent per-operation dispatch required");
    }
  }
  const gray = new Set<string>(),
    black = new Set<string>(),
    reached = new Set<string>();
  function visit(id: string): boolean {
    if (gray.has(id)) return false;
    if (black.has(id)) return true;
    gray.add(id);
    for (const e of s.edges.filter((e) => e.from === id))
      if (!visit(e.to)) return false;
    gray.delete(id);
    black.add(id);
    return true;
  }
  if (s.nodes.some((n) => !visit(n.id))) fail("Request graph must be acyclic");
  function walk(id: string) {
    if (reached.has(id)) return;
    reached.add(id);
    s.edges.filter((e) => e.from === id).forEach((e) => walk(e.to));
  }
  w.origins.forEach((o) => {
    reached.add(o.clientNodeId);
    walk(o.entryNodeId);
  });
  regionalEntries?.forEach((r) => walk(r.entry));
  for (const n of s.nodes)
    if (n.type === "replica" && reached.has(n.primaryNodeId)) reached.add(n.id);
  if (s.nodes.some((n) => !reached.has(n.id))) fail("Unreachable component");
  // Every operation needs a real synchronous data path; cache hits do not erase the miss path.
  function dataPath(at: string, op: string, seen = new Set<string>()): boolean {
    if (seen.has(at)) return false;
    seen.add(at);
    const n = nodes.get(at);
    if (n?.type === "db" || n?.type === "replica") return true;
    return s.edges
      .filter(
        (e) =>
          e.from === at && e.mode === "sync" && e.operationIds.includes(op),
      )
      .some((e) => dataPath(e.to, op, new Set(seen)));
  }
  if (regionalEntries) {
    for (const r of regionalEntries)
      if (!dataPath(r.entry, r.operation))
        fail("Every regional entry/operation needs a synchronous data path");
  } else
    for (const o of w.origins)
      for (const op of opIds)
        if (!dataPath(o.entryNodeId, op))
          fail("Every entry/operation needs a synchronous data path");
}
export const componentInputSchema = componentInputBase.superRefine((s, ctx) =>
  componentSemantics(s, ctx),
);
export type ComponentNode = ComponentInput["nodes"][number];
export type ComponentOperation =
  ComponentInput["workload"]["operations"][number];
export type ComponentEdge = ComponentInput["edges"][number];
