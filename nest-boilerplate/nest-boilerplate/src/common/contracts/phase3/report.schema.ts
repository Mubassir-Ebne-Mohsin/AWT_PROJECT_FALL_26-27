import { z } from "zod";
import { graphSchema, trafficSchema } from "@/common/contracts/phase2/graph.schema";
import { noteKindSchema } from "@/common/contracts/phase3/notes.schema";

// M16 Report: one chosen revision and one recorded run, assembled by the server. The same document backs the
// owner's printable report and (M16.2) the shared snapshot, so a leak is checked in exactly one place.
// Measured model outputs only; there is no AI commentary here. Core product contract, independent of AI.

export const reportQuerySchema = z.strictObject({
  revision: z.coerce.number().int().positive().optional(),
  run: z.uuid().optional(),
});

/** Which notes a report carries. The owner's own report uses "all"; a shared link uses "none" or "decisions". */
export const reportNoteScopeSchema = z.enum(["all", "decisions", "none"]);

const component = z.strictObject({
  label: z.string(),
  type: z.string(),
  region: z.string(),
  peak: z.number().nonnegative(),
  rho: z.number().nonnegative(),
  status: z.enum(["idle", "ok", "warn", "fail"]),
  errors: z.number().min(0).max(1),
});

const simulation = z.strictObject({
  verdict: z.enum(["pass", "strained", "fail"]),
  p50: z.number().nonnegative(),
  p95: z.number().nonnegative(),
  p99: z.number().nonnegative(),
  errorRate: z.number().min(0).max(1),
  throughput: z.number().nonnegative(),
  sloMet: z.boolean(),
  p95Target: z.number().positive(),
  errorBudget: z.number().min(0).max(1),
  bottleneck: z.strictObject({ label: z.string(), type: z.string(), rho: z.number().nonnegative() }).nullable(),
  components: z.array(component).max(50),
});

/** Result of a Limits search, stated as the model found it. Bounds are null when the state has no such number. */
export const reportLimitsSchema = z.strictObject({
  runId: z.uuid(),
  createdAt: z.iso.datetime(),
  state: z.enum(["found", "failsAtMinimumLoad", "notReachedWithinRange"]),
  passingRps: z.number().nonnegative().nullable(),
  failingRps: z.number().nonnegative().nullable(),
  headroom: z.number().nonnegative().nullable(),
  firstComponent: z.string().nullable(),
  cause: z.enum(["latency", "errors", "both"]).nullable(),
});

const run = z.strictObject({
  id: z.uuid(),
  kind: z.enum(["simulation", "limits"]),
  status: z.enum(["pending", "completed", "failed"]),
  designRevision: z.number().int().positive(),
  /** False when the chosen run was recorded for a different revision than the report's. Stated plainly. */
  matchesRevision: z.boolean(),
  engineVersion: z.string(),
  createdAt: z.iso.datetime(),
  /** The traffic the run was actually recorded at. */
  traffic: trafficSchema,
  simulation: simulation.nullable(),
  failure: z.strictObject({ code: z.string(), message: z.string() }).nullable(),
});

const note = z.strictObject({
  revision: z.number().int().positive(),
  kind: noteKindSchema,
  text: z.string(),
  createdAt: z.iso.datetime(),
});

export const reportSchema = z.strictObject({
  designId: z.uuid(),
  name: z.string(),
  description: z.string(),
  revision: z.number().int().positive(),
  isCurrentRevision: z.boolean(),
  versionCreatedAt: z.iso.datetime(),
  generatedAt: z.iso.datetime(),
  graph: graphSchema,
  traffic: trafficSchema,
  run: run.nullable(),
  /** Latest completed Limits search for this revision, or null: the report then says Limits was not run. */
  limits: reportLimitsSchema.nullable(),
  noteScope: reportNoteScopeSchema,
  notes: z.array(note).max(100),
  limitations: z.array(z.string()).min(1).max(10),
});

export type Report = z.infer<typeof reportSchema>;
