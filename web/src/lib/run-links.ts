/** Saved calculations open in the view that matches their stored kind (M8). */
export type RunKind = "simulation" | "limits";
export interface RunRef {
  id: string;
  kind: RunKind;
}
export interface Selection {
  run?: string;
  limits?: string;
}

/** ?run= selects a recorded simulation; ?limits= selects a saved Limits search. Both survive tab changes. */
export function workspaceHref(designId: string, tab: string, sel: Selection = {}) {
  const q = new URLSearchParams();
  if (sel.run) q.set("run", sel.run);
  if (sel.limits) q.set("limits", sel.limits);
  const s = q.toString();
  return `/designs/${designId}/${tab}${s ? "?" + s : ""}`;
}

export function runHref(designId: string, run: RunRef) {
  return run.kind === "limits"
    ? workspaceHref(designId, "limits", { limits: run.id })
    : workspaceHref(designId, "results", { run: run.id });
}

export const kindLabel = (kind: RunKind) => (kind === "limits" ? "Limits search" : "Test run");
