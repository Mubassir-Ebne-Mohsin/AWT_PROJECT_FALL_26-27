/** Saved calculations open in the view that matches their stored kind (M8). */
export type RunKind = "simulation" | "limits";
export interface RunRef {
  id: string;
  kind: RunKind;
}
export interface Selection {
  run?: string;
  limits?: string;
  /** M12: retained explanation job id, so a reload can find the accepted job. Never a secret. */
  explain?: string;
}

/** ?run= selects a recorded simulation; ?limits= selects a saved Limits search. Both survive tab changes. */
export function workspaceHref(designId: string, tab: string, sel: Selection = {}) {
  const q = new URLSearchParams();
  if (sel.run) q.set("run", sel.run);
  if (sel.limits) q.set("limits", sel.limits);
  if (sel.explain) q.set("explain", sel.explain);
  const s = q.toString();
  return `/designs/${designId}/${tab}${s ? "?" + s : ""}`;
}

export function runHref(designId: string, run: RunRef) {
  return run.kind === "limits"
    ? workspaceHref(designId, "limits", { limits: run.id })
    : workspaceHref(designId, "results", { run: run.id });
}

export const kindLabel = (kind: RunKind) => (kind === "limits" ? "Limits search" : "Test run");
