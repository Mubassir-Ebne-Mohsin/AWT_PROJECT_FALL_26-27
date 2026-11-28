import { z } from "zod";

const id = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/)
  .refine(
    (v) => !["__proto__", "prototype", "constructor"].includes(v),
    "Reserved identifier",
  );
const int = (min: number, max: number) => z.number().int().min(min).max(max);
const range = (min: number, max: number) => z.number().min(min).max(max);
export const distributionSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("constant"), valueMs: range(0.001, 60000) }),
  z.strictObject({
    kind: z.literal("exponential"),
    meanMs: range(0.001, 60000),
  }),
  z.strictObject({
    kind: z.literal("lognormal"),
    meanMs: range(0.001, 60000),
    coefficientOfVariation: range(0.01, 3),
  }),
]);
export const foundationSchema = z
  .strictObject({
    foundationVersion: z.literal(1),
    seed: int(0, 4294967295),
    workload: z.strictObject({
      baselineRps: range(0, 20000),
      arrival: z.enum(["constant_rate", "poisson"]),
      durationMs: int(1, 3600000),
      warmupMs: int(0, 120000),
      drainMs: int(1, 60000),
      schedule: z
        .array(
          z.strictObject({ atMs: range(0, 3600000), multiplier: range(0, 10) }),
        )
        .min(2)
        .max(32),
      origins: z
        .array(
          z.strictObject({
            id: z.enum(["us-east", "eu-west", "ap-south"]),
            shareBps: int(0, 10000),
            entryNodeId: id,
          }),
        )
        .min(1)
        .max(3),
      operations: z
        .array(
          z.strictObject({
            id,
            kind: z.enum(["read", "write"]),
            shareBps: int(1, 10000),
            deadlineMs: int(1, 60000),
            idempotent: z.boolean(),
            retry: z.strictObject({
              maxAttempts: int(1, 3),
              baseBackoffMs: int(1, 10000),
              maxBackoffMs: int(1, 60000),
              jitterRatio: range(0, 1),
            }),
          }),
        )
        .min(1)
        .max(8),
    }),
    nodes: z
      .array(
        z.strictObject({
          id,
          replicas: int(1, 200),
          slotsPerReplica: int(1, 1024),
          waitingCapacityPerReplica: int(0, 100000),
          serviceTime: distributionSchema,
          dispatch: z.enum(["all", "weighted_one"]),
          downstream: z
            .array(
              z.strictObject({
                id,
                target: id,
                weight: int(1, 10000),
                oneWayDelayMs: range(0, 30000),
              }),
            )
            .max(36),
        }),
      )
      .min(1)
      .max(36),
    targets: z.strictObject({
      p95Ms: range(1, 60000),
      errorBudgetRatio: range(0, 1),
    }),
  })
  .superRefine((value, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    const unique = (values: string[]) => new Set(values).size === values.length;
    const nodeIds = value.nodes.map((n) => n.id),
      origins = value.workload.origins,
      operations = value.workload.operations;
    if (value.nodes.reduce((sum, n) => sum + n.downstream.length, 0) > 120)
      fail("At most120 processing edges");
    if (
      !unique([
        ...nodeIds,
        ...value.nodes.flatMap((n) => n.downstream.map((e) => e.id)),
      ])
    )
      fail("Node and edge identifiers must be unique");
    if (
      !unique(origins.map((o) => o.id)) ||
      origins.reduce((sum, o) => sum + o.shareBps, 0) !== 10000
    )
      fail("Origin shares must total10000 without duplicate regions");
    if (
      !unique(operations.map((o) => o.id)) ||
      operations.reduce((sum, o) => sum + o.shareBps, 0) !== 10000
    )
      fail("Operation shares must total10000 without duplicate identifiers");
    for (const o of origins)
      if (!nodeIds.includes(o.entryNodeId)) fail("Unknown entry node");
    for (const o of operations) {
      if (!o.idempotent && o.retry.maxAttempts > 1)
        fail("Retries require idempotency");
      if (o.retry.baseBackoffMs > o.retry.maxBackoffMs)
        fail("Backoff cap is below base");
      if (o.deadlineMs > value.workload.drainMs)
        fail("Drain interval must cover every root deadline");
    }
    const knots = value.workload.schedule;
    if (
      knots[0].atMs !== 0 ||
      knots.at(-1)!.atMs !== value.workload.durationMs ||
      knots.some((k, i) => i > 0 && k.atMs <= knots[i - 1].atMs)
    )
      fail("Schedule must have ordered knots spanning the measurement window");
    for (const n of value.nodes) {
      if (
        n.dispatch === "weighted_one" &&
        n.downstream.length &&
        n.downstream.reduce((sum, e) => sum + e.weight, 0) !== 10000
      )
        fail("Weighted dispatch must total10000");
      if (n.dispatch === "all" && n.downstream.some((e) => e.weight !== 1))
        fail("Fan-out weights must be1");
      if (!unique(n.downstream.map((e) => e.target)))
        fail("Duplicate downstream destination");
      for (const e of n.downstream)
        if (!nodeIds.includes(e.target) || e.target === n.id)
          fail("Unknown endpoint or self-edge");
    }
    const byId = new Map(value.nodes.map((n) => [n.id, n])),
      gray = new Set<string>(),
      black = new Set<string>();
    const visit = (key: string): boolean => {
      if (gray.has(key)) return false;
      if (black.has(key)) return true;
      gray.add(key);
      for (const e of byId.get(key)?.downstream ?? [])
        if (!visit(e.target)) return false;
      gray.delete(key);
      black.add(key);
      return true;
    };
    if (nodeIds.some((key) => !visit(key)))
      fail("Processing graph must be acyclic");
    const reachable = new Set<string>();
    const walk = (key: string) => {
      if (reachable.has(key)) return;
      reachable.add(key);
      for (const e of byId.get(key)?.downstream ?? []) walk(e.target);
    };
    origins.forEach((o) => walk(o.entryNodeId));
    if (nodeIds.some((key) => !reachable.has(key)))
      fail("Unreachable processing node");
  });

export type FoundationInput = z.infer<typeof foundationSchema>;
export type Distribution = z.infer<typeof distributionSchema>;
export type ProcessingNode = FoundationInput["nodes"][number];
export type Operation = FoundationInput["workload"]["operations"][number];
