import { z } from "zod";
import { challengeGoalSchema } from "@/common/contracts/phase3/challenges.schema";
import {
  graphSchema,
  trafficSchema,
} from "@/common/contracts/phase2/graph.schema";

export const SUBMISSION_LIMIT = 20;
export const publicChallengeSchema = z.strictObject({
  id: z.uuid(),
  title: z.string(),
  summary: z.string(),
  goal: challengeGoalSchema,
});
export const submitAttemptSchema = z.strictObject({
  requestId: z.uuid(),
  expectedRevision: z.number().int().positive(),
});
export const attemptSchema = z.strictObject({
  id: z.uuid(),
  challengeId: z.uuid(),
  designId: z.uuid(),
  createdAt: z.iso.datetime(),
});
export const submissionSchema = z.strictObject({
  id: z.uuid(),
  attemptId: z.uuid(),
  requestId: z.uuid(),
  designRevision: z.number().int().positive(),
  status: z.enum(["pending", "completed", "failed", "interrupted"]),
  passes: z.boolean().nullable(),
  p95: z.number().nonnegative().nullable(),
  errorRate: z.number().min(0).max(1).nullable(),
  engineVersion: z.string().nullable(),
  createdAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
});
export const judgedSnapshotSchema = z.strictObject({
  schemaVersion: z.literal(1),
  graph: graphSchema,
  traffic: trafficSchema,
});
export type Submission = z.infer<typeof submissionSchema>;
export const attemptViewSchema = z.strictObject({
  attempt: attemptSchema,
  challenge: z.strictObject({
    title: z.string(),
    archived: z.boolean(),
    goal: challengeGoalSchema,
  }),
  submissions: z.array(submissionSchema),
});
export const challengeProgressItemSchema = z.strictObject({
  attemptId: z.uuid(),
  challengeId: z.uuid(),
  designId: z.uuid().nullable(),
  title: z.string(),
  archived: z.boolean(),
  goal: challengeGoalSchema,
  passed: z.boolean(),
  best: submissionSchema.nullable(),
  submissions: z.array(submissionSchema),
});
export const challengeProgressSchema = z.strictObject({
  attempted: z.number().int().nonnegative(),
  passed: z.number().int().nonnegative(),
  items: z.array(challengeProgressItemSchema),
});
export const publicChallengeListSchema = z.array(publicChallengeSchema);
