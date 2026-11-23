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

  @Column({ type: "varchar", length: 254, unique: true })
  email!: string;

  @Column({ type: "varchar", length: 255 })
  passwordHash!: string;

  @Column({ type: "varchar", length: 60 })
  displayName!: string;

  @Column({ type: "varchar", length: 30, nullable: true })
  username!: string | null;

  @Column({ type: "varchar", length: 16, default: Role.USER })
  role!: Role;

  @Column({ type: "varchar", length: 12, default: "active" })
  accountStatus!: "active" | "suspended";

  @Column({ type: "timestamptz", nullable: true })
  sessionsRevokedAt!: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
