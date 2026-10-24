import type { Design, DesignRun, Graph, AcceptedRun } from "@/lib/api/designs";
import { saveDesign, submitRun } from "@/lib/api/designs";
import { stableJson } from "@/lib/stable-json";
import { ApiError } from "@/lib/api/errors";
export interface RunIntent { requestId: string; expectedRevision: number; startedAt: number }
export interface EditorState { design: Design; saved: Design; saving: boolean; running: boolean; error: string; conflict: boolean; intent?: RunIntent; run?: DesignRun }
const sameDraft = (a: Design, b: Design) => stableJson([a.name,a.graph,a.traffic]) === stableJson([b.name,b.graph,b.traffic]);
export const semanticInput = (d: Design) => stableJson([d.graph.nodes.map(n => ({ id: n.id, label: n.label, type: n.type, props: n.props })), d.graph.edges.map(e => ({from: e.from, to: e.to})), d.traffic]);
/** One memory-only session survives route/system-screen unmounts. A save acknowledges only its submitted draft. */
export class EditorSession {
  state: EditorState;
  private listeners = new Set<() => void>();
  private saving?: Promise<void>;
  private disposed = false;
  constructor(design: Design, private patch = saveDesign, private submit = submitRun) { this.state = { design, saved: design, saving: false, running: false, error: "", conflict: false }; }
  getSnapshot = () => this.state;
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  get dirty() { return !sameDraft(this.state.design, this.state.saved); }
  get hasUnsettledWork() { return this.dirty || this.state.saving || this.state.running || !!this.state.intent; }
  receiveServer(design: Design) {
    if (design.id === this.state.design.id && !this.dirty && !this.state.saving && design.revision > this.state.saved.revision) this.update({ design, saved: design, error: "", conflict: false });
  }
  private update(value: Partial<EditorState>) { if (!this.disposed) { this.state = { ...this.state, ...value }; this.listeners.forEach(fn => fn()); } }
  edit(graph: Graph) { this.update({ design: { ...this.state.design, graph }, error: this.state.conflict ? this.state.error : "" }); }
  rename(name: string) { this.update({ design: { ...this.state.design, name }, error: this.state.conflict ? this.state.error : "" }); }
  async save(): Promise<void> {
    if (this.disposed) throw new Error("This account session has ended");
    if (this.saving) { await this.saving; if (this.dirty) return this.save(); return; }
    if (!this.dirty) return;
    if (this.state.conflict) throw new Error("Resolve the save conflict first");
    const submitted = structuredClone(this.state.design);
    this.update({ saving: true, error: "" });
    this.saving = (async () => {
      try {
        const saved = await this.patch(submitted.id, { expectedRevision: this.state.saved.revision, name: submitted.name, graph: submitted.graph, traffic: submitted.traffic });
        const current = this.state.design;
        // Adopt canonical server values only where no newer edit superseded this submission.
        this.update({ saved, design: { ...current,
          name: current.name === submitted.name ? saved.name : current.name,
          graph: stableJson(current.graph) === stableJson(submitted.graph) ? saved.graph : current.graph,
          traffic: stableJson(current.traffic) === stableJson(submitted.traffic) ? saved.traffic : current.traffic,
          revision: saved.revision, updatedAt: saved.updatedAt } });
      } catch (error) {
        this.update({ error: error instanceof Error ? error.message : "Save failed", conflict: error instanceof ApiError && error.code === "CONFLICT" });
        throw error;
      } finally { this.update({ saving: false }); this.saving = undefined; }
    })();
    await this.saving;
  }
  reload(design: Design) { this.update({ design, saved: design, error: "", conflict: false }); }
  reapply(current: Design) { this.update({ saved: current, design: { ...this.state.design, revision: current.revision }, conflict: false, error: "" }); }
  abandonUncertainIntent() { this.update({ intent: undefined, error: "" }); }
  setRun(run: DesignRun) { this.update({ run }); }
  get stale() { return this.isRunStale(this.state.run); }
  isRunStale(r?: DesignRun) { return !!r && (r.designRevision !== this.state.saved.revision || semanticInput(this.state.design) !== semanticInput({ ...this.state.design, graph: r.snapshot.graph, traffic: r.snapshot.traffic })); }
  async run(): Promise<AcceptedRun> {
    if (this.disposed) throw new Error("This account session has ended");
    if (this.state.running) throw new Error("Submission already in progress");
    this.update({ running: true, error: "" });
    try {
      let intent = this.state.intent;
      if (!intent) {
        // Flush edits made during an in-flight save, not just the first submitted snapshot.
        do { await this.save(); } while (this.dirty);
        intent = { requestId: crypto.randomUUID(), expectedRevision: this.state.saved.revision, startedAt: Date.now() };
        this.update({ intent });
      }
      if (Date.now() - intent.startedAt >= 24 * 3600000) throw new Error("Acceptance is unknown beyond the 24-hour retry guarantee. Check stored runs before starting a new calculation.");
      if (this.disposed) throw new Error("This account session has ended");
      const accepted = await this.submit(this.state.design.id, { requestId: intent.requestId, expectedRevision: intent.expectedRevision });
      if (this.disposed) throw new Error("This account session has ended");
      this.update({ run: accepted.run, intent: undefined });
      return accepted;
    } catch (error) {
      // Network/5xx can hide acceptance. Preserve the original request identity for Retry.
      if (error instanceof ApiError && [404, 409, 422].includes(error.status)) this.update({ intent: undefined });
      this.update({ error: error instanceof Error ? error.message : "Run submission failed" });
      throw error;
    } finally { this.update({ running: false }); }
  }
  dispose() { this.disposed = true; this.listeners.clear(); }
}
