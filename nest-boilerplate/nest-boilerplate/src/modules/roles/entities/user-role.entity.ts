import { Column, Entity, PrimaryColumn } from "typeorm";
import type { GrantableRole } from "@/common/enums/account-role.enum";

/** One granted role for one account. User is implicit and never stored. */
@Entity("user_roles")
export class UserRole {
  @PrimaryColumn("uuid") userId!: string;
  @PrimaryColumn({ type: "varchar", length: 16 }) role!: GrantableRole;
  /** Null for a server-side command (first-admin bootstrap, demo seed) or after the granting account is deleted. */
  @Column({ type: "uuid", nullable: true }) grantedBy!: string | null;
  @Column("timestamptz") grantedAt!: Date;
}
