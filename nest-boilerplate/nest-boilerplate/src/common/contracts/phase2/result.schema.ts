import { z } from "zod";
import { componentType, localId, region, trafficSchema } from "@/common/contracts/phase2/graph.schema";

const nonnegative = z.number().nonnegative();
const ratio = z.number().min(0).max(1);
export const boundedValue = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("finite"), value: nonnegative }),
  z.strictObject({ kind: z.literal("unbounded") }),
]);
export const issueSchema = z.strictObject({
  code: z.enum(["EMPTY", "NO_ENTRY", "ENTRY_UNCONNECTED", "EDGE_INTO_ENTRY", "CYCLE", "UNREACHABLE", "QUEUE_NO_CONSUMER", "WRITES_TO_REPLICA", "NO_WRITE_TARGET", "COMPLEXITY_LIMIT"]),
  message: z.string(), repair: z.string(), nodeIds: z.array(localId).max(50),
  severity: z.enum(["error", "warning", "info"]),
});
export const validationSchema = z.strictObject({
  ok: z.boolean(), errors: z.array(issueSchema), warnings: z.array(issueSchema),
}).superRefine((report, ctx) => {
  if (report.ok !== (report.errors.length === 0) || report.errors.some(i => i.severity !== "error") || report.warnings.some(i => i.severity === "error")) ctx.addIssue({ code: "custom", message: "Validation status/severity mismatch" });
});
export const nodeMetricSchema = z.strictObject({
  id: localId, type: componentType, label: z.string(), region,
  reads: nonnegative, writes: nonnegative, async: nonnegative, peak: nonnegative,
  cap: boundedValue, rho: nonnegative, status: z.enum(["idle", "ok", "warn", "fail"]),
  background: z.boolean(), T: nonnegative, S: nonnegative, Wq: nonnegative,
  servers: z.number().int().positive().nullable(), errors: ratio, visit: nonnegative,
  contribution: nonnegative, satRps: boundedValue,
}).superRefine((metric, ctx) => {
  if ((metric.type === "client") !== (metric.servers === null)) ctx.addIssue({ code: "custom", path: ["servers"], message: "Clients have no service pool; other components require a server count" });
});
export const queueMetricSchema = z.strictObject({
  id: localId, label: z.string(), arrival: nonnegative, peakArrival: nonnegative,
  drain: nonnegative, backlog: nonnegative, lag: boundedValue, overflow: ratio,
  maxDepth: nonnegative, state: z.enum(["idle", "clear", "growing", "absorbing"]), syncShare: nonnegative,
});
export const simulationSchema = z.strictObject({
  traffic: trafficSchema, rps: nonnegative, peakRps: nonnegative,
  p50: nonnegative, p95: nonnegative, p99: nonnegative, mean: nonnegative,
  errorRate: ratio, throughput: nonnegative, sloMet: z.boolean(),
  verdict: z.enum(["pass", "strained", "fail"]), validation: validationSchema,
  nodes: z.array(nodeMetricSchema).max(50), bottleneckId: localId.nullable(), maxRho: nonnegative,
  queues: z.array(queueMetricSchema).max(50),
  backgroundIssues: z.array(z.strictObject({ id: localId, label: z.string(), rho: nonnegative, dropped: ratio })),
  flows: z.array(z.strictObject({ from: localId, to: localId, rps: nonnegative })).max(200),
  crossRegion: z.array(z.strictObject({ from: localId, to: localId, fromRegion: region, toRegion: region, rtt: nonnegative, flow: nonnegative })).max(200),
});
const pathSchema = z.strictObject({
  kind: z.enum(["Read", "Write"]), p: ratio, mean: nonnegative, p95: nonnegative, ok: ratio,
  steps: z.array(z.strictObject({ id: localId, label: z.string(), type: componentType, hop: nonnegative, T: nonnegative })).max(50),
});
const timelinePoint = z.strictObject({ t: nonnegative, rps: nonnegative, p95: nonnegative, err: ratio });
export const simulationOutputSchema = z.strictObject({
  kind: z.literal("simulation"), summary: simulationSchema, paths: z.array(pathSchema).max(6),
  timeline: z.array(timelinePoint).max(48), timelineLabel: z.literal("illustrative sampled timeline"),
});
const limitBase = {
  kind: z.literal("limits"), minimumTestedRps: z.literal(1), maximumTestedRps: nonnegative,
  searchIterations: z.number().int().min(0).max(24),
  current: simulationSchema, headroom: boundedValue,
  firstId: localId.nullable(), cause: z.enum(["latency", "errors", "both"]).nullable(),
  orderLabel: z.literal("predicted saturation under unshed demand"),
  order: z.array(z.strictObject({ id: localId, label: z.string(), type: componentType, satRps: boundedValue })).max(50),
  curve: z.array(z.strictObject({ rps: nonnegative, p50: nonnegative, p95: nonnegative, p99: nonnegative, err: ratio, maxRho: nonnegative })).max(45),
};
export const limitsOutputSchema = z.discriminatedUnion("state", [
  z.strictObject({ ...limitBase, state: z.literal("found"), passingRps: nonnegative, failingRps: nonnegative, at: simulationSchema }),
  z.strictObject({ ...limitBase, state: z.literal("failsAtMinimumLoad"), lowerThreshold: z.literal("unknown"), headroom: z.null(), at: simulationSchema }),
  z.strictObject({ ...limitBase, state: z.literal("notReachedWithinRange"), headroom: z.number().nonnegative().nullable(), headroomIsLowerBound: z.literal(true), at: z.null() }),
]).superRefine((limits, ctx) => {
  if (limits.maximumTestedRps < 1 || (limits.state === "found" && !(1 <= limits.passingRps && limits.passingRps < limits.failingRps && limits.failingRps <= limits.maximumTestedRps))) ctx.addIssue({ code: "custom", message: "Invalid tested range/threshold bracket" });
});
export const outputSchema = z.union([simulationOutputSchema, limitsOutputSchema]);
