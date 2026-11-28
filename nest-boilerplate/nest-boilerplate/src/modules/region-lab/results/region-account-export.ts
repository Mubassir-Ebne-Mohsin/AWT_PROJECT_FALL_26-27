import type { DataSource } from "typeorm";
/** Safe owner-only manifest. Large snapshots/results have authenticated per-record exports. */
export async function regionAccountExport(db: DataSource, owner: string) {
  const [ready] = await db.query(
    "SELECT to_regclass('public.region_lab_experiments') IS NOT NULL AS ready",
  );
  if (!ready.ready)
    return {
      format: "region-lab-account-manifest-v1",
      available: false,
      experiments: [],
      versions: [],
      runs: [],
      requests: [],
      note: "Region Lab storage migration not applied.",
    };
  const experiments = await db.query(
    "SELECT id,name,description,revision,created_at,updated_at FROM region_lab_experiments WHERE owner_id=$1 ORDER BY created_at,id",
    [owner],
  );
  const versions = await db.query(
    "SELECT v.experiment_id,v.revision,v.input_hash,v.created_at FROM region_lab_versions v JOIN region_lab_experiments e ON e.id=v.experiment_id WHERE e.owner_id=$1 ORDER BY v.experiment_id,v.revision",
    [owner],
  );
  const runs = await db.query(
    "SELECT id,experiment_id,experiment_revision,status,input_hash,engine_version,created_at,started_at,finished_at,failure FROM region_lab_runs WHERE owner_id=$1 ORDER BY created_at,id",
    [owner],
  );
  const requests = await db.query(
    "SELECT request_id,original_run_id,current_run_id,experiment_id,experiment_revision,last_status FROM region_lab_requests WHERE owner_id=$1 ORDER BY request_id",
    [owner],
  );
  return {
    format: "region-lab-account-manifest-v1",
    available: true,
    experiments,
    versions: versions.map((v: any) => ({
      ...v,
      snapshotUrl: `/v1/region-lab/experiments/${v.experiment_id}/versions/${v.revision}/export`,
    })),
    runs: runs.map((r: any) => ({
      ...r,
      exportUrl:
        r.status === "completed" ? `/v1/region-lab/runs/${r.id}/export` : null,
    })),
    requests,
    note: "Complete owner-only metadata manifest. Scenario snapshots and numerical payloads are omitted to bound account-export memory; download each retained version/run from its authenticated exportUrl or snapshotUrl. These URLs contain no token and require this account's session. Pruned runs have no payload.",
  };
}
