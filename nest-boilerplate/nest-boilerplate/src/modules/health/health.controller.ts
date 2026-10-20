import { Controller, Get } from "@nestjs/common";
import { ApiExtraModels, ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { Public } from "@/common/decorators";
import { AppException } from "@/common/errors";
import { ApiOkEnvelope } from "@/common/swagger/api-envelope";
import { RedisCacheService } from "@/providers/cache/redis/redis-cache.service";

const componentSchema = z.enum(["up", "down"]);
const healthSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  postgres: componentSchema,
  redis: componentSchema,
  timestamp: z.string(),
});
class HealthDto extends createZodDto(healthSchema) {}

const CHECK_TIMEOUT_MS = 2000;

const probe = async (fn: () => Promise<unknown>): Promise<"up" | "down"> => {
  try {
    await Promise.race([
      fn(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), CHECK_TIMEOUT_MS),
      ),
    ]);
    return "up";
  } catch {
    return "down";
  }
};

@ApiTags("health")
@Public()
@SkipThrottle()
@Controller("health")
export class HealthController {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly redis: RedisCacheService,
  ) {}

  @Get()
  @ApiExtraModels(HealthDto)
  @ApiOkEnvelope(HealthDto)
  async check(): Promise<HealthDto> {
    const [postgres, redis] = await Promise.all([
      probe(() => this.db.query("SELECT 1")),
      probe(() => this.redis.getClient().ping()),
    ]);
    const report = {
      status: postgres === "up" && redis === "up" ? ("ok" as const) : ("degraded" as const),
      postgres,
      redis,
      timestamp: new Date().toISOString(),
    };
    if (report.status !== "ok") {
      throw new AppException("UNAVAILABLE", "One or more dependencies are down", report);
    }
    return report;
  }
}
