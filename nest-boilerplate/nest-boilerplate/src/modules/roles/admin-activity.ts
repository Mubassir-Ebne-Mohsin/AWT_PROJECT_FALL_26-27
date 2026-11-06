import { QueryRunner } from "typeorm";
import { activityHeatmapSchema } from "@/common/contracts/phase3/admin-metrics.schema";

export function activityWindow(end: Date) {
  return {
    windowStart: new Date(end.getTime() - 28 * 86400000).toISOString(),
    windowEnd: end.toISOString(),
  };
}

/** Called inside the metrics transaction. SQL selects counts only, never content or identifiers. */
export async function readActivityHeatmap(
  q: Pick<QueryRunner, "query">,
  end: Date,
) {
  const window = activityWindow(end);
  const rows: { bucket: number; designs: number; runs: number }[] =
    await q.query(
      `WITH activity AS (
       SELECT created_at, 1 AS design, 0 AS run FROM designs WHERE created_at >= $1 AND created_at < $2
       UNION ALL
       SELECT created_at, 0 AS design, 1 AS run FROM design_runs WHERE created_at >= $1 AND created_at < $2
     ) SELECT ((extract(isodow FROM created_at AT TIME ZONE 'UTC')::int - 1) * 24
                    + extract(hour FROM created_at AT TIME ZONE 'UTC')::int) AS bucket,
              sum(design)::int AS designs, sum(run)::int AS runs
         FROM activity GROUP BY 1`,
      [window.windowStart, window.windowEnd],
    );
  const cells = Array<number>(168).fill(0);
  let designsCreated = 0,
    runsCreated = 0;
  for (const row of rows) {
    if (!Number.isInteger(row.bucket) || row.bucket < 0 || row.bucket >= 168)
      throw new Error("Invalid UTC activity bucket");
    cells[row.bucket] = row.designs + row.runs;
    designsCreated += row.designs;
    runsCreated += row.runs;
  }
  return activityHeatmapSchema.parse({
    windowDays: 28,
    ...window,
    designsCreated,
    runsCreated,
    total: designsCreated + runsCreated,
    cells,
  });
}
