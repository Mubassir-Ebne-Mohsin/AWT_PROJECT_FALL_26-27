import { z } from "zod";
import { createDesignSchema } from "@/common/contracts/phase2/api.schema";
import { aiProviderSchema } from "@/common/contracts/phase3/ai.schema";
import { fixFilterSchema } from "@/common/contracts/phase3/fixes.schema";

/** Design tasks that use a hosted model (docs/AI-COPILOT-SCOPE.md). Each has its own switch. */
export const AI_TASK_NAMES = ["describe", "whatif", "fixes"] as const;
export const aiTaskNameSchema = z.enum(AI_TASK_NAMES);

/** Longest description sent to the model. Longer text is refused, never cut. */
export const DESCRIBE_MAX_CHARS = 500;

export const aiTaskReadinessSchema = z.strictObject({
  task: aiTaskNameSchema,
  /** The task's own switch is on. */
  enabled: z.boolean(),
  /** It could run now: enabled, a hosted model configured, quota available. */
  available: z.boolean(),
  provider: aiProviderSchema,
  model: z.string(),
  reason: z.enum(["AVAILABLE", "DISABLED", "PROVIDER_NOT_CONFIGURED", "QUOTA_EXHAUSTED"]),
  /** Seconds until a quota or back-off allows another request, when that is the reason. */
  retryAfterSeconds: z.number().int().positive().optional(),
});
export const aiTasksReadinessSchema = z.strictObject({ tasks: z.array(aiTaskReadinessSchema).max(3) });

export const aiDescribeRequestSchema = z.strictObject({
  text: z.string().trim().min(1).max(DESCRIBE_MAX_CHARS),
});

/** The same shape as the scripted draft's prepared design, plus which model suggested it. Nothing is saved by this call. */
export const aiDescribePreparedSchema = z.strictObject({
  design: createDesignSchema,
  assumptions: z.array(z.string().max(300)).max(12),
  provider: aiProviderSchema,
  model: z.string(),
});

/** Longest goal sent to the model for the fix suggestions. Longer text is refused, never cut. */
export const FIX_INTENT_MAX_CHARS = 200;
export const aiFixIntentRequestSchema = z.strictObject({ goal: z.string().trim().min(1).max(FIX_INTENT_MAX_CHARS) });

/** One server-written choice offered when a goal is genuinely ambiguous. Picking it is the person's act; `filter` is what it would apply. */
export const aiClarificationChoiceSchema = z.strictObject({ id: z.string().max(40), label: z.string().max(80), filter: fixFilterSchema });
export const aiClarificationSchema = z.strictObject({
  reason: z.enum(["copies_or_replica", "conflicting_preferences"]),
  question: z.string().max(200),
  choices: z.array(aiClarificationChoiceSchema).min(2).max(4),
});

/**
 * What the model's closed form was turned into. `interpretation` is worded by the server; nothing the model wrote is passed on.
 * `status` is the three-way outcome: SUPPORTED (a proposal to confirm), CLARIFY (server-written choices, nothing applied), or
 * UNSUPPORTED (no wish about the fixes was found). `understood` is kept for older clients and equals `status === "SUPPORTED"`.
 */
export const aiFixIntentSchema = z.strictObject({
  understood: z.boolean(),
  status: z.enum(["SUPPORTED", "CLARIFY", "UNSUPPORTED"]),
  clarification: aiClarificationSchema.nullable(),
  filter: fixFilterSchema,
  interpretation: z.array(z.string().max(200)).max(4),
  provider: aiProviderSchema,
  model: z.string(),
});

export type AiTaskReadiness = z.infer<typeof aiTaskReadinessSchema>;
export type AiFixIntent = z.infer<typeof aiFixIntentSchema>;
export type AiDescribePrepared = z.infer<typeof aiDescribePreparedSchema>;
