import type { Design } from "@/lib/api/designs";
import type { DesignVersion, RunSummary } from "@/lib/api/history";
import { numberText, percent } from "@/lib/result-presentation";

/** Honest retention wording: M11 keeps the newest 100 versions per design (plus any an AI job still references). */
export const RETENTION_TEXT = "The latest 100 versions are kept; older ones may be removed. Recorded runs follow their own retention.";

export function versionOrigin(v: Pick<DesignVersion, "origin" | "restoredFromRevision">): { label: string; note?: string } {
  switch (v.origin) {
    case "baseline":
      return { label: "Imported current snapshot", note: "Earlier history was not recorded for this design." };
    case "create":
      return { label: "Created" };
    case "restore":
      return { label: v.restoredFromRevision ? `Restored from revision ${v.restoredFromRevision}` : "Restored from an earlier revision" };
    default:
      return { label: "Saved edit" };
  }
}

export function snapshotSummary(d: Pick<Design, "graph" | "traffic">) {
  const nodes = d.graph.nodes.length,
    edges = d.graph.edges.length;
  return `${nodes} component${nodes === 1 ? "" : "s"} · ${edges} connection${edges === 1 ? "" : "s"} · ${numberText(d.traffic.rps, 0)} rps`;
}

export function verdictLabel(v: RunSummary["verdict"]) {
  return v === "pass" ? "Passes" : v === "strained" ? "Strained" : v === "fail" ? "Breaks" : "No verdict";
}
export function runLabel(r: Pick<RunSummary, "kind" | "status">) {
  const what = r.kind === "limits" ? "Limits search" : "Test run";
  return r.status === "pending" ? `${what} (running)` : r.status === "failed" ? `${what} (failed)` : what;
}

export function groupRunsByRevision(runs: RunSummary[]) {
  const map = new Map<number, RunSummary[]>();
  for (const run of runs) map.set(run.designRevision, [...(map.get(run.designRevision) ?? []), run]);
  return map;
}

const stable = (value: unknown): string =>
  JSON.stringify(value, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)))
      : v,
  );

const TRAFFIC_LABEL: Record<string, string> = {
  preset: "Preset",
  rps: "Traffic",
  burst: "Burst",
  readRatio: "Read share",
  sloP95: "p95 target",
  errorBudget: "Error budget",
  durationMin: "Duration",
  shape: "Shape",
};
function trafficValue(key: string, value: unknown) {
  if (typeof value !== "number") return String(value);
  if (key === "rps") return `${numberText(value, 0)} rps`;
  if (key === "sloP95") return `${numberText(value, 0)} ms`;
  if (key === "readRatio" || key === "errorBudget") return percent(value);
  if (key === "durationMin") return `${numberText(value, 0)} min`;
  if (key === "burst") return `×${numberText(value, 2)}`;
  return numberText(value);
}
const names = (labels: string[]) => (labels.length > 3 ? `${labels.slice(0, 3).join(", ")} and ${labels.length - 3} more` : labels.join(", "));
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * What restoring `target` would change in the current saved design, in plain language.
 * Compares saved content only: the editor's unsaved draft is never part of a restore.
 */
export function restoreChanges(current: Design, target: Design): string[] {
  const lines: string[] = [];
  if (current.name !== target.name) lines.push(`Name: “${current.name}” → “${target.name}”`);
  if (current.description !== target.description) lines.push("Description changes");
  for (const key of Object.keys(TRAFFIC_LABEL)) {
    const a = (current.traffic as Record<string, unknown>)[key],
      b = (target.traffic as Record<string, unknown>)[key];
    if (stable(a) !== stable(b)) lines.push(`${TRAFFIC_LABEL[key]}: ${trafficValue(key, a)} → ${trafficValue(key, b)}`);
  }
  const now = new Map(current.graph.nodes.map((n) => [n.id, n])),
    then = new Map(target.graph.nodes.map((n) => [n.id, n]));
  const added = target.graph.nodes.filter((n) => !now.has(n.id)),
    removed = current.graph.nodes.filter((n) => !then.has(n.id));
  if (added.length) lines.push(`Adds ${plural(added.length, "component")}: ${names(added.map((n) => n.label))}`);
  if (removed.length) lines.push(`Removes ${plural(removed.length, "component")}: ${names(removed.map((n) => n.label))}`);
  let changed = 0,
    moved = 0;
  for (const [id, was] of now) {
    const is = then.get(id);
    if (!is) continue;
    const semantic = (n: typeof was) => stable({ type: n.type, label: n.label, props: n.props });
    if (semantic(was) !== semantic(is)) changed++;
    else if (was.x !== is.x || was.y !== is.y) moved++;
  }
  if (changed) lines.push(`Changes settings of ${plural(changed, "component")}`);
  if (moved) lines.push(`Moves ${plural(moved, "component")} (layout only)`);
  const key = (e: { from: string; to: string }) => `${e.from}>${e.to}`;
  const edgesNow = new Set(current.graph.edges.map(key)),
    edgesThen = new Set(target.graph.edges.map(key));
  const edgesAdded = [...edgesThen].filter((e) => !edgesNow.has(e)).length,
    edgesRemoved = [...edgesNow].filter((e) => !edgesThen.has(e)).length;
  if (edgesAdded) lines.push(`Adds ${plural(edgesAdded, "connection")}`);
  if (edgesRemoved) lines.push(`Removes ${plural(edgesRemoved, "connection")}`);
  return lines;
}

/** Why Restore is unavailable right now, or null. A draft is never discarded or silently overwritten. */
export function restoreBlockedReason(s: {
  dirty: boolean;
  saving: boolean;
  gesture: boolean;
  conflict: boolean;
  busyWithCalculation: boolean;
}): string | null {
  if (s.conflict) return "Resolve the save conflict first, then restore.";
  if (s.dirty || s.saving) return "You have unsaved changes. Save them first so nothing is lost, then restore.";
  if (s.gesture) return "Finish the current edit first.";
  if (s.busyWithCalculation) return "A calculation is running. Restore becomes available when it finishes.";
  return null;
}
