import { ThrottlerStorageRedisService } from "@nest-lab/throttler-storage-redis";
import { AppException } from "@/common/errors";

/** Request counters must fail before request processing, never wait for reconnection. */
export class ReliableThrottlerStorage extends ThrottlerStorageRedisService {
  constructor(url: string) {
    super(url, {
      enableOfflineQueue: false,
      autoResendUnfulfilledCommands: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 1000,
      commandTimeout: 1000,
      retryStrategy: (attempt) => Math.min(attempt * 100, 1000),
    });
    // Connection errors are represented by the controlled request/health response.
    // Raw client errors can expose connection configuration; never log them here.
    this.redis.on("error", () => undefined);
  }
  override async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ) {
    if (this.redis.status !== "ready")
      throw new AppException(
        "UNAVAILABLE",
        "Rate-limit storage is temporarily unavailable",
      );
    try {
      return await super.increment(
        key,
        ttl,
        limit,
        blockDuration,
        throttlerName,
      );
    } catch (error) {
      const code =
        error instanceof Error && "code" in error ? String(error.code) : "";
      if (
        this.redis.status !== "ready" ||
        (error instanceof Error && error.message === "Command timed out") ||
        ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EPIPE"].includes(code)
      )
        throw new AppException(
          "UNAVAILABLE",
          "Rate-limit storage is temporarily unavailable",
        );
      throw error; // Unexpected Lua/data/programming errors must remain visible as defects.
    }
  }
  override onModuleDestroy() {
    this.redis.disconnect();
  }
}
