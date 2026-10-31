import { Injectable } from "@nestjs/common";
import { DataSource, EntityManager } from "typeorm";
import { ZodError } from "zod";
import { AppException } from "@/common/errors";
import { SCHEMA_VERSION, trafficSchema } from "@/common/contracts/phase2/graph.schema";
import { DesignVersion } from "@/modules/designs/entities/design-version.entity";
import { DesignsService } from "@/modules/designs/designs.service";
import { SimulationService } from "@/modules/simulation/simulation.service";
import { ExecutionError } from "@/modules/simulation/worker/executor-error";
import {
  CHALLENGE_MAX_PER_INSTRUCTOR,
  CHALLENGE_TITLE_MAX,
  challengeBaselineSchema,
  challengeSchema,
  createChallengeRequestSchema,
  patchChallengeRequestSchema,
} from "@/common/contracts/phase3/challenges.schema";

type Goal = { p95Ms: number; errorRate: number };
type Row = {
  id: string;
  instructorId: string;
  title: string;
  summary: string;
  p95Ms: number;
  errorRate: number;
  traffic: Record<string, unknown>;
  graph: { nodes?: unknown[] };
  status: "draft" | "published" | "archived";
  baseline: unknown;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
  archivedAt: Date | null;
};

const COLUMNS = `id, instructor_id AS "instructorId", title, summary, goal_p95_ms AS "p95Ms", goal_error_rate AS "errorRate", traffic,
  starting_graph AS graph, status, baseline, created_at AS "createdAt", updated_at AS "updatedAt", published_at AS "publishedAt", archived_at AS "archivedAt"`;
const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** The traffic the model is run with: the Instructor's choices plus the SLO taken from the goal, so they cannot disagree. */
const fullTraffic = (traffic: Record<string, unknown>, goal: Goal) => trafficSchema.parse({ ...traffic, sloP95: goal.p95Ms, errorBudget: goal.errorRate });

/**
 * R5.1 Instructor challenges. Only the owning Instructor can read or change a challenge (anyone else gets "not found").
 * The starting design is copied from one of the Instructor's own designs and frozen. Once published, the goal, traffic
 * and starting design never change; the Instructor can fix the wording, archive it, or duplicate it into a new draft.
 * Publishing measures the starting design with the model, so the Instructor sees where learners begin.
 */
@Injectable()
export class ChallengesService {
  constructor(
    private readonly db: DataSource,
    private readonly designs: DesignsService,
    private readonly simulation: SimulationService,
  ) {}

  private dto(row: Row) {
    return challengeSchema.parse({
      id: row.id,
      title: row.title,
      summary: row.summary,
      goal: { p95Ms: row.p95Ms, errorRate: row.errorRate },
      traffic: row.traffic,
      status: row.status,
      baseline: row.baseline ?? null,
      componentCount: Array.isArray(row.graph?.nodes) ? row.graph.nodes.length : 0,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      publishedAt: iso(row.publishedAt),
      archivedAt: iso(row.archivedAt),
    });
  }

  /** The first row of a RETURNING query: an UPDATE gives back `[rows, count]`, an INSERT gives back the rows themselves. */
  private one(result: unknown): Row {
    const list = result as unknown[];
    return (Array.isArray(list[0]) ? list[0][0] : list[0]) as Row;
  }

  private async mine(m: EntityManager, instructor: string, id: string, lock = false) {
    const rows = (await m.query(`SELECT ${COLUMNS} FROM challenges WHERE id = $1 AND instructor_id = $2 ${lock ? "FOR UPDATE" : ""}`, [id, instructor])) as Row[];
    if (!rows.length) throw new AppException("NOT_FOUND", "Challenge not found");
    return rows[0];
  }

