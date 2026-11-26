import { z } from "zod";
import {
  componentType,
  localId,
  region,
} from "@/common/contracts/phase2/graph.schema";
const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((s) => !s.includes("\u0000"), "No null characters");
export const exerciseProfileSchema = z.enum([
  "scale-app",
  "add-cache",
  "read-replicas",
  "edge-cache",
  "co-locate",
  "media-edge",
]);
export const challengeLearningSchema = z.strictObject({
  category: z.enum([
    "Scaling",
    "Caching",
    "Data",
    "Regions",
    "Media",
    "Routing",
  ]),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  estimatedMinutes: z.number().int().min(5).max(180),
  objective: text(240),
  brief: text(2000),
  topics: z
    .array(
      z
        .string()
        .regex(/^[a-z][a-z0-9-]*$/)
        .max(50),
    )
    .min(1)
    .max(6),
  hints: z.tuple([text(400), text(400), text(400)]),
  sequence: z.number().int().min(0).max(999).default(100),
});
const editable = z.discriminatedUnion("property", [
  z
    .strictObject({
      nodeId: localId,
      property: z.literal("replicas"),
      min: z.number().int().min(1),
      max: z.number().int().max(200),
    })
    .refine((x) => x.min <= x.max),
  z.strictObject({
    nodeId: localId,
    property: z.literal("region"),
    choices: z.array(region).min(1).max(3),
  }),
]);
export const challengeRulesSchema = z.strictObject({
  version: z.literal(1),
  profile: exerciseProfileSchema,
  editable: z.array(editable).max(50),
  additions: z
    .array(
      z.strictObject({
        type: z.enum(["cache", "cdn", "replica"]),
        maxNodes: z.number().int().min(1).max(4),
        maxHitRatio: z.number().min(0).max(0.95).optional(),
      }),
    )
    .max(3),
  replicaCaps: z.partialRecord(componentType, z.number().int().min(1).max(200)),
});
export type ChallengeLearning = z.infer<typeof challengeLearningSchema>;
export type ChallengeRules = z.infer<typeof challengeRulesSchema>;
export type ExerciseProfile = z.infer<typeof exerciseProfileSchema>;
