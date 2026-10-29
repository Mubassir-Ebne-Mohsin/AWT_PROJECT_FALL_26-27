import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

type Schemas = components["schemas"];
export type ShareLink = Schemas["ShareLink"];
export type ShareCreated = Schemas["ShareCreated"];
export type SharedView = Schemas["SharedView"];
export type CreateShare = {
  scope: "design" | "design_report";
  revision?: number;
  run?: string;
  includeDecisions?: boolean;
  expiresInDays: 7 | 30 | 90 | null;
};

// Share failures stay on the share screens: a local scope never opens a global system screen.
const local = { scope: "local" } as const;

export const fetchShares = (designId: string, signal?: AbortSignal) => api<ShareLink[]>(`/designs/${designId}/shares`, { ...local, signal });
export const createShare = (designId: string, body: CreateShare) => api<ShareCreated>(`/designs/${designId}/shares`, { ...local, method: "POST", body });
export const revokeShare = (designId: string, shareId: string) => api<ShareLink>(`/designs/${designId}/shares/${shareId}/revoke`, { ...local, method: "POST" });

/**
 * The public read. The secret goes in the POST body, never in the URL, so API access logs cannot record it.
 * No login is needed or sent: a signed-out visitor and a signed-in one see the same thing.
 */
export const openShare = (token: string, signal?: AbortSignal) => api<SharedView>("/shares/open", { ...local, auth: false, method: "POST", body: { token }, signal });
