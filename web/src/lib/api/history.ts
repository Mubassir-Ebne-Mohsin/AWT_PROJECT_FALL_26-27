import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

type Schemas = components["schemas"];
export type DesignVersion = Schemas["DesignVersion"];
export type RunSummary = Schemas["RunSummary"];
export type RestoredDesign = Schemas["RestoredDesign"];
export type Comparison = Schemas["Comparison"];

export const VERSIONS_PAGE = 20;
export const RUNS_WINDOW = 50;

// History failures stay inside the History tab: a local scope never opens a global system screen.
// Session expiry is still announced so the normal re-authentication flow keeps working.
const local = { scope: "local" } as const;

export const fetchVersions = (designId: string, beforeRevision?: number, signal?: AbortSignal) =>
  api<DesignVersion[]>(
    `/designs/${designId}/versions?limit=${VERSIONS_PAGE}${beforeRevision ? `&beforeRevision=${beforeRevision}` : ""}`,
    { ...local, signal },
  );
export const fetchRunSummaries = (designId: string, signal?: AbortSignal) =>
  api<RunSummary[]>(`/designs/${designId}/runs?limit=${RUNS_WINDOW}`, { ...local, signal });
/** Two retained versions of one design. The server decides whether their results can be compared. */
export const compareVersions = (designId: string, q: { a: number; b: number; runA?: string; runB?: string }, signal?: AbortSignal) => {
  const params = new URLSearchParams({ a: String(q.a), b: String(q.b) });
  if (q.runA) params.set("runA", q.runA);
  if (q.runB) params.set("runB", q.runB);
  return api<Comparison>(`/designs/${designId}/compare?${params}`, { ...local, signal });
};
/** Saves an old version's content as a NEW revision. The caller supplies the revision it is looking at. */
export const restoreVersion = (designId: string, revision: number, expectedRevision: number) =>
  api<RestoredDesign>(`/designs/${designId}/versions/${revision}/restore`, {
    ...local,
    method: "POST",
    body: { expectedRevision },
  });
