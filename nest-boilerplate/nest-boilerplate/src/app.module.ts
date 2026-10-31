import { AiModule } from "@/modules/ai/ai.module";
import { DesignsModule } from "@/modules/designs/designs.module";
import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";
import { BullModule } from "@nestjs/bull";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { ReliableThrottlerStorage } from "@/providers/cache/redis/reliable-throttler-storage";
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
import { RolesModule } from "@/modules/roles/roles.module";
import { ReviewsModule } from "@/modules/reviews/reviews.module";
import { PermissionGuard } from "@/modules/roles/permission.guard";

import { SimulationModule } from "@/modules/simulation/simulation.module";
import {
  isPreviewRoute,
  PREVIEW_THROTTLE_LIMIT,
} from "@/common/decorators/preview-throttle.decorator";

const { env } = appConfig;

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PostgresDatabaseProviderModule,
    RedisCacheModule,
    BullModule.forRoot({ url: env.REDIS_URL }),
    ThrottlerModule.forRoot({
      // Live previews have their own bucket so a fast-editing tab cannot starve autosave/Run (M8).
      throttlers: [
        {
          name: "default",
          ttl: 60_000,
          limit: env.THROTTLE_LIMIT,
          skipIf: isPreviewRoute,
        },
        {
          name: "preview",
          ttl: 60_000,
          limit: PREVIEW_THROTTLE_LIMIT,
          skipIf: (context) => !isPreviewRoute(context),
        },
      ],
      // Counters live in Redis so limits survive restarts and work across instances.
      // Tests run on the default in-memory storage.
      storage:
        env.NODE_ENV === "test"
          ? undefined
          : new ReliableThrottlerStorage(env.REDIS_URL),
    }),
    UsersModule,
    AuthModule,
    HealthModule,
    SimulationModule,
    DesignsModule,
    AiModule,
    RolesModule,
    ReviewsModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    // Order matters: throttle first, then authenticate, then check roles.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    // R1: database-backed, non-inheriting permissions (@RequirePermission). The ranked RolesGuard above is unchanged.
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes("*path");
  }
}
