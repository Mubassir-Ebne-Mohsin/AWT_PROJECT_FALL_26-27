import { z } from "zod";
import { createDesignSchema } from "@/common/contracts/phase2/api.schema";
import { aiProviderSchema } from "@/common/contracts/phase3/ai.schema";

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

export type AiTaskReadiness = z.infer<typeof aiTaskReadinessSchema>;
export type AiDescribePrepared = z.infer<typeof aiDescribePreparedSchema>;
