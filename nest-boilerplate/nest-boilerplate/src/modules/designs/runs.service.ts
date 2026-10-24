import {
  Injectable,
  OnApplicationBootstrap,
  OnModuleDestroy,
  Logger,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DataSource } from "typeorm";
import { AppException } from "@/common/errors";
import { runSchema, DesignRun } from "@/common/contracts/phase2/api.schema";
import {
  snapshotSchema,
  MODEL_VERSION,
} from "@/common/contracts/phase2/graph.schema";
import { inputFingerprint } from "@/common/contracts/phase2/fingerprint";
import { DesignsService } from "@/modules/designs/designs.service";
import { RunRequestDto } from "@/modules/designs/designs.dto";
import { SavedRun } from "@/modules/designs/entities/design-run.entity";
import { SimulationService } from "@/modules/simulation/simulation.service";
import { Reservation } from "@/modules/simulation/worker/simulation-executor";
import { ExecutionError } from "@/modules/simulation/worker/executor-error";
import type { ComputeResult } from "@/modules/simulation/engine/compute";
type Kind = "simulation" | "limits";
type Acceptance = { run: DesignRun; statusUrl: string };
@Injectable()
export class RunsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(RunsService.name);
  private readonly submitting = new Map<
    string,
    { kind: Kind; revision: number; promise: Promise<Acceptance> }
  >();
  private readonly active = new Map<
    string,
    { designId: string; reservation: Reservation }
  >();
  private timer?: NodeJS.Timeout;
  constructor(
    private readonly db: DataSource,
    private readonly designs: DesignsService,
    private readonly simulation: SimulationService,
  ) {}
  async onApplicationBootstrap() {
    // This phase supports one API instance. No other instance may own these pending rows.
    await this.reconcile(true);
    this.timer = setInterval(() => {
      void this.reconcile(false).catch(() =>
        this.logger.warn("Run recovery deferred: database unavailable"),
      );
    }, 15000);
    this.timer.unref();
  }
  onModuleDestroy() {
    clearInterval(this.timer);
    for (const { reservation } of this.active.values()) reservation.release();
  }
  private accepted(run: DesignRun): Acceptance {
    return {
      run,
      statusUrl: "/v1/designs/" + run.designId + "/runs/" + run.id,
    };
  }
  private match(run: DesignRun, kind: Kind, request: RunRequestDto) {
    if (run.kind !== kind || run.designRevision !== request.expectedRevision)
      throw new AppException(
        "CONFLICT",
        "Request id was already used for different inputs",
        { reason: "REQUEST_ID_REUSED" },
      );
    return this.accepted(run);
  }
  async submit(
    owner: string,
    designId: string,
    kind: Kind,
    request: RunRequestDto,
  ) {
    await this.designs.owned(owner, designId);
    const key = designId + ":" + request.requestId;
    const pending = this.submitting.get(key);
    if (pending) {
      if (
        pending.kind !== kind ||
        pending.revision !== request.expectedRevision
      )
        throw new AppException(
          "CONFLICT",
          "Request id was already used for different inputs",
          { reason: "REQUEST_ID_REUSED" },
        );
      return pending.promise;
    }
    if (this.submitting.size >= 128)
      throw new AppException(
        "RATE_LIMITED",
        "Too many submissions; retry with the same request id",
      );
    const promise = this.admit(owner, designId, kind, request);
    this.submitting.set(key, {
      kind,
      revision: request.expectedRevision,
      promise,
    });
    try {
      return await promise;
    } finally {
      this.submitting.delete(key);
    }
  }
  private async admit(
    owner: string,
    designId: string,
    kind: Kind,
    request: RunRequestDto,
  ): Promise<Acceptance> {
    const repo = this.db.getRepository(SavedRun);
    const existing = await repo.findOneBy({
      designId,
      requestId: request.requestId,
    });
    if (existing) return this.match(existing.payload, kind, request);
    const pendingForOwner = await repo
      .createQueryBuilder("r")
      .innerJoin("designs", "d", "d.id=r.design_id")
      .where("d.owner_id=:owner AND r.status=:status", {
        owner,
        status: "pending",
      })
      .getExists();
    if (pendingForOwner)
      throw new AppException(
        "RATE_LIMITED",
        "An accepted calculation is still pending for this account",
      );
    const d = await this.designs.owned(owner, designId);
    this.designs.revision(d, request.expectedRevision);
    const snapshot = snapshotSchema.parse({
      schemaVersion: d.schemaVersion,
      graph: d.graph,
      traffic: d.traffic,
    });
    const validation = this.simulation.validate(snapshot);
    if (!validation.ok)
      throw new AppException(
        "VALIDATION_FAILED",
        "Fix the graph before running",
        { validation },
      );
    let reservation: Reservation;
    try {
      reservation = this.simulation.executor.reserve(owner, "durable");
    } catch (error) {
      const winner = await repo.findOneBy({
        designId,
        requestId: request.requestId,
      });
      if (winner) return this.match(winner.payload, kind, request);
      throw new AppException(
        error instanceof ExecutionError && error.code === "RATE_LIMITED"
          ? "RATE_LIMITED"
          : "UNAVAILABLE",
        "Calculation capacity is unavailable. Retry with the same request id.",
      );
    }
    try {
      const run = await this.db.transaction(async (m) => {
        const current = await this.designs.owned(owner, designId, m, true);
        const winner = await m.findOneBy(SavedRun, {
          designId,
          requestId: request.requestId,
        });
        if (winner)
          return {
            inserted: false,
            run: this.match(winner.payload, kind, request).run,
          };
        this.designs.revision(current, request.expectedRevision);
        if (Date.now() >= reservation.expiresAt)
          throw new AppException(
            "UNAVAILABLE",
            "Calculation admission expired; retry with the same request id",
          );
        const payload = runSchema.parse({
          id: randomUUID(),
          designId,
          requestId: request.requestId,
          designRevision: d.revision,
          fingerprint: inputFingerprint(snapshot),
          engineVersion: MODEL_VERSION,
          kind,
          snapshot,
          createdAt: new Date().toISOString(),
          status: "pending",
          completedAt: null,
          result: null,
          failure: null,
        });
        await m.insert(SavedRun, {
          id: payload.id,
          designId,
          requestId: request.requestId,
          status: "pending",
          createdAt: new Date(payload.createdAt),
          completedAt: null,
          payload,
        });
        return { inserted: true, run: payload };
      });
      if (!run.inserted) {
        reservation.release();
        return this.accepted(run.run);
      }
      this.active.set(run.run.id, { designId, reservation });
      // Observe before starting: deadline expiry or synchronous start failure must finalize the committed record.
      void reservation.result
        .then(
          (result) => this.finish(run.run, result),
          (error) => this.finish(run.run, undefined, error),
        )
        .catch(() => this.logger.warn("Run finalization deferred to recovery"))
        .finally(() => {
          this.active.delete(run.run.id);
          reservation.release();
        });
      try {
        reservation.start({ kind, snapshot });
      } catch {
        reservation.release();
      }
      return this.accepted(run.run);
    } catch (error) {
      reservation.release();
      throw error;
    }
  }
  private async finish(
    run: DesignRun,
    result?: ComputeResult,
    error?: unknown,
  ) {
    let payload: DesignRun;
    const completedAt = new Date().toISOString();
    if (result?.output)
      payload = runSchema.parse({
        ...run,
        status: "completed",
        completedAt,
        result: result.output,
        failure: null,
      });
    else {
      const code =
        error instanceof ExecutionError &&
        ["TIMEOUT", "WORKER_CRASH", "COMPLEXITY_LIMIT"].includes(error.code)
          ? error.code
          : "COMPUTE_FAILED";
      payload = runSchema.parse({
        ...run,
        status: "failed",
        completedAt,
        result: null,
        failure: {
          code,
          message:
            code === "COMPLEXITY_LIMIT"
              ? "Simplify branching paths and run again."
              : "Calculation did not finish. Start a new run to retry.",
        },
      });
    }
    await this.db
      .getRepository(SavedRun)
      .update(
        { id: run.id, status: "pending" },
        { status: payload.status, completedAt: new Date(completedAt), payload },
      );
    await this.prune(run.designId);
  }
  async get(owner: string, designId: string, runId: string) {
    await this.designs.owned(owner, designId);
    const r = await this.db
      .getRepository(SavedRun)
      .findOneBy({ id: runId, designId });
    if (!r) throw new AppException("NOT_FOUND", "Run not found");
    return runSchema.parse(r.payload);
  }
  cancelDesign(designId: string) {
    for (const slot of this.active.values())
      if (slot.designId === designId) slot.reservation.release();
  }
  async prune(designId?: string) {
    // Protect ALL request keys for 24h, then retain the latest 50 terminal records/design.
    await this.db.query(
      `DELETE FROM design_runs WHERE id IN (
      SELECT id FROM (SELECT id, created_at, row_number() OVER(PARTITION BY design_id ORDER BY created_at DESC,id DESC) AS position
      FROM design_runs WHERE status <> 'pending' AND ($1::uuid IS NULL OR design_id=$1)) r
      WHERE position>50 AND created_at < now()-interval '24 hours')`,
      [designId ?? null],
    );
  }
  async reconcile(startup: boolean) {
    const pending = await this.db
      .getRepository(SavedRun)
      .findBy({ status: "pending" });
    for (const row of pending) {
      if (
        !startup &&
        (this.active.has(row.id) ||
          Date.now() - row.createdAt.getTime() < 30000)
      )
        continue;
      const payload = runSchema.parse({
        ...row.payload,
        status: "failed",
        completedAt: new Date().toISOString(),
        result: null,
        failure: {
          code: "INTERRUPTED",
          message:
            "The server interrupted this calculation. Start a new run to retry.",
        },
      });
      await this.db.getRepository(SavedRun).update(
        { id: row.id, status: "pending" },
        {
          status: "failed",
          completedAt: new Date(payload.completedAt!),
          payload,
        },
      );
    }
    await this.prune();
  }
}
