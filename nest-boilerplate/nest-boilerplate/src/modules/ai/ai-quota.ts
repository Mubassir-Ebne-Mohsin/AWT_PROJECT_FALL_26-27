import { Inject, Injectable } from "@nestjs/common";
import { AppException } from "@/common/errors";
import { RedisCacheService } from "@/providers/cache/redis/redis-cache.service";
import { AI_SETTINGS, AiSettings, QuotaSettings } from "@/modules/ai/ai.settings";

/**
 * Keeps a hosted free account inside its published limits. The hosted provider is only called while this guard says there is room:
 * per minute and per day, in requests and in tokens, at a share (the margin) of the account's limits, plus a per-person daily cap
 * and a back-off when the provider itself says "wait". Counters live in Redis so a restart does not forget what was spent.
 *
 * It uses only get and set. That is safe because exactly one AI instance runs (it holds a database lease) and it runs one
 * generation at a time, so there are no concurrent writers. If the counters cannot be read the guard refuses rather than guessing:
 * a hosted request whose cost cannot be counted is not made.
 */

/** The published free limits of the account for the model, used when the settings do not say. */
export const DEFAULT_QUOTA: QuotaSettings = { requestsPerMinute: 30, requestsPerDay: 1000, tokensPerMinute: 8000, tokensPerDay: 200000, margin: 0.8, userPerDay: 50 };

/** Tokens one hosted request may be counted as before its real usage is known: the prompt (about 3 bytes a token) plus the output cap. */
export const estimateTokens = (promptBytes: number, maxCompletionTokens: number) => Math.ceil(promptBytes / 3) + maxCompletionTokens;

type Counter = { requests: number; tokens: number };
/** What one reservation counted, and where, so its real usage can be settled against the same windows. */
export interface QuotaTicket {
  minuteKey: string;
  dayKey: string;
  estimatedTokens: number;
}

const MINUTE = 60;
const DAY = 86400;
const unavailable = () => new AppException("UNAVAILABLE", "Hosted AI quota could not be checked", { reason: "AI_QUOTA_UNAVAILABLE" });
const limited = (retryAfterSeconds: number, limit: string) => new AppException("RATE_LIMITED", "The hosted AI quota does not allow another request yet", { reason: "AI_QUOTA", limit, retryAfterSeconds });

@Injectable()
export class AiQuota {
  constructor(
    private readonly redis: RedisCacheService,
    @Inject(AI_SETTINGS) private readonly settings: AiSettings,
  ) {}

  /** The limits this application may actually use: the account's limits times the margin, never less than one. */
  private effective() {
    const q = { ...DEFAULT_QUOTA, ...this.settings.quota };
    const use = (limit: number) => Math.max(1, Math.floor(limit * q.margin));
    return { rpm: use(q.requestsPerMinute), rpd: use(q.requestsPerDay), tpm: use(q.tokensPerMinute), tpd: use(q.tokensPerDay), user: q.userPerDay };
  }

  private keys(owner: string | undefined, now: number) {
    const day = new Date(now).toISOString().slice(0, 10);
    return {
      minuteKey: `ai:quota:min:${Math.floor(now / 1000 / MINUTE)}`,
      dayKey: `ai:quota:day:${day}`,
      userKey: owner ? `ai:quota:user:${owner}:${day}` : null,
      backoffKey: "ai:quota:backoff",
      untilMinute: MINUTE - (Math.floor(now / 1000) % MINUTE),
      untilDay: DAY - (Math.floor(now / 1000) % DAY),
    };
  }

  private async read(key: string): Promise<Counter> {
    try {
      const raw = await this.redis.getClient().get(key);
      if (!raw) return { requests: 0, tokens: 0 };
      const parsed = JSON.parse(raw) as Partial<Counter>;
      return { requests: Number(parsed.requests) || 0, tokens: Number(parsed.tokens) || 0 };
    } catch {
      throw unavailable();
    }
  }

  private async write(key: string, value: Counter, ttl: number) {
    try {
      await this.redis.getClient().set(key, JSON.stringify(value), { EX: ttl });
    } catch {
      throw unavailable();
    }
  }

  /** Seconds a request of this size must wait, or 0 when it may go ahead now. Never throws for a full quota; throws only when counters cannot be read. */
  async waitSeconds(owner: string | undefined, estimatedTokens: number, now = Date.now()): Promise<{ seconds: number; limit?: string }> {
    const limits = this.effective();
    const k = this.keys(owner, now);
    let backoff: string | null;
    try {
      backoff = await this.redis.getClient().get(k.backoffKey);
    } catch {
      throw unavailable();
    }
    if (backoff) {
      const until = Number(backoff);
      if (Number.isFinite(until) && until > now) return { seconds: Math.ceil((until - now) / 1000), limit: "provider back-off" };
    }
    const minute = await this.read(k.minuteKey);
    if (minute.requests + 1 > limits.rpm) return { seconds: k.untilMinute, limit: "requests per minute" };
    if (minute.tokens + estimatedTokens > limits.tpm) return { seconds: k.untilMinute, limit: "tokens per minute" };
    const day = await this.read(k.dayKey);
    if (day.requests + 1 > limits.rpd) return { seconds: k.untilDay, limit: "requests per day" };
    if (day.tokens + estimatedTokens > limits.tpd) return { seconds: k.untilDay, limit: "tokens per day" };
    if (k.userKey && (await this.read(k.userKey)).requests + 1 > limits.user) return { seconds: k.untilDay, limit: "requests per person per day" };
    return { seconds: 0 };
  }

  /** Counts one request and its estimated tokens, or refuses with how long to wait. */
  async reserve(owner: string, estimatedTokens: number, now = Date.now()): Promise<QuotaTicket> {
    const wait = await this.waitSeconds(owner, estimatedTokens, now);
    if (wait.seconds > 0) throw limited(wait.seconds, wait.limit ?? "quota");
    const k = this.keys(owner, now);
    const add = async (key: string, ttl: number, tokens: number) => {
      const current = await this.read(key);
      await this.write(key, { requests: current.requests + 1, tokens: current.tokens + tokens }, ttl);
    };
    await add(k.minuteKey, MINUTE * 2, estimatedTokens);
    await add(k.dayKey, DAY * 2, estimatedTokens);
    if (k.userKey) await add(k.userKey, DAY * 2, 0);
    return { minuteKey: k.minuteKey, dayKey: k.dayKey, estimatedTokens };
  }

  /** Replaces the estimate with the tokens the provider actually counted. Without a real figure the estimate stands (it errs high). */
  async settle(ticket: QuotaTicket, actualTokens: number | undefined) {
    if (actualTokens === undefined) return;
    const delta = actualTokens - ticket.estimatedTokens;
    for (const [key, ttl] of [[ticket.minuteKey, MINUTE * 2], [ticket.dayKey, DAY * 2]] as const) {
      const current = await this.read(key);
      await this.write(key, { requests: current.requests, tokens: Math.max(0, current.tokens + delta) }, ttl);
    }
  }

  /** The provider asked us to wait: refuse every hosted request until then. */
  async backoff(seconds: number, now = Date.now()) {
    const safe = Math.min(Math.max(1, Math.ceil(seconds)), DAY);
    try {
      await this.redis.getClient().set("ai:quota:backoff", String(now + safe * 1000), { EX: safe });
    } catch {
      throw unavailable();
    }
  }
}
