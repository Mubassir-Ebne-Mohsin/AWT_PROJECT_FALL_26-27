import { Injectable } from "@nestjs/common";
import { RedisCacheService } from "@/providers/cache/redis/redis-cache.service";

const PREFIX = "sf:revoked";

/** Revocation list for JWT ids, kept in Redis with a TTL equal to the token's remaining life. */
@Injectable()
export class TokenStore {
  constructor(private readonly redis: RedisCacheService) {}

  private get client() {
    return this.redis.getClient();
  }

  private async mark(key: string, ttlSeconds: number) {
    // Redis rejects EX 0; a token that expires this second needs no entry.
    if (ttlSeconds < 1) return;
    await this.client.set(`${PREFIX}:${key}`, "1", { EX: Math.ceil(ttlSeconds) });
  }

  private async has(key: string) {
    return (await this.client.exists(`${PREFIX}:${key}`)) === 1;
  }

  revokeAccess(jti: string, ttlSeconds: number) {
    return this.mark(`at:${jti}`, ttlSeconds);
  }

  isAccessRevoked(jti: string) {
    return this.has(`at:${jti}`);
  }

  /**
   * Atomically marks a refresh token as spent. Returns false when it was
   * already spent, which means the same token is being replayed.
   */
  async consumeRefresh(jti: string, ttlSeconds: number): Promise<boolean> {
    if (ttlSeconds < 1) return false;
    const res = await this.client.set(`${PREFIX}:rt:${jti}`, "1", {
      EX: Math.ceil(ttlSeconds),
      NX: true,
    });
    return res === "OK";
  }

  revokeFamily(fam: string, ttlSeconds: number) {
    return this.mark(`fam:${fam}`, ttlSeconds);
  }

  isFamilyRevoked(fam: string) {
    return this.has(`fam:${fam}`);
  }
}
