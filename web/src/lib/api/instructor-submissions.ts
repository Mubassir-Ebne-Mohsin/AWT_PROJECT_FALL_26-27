import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/phase3-schema";

type S = components["schemas"];
export type InstructorSubmission = S["InstructorSubmissionList"][number];
export type InstructorSubmissionDetail = S["InstructorSubmissionDetail"];
export type Feedback = S["ChallengeFeedback"];

// Failures stay on the Instructor screen: a local scope never opens a global system screen.
const local = { scope: "local" } as const;

export const fetchChallengeSubmissions = (challengeId: string, signal?: AbortSignal) =>
  api<S["InstructorSubmissionList"]>(`/instructor/challenges/${challengeId}/submissions`, { ...local, signal });
export const fetchSubmission = (id: string, signal?: AbortSignal) => api<InstructorSubmissionDetail>(`/instructor/submissions/${id}`, { ...local, signal });
export const sendFeedback = (id: string, text: string) =>
  api<Feedback>(`/instructor/submissions/${id}/feedback`, { ...local, method: "POST", body: { text } });
