import { randomUUID } from "node:crypto";
import { EntityManager } from "typeorm";
import { Design } from "@/common/contracts/phase2/api.schema";
import { DesignVersion } from "@/modules/designs/entities/design-version.entity";
/** Called inside the same transaction as the design write. No historical version is updated. */
export async function recordVersion(
  m: EntityManager,
  snapshot: Design,
  origin: "create" | "edit" | "restore",
  restoredFromRevision: number | null = null,
) {
  await m.insert(DesignVersion, {
    id: randomUUID(),
    designId: snapshot.id,
    revision: snapshot.revision,
    origin,
    restoredFromRevision,
    snapshot,
    createdAt: new Date(snapshot.updatedAt),
  });
  // Keep newest 100 plus versions pinned by retained AI provenance; never prune a referenced snapshot.
  await m.query(
    `DELETE FROM design_versions v WHERE v.design_id=$1
    AND v.id IN (SELECT id FROM design_versions WHERE design_id=$1 ORDER BY revision DESC OFFSET 100)
    AND NOT EXISTS(SELECT 1 FROM ai_jobs j WHERE j.version_id=v.id)`,
    [snapshot.id],
  );
}
