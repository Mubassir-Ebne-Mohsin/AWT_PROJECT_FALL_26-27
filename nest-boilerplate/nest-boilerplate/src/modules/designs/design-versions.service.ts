import { Injectable } from "@nestjs/common";
import { inputFingerprint } from "@/common/contracts/phase2/fingerprint";
import { recordVersion } from "@/modules/designs/record-version";
import { DataSource, LessThan } from "typeorm";
import { AppException } from "@/common/errors";
import { DesignsService } from "@/modules/designs/designs.service";
import { DesignVersion } from "@/modules/designs/entities/design-version.entity";
import {
  designVersionSchema,
  versionListQuerySchema,
} from "@/common/contracts/phase3/version.schema";
@Injectable()
export class DesignVersionsService {
  constructor(
    private readonly db: DataSource,
    private readonly designs: DesignsService,
  ) {}
  async list(owner: string, id: string, raw: Record<string, unknown>) {
    await this.designs.owned(owner, id);
    const q = versionListQuerySchema.safeParse(raw);
    if (!q.success)
      throw new AppException("VALIDATION_FAILED", "Invalid version pagination");
    const rows = await this.db
      .getRepository(DesignVersion)
      .find({
        where: {
          designId: id,
          ...(q.data.beforeRevision
            ? { revision: LessThan(q.data.beforeRevision) }
            : {}),
        },
        order: { revision: "DESC" },
        take: q.data.limit,
      });
    return rows.map((row) =>
      designVersionSchema.parse({
        ...row,
        createdAt: row.createdAt.toISOString(),
      }),
    );
  }
  /**
   * Restore saves an old version content as a NEW revision. Old versions are never edited or deleted.
   * The design row is locked and expectedRevision is checked, so a stale view or a parallel save gets a 409.
   */
  async restore(owner: string, id: string, revision: number, expectedRevision: number) {
    if (!Number.isInteger(revision) || revision < 1)
      throw new AppException("VALIDATION_FAILED", "Invalid version revision");
    return this.db.transaction(async (m) => {
      const design = await this.designs.owned(owner, id, m, true);
      this.designs.revision(design, expectedRevision);
      const row = await m.findOneBy(DesignVersion, { designId: id, revision });
      if (!row)
        throw new AppException("NOT_FOUND", "That version is no longer retained", {
          reason: "VERSION_NOT_RETAINED",
        });
      const old = designVersionSchema.parse({
        ...row,
        createdAt: row.createdAt.toISOString(),
      }).snapshot;
      if (old.schemaVersion !== design.schemaVersion)
        throw new AppException("VALIDATION_FAILED", "That version uses an older design format", {
          reason: "RESTORE_SCHEMA_MISMATCH",
        });
      const identical =
        old.name === design.name &&
        old.description === design.description &&
        inputFingerprint({ schemaVersion: old.schemaVersion, graph: old.graph, traffic: old.traffic }) ===
          inputFingerprint({ schemaVersion: design.schemaVersion, graph: design.graph, traffic: design.traffic });
      if (identical)
        throw new AppException("VALIDATION_FAILED", "That version is identical to the current design", {
          reason: "RESTORE_NO_CHANGES",
        });
      Object.assign(design, {
        name: old.name,
        description: old.description,
        graph: old.graph,
        traffic: old.traffic,
        revision: design.revision + 1,
        updatedAt: new Date(),
      });
      const value = this.designs.dto(await m.save(design));
      await recordVersion(m, value, "restore", revision);
      return value;
    });
  }
}
