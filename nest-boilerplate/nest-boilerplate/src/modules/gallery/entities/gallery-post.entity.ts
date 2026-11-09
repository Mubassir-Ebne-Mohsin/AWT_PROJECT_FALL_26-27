import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";
import type { Report } from "@/common/contracts/phase3/report.schema";

@Entity("gallery_posts")
export class GalleryPost {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column("uuid") ownerId!: string;
  @Column("uuid") designId!: string;
  @Column({ type: "varchar", length: 100 }) title!: string;
  @Column({ type: "varchar", length: 1000 }) description!: string;
  @Column("integer") revision!: number;
  @Column({ type: "uuid", nullable: true }) runId!: string | null;
  @Column({ type: "varchar", length: 10 }) verdict!: "pass" | "strained" | "fail";
  @Column("double precision") p95!: number;
  @Column("double precision") p95Target!: number;
  @Column("text", { array: true }) tags!: string[];
  @Column("integer") nodeCount!: number;
  @Column("boolean") allowRemix!: boolean;
  @Column("integer") remixCount!: number;
  /** The frozen document, assembled and validated at publishing. It has no notes. */
  @Column("jsonb") report!: Report;
  @Column("timestamptz") publishedAt!: Date;
  @Column({ type: "timestamptz", nullable: true }) unpublishedAt!: Date | null;
}
