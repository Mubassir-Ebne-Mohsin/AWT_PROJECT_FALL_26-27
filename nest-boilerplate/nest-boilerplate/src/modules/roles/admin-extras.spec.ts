import { createHash } from "node:crypto";
import { calm } from "@/modules/roles/admin-metrics.fixture";
import { AdminMetricsService } from "@/modules/roles/admin-metrics.service";
import {
  AdminMetricsExportService,
  metricsCsv,
} from "@/modules/roles/admin-metrics-export.service";
import {
  activityWindow,
  readActivityHeatmap,
} from "@/modules/roles/admin-activity";
import {
  adminMetricsBodySchema,
  adminMetricsSchema,
} from "@/common/contracts/phase3/admin-metrics.schema";

const body = () => {
  const { snapshotKey: _key, ...value } = calm();
  return adminMetricsBodySchema.parse(value);
};
const make = () => {
  const svc = new AdminMetricsService({} as never, {} as never);
  const read = jest.fn(async () => body());
  Object.assign(svc, { read });
  return { svc, read };
};

describe("dashboard extras", () => {
  it("uses an exact rolling 28-day interval across UTC year/month boundaries", () => {
    expect(activityWindow(new Date("2026-01-01T00:00:00Z"))).toEqual({
      windowStart: "2025-12-04T00:00:00.000Z",
      windowEnd: "2026-01-01T00:00:00.000Z",
    });
  });
  it("fills Monday 00 and Sunday 23 without shifting buckets; empty database is all zero", async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        { bucket: 0, designs: 2, runs: 3 },
        { bucket: 167, designs: 1, runs: 4 },
      ])
      .mockResolvedValueOnce([]);
    const h = await readActivityHeatmap(
      { query },
      new Date("2026-01-01T00:00:00Z"),
    );
    expect(h.cells).toHaveLength(168);
    expect(h.cells[0]).toBe(5);
    expect(h.cells[167]).toBe(5);
    expect(h.cells.reduce((a, b) => a + b, 0)).toBe(h.total);
    expect(h.total).toBe(10);
    expect((await readActivityHeatmap({ query }, new Date())).cells).toEqual(
      Array(168).fill(0),
    );
    expect(query.mock.calls[0][0]).toContain("AT TIME ZONE 'UTC'");
    expect(query.mock.calls[0][0]).toContain("created_at < $2");
    await expect(
      readActivityHeatmap(
        {
          query: jest
            .fn()
            .mockResolvedValue([{ bucket: 168, designs: 0, runs: 1 }]),
        },
        new Date(),
      ),
    ).rejects.toThrow();
  });
  it("pins immutable historical snapshots, bounds storage, and refuses expiry instead of reading newer numbers", async () => {
    const { svc, read } = make();
    const first = await svc.snapshot(() => 1000);
    const { snapshotKey, ...rest } = first;
    expect(snapshotKey).toBe(
      createHash("sha256").update(JSON.stringify(rest)).digest("hex"),
    );
    first.totals.users = 999;
    expect(svc.resolveSnapshot(snapshotKey, 2000).totals.users).toBe(1);
    svc.reset();
    read.mockResolvedValue({ ...body(), activeNow: 10 });
    await svc.snapshot(() => 4000);
    expect(svc.resolveSnapshot(snapshotKey, 5000).activeNow).toBe(0);
    expect(() => svc.resolveSnapshot(snapshotKey, 301000)).toThrow("expired");
    for (let i = 0; i < 129; i++) {
      svc.reset();
      read.mockResolvedValue({ ...body(), activeNow: i });
      await svc.snapshot(() => 400000 + i);
    }
    expect(
      (svc as unknown as { retained: Map<string, unknown> }).retained.size,
    ).toBe(128);
  });
  it("CSV has exactly two columns of safe keys/numbers, and rejects nested private strings", () => {
    const value = calm();
    value.alerts = [{ key: "cache_down", level: "critical" }];
    const csv = metricsCsv(value);
    expect(csv).toContain("heatmap.cells.167,0");
    for (const row of csv.trim().split(/\r?\n/).slice(1))
      expect(row).toMatch(/^[A-Za-z][A-Za-z0-9_.-]*,\d+(\.\d+)?$/);
    for (const attack of [
      { ...value, name: "=HYPERLINK(secret)" },
      { ...value, totals: { ...value.totals, users: "private" } },
      { ...value, alerts: [{ key: "private", level: "critical" }] },
    ]) {
      expect(adminMetricsSchema.safeParse(attack).success).toBe(false);
      expect(() => metricsCsv(attack as never)).toThrow();
    }
  });
  it("exports the requested snapshot, counts each closed format with TTL, and fails closed on Redis outage", async () => {
    const { svc } = make();
    const snapshot = await svc.snapshot();
    const evalFn = jest.fn().mockResolvedValue(1);
    const exports = new AdminMetricsExportService(svc, {
      getClient: () => ({ eval: evalFn }),
    } as never);
    for (const format of ["json", "csv"] as const) {
      const file = await exports.export({
        format,
        snapshot: snapshot.snapshotKey,
      });
      expect(file.snapshotKey).toBe(snapshot.snapshotKey);
      expect(file.fileName).toContain(snapshot.generatedAt.replace(/:/g, "-"));
      if (format === "json") expect(JSON.parse(file.content)).toEqual(snapshot);
    }
    await exports.export({
      format: "json",
      purpose: "pdf",
      snapshot: snapshot.snapshotKey,
    });
    expect(evalFn.mock.calls.map((c) => c[1].arguments)).toEqual([
      ["json", "7776000"],
      ["csv", "7776000"],
      ["pdf", "7776000"],
    ]);
    expect(evalFn.mock.calls[0][1].keys[0]).toMatch(
      /^stressforge:admin-metrics:exports:\d{4}-\d\d-\d\d$/,
    );
    await expect(
      exports.export({ format: "exe", snapshot: snapshot.snapshotKey }),
    ).rejects.toThrow("valid export");
    await expect(
      exports.export({
        format: "csv",
        purpose: "pdf",
        snapshot: snapshot.snapshotKey,
      }),
    ).rejects.toThrow("valid export");
    await expect(
      exports.export({ format: "json", snapshot: "f".repeat(64) }),
    ).rejects.toThrow("expired");
    expect(evalFn).toHaveBeenCalledTimes(3);
    evalFn.mockRejectedValue(new Error("down"));
    await expect(
      exports.export({ format: "json", snapshot: snapshot.snapshotKey }),
    ).rejects.toThrow("auditing is unavailable");
  });
});
