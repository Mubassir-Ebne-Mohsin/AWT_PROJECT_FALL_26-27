import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from "@nestjs/common";
import { DataSource, QueryRunner } from "typeorm";
import { randomUUID } from "node:crypto";
import { AppException } from "@/common/errors";
import {
  aiEvidenceSchema,
  aiFactsSchema,
  aiJobSchema,
  AiFacts,
  AiJob,
  AiRequest,
  AI_PROMPT_VERSION,
  AI_SCHEMA_VERSION,
  LEGACY_AI_PROMPT_VERSION,
} from "@/common/contracts/phase3/ai.schema";
import { inputFingerprint } from "@/common/contracts/phase2/fingerprint";
import { DesignsService } from "@/modules/designs/designs.service";
import { SavedRun } from "@/modules/designs/entities/design-run.entity";
import { DesignVersion } from "@/modules/designs/entities/design-version.entity";
import { AiJobRecord } from "@/modules/ai/entities/ai-job.entity";
import {
  OllamaProvider,
  FOUNDATION_PROMPT,
} from "@/modules/ai/ollama.provider";
import { AiMemory } from "@/modules/ai/ai-memory";
import { AI_SETTINGS, AiSettings } from "@/modules/ai/ai.settings";
import {
  EXPLANATION_LIMITATIONS,
  LEGACY_LIMITATIONS,
  evidenceIdsFor,
  groundingViolation,
} from "@/modules/ai/grounding";
type Failure = NonNullable<AiJob["failure"]>["reason"];
type Active = {
  id: string;
  controller: AbortController;
  reason?: Failure;
  settled: boolean;
  promise?: Promise<void>;
};
@Injectable()
export class AiService implements OnApplicationBootstrap, OnModuleDestroy {
  private lease?: QueryRunner;
  private instanceReady = false;
  private admitting = false;
  private active?: Active;
  private timer?: NodeJS.Timeout;
  constructor(
    private readonly db: DataSource,
    private readonly designs: DesignsService,
    private readonly provider: OllamaProvider,
    private readonly memory: AiMemory,
    @Inject(AI_SETTINGS) private readonly settings: AiSettings,
  ) {}
  async onApplicationBootstrap() {
    if (!this.settings.enabled) return;
    const lease = this.db.createQueryRunner();
    try {
      await lease.connect();
      const [state] = await lease.query(
        "SELECT pg_try_advisory_lock(97311) AS acquired",
      );
      if (!state.acquired) {
        await lease.release();
        return;
      }
      this.lease = lease;
      await this.db.query(
        `UPDATE ai_jobs SET status='interrupted', payload=jsonb_set(jsonb_set(jsonb_set(jsonb_set(payload,'{status}','"interrupted"'),'{completedAt}',to_jsonb(to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))),'{result}','null'),'{failure}','{"reason":"INTERRUPTED","message":"API restarted; explicitly submit a new request."}') WHERE status='pending'`,
      );
      this.instanceReady = true;
      this.timer = setInterval(() => {
        void this.reconcile().catch(() => undefined);
      }, 5000);
      this.timer.unref();
    } catch {
      // Optional AI failure must never prevent the core API from starting.
      if (this.lease) await this.releaseLease();
      else await lease.release().catch(() => undefined);
    }
  }
  private async releaseLease() {
    const lease = this.lease;
    this.lease = undefined;
    this.instanceReady = false;
    if (!lease) return;
    try {
      await lease.query("SELECT pg_advisory_unlock(97311)");
    } finally {
      await lease.release();
    }
  }
  async onModuleDestroy() {
    clearInterval(this.timer);
    if (this.active) {
      this.active.reason = "INTERRUPTED";
      this.active.controller.abort();
      await this.active.promise;
    }
    await this.releaseLease();
  }
  private async enoughMemory(running = false) {
    try {
      const sample = await this.memory.sample();
      return (
        sample.physicalMiB >= (running ? 512 : this.settings.minFreeMiB) &&
        sample.commitMiB >= (running ? 1024 : this.settings.minCommitMiB)
      );
    } catch {
      return false;
    }
  }
  async readiness() {
    const base = {
      enabled: this.settings.enabled,
      model: this.settings.model,
      ready: false,
    };
    if (!this.settings.enabled) return { ...base, reason: "DISABLED" as const };
    if (!this.instanceReady)
      return { ...base, reason: "INSTANCE_BUSY" as const };
    if (this.active || this.admitting)
      return { ...base, reason: "BUSY" as const };
    if (!(await this.enoughMemory()))
      return { ...base, reason: "MEMORY_PRESSURE" as const };
    try {
      if (!(await this.provider.metadata()))
        return { ...base, reason: "MODEL_MISSING" as const };
      if (!(await this.provider.idle()))
        return { ...base, reason: "BUSY" as const };
      return { ...base, ready: true, reason: "AVAILABLE" as const };
    } catch {
      return { ...base, reason: "PROVIDER_UNAVAILABLE" as const };
    }
  }
  private accepted(payload: AiJob) {
    return {
      job: aiJobSchema.parse(payload),
      statusUrl: "/v1/ai/jobs/" + payload.id,
    };
  }
  private match(row: AiJobRecord, request: AiRequest) {
    if (
      row.payload.designRevision !== request.expectedRevision ||
      row.payload.runId !== request.runId
    )
      throw new AppException(
        "CONFLICT",
        "AI request id was already used for different inputs",
        { reason: "REQUEST_ID_REUSED" },
      );
    return this.accepted(row.payload);
  }
  async get(owner: string, id: string) {
    const row = await this.db.getRepository(AiJobRecord).findOneBy({ id });
    if (!row) throw new AppException("NOT_FOUND", "AI job not found");
    await this.designs.owned(owner, row.designId);
    return aiJobSchema.parse(row.payload);
  }
  /** Verified facts stored with a job; null for M11 artifacts, which predate the contract. */
  private verifiedFacts(facts: Record<string, unknown>): AiFacts | null {
    const parsed = aiFactsSchema.safeParse({
      verdict: facts.verdict,
      p95Ms: facts.p95Ms,
      p95TargetMs: facts.p95TargetMs,
      errorRateFraction: facts.errorRateFraction,
      errorBudgetFraction: facts.errorBudgetFraction,
      bottleneck: facts.bottleneck,
    });
    return parsed.success ? parsed.data : null;
  }
  /** Owner-only server evidence for one job: what the explanation is about and what it may cite. */
  async evidence(owner: string, id: string) {
    const row = await this.db.getRepository(AiJobRecord).findOneBy({ id });
    if (!row) throw new AppException("NOT_FOUND", "AI job not found");
    await this.designs.owned(owner, row.designId);
    const job = aiJobSchema.parse(row.payload);
    const legacy = job.promptVersion === LEGACY_AI_PROMPT_VERSION;
    const facts = legacy ? null : this.verifiedFacts(row.facts);
    return aiEvidenceSchema.parse({
      jobId: job.id,
      designId: job.designId,
      runId: job.runId,
      designRevision: job.designRevision,
      fingerprint: job.fingerprint,
      engineVersion: String(row.facts.engine ?? row.facts.model ?? "unknown"),
      structured: facts !== null,
      facts,
      evidenceIds: Array.isArray(row.facts.evidenceIds)
        ? (row.facts.evidenceIds as string[])
        : [],
      limitations: [...(facts ? EXPLANATION_LIMITATIONS : LEGACY_LIMITATIONS)],
    });
  }
  async submit(owner: string, request: AiRequest) {
    const current = await this.designs.owned(owner, request.designId);
    const repository = this.db.getRepository(AiJobRecord);
    const existing = await repository.findOneBy({
      designId: request.designId,
      requestId: request.requestId,
    });
    if (existing) return this.match(existing, request);
    this.designs.revision(current, request.expectedRevision);
    if (!this.settings.enabled || !this.instanceReady)
      throw new AppException(
        "UNAVAILABLE",
        "Experimental AI is disabled or unavailable",
        { reason: this.settings.enabled ? "INSTANCE_BUSY" : "AI_DISABLED" },
      );
    if (this.active || this.admitting)
      throw new AppException(
        "RATE_LIMITED",
        "One AI request is already active",
        { reason: "AI_BUSY" },
      );
    this.admitting = true;
    try {
      const run = await this.db
        .getRepository(SavedRun)
        .findOneBy({ id: request.runId, designId: request.designId });
      if (!run) throw new AppException("NOT_FOUND", "Recorded run not found");
      const payload = run.payload;
      if (
        payload.status !== "completed" ||
        payload.result.kind !== "simulation"
      )
        throw new AppException(
          "VALIDATION_FAILED",
          "AI foundation requires a completed simulation",
          { reason: "AI_RUN_REQUIRED" },
        );
      if (
        payload.designRevision !== current.revision ||
        payload.fingerprint !==
          inputFingerprint({
            schemaVersion: current.schemaVersion,
            graph: current.graph,
            traffic: current.traffic,
          })
      )
        throw new AppException(
          "CONFLICT",
          "Recorded result is not for this revision",
          { reason: "AI_STALE_RUN" },
        );
      const s = payload.result.summary;
      const bottleneck = s.bottleneckId
        ? s.nodes.find((n) => n.id === s.bottleneckId)
        : undefined;
      // Units are explicit; a missing bottleneck is JSON null and has its own evidence id.
      const verified: AiFacts = {
        verdict: s.verdict,
        p95Ms: s.p95,
        p95TargetMs: s.traffic.sloP95,
        errorRateFraction: s.errorRate,
        errorBudgetFraction: s.traffic.errorBudget,
        bottleneck: bottleneck
          ? {
              id: bottleneck.id,
              // Labels are untrusted data: bounded and stripped of control characters.
              label: bottleneck.label.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 40) || bottleneck.id,
              utilizationFraction: bottleneck.rho,
            }
          : null,
      };
      const facts = {
        ...verified,
        revision: current.revision,
        engine: payload.engineVersion,
        evidenceIds: evidenceIdsFor(verified),
        limitation: "Mathematical estimates, not measured performance",
      };
      const messages = [
        { role: "system", content: FOUNDATION_PROMPT },
        { role: "user", content: "FACTS=" + JSON.stringify(facts) },
      ];
      if (Buffer.byteLength(JSON.stringify(messages), "utf8") > 1400)
        throw new AppException(
          "VALIDATION_FAILED",
          "Evidence exceeds the tested context budget",
          { reason: "AI_CONTEXT_TOO_LARGE" },
        );
      const ready = await this.readinessForAdmission();
      const now = new Date();
      const row = await this.db.transaction(async (m) => {
        const design = await this.designs.owned(
          owner,
          request.designId,
          m,
          true,
        );
        const winner = await m.findOneBy(AiJobRecord, {
          designId: request.designId,
          requestId: request.requestId,
        });
        if (winner) return winner;
        this.designs.revision(design, request.expectedRevision);
        await m.query(
          "DELETE FROM ai_jobs WHERE expires_at < now() AND status <> 'pending'",
        );
        // A lost DB acknowledgement may leave pending work after local cleanup.
        // Preserve the admission contract instead of exposing a uniqueness failure.
        if (await m.existsBy(AiJobRecord, { status: "pending" }))
          throw new AppException("RATE_LIMITED", "A retained AI request is still pending", { reason: "AI_BUSY" });
        if ((await m.count(AiJobRecord)) >= 500)
          throw new AppException(
            "RATE_LIMITED",
            "AI artifact retention capacity is full",
            { reason: "AI_STORAGE_LIMIT" },
          );
        const version = await m.findOneBy(DesignVersion, {
          designId: request.designId,
          revision: design.revision,
        });
        if (!version)
          throw new AppException(
            "UNAVAILABLE",
            "Design version baseline is missing",
            { reason: "AI_VERSION_MISSING" },
          );
        const job = aiJobSchema.parse({
          id: randomUUID(),
          designId: design.id,
          requestId: request.requestId,
          designRevision: design.revision,
          versionId: version.id,
          runId: request.runId,
          fingerprint: payload.fingerprint,
          model: ready.name,
          modelDigest: ready.digest,
          promptVersion: AI_PROMPT_VERSION,
          schemaVersion: AI_SCHEMA_VERSION,
          status: "pending",
          createdAt: now.toISOString(),
          completedAt: null,
          expiresAt: new Date(now.getTime() + 86400000).toISOString(),
          result: null,
          failure: null,
          experimental: true,
        });
        return m.save(AiJobRecord, {
          id: job.id,
          designId: design.id,
          versionId: version.id,
          requestId: job.requestId,
          status: job.status,
          payload: job,
          facts,
          createdAt: now,
          expiresAt: new Date(job.expiresAt),
        });
      });
      const slot: Active = {
        id: row.id,
        controller: new AbortController(),
        settled: false,
      };
      this.active = slot;
      slot.promise = this.execute(slot, row);
      return this.accepted(row.payload);
    } finally {
      this.admitting = false;
    }
  }
  private async readinessForAdmission() {
    if (!(await this.enoughMemory()))
      throw new AppException(
        "UNAVAILABLE",
        "Insufficient host memory headroom for local AI",
        { reason: "MEMORY_PRESSURE" },
      );
    try {
      const model = await this.provider.metadata();
      if (!model)
        throw new AppException(
          "UNAVAILABLE",
          "Configured local model is not installed",
          { reason: "MODEL_MISSING" },
        );
      if (!(await this.provider.idle()))
        throw new AppException(
          "RATE_LIMITED",
          "Local inference capacity is already in use",
          { reason: "AI_BUSY" },
        );
      return model;
    } catch (e) {
      if (e instanceof AppException) throw e;
      throw new AppException(
        "UNAVAILABLE",
        "Local AI provider is unavailable",
        { reason: "PROVIDER_UNAVAILABLE" },
      );
    }
  }
  private async finish(
    id: string,
    status: AiJob["status"],
    result: AiJob["result"],
    reason?: Failure,
  ) {
    await this.db.transaction(async (m) => {
      const row = await m.findOne(AiJobRecord, {
        where: { id },
        lock: { mode: "pessimistic_write" },
      });
      if (!row || row.status !== "pending") return;
      row.status = status;
      row.payload = aiJobSchema.parse({
        ...row.payload,
        status,
        completedAt: new Date().toISOString(),
        result,
        failure: reason
          ? {
              reason,
              message:
                "AI request did not complete. No design changes were made.",
            }
          : null,
      });
      await m.save(row);
    });
  }
  private async execute(slot: Active, row: AiJobRecord) {
    const deadline = setTimeout(() => {
      slot.reason = "DEADLINE";
      slot.controller.abort();
    }, this.settings.deadlineMs);
    let checking = false;
    const monitor = setInterval(() => {
      if (checking || slot.controller.signal.aborted) return;
      checking = true;
      void this.enoughMemory(true)
        .then((ok) => {
          if (!ok) {
            slot.reason = "MEMORY_PRESSURE";
            slot.controller.abort();
          }
        })
        .finally(() => {
          checking = false;
        });
    }, 5000);
    try {
      const result = await this.provider.generate(
        row.facts,
        row.facts.evidenceIds as string[],
        row.payload.modelDigest,
        slot.controller.signal,
      );
      if (slot.controller.signal.aborted) throw new Error("Aborted");
      const verified = this.verifiedFacts(row.facts);
      const violation = verified
        ? groundingViolation(result.summary, verified, row.payload.designRevision)
        : null;
      if (violation)
        throw new AppException(
          "VALIDATION_FAILED",
          "Generated explanation contradicts the verified facts: " + violation,
          { reason: "INVALID_OUTPUT" },
        );
      await this.finish(row.id, "completed", result);
    } catch (e) {
      let reason: Failure = slot.reason ?? "PROVIDER_UNAVAILABLE";
      if (!slot.reason && e instanceof AppException) {
        const detail = e.details as { reason?: string } | undefined;
        reason =
          detail?.reason === "MODEL_CHANGED"
            ? "MODEL_CHANGED"
            : e.code === "VALIDATION_FAILED"
              ? "INVALID_OUTPUT"
              : "PROVIDER_UNAVAILABLE";
      }
      await this.finish(
        row.id,
        reason === "CANCELLED"
          ? "cancelled"
          : reason === "INTERRUPTED"
            ? "interrupted"
            : "failed",
        null,
        reason,
      ).catch(() => undefined);
    } finally {
      clearTimeout(deadline);
      clearInterval(monitor);
      if (slot.controller.signal.aborted)
        await this.provider.unload().catch(() => undefined);
      // An aborted HTTP stream is not proof that GPU work stopped. Keep the slot
      // occupied until the upstream promise settled AND /api/ps confirms no runner.
      slot.settled = true;
      await this.reconcile().catch(() => undefined);
    }
  }
  async cancel(owner: string, id: string) {
    const previous = await this.get(owner, id);
    if (previous.status !== "pending") return previous;
    if (this.active?.id === id) {
      this.active.reason = "CANCELLED";
      this.active.controller.abort();
    }
    await this.finish(id, "cancelled", null, "CANCELLED");
    return this.get(owner, id);
  }
  private async reconcile() {
    if (this.lease && this.instanceReady) {
      try {
        await this.lease.query("SELECT 1");
      } catch {
        this.instanceReady = false;
        if (this.active) {
          this.active.reason = "INTERRUPTED";
          this.active.controller.abort();
        }
        return;
      }
    }
    if (this.active?.settled && (await this.provider.idle()))
      this.active = undefined;
    // A failed DB acknowledgement must not leave a permanently pending row.
    const rows = (await this.db.query(
      "SELECT id FROM ai_jobs WHERE status='pending' AND created_at < now() - interval '2 minutes'",
    )) as { id: string }[];
    for (const row of rows)
      if (row.id !== this.active?.id)
        await this.finish(row.id, "interrupted", null, "INTERRUPTED");
  }
}
