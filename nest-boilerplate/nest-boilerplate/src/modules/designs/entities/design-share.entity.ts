import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";
import type { Report } from "@/common/contracts/phase3/report.schema";

@Entity("design_shares")
export class DesignShare {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column("uuid") designId!: string;
  /** SHA-256 of the bearer secret. The secret itself is never stored. */
  @Column({ type: "varchar", length: 64 }) tokenHash!: string;
  @Column({ type: "varchar", length: 16 }) scope!: "design" | "design_report";
  @Column("integer") revision!: number;
  @Column({ type: "uuid", nullable: true }) runId!: string | null;
  @Column("boolean") includeDecisions!: boolean;
  /** The frozen document, assembled and validated at creation. Later edits and notes never reach it. */
  @Column("jsonb") report!: Report;
  @Column("timestamptz") createdAt!: Date;
  @Column({ type: "timestamptz", nullable: true }) expiresAt!: Date | null;
  @Column({ type: "timestamptz", nullable: true }) revokedAt!: Date | null;
  @Column({ type: "timestamptz", nullable: true }) lastOpenedAt!: Date | null;
  @Column("integer") openCount!: number;
}
