import { Injectable } from "@nestjs/common";
import {
  adminMetricsSchema,
  metricsExportQuerySchema,
  metricsExportSchema,
  AdminMetrics,
} from "@/common/contracts/phase3/admin-metrics.schema";
import { AppException } from "@/common/errors/app.exception";
import { AdminMetricsService } from "@/modules/roles/admin-metrics.service";
import { RedisCacheService } from "@/providers/cache/redis/redis-cache.service";

/** Numeric values only. Closed enum values and the derived digest become keys, never arbitrary spreadsheet text. */
export function metricsCsv(value: AdminMetrics): string {
  const lines = ["key,value"];
  function walk(node: unknown, path: string) {
    if (node === null) lines.push(`${path}.present,0`);
    else if (typeof node === "number") lines.push(`${path},${node}`);
    else if (typeof node === "boolean") lines.push(`${path},${Number(node)}`);
    else if (typeof node === "string") {
      if (/^\d{4}-\d{2}-\d{2}T/.test(node))
        lines.push(`${path}.unixMs,${Date.parse(node)}`);
      else lines.push(`${path}.${node},1`);
    } else if (typeof node === "object")
      for (const [k, v] of Object.entries(node!))
        walk(v, path ? `${path}.${k}` : k);
  }
  walk(adminMetricsSchema.parse(value), "");
  return lines.join("\r\n") + "\r\n";
}

const COUNT_EXPORT = `local n = redis.call('HINCRBY', KEYS[1], ARGV[1], 1)
redis.call('EXPIRE', KEYS[1], ARGV[2])
return n`;

@Injectable()
export class AdminMetricsExportService {
  constructor(
    private readonly metrics: AdminMetricsService,
    private readonly redis: RedisCacheService,
  ) {}

  async export(query: unknown) {
    const parsed = metricsExportQuerySchema.safeParse(query);
    if (!parsed.success)
      throw new AppException(
        "VALIDATION_FAILED",
        "Choose a valid export format and dashboard snapshot.",
        parsed.error.issues,
      );
    const q = parsed.data;
    const snapshot = this.metrics.resolveSnapshot(q.snapshot);
    const content =
      q.format === "json"
        ? JSON.stringify(snapshot, null, 2)
        : metricsCsv(snapshot);
    const kind = q.purpose === "pdf" ? "pdf" : q.format;
    try {
      // Accepted requests, not successful local file writes; no user id or payload is retained.
      await this.redis.getClient().eval(COUNT_EXPORT, {
        keys: [
          `stressforge:admin-metrics:exports:${new Date().toISOString().slice(0, 10)}`,
        ],
        arguments: [kind, String(90 * 86400)],
      });
    } catch {
      throw new AppException(
        "UNAVAILABLE",
        "Export auditing is unavailable. Please try again shortly.",
      );
    }
    return metricsExportSchema.parse({
      fileName: `stressforge-metrics-${snapshot.generatedAt.replace(/:/g, "-")}.${q.format}`,
      contentType:
        q.format === "json"
          ? "application/json;charset=utf-8"
          : "text/csv;charset=utf-8",
      snapshotKey: snapshot.snapshotKey,
      content,
    });
  }
}
