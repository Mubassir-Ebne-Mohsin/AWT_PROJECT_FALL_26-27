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
