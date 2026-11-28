import { Entity, PrimaryColumn, PrimaryGeneratedColumn, Column } from "typeorm";
@Entity("region_lab_experiments")
export class RegionExperiment {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column("uuid") ownerId!: string;
  @Column("varchar", { length: 100 }) name!: string;
  @Column("varchar", { length: 2000 }) description!: string;
  @Column("integer") revision!: number;
  @Column("timestamptz") createdAt!: Date;
  @Column("timestamptz") updatedAt!: Date;
}
@Entity("region_lab_versions")
export class RegionVersion {
  @PrimaryColumn("uuid") experimentId!: string;
  @PrimaryColumn("integer") revision!: number;
  @Column("jsonb") snapshot!: unknown;
  @Column("char", { length: 64 }) inputHash!: string;
  @Column("timestamptz") createdAt!: Date;
}
@Entity("region_lab_runs")
export class RegionRun {
  @PrimaryColumn("uuid") id!: string;
  @Column("uuid") ownerId!: string;
  @Column("uuid") experimentId!: string;
  @Column("integer") experimentRevision!: number;
  @Column("uuid") requestId!: string;
  @Column("char", { length: 64 }) inputHash!: string;
  @Column("varchar", { length: 80 }) engineVersion!: string;
  @Column("jsonb") snapshot!: unknown;
  @Column("varchar", { length: 12 }) status!: string;
  @Column("jsonb", { nullable: true }) result!: unknown;
  @Column("jsonb", { nullable: true }) failure!: unknown;
  @Column("uuid", { nullable: true }) leaseToken!: string | null;
  @Column("timestamptz", { nullable: true }) leaseExpiresAt!: Date | null;
  @Column("uuid", { nullable: true }) workerInstance!: string | null;
  @Column("timestamptz") createdAt!: Date;
  @Column("timestamptz", { nullable: true }) startedAt!: Date | null;
  @Column("timestamptz", { nullable: true }) finishedAt!: Date | null;
}
@Entity("region_lab_requests")
export class RegionRequest {
  @PrimaryColumn("uuid") ownerId!: string;
  @PrimaryColumn("uuid") requestId!: string;
  @Column("uuid") experimentId!: string;
  @Column("integer") experimentRevision!: number;
  @Column("char", { length: 64 }) inputHash!: string;
  @Column("uuid") originalRunId!: string;
  @Column("uuid", { nullable: true }) currentRunId!: string | null;
  @Column("varchar", { length: 12 }) lastStatus!: string;
  @Column("timestamptz") createdAt!: Date;
}
@Entity("region_lab_execution_slot")
export class RegionExecutionSlot {
  @PrimaryColumn("integer") id!: number;
  @Column("uuid", { nullable: true }) runId!: string | null;
  @Column("uuid", { nullable: true }) leaseToken!: string | null;
  @Column("timestamptz", { nullable: true }) leaseExpiresAt!: Date | null;
}
