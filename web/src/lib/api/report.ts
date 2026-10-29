import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export type Report = components["schemas"]["DesignReport"];

// Report failures stay on the report page: a local scope never opens a global system screen.
const local = { scope: "local" } as const;

export const fetchReport = (designId: string, pick: { revision?: number; run?: string }, signal?: AbortSignal) => {
  const params = new URLSearchParams();
  if (pick.revision) params.set("revision", String(pick.revision));
  if (pick.run) params.set("run", pick.run);
  const query = params.toString();
  return api<Report>(`/designs/${designId}/report${query ? "?" + query : ""}`, { ...local, signal });
};
