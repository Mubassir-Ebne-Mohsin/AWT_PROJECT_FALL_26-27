import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { draftScenarioSchema } from "@/modules/region-lab/engine/regional-scenario";
const source = z.strictObject({
  id: z.uuid(),
  revision: z.number().int().positive(),
});
export class CreateRegionDto extends createZodDto(
  z.strictObject({
    name: z.string().trim().min(1).max(100),
    description: z.string().max(2000).default(""),
    scenario: draftScenarioSchema,
    sourceDesign: source.nullable().optional(),
  }),
) {}
export class PatchRegionDto extends createZodDto(
  z
    .strictObject({
      expectedRevision: z.number().int().positive(),
      name: z.string().trim().min(1).max(100).optional(),
      description: z.string().max(2000).optional(),
      scenario: draftScenarioSchema.optional(),
    })
    .refine((v) => Object.keys(v).length > 1, "Supply a mutable field"),
) {}
export class RunRegionDto extends createZodDto(
  z.strictObject({
    expectedRevision: z.number().int().positive(),
    requestId: z.uuid(),
  }),
) {}
export class DuplicateRegionDto extends createZodDto(
  z.strictObject({
    expectedRevision: z.number().int().positive(),
    name: z.string().trim().min(1).max(100),
  }),
) {}
export class ValidateRegionDto extends createZodDto(draftScenarioSchema) {}
