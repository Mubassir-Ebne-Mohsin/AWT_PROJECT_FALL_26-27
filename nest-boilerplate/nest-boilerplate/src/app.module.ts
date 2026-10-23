import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";
import { BullModule } from "@nestjs/bull";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { ThrottlerStorageRedisService } from "@nest-lab/throttler-storage-redis";
import { ZodValidationPipe } from "nestjs-zod";
import { appConfig } from "@/config";
import { PostgresDatabaseProviderModule } from "@/providers/database/postgres/provider.module";
import { RedisCacheModule } from "@/providers/cache/redis/redis-cache.module";
import { AuthGuard, RolesGuard } from "@/common/guard";
import { AllExceptionsFilter } from "@/common/filters/all-exceptions.filter";
import { ResponseEnvelopeInterceptor } from "@/common/interceptors/response-envelope.interceptor";
import { RequestLoggerMiddleware } from "@/common/middlewares/request-logger.middleware";
import { AuthModule } from "@/modules/auth/auth.module";
import { HealthModule } from "@/modules/health/health.module";
import { UsersModule } from "@/modules/users/users.module";

import { SimulationModule } from "@/modules/simulation/simulation.module";

const { env } = appConfig;

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PostgresDatabaseProviderModule,
    RedisCacheModule,
    BullModule.forRoot({ url: env.REDIS_URL }),
    ThrottlerModule.forRoot({
      throttlers: [{ name: "default", ttl: 60_000, limit: env.THROTTLE_LIMIT }],
      // Counters live in Redis so limits survive restarts and work across instances.
      // Tests run on the default in-memory storage.
      storage:
        env.NODE_ENV === "test"
          ? undefined
          : new ThrottlerStorageRedisService(env.REDIS_URL),
    }),
    UsersModule,
    AuthModule,
    HealthModule,
    SimulationModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    // Order matters: throttle first, then authenticate, then check roles.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes("*path");
  }
}
