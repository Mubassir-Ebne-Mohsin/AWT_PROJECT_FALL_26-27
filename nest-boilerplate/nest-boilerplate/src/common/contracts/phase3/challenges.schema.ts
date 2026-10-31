import { z } from "zod";
import { trafficSchema } from "@/common/contracts/phase2/graph.schema";

// R5 Instructor challenges. An Instructor writes a goal, a fixed traffic profile and a starting design; learners later
// try to meet the goal. Core product contract, independent of the optional AI contracts and of the frozen phase 2
// contract. Challenge text is shown to every user, so it is plain text with length limits.

export const CHALLENGE_TITLE_MAX = 80;
export const CHALLENGE_SUMMARY_MAX = 2000;
export const CHALLENGE_MAX_PER_INSTRUCTOR = 50;

const plain = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((t) => !t.includes("\u0000"), "Text cannot contain a null character");

export const challengeStatusSchema = z.enum(["draft", "published", "archived"]);

/** Pass means p95 at or under `p95Ms` AND error rate at or under `errorRate`, both inclusive, at the challenge's traffic. */
export const challengeGoalSchema = z.strictObject({
  p95Ms: z.number().min(1).max(60000),
  errorRate: z.number().min(0).max(1),
});

/** The traffic an Instructor chooses. The SLO fields come from the goal, so the two can never disagree. */
export const challengeTrafficSchema = trafficSchema.omit({ sloP95: true, errorBudget: true });

/** The starting design is copied from one of the Instructor's own designs, at one revision, and frozen. */
export const startingDesignRefSchema = z.strictObject({ designId: z.uuid(), revision: z.number().int().positive().optional() });

export const createChallengeRequestSchema = z.strictObject({
  title: plain(CHALLENGE_TITLE_MAX),
  summary: plain(CHALLENGE_SUMMARY_MAX),
  goal: challengeGoalSchema,
  traffic: challengeTrafficSchema,
  from: startingDesignRefSchema,
});

/** Title and summary can always change. Goal, traffic and the starting design only while the challenge is a draft. */
export const patchChallengeRequestSchema = z
  .strictObject({
    title: plain(CHALLENGE_TITLE_MAX).optional(),
    summary: plain(CHALLENGE_SUMMARY_MAX).optional(),
    goal: challengeGoalSchema.optional(),
    traffic: challengeTrafficSchema.optional(),
    from: startingDesignRefSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to change");

/** What the model says about the starting design at the challenge's traffic, measured when the challenge is published. */
export const challengeBaselineSchema = z.strictObject({
  p95: z.number().nonnegative(),
  errorRate: z.number().min(0).max(1),
  passes: z.boolean(),
  engineVersion: z.string(),
});

/** What the owning Instructor sees. The starting design itself is not part of it, only its size. */
export const challengeSchema = z.strictObject({
  id: z.uuid(),
  title: z.string(),
  summary: z.string(),
  goal: challengeGoalSchema,
  traffic: trafficSchema,
  status: challengeStatusSchema,
  baseline: challengeBaselineSchema.nullable(),
  componentCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  publishedAt: z.iso.datetime().nullable(),
  archivedAt: z.iso.datetime().nullable(),
});

export type Challenge = z.infer<typeof challengeSchema>;
