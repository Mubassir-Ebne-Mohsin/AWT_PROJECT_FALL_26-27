import { Injectable } from "@nestjs/common";
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
}
