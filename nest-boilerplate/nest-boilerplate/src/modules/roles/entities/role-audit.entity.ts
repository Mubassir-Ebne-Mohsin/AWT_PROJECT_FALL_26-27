import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";
import type { GrantableRole } from "@/common/enums/account-role.enum";

/**
 * Append-only record of every role change. A database trigger refuses UPDATE and DELETE, and ids are plain values
 * (no foreign keys), so deleting an account can never rewrite history. Emails are snapshots as of the action.
 */
@Entity("role_audit")
export class RoleAudit {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column("timestamptz") at!: Date;
  @Column({ type: "varchar", length: 16 }) action!: "grant" | "revoke" | "bootstrap";
  @Column({ type: "varchar", length: 16 }) role!: GrantableRole;
  @Column({ type: "uuid", nullable: true }) actorId!: string | null;
  @Column({ type: "varchar", length: 254 }) actorEmail!: string;
  @Column({ type: "uuid", nullable: true }) targetId!: string | null;
  @Column({ type: "varchar", length: 254 }) targetEmail!: string;
}
