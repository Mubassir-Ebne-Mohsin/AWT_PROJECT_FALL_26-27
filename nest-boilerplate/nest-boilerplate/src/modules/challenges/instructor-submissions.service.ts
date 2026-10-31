import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { AppException } from "@/common/errors";
import {
  FEEDBACK_MAX_PER_SUBMISSION,
  feedbackSchema,
  judgedSnapshotSchema,
} from "@/common/contracts/phase3/attempts.schema";
import {
  createFeedbackRequestSchema,
  instructorSubmissionDetailSchema,
  instructorSubmissionListSchema,
  instructorSubmissionSchema,
} from "@/common/contracts/phase3/instructor-submissions.schema";

type SubmissionRow = {
  id: string;
  attempt_id: string;
  display_name: string;
  design_revision: number;
  result: { passes: boolean; p95: number; errorRate: number; engineVersion: string };
  created_at: Date;
  completed_at: Date | null;
  feedback_count: number;
};
type DetailRow = SubmissionRow & {
  snapshot: unknown;
  challenge_id: string;
  challenge_title: string;
  goal_p95_ms: number;
  goal_error_rate: number;
};
type FeedbackRow = { id: string; submission_id: string; display_name: string; body: string; created_at: Date };

const SUMMARY_COLUMNS = `s.id, s.attempt_id, u.display_name, s.design_revision, s.result, s.created_at, s.completed_at,
    (SELECT count(*)::int FROM challenge_feedback f WHERE f.submission_id = s.id) AS feedback_count`;
const SUMMARY_FROM = `FROM challenge_submissions s
  JOIN challenge_attempts a ON a.id = s.attempt_id
  JOIN challenges c ON c.id = a.challenge_id
  JOIN users u ON u.id = a.learner_id`;

/**
 * R5.3 Instructor view of submissions and one-way feedback. Only graded (completed) submissions to the Instructor's
 * OWN challenges exist for them: any other submission, challenge or id is "not found". Learners are shown by display
 * name only. Feedback is plain text, cannot be edited or removed, and is capped per submission.
 */
@Injectable()
export class InstructorSubmissionsService {
  constructor(private readonly db: DataSource) {}

  private summary(r: SubmissionRow) {
    return instructorSubmissionSchema.parse({
      id: r.id,
      attemptId: r.attempt_id,
      learner: { displayName: r.display_name },
      designRevision: r.design_revision,
      passes: r.result.passes,
      p95: r.result.p95,
      errorRate: r.result.errorRate,
      engineVersion: r.result.engineVersion,
      createdAt: r.created_at.toISOString(),
      completedAt: r.completed_at?.toISOString() ?? null,
      feedbackCount: r.feedback_count,
    });
  }
  private feedback(r: FeedbackRow) {
    return feedbackSchema.parse({
      id: r.id,
      submissionId: r.submission_id,
      author: { displayName: r.display_name },
      text: r.body,
      createdAt: r.created_at.toISOString(),
    });
  }

  async list(instructorId: string, challengeId: string) {
    const [own] = await this.db.query("SELECT id FROM challenges WHERE id = $1 AND instructor_id = $2", [challengeId, instructorId]);
    if (!own) throw new AppException("NOT_FOUND", "Challenge not found");
    const rows: SubmissionRow[] = await this.db.query(
      `SELECT ${SUMMARY_COLUMNS} ${SUMMARY_FROM}
       WHERE c.id = $1 AND c.instructor_id = $2 AND s.status = 'completed' ORDER BY s.created_at DESC, s.id DESC LIMIT 200`,
      [challengeId, instructorId],
    );
    return instructorSubmissionListSchema.parse(rows.map((r) => this.summary(r)));
  }

  async detail(instructorId: string, submissionId: string) {
    const [row]: DetailRow[] = await this.db.query(
      `SELECT ${SUMMARY_COLUMNS}, s.snapshot, c.id AS challenge_id, c.title AS challenge_title, c.goal_p95_ms, c.goal_error_rate
       ${SUMMARY_FROM} WHERE s.id = $1 AND c.instructor_id = $2 AND s.status = 'completed'`,
      [submissionId, instructorId],
    );
    if (!row) throw new AppException("NOT_FOUND", "Submission not found");
    const notes: FeedbackRow[] = await this.db.query(
      `SELECT f.id, f.submission_id, u.display_name, f.body, f.created_at FROM challenge_feedback f
       JOIN users u ON u.id = f.instructor_id WHERE f.submission_id = $1 ORDER BY f.created_at ASC, f.id ASC`,
      [submissionId],
    );
    return instructorSubmissionDetailSchema.parse({
      submission: this.summary(row),
      challenge: { id: row.challenge_id, title: row.challenge_title, goal: { p95Ms: row.goal_p95_ms, errorRate: row.goal_error_rate } },
      snapshot: judgedSnapshotSchema.parse(row.snapshot),
      feedback: notes.map((n) => this.feedback(n)),
    });
  }

  async addFeedback(instructorId: string, submissionId: string, raw: unknown) {
    const parsed = createFeedbackRequestSchema.safeParse(raw);
    if (!parsed.success) throw new AppException("VALIDATION_FAILED", "Invalid feedback");
    return this.db.transaction(async (m) => {
      const [own] = await m.query(
        `SELECT s.id FROM challenge_submissions s JOIN challenge_attempts a ON a.id = s.attempt_id
         JOIN challenges c ON c.id = a.challenge_id
         WHERE s.id = $1 AND c.instructor_id = $2 AND s.status = 'completed' FOR UPDATE OF s`,
        [submissionId, instructorId],
      );
      if (!own) throw new AppException("NOT_FOUND", "Submission not found");
      const [{ count }] = await m.query("SELECT count(*)::int AS count FROM challenge_feedback WHERE submission_id = $1", [submissionId]);
      if (count >= FEEDBACK_MAX_PER_SUBMISSION)
        throw new AppException("VALIDATION_FAILED", "This submission already has the maximum number of feedback notes", {
          reason: "FEEDBACK_LIMIT",
          limit: FEEDBACK_MAX_PER_SUBMISSION,
        });
      const [row] = await m.query(
        `WITH ins AS (INSERT INTO challenge_feedback(submission_id, instructor_id, body) VALUES ($1, $2, $3) RETURNING *)
         SELECT ins.id, ins.submission_id, u.display_name, ins.body, ins.created_at FROM ins JOIN users u ON u.id = ins.instructor_id`,
        [submissionId, instructorId, parsed.data.text],
      );
      return this.feedback(row);
    });
  }
}
