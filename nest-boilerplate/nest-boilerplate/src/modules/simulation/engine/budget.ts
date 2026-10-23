export const ENGINE_BOUNDS = Object.freeze({
  pairAttempts: 2_000_000,
  walkCalls: 200_000,
  liveComponents: 4096,
  responseBytes: 512 * 1024,
  maximumRps: 1e7,
  searchIterations: 24,
});
export class EngineFault extends Error {
  constructor(
    readonly code: "COMPLEXITY_LIMIT" | "COMPUTE_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "EngineFault";
  }
}
/** Per calculation, shared by all timeline/search samples. Never silently truncate. */
export class WorkBudget {
  pairAttempts = 0;
  walkCalls = 0;
  pair() {
    if (++this.pairAttempts > ENGINE_BOUNDS.pairAttempts) this.exceeded();
  }
  walk() {
    if (++this.walkCalls > ENGINE_BOUNDS.walkCalls) this.exceeded();
  }
  list(size: number) {
    if (size > ENGINE_BOUNDS.liveComponents) this.exceeded();
  }
  private exceeded(): never {
    throw new EngineFault(
      "COMPLEXITY_LIMIT",
      "This design exceeds the supported path-expansion budget. Simplify its branching.",
    );
  }
}
