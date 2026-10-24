import type { Design } from "@/lib/api/designs";
import { stableJson } from "@/lib/stable-json";
export type Draft = Pick<Design, "name" | "graph" | "traffic">;
const snapshot = (d: Draft): Draft => structuredClone({name:d.name, graph:d.graph, traffic:d.traffic});
/** Local input history, never server revisions, run identities or viewport state. */
export class EditorHistory {
  past: Draft[] = [];
  future: Draft[] = [];
  private lastKey?: string;
  private lastAt = 0;
  record(before: Draft, after: Draft, key?: string, now = Date.now()) {
    if (stableJson(snapshot(before)) === stableJson(snapshot(after))) return false;
    if (!key || key !== this.lastKey || now - this.lastAt >= 1500)
      this.past = [...this.past.slice(-59), snapshot(before)];
    this.future = [];
    this.lastKey = key;
    this.lastAt = now;
    return true;
  }
  undo(current: Draft) {
    const target = this.past.pop();
    if (!target) return;
    this.future.push(snapshot(current));
    this.lastKey = undefined;
    return target;
  }
  redo(current: Draft) {
    const target = this.future.pop();
    if (!target) return;
    this.past.push(snapshot(current));
    this.lastKey = undefined;
    return target;
  }
  clear() { this.past=[]; this.future=[]; this.lastKey=undefined; }
}
