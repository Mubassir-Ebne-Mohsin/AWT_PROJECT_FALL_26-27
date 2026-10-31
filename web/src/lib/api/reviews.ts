import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

type Schemas = components["schemas"];
export type ReviewGrant = Schemas["ReviewGrant"];
export type ReviewItem = Schemas["ReviewItem"];
export type ReviewView = Schemas["ReviewView"];
export type ReviewComment = Schemas["ReviewComment"];
export type CreateReview = { email: string; revision?: number; run?: string };

// Review failures stay on the review screens: a local scope never opens a global system screen.
const local = { scope: "local" } as const;

export const createReview = (designId: string, body: CreateReview) => api<ReviewGrant>(`/designs/${designId}/reviews`, { ...local, method: "POST", body });
export const fetchReviews = (designId: string, signal?: AbortSignal) => api<ReviewGrant[]>(`/designs/${designId}/reviews`, { ...local, signal });
export const revokeReview = (designId: string, grantId: string) => api<ReviewGrant>(`/designs/${designId}/reviews/${grantId}/revoke`, { ...local, method: "POST" });

/** The Reviewer's side. Both calls are refused for any account without the Reviewer role. */
export const fetchSharedWithMe = (signal?: AbortSignal) => api<ReviewItem[]>("/reviews/shared-with-me", { ...local, signal });
export const fetchReview = (id: string, signal?: AbortSignal) => api<ReviewView>(`/reviews/${id}`, { ...local, signal });

/** R4 feedback, Reviewer side: one thread per review. Refused for anyone but the Reviewer it was shared with. */
export const fetchThread = (grantId: string, signal?: AbortSignal) => api<ReviewComment[]>(`/reviews/${grantId}/comments`, { ...local, signal });
export const addComment = (grantId: string, text: string) => api<ReviewComment>(`/reviews/${grantId}/comments`, { ...local, method: "POST", body: { text } });
export const editComment = (grantId: string, commentId: string, text: string) => api<ReviewComment>(`/reviews/${grantId}/comments/${commentId}`, { ...local, method: "PATCH", body: { text } });
export const removeComment = (grantId: string, commentId: string) => api<ReviewComment>(`/reviews/${grantId}/comments/${commentId}`, { ...local, method: "DELETE" });

/** R4 feedback, owner side: always readable, replies only while the review is active. */
export const fetchOwnerThread = (designId: string, grantId: string, signal?: AbortSignal) => api<ReviewComment[]>(`/designs/${designId}/reviews/${grantId}/comments`, { ...local, signal });
export const replyToComment = (designId: string, grantId: string, parentId: string, text: string) =>
  api<ReviewComment>(`/designs/${designId}/reviews/${grantId}/comments`, { ...local, method: "POST", body: { parentId, text } });
