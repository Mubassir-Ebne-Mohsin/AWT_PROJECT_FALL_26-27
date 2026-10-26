import type { Design, DesignRun, Graph, AcceptedRun } from "@/lib/api/designs";
import {
  saveDesign,
  submitRun,
  submitLimits,
  validateDesign,
  type Validation,
} from "@/lib/api/designs";
import { EditorHistory } from "@/lib/editor-history";
import { stableJson } from "@/lib/stable-json";
import { trafficSchema, type Traffic } from "@/lib/traffic";
import { ApiError } from "@/lib/api/errors";
export interface RunIntent {
  requestId: string;
  expectedRevision: number;
  startedAt: number;
}
export interface EditorState {
  design: Design;
  saved: Design;
  saving: boolean;
  running: boolean;
  gesture: boolean;
  inputErrors: string[];
  error: string;
  conflict: boolean;
  intent?: RunIntent;
  run?: DesignRun;
  /** M8: a saved Limits search keeps its own identity, never shared with simulation. */
  limitsRunning: boolean;
  limitsIntent?: RunIntent;
  limitsRun?: DesignRun;
  canUndo: boolean;
  canRedo: boolean;
  checking: boolean;
  /** M8: live preview preference for this user/design, memory only; not history, not saved. */
  livePreview: boolean;
  validation?: { revision: number; input: string; result: Validation };
}
const sameDraft = (a: Design, b: Design) =>
  stableJson([a.name, a.graph, a.traffic]) ===
  stableJson([b.name, b.graph, b.traffic]);
export const semanticInput = (d: Design) =>
  stableJson([
    d.graph.nodes.map((n) => ({
      id: n.id,
      label: n.label,
      type: n.type,
      props: n.props,
    })),
    d.graph.edges.map((e) => ({ from: e.from, to: e.to })),
    d.traffic,
  ]);
