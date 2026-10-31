import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/phase3-schema";
type S = components["schemas"];
export type AttemptView = S["ChallengeAttemptView"];
export type Submission = S["ChallengeSubmission"];
const local = { scope: "local" } as const;
export const publishedChallenges = (signal?: AbortSignal) =>
  api<S["PublicChallengeList"]>("/challenges", {
    ...local,
    auth: false,
    signal,
  });
export const publishedChallenge = (id: string, signal?: AbortSignal) =>
  api<S["PublicChallenge"]>(`/challenges/${id}`, {
    ...local,
    auth: false,
    signal,
  });
export const startAttempt = (id: string) =>
  api<S["ChallengeAttempt"]>(`/challenges/${id}/attempt`, {
    ...local,
    method: "POST",
  });
export const readAttempt = (id: string, signal?: AbortSignal) =>
  api<AttemptView>(`/attempts/${id}`, { ...local, signal });
export const submitAttempt = (id: string, body: S["SubmitAttempt"]) =>
  api<Submission>(`/attempts/${id}/submissions`, {
    ...local,
    method: "POST",
    body,
  });
export const challengeProgress = (signal?: AbortSignal) =>
  api<S["ChallengeProgress"]>("/progress/challenges", { ...local, signal });
