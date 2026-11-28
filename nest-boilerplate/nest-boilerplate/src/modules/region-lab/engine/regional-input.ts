import { z } from "zod";
import {
  componentInputBase,
  componentSemantics,
  demand,
} from "@/modules/region-lab/engine/component-input";
const region = z.enum(["us-east", "eu-west", "ap-south"]);
const id = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/)
  .refine((v) => !["constructor", "prototype", "__proto__"].includes(v));
const ms = z.number().int().min(0).max(60000);
export const regionalInputSchema = componentInputBase
  .omit({ componentVersion: true })
  .extend({
    regionalVersion: z.literal(1),
    network: z
      .array(
        z.strictObject({
          from: region,
          to: region,
          oneWayDelay: demand,
          bandwidthMbps: z.number().min(0.001).max(1000000),
          provenance: z.string().trim().min(1).max(500),
        }),
      )
      .min(1)
      .max(9),
    routing: z
      .array(
        z.strictObject({
          originRegion: region,
          operationId: id,
          policy: z.enum(["explicit", "nearest_healthy"]),
          primaryEntryNodeId: id,
          fallbackEntryNodeIds: z.array(id).max(2),
          detectionMs: ms,
          switchMs: ms,
          failbackMs: ms,
          returnOnRecovery: z.boolean(),
        }),
      )
      .min(1)
      .max(24),
    outage: z
      .strictObject({
        id,
        scope: z.literal("application_deployment"),
        region,
        affectedNodeIds: z.array(id).min(1).max(12),
        startMs: z.number().int().min(0).max(3600000),
        durationMs: z.number().int().min(1).max(3600000),
        inFlightPolicy: z.literal("abort_at_failed_node"),
      })
      .nullable(),
    regionalTargets: z
      .array(
        z.strictObject({
          region,
          p95Ms: z.number().min(1).max(60000),
          errorBudgetRatio: z.number().min(0).max(1),
        }),
      )
      .max(3),
  })
  .superRefine((s, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    const entries = s.routing.flatMap((r) =>
      [r.primaryEntryNodeId, ...r.fallbackEntryNodeIds].map((entry) => ({
        entry,
        operation: r.operationId,
      })),
    );
    componentSemantics({ ...s, componentVersion: 1 }, ctx, entries);
    const regions = new Set(s.nodes.map((n) => n.region)),
      nodes = new Map(s.nodes.map((n) => [n.id, n]));
    if (
      s.workload.origins.length !== regions.size ||
      s.workload.origins.some((o) => !regions.has(o.id))
    )
      fail("One client/share per active region required");
    const pairs = s.network.map((n) => n.from + ">" + n.to);
    if (
      new Set(pairs).size !== pairs.length ||
      s.network.some((n) => !regions.has(n.from) || !regions.has(n.to))
    )
      fail("Unique active ordered network pairs required");
    for (const from of regions)
      for (const to of regions)
        if (!pairs.includes(from + ">" + to))
          fail(
            "Complete directed network matrix required, including local pairs",
          );
    if (s.edges.some((e) => e.oneWayDelayMs !== 0))
      fail(
        "Regional edges must have zero local delay; use network matrix to avoid double counting",
      );
    const routes = s.routing.map((r) => r.originRegion + ">" + r.operationId);
    if (new Set(routes).size !== routes.length)
      fail("Unique regional operation routes required");
    for (const origin of s.workload.origins)
      for (const op of s.workload.operations)
        if (!routes.includes(origin.id + ">" + op.id))
          fail("A route per origin and operation is required");
    for (const o of s.workload.origins)
      if (
        o.entryNodeId !==
        s.routing.find(
          (r) =>
            r.originRegion === o.id &&
            r.operationId ===
              [...s.workload.operations].sort((a, b) =>
                a.id < b.id ? -1 : 1,
              )[0].id,
        )?.primaryEntryNodeId
      )
        fail(
          "Origin entry must match the canonical first operation primary route",
        );
    for (const r of s.routing) {
      if (
        !regions.has(r.originRegion) ||
        !s.workload.operations.some((o) => o.id === r.operationId)
      )
        fail("Unknown route origin or operation");
      const candidates = [r.primaryEntryNodeId, ...r.fallbackEntryNodeIds];
      if (new Set(candidates).size !== candidates.length)
        fail("Route candidates cannot repeat");
      for (const entry of candidates)
        if (!["app", "lb", "gateway"].includes(nodes.get(entry)?.type ?? ""))
          fail("Route entries must be app, LB or gateway");
    }
    if (
      new Set(s.regionalTargets.map((t) => t.region)).size !==
        s.regionalTargets.length ||
      s.regionalTargets.some((t) => !regions.has(t.region))
    )
      fail("Unknown or repeated regional target");
    if (s.outage) {
      const o = s.outage;
      if (
        o.startMs + o.durationMs > s.workload.durationMs ||
        !regions.has(o.region)
      )
        fail("Outage must fit the measurement window and active regions");
      if (new Set(o.affectedNodeIds).size !== o.affectedNodeIds.length)
        fail("Repeated affected node");
      for (const id of o.affectedNodeIds) {
        const n = nodes.get(id);
        if (
          !n ||
          n.region !== o.region ||
          !["app", "lb", "gateway", "cache", "worker"].includes(n.type)
        )
          fail(
            "Only application deployment nodes in the selected region may fail",
          );
      }
    }
  });
export type RegionalInput = z.infer<typeof regionalInputSchema>;
export type Region = RegionalInput["network"][number]["from"];
