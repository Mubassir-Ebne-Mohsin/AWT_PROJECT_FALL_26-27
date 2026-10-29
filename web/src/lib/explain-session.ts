import { ApiError } from "@/lib/api/errors";
import {
  cancelAiJob,
  fetchAiEvidence,
  fetchAiJob,
  fetchAiReadiness,
  submitAiJob,
  type AiEvidence,
  type AiJob,
  type AiReadiness,
} from "@/lib/api/ai";

/** Identity of the saved result being explained. Everything a reply must match before it is shown. */
export interface ExplainContext {
  userId: string;
  designId: string;
  designName: string;
  runId: string;
  /** Saved revision the run was computed for. */
  runRevision: number;
  /** Latest saved revision of the design now. Differs from runRevision for an earlier result. */
  savedRevision: number;
}

export type ExplainPhase = "idle" | "submitting" | "uncertain" | "pending" | "completed" | "ended" | "error";
export interface ExplainState {
  phase: ExplainPhase;
  readiness: AiReadiness | null;
  job: AiJob | null;
  evidence: AiEvidence | null;
  evidenceFailed: boolean;
  /** Plain-language explanation of the current flow condition; never an internal error. */
  message: string | null;
  /** Set only when readiness itself could not be checked; kept apart so it never overwrites a flow notice. */
  readinessError: string | null;
  retryable: boolean;
  /** Cancel was accepted but the local runner may still be releasing memory. */
  providerStopping: boolean;
  /** A status check failed while a job is pending; the job itself may still be running. */
  connectionLost: boolean;
}

