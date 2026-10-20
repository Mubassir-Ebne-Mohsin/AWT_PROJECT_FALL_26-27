import { RedisCacheService } from "@/providers/cache/redis/redis-cache.service";

/** In-memory stand-in for the subset of the node-redis client the app uses. */
class FakeRedisClient {
  private store = new Map<string, { value: string; expiresAt: number }>();
  isOpen = true;

  private live(key: string) {
    const e = this.store.get(key);
    if (!e) return undefined;
    if (e.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return e;
  }

  async set(key: string, value: string, opts?: { EX?: number; NX?: boolean }) {
    this.assertOpen();
    if (opts?.NX && this.live(key)) return null;
    this.store.set(key, {
      value,
      expiresAt: Date.now() + (opts?.EX ?? 86400) * 1000,
    });
    return "OK";
  }

  async get(key: string) {
    this.assertOpen();
    return this.live(key)?.value ?? null;
  }

  async exists(key: string) {
    this.assertOpen();
    return this.live(key) ? 1 : 0;
  }

  async ping() {
    this.assertOpen();
    return "PONG";
  }

  private assertOpen() {
    if (!this.isOpen) throw new Error("fake redis is closed");
  }
}

export class FakeRedisCacheService {
  readonly client = new FakeRedisClient();
  getClient() {
    return this.client as unknown as ReturnType<RedisCacheService["getClient"]>;
  }
  onModuleInit() {}
  onModuleDestroy() {}
}
