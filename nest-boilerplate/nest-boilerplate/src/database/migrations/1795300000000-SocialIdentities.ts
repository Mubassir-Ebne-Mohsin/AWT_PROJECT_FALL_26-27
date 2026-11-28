import { MigrationInterface, QueryRunner } from "typeorm";
export class SocialIdentities1795300000000 implements MigrationInterface {
  name = "SocialIdentities1795300000000";
  async up(q: QueryRunner) {
    await q.query("ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL");
    await q.query(
      `CREATE TABLE external_identities(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,provider varchar(10) NOT NULL CHECK(provider IN ('google','github')),provider_subject varchar(255) NOT NULL,linked_at timestamptz NOT NULL DEFAULT now(),last_used_at timestamptz NOT NULL DEFAULT now(),UNIQUE(provider,provider_subject),UNIQUE(user_id,provider))`,
    );
  }
  async down(q: QueryRunner) {
    const [{ blocked }] = await q.query(
      "SELECT (EXISTS(SELECT 1 FROM users WHERE password_hash IS NULL) OR EXISTS(SELECT 1 FROM external_identities)) AS blocked",
    );
    if (blocked)
      throw new Error(
        "Social identity rollback refused: retain identities and social-only accounts; disable enrollment and keep compatible code",
      );
    await q.query("DROP TABLE external_identities");
    await q.query("ALTER TABLE users ALTER COLUMN password_hash SET NOT NULL");
  }
}
