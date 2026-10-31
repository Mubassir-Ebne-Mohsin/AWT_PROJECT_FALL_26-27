import { z } from "zod";
import { challengeGoalSchema } from "@/common/contracts/phase3/challenges.schema";
import {
  FEEDBACK_MAX_CHARS,
  feedbackSchema,
  judgedSnapshotSchema,
} from "@/common/contracts/phase3/attempts.schema";

// R5.3 what an Instructor sees of submissions to their OWN challenges: the learner's display name (never an email),
// the graded outcome, and the frozen design of the submitted revision. Nothing else about the learner.

export const feedbackTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(FEEDBACK_MAX_CHARS)
  .refine((t) => !t.includes("\u0000"), "Text cannot contain a null character");
export const createFeedbackRequestSchema = z.strictObject({ text: feedbackTextSchema });

export const instructorSubmissionSchema = z.strictObject({
  id: z.uuid(),
  attemptId: z.uuid(),
  learner: z.strictObject({ displayName: z.string() }),
  designRevision: z.number().int().positive(),
  passes: z.boolean(),
  p95: z.number().nonnegative(),
  errorRate: z.number().min(0).max(1),
  engineVersion: z.string(),
  createdAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
  feedbackCount: z.number().int().nonnegative(),
});
export const instructorSubmissionListSchema = z.array(instructorSubmissionSchema);

export const instructorSubmissionDetailSchema = z.strictObject({
  submission: instructorSubmissionSchema,
  challenge: z.strictObject({ id: z.uuid(), title: z.string(), goal: challengeGoalSchema }),
  /** The exact graph and traffic that were judged, as frozen at submission time. */
  snapshot: judgedSnapshotSchema,
  feedback: z.array(feedbackSchema),
});
