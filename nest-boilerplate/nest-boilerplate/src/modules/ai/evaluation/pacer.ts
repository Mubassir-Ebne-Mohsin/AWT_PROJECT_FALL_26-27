import { DEFAULT_QUOTA } from "@/modules/ai/ai-quota";

/**
 * Keeps a live evaluation run inside the hosted account's limits. The service has its own Redis-backed guard; a one-off run
 * from the command line has no Redis, so this holds the same numbers in memory: at most the margin's share of the per-minute
 * request and token limits in any sliding minute, and of the per-day totals for the run. A request is held at an estimate
 * until its real token count is known, so the count errs high.
 */
export interface PacerLimits {
  requestsPerMinute: number;
  tokensPerMinute: number;
  requestsPerDay: number;
  tokensPerDay: number;
}

export const pacerLimits = (margin = DEFAULT_QUOTA.margin): PacerLimits => ({
  requestsPerMinute: Math.max(1, Math.floor(DEFAULT_QUOTA.requestsPerMinute * margin)),
  tokensPerMinute: Math.max(1, Math.floor(DEFAULT_QUOTA.tokensPerMinute * margin)),
  requestsPerDay: Math.max(1, Math.floor(DEFAULT_QUOTA.requestsPerDay * margin)),
  tokensPerDay: Math.max(1, Math.floor(DEFAULT_QUOTA.tokensPerDay * margin)),
});

const MINUTE = 60_000;

export class Pacer {
  private events: { at: number; tokens: number }[] = [];
  private dayRequests = 0;
  private dayTokens = 0;
  private estimate: number;

  constructor(
    private readonly limits: PacerLimits = pacerLimits(),
    initialEstimate = 2500,
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  ) {
    if (initialEstimate > limits.tokensPerMinute) throw new Error("A single request could exceed the per-minute token limit");
    this.estimate = initialEstimate;
  }

  /** Waits until one more request fits in every window, then counts it at the current estimate. */
  async acquire(): Promise<void> {
    if (this.dayRequests + 1 > this.limits.requestsPerDay || this.dayTokens + this.estimate > this.limits.tokensPerDay)
      throw new Error("The run's share of the daily budget is used up");
    for (;;) {
      const t = this.now();
      this.events = this.events.filter((e) => e.at > t - MINUTE);
      let wait = 0;
      if (this.events.length + 1 > this.limits.requestsPerMinute) wait = Math.max(wait, this.events[0].at + MINUTE - t);
      let spent = this.events.reduce((sum, e) => sum + e.tokens, 0);
      if (spent + this.estimate > this.limits.tokensPerMinute) {
        for (const e of this.events) {
          spent -= e.tokens;
          wait = Math.max(wait, e.at + MINUTE - t);
          if (spent + this.estimate <= this.limits.tokensPerMinute) break;
        }
      }
      if (wait <= 0) break;
      await this.sleep(wait + 50);
    }
    this.events.push({ at: this.now(), tokens: this.estimate });
    this.dayRequests++;
    this.dayTokens += this.estimate;
  }

  /** Replaces the latest request's estimate with the tokens the provider counted, and learns the largest request seen. */
  settle(actualTokens: number | undefined) {
    if (actualTokens === undefined) return;
    const last = this.events[this.events.length - 1];
    if (last) {
      this.dayTokens += actualTokens - last.tokens;
      last.tokens = actualTokens;
    }
    this.estimate = Math.min(this.limits.tokensPerMinute, Math.max(this.estimate, actualTokens));
  }

  get requestsToday() {
    return this.dayRequests;
  }
  get tokensToday() {
    return this.dayTokens;
  }
}
