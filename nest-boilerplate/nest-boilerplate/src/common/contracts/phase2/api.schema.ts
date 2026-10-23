import { z } from "zod";
import { componentType, graphSchema, importSchema, region, snapshotSchema, templateId, trafficSchema } from "@/common/contracts/phase2/graph.schema";
import { boundedValue, limitsOutputSchema, outputSchema, simulationOutputSchema, validationSchema } from "@/common/contracts/phase2/result.schema";

const uuid = z.uuid();
const revision = z.number().int().positive();
const name = z.string().trim().min(1).max(100);
const description = z.string().max(2000);
const date = z.iso.datetime();
const source = z.enum(["blank", "template", "import", "scripted"]);
const recordFields = {
  id: uuid, name, description, source, templateId: templateId.nullable(),
  revision, createdAt: date, updatedAt: date,
};
export const designSchema = z.strictObject({ ...recordFields, ...snapshotSchema.shape });
export const createDesignSchema = z.strictObject({
  name, description, source, templateId: templateId.nullable(), ...snapshotSchema.shape,
}).refine(value => value.source === "template" ? value.templateId !== null : value.templateId === null, "templateId must match source");
export const patchDesignSchema = z.strictObject({
  expectedRevision: revision, name: name.optional(), description: description.optional(),
  graph: graphSchema.optional(), traffic: trafficSchema.optional(),
}).refine(value => Object.keys(value).some(key => key !== "expectedRevision"), "Supply at least one editable field");
export const validateRequestSchema = z.strictObject({ expectedRevision: revision });
export const runRequestSchema = z.strictObject({ expectedRevision: revision, requestId: uuid });
export const runKind = z.enum(["simulation", "limits"]);
const runFields = {
  id: uuid, designId: uuid, requestId: uuid, designRevision: revision,
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/), engineVersion: z.string().min(1),
  kind: runKind, snapshot: snapshotSchema, createdAt: date,
};
const failure = z.strictObject({
  code: z.enum(["TIMEOUT", "WORKER_CRASH", "INTERRUPTED", "COMPUTE_FAILED", "COMPLEXITY_LIMIT"]),
  message: z.string().max(300),
});
export const runSchema = z.discriminatedUnion("status", [
  z.strictObject({ ...runFields, status: z.literal("pending"), completedAt: z.null(), result: z.null(), failure: z.null() }),
  z.strictObject({ ...runFields, status: z.literal("completed"), completedAt: date, result: outputSchema, failure: z.null() }),
  z.strictObject({ ...runFields, status: z.literal("failed"), completedAt: date, result: z.null(), failure }),
]).superRefine((run, ctx) => {
  if (run.status === "completed" && run.result.kind !== run.kind) {
    ctx.addIssue({ code: "custom", path: ["result", "kind"], message: "Result kind differs from run kind" });
  }
});
export const acceptedRunSchema = z.strictObject({
  run: runSchema, statusUrl: z.string().regex(/^\/v1\/designs\/[a-f0-9-]+\/runs\/[a-f0-9-]+$/),
});
const latestRun = z.strictObject({
  id: uuid, kind: runKind, status: z.enum(["pending", "completed", "failed"]), designRevision: revision,
  createdAt: date, verdict: z.enum(["pass", "strained", "fail"]).nullable(), p95: z.number().nonnegative().nullable(),
});
export const designSummarySchema = z.strictObject({
  ...recordFields, nodeCount: z.number().int().min(0).max(50), edgeCount: z.number().int().min(0).max(200),
  latestRun: latestRun.nullable(),
});
export const listQuerySchema = z.strictObject({ page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(50).default(20) });
export const designListSchema = z.strictObject({
  data: z.array(designSummarySchema).max(50),
  meta: z.strictObject({ page: z.number().int().positive(), pageSize: z.number().int().min(1).max(50), total: z.number().int().nonnegative() }),
});
export const dashboardSchema = z.strictObject({
  designs: z.array(designSummarySchema).max(10),
  recentRuns: z.array(latestRun.extend({ designId: uuid, designName: name })).max(10),
  counts: z.strictObject({ designs: z.number().int().nonnegative(), retainedRuns: z.number().int().nonnegative() }),
  countsLabel: z.literal("Runs in the retained window"),
});
export const previewRequestSchema = z.strictObject({
  editorSessionId: uuid, sequence: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  ...snapshotSchema.shape,
});
export const previewResponseSchema = z.strictObject({
  editorSessionId: uuid, sequence: z.number().int().nonnegative(),
  fingerprint: runFields.fingerprint, engineVersion: runFields.engineVersion,
  validation: validationSchema, summary: simulationOutputSchema.shape.summary.nullable(),
});
export const conflictDetailsSchema = z.discriminatedUnion("reason", [
  z.strictObject({ reason: z.literal("REVISION_MISMATCH"), currentRevision: revision }),
  z.strictObject({ reason: z.literal("REQUEST_ID_REUSED") }),
]);
export const templateSchema = z.strictObject({
  id: templateId, name, blurb: z.string(), ...snapshotSchema.shape,
});
export const catalogSchema = z.strictObject({
  engineVersion: runFields.engineVersion,
  components: z.array(z.strictObject({
    type: componentType,
    label: z.string(), short: z.string(), category: z.string(), capacity: boundedValue,
    latency: z.number().nonnegative(), behavior: z.enum(["none", "shed", "backlog", "timeout", "reject"]),
    blurb: z.string(), defaults: z.strictObject({ replicas: z.literal(1), hitRatio: z.number().min(0).max(1).optional(), share: z.number().min(0).max(1).optional(), maxDepth: z.number().int().positive().optional() }), editableProperties: z.array(z.enum(["capacity", "replicas", "latency", "region", "hitRatio", "share", "maxDepth"])),
  })).length(12),
  regions: z.array(z.strictObject({ id: region, label: z.string() })).length(3),
  trafficDefaults: trafficSchema,
  presets: z.array(z.strictObject({ id: z.enum(["steady", "evening", "flash", "launch", "ingest"]), name: z.string(), note: z.string(), traffic: trafficSchema })).length(5),
});
export const schemas = {
  Graph: graphSchema, Traffic: trafficSchema, Snapshot: snapshotSchema, Import: importSchema,
  Design: designSchema, CreateDesign: createDesignSchema, PatchDesign: patchDesignSchema,
  ValidateRequest: validateRequestSchema, Validation: validationSchema, RunRequest: runRequestSchema,
  Run: runSchema, AcceptedRun: acceptedRunSchema, DesignSummary: designSummarySchema,
  DesignList: designListSchema, Dashboard: dashboardSchema, PreviewRequest: previewRequestSchema,
  PreviewResponse: previewResponseSchema, ConflictDetails: conflictDetailsSchema,
  Template: templateSchema, Catalog: catalogSchema, SimulationOutput: simulationOutputSchema,
  LimitsOutput: limitsOutputSchema,
} as const;
// No Nest module/controller is registered in M1. These contracts describe future routes.
export type Design = z.infer<typeof designSchema>;
export type DesignRun = z.infer<typeof runSchema>;
