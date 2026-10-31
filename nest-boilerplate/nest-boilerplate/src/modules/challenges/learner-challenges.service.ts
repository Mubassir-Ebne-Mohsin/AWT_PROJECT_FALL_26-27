import { Injectable, OnApplicationBootstrap } from "@nestjs/common";
import { DataSource } from "typeorm";
import { AppException } from "@/common/errors";
import {
  publicChallengeSchema,
  feedbackSchema,
  attemptSchema,
  submitAttemptSchema,
  submissionSchema,
  judgedSnapshotSchema,
  SUBMISSION_LIMIT,
} from "@/common/contracts/phase3/attempts.schema";

import { SavedDesign } from "@/modules/designs/entities/design.entity";
import { recordVersion } from "@/modules/designs/record-version";
import { DesignsService } from "@/modules/designs/designs.service";
import { SimulationService } from "@/modules/simulation/simulation.service";
import { judgeChallenge } from "@/modules/challenges/judge-challenge";

type AttemptRow = {
  id: string;
  challenge_id: string;
  design_id: string | null;
  created_at: Date;
};
type SubmissionRow = {
  id: string;
  attempt_id: string;
  request_id: string;
  design_revision: number;
  snapshot: unknown;
  goal: unknown;
  status: "pending" | "completed" | "failed" | "interrupted";
  result: {
    p95: number;
    errorRate: number;
    passes: boolean;
    engineVersion: string;
  } | null;
  created_at: Date;
  completed_at: Date | null;
};
@Injectable()
export class LearnerChallengesService implements OnApplicationBootstrap {
  constructor(
    private readonly db: DataSource,
    private readonly designs: DesignsService,
    private readonly simulation: SimulationService,
  ) {}
  async onApplicationBootstrap() {
    // Durable pending work is never silently replayed after process restart.
    await this.db.query(
      "UPDATE challenge_submissions SET status='interrupted',completed_at=now() WHERE status='pending'",
    );
  }
  async list() {
    const rows = await this.db.query(
      "SELECT id,title,summary,jsonb_build_object('p95Ms',goal_p95_ms,'errorRate',goal_error_rate) AS goal FROM challenges WHERE status='published' ORDER BY published_at DESC,id DESC LIMIT 200",
    );
    return rows.map((r: unknown) => publicChallengeSchema.parse(r));
  }
  async detail(id: string) {
    const [row] = await this.db.query(
      "SELECT id,title,summary,jsonb_build_object('p95Ms',goal_p95_ms,'errorRate',goal_error_rate) AS goal FROM challenges WHERE id=$1 AND status='published'",
      [id],
    );
    if (!row) throw new AppException("NOT_FOUND", "Challenge not found");
    return publicChallengeSchema.parse(row);
  }
  private attempt(row: AttemptRow) {
    if (!row.design_id)
      throw new AppException(
        "NOT_FOUND",
        "The attempt design was deleted; its submissions are retained",
      );
    return attemptSchema.parse({
      id: row.id,
      challengeId: row.challenge_id,
      designId: row.design_id,
      createdAt: row.created_at.toISOString(),
    });
  }
  private submission(row: SubmissionRow) {
    return submissionSchema.parse({
      id: row.id,
      attemptId: row.attempt_id,
      requestId: row.request_id,
      designRevision: row.design_revision,
      status: row.status,
      passes: row.result?.passes ?? null,
      p95: row.result?.p95 ?? null,
      errorRate: row.result?.errorRate ?? null,
      engineVersion: row.result?.engineVersion ?? null,
      createdAt: row.created_at.toISOString(),
      completedAt: row.completed_at?.toISOString() ?? null,
    });
  }
  async start(owner: string, challengeId: string) {
    return this.db.transaction(async (m) => {
      await m.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        "attempt:" + owner + ":" + challengeId,
      ]);
      const [old] = await m.query(
        "SELECT * FROM challenge_attempts WHERE learner_id=$1 AND challenge_id=$2",
        [owner, challengeId],
      );
      if (old) return this.attempt(old);
      const [c] = await m.query(
        "SELECT * FROM challenges WHERE id=$1 AND status='published' FOR SHARE",
        [challengeId],
      );
      if (!c) throw new AppException("NOT_FOUND", "Challenge not found");
      const now = new Date();
      const design = await m.save(
        SavedDesign,
        m.create(SavedDesign, {
          ownerId: owner,
          name: c.title,
          description: "Private challenge attempt",
          source: "blank",
          templateId: null,
          schemaVersion: 1,
          graph: c.starting_graph,
          traffic: c.traffic,
          revision: 1,
          createdAt: now,
          updatedAt: now,
          archivedAt: null,
        }),
      );
      await recordVersion(m, this.designs.dto(design), "create");
      const [row] = await m.query(
        "INSERT INTO challenge_attempts(challenge_id,learner_id,design_id) VALUES($1,$2,$3) RETURNING *",
        [challengeId, owner, design.id],
      );
      return this.attempt(row);
    });
  }
  async own(owner: string, attemptId: string) {
    const [row] = await this.db.query(
      "SELECT * FROM challenge_attempts WHERE id=$1 AND learner_id=$2",
      [attemptId, owner],
    );
    if (!row) throw new AppException("NOT_FOUND", "Attempt not found");
    // Worker deadlines are five seconds. A much older pending record has lost its completion acknowledgement.
    // Reconcile it on owned reads after database recovery without rerunning any calculation.
    await this.db.query("UPDATE challenge_submissions SET status='interrupted',completed_at=now() WHERE attempt_id=$1 AND status='pending' AND created_at < now()-interval '2 minutes'",[attemptId]);
    const submissions: SubmissionRow[] = await this.db.query(
      "SELECT * FROM challenge_submissions WHERE attempt_id=$1 ORDER BY created_at DESC,id DESC",
      [attemptId],
    );
    const notes: { id: string; submission_id: string; display_name: string; body: string; created_at: Date }[] =
      await this.db.query(
        `SELECT f.id, f.submission_id, u.display_name, f.body, f.created_at FROM challenge_feedback f
         JOIN challenge_submissions s ON s.id = f.submission_id JOIN users u ON u.id = f.instructor_id
         WHERE s.attempt_id = $1 ORDER BY f.created_at DESC, f.id DESC`,
        [attemptId],
      );
    return {
      attempt: this.attempt(row),
      challenge: await this.challengeContext(row.challenge_id),
      submissions: submissions.map((r) => this.submission(r)),
      feedback: notes.map((n) =>
        feedbackSchema.parse({
          id: n.id,
          submissionId: n.submission_id,
          author: { displayName: n.display_name },
          text: n.body,
          createdAt: n.created_at.toISOString(),
        }),
      ),
    };
  }
  async submit(owner: string, attemptId: string, raw: unknown) {
    const request = submitAttemptSchema.parse(raw);
    const accepted = await this.db.transaction(async (m) => {
      const [a] = await m.query(
        "SELECT * FROM challenge_attempts WHERE id=$1 AND learner_id=$2 FOR UPDATE",
        [attemptId, owner],
      );
      if (!a) throw new AppException("NOT_FOUND", "Attempt not found");
      const [old] = await m.query(
        "SELECT * FROM challenge_submissions WHERE attempt_id=$1 AND request_id=$2",
        [attemptId, request.requestId],
      );
      if (old) {
        if (old.design_revision !== request.expectedRevision)
          throw new AppException(
            "CONFLICT",
            "Request identity already used for another revision",
          );
        return { row: old as SubmissionRow, fresh: false };
      }
      const [c] = await m.query(
        "SELECT * FROM challenges WHERE id=$1 AND status='published' FOR SHARE",
        [a.challenge_id],
      );
      if (!c)
        throw new AppException(
          "CONFLICT",
          "This challenge is archived; earlier results are retained",
          { reason: "CHALLENGE_ARCHIVED" },
        );
      const [{ count }] = await m.query(
        "SELECT count(*)::int AS count FROM challenge_submissions WHERE attempt_id=$1 AND status IN ('pending','completed')",
        [attemptId],
      );
      if (count >= SUBMISSION_LIMIT)
        throw new AppException(
          "VALIDATION_FAILED",
          "Twenty graded submissions is the limit",
          { reason: "SUBMISSION_LIMIT" },
        );
      if (
        (
          await m.query(
            "SELECT id FROM challenge_submissions WHERE attempt_id=$1 AND status='pending'",
            [attemptId],
          )
        ).length
      )
        throw new AppException(
          "RATE_LIMITED",
          "A submission is still being judged",
        );
      if (!a.design_id)
        throw new AppException("NOT_FOUND", "Attempt design was deleted");
      const d = await this.designs.owned(owner, a.design_id, m, true);
      this.designs.revision(d, request.expectedRevision);
      const goal = { p95Ms: c.goal_p95_ms, errorRate: c.goal_error_rate };
      const snapshot = judgedSnapshotSchema.parse({
        schemaVersion: 1,
        graph: d.graph,
        traffic: {
          ...c.traffic,
          sloP95: goal.p95Ms,
          errorBudget: goal.errorRate,
        },
      });
      const checked = this.simulation.validate(snapshot);
      if (!checked.ok)
        throw new AppException(
          "VALIDATION_FAILED",
          "Fix the graph before submitting",
          { reason: "INVALID_GRAPH" },
        );
      const [row] = await m.query(
        "INSERT INTO challenge_submissions(attempt_id,request_id,design_revision,snapshot,goal,status) VALUES($1,$2,$3,$4,$5,'pending') RETURNING *",
        [
          attemptId,
          request.requestId,
          d.revision,
          JSON.stringify(snapshot),
          JSON.stringify(goal),
        ],
      );
      return { row: row as SubmissionRow, fresh: true };
    });
    if (accepted.fresh) void this.evaluate(owner, accepted.row);
    return this.submission(accepted.row);
  }
  private async evaluate(owner: string, row: SubmissionRow) {
    try {
      const run = await this.simulation.run(owner, {
        kind: "simulation",
        snapshot: judgedSnapshotSchema.parse(row.snapshot),
      });
      if (!run.output || run.output.kind !== "simulation")
        throw new Error("Invalid graph");
      const s = run.output.summary;
      const result = {
        ...judgeChallenge(s.p95, s.errorRate, row.goal),
        engineVersion: run.engineVersion,
        output: run.output,
        fingerprint: run.fingerprint,
      };
      await this.db.query(
        "UPDATE challenge_submissions SET status='completed',result=$2,completed_at=now() WHERE id=$1 AND status='pending'",
        [row.id, JSON.stringify(result)],
      );
    } catch {
      // No fabricated verdict: technical failure frees the graded slot but retains its request identity.
      await this.db
        .query(
          "UPDATE challenge_submissions SET status='failed',completed_at=now() WHERE id=$1 AND status='pending'",
          [row.id],
        )
        .catch(() => undefined);
    }
  }
  async progress(owner: string) {
    const attempts = await this.db.query(
      `SELECT a.id,a.challenge_id,a.design_id,a.created_at,c.title,c.status AS challenge_status,
      jsonb_build_object('p95Ms',c.goal_p95_ms,'errorRate',c.goal_error_rate) AS goal
      FROM challenge_attempts a JOIN challenges c ON c.id=a.challenge_id WHERE a.learner_id=$1 ORDER BY a.created_at DESC,a.id DESC LIMIT 200`,
      [owner],
    );
    const items = [];
    for (const a of attempts) {
      const rows: SubmissionRow[] = await this.db.query(
        "SELECT * FROM challenge_submissions WHERE attempt_id=$1 ORDER BY created_at DESC,id DESC",
        [a.id],
      );
      const submissions = rows.map((r) => this.submission(r));
      const graded = submissions.filter((s) => s.status === "completed");
      const best =
        [...graded].sort(
          (a, b) =>
            Number(b.passes) - Number(a.passes) ||
            a.p95! - b.p95! ||
            a.errorRate! - b.errorRate! ||
            a.createdAt.localeCompare(b.createdAt) ||
            a.id.localeCompare(b.id),
        )[0] ?? null;
      items.push({
        attemptId: a.id,
        challengeId: a.challenge_id,
        designId: a.design_id,
        title: a.title,
        archived: a.challenge_status === "archived",
        goal: a.goal,
        passed: graded.some((s) => s.passes),
        best,
        submissions,
      });
    }
    return {
      attempted: items.length,
      passed: items.filter((i) => i.passed).length,
      items,
    };
  }
  private async challengeContext(id: string) {
    const [c] = await this.db.query(
      "SELECT title,status,goal_p95_ms,goal_error_rate FROM challenges WHERE id=$1",
      [id],
    );
    return {
      title: c.title,
      archived: c.status === "archived",
      goal: { p95Ms: c.goal_p95_ms, errorRate: c.goal_error_rate },
    };
  }
}