  /** One at a time per Instructor, so the 50-challenge limit cannot be passed by parallel requests. */
  private async assertRoom(m: EntityManager, instructor: string) {
    await m.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["sf-challenges:" + instructor]);
    const [{ n }] = (await m.query("SELECT count(*)::int AS n FROM challenges WHERE instructor_id = $1", [instructor])) as Array<{ n: number }>;
    if (n >= CHALLENGE_MAX_PER_INSTRUCTOR)
      throw new AppException("VALIDATION_FAILED", "You already have the maximum number of challenges", { reason: "CHALLENGE_LIMIT_REACHED", limit: CHALLENGE_MAX_PER_INSTRUCTOR });
  }

  /** The graph of one of the Instructor's own designs at one revision. Someone else's design is "forbidden" as usual. */
  private async startingGraph(m: EntityManager, instructor: string, ref: { designId: string; revision?: number }) {
    const design = await this.designs.owned(instructor, ref.designId, m);
    const revision = ref.revision ?? design.revision;
    const version = await m.findOneBy(DesignVersion, { designId: ref.designId, revision });
    if (!version) throw new AppException("NOT_FOUND", "That version is no longer retained", { reason: "VERSION_NOT_RETAINED", revision });
    return version.snapshot.graph;
  }

  async create(instructor: string, raw: Record<string, unknown>) {
    const parsed = createChallengeRequestSchema.safeParse(raw);
    if (!parsed.success) throw new AppException("VALIDATION_FAILED", "Invalid challenge");
    const body = parsed.data;
    return this.db.transaction(async (m) => {
      await this.assertRoom(m, instructor);
      const graph = await this.startingGraph(m, instructor, body.from);
      const traffic = fullTraffic(body.traffic, body.goal);
      const rows = (await m.query(
        `INSERT INTO challenges(instructor_id, title, summary, goal_p95_ms, goal_error_rate, traffic, starting_graph, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', now(), now()) RETURNING ${COLUMNS}`,
        [instructor, body.title, body.summary, body.goal.p95Ms, body.goal.errorRate, JSON.stringify(traffic), JSON.stringify(graph)],
      )) as Row[];
      return this.dto(this.one(rows));
    });
  }

  async list(instructor: string) {
    const rows = (await this.db.query(`SELECT ${COLUMNS} FROM challenges WHERE instructor_id = $1 ORDER BY updated_at DESC, id DESC LIMIT 100`, [instructor])) as Row[];
    return rows.map((r) => this.dto(r));
  }

  async get(instructor: string, id: string) {
    return this.dto(await this.mine(this.db.manager, instructor, id));
  }

  /** Draft: anything. Published: wording only. Archived: nothing. */
  async patch(instructor: string, id: string, raw: Record<string, unknown>) {
    const parsed = patchChallengeRequestSchema.safeParse(raw);
    if (!parsed.success) throw new AppException("VALIDATION_FAILED", "Invalid change");
    const body = parsed.data;
    return this.db.transaction(async (m) => {
      const row = await this.mine(m, instructor, id, true);
      if (row.status === "archived") throw new AppException("CONFLICT", "An archived challenge cannot be changed", { reason: "ARCHIVED" });
      const structural = body.goal !== undefined || body.traffic !== undefined || body.from !== undefined;
      if (structural && row.status === "published")
        throw new AppException("CONFLICT", "A published challenge's goal, traffic and starting design are frozen", { reason: "PUBLISHED_FROZEN" });
      const goal = body.goal ?? { p95Ms: row.p95Ms, errorRate: row.errorRate };
      const traffic = fullTraffic(body.traffic ?? row.traffic, goal);
      const graph = body.from ? await this.startingGraph(m, instructor, body.from) : row.graph;
      const updated = (await m.query(
        `UPDATE challenges SET title = $3, summary = $4, goal_p95_ms = $5, goal_error_rate = $6, traffic = $7, starting_graph = $8,
                baseline = CASE WHEN $9 THEN NULL ELSE baseline END, updated_at = now()
          WHERE id = $1 AND instructor_id = $2 RETURNING ${COLUMNS}`,
        [id, instructor, body.title ?? row.title, body.summary ?? row.summary, goal.p95Ms, goal.errorRate, JSON.stringify(traffic), JSON.stringify(graph), structural],
      )) as Row[];
      return this.dto(this.one(updated));
    });
  }

  private fail(e: unknown): never {
    if (e instanceof AppException) throw e;
    // A graph the model's own schema rejects is an invalid starting design, not a temporary failure.
    if (e instanceof ZodError) throw new AppException("VALIDATION_FAILED", "The starting design has problems and cannot be tested", { reason: "STARTING_DESIGN_INVALID" });
    if (e instanceof ExecutionError && e.code === "COMPLEXITY_LIMIT")
      throw new AppException("VALIDATION_FAILED", "The starting design is too complex to test", { reason: "STARTING_DESIGN_TOO_COMPLEX" });
    throw new AppException("UNAVAILABLE", "The starting design could not be tested right now. Please try again.");
  }

  /** Runs the model on the frozen starting design at the challenge's traffic and compares it with the goal, inclusive. */
  private async measure(instructor: string, row: Row) {
    const goal = { p95Ms: row.p95Ms, errorRate: row.errorRate };
    let result;
    try {
      result = await this.simulation.executor.submit(instructor, {
        kind: "simulation",
        snapshot: { schemaVersion: SCHEMA_VERSION, graph: row.graph as never, traffic: fullTraffic(row.traffic, goal) },
      });
    } catch (e) {
      this.fail(e);
    }
    if (!result.output || result.output.kind !== "simulation")
      throw new AppException("VALIDATION_FAILED", "The starting design has problems and cannot be tested", { reason: "STARTING_DESIGN_INVALID" });
    const s = result.output.summary;
    return challengeBaselineSchema.parse({ p95: s.p95, errorRate: s.errorRate, passes: s.p95 <= goal.p95Ms && s.errorRate <= goal.errorRate, engineVersion: result.engineVersion });
  }

  /** Idempotent. The measurement happens outside the lock, and publishing is refused if the draft changed meanwhile. */
  async publish(instructor: string, id: string) {
    const row = await this.mine(this.db.manager, instructor, id);
    if (row.status === "published") return this.dto(row);
    if (row.status === "archived") throw new AppException("CONFLICT", "An archived challenge cannot be published", { reason: "ARCHIVED" });
    const baseline = await this.measure(instructor, row);
    return this.db.transaction(async (m) => {
      const fresh = await this.mine(m, instructor, id, true);
      if (fresh.status === "published") return this.dto(fresh);
      if (fresh.status === "archived") throw new AppException("CONFLICT", "An archived challenge cannot be published", { reason: "ARCHIVED" });
      if (fresh.updatedAt.getTime() !== row.updatedAt.getTime()) throw new AppException("CONFLICT", "The challenge changed while it was being checked. Try again.", { reason: "CHANGED_DURING_PUBLISH" });
      const rows = (await m.query(
        `UPDATE challenges SET status = 'published', baseline = $3, published_at = now(), updated_at = now() WHERE id = $1 AND instructor_id = $2 RETURNING ${COLUMNS}`,
        [id, instructor, JSON.stringify(baseline)],
      )) as Row[];
      return this.dto(this.one(rows));
    });
  }

  /** Idempotent. Existing submissions are kept; the challenge just leaves the public list. */
  async archive(instructor: string, id: string) {
    return this.db.transaction(async (m) => {
      const row = await this.mine(m, instructor, id, true);
      if (row.status === "archived") return this.dto(row);
      const rows = (await m.query(`UPDATE challenges SET status = 'archived', archived_at = now(), updated_at = now() WHERE id = $1 AND instructor_id = $2 RETURNING ${COLUMNS}`, [id, instructor])) as Row[];
      return this.dto(this.one(rows));
    });
  }

  /** A new draft with the same goal, traffic and starting design, so a frozen challenge can be improved. */
  async duplicate(instructor: string, id: string) {
    return this.db.transaction(async (m) => {
      await this.assertRoom(m, instructor);
      const row = await this.mine(m, instructor, id, true);
      const rows = (await m.query(
        `INSERT INTO challenges(instructor_id, title, summary, goal_p95_ms, goal_error_rate, traffic, starting_graph, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', now(), now()) RETURNING ${COLUMNS}`,
        [instructor, `${row.title} (copy)`.slice(0, CHALLENGE_TITLE_MAX), row.summary, row.p95Ms, row.errorRate, JSON.stringify(row.traffic), JSON.stringify(row.graph)],
      )) as Row[];
      return this.dto(this.one(rows));
    });
  }
}
