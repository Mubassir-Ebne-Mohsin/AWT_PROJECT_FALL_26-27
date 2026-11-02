import { createHash } from "node:crypto";
import { z } from "zod";
import { AppException } from "@/common/errors";
import { AiQuota, DEFAULT_QUOTA } from "@/modules/ai/ai-quota";
import { AiTaskService } from "@/modules/ai/ai-task.service";
import type { AiSettings } from "@/modules/ai/ai.settings";
import { AiTaskCall } from "@/modules/ai/entities/ai-task-call.entity";
import type { ProviderObservation, StructuredTask } from "@/modules/ai/provider";

// The task service, with in-memory stand-ins for Redis, the database and the hosted model: no network, no database.
class FakeRedis {
  data = new Map<string, string>();
  async get(key: string) {
    await Promise.resolve();
    return this.data.get(key) ?? null;
  }
  async set(key: string, value: string) {
    await Promise.resolve();
    this.data.set(key, value);
    return "OK";
  }
}
const request: StructuredTask = { name: "demo", messages: [{ role: "system", content: "Return JSON." }, { role: "user", content: "TEXT=a private idea" }], schema: {} };
const parse = (v: unknown) => z.strictObject({ n: z.number() }).parse(v);
const TEXT = "a private idea about a school portal";

type Behaviour = (task: StructuredTask, parse: (v: unknown) => unknown, signal: AbortSignal, observe?: (o: ProviderObservation) => void) => Promise<unknown>;
const ok: Behaviour = async (_t, p, _s, observe) => {
  observe?.({ returnedModel: "openai/gpt-oss-20b", usage: { promptTokens: 60, completionTokens: 20, totalTokens: 80 }, latencyMs: 321 });
  return p({ n: 1 });
};
function setup(over: Partial<AiSettings> = {}, behaviour: Behaviour = ok, providerKind: "structured" | "local" = "structured") {
  const redis = new FakeRedis();
  const rows: AiTaskCall[] = [];
  const inserts = { fail: false };
  const db = {
    getRepository: (entity: unknown) => {
      expect(entity).toBe(AiTaskCall);
      return {
        insert: async (row: AiTaskCall) => {
          if (inserts.fail) throw new Error("database down");
          rows.push(row);
        },
      };
    },
  };
  const calls = { structured: 0 };
  const settings: AiSettings = { enabled: true, provider: "groq", features: ["describe", "whatif", "fixes"], baseUrl: "", model: "openai/gpt-oss-20b", deadlineMs: 60000, minFreeMiB: 1536, minCommitMiB: 4096, quota: { ...DEFAULT_QUOTA }, ...over };
  const provider =
    providerKind === "structured"
      ? { model: "openai/gpt-oss-20b", identity: async () => ({ name: "openai/gpt-oss-20b", digest: "d" }), structured: async (...args: Parameters<Behaviour>) => (calls.structured++, behaviour(...args)) }
      : { model: "qwen2.5:1.5b", identity: async () => ({ name: "qwen2.5:1.5b", digest: "d" }) };
  const quota = new AiQuota({ getClient: () => redis } as never, settings);
  const service = new AiTaskService(db as never, provider as never, quota, settings);
  const go = (owner = "u1", task: "describe" | "whatif" | "fixes" = "describe", signal = new AbortController().signal) => service.run({ task, owner, userText: TEXT, request, parse, signal });
  return { service, quota, redis, rows, calls, go, inserts, settings };
}
const refused = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as AppException;
  }
  throw new Error("expected a refusal");
};
const reason = (e: AppException) => (e.details as { reason?: string })?.reason;

