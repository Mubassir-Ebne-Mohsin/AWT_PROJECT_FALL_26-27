import { Injectable } from "@nestjs/common";
import { DataSource, EntityManager } from "typeorm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AppException } from "@/common/errors";
import {
  CreateRegionDto,
  PatchRegionDto,
  RunRegionDto,
  DuplicateRegionDto,
} from "@/modules/region-lab/region.dto";
import {
  frozenSnapshot,
  resolveScenario,
  profiles,
  parseCursor,
  cursor,
  REGION_POLICY,
  type FrozenRegionSnapshot,
} from "@/modules/region-lab/region-policy";
type RunRow = {
  id: string;
  owner_id: string;
  experiment_id: string;
  experiment_revision: number;
  request_id: string;
  input_hash: string;
  engine_version: string;
  snapshot: FrozenRegionSnapshot;
  status: string;
  result: unknown;
  failure: unknown;
  lease_token: string | null;
  lease_expires_at: Date | null;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
};
export type ClaimedRegionRun = RunRow & { lease_token: string };
async function sql(
  connection: { query: (text: string, values?: any[]) => Promise<any> },
  text: string,
  values?: any[],
): Promise<any[]> {
  const result = await connection.query(text, values);
  return Array.isArray(result) &&
    result.length === 2 &&
    Array.isArray(result[0]) &&
    typeof result[1] === "number"
    ? result[0]
    : result;
}
const absent = () =>
  new AppException("NOT_FOUND", "Region Lab record not found");
const conflict = (reason: string) =>
  new AppException("CONFLICT", "Region Lab revision or lifecycle changed", {
    reason,
  });
