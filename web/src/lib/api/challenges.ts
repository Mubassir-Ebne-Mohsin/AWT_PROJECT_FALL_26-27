import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

type Schemas = components["schemas"];
export type Challenge = Schemas["Challenge"];
export type CreateChallenge = Schemas["CreateChallengeRequest"];
export type PatchChallenge = Schemas["PatchChallengeRequest"];

// Challenge failures stay on the Instructor screens: a local scope never opens a global system screen.
const local = { scope: "local" } as const;

export const fetchMyChallenges = (signal?: AbortSignal) => api<Challenge[]>("/instructor/challenges", { ...local, signal });
export const fetchMyChallenge = (id: string, signal?: AbortSignal) => api<Challenge>(`/instructor/challenges/${id}`, { ...local, signal });
export const createChallenge = (body: CreateChallenge) => api<Challenge>("/instructor/challenges", { ...local, method: "POST", body });
export const patchChallenge = (id: string, body: PatchChallenge) => api<Challenge>(`/instructor/challenges/${id}`, { ...local, method: "PATCH", body });
export const publishChallenge = (id: string) => api<Challenge>(`/instructor/challenges/${id}/publish`, { ...local, method: "POST" });
export const archiveChallenge = (id: string) => api<Challenge>(`/instructor/challenges/${id}/archive`, { ...local, method: "POST" });
export const duplicateChallenge = (id: string) => api<Challenge>(`/instructor/challenges/${id}/duplicate`, { ...local, method: "POST" });
