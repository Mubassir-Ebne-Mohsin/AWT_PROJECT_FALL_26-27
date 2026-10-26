import { z } from "zod";
import { inputFingerprint } from "@/common/contracts/phase2/fingerprint";
import { randomUUID } from "node:crypto";
import type { Worker } from "node:worker_threads";
import {
  calculationSchema,
  computeResultSchema,
  Calculation,
  ComputeResult,
} from "@/modules/simulation/engine/compute";
import { createComputeWorker } from "@/modules/simulation/worker/worker-factory";
import {
  ExecutionCode,
  ExecutionError,
} from "@/modules/simulation/worker/executor-error";

export const EXECUTION_BOUNDS = Object.freeze({
  queue: 4,
  durableMs: 5000,
  previewMs: 2000,
  previewEntries: 128,
  previewTtlMs: 30000,
});
type Priority = "durable" | "preview";
interface Slot {
  id: string;
  owner: string;
  priority: Priority;
  editor?: string;
  calculation?: Calculation;
  resolve: (value: ComputeResult) => void;
  reject: (error: ExecutionError) => void;
  result: Promise<ComputeResult>;
  timer: NodeJS.Timeout;
  expiresAt: number;
  removeAbort?: () => void;
}
export interface Reservation {
  id: string;
  expiresAt: number;
  result: Promise<ComputeResult>;
  start: (calculation: Calculation) => void;
  release: () => void;
}
export interface Admission {
  editorSessionId?: string;
  sequence?: number;
  signal?: AbortSignal;
}
/** Single-instance admission primitive. M3 owns database transactions/idempotency. */
export class SimulationExecutor {
  private readonly slots = new Map<string, Slot>();
  private readonly latestPreview = new Map<
    string,
    { sequence: number; expiresAt: number }
  >();
  private queue: Slot[] = [];
  private active?: Slot;
  private worker?: Worker;
  private retiring?: Promise<unknown>;
  private closed = false;
  private lastDiagnostics?: {
    elapsedMs: number;
    postCalculationHeapBytes: number;
  };
  get diagnostics() {
    return this.lastDiagnostics ? { ...this.lastDiagnostics } : undefined;
  }
  constructor(private readonly factory: () => Worker = createComputeWorker) {}
  get state() {
    return {
      active: this.active ? 1 : 0,
      queued: this.queue.length,
      reservations: this.slots.size,
      previewEntries: this.latestPreview.size,
      closed: this.closed,
    };
  }

