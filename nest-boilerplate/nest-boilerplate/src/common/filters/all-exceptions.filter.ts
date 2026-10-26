import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { ThrottlerException } from "@nestjs/throttler";
import { ZodValidationException } from "nestjs-zod";
import { ZodError } from "zod";
import { TimeoutError as RedisTimeoutError, SocketTimeoutError } from "redis";
import type { Response } from "express";
import { databaseUnavailable } from "@/common/filters/database-unavailable";
import { AppException, ErrorCode } from "@/common/errors";

interface ErrorBody {
  error: { code: ErrorCode; message: string; details?: unknown };
}

const CODE_BY_STATUS: Record<number, ErrorCode> = {
  [HttpStatus.CONFLICT]: "CONFLICT",
  [HttpStatus.UNAUTHORIZED]: "UNAUTHENTICATED",
  [HttpStatus.FORBIDDEN]: "FORBIDDEN",
  [HttpStatus.NOT_FOUND]: "NOT_FOUND",
  [HttpStatus.TOO_MANY_REQUESTS]: "RATE_LIMITED",
  [HttpStatus.SERVICE_UNAVAILABLE]: "UNAVAILABLE",
  [HttpStatus.BAD_REQUEST]: "VALIDATION_FAILED",
  [HttpStatus.UNPROCESSABLE_ENTITY]: "VALIDATION_FAILED",
};

// node-redis (offline queue disabled) and ioredis (rate-limit storage) reject with these
// when Redis is unreachable. That is "service unavailable", not a bug in the request.
const REDIS_DOWN_ERRORS = [
  "ClientOfflineError",
  "ClientClosedError",
  "ConnectionTimeoutError",
  "MaxRetriesPerRequestError",
];

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("Exception");

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.toResponse(exception);
    if (exception instanceof AppException) {
      // Deliberate errors (e.g. a failing health check) need no stack trace.
      if (status >= 500) this.logger.warn(exception.message);
    } else if (status >= 500) {
      // Unexpected error messages/stacks can include SQL parameters or credentials.
      this.logger.error("Unhandled request failure");
    }
    res.status(status).json(body);
  }

  private toResponse(exception: unknown): { status: number; body: ErrorBody } {
    if (exception instanceof AppException) {
      return this.build(
        exception.getStatus(),
        exception.code,
        exception.message,
        exception.details,
      );
    }
    if (exception instanceof ZodValidationException) {
      return this.build(
        422,
        "VALIDATION_FAILED",
        "Validation failed",
        this.zodDetails(exception.getZodError()),
      );
    }
    if (exception instanceof ThrottlerException) {
      return this.build(
        429,
        "RATE_LIMITED",
        "Too many requests. Please slow down.",
      );
    }
    // body-parser errors are not necessarily Nest HttpExceptions. Do not expose
    // the parser's message/body, which can contain submitted credentials.
    if (
      exception instanceof Error &&
      "type" in exception &&
      [
        "entity.too.large",
        "entity.parse.failed",
        "request.aborted",
        "request.size.invalid",
      ].includes(String(exception.type))
    ) {
      return this.build(
        422,
        "VALIDATION_FAILED",
        exception.type === "entity.too.large"
          ? "Request body is too large"
          : "Invalid request body",
      );
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code =
        CODE_BY_STATUS[status] ??
        (status >= 500 ? "INTERNAL" : "VALIDATION_FAILED");
      // Never leak framework internals for server errors.
      const message =
        status >= 500
          ? "Something went wrong"
          : status === 400
            ? "Invalid request body"
            : this.messageOf(exception);
      return this.build(
        code === "VALIDATION_FAILED" ? 422 : status,
        code,
        message,
      );
    }
    if (
      exception instanceof Error &&
      (exception instanceof RedisTimeoutError ||
        exception instanceof SocketTimeoutError ||
        REDIS_DOWN_ERRORS.includes(exception.name) ||
        databaseUnavailable(exception))
    ) {
      return this.build(
        503,
        "UNAVAILABLE",
        "A required service is temporarily unavailable",
      );
    }
    return this.build(500, "INTERNAL", "Something went wrong");
  }

  private build(
    status: number,
    code: ErrorCode,
    message: string,
    details?: unknown,
  ) {
    const error: ErrorBody["error"] = { code, message };
    if (details !== undefined) error.details = details;
    return { status, body: { error } };
  }

  private messageOf(e: HttpException): string {
    const r = e.getResponse();
    if (typeof r === "string") return r;
    const m = (r as { message?: string | string[] }).message;
    return Array.isArray(m) ? m.join(", ") : (m ?? e.message);
  }

  private zodDetails(err: unknown) {
    if (!(err instanceof ZodError)) return undefined;
    return {
      fields: err.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    };
  }
}