describe("AI task service", () => {
  describe("switches", () => {
    it("is off unless AI is enabled and the task is listed, and then spends nothing and records nothing", async () => {
      for (const over of [{ enabled: false }, { features: [] }, { features: ["whatif"] as AiSettings["features"] }, { features: undefined }]) {
        const t = setup(over as Partial<AiSettings>);
        expect(reason(await refused(t.go("u1", "describe")))).toBe("AI_DISABLED");
        expect(t.calls.structured).toBe(0);
        expect(t.redis.data.size).toBe(0);
        expect(t.rows).toHaveLength(0);
      }
    });
    it("needs a hosted model: the local provider cannot run design tasks, and the service never falls back to it", async () => {
      const t = setup({}, ok, "local");
      expect(reason(await refused(t.go()))).toBe("PROVIDER_NOT_CONFIGURED");
      expect(t.redis.data.size).toBe(0);
      expect(t.rows).toHaveLength(0);
    });
    it("switches each task separately", async () => {
      const t = setup({ features: ["whatif"] });
      await expect(t.go("u1", "whatif")).resolves.toEqual({ n: 1 });
      expect(reason(await refused(t.go("u1", "fixes")))).toBe("AI_DISABLED");
    });
  });

  describe("a successful call", () => {
    it("returns the validated answer and records one row with provenance, the length and the hash of the text, and not the text", async () => {
      const t = setup();
      await expect(t.go("owner-1")).resolves.toEqual({ n: 1 });
      expect(t.rows).toHaveLength(1);
      expect(t.rows[0]).toMatchObject({
        ownerId: "owner-1",
        task: "describe",
        provider: "groq",
        model: "openai/gpt-oss-20b",
        returnedModel: "openai/gpt-oss-20b",
        outcome: "completed",
        promptTokens: 60,
        completionTokens: 20,
        totalTokens: 80,
        latencyMs: 321,
        inputLength: TEXT.length,
        inputHash: createHash("sha256").update(TEXT).digest("hex"),
      });
      expect(JSON.stringify(t.rows[0])).not.toContain("school portal");
    });
    it("settles the quota to the tokens really used", async () => {
      const t = setup({ quota: { ...DEFAULT_QUOTA, tokensPerMinute: 4000, margin: 1 } });
      // The reservation alone (about 1,050 tokens) would allow three; after settling to 80 many more fit.
      for (let i = 0; i < 12; i++) await t.go();
      expect(t.calls.structured).toBe(12);
    });
  });

  describe("quota", () => {
    it("holds the estimate until the real usage is known, and refuses with the wait when the budget is spent", async () => {
      const noUsage: Behaviour = async (_t, p) => p({ n: 1 });
      const t = setup({ quota: { ...DEFAULT_QUOTA, tokensPerMinute: 3000, margin: 1 } }, noUsage);
      await t.go();
      await t.go();
      const e = await refused(t.go());
      expect(e.code).toBe("RATE_LIMITED");
      expect(reason(e)).toBe("AI_QUOTA");
      expect(t.calls.structured).toBe(2);
    });
    it("caps each person per day", async () => {
      const t = setup({ quota: { ...DEFAULT_QUOTA, userPerDay: 2 } });
      await t.go("a");
      await t.go("a");
      expect((await refused(t.go("a"))).details).toMatchObject({ limit: "requests per person per day" });
      await expect(t.go("b")).resolves.toBeDefined();
    });
    it("lets only as many concurrent calls through as the quota allows", async () => {
      const noUsage: Behaviour = async (_t, p) => p({ n: 1 });
      const t = setup({ quota: { ...DEFAULT_QUOTA, requestsPerMinute: 10, tokensPerMinute: 100000, margin: 0.3 } }, noUsage);
      const results = await Promise.allSettled(Array.from({ length: 8 }, () => t.go("u1")));
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
      expect(t.calls.structured).toBe(3);
    });
    it("fails closed when the counters cannot be read", async () => {
      const t = setup();
      t.redis.get = async () => {
        throw new Error("redis down");
      };
      expect(reason(await refused(t.go()))).toBe("AI_QUOTA_UNAVAILABLE");
      expect(t.calls.structured).toBe(0);
    });
  });

  describe("failures", () => {
    it("records an answer the validation rejected, keeps its tokens, and passes the error on", async () => {
      const bad: Behaviour = async (_t, _p, _s, observe) => {
        observe?.({ usage: { promptTokens: 50, completionTokens: 10, totalTokens: 60 }, returnedModel: "openai/gpt-oss-20b" });
        throw new AppException("VALIDATION_FAILED", "Hosted AI returned an unusable answer", { reason: "INVALID_OUTPUT" });
      };
      const t = setup({}, bad);
      expect(reason(await refused(t.go()))).toBe("INVALID_OUTPUT");
      expect(t.rows[0]).toMatchObject({ outcome: "INVALID_OUTPUT", totalTokens: 60 });
    });
    it("starts a back-off when the provider says wait, using the time it gave, and refuses everything until then", async () => {
      const limited: Behaviour = async (_t, _p, _s, observe) => {
        observe?.({ retryAfterSeconds: 90 });
        throw new AppException("RATE_LIMITED", "quota", { reason: "PROVIDER_RATE_LIMITED", retryAfterSeconds: 90 });
      };
      const t = setup({}, limited);
      expect(reason(await refused(t.go()))).toBe("PROVIDER_RATE_LIMITED");
      expect(t.rows[0].outcome).toBe("PROVIDER_RATE_LIMITED");
      const again = await refused(t.go());
      expect(again.details).toMatchObject({ reason: "AI_QUOTA", limit: "provider back-off" });
      expect(t.calls.structured).toBe(1);
      const readiness = await t.service.readiness("describe");
      expect(readiness).toMatchObject({ available: false, reason: "QUOTA_EXHAUSTED" });
      expect(readiness.retryAfterSeconds).toBeGreaterThan(80);
    });
    it("records a cancelled call as cancelled", async () => {
      const controller = new AbortController();
      const slow: Behaviour = async () => {
        controller.abort();
        throw Object.assign(new Error("aborted"), { name: "AbortError" });
      };
      const t = setup({}, slow);
      await refused(t.go("u1", "describe", controller.signal));
      expect(t.rows[0].outcome).toBe("CANCELLED");
    });
    it("records an unknown failure as FAILED", async () => {
      const t = setup({}, async () => {
        throw new Error("boom");
      });
      await refused(t.go());
      expect(t.rows[0].outcome).toBe("FAILED");
    });
    it("does not lose the answer when the provenance row cannot be written", async () => {
      const t = setup();
      t.inserts.fail = true;
      await expect(t.go()).resolves.toEqual({ n: 1 });
    });
  });

  describe("readiness", () => {
    it("says why a task is not available, and spends nothing", async () => {
      expect(await setup({ enabled: false }).service.readiness("describe")).toMatchObject({ enabled: false, available: false, reason: "DISABLED" });
      expect(await setup({}, ok, "local").service.readiness("describe")).toMatchObject({ available: false, reason: "PROVIDER_NOT_CONFIGURED" });
      const t = setup();
      expect(await t.service.readiness("describe", "u1")).toMatchObject({ enabled: true, available: true, reason: "AVAILABLE", provider: "groq", model: "openai/gpt-oss-20b" });
      expect(t.redis.data.size).toBe(0);
    });
    it("reports a missing key as not configured", async () => {
      const t = setup();
      (t.service as unknown as { provider: { identity: () => Promise<never> } }).provider.identity = async () => {
        throw new AppException("UNAVAILABLE", "x", { reason: "PROVIDER_NOT_CONFIGURED" });
      };
      expect(await t.service.readiness("describe")).toMatchObject({ available: false, reason: "PROVIDER_NOT_CONFIGURED" });
    });
  });
});
