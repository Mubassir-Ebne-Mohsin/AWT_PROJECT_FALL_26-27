import { Column, Entity, PrimaryColumn } from "typeorm";
import type { AiJob } from "@/common/contracts/phase3/ai.schema";
@Entity("ai_jobs")
export class AiJobRecord {
  @PrimaryColumn("uuid") id!: string;
  @Column("uuid") designId!: string;
  @Column("uuid") versionId!: string;
  @Column("uuid") requestId!: string;
  @Column("varchar") status!: AiJob["status"];
  @Column("jsonb") payload!: AiJob;
  // Bounded server-derived evidence is copied, so normal run retention is unaffected.
  @Column("jsonb") facts!: Record<string, unknown>;
  @Column("timestamptz") createdAt!: Date;
  @Column("timestamptz") expiresAt!: Date;
}
