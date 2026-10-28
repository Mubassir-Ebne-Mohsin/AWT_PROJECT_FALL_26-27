import { Column, Entity, PrimaryColumn } from "typeorm";
import type { Design } from "@/common/contracts/phase2/api.schema";
@Entity("design_versions")
export class DesignVersion {
  @PrimaryColumn("uuid") id!: string;
  @Column("uuid") designId!: string;
  @Column("integer") revision!: number;
  @Column("varchar") origin!: "baseline" | "create" | "edit";
  @Column("jsonb") snapshot!: Design;
  @Column("timestamptz") createdAt!: Date;
}
