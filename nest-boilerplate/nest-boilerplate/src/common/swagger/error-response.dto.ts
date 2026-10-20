import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { ERROR_CODES } from "@/common/errors";

const codes = Object.keys(ERROR_CODES) as [
  keyof typeof ERROR_CODES,
  ...(keyof typeof ERROR_CODES)[],
];

/** Shape of every error body: `{ error: { code, message, details? } }`. */
export const errorResponseSchema = z.object({
  error: z.object({
    code: z.enum(codes),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export class ErrorResponseDto extends createZodDto(errorResponseSchema) {}
