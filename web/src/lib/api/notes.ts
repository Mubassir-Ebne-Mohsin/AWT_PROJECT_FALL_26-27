import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

type Schemas = components["schemas"];
export type DesignNote = Schemas["DesignNote"];
export type NoteKind = DesignNote["kind"];

// Notes failures stay inside the Notes tab: a local scope never opens a global system screen.
// Session expiry is still announced so the normal re-authentication flow keeps working.
const local = { scope: "local" } as const;

export const fetchNotes = (designId: string, signal?: AbortSignal) =>
  api<DesignNote[]>(`/designs/${designId}/notes`, { ...local, signal });
export const createNote = (designId: string, body: { kind: NoteKind; text: string; revision?: number }) =>
  api<DesignNote>(`/designs/${designId}/notes`, { ...local, method: "POST", body });
/** `expectedUpdatedAt` is the updatedAt the editor last saw: a stale edit is refused, never merged. */
export const patchNote = (designId: string, noteId: string, body: { expectedUpdatedAt: string; kind?: NoteKind; text?: string }) =>
  api<DesignNote>(`/designs/${designId}/notes/${noteId}`, { ...local, method: "PATCH", body });
export const deleteNote = (designId: string, noteId: string) =>
  api<void>(`/designs/${designId}/notes/${noteId}`, { ...local, method: "DELETE" });
