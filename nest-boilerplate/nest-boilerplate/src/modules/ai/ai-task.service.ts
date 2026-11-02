import { Inject, Injectable, Logger } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { DataSource } from "typeorm";
import { AppException } from "@/common/errors";
import { AiQuota, estimateTokens } from "@/modules/ai/ai-quota";
import { AI_SETTINGS, AiSettings } from "@/modules/ai/ai.settings";
import { AiTaskCall, AiTaskName } from "@/modules/ai/entities/ai-task-call.entity";
import { GROQ_TASK_MAX_COMPLETION_TOKENS } from "@/modules/ai/groq.provider";
import { EXPLANATION_PROVIDER, ExplanationProvider, ProviderObservation, StructuredTask, isStructuredProvider } from "@/modules/ai/provider";

/**
 * Runs one design task (describe, what-if, fix intent) on the hosted model and nothing else. The caller builds the strict request
 * and the parser that validates the answer with the application's own schemas; this service owns the rules around every call:
 * the task's own switch, the shared quota (reserved before the request, settled to the real tokens after it), the provider's
 * back-off, and one provenance row per call that keeps only the length and a hash of the person's text.
 */
export interface AiTaskReadiness {
  task: AiTaskName;
  enabled: boolean;
  available: boolean;
  provider: "ollama" | "groq";
  model: string;
  reason: "AVAILABLE" | "DISABLED" | "PROVIDER_NOT_CONFIGURED" | "QUOTA_EXHAUSTED";
  retryAfterSeconds?: number;
}

export interface AiTaskRun<T> {
  task: AiTaskName;
  owner: string;
  /** The person's own words, used only to record their length and hash. */
  userText: string;
  request: StructuredTask;
  parse: (value: unknown) => T;
  signal: AbortSignal;
}

const reasonOf = (e: unknown) => ((e as { details?: { reason?: string } })?.details?.reason ?? null) as string | null;

@Injectable()
export class AiTaskService {
  private readonly log = new Logger(AiTaskService.name);

  constructor(
    private readonly db: DataSource,
    @Inject(EXPLANATION_PROVIDER) private readonly provider: ExplanationProvider,
    private readonly quota: AiQuota,
    @Inject(AI_SETTINGS) private readonly settings: AiSettings,
  ) {}

  private switchedOn(task: AiTaskName) {
    return this.settings.enabled && (this.settings.features ?? []).includes(task);
  }

  /** Whether the task could run now. Spends nothing. */
  async readiness(task: AiTaskName, owner?: string): Promise<AiTaskReadiness> {
    const base = { task, enabled: this.switchedOn(task), provider: this.settings.provider ?? "ollama", model: this.settings.model };
    if (!base.enabled) return { ...base, available: false, reason: "DISABLED" };
    if (!isStructuredProvider(this.provider)) return { ...base, available: false, reason: "PROVIDER_NOT_CONFIGURED" };
    try {
      await this.provider.identity();
    } catch {
      return { ...base, available: false, reason: "PROVIDER_NOT_CONFIGURED" };
    }
    const wait = await this.quota.waitSeconds(owner, estimateTokens(1500, GROQ_TASK_MAX_COMPLETION_TOKENS));
    if (wait.seconds > 0) return { ...base, available: false, reason: "QUOTA_EXHAUSTED", retryAfterSeconds: wait.seconds };
    return { ...base, available: true, reason: "AVAILABLE" };
  }

  async run<T>(run: AiTaskRun<T>): Promise<T> {
    if (!this.switchedOn(run.task)) throw new AppException("UNAVAILABLE", "This AI feature is switched off", { reason: "AI_DISABLED" });
    const provider = this.provider;
    if (!isStructuredProvider(provider)) throw new AppException("UNAVAILABLE", "No hosted model is configured for this feature", { reason: "PROVIDER_NOT_CONFIGURED" });

    const ticket = await this.quota.reserve(
      run.owner,
      estimateTokens(Buffer.byteLength(JSON.stringify(run.request.messages), "utf8"), run.request.maxCompletionTokens ?? GROQ_TASK_MAX_COMPLETION_TOKENS),
    );
    let seen: ProviderObservation = {};
    const started = Date.now();
    let outcome = "completed";
    try {
      return await provider.structured(run.request, run.parse, run.signal, (o) => {
        seen = { ...seen, ...o };
      });
    } catch (e) {
      outcome = run.signal.aborted ? "CANCELLED" : (reasonOf(e) ?? "FAILED").slice(0, 32);
      if (reasonOf(e) === "PROVIDER_RATE_LIMITED") await this.quota.backoff(seen.retryAfterSeconds ?? 60).catch(() => undefined);
      throw e;
    } finally {
      // Neither bookkeeping step may hide the answer or the real error.
      await this.quota.settle(ticket, seen.usage?.totalTokens).catch(() => undefined);
      await this.record(run, outcome, seen, Date.now() - started).catch((e: Error) => this.log.warn("Could not record an AI task call: " + e.message));
    }
  }

  private record<T>(run: AiTaskRun<T>, outcome: string, seen: ProviderObservation, elapsedMs: number) {
    const row: AiTaskCall = {
      id: randomUUID(),
      ownerId: run.owner,
      task: run.task,
      provider: this.settings.provider ?? "groq",
      model: this.provider.model,
      returnedModel: seen.returnedModel ?? null,
      outcome,
      promptTokens: seen.usage?.promptTokens ?? null,
      completionTokens: seen.usage?.completionTokens ?? null,
      totalTokens: seen.usage?.totalTokens ?? null,
      latencyMs: seen.latencyMs ?? elapsedMs,
      inputLength: run.userText.length,
      inputHash: createHash("sha256").update(run.userText).digest("hex"),
      createdAt: new Date(),
    };
    return this.db.getRepository(AiTaskCall).insert(row);
  }
}
