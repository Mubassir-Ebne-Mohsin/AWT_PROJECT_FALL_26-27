import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

type Schemas = components["schemas"];
export type LibraryPage = Schemas["DesignLibraryList"];
export type LibraryItem = LibraryPage["data"][number];
export type ArchiveState = Schemas["ArchiveState"];

export const LIBRARY_PAGE_SIZE = 12;

export interface LibraryQuery {
  q: string;
  sort: "updated" | "name" | "lastRun";
  verdict: "" | "pass" | "strained" | "fail" | "none";
  archived: "active" | "archived" | "all";
  page: number;
}

// Designs list failures stay on the list: a local scope never opens a global system screen.
const local = { scope: "local" } as const;

export function libraryPath(q: LibraryQuery) {
  const p = new URLSearchParams();
  if (q.q.trim()) p.set("q", q.q.trim());
  p.set("sort", q.sort);
  if (q.verdict) p.set("verdict", q.verdict);
  p.set("archived", q.archived);
  p.set("page", String(q.page));
  p.set("pageSize", String(LIBRARY_PAGE_SIZE));
  return "/library/designs?" + p.toString();
}

export const fetchLibrary = (q: LibraryQuery, signal?: AbortSignal) =>
  api<LibraryPage>(libraryPath(q), { ...local, envelope: true, signal });
export const duplicateDesign = (id: string) => api<{ id: string }>(`/designs/${id}/duplicate`, { ...local, method: "POST" });
export const archiveDesign = (id: string) => api<ArchiveState>(`/designs/${id}/archive`, { ...local, method: "POST" });
export const unarchiveDesign = (id: string) => api<ArchiveState>(`/designs/${id}/unarchive`, { ...local, method: "POST" });
