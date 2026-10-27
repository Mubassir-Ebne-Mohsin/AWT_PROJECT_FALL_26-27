import type { components } from "@/lib/api/schema";
import type { Design } from "@/lib/api/designs";
import { previewSimulation } from "@/lib/api/designs";
import { ApiError } from "@/lib/api/errors";
import { semanticInput } from "@/lib/editor-session";

export type PreviewSummary = NonNullable<components["schemas"]["PreviewResponse"]["summary"]>;
export type PreviewValidation = components["schemas"]["PreviewResponse"]["validation"];
export type PreviewStatus = "off" | "idle" | "waiting" | "loading" | "ready" | "paused" | "error";
export interface PreviewState {
  status: PreviewStatus;
  /** Last accepted output and the exact semantic inputs it describes. */
  summary?: PreviewSummary | null;
  validation?: PreviewValidation;
  forKey?: string;
  /** Inline explanation for paused/error states; never a global system screen. */
  message?: string;
  retryable?: boolean;
}

export const PREVIEW_DEBOUNCE_MS = 750;
type Send = typeof previewSimulation;
interface Timers {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
}
const realTimers: Timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };

/**
 * One latest-only, cancelable live preview per editor session (user + design).
 * A reply is accepted only if it matches this session, the newest sequence and the current semantic inputs.
 * Layout-only edits (positions, names, view state) never trigger a calculation. Nothing is persisted.
 */
export class PreviewSession {
  state: PreviewState = { status: "off" };
  editorSessionId: string;
  private sequence = 0;
  private listeners = new Set<() => void>();
  private timer: unknown;
  private inflight?: { controller: AbortController; sequence: number; key: string };
  private latest?: { key: string; design: Design };
  private paused?: string;
  private disposed = false;

  constructor(
    private send: Send = previewSimulation,
    private timers: Timers = realTimers,
    private debounceMs = PREVIEW_DEBOUNCE_MS,
    editorSessionId: string = crypto.randomUUID(),
  ) {
    this.editorSessionId = editorSessionId;
  }
  getSnapshot = () => this.state;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  get enabled() {
    return this.state.status !== "off";
  }
  /** Current output is shown as current only if it was computed for exactly these inputs. */
  isCurrent(design: Design) {
    return this.state.forKey !== undefined && this.state.forKey === semanticInput(design);
  }
  private update(value: Partial<PreviewState>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...value };
    this.listeners.forEach((fn) => fn());
  }
  enable(design: Design) {
    if (this.disposed || this.enabled) return;
    this.update({ status: "idle", message: undefined });
    this.setInput(design);
  }
  disable() {
    this.cancel();
    this.update({ status: "off", message: undefined });
  }
  /** Called on every draft change; only semantic changes schedule a (debounced) request. */
  setInput(design: Design, pausedReason?: string) {
    if (this.disposed || !this.enabled) return;
    const key = semanticInput(design);
    const changed = key !== this.latest?.key;
    this.latest = { key, design };
    if (pausedReason) {
      this.paused = pausedReason;
      this.cancel();
      this.update({ status: "paused", message: pausedReason, retryable: false });
      return;
    }
    const resumed = this.paused !== undefined;
    this.paused = undefined;
    if (this.state.forKey === key) {
      // Output for exactly these inputs already exists (e.g. after Undo): show it, no request.
      this.cancel();
      this.update({ status: "ready", message: undefined });
      return;
    }
    // Same inputs: never re-request on re-render or layout moves, and never auto-retry a failure.
    if (
      !changed &&
      !resumed &&
      (this.inflight?.key === key ||
        this.timer !== undefined ||
        this.state.status === "error" ||
        this.state.status === "paused")
    )
      return;
    this.schedule();
  }
  /** Explicit user retry after an inline failure; there is no automatic retry loop. */
  retry() {
    if (this.disposed || !this.enabled || !this.latest || this.paused) return;
    this.cancel();
    this.fire();
  }
  private schedule() {
    this.timers.clear(this.timer);
    this.update({ status: "waiting", message: undefined });
    this.timer = this.timers.set(() => this.fire(), this.debounceMs);
  }
  private cancel() {
    this.timers.clear(this.timer);
    this.timer = undefined;
    this.inflight?.controller.abort();
    this.inflight = undefined;
  }
  private async fire() {
    this.timer = undefined;
    const latest = this.latest;
    if (this.disposed || !latest || this.paused) return;
    this.inflight?.controller.abort();
    const controller = new AbortController(),
      sequence = ++this.sequence;
    this.inflight = { controller, sequence, key: latest.key };
    this.update({ status: "loading", message: undefined });
    try {
      const reply = await this.send(
        {
          editorSessionId: this.editorSessionId,
          sequence,
          schemaVersion: 1,
          graph: latest.design.graph,
          traffic: latest.design.traffic,
        },
        controller.signal,
      );
      if (!this.accepts(sequence, latest.key, reply)) return;
      this.inflight = undefined;
      this.update({
        status: "ready",
        summary: reply.summary,
        validation: reply.validation,
        forKey: latest.key,
        message: reply.summary ? undefined : "Fix the graph to see a live preview.",
        retryable: false,
      });
    } catch (error) {
      if (controller.signal.aborted || this.disposed || this.inflight?.sequence !== sequence) return;
      this.inflight = undefined;
      this.update(failureState(error));
    }
  }
  private accepts(sequence: number, key: string, reply: { editorSessionId: string; sequence: number }) {
    return (
      !this.disposed &&
      this.enabled &&
      !this.paused &&
      this.inflight?.sequence === sequence &&
      reply.editorSessionId === this.editorSessionId &&
      reply.sequence === sequence &&
      this.latest?.key === key
    );
  }
  /** Fresh identity (e.g. after same-account reauthentication); the draft stays, old replies are ignored. */
  renew() {
    this.cancel();
    this.editorSessionId = crypto.randomUUID();
    this.sequence = 0;
    if (this.enabled && this.latest && !this.paused) this.schedule();
  }
  dispose() {
    this.cancel();
    this.disposed = true;
    this.listeners.clear();
  }
}

function failureState(error: unknown): Partial<PreviewState> {
  const reason = error instanceof ApiError ? (error.details as { reason?: string } | undefined)?.reason : undefined;
  if (reason === "PREVIEW_SUPERSEDED") return { status: "idle", message: undefined, retryable: false };
  if (reason === "DURABLE_PENDING")
    return { status: "paused", message: "Live preview pauses while your saved calculation runs.", retryable: true };
  if (error instanceof ApiError && error.code === "RATE_LIMITED")
    return { status: "error", message: "Preview capacity is busy. Retry in a moment; editing still works.", retryable: true };
  if (reason === "COMPLEXITY_LIMIT")
    return { status: "error", message: "This design exceeds the supported calculation budget. Simplify its branching.", retryable: false };
  if (reason === "PREVIEW_TIMEOUT")
    return { status: "error", message: "The preview did not finish in time. Retry, or run a saved test.", retryable: true };
  return { status: "error", message: "Live preview is unavailable right now. You can keep editing and retry shortly.", retryable: true };
}
