import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("review_comments")
export class ReviewComment {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column("uuid") grantId!: string;
  @Column("uuid") authorId!: string;
  /** Set only on an owner's reply, and then it is a Reviewer's top-level comment. */
  @Column({ type: "uuid", nullable: true }) parentId!: string | null;
  /** Empty exactly when the comment was removed. */
  @Column({ type: "varchar", length: 2000 }) text!: string;
  @Column("timestamptz") createdAt!: Date;
  @Column({ type: "timestamptz", nullable: true }) editedAt!: Date | null;
  @Column({ type: "timestamptz", nullable: true }) removedAt!: Date | null;
}
