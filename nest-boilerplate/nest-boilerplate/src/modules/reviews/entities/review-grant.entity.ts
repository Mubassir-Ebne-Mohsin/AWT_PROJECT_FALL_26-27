import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";
import type { Report } from "@/common/contracts/phase3/report.schema";

@Entity("review_grants")
export class ReviewGrant {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column("uuid") designId!: string;
  @Column("uuid") ownerId!: string;
  @Column("uuid") reviewerId!: string;
  @Column("integer") revision!: number;
  @Column({ type: "uuid", nullable: true }) runId!: string | null;
  /** The frozen document, assembled and validated at creation. Later edits and notes never reach it. */
  @Column("jsonb") report!: Report;
  @Column("timestamptz") createdAt!: Date;
  @Column({ type: "timestamptz", nullable: true }) revokedAt!: Date | null;
}
