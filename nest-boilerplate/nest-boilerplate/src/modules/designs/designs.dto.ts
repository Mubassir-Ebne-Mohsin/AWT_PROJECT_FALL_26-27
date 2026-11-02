import { z } from "zod";
import { createZodDto } from "nestjs-zod";
import {
  createDesignSchema,
  patchDesignSchema,
  runRequestSchema,
  validateRequestSchema,
} from "@/common/contracts/phase2/api.schema";
export class CreateDesignDto extends createZodDto(createDesignSchema) {}
export class PatchDesignDto extends createZodDto(patchDesignSchema) {}
export class RunRequestDto extends createZodDto(runRequestSchema) {}
export class ValidateDesignDto extends createZodDto(validateRequestSchema) {}

import { prepareDesignSchema } from "@/modules/designs/creation.schema";
import { restoreVersionRequestSchema } from "@/common/contracts/phase3/history.schema";
import { fixesRequestSchema } from "@/common/contracts/phase3/fixes.schema";
import { ladderRequestSchema } from "@/common/contracts/phase3/ladder.schema";
export class RestoreVersionDto extends createZodDto(restoreVersionRequestSchema) {}
export class FixesRequestDto extends createZodDto(fixesRequestSchema) {}
export class LadderRequestDto extends createZodDto(ladderRequestSchema) {}
import { createNoteRequestSchema, patchNoteRequestSchema } from "@/common/contracts/phase3/notes.schema";
export class CreateNoteDto extends createZodDto(createNoteRequestSchema) {}
export class PatchNoteDto extends createZodDto(patchNoteRequestSchema) {}
export class PrepareDesignDto extends createZodDto(
  z.strictObject({ input: prepareDesignSchema }),
) {}
