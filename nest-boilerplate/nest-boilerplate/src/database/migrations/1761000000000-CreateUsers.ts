import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateUsers1761000000000 implements MigrationInterface {
  name = "CreateUsers1761000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "email" character varying(254) NOT NULL,
        "password_hash" character varying(255) NOT NULL,
        "display_name" character varying(60) NOT NULL,
        "role" character varying(16) NOT NULL DEFAULT 'user',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_users" PRIMARY KEY ("id"),
        CONSTRAINT "uq_users_email" UNIQUE ("email"),
        CONSTRAINT "ck_users_email_lowercase" CHECK ("email" = lower("email")),
        CONSTRAINT "ck_users_role" CHECK ("role" IN ('user', 'admin'))
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