export interface ExplainDeps {
  readiness: typeof fetchAiReadiness;
  submit: typeof submitAiJob;
  job: typeof fetchAiJob;
  evidence: typeof fetchAiEvidence;
  cancel: typeof cancelAiJob;
  newId: () => string;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
}
const realDeps: ExplainDeps = {
  readiness: fetchAiReadiness,
  submit: submitAiJob,
  job: fetchAiJob,
  evidence: fetchAiEvidence,
  cancel: cancelAiJob,
  newId: () => crypto.randomUUID(),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export const POLL_MS = 2000;
export const POLL_BACKOFF_MS = 5000;
export const STOP_WATCH_MS = 3000;
export const STOP_WATCH_MAX = 40;

const fresh = (): ExplainState => ({
  phase: "idle",
  readiness: null,
  job: null,
  evidence: null,
  evidenceFailed: false,
  message: null,
  readinessError: null,
  retryable: false,
  providerStopping: false,
  connectionLost: false,
});

/** The single line of status the panel shows: an explicit flow notice wins over readiness. */
export function explainStatusText(state: ExplainState): string | null {
  if (state.message) return state.message;
  if (state.readinessError) return state.readinessError;
  if (state.phase === "idle" && state.readiness) return READINESS_TEXT[state.readiness.reason];
  return null;
}

export const READINESS_TEXT: Record<AiReadiness["reason"], string> = {
  DISABLED: "Local AI is not enabled. Your numerical results are unaffected.",
  AVAILABLE: "Local AI is ready.",
  BUSY: "Local AI is busy with another request. Try again when it finishes.",
  MODEL_MISSING: "The configured local model is not installed. Install it yourself, then check again. Nothing is downloaded automatically.",
  PROVIDER_UNAVAILABLE: "The local model service is not reachable. Start it, then check again.",
  MEMORY_PRESSURE: "There is not enough free memory for local AI right now. Close other programs, then check again.",
  INSTANCE_BUSY: "Another StressForge server instance owns local AI. Core features are unaffected.",
};
const FAILURE_TEXT: Record<string, string> = {
  INTERRUPTED: "The server restarted or lost the request, so this explanation did not finish. Nothing was replayed automatically.",
  CANCELLED: "You cancelled this explanation.",
  DEADLINE: "The explanation took too long and was stopped.",
  MEMORY_PRESSURE: "The explanation was stopped because the computer ran low on memory.",
  PROVIDER_UNAVAILABLE: "The local model service stopped responding.",
  INVALID_OUTPUT: "The model's answer was rejected because it did not match the verified facts or the expected format.",
  MODEL_CHANGED: "The installed model changed during generation, so the answer was discarded.",
};
export const failureText = (reason: string | undefined) => FAILURE_TEXT[reason ?? ""] ?? "The explanation did not complete.";

/** Maps a failed request to an inline message. Nothing here opens a global screen. */
function describe(error: unknown): { message: string; retryable: boolean } {
  if (!(error instanceof ApiError)) return { message: "Something went wrong. Your results are unaffected.", retryable: true };
  const reason = (error.details as { reason?: string } | undefined)?.reason;
  switch (reason) {
    case "AI_DISABLED":
      return { message: READINESS_TEXT.DISABLED, retryable: false };
    case "INSTANCE_BUSY":
      return { message: READINESS_TEXT.INSTANCE_BUSY, retryable: true };
    case "MEMORY_PRESSURE":
      return { message: READINESS_TEXT.MEMORY_PRESSURE, retryable: true };
    case "MODEL_MISSING":
      return { message: READINESS_TEXT.MODEL_MISSING, retryable: true };
    case "PROVIDER_UNAVAILABLE":
      return { message: READINESS_TEXT.PROVIDER_UNAVAILABLE, retryable: true };
    case "AI_BUSY":
      return { message: READINESS_TEXT.BUSY, retryable: true };
    case "AI_STORAGE_LIMIT":
      return { message: "Retained explanations are full. Older ones expire after a day.", retryable: true };
    case "AI_STALE_RUN":
      return { message: "This result is not for the latest saved revision. Run the current saved inputs, then explain that result.", retryable: false };
    case "AI_RUN_REQUIRED":
      return { message: "Explanations need a completed saved simulation.", retryable: false };
    case "AI_CONTEXT_TOO_LARGE":
      return { message: "This result has too much evidence for the small local model's tested limit, so it was not explained.", retryable: false };
    case "REQUEST_ID_REUSED":
      return { message: "That request was already used for a different result. Start a new explanation.", retryable: true };
  }
  if (error.status === 403 || error.status === 404)
    return { message: "That result or explanation is not available to this account.", retryable: false };
  if (error.status === 429) return { message: "Local AI is rate limited. Try again in a moment.", retryable: true };
  if (error.code === "NETWORK") return { message: "The server could not be reached.", retryable: true };
  return { message: "Local AI is unavailable right now. Your results are unaffected.", retryable: true };
}

/**
 * One explanation flow for one saved result. A reply is applied only if it still belongs to the bound
 * account, design, run and revision (epoch check), so a late answer can never attach to another result.
 * Accepted server jobs outlive the panel: closing it only stops polling. Cancel is the stop action.
 */
export class ExplainSession {
  state: ExplainState = fresh();
  ctx: ExplainContext | null = null;
  /** Called when the retained job id changes, so the URL can carry it for reload recovery. */
  private onJob: (jobId: string | null) => void = () => undefined;
  /** The panel registers how the retained job id is carried (the URL); pass null to stop. */
  setJobListener(fn: ((jobId: string | null) => void) | null) {
    this.onJob = fn ?? (() => undefined);
  }
  private listeners = new Set<() => void>();
  private epoch = 0;
  private requestId: string | undefined;
  private attached = false;
  private timer: unknown;
  private stopTimer: unknown;
  private controllers = new Set<AbortController>();
  /** The submit is deliberately not aborted by closing the panel: the server may already have accepted it. */
  private submitting: AbortController | null = null;
  private disposed = false;

  constructor(private deps: ExplainDeps = realDeps) {}
  getSnapshot = () => this.state;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private set(patch: Partial<ExplainState>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }
  private live(epoch: number) {
    return !this.disposed && epoch === this.epoch;
  }
  private key(ctx: ExplainContext | null) {
    return ctx ? [ctx.userId, ctx.designId, ctx.runId, ctx.runRevision].join(":") : "";
  }
  /** True when the run belongs to an earlier saved revision: it can be read but not newly explained. */
  get historical() {
    return !!this.ctx && this.ctx.runRevision !== this.ctx.savedRevision;
  }
  private abortAll() {
    this.controllers.forEach((c) => c.abort());
    this.controllers.clear();
    this.deps.clearTimer(this.timer);
    this.deps.clearTimer(this.stopTimer);
    this.timer = this.stopTimer = undefined;
  }
  private signal() {
    const c = new AbortController();
    this.controllers.add(c);
    return c;
  }

  /** Bind to the saved result on screen. A different account/design/run/revision starts from a clean slate. */
  bind(ctx: ExplainContext | null) {
    if (this.disposed) return;
    const changed = this.key(ctx) !== this.key(this.ctx);
    this.ctx = ctx;
    if (!changed) {
      this.set({}); // savedRevision may have moved: re-render the historical notice
      return;
    }
    this.epoch++;
    this.abortAll();
    this.requestId = undefined;
    this.state = fresh();
    this.listeners.forEach((fn) => fn());
    if (this.attached && ctx) void this.checkReadiness();
  }
  /** The panel is visible: refresh readiness and resume checking an accepted job. */
  attach() {
    this.attached = true;
    if (!this.ctx) return;
    if (this.state.phase === "pending" && this.state.job) this.poll(this.epoch, POLL_MS);
    else if (this.state.providerStopping) this.watchStop(this.epoch, 0);
    else if (this.state.phase === "completed" && !this.state.evidence) void this.loadEvidence();
    else if (this.state.phase === "idle") void this.checkReadiness();
  }
  /** The panel is closed: stop UI polling only. An accepted job keeps running server-side. */
  detach() {
    this.attached = false;
    this.abortAll();
  }
  dispose() {
    this.epoch++;
    this.abortAll();
    this.submitting?.abort();
    this.disposed = true;
    this.listeners.clear();
  }

  async checkReadiness() {
    const epoch = this.epoch;
    const c = this.signal();
    try {
      const readiness = await this.deps.readiness(c.signal);
      if (!this.live(epoch)) return;
      this.set({ readiness, readinessError: null });
    } catch (error) {
      if (!this.live(epoch) || c.signal.aborted) return;
      const d = describe(error);
      this.set({ readiness: null, readinessError: d.message });
    } finally {
      this.controllers.delete(c);
    }
  }

  /** Start (or, after a lost reply, safely retry the SAME request identity). */
  async generate() {
    const ctx = this.ctx;
    const phase = this.state.phase;
    if (!ctx || phase === "submitting" || phase === "pending" || this.state.providerStopping) return;
    if (this.historical) {
      this.set({ message: "This result is for an earlier revision. Run the current saved inputs to explain them.", retryable: false });
      return;
    }
    // A terminal job needs a new identity; an uncertain or never-accepted request keeps its id.
    if (phase === "ended" || phase === "completed") this.requestId = undefined;
    this.requestId ??= this.deps.newId();
    const epoch = this.epoch;
    const c = new AbortController();
    this.submitting = c;
    this.set({ phase: "submitting", message: null, retryable: false, job: null, evidence: null, evidenceFailed: false, connectionLost: false });
    try {
      const accepted = await this.deps.submit(
        { requestId: this.requestId, designId: ctx.designId, expectedRevision: ctx.runRevision, runId: ctx.runId },
        c.signal,
      );
      if (!this.live(epoch)) return;
      this.adopt(accepted.job, epoch);
    } catch (error) {
      if (!this.live(epoch) || c.signal.aborted) return;
      if (error instanceof ApiError && error.status === 0) {
        // The reply may have been lost after the server accepted it: retry discovers the same job.
        this.set({
          phase: "uncertain",
          message: "The server did not confirm the request. It may have started. Check again; the same request is reused, so nothing is duplicated.",
          retryable: true,
        });
      } else {
        const d = describe(error);
        this.set({ phase: "error", message: d.message, retryable: d.retryable });
      }
    } finally {
      if (this.submitting === c) this.submitting = null;
    }
  }

  /** Reload recovery: look up a retained job id carried in the URL for this exact result. */
  async resume(jobId: string) {
    if (!this.ctx || this.state.job || this.state.phase === "submitting") return;
    const epoch = this.epoch;
    const c = this.signal();
    try {
      const job = await this.deps.job(jobId, c.signal);
      if (!this.live(epoch)) return;
      this.adopt(job, epoch);
    } catch (error) {
      if (!this.live(epoch) || c.signal.aborted) return;
      const d = describe(error);
      this.onJob(null);
      this.set({ phase: "error", message: d.message, retryable: false });
    } finally {
      this.controllers.delete(c);
    }
  }

  /** Apply a job only if it belongs to the bound result; otherwise refuse it visibly. */
  private adopt(job: AiJob, epoch: number) {
    const ctx = this.ctx;
    if (!ctx || !this.live(epoch)) return;
    if (job.designId !== ctx.designId || job.runId !== ctx.runId || job.designRevision !== ctx.runRevision) {
      this.onJob(null);
      this.set({ phase: "error", job: null, message: "That explanation belongs to a different result, so it was not shown here.", retryable: false });
      return;
    }
    this.onJob(job.id);
    if (job.status === "pending") {
      this.set({ phase: "pending", job, message: null, retryable: false, connectionLost: false });
      if (this.attached) this.poll(epoch, POLL_MS);
      return;
    }
    this.requestId = undefined; // terminal: a retry is a new request
    this.deps.clearTimer(this.timer);
    if (job.status === "completed") {
      this.set({ phase: "completed", job, message: null, retryable: false, connectionLost: false });
      void this.loadEvidence(job, epoch);
      return;
    }
    this.set({
      phase: "ended",
      job,
      evidence: null,
      message: job.failure ? failureText(job.failure.reason) : "The explanation did not complete.",
      retryable: true,
      connectionLost: false,
    });
  }

  async loadEvidence(job: AiJob | null = this.state.job, epoch = this.epoch) {
    if (!job) return;
    const c = this.signal();
    this.set({ evidenceFailed: false });
    try {
      const evidence = await this.deps.evidence(job.id, c.signal);
      if (!this.live(epoch)) return;
      if (evidence.jobId !== job.id || evidence.runId !== job.runId || evidence.designId !== job.designId || evidence.designRevision !== job.designRevision || evidence.fingerprint !== job.fingerprint) {
        this.set({ evidence: null, evidenceFailed: true });
        return;
      }
      this.set({ evidence, evidenceFailed: false });
    } catch {
      if (this.live(epoch) && !c.signal.aborted) this.set({ evidence: null, evidenceFailed: true });
    } finally {
      this.controllers.delete(c);
    }
  }

  private poll(epoch: number, delay: number) {
    this.deps.clearTimer(this.timer);
    this.timer = this.deps.setTimer(() => void this.tick(epoch), delay);
  }
  private async tick(epoch: number) {
    const job = this.state.job;
    if (!this.live(epoch) || !job || !this.attached || this.state.phase !== "pending") return;
    const c = this.signal();
    try {
      const next = await this.deps.job(job.id, c.signal);
      if (!this.live(epoch) || next.id !== job.id) return;
      this.adopt(next, epoch);
    } catch (error) {
      if (!this.live(epoch) || c.signal.aborted) return;
      if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
        const d = describe(error);
        this.onJob(null);
        this.set({ phase: "error", message: d.message, retryable: false, job: null });
        return;
      }
      // A failed status check is not a failed job: keep it pending and say so honestly.
      this.set({ connectionLost: true });
      this.poll(epoch, POLL_BACKOFF_MS);
    } finally {
      this.controllers.delete(c);
    }
  }

  /** Explicit stop. The job becomes terminal at once; the runner may still be releasing memory. */
  async cancel() {
    const job = this.state.job;
    if (!job || this.state.phase !== "pending") return;
    const epoch = this.epoch;
    const c = this.signal();
    try {
      const cancelled = await this.deps.cancel(job.id, c.signal);
      if (!this.live(epoch)) return;
      this.adopt(cancelled, epoch);
      if (cancelled.status === "cancelled") this.set({ providerStopping: true });
      this.watchStop(epoch, 0);
    } catch (error) {
      if (!this.live(epoch) || c.signal.aborted) return;
      this.set({ message: describe(error).message + " Cancel was not confirmed; the job is still being checked.", connectionLost: true });
      this.poll(epoch, POLL_BACKOFF_MS);
    } finally {
      this.controllers.delete(c);
    }
  }
  /** After cancel, keep new generation unavailable until readiness says the runner is idle. */
  private watchStop(epoch: number, attempt: number) {
    this.deps.clearTimer(this.stopTimer);
    this.stopTimer = this.deps.setTimer(async () => {
      if (!this.live(epoch) || !this.attached) return;
      const c = this.signal();
      try {
        const readiness = await this.deps.readiness(c.signal);
        if (!this.live(epoch)) return;
        const stillBusy = readiness.reason === "BUSY";
        this.set({ readiness, providerStopping: stillBusy });
        if (stillBusy && attempt < STOP_WATCH_MAX) this.watchStop(epoch, attempt + 1);
      } catch {
        if (this.live(epoch) && !c.signal.aborted && attempt < STOP_WATCH_MAX) this.watchStop(epoch, attempt + 1);
      } finally {
        this.controllers.delete(c);
      }
    }, STOP_WATCH_MS);
  }
}
