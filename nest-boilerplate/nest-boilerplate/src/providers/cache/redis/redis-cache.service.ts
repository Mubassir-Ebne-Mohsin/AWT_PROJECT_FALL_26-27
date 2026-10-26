import { appConfig } from "@/config";
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import type { RedisClientType } from "redis";
import { createClient } from "redis";

@Injectable()
export class RedisCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly redisClient: RedisClientType;
  private readonly logger = new Logger(RedisCacheService.name);

  constructor() {
    this.redisClient = createClient({
      url: appConfig.env.REDIS_URL,
      // Fail commands immediately while disconnected instead of queueing them,
      // so /health can report 503 and requests don't hang when Redis is down.
      disableOfflineQueue: true,
      commandsQueueMaxLength: 128,
      commandOptions: { timeout: 1000 },
      socket: {
        connectTimeout: 1000,
        reconnectStrategy: (retries) => Math.min(retries * 200, 5000),
      },
    });
  }

  onModuleInit() {
    this.redisClient.on("error", () =>
      this.logger.warn("Redis connection temporarily unavailable"),
    );
    this.redisClient.on("ready", () =>
      this.logger.log("Redis client connected"),
    );
    // Not awaited on purpose: the API still boots when Redis is down and
    // reports it through /v1/health while the client keeps retrying.
    this.redisClient.connect().catch(() => undefined);
  }

  async onModuleDestroy() {
    if (this.redisClient.isOpen) await this.redisClient.close();
  }

  getClient() {
    return this.redisClient;
  }
}
