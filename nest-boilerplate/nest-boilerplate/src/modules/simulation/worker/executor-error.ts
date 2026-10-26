export type ExecutionCode =
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "WORKER_CRASH"
  | "COMPUTE_FAILED"
  | "COMPLEXITY_LIMIT"
  | "CANCELLED"
  | "UNAVAILABLE";
const messages: Record<ExecutionCode, string> = {
  RATE_LIMITED: "Calculation capacity is busy. Please retry.",
  TIMEOUT: "Calculation exceeded its execution deadline.",
  WORKER_CRASH: "Calculation was interrupted by a worker failure.",
  COMPUTE_FAILED: "Calculation could not produce a valid result.",
  COMPLEXITY_LIMIT:
    "Design exceeds the supported calculation budget. Simplify its branching.",
  CANCELLED: "Preview or provisional calculation was cancelled.",
  UNAVAILABLE: "Calculation service is shutting down.",
};
/** Optional refinement of RATE_LIMITED: the owner's own durable job is pending (preview is paused, not under pressure). */
export type ExecutionReason = "DURABLE_PENDING";
export class ExecutionError extends Error {
  constructor(
    readonly code: ExecutionCode,
    readonly reason?: ExecutionReason,
  ) {
    super(messages[code]);
    this.name = "ExecutionError";
  }
}
