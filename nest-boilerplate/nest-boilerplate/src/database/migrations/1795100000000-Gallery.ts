import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Community gallery (F1, F3). One additive table; no existing table is changed. A post belongs to its owner and
 * to the design it was made from (deleted with either) and stores the frozen report it shows, so later edits never reach it.
 */
export class Gallery1795100000000 implements MigrationInterface {
  name = "Gallery1795100000000";
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE gallery_posts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      design_id uuid NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
      title varchar(100) NOT NULL CHECK(char_length(title) >= 1),
      description varchar(1000) NOT NULL DEFAULT '',
      revision integer NOT NULL CHECK(revision > 0),
      run_id uuid NULL,
      verdict varchar(10) NOT NULL CHECK(verdict IN ('pass','strained','fail')),
      p95 double precision NOT NULL CHECK(p95 >= 0),
      p95_target double precision NOT NULL CHECK(p95_target > 0),
      tags text[] NOT NULL DEFAULT '{}',
      node_count integer NOT NULL CHECK(node_count >= 0),
      allow_remix boolean NOT NULL DEFAULT true,
      remix_count integer NOT NULL DEFAULT 0 CHECK(remix_count >= 0),
      report jsonb NOT NULL,
      published_at timestamptz NOT NULL,
      unpublished_at timestamptz NULL)`);
    await q.query("CREATE INDEX gallery_posts_feed ON gallery_posts(published_at DESC, id DESC) WHERE unpublished_at IS NULL");
    await q.query("CREATE INDEX gallery_posts_owner ON gallery_posts(owner_id, published_at DESC)");
    await q.query("CREATE UNIQUE INDEX gallery_posts_one_active ON gallery_posts(design_id, revision) WHERE unpublished_at IS NULL");
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query("DROP TABLE gallery_posts");
  }
}
