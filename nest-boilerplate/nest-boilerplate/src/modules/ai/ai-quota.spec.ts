import { AppException } from "@/common/errors";
import { AiSettings } from "@/modules/ai/ai.settings";
import { AiQuota, DEFAULT_QUOTA, estimateTokens } from "@/modules/ai/ai-quota";

// The hosted free account must never be pushed past its published limits. The counters here are an in-memory stand-in for Redis,
// and time is passed in, so every window boundary is exact.
class FakeRedis {
  data = new Map<string, string>();
  failing = false;
  async get(key: string) {
    if (this.failing) throw new Error("redis down");
    return this.data.get(key) ?? null;
  }
  async set(key: string, value: string) {
    if (this.failing) throw new Error("redis down");
    this.data.set(key, value);
    return "OK";
  }
}
const settings = (quota: Partial<NonNullable<AiSettings["quota"]>> = {}): AiSettings => ({
  enabled: true,
  baseUrl: "",
  model: "openai/gpt-oss-20b",
  deadlineMs: 60000,
  minFreeMiB: 1536,
  minCommitMiB: 4096,
  quota: { ...DEFAULT_QUOTA, ...quota },
});
const make = (quota: Partial<NonNullable<AiSettings["quota"]>> = {}) => {
  const redis = new FakeRedis();
  const guard = new AiQuota({ getClient: () => redis } as never, settings(quota));
  return { redis, guard };
};
const at = (h: number, m: number, s: number, day = 1) => Date.UTC(2026, 10, day, h, m, s);
const refused = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as AppException;
  }
  throw new Error("expected the quota to refuse");
};
const details = (e: AppException) => e.details as { reason: string; limit: string; retryAfterSeconds: number };

