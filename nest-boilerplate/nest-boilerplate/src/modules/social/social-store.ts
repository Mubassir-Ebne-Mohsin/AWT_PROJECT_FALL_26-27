import { createHash, randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { RedisCacheService } from "@/providers/cache/redis/redis-cache.service";
import { AppException } from "@/common/errors";
export const secret = () => randomBytes(32).toString("base64url");
export const digest = (s: string) =>
  createHash("sha256").update(s).digest("hex");
@Injectable()
export class SocialStore {
  constructor(private readonly redis: RedisCacheService) {}
  async put<T>(kind: string, value: T, ttl = 600) {
    const token = secret();
    try {
      await this.redis
        .getClient()
        .set(`sf:oauth:${kind}:${digest(token)}`, JSON.stringify(value), {
          EX: ttl,
        });
      return token;
    } catch {
      throw new AppException(
        "UNAVAILABLE",
        "Sign-in is temporarily unavailable",
      );
    }
  }
  async read<T>(kind: string, token: unknown, consume = false): Promise<T> {
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token))
      throw new AppException(
        "UNAUTHENTICATED",
        "This sign-in request expired. Please start again",
      );
    try {
      const c = this.redis.getClient(),
        key = `sf:oauth:${kind}:${digest(token)}`,
        raw = await c.get(key);
      if (!raw)
        throw new AppException(
          "UNAUTHENTICATED",
          "This sign-in request expired. Please start again",
        );
      if (consume) {
        const claimed = await c.set(key + ":used", "1", { EX: 600, NX: true });
        if (claimed !== "OK")
          throw new AppException(
            "UNAUTHENTICATED",
            "This sign-in request was already used",
          );
        await c.del(key);
      }
      return JSON.parse(raw) as T;
    } catch (e) {
      if (e instanceof AppException) throw e;
      throw new AppException(
        "UNAVAILABLE",
        "Sign-in is temporarily unavailable",
      );
    }
  }
}
