import { MigrationInterface, QueryRunner } from "typeorm";

export class Usernames1795200000000 implements MigrationInterface {
  name = "Usernames1795200000000";

  async up(query: QueryRunner): Promise<void> {
    await query.query("ALTER TABLE users ADD COLUMN username varchar(30)");
    await query.query("ALTER TABLE users ADD CONSTRAINT ck_users_username CHECK (username ~ '^[a-z0-9_]{3,30}$')");
    await query.query("ALTER TABLE users ADD CONSTRAINT uq_users_username UNIQUE (username)");
  }

  async down(query: QueryRunner): Promise<void> {
    await query.query("ALTER TABLE users DROP COLUMN username");
  }
}
