import { SocialStore } from "@/modules/social/social-store";
import { RedisCacheService } from "@/providers/cache/redis/redis-cache.service";
describe("Single-use OAuth storage", () => {
  function setup() {
    const values = new Map<string, { value: string; until: number }>();
    const client = {
      get: jest.fn(async (k: string) => {
        const v = values.get(k);
        return v && v.until > Date.now() ? v.value : null;
      }),
      set: jest.fn(
        async (k: string, v: string, o: { EX: number; NX?: boolean }) => {
          if (o.NX && values.get(k) && values.get(k)!.until > Date.now())
            return null;
          values.set(k, { value: v, until: Date.now() + o.EX * 1000 });
          return "OK";
        },
      ),
      del: jest.fn(async (k: string) => values.delete(k)),
    };
    return {
      client,
      store: new SocialStore({
        getClient: () => client,
      } as unknown as RedisCacheService),
    };
  }
  it("only one racing consumer receives a state/proof", async () => {
    const { store } = setup(),
      token = await store.put("proof", { owner: "one" });
    const results = await Promise.allSettled([
      store.read("proof", token, true),
      store.read("proof", token, true),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await expect(store.read("proof", token, true)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });
  it("expires state and never accepts malformed credentials", async () => {
    jest.useFakeTimers();
    try {
      const { store } = setup(),
        token = await store.put("state", { purpose: "login" }, 1);
      jest.advanceTimersByTime(1001);
      await expect(store.read("state", token)).rejects.toMatchObject({
        code: "UNAUTHENTICATED",
      });
      for (const bad of [undefined, [], "bad", '"'.repeat(43)])
        await expect(store.read("state", bad)).rejects.toMatchObject({
          code: "UNAUTHENTICATED",
        });
    } finally {
      jest.useRealTimers();
    }
  });
  it("fails closed when Redis is unavailable", async () => {
    const { store, client } = setup();
    client.set.mockRejectedValueOnce(new Error("down"));
    await expect(store.put("state", {})).rejects.toMatchObject({
      code: "UNAVAILABLE",
    });
    client.get.mockRejectedValueOnce(new Error("down"));
    await expect(store.read("state", "a".repeat(43))).rejects.toMatchObject({
      code: "UNAVAILABLE",
    });
  });
});
