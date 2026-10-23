import { HttpException, HttpStatus } from "@nestjs/common";

/** Stable machine-readable codes; the frontend maps system-state pages to these. */
export const ERROR_CODES = {
  CONFLICT: HttpStatus.CONFLICT,
  VALIDATION_FAILED: HttpStatus.UNPROCESSABLE_ENTITY,
  UNAUTHENTICATED: HttpStatus.UNAUTHORIZED,
  SESSION_EXPIRED: HttpStatus.UNAUTHORIZED,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  INTERNAL: HttpStatus.INTERNAL_SERVER_ERROR,
  UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export class AppException extends HttpException {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message, ERROR_CODES[code]);
  }
}
