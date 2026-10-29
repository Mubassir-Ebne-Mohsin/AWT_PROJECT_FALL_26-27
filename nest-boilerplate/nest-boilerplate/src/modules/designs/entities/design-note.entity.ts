import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("design_notes")
export class DesignNote {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column("uuid") designId!: string;
  /** Plain number, not a foreign key: a note outlives the pruning of its version. */
  @Column("integer") revision!: number;
  @Column({ type: "varchar", length: 16 }) kind!: "decision" | "assumption";
  @Column("text") text!: string;
  @Column("timestamptz") createdAt!: Date;
  @Column("timestamptz") updatedAt!: Date;
}