  reserve(
    owner: string,
    priority: Priority,
    admission: Admission = {},
  ): Reservation {
    if (this.closed) throw new ExecutionError("UNAVAILABLE");
    if (!owner || owner.length > 128)
      throw new TypeError("A bounded authenticated owner id is required");
    this.expirePreviewEntries();
    let editor: string | undefined;
    if (priority === "preview") {
      const session = admission.editorSessionId,
        sequence = admission.sequence;
      if (
        !session ||
        !z.uuid().safeParse(session).success ||
        !Number.isSafeInteger(sequence) ||
        sequence! < 0
      )
        throw new TypeError(
          "Preview requires editor UUID and nonnegative integer sequence",
        );
      editor = owner + ":" + session;
      const old = this.latestPreview.get(editor);
      if (old && sequence! <= old.sequence)
        throw new ExecutionError("CANCELLED");
      if (!old && this.latestPreview.size >= EXECUTION_BOUNDS.previewEntries)
        throw new ExecutionError("RATE_LIMITED");
      if (admission.signal?.aborted) throw new ExecutionError("CANCELLED");
      if (
        [...this.slots.values()].some(
          (s) => s.owner === owner && s.priority === "durable",
        )
      )
        throw new ExecutionError("RATE_LIMITED", "DURABLE_PENDING");
      for (const slot of [...this.slots.values()])
        if (slot.editor === editor) this.cancel(slot, "CANCELLED");
    } else {
      if (
        [...this.slots.values()].some(
          (s) => s.owner === owner && s.priority === "durable",
        )
      )
        throw new ExecutionError("RATE_LIMITED");
      // Preempt a CPU-bound preview before admission. Never cancel accepted durable work.
      if (this.active?.priority === "preview")
        this.cancel(this.active, "CANCELLED");
      while (
        this.slots.size >=
        (this.active ? EXECUTION_BOUNDS.queue + 1 : EXECUTION_BOUNDS.queue)
      ) {
        const preview = this.queue.find((s) => s.priority === "preview");
        if (!preview) break;
        this.cancel(preview, "CANCELLED");
      }
    }
    if (
      this.slots.size >=
      (this.active ? EXECUTION_BOUNDS.queue + 1 : EXECUTION_BOUNDS.queue)
    )
      throw new ExecutionError("RATE_LIMITED");
    const deadline =
      priority === "durable"
        ? EXECUTION_BOUNDS.durableMs
        : EXECUTION_BOUNDS.previewMs;
    const expiresAt = Date.now() + deadline;
    let resolve!: (value: ComputeResult) => void,
      reject!: (error: ExecutionError) => void;
    const result = new Promise<ComputeResult>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    void result.catch(() => undefined); // Provisional reservations may expire before a caller starts/persists them.
    const slot: Slot = {
      id: randomUUID(),
      owner,
      priority,
      editor,
      resolve,
      reject,
      result,
      expiresAt,
      timer: setTimeout(() => this.cancel(slot, "TIMEOUT"), deadline),
    };
    this.slots.set(slot.id, slot);
    this.queue.push(slot);
    if (editor)
      this.latestPreview.set(editor, {
        sequence: admission.sequence!,
        expiresAt: Date.now() + EXECUTION_BOUNDS.previewTtlMs,
      });
    if (priority === "preview" && admission.signal) {
      const abort = () => this.cancel(slot, "CANCELLED");
      admission.signal.addEventListener("abort", abort, { once: true });
      slot.removeAbort = () =>
        admission.signal!.removeEventListener("abort", abort);
    }
    return {
      id: slot.id,
      expiresAt,
      result,
      start: (calculation) => {
        if (!this.slots.has(slot.id)) throw new ExecutionError("TIMEOUT");
        if (Date.now() >= slot.expiresAt) {
          this.cancel(slot, "TIMEOUT");
          throw new ExecutionError("TIMEOUT");
        }
        if (slot.calculation)
          throw new TypeError("Reservation already started");
        try {
          const parsed = calculationSchema.parse(calculation);
          if ((priority === "preview") !== (parsed.kind === "preview"))
            throw new TypeError(
              "Calculation priority differs from reservation",
            );
          slot.calculation = parsed;
          this.pump();
        } catch (error) {
          this.cancel(slot, "CANCELLED");
          throw error;
        }
      },
      release: () => this.cancel(slot, "CANCELLED"),
    };
  }

