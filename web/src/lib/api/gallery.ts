import { api } from "@/lib/api/client";
import type { Design } from "@/lib/api/designs";
import type { SharedView } from "@/lib/api/shares";

// Community gallery (F1, F3). Types mirror src/common/contracts/phase3/gallery.schema.ts on the server.
export type GalleryVerdict = "pass" | "strained" | "fail";

export interface GalleryPost {
  id: string;
  title: string;
  description: string;
  ownerName: string;
  isMine: boolean;
  publishedAt: string;
  revision: number;
  verdict: GalleryVerdict;
  p95: number;
  p95Target: number;
  tags: string[];
  nodeCount: number;
  remixCount: number;
  allowRemix: boolean;
}
export interface GalleryList {
  items: GalleryPost[];
  total: number;
  page: number;
  pageSize: number;
}
export type GalleryDetail = GalleryPost & { report: SharedView["report"] };
export interface PublishRequest {
  title: string;
  description: string;
  revision?: number;
  run?: string;
  allowRemix: boolean;
  confirmOwnership: true;
}
export interface GalleryFilters {
  q?: string;
  verdict?: GalleryVerdict;
  tag?: string;
  mine?: boolean;
  page?: number;
}

// Gallery failures stay on the gallery screens: a local scope never opens a global system screen.
const local = { scope: "local" } as const;

export function galleryQueryString(f: GalleryFilters): string {
  const p = new URLSearchParams();
  if (f.q?.trim()) p.set("q", f.q.trim());
  if (f.verdict) p.set("verdict", f.verdict);
  if (f.tag) p.set("tag", f.tag);
  if (f.mine) p.set("mine", "true");
  if (f.page && f.page > 1) p.set("page", String(f.page));
  const s = p.toString();
  return s ? "?" + s : "";
}

export const fetchGallery = (f: GalleryFilters, signal?: AbortSignal) => api<GalleryList>("/gallery" + galleryQueryString(f), { ...local, signal });
export const fetchGalleryPost = (id: string, signal?: AbortSignal) => api<GalleryDetail>("/gallery/" + id, { ...local, signal });
export const publishToGallery = (designId: string, body: PublishRequest) => api<GalleryPost>(`/designs/${designId}/gallery`, { ...local, method: "POST", body });
export const unpublishGalleryPost = (id: string) => api<{ id: string; unpublishedAt: string }>(`/gallery/${id}/unpublish`, { ...local, method: "POST" });
export const remixGalleryPost = (id: string) => api<{ design: Design; remixCount: number }>(`/gallery/${id}/remix`, { ...local, method: "POST" });

export const VERDICT_LABEL: Record<GalleryVerdict, string> = { pass: "Passes", strained: "Strained", fail: "Fails" };
export const VERDICT_TONE: Record<GalleryVerdict, string> = { pass: "ok", strained: "warn", fail: "fail" };
