import type { NoteKind } from "@/lib/api/notes";

// These mirror the server contract (notes.schema.ts). The server is the authority; the client only
// explains the limits early so nobody types a long note that cannot be saved.
export const NOTE_MAX_CHARS = 2000;
export const NOTES_MAX = 100;

export const noteKindLabel = (kind: NoteKind) => (kind === "decision" ? "Decision" : "Assumption");
export const NOTE_KIND_HELP: Record<NoteKind, string> = {
  decision: "A choice you made and why.",
  assumption: "Something you are taking as true, such as a traffic or capacity guess.",
};

export interface NoteDraft {
  /** Characters left after trimming, the way the server counts them. Negative when over the limit. */
  remaining: number;
  canSave: boolean;
  /** Shown only for a real problem, not for an untouched empty form. */
  problem: string | null;
}

export function noteDraft(text: string): NoteDraft {
  const trimmed = text.trim();
  const remaining = NOTE_MAX_CHARS - trimmed.length;
  if (text.includes("\u0000")) return { remaining, canSave: false, problem: "This text contains an unsupported character." };
  if (remaining < 0) return { remaining, canSave: false, problem: `Too long by ${-remaining} character${-remaining === 1 ? "" : "s"}.` };
  return { remaining, canSave: trimmed.length > 0, problem: null };
}

export const notesCountText = (count: number) => `${count} of ${NOTES_MAX} notes`;
export const notesFull = (count: number) => count >= NOTES_MAX;