/** One memory-only session survives route/system-screen unmounts. Revisions are never undoable. */
export class EditorSession {
  state: EditorState;
  private listeners = new Set<() => void>();
  private saving?: Promise<void>;
  private disposed = false;
  private history = new EditorHistory();
  private checkSequence = 0;
  constructor(
    design: Design,
    private patch = saveDesign,
    private submit = submitRun,
    private validate = validateDesign,
    private submitLimitsRun = submitLimits,
  ) {
    this.state = {
      design,
      saved: design,
      saving: false,
      running: false,
      limitsRunning: false,
      gesture: false,
      inputErrors: [],
      error: "",
      conflict: false,
      canUndo: false,
      canRedo: false,
      checking: false,
      livePreview: false,
    };
  }
  setLivePreview(on: boolean) {
    if (!this.disposed && on !== this.state.livePreview) this.update({ livePreview: on });
  }
  getSnapshot = () => this.state;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  get dirty() {
    return !sameDraft(this.state.design, this.state.saved);
  }
  get hasUnsettledWork() {
    return (
      this.state.gesture ||
      this.state.inputErrors.length > 0 ||
      this.dirty ||
      this.state.saving ||
      this.state.running ||
      this.state.limitsRunning ||
      this.state.checking ||
      !!this.state.intent ||
      !!this.state.limitsIntent
    );
  }
  receiveServer(design: Design) {
    if (
      design.id === this.state.design.id &&
      !this.dirty &&
      !this.state.saving &&
      !this.state.gesture &&
      !this.state.inputErrors.length &&
      design.revision > this.state.saved.revision
    )
      this.reload(design);
  }
  private update(value: Partial<EditorState>) {
    if (!this.disposed) {
      this.state = {
        ...this.state,
        ...value,
        canUndo: this.history.past.length > 0,
        canRedo: this.history.future.length > 0,
      };
      this.listeners.forEach((fn) => fn());
    }
  }
  beginGesture() {
    this.update({ gesture: true });
  }
  endGesture(graph?: Graph) {
    this.update({ gesture: false });
    if (graph) this.edit(graph);
  }
  inputError(key: string, invalid: boolean) {
    const inputErrors = this.state.inputErrors.filter((k) => k !== key);
    if (invalid) inputErrors.push(key);
    if (inputErrors.join("|") !== this.state.inputErrors.join("|"))
      this.update({ inputErrors });
  }
  edit(graph: Graph, key?: string) {
    if (this.disposed) return;
    const design = { ...this.state.design, graph };
    if (this.history.record(this.state.design, design, key))
      this.update({
        design,
        error: this.state.conflict ? this.state.error : "",
      });
  }
  setTraffic(patch: Partial<Traffic>, preset = false) {
    if (this.disposed) return;
    const traffic = trafficSchema.parse({
      ...this.state.design.traffic,
      ...patch,
      ...(preset ? {} : { preset: "custom" }),
    });
    const design = { ...this.state.design, traffic };
    const key = preset
      ? undefined
      : "traffic:" + Object.keys(patch).sort().join(",");
    if (this.history.record(this.state.design, design, key))
      this.update({
        design,
        error: this.state.conflict ? this.state.error : "",
      });
  }
  setUserRegion(region: "us-east" | "eu-west" | "ap-south") {
    if (
      this.disposed ||
      !this.state.design.graph.nodes.some((n) => n.type === "client")
    )
      return;
    if (!["us-east", "eu-west", "ap-south"].includes(region))
      throw new Error("Unsupported region");
    this.edit(
      {
        ...this.state.design.graph,
        nodes: this.state.design.graph.nodes.map((n) =>
          n.type === "client" ? { ...n, props: { ...n.props, region } } : n,
        ),
      },
      undefined,
    );
  }
  rename(name: string) {
    if (this.disposed) return;
    const design = { ...this.state.design, name };
    if (this.history.record(this.state.design, design, "name"))
      this.update({
        design,
        error: this.state.conflict ? this.state.error : "",
      });
  }
  undo() {
    this.travel("undo");
  }
  redo() {
    this.travel("redo");
  }
  private travel(direction: "undo" | "redo") {
    if (this.disposed || this.state.gesture || this.state.inputErrors.length)
      return;
    const draft = this.history[direction](this.state.design);
    if (draft)
      this.update({
        design: { ...this.state.design, ...draft },
        error: this.state.conflict ? this.state.error : "",
      });
  }
  get validationStale() {
    const v = this.state.validation;
    return (
      !!v &&
      (v.revision !== this.state.saved.revision ||
        v.input !== semanticInput(this.state.design))
    );
  }
  async check() {
    if (this.disposed || this.state.checking) return;
    const sequence = ++this.checkSequence;
    this.update({
      checking: true,
      error: this.state.conflict ? this.state.error : "",
    });
    try {
      do {
        await this.save();
      } while (this.dirty);
      if (this.disposed) return;
      const saved = structuredClone(this.state.saved),
        result = await this.validate(saved.id, saved.revision);
      if (
        !this.disposed &&
        sequence === this.checkSequence &&
        this.state.saved.revision === saved.revision &&
        semanticInput(this.state.design) === semanticInput(saved)
      )
        this.update({
          validation: {
            revision: saved.revision,
            input: semanticInput(saved),
            result,
          },
        });
    } catch (error) {
      this.update({
        error: error instanceof Error ? error.message : "Graph check failed",
        conflict: error instanceof ApiError && error.code === "CONFLICT",
      });
      throw error;
    } finally {
      if (sequence === this.checkSequence) this.update({ checking: false });
    }
  }
  async save(): Promise<void> {
    if (this.disposed) throw new Error("This account session has ended");
    if (this.state.gesture || this.state.inputErrors.length)
      throw new Error(
        "Finish moving or correct the highlighted input before saving.",
      );
    if (this.saving) {
      await this.saving;
      if (this.dirty) return this.save();
      return;
    }
    if (!this.dirty) return;
    if (this.state.conflict) throw new Error("Resolve the save conflict first");
    const submitted = structuredClone(this.state.design);
    this.update({ saving: true, error: "" });
    this.saving = (async () => {
      try {
        const saved = await this.patch(submitted.id, {
          expectedRevision: this.state.saved.revision,
          name: submitted.name,
          graph: submitted.graph,
          traffic: submitted.traffic,
        });
        const current = this.state.design;
        // An acknowledgement applies only to the inputs submitted, preserving newer edits/undo.
        this.update({
          saved,
          design: {
            ...current,
            name: current.name === submitted.name ? saved.name : current.name,
            graph:
              stableJson(current.graph) === stableJson(submitted.graph)
                ? saved.graph
                : current.graph,
            traffic:
              stableJson(current.traffic) === stableJson(submitted.traffic)
                ? saved.traffic
                : current.traffic,
            revision: saved.revision,
            updatedAt: saved.updatedAt,
          },
        });
      } catch (error) {
        this.update({
          error: error instanceof Error ? error.message : "Save failed",
          conflict: error instanceof ApiError && error.code === "CONFLICT",
        });
        throw error;
      } finally {
        this.update({ saving: false });
        this.saving = undefined;
      }
    })();
    await this.saving;
  }
  reload(design: Design) {
    this.history.clear();
    this.checkSequence++;
    this.update({
      design,
      saved: design,
      error: "",
      conflict: false,
      validation: undefined,
      checking: false,
    });
  }
  reapply(current: Design) {
    // Rebase is an explicit new history boundary, never a replay of another tab's edits.
    this.history.clear();
    this.checkSequence++;
    this.update({
      saved: current,
      design: { ...this.state.design, revision: current.revision },
      conflict: false,
      error: "",
      validation: undefined,
      checking: false,
    });
  }
  abandonUncertainIntent(kind: "simulation" | "limits" = "simulation") {
    this.update(
      kind === "limits"
        ? { limitsIntent: undefined, error: "" }
        : { intent: undefined, error: "" },
    );
  }
  /** Stored kind decides the slot: a Limits run can never become the selected simulation (or vice versa). */
  setRun(run: DesignRun) {
    this.update(run.kind === "limits" ? { limitsRun: run } : { run });
  }
  get stale() {
    return this.isRunStale(this.state.run);
  }
  isRunStale(r?: DesignRun) {
    return (
      !!r &&
      semanticInput(this.state.design) !==
        semanticInput({
          ...this.state.design,
          graph: r.snapshot.graph,
          traffic: r.snapshot.traffic,
        })
    );
  }
  run(): Promise<AcceptedRun> {
    return this.calculate("simulation");
  }
  findLimits(): Promise<AcceptedRun> {
    return this.calculate("limits");
  }
  private calculate(kind: "simulation" | "limits"): Promise<AcceptedRun> {
    const limits = kind === "limits";
    const slot = {
      intent: () => (limits ? this.state.limitsIntent : this.state.intent),
      setIntent: (intent?: RunIntent) =>
        this.update(limits ? { limitsIntent: intent } : { intent }),
      setRunning: (running: boolean) =>
        this.update(limits ? { limitsRunning: running } : { running }),
      setRun: (run: DesignRun) =>
        this.update(
          limits
            ? { limitsRun: run, limitsIntent: undefined }
            : { run, intent: undefined },
        ),
      submit: limits ? this.submitLimitsRun : this.submit,
    };
    return this.submitCalculation(slot);
  }
  private async submitCalculation(slot: {
    intent: () => RunIntent | undefined;
    setIntent: (intent?: RunIntent) => void;
    setRunning: (running: boolean) => void;
    setRun: (run: DesignRun) => void;
    submit: typeof submitRun;
  }): Promise<AcceptedRun> {
    if (this.disposed) throw new Error("This account session has ended");
    if (this.state.running || this.state.limitsRunning)
      throw new Error("Submission already in progress");
    slot.setRunning(true);
    this.update({ error: "" });
    try {
      let intent = slot.intent();
      if (!intent) {
        do {
          await this.save();
        } while (this.dirty);
        intent = {
          requestId: crypto.randomUUID(),
          expectedRevision: this.state.saved.revision,
          startedAt: Date.now(),
        };
        slot.setIntent(intent);
      }
      if (Date.now() - intent.startedAt >= 24 * 3600000)
        throw new Error(
          "Acceptance is unknown beyond the 24-hour retry guarantee. Check stored runs before starting a new calculation.",
        );
      if (this.disposed) throw new Error("This account session has ended");
      const accepted = await slot.submit(this.state.design.id, {
        requestId: intent.requestId,
        expectedRevision: intent.expectedRevision,
      });
      if (this.disposed) throw new Error("This account session has ended");
      slot.setRun(accepted.run);
      return accepted;
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 422 &&
        slot.intent()?.expectedRevision === this.state.saved.revision
      ) {
        const result = (
          error.details as { validation?: Validation } | undefined
        )?.validation;
        if (
          result &&
          Array.isArray(result.errors) &&
          Array.isArray(result.warnings)
        )
          this.update({
            validation: {
              revision: this.state.saved.revision,
              input: semanticInput(this.state.saved),
              result,
            },
          });
      }
      // Network/5xx can hide acceptance: preserve identity for Retry.
      if (error instanceof ApiError && [404, 409, 422].includes(error.status))
        slot.setIntent(undefined);
      this.update({
        error: error instanceof Error ? error.message : "Run submission failed",
      });
      throw error;
    } finally {
      slot.setRunning(false);
    }
  }
  dispose() {
    this.history.clear();
    this.checkSequence++;
    this.state = {
      ...this.state,
      canUndo: false,
      canRedo: false,
      validation: undefined,
    };
    this.disposed = true;
    this.listeners.clear();
  }
}
