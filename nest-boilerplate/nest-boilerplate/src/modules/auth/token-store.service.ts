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

  /**
   * R2: a suspended account's still-valid access tokens are refused for as long as any of them could live. The database
   * (`account_status`) stays the source of truth for login and refresh; this marker only covers the access-token window.
   */
  blockUser(userId: string, ttlSeconds: number) {
    return this.mark(`user:${userId}`, ttlSeconds);
  }

  async unblockUser(userId: string) {
    await this.client.del(`${PREFIX}:user:${userId}`);
  }

  isUserBlocked(userId: string) {
    return this.has(`user:${userId}`);
  }

  /**
   * P4: after a password change every session issued at or before endedAtSeconds is over. The database
   * (sessions_revoked_at) decides for refresh tokens; this marker covers access tokens that are still within their
   * short lifetime on other devices.
   */
  async endSessions(userId: string, endedAtSeconds: number, ttlSeconds: number) {
    if (ttlSeconds < 1) return;
    await this.client.set(`${PREFIX}:since:${userId}`, String(endedAtSeconds), { EX: Math.ceil(ttlSeconds) });
  }

  async sessionsEndedAt(userId: string): Promise<number | null> {
    const raw = await this.client.get(`${PREFIX}:since:${userId}`);
    const n = raw === null || raw === undefined ? NaN : Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  revokeFamily(fam: string, ttlSeconds: number) {
    return this.mark(`fam:${fam}`, ttlSeconds);
  }

  isFamilyRevoked(fam: string) {
    return this.has(`fam:${fam}`);
  }
}
