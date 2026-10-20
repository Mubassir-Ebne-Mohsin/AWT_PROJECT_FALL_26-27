import type { components } from "@/lib/api/schema";

/** Server codes (from the OpenAPI document) plus NETWORK for "no HTTP response at all". */
export type ApiErrorCode =
  | components["schemas"]["ErrorResponseDto"]["error"]["code"]
  | "NETWORK";

export interface FieldIssue {
  path: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** Per-field messages from a VALIDATION_FAILED response, keyed by field path. */
  get fieldErrors(): Record<string, string> {
    const fields = (this.details as { fields?: FieldIssue[] } | undefined)?.fields;
    const out: Record<string, string> = {};
    for (const f of fields ?? []) out[f.path] ??= f.message;
    return out;
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;
