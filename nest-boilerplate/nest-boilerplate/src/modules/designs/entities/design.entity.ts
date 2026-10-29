import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";
import type { Graph, Traffic } from "@/common/contracts/phase2/graph.schema";
@Entity("designs")
export class SavedDesign {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column("uuid") ownerId!: string;
  @Column({ type: "varchar", length: 100 }) name!: string;
  @Column({ type: "text" }) description!: string;
  @Column({ type: "varchar", length: 16 }) source!:
    "blank" | "template" | "import" | "scripted";
  @Column({ type: "varchar", nullable: true }) templateId!: string | null;
  @Column("integer") schemaVersion!: 1;
  @Column("jsonb") graph!: Graph;
  @Column("jsonb") traffic!: Traffic;
  @Column("integer") revision!: number;
  @Column("timestamptz") createdAt!: Date;
  @Column("timestamptz") updatedAt!: Date;
  /** M15.5: hidden from the default list when set. Never part of the frozen design contract. */
  @Column({ type: "timestamptz", nullable: true }) archivedAt!: Date | null;
}
