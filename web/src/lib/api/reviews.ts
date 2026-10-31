import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

type Schemas = components["schemas"];
export type ReviewGrant = Schemas["ReviewGrant"];
export type ReviewItem = Schemas["ReviewItem"];
export type ReviewView = Schemas["ReviewView"];
export type CreateReview = { email: string; revision?: number; run?: string };

// Review failures stay on the review screens: a local scope never opens a global system screen.
const local = { scope: "local" } as const;

export const createReview = (designId: string, body: CreateReview) => api<ReviewGrant>(`/designs/${designId}/reviews`, { ...local, method: "POST", body });
export const fetchReviews = (designId: string, signal?: AbortSignal) => api<ReviewGrant[]>(`/designs/${designId}/reviews`, { ...local, signal });
export const revokeReview = (designId: string, grantId: string) => api<ReviewGrant>(`/designs/${designId}/reviews/${grantId}/revoke`, { ...local, method: "POST" });

/** The Reviewer's side. Both calls are refused for any account without the Reviewer role. */
export const fetchSharedWithMe = (signal?: AbortSignal) => api<ReviewItem[]>("/reviews/shared-with-me", { ...local, signal });
export const fetchReview = (id: string, signal?: AbortSignal) => api<ReviewView>(`/reviews/${id}`, { ...local, signal });