@Injectable()
export class RegionStore {
  constructor(readonly db: DataSource) {}
  async active(
    owner: string,
    m: EntityManager = this.db.manager,
    lock = false,
  ) {
    const [u] = await sql(
      m,
      `SELECT id FROM users WHERE id=$1 AND account_status='active' ${lock ? "FOR SHARE" : ""}`,
      [owner],
    );
    if (!u) throw new AppException("UNAUTHENTICATED", "Account is not active");
  }
  private async locked<T>(owner: string, fn: (m: EntityManager) => Promise<T>) {
    return this.db.transaction(async (m) => {
      await sql(
        m,
        "SELECT pg_advisory_xact_lock(hashtext('sf-region-lab-admission'))",
      );
      await this.active(owner, m, true);
      return fn(m);
    });
  }
  private async owned(
    owner: string,
    id: string,
    m: EntityManager = this.db.manager,
  ) {
    const [r] = await sql(
      m,
      "SELECT * FROM region_lab_experiments WHERE id=$1 AND owner_id=$2",
      [id, owner],
    );
    if (!r) throw absent();
    return r;
  }
  private revision(current: number, wanted: number) {
    if (current !== wanted) throw conflict("REVISION_MISMATCH");
  }
  private async version(m: EntityManager, id: string, revision: number) {
    const [v] = await sql(
      m,
      "SELECT * FROM region_lab_versions WHERE experiment_id=$1 AND revision=$2",
      [id, revision],
    );
    if (!v) throw absent();
    return v;
  }
  private async source(
    m: EntityManager,
    owner: string,
    source: CreateRegionDto["sourceDesign"],
  ) {
    if (source) {
      const [s] = await sql(
        m,
        "SELECT v.id FROM design_versions v JOIN designs d ON d.id=v.design_id WHERE d.id=$1 AND d.owner_id=$2 AND v.revision=$3",
        [source.id, owner, source.revision],
      );
      if (!s) throw absent();
    }
  }
  private async insert(
    m: EntityManager,
    owner: string,
    name: string,
    description: string,
    snapshot: FrozenRegionSnapshot,
    sourceDesign: unknown,
  ) {
    const [{ count }] = await sql(
      m,
      "SELECT count(*)::int AS count FROM region_lab_experiments WHERE owner_id=$1",
      [owner],
    );
    if (count >= REGION_POLICY.maxExperiments)
      throw new AppException(
        "RATE_LIMITED",
        "Region Lab experiment limit reached",
      );
    const [e] = await sql(
      m,
      "INSERT INTO region_lab_experiments(owner_id,name,description) VALUES($1,$2,$3) RETURNING *",
      [owner, name, description],
    );
    await sql(
      m,
      "INSERT INTO region_lab_versions(experiment_id,revision,snapshot,input_hash) VALUES($1,1,$2,$3)",
      [
        e.id,
        { ...snapshot, name, description, sourceDesign: sourceDesign ?? null },
        snapshot.inputHash,
      ],
    );
    return this.view(e, { ...snapshot, sourceDesign: sourceDesign ?? null });
  }
  private view(e: any, s: any) {
    return {
      id: e.id,
      name: e.name,
      description: e.description,
      revision: e.revision,
      createdAt: e.created_at.toISOString(),
      updatedAt: e.updated_at.toISOString(),
      scenario: s.scenario,
      sourceDesign: s.sourceDesign ?? null,
      engineVersion: s.engineVersion,
      calibration: "uncalibrated",
    };
  }
  async create(owner: string, dto: CreateRegionDto) {
    const snapshot = frozenSnapshot(dto.scenario);
    return this.locked(owner, async (m) => {
      await this.source(m, owner, dto.sourceDesign);
      return this.insert(
        m,
        owner,
        dto.name,
        dto.description,
        snapshot,
        dto.sourceDesign,
      );
    });
  }
  async get(owner: string, id: string) {
    await this.active(owner);
    const e = await this.owned(owner, id);
    const v = await this.version(this.db.manager, id, e.revision);
    return this.view(e, v.snapshot);
  }
  async list(owner: string, raw: unknown) {
    await this.active(owner);
    const q = this.query(
      z.strictObject({
        limit: z.coerce.number().int().min(1).max(20).default(20),
        cursor: z.string().max(512).optional(),
      }),
      raw,
    );
    const after = parseCursor(q.cursor, owner, "experiments");
    const rows = await sql(
      this.db,
      `SELECT e.*,to_char(e.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at,v.snapshot->>'engineVersion' AS engine_version FROM region_lab_experiments e JOIN region_lab_versions v ON v.experiment_id=e.id AND v.revision=e.revision WHERE owner_id=$1 ${after ? "AND (e.created_at,e.id)<($3::timestamptz,$4::uuid)" : ""} ORDER BY e.created_at DESC,e.id DESC LIMIT $2`,
      after ? [owner, q.limit + 1, after.at, after.id] : [owner, q.limit + 1],
    );
    const items = rows
      .slice(0, q.limit)
      .map((e: any) => ({
        id: e.id,
        name: e.name,
        description: e.description,
        revision: e.revision,
        createdAt: e.created_at.toISOString(),
        updatedAt: e.updated_at.toISOString(),
        engineVersion: e.engine_version,
        calibration: "uncalibrated",
      }));
    return {
      items,
      nextCursor:
        rows.length > q.limit
          ? cursor(owner, "experiments", rows[q.limit - 1])
          : null,
    };
  }
  async patch(owner: string, id: string, dto: PatchRegionDto) {
    return this.locked(owner, async (m) => {
      const e = await this.owned(owner, id, m);
      this.revision(e.revision, dto.expectedRevision);
      if (e.revision >= REGION_POLICY.maxVersions)
        throw new AppException(
          "RATE_LIMITED",
          "Region Lab version limit reached",
        );
      const v = await this.version(m, id, e.revision),
        snapshot = frozenSnapshot(dto.scenario ?? v.snapshot.scenario);
      const name = dto.name ?? e.name,
        description = dto.description ?? e.description;
      const [updated] = await sql(
        m,
        "UPDATE region_lab_experiments SET revision=revision+1,name=$2,description=$3,updated_at=now() WHERE id=$1 RETURNING *",
        [id, name, description],
      );
      await sql(
        m,
        "INSERT INTO region_lab_versions(experiment_id,revision,snapshot,input_hash) VALUES($1,$2,$3,$4)",
        [
          id,
          updated.revision,
          {
            ...snapshot,
            name,
            description,
            sourceDesign: v.snapshot.sourceDesign ?? null,
          },
          snapshot.inputHash,
        ],
      );
      return this.view(updated, {
        ...snapshot,
        sourceDesign: v.snapshot.sourceDesign ?? null,
      });
    });
  }
  async duplicate(owner: string, id: string, dto: DuplicateRegionDto) {
    return this.locked(owner, async (m) => {
      const e = await this.owned(owner, id, m);
      this.revision(e.revision, dto.expectedRevision);
      const v = await this.version(m, id, e.revision);
      return this.insert(
        m,
        owner,
        dto.name,
        e.description,
        frozenSnapshot(v.snapshot.scenario),
        v.snapshot.sourceDesign,
      );
    });
  }
  async versions(owner: string, id: string, raw: unknown) {
    await this.active(owner);
    await this.owned(owner, id);
    const q = this.query(
      z.strictObject({
        beforeRevision: z.coerce.number().int().positive().optional(),
        limit: z.coerce.number().int().min(1).max(20).default(20),
      }),
      raw,
    );
    const rows = await sql(
      this.db,
      "SELECT revision,snapshot,input_hash,created_at FROM region_lab_versions WHERE experiment_id=$1 AND revision<$2 ORDER BY revision DESC LIMIT $3",
      [id, q.beforeRevision ?? 2147483647, q.limit + 1],
    );
    return {
      items: rows
        .slice(0, q.limit)
        .map((r: any) => ({
          revision: r.revision,
          scenario: r.snapshot.scenario,
          name: r.snapshot.name,
          description: r.snapshot.description,
          inputHash: r.input_hash,
          createdAt: r.created_at.toISOString(),
        })),
      nextCursor:
        rows.length > q.limit ? String(rows[q.limit - 1].revision) : null,
    };
  }
  private async remember(m: EntityManager, experiment: string) {
    await sql(
      m,
      "UPDATE region_lab_requests q SET last_status=r.status FROM region_lab_runs r WHERE q.current_run_id=r.id AND r.experiment_id=$1",
      [experiment],
    );
  }
  async remove(owner: string, id: string, revision: number) {
    await this.locked(owner, async (m) => {
      const e = await this.owned(owner, id, m);
      this.revision(e.revision, revision);
      const [{ busy }] = await sql(
        m,
        "SELECT count(*)::int AS busy FROM region_lab_runs WHERE experiment_id=$1 AND status IN ('queued','running')",
        [id],
      );
      if (busy) throw conflict("ACTIVE_RUN");
      await this.remember(m, id);
      await sql(
        m,
        "DELETE FROM region_lab_experiments WHERE id=$1 AND owner_id=$2",
        [id, owner],
      );
    });
  }
  async catalog(owner: string, raw: unknown) {
    await this.active(owner);
    const q = this.query(
      z.strictObject({
        component: z.string().max(20).optional(),
        limit: z.coerce.number().int().min(1).max(36).default(36),
      }),
      raw,
    );
    const all = profiles();
    if (q.component && !all.some((p) => p.component === q.component))
      throw new AppException(
        "VALIDATION_FAILED",
        "Unknown reference component",
      );
    return {
      items: all
        .filter((p) => !q.component || p.component === q.component)
        .slice(0, q.limit),
      nextCursor: null,
      calibration: "uncalibrated",
    };
  }
  async validate(owner: string, raw: unknown) {
    await this.active(owner);
    const s = resolveScenario(raw);
    return {
      valid: true,
      inputHash: s.inputHash,
      estimatedEvents: s.estimatedEvents,
      calibration: "uncalibrated",
      engineCapabilities: [
        "regional-network",
        "observed-routing",
        "application-outage",
        "bounded-retries",
      ],
      issues: [],
    };
  }
  query<T>(schema: z.ZodType<T>, raw: unknown): T {
    const q = schema.safeParse(raw);
    if (!q.success)
      throw new AppException("VALIDATION_FAILED", "Invalid Region Lab query");
    return q.data;
  }
  runView(r: RunRow) {
    return {
      id: r.id,
      experimentId: r.experiment_id,
      experimentRevision: r.experiment_revision,
      experimentName:r.snapshot.metadata?.name??null,
      inputHash: r.input_hash,
      engineVersion: r.engine_version,
      status: r.status,
      progressRatio: r.status === "completed" ? 1 : 0,
      repetitions:r.snapshot.scenario.runOptions.repetitions,
      availableSides:r.snapshot.scenario.runOptions.mode==="paired"?["baseline","outage"]:[r.snapshot.scenario.runOptions.mode],
      createdAt: r.created_at.toISOString(),
      ...(r.started_at ? { startedAt: r.started_at.toISOString() } : {}),
      ...(r.finished_at ? { completedAt: r.finished_at.toISOString() } : {}),
      ...(r.failure ? { failure: r.failure } : {}),
      retained: true,
      calibration: "uncalibrated",
    };
  }
  async getRun(owner: string, id: string) {
    await this.active(owner);
    const [r] = await sql(
      this.db,
      "SELECT * FROM region_lab_runs WHERE id=$1 AND owner_id=$2",
      [id, owner],
    );
    if (!r) throw absent();
    return this.runView(r);
  }
  async submit(owner: string, id: string, dto: RunRegionDto) {
    return this.locked(owner, async (m) => {
      const [old] = await sql(
        m,
        "SELECT * FROM region_lab_requests WHERE owner_id=$1 AND request_id=$2",
        [owner, dto.requestId],
      );
      if (old) {
        if (
          old.experiment_id !== id ||
          old.experiment_revision !== dto.expectedRevision
        )
          throw conflict("REQUEST_ID_REUSED");
        const [r] = old.current_run_id
          ? await sql(
              m,
              "SELECT * FROM region_lab_runs WHERE id=$1 AND owner_id=$2",
              [old.current_run_id, owner],
            )
          : [];
        return {
          replayed: true,
          run: r
            ? this.runView(r)
            : {
                id: old.original_run_id,
                experimentId: id,
                experimentRevision: old.experiment_revision,
                inputHash: old.input_hash,
                status: old.last_status,
                retained: false,
                resultExpired: true,
              },
          statusUrl: "/v1/region-lab/runs/" + old.original_run_id,
        };
      }
      const e = await this.owned(owner, id, m);
      this.revision(e.revision, dto.expectedRevision);
      const v = await this.version(m, id, e.revision);
      const snapshot = {...frozenSnapshot(v.snapshot.scenario),metadata:{name:e.name,description:e.description,sourceDesign:v.snapshot.sourceDesign??null}};
      const [{ queued }] = await sql(
        m,
        "SELECT count(*)::int AS queued FROM region_lab_runs WHERE owner_id=$1 AND status='queued'",
        [owner],
      );
      const [{ global }] = await sql(
        m,
        "SELECT count(*)::int AS global FROM region_lab_runs WHERE status='queued'",
      );
      if (
        queued >= REGION_POLICY.ownerQueued ||
        global >= REGION_POLICY.globalQueued
      )
        throw new AppException("RATE_LIMITED", "Region Lab queue is full", {
          reason: "REGION_QUEUE_FULL",
        });
      const [{ count }] = await sql(
        m,
        "SELECT count(*)::int AS count FROM region_lab_runs WHERE experiment_id=$1",
        [id],
      );
      if (count >= REGION_POLICY.maxRuns) {
        await this.remember(m, id);
        const pruned = await sql(
          m,
          "DELETE FROM region_lab_runs WHERE id=(SELECT id FROM region_lab_runs WHERE experiment_id=$1 AND status IN ('completed','failed','cancelled') ORDER BY created_at,id LIMIT 1) RETURNING id",
          [id],
        );
        if (!pruned.length)
          throw new AppException("RATE_LIMITED", "Retained run limit reached");
      }
      const [r] = await sql(
        m,
        "INSERT INTO region_lab_runs(owner_id,experiment_id,experiment_revision,request_id,input_hash,engine_version,snapshot) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
        [
          owner,
          id,
          e.revision,
          dto.requestId,
          snapshot.inputHash,
          snapshot.engineVersion,
          snapshot,
        ],
      );
      await sql(
        m,
        "INSERT INTO region_lab_requests(owner_id,request_id,experiment_id,experiment_revision,input_hash,original_run_id,current_run_id) VALUES($1,$2,$3,$4,$5,$6,$6)",
        [owner, dto.requestId, id, e.revision, snapshot.inputHash, r.id],
      );
      return {
        replayed: false,
        run: this.runView(r),
        statusUrl: "/v1/region-lab/runs/" + r.id,
      };
    });
  }
  async cancel(owner: string, id: string) {
    return this.locked(owner, async (m) => {
      const [r] = await sql(
        m,
        "SELECT * FROM region_lab_runs WHERE id=$1 AND owner_id=$2",
        [id, owner],
      );
      if (!r) throw absent();
      if (!["queued", "running"].includes(r.status)) return this.runView(r);
      const [updated] = await sql(
        m,
        "UPDATE region_lab_runs SET status='cancelled',finished_at=now(),lease_token=NULL,lease_expires_at=NULL,worker_instance=NULL WHERE id=$1 AND status IN ('queued','running') RETURNING *",
        [id],
      );
      await sql(
        m,
        "UPDATE region_lab_requests SET last_status='cancelled' WHERE current_run_id=$1",
        [id],
      );
      return this.runView(updated);
    });
  }
  async claim(instance: string): Promise<ClaimedRegionRun | null> {
    return this.db.transaction(async (m) => {
      await sql(
        m,
        "SELECT pg_advisory_xact_lock(hashtext('sf-region-lab-admission'))",
      );
      const [slot] = await sql(
        m,
        "SELECT *,lease_expires_at>clock_timestamp() AS live FROM region_lab_execution_slot WHERE id=1 FOR UPDATE",
      );
      if (slot.run_id) {
        if (slot.live) return null;
        await sql(
          m,
          "UPDATE region_lab_runs SET status='failed',failure=$2,finished_at=now(),lease_token=NULL,lease_expires_at=NULL,worker_instance=NULL WHERE id=$1 AND status='running' AND lease_token=$3",
          [
            slot.run_id,
            {
              code: "WORKER_INTERRUPTED",
              message: "Execution lease expired; submit a new request to retry",
            },
            slot.lease_token,
          ],
        );
        await sql(
          m,
          "UPDATE region_lab_requests q SET last_status=r.status FROM region_lab_runs r WHERE q.current_run_id=r.id AND r.id=$1",
          [slot.run_id],
        );
        await sql(
          m,
          "UPDATE region_lab_execution_slot SET run_id=NULL,lease_token=NULL,lease_expires_at=NULL WHERE id=1",
        );
      }
      const [next] = await sql(
        m,
        "SELECT r.id,r.owner_id FROM region_lab_runs r JOIN users u ON u.id=r.owner_id WHERE r.status='queued' AND u.account_status='active' ORDER BY r.created_at,r.id LIMIT 1",
      );
      if (!next) return null;
      await this.active(next.owner_id, m, true);
      const token = randomUUID();
      const [r] = await sql(
        m,
        "UPDATE region_lab_runs SET status='running',started_at=now(),lease_token=$2,lease_expires_at=now()+interval '60 seconds',worker_instance=$3 WHERE id=$1 AND status='queued' RETURNING *",
        [next.id, token, instance],
      );
      if (!r) return null;
      await sql(
        m,
        "UPDATE region_lab_execution_slot SET run_id=$1,lease_token=$2,lease_expires_at=now()+interval '60 seconds' WHERE id=1",
        [r.id, token],
      );
      return r;
    });
  }
  async canContinue(id: string, token: string) {
    const [r] = await sql(
      this.db,
      "SELECT r.status,r.lease_token,u.account_status,r.lease_expires_at>clock_timestamp() AS lease_live FROM region_lab_runs r JOIN users u ON u.id=r.owner_id WHERE r.id=$1",
      [id],
    );
    return (
      !!r &&
      r.status === "running" &&
      r.lease_token === token &&
      r.account_status === "active" &&
      r.lease_live
    );
  }
  async finish(
    id: string,
    token: string,
    outcome: {
      result?: unknown;
      failure?: { code: string; message: string };
      cancelled?: boolean;
    },
  ) {
    return this.db.transaction(async (m) => {
      await sql(
        m,
        "SELECT pg_advisory_xact_lock(hashtext('sf-region-lab-admission'))",
      );
      const expired = () =>
        sql(
          m,
          "UPDATE region_lab_runs SET status='failed',failure=$3,finished_at=now(),lease_token=NULL,lease_expires_at=NULL,worker_instance=NULL WHERE id=$1 AND status='running' AND lease_token=$2 AND lease_expires_at<=clock_timestamp() RETURNING id",
          [
            id,
            token,
            {
              code: "WORKER_INTERRUPTED",
              message: "Execution lease expired; submit a new request to retry",
            },
          ],
        );
      const lost = await expired();
      const status = outcome.cancelled
        ? "cancelled"
        : outcome.failure
          ? "failed"
          : "completed";
      const rows = await sql(
        m,
        `UPDATE region_lab_runs SET status=$3,result=$4,failure=$5,finished_at=now(),lease_token=NULL,lease_expires_at=NULL,worker_instance=NULL WHERE id=$1 AND status='running' AND lease_token=$2 AND lease_expires_at>clock_timestamp() ${status === "completed" ? "AND EXISTS(SELECT 1 FROM users WHERE id=owner_id AND account_status='active')" : ""} RETURNING id`,
        [id, token, status, outcome.result ?? null, outcome.failure ?? null],
      );
      if (!rows.length) await expired();
      if (!rows.length)
        await sql(
          m,
          "UPDATE region_lab_runs SET status='cancelled',finished_at=now(),lease_token=NULL,lease_expires_at=NULL,worker_instance=NULL WHERE id=$1 AND status='running' AND lease_token=$2 AND NOT EXISTS(SELECT 1 FROM users WHERE id=owner_id AND account_status='active')",
          [id, token],
        );
      await sql(
        m,
        "UPDATE region_lab_requests q SET last_status=r.status FROM region_lab_runs r WHERE q.current_run_id=r.id AND r.id=$1",
        [id],
      );
      await sql(
        m,
        "UPDATE region_lab_execution_slot SET run_id=NULL,lease_token=NULL,lease_expires_at=NULL WHERE id=1 AND run_id=$1 AND lease_token=$2",
        [id, token],
      );
      return !lost.length && rows.length === 1;
    });
  }
}
