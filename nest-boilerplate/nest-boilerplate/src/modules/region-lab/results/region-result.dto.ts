import { createZodDto } from "nestjs-zod";
import { z } from "zod";
const count = z.number().int().nonnegative(),
  ms = z.number().finite().nonnegative().nullable();
const histogram = z
  .strictObject({
    format: z.literal("hdr-v2-base64"),
    unit: z.literal("ms"),
    encodedTickToMs: z.literal(0.001),
    lowestDiscernibleValue: z.literal(1),
    highestTrackableValue: z.literal(60000000),
    significantDigits: z.literal(3),
    count: count.positive(),
    data: z.string().max(180000),
  })
  .nullable();
export const recordedSummarySchema = z.strictObject({
  offeredRequests: count,
  successfulRequests: count,
  failedRequests: count,
  unresolvedRequests: count,
  attempts: count,
  errorRateRatio: z.number().min(0).max(1).nullable(),
  failures: z.strictObject({
    QUEUE_FULL: count,
    RATE_LIMITED: count,
    DEADLINE: count,
    UNAVAILABLE: count,
  }),
  latency: z.strictObject({
    count,
    meanMs: ms,
    p50Ms: ms,
    p95Ms: ms,
    p99Ms: ms,
  }),
  verdict: z.enum(["pass", "fail", "indeterminate"]),
});
const row = z.record(z.string(), z.unknown());
export const regionResultViewSchema = z.strictObject({
  runId: z.uuid(),
  experimentRevision: count.positive(),
  currentRevision: count.positive(),
  isCurrentRevision: z.boolean(),
  inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  engineVersion: z.string(),
  wireVersion: z.enum(["native-v1", "region-lab-result-v2"]),
  calibration: z.literal("uncalibrated"),
  scenario: z.enum(["baseline", "outage"]),
  repetition: count.max(4),
  seed: count,
  summary: recordedSummarySchema,
  provenance: z.array(
    z.strictObject({
      id: z.string(),
      version: count.positive(),
      origin: z.enum(["custom", "reference", "measured"]),
      provenance: z.string(),
    }),
  ),
  targets: z.unknown(),
  phases: z.array(row),
  links: z.array(row),
  reroutedRoots: count.nullable(),
  warnings: z.array(z.string()),
  limitations: z.array(z.string()),
  distribution: histogram,
  distributionPlot: z
    .array(
      z.strictObject({
        fromMs: z.number().nonnegative(),
        toMs: z.number().nonnegative(),
        count,
      }),
    )
    .max(24),
  distributionStatus: z.enum(["captured", "unavailable_for_legacy_run"]),
  timelineAccounting: z.string(),
  items: z.array(row).max(120),
  nextCursor: z.string().nullable(),
});
export class RegionResultViewDto extends createZodDto(regionResultViewSchema) {}
