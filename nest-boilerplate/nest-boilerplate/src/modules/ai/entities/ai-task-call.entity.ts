import { Column, Entity, PrimaryColumn } from "typeorm";

export type AiTaskName = "describe" | "whatif" | "fixes";

/** One design-task request to a model: provenance and spend, never the user's text (only its length and hash). */
@Entity("ai_task_calls")
export class AiTaskCall {
  @PrimaryColumn("uuid") id!: string;
  @Column("uuid") ownerId!: string;
  @Column("varchar") task!: AiTaskName;
  @Column("varchar") provider!: string;
  @Column("varchar") model!: string;
  @Column("varchar", { nullable: true }) returnedModel!: string | null;
  @Column("varchar") outcome!: string;
  @Column("integer", { nullable: true }) promptTokens!: number | null;
  @Column("integer", { nullable: true }) completionTokens!: number | null;
  @Column("integer", { nullable: true }) totalTokens!: number | null;
  @Column("integer", { nullable: true }) latencyMs!: number | null;
  @Column("integer") inputLength!: number;
  @Column("char", { length: 64 }) inputHash!: string;
  @Column("timestamptz") createdAt!: Date;
}
