import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { Role } from "@/common/enums/role.enum";

@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  // Always stored lowercased (see UsersService); the unique index relies on it.
  @Column({ type: "varchar", length: 254, unique: true })
  email!: string;

  @Column({ type: "varchar", length: 255 })
  passwordHash!: string;

  @Column({ type: "varchar", length: 60 })
  displayName!: string;

  @Column({ type: "varchar", length: 16, default: Role.USER })
  role!: Role;

  /** R2: a suspended account cannot sign in or refresh; its data is kept. Never part of the user DTO. */
  @Column({ type: "varchar", length: 12, default: "active" })
  accountStatus!: "active" | "suspended";

  /** R2: sessions issued at or before this moment are no longer valid (set on suspension and on a role removal). */
  @Column({ type: "timestamptz", nullable: true })
  sessionsRevokedAt!: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
