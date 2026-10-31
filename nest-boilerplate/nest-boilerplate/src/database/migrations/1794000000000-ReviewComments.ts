import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * R4 Reviewer feedback. One additive table on top of `review_grants`. A comment belongs to one grant (deleted with it)
 * and one author; an owner reply points at a Reviewer's top-level comment. A removed comment keeps its row so the
 * thread still makes sense, but its text is erased: the CHECK makes "removed" and "has text" mutually exclusive.
 */
export class ReviewComments1794000000000 implements MigrationInterface {
  name = "ReviewComments1794000000000";
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE review_comments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      grant_id uuid NOT NULL REFERENCES review_grants(id) ON DELETE CASCADE,
      author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      parent_id uuid NULL REFERENCES review_comments(id) ON DELETE CASCADE,
      text varchar(2000) NOT NULL,
      created_at timestamptz NOT NULL,
      edited_at timestamptz NULL,
      removed_at timestamptz NULL,
      CHECK((removed_at IS NULL AND char_length(text) >= 1) OR (removed_at IS NOT NULL AND text = '')))`);
    await q.query("CREATE INDEX review_comments_thread ON review_comments(grant_id, created_at, id)");
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query("DROP TABLE review_comments");
  }
}
