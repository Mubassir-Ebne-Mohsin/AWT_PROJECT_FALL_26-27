import { ruleBasedExplanation } from "@/modules/ai/evaluation/baseline";
import { EVALUATION_CASES } from "@/modules/ai/evaluation/cases";
import { runFolderName, runPaced } from "@/modules/ai/evaluation/live";
import { Pacer, pacerLimits, type PacerLimits } from "@/modules/ai/evaluation/pacer";
import type { GateProvider } from "@/modules/ai/evaluation/harness";

// A clock the test owns: sleeping advances it, so every wait is exact and nothing really waits.
const clock = () => {
  let t = 1_000_000;
  const slept: number[] = [];
  return { now: () => t, sleep: async (ms: number) => void (slept.push(ms), (t += ms)), advance: (ms: number) => (t += ms), slept };
};
const limits = (over: Partial<PacerLimits> = {}): PacerLimits => ({ requestsPerMinute: 24, tokensPerMinute: 6400, requestsPerDay: 800, tokensPerDay: 160000, ...over });

describe("pacer", () => {
  it("uses 80% of the published limits", () => {
    expect(pacerLimits()).toEqual({ requestsPerMinute: 24, tokensPerMinute: 6400, requestsPerDay: 800, tokensPerDay: 160000 });
  });

  it("lets requests through while there is room and does not wait", async () => {
    const c = clock();
    const pacer = new Pacer(limits(), 2000, c.now, c.sleep);
    await pacer.acquire();
    await pacer.acquire();
    await pacer.acquire();
    expect(c.slept).toEqual([]);
    expect(pacer.requestsToday).toBe(3);
  });

  it("waits for the minute to pass when the next request would exceed the token limit", async () => {
    const c = clock();
    const pacer = new Pacer(limits(), 2500, c.now, c.sleep);
    await pacer.acquire();
    await pacer.acquire();
    c.advance(10_000);
    await pacer.acquire(); // 7,500 > 6,400: must wait for the first to leave the minute
    expect(c.slept).toHaveLength(1);
    expect(c.slept[0]).toBeGreaterThanOrEqual(50_000 - 10_000);
    expect(c.slept[0]).toBeLessThan(61_000);
  });

  it("waits for the minute to pass when the request count would exceed the per-minute limit", async () => {
    const c = clock();
    const pacer = new Pacer(limits({ requestsPerMinute: 2 }), 10, c.now, c.sleep);
    await pacer.acquire();
    await pacer.acquire();
    await pacer.acquire();
    expect(c.slept).toHaveLength(1);
    expect(c.slept[0]).toBeGreaterThanOrEqual(59_000);
  });

  it("frees room when the real usage is lower than the estimate", async () => {
    const c = clock();
    const pacer = new Pacer(limits(), 3000, c.now, c.sleep);
    await pacer.acquire();
    pacer.settle(500);
    await pacer.acquire();
    expect(c.slept).toEqual([]);
    expect(pacer.tokensToday).toBe(500 + 3000);
  });

  it("learns the largest request seen and so holds back more when a request turns out to be big", async () => {
    const c = clock();
    const pacer = new Pacer(limits(), 1000, c.now, c.sleep);
    await pacer.acquire();
    pacer.settle(4000);
    await pacer.acquire(); // estimate is now 4000: 4000 + 4000 > 6400
    expect(c.slept).toHaveLength(1);
  });

  it("keeps the estimate when no real figure arrives", async () => {
    const c = clock();
    const pacer = new Pacer(limits(), 3000, c.now, c.sleep);
    await pacer.acquire();
    pacer.settle(undefined);
    expect(pacer.tokensToday).toBe(3000);
  });

  it("refuses, rather than waits, when the run's share of the day is used up", async () => {
    const c = clock();
    const requests = new Pacer(limits({ requestsPerDay: 2 }), 10, c.now, c.sleep);
    await requests.acquire();
    await requests.acquire();
    await expect(requests.acquire()).rejects.toThrow(/daily budget/);
    const tokens = new Pacer(limits({ tokensPerDay: 5000 }), 2500, c.now, c.sleep);
    await tokens.acquire();
    await tokens.acquire();
    await expect(tokens.acquire()).rejects.toThrow(/daily budget/);
  });

  it("will not start if one request alone could exceed the per-minute token limit", () => {
    expect(() => new Pacer(limits({ tokensPerMinute: 1000 }), 2500)).toThrow(/per-minute/);
  });
});

describe("a paced run", () => {
  const right: GateProvider = {
    generate: async (facts, _a, _d, _s, observe) => {
      observe?.({ usage: { promptTokens: 300, completionTokens: 100, totalTokens: 400 }, returnedModel: "m" });
      return ruleBasedExplanation(facts as never);
    },
  };

  it("asks the pacer before every request and settles each one to its real usage", async () => {
    const c = clock();
    const pacer = new Pacer(limits(), 2500, c.now, c.sleep);
    const run = await runPaced(right, { provider: "fake", model: "m", digest: "d", pacer });
    expect(run.records.filter((r) => r.outcome === "accepted")).toHaveLength(18);
    expect(pacer.requestsToday).toBe(18);
    // Real usage was 400 each, not the 2,500 estimate.
    expect(pacer.tokensToday).toBe(18 * 400);
    expect(run.stoppedBy).toBeUndefined();
  });

  it("names a run folder from the time and the model only", () => {
    const folder = runFolderName({ provider: "groq", model: "openai/gpt-oss-20b", startedAt: "2026-11-01T10:20:30.123Z", records: [] });
    expect(folder).toBe("2026-11-01T10-20-30-123Z_openai_gpt-oss-20b");
    expect(EVALUATION_CASES).toHaveLength(8);
  });
});