describe("hosted quota guard", () => {
  it("uses the account's published limits at a safe share, and the estimate is the prompt plus the output cap", () => {
    expect(DEFAULT_QUOTA).toMatchObject({ requestsPerMinute: 30, requestsPerDay: 1000, tokensPerMinute: 8000, tokensPerDay: 200000, margin: 0.8 });
    expect(estimateTokens(900, 2048)).toBe(300 + 2048);
    expect(estimateTokens(1, 0)).toBe(1);
  });

  it("allows a request when nothing has been spent, and counts it", async () => {
    const { guard } = make();
    expect((await guard.waitSeconds("u", 2500, at(12, 0, 30))).seconds).toBe(0);
    const ticket = await guard.reserve("u", 2500, at(12, 0, 30));
    expect(ticket.estimatedTokens).toBe(2500);
    // The next request sees the spent estimate: 2500 + 2500 fits in 6400, a third does not.
    await guard.reserve("u", 2500, at(12, 0, 31));
    const third = await refused(guard.reserve("u", 2500, at(12, 0, 32)));
    expect(details(third)).toMatchObject({ reason: "AI_QUOTA", limit: "tokens per minute" });
    expect(third.code).toBe("RATE_LIMITED");
  });

  it("settles to the tokens the provider counted, which frees room that the estimate was holding", async () => {
    const { guard } = make();
    const a = await guard.reserve("u", 2500, at(12, 0, 5));
    const b = await guard.reserve("u", 2500, at(12, 0, 6));
    await guard.settle(a, 900);
    await guard.settle(b, 900);
    // 1800 spent, not 5000: another 2500 now fits.
    await expect(guard.reserve("u", 2500, at(12, 0, 7))).resolves.toBeDefined();
  });

  it("keeps the estimate when no real figure arrives, and never lets the count go below zero", async () => {
    const { guard } = make();
    const a = await guard.reserve("u", 2500, at(12, 0, 5));
    await guard.settle(a, undefined);
    await guard.reserve("u", 2500, at(12, 0, 6));
    expect(details(await refused(guard.reserve("u", 2500, at(12, 0, 7)))).limit).toBe("tokens per minute");
    const b = await guard.reserve("x", 10, at(12, 5, 0));
    await guard.settle(b, 0);
    await guard.settle(b, 0);
    expect((await guard.waitSeconds("x", 1, at(12, 5, 1))).seconds).toBe(0);
  });

  it("does not let a repeated settlement bank negative tokens that would hide later spending", async () => {
    const { guard } = make();
    const a = await guard.reserve("u", 2500, at(12, 0, 1));
    await guard.settle(a, 0);
    await guard.settle(a, 0);
    // The count is zero, not minus 2500: two more 2500 reservations fit in 6400, and the third must still be refused.
    await guard.reserve("u", 2500, at(12, 0, 2));
    await guard.reserve("u", 2500, at(12, 0, 3));
    expect(details(await refused(guard.reserve("u", 2500, at(12, 0, 4)))).limit).toBe("tokens per minute");
  });

  it("refuses the request over the per-minute request limit, says when the minute ends, and allows it again then", async () => {
    const { guard } = make({ requestsPerMinute: 10, margin: 0.5 });
    for (let i = 0; i < 5; i++) await guard.reserve("u", 10, at(12, 0, 10 + i));
    const e = await refused(guard.reserve("u", 10, at(12, 0, 20)));
    expect(details(e)).toMatchObject({ limit: "requests per minute", retryAfterSeconds: 40 });
    await expect(guard.reserve("u", 10, at(12, 1, 0))).resolves.toBeDefined();
  });

  it("counts a refused request as nothing: only what was reserved is spent", async () => {
    const { guard } = make({ requestsPerMinute: 2, margin: 1 });
    await guard.reserve("u", 10, at(12, 0, 1));
    await guard.reserve("u", 10, at(12, 0, 2));
    for (let i = 0; i < 4; i++) await refused(guard.reserve("u", 10, at(12, 0, 3 + i)));
    await expect(guard.reserve("u", 10, at(12, 1, 0))).resolves.toBeDefined();
    await expect(guard.reserve("u", 10, at(12, 1, 1))).resolves.toBeDefined();
    await refused(guard.reserve("u", 10, at(12, 1, 2)));
  });

  it("enforces the daily request and token limits until midnight UTC", async () => {
    const { guard } = make({ requestsPerDay: 3, tokensPerDay: 1000, requestsPerMinute: 1000, tokensPerMinute: 100000, margin: 1 });
    for (let i = 0; i < 3; i++) await guard.reserve("u", 100, at(10, i, 0));
    const e = await refused(guard.reserve("u", 100, at(23, 59, 0)));
    expect(details(e)).toMatchObject({ limit: "requests per day", retryAfterSeconds: 60 });
    await expect(guard.reserve("u", 100, at(0, 0, 0, 2))).resolves.toBeDefined();
    const tokens = make({ requestsPerDay: 1000, tokensPerDay: 1000, requestsPerMinute: 1000, tokensPerMinute: 100000, margin: 1 }).guard;
    await tokens.reserve("u", 900, at(9, 0, 0));
    expect(details(await refused(tokens.reserve("u", 200, at(9, 5, 0)))).limit).toBe("tokens per day");
  });

  it("applies the safety margin to every limit, and never rounds a limit down to zero", async () => {
    const { guard } = make({ requestsPerMinute: 10, margin: 0.5 });
    for (let i = 0; i < 5; i++) await guard.reserve("u", 1, at(12, 0, i));
    await refused(guard.reserve("u", 1, at(12, 0, 9)));
    const tiny = make({ requestsPerMinute: 1, margin: 0.1 }).guard;
    await expect(tiny.reserve("u", 1, at(12, 0, 0))).resolves.toBeDefined();
    await refused(tiny.reserve("u", 1, at(12, 0, 1)));
  });

  it("caps each person per day separately, and resets the cap at midnight UTC", async () => {
    const { guard } = make({ userPerDay: 2, margin: 1, requestsPerMinute: 1000, tokensPerMinute: 100000, requestsPerDay: 1000, tokensPerDay: 10000000 });
    await guard.reserve("alice", 10, at(8, 0, 0));
    await guard.reserve("alice", 10, at(8, 1, 0));
    const e = await refused(guard.reserve("alice", 10, at(8, 2, 0)));
    expect(details(e).limit).toBe("requests per person per day");
    await expect(guard.reserve("bob", 10, at(8, 3, 0))).resolves.toBeDefined();
    await expect(guard.reserve("alice", 10, at(8, 0, 0, 2))).resolves.toBeDefined();
  });

  it("refuses everything for as long as the provider asked us to wait, then allows it again", async () => {
    const { guard } = make();
    await guard.backoff(30, at(12, 0, 0));
    const e = await refused(guard.reserve("u", 10, at(12, 0, 10)));
    expect(details(e)).toMatchObject({ limit: "provider back-off", retryAfterSeconds: 20 });
    expect((await guard.waitSeconds(undefined, 10, at(12, 0, 29))).seconds).toBe(1);
    expect((await guard.waitSeconds(undefined, 10, at(12, 0, 30))).seconds).toBe(0);
  });

  it("keeps a back-off between one second and one day", async () => {
    const { guard } = make();
    await guard.backoff(0, at(12, 0, 0));
    expect((await guard.waitSeconds(undefined, 1, at(12, 0, 0))).seconds).toBe(1);
    await guard.backoff(10 ** 9, at(12, 0, 0));
    expect((await guard.waitSeconds(undefined, 1, at(12, 0, 0))).seconds).toBe(86400);
  });

  it("refuses, rather than guessing, when the counters cannot be read or written, or are corrupt", async () => {
    const { redis, guard } = make();
    redis.failing = true;
    for (const attempt of [guard.reserve("u", 10, at(12, 0, 0)), guard.waitSeconds("u", 10, at(12, 0, 0)), guard.backoff(5, at(12, 0, 0))]) {
      const e = await refused(attempt);
      expect(e.code).toBe("UNAVAILABLE");
      expect(details(e)).toMatchObject({ reason: "AI_QUOTA_UNAVAILABLE" });
    }
    redis.failing = false;
    redis.data.set("ai:quota:min:" + Math.floor(at(12, 0, 0) / 60000), "not json");
    expect(details(await refused(guard.reserve("u", 10, at(12, 0, 5)))).reason).toBe("AI_QUOTA_UNAVAILABLE");
  });

  it("lets requests that arrive at the same moment take turns, so the limit holds however many ask at once", async () => {
    // The counters live outside the process and every read and write takes a moment; without turns, all ten would read zero.
    const slow = new FakeRedis();
    const get = slow.get.bind(slow);
    const set = slow.set.bind(slow);
    slow.get = async (key: string) => (await new Promise((r) => setTimeout(r, 2)), get(key));
    slow.set = async (key: string, value: string) => (await new Promise((r) => setTimeout(r, 2)), set(key, value));
    const guard = new AiQuota({ getClient: () => slow } as never, settings({ requestsPerMinute: 10, margin: 0.3, tokensPerMinute: 100000 }));
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => guard.reserve("u", 10, at(12, 0, 5))));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect(JSON.parse(slow.data.get("ai:quota:min:" + Math.floor(at(12, 0, 5) / 60000))!)).toMatchObject({ requests: 3 });
  });

  it("keeps taking turns after one request fails", async () => {
    const { redis, guard } = make();
    redis.failing = true;
    await refused(guard.reserve("u", 10, at(12, 0, 0)));
    redis.failing = false;
    await expect(guard.reserve("u", 10, at(12, 0, 1))).resolves.toBeDefined();
  });

  it("without an owner it checks only the shared limits (as readiness does)", async () => {
    const { guard } = make({ userPerDay: 1, margin: 1 });
    await guard.reserve("u", 10, at(12, 0, 0));
    expect((await guard.waitSeconds(undefined, 10, at(12, 0, 1))).seconds).toBe(0);
    expect((await guard.waitSeconds("u", 10, at(12, 0, 1))).seconds).toBeGreaterThan(0);
  });
});
