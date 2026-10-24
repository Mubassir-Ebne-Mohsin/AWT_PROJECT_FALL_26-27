import { Column, Entity, PrimaryColumn } from "typeorm";
import type { DesignRun } from "@/common/contracts/phase2/api.schema";
@Entity("design_runs")
export class SavedRun {
  @PrimaryColumn("uuid") id!: string;
  @Column("uuid") designId!: string;
  @Column("uuid") requestId!: string;
  @Column({ type: "varchar", length: 16 }) status!:
    "pending" | "completed" | "failed";
  @Column("timestamptz") createdAt!: Date;
  @Column({ type: "timestamptz", nullable: true }) completedAt!: Date | null;
  @Column("jsonb") payload!: DesignRun;
}