  submit(
    owner: string,
    calculation: Calculation,
    admission: Admission = {},
  ): Promise<ComputeResult> {
    const parsed = calculationSchema.parse(calculation); // reject malformed input before consuming capacity
    const reservation = this.reserve(
      owner,
      parsed.kind === "preview" ? "preview" : "durable",
      admission,
    );
    reservation.start(parsed);
    return reservation.result;
  }
  cancelReservation(id: string) {
    const slot = this.slots.get(id);
    if (slot) this.cancel(slot, "CANCELLED");
  }
  cancelOwner(owner: string) {
    for (const slot of [...this.slots.values()])
      if (slot.owner === owner) this.cancel(slot, "CANCELLED");
    for (const key of this.latestPreview.keys())
      if (key.startsWith(owner + ":")) this.latestPreview.delete(key);
  }
  async close() {
    this.closed = true;
    for (const slot of [...this.slots.values()])
      this.cancel(slot, "UNAVAILABLE");
    this.latestPreview.clear();
    await this.retire();
  }
  private expirePreviewEntries() {
    const now = Date.now();
    for (const [key, value] of this.latestPreview)
      if (value.expiresAt <= now) this.latestPreview.delete(key);
  }
  private finish(slot: Slot) {
    clearTimeout(slot.timer);
    slot.removeAbort?.();
    this.slots.delete(slot.id);
    this.queue = this.queue.filter((s) => s !== slot);
    if (this.active === slot) this.active = undefined;
  }
  private cancel(slot: Slot, code: ExecutionCode) {
    if (!this.slots.has(slot.id)) return;
    const running = this.active === slot;
    this.finish(slot);
    slot.reject(new ExecutionError(code));
    if (running) void this.retire();
    else this.pump();
  }
  private async retire() {
    if (this.retiring) return this.retiring;
    const worker = this.worker;
    this.worker = undefined;
    if (!worker) {
      this.pump();
      return;
    }
    this.retiring = worker
      .terminate()
      .catch(() => undefined)
      .finally(() => {
        this.retiring = undefined;
        this.pump();
      });
    return this.retiring;
  }
  private pump() {
    if (this.closed || this.active || this.retiring) return;
    const ready = this.queue.filter((s) => s.calculation);
    const next = ready.find((s) => s.priority === "durable") ?? ready[0];
    if (!next) return;
    if (Date.now() >= next.expiresAt) {
      this.cancel(next, "TIMEOUT");
      return;
    }
    this.queue = this.queue.filter((s) => s !== next);
    this.active = next;
    try {
      if (!this.worker) {
        const worker = this.factory();
        this.worker = worker;
        worker.on("message", (message: unknown) => {
          if (this.worker === worker) this.message(message);
        });
        worker.on("error", () => {
          if (this.worker === worker) this.workerFailed();
        });
        worker.on("exit", () => {
          if (this.worker === worker) this.workerFailed();
        });
      }
      this.worker.postMessage({ id: next.id, calculation: next.calculation });
    } catch {
      this.workerFailed();
    }
  }
  private message(value: unknown) {
    const slot = this.active;
    if (slot && Date.now() >= slot.expiresAt) {
      this.cancel(slot, "TIMEOUT");
      return;
    }
    if (!slot || !value || typeof value !== "object") {
      this.workerFailed();
      return;
    }
    const message = value as {
      id?: unknown;
      result?: unknown;
      error?: { code?: unknown };
      diagnostics?: { elapsedMs?: unknown; postCalculationHeapBytes?: unknown };
    };
    if (message.id !== slot.id) {
      this.workerFailed();
      return;
    }
    if (message.error) {
      const code = message.error.code;
      const safe =
        code === "COMPLEXITY_LIMIT" || code === "COMPUTE_FAILED"
          ? code
          : "WORKER_CRASH";
      this.finish(slot);
      slot.reject(new ExecutionError(safe));
      this.pump();
      return;
    }
    const parsed = computeResultSchema.safeParse(message.result);
    if (!parsed.success) {
      this.workerFailed();
      return;
    }
    const result = parsed.data,
      calculation = slot.calculation!;
    const identityOk =
      result.fingerprint === inputFingerprint(calculation.snapshot);
    const shapeOk = result.validation.ok
      ? calculation.kind === "preview"
        ? result.preview !== null && result.output === null
        : result.output?.kind === calculation.kind && result.preview === null
      : result.output === null && result.preview === null;
    if (!identityOk || !shapeOk) {
      this.workerFailed();
      return;
    }
    const diagnostics = message.diagnostics;
    if (
      diagnostics &&
      typeof diagnostics.elapsedMs === "number" &&
      Number.isFinite(diagnostics.elapsedMs) &&
      typeof diagnostics.postCalculationHeapBytes === "number" &&
      Number.isFinite(diagnostics.postCalculationHeapBytes)
    )
      this.lastDiagnostics = {
        elapsedMs: diagnostics.elapsedMs,
        postCalculationHeapBytes: diagnostics.postCalculationHeapBytes,
      };
    this.finish(slot);
    slot.resolve(parsed.data);
    this.pump();
  }
  private workerFailed() {
    const slot = this.active;
    if (slot) {
      this.finish(slot);
      slot.reject(new ExecutionError("WORKER_CRASH"));
    }
    void this.retire();
  }
}
