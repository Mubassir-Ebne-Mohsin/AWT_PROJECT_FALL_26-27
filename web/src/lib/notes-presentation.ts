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

// ---- Notes pinned to a component (docs/COMPONENT-NOTES-SCOPE.md) ----
type Pinned = { componentId: string | null; component: { id: string; label: string } | null; componentRemoved: boolean };

/** What a note says it is about: the component's name now, "Component removed", or nothing for a note about the whole design. */
export function noteAboutText(note: Pinned): string | null {
  if (note.componentRemoved) return "Component removed";
  return note.component ? note.component.label : null;
}

/** Which notes the Notes tab shows. "all" shows every note, "unpinned" those about the whole design, "removed" those whose component is gone. */
export type NoteFilter = "all" | "unpinned" | "removed" | { componentId: string };
export function filterNotes<T extends Pinned>(notes: readonly T[], filter: NoteFilter): T[] {
  if (filter === "all") return [...notes];
  if (filter === "unpinned") return notes.filter((n) => n.componentId === null);
  if (filter === "removed") return notes.filter((n) => n.componentRemoved);
  return notes.filter((n) => n.componentId === filter.componentId && !n.componentRemoved);
}

/** How many notes each existing component has. Notes of a removed component or of the whole design count for none. */
export function noteCounts(notes: readonly Pinned[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const n of notes) if (n.component && !n.componentRemoved) counts.set(n.component.id, (counts.get(n.component.id) ?? 0) + 1);
  return counts;
}

/** The accessible name of a canvas marker: always words, never a bare number. */
export const markerLabel = (count: number, label: string) => `${count} note${count === 1 ? "" : "s"} on ${label}`;

/** The filter choices to offer: only those that would show something, so a person is never sent to an empty list. */
export function filterOptions(notes: readonly Pinned[], components: readonly { id: string; label: string }[]): { value: string; label: string }[] {
  const counts = noteCounts(notes);
  const options = [{ value: "all", label: `All notes (${notes.length})` }];
  const unpinned = filterNotes(notes, "unpinned").length;
  if (unpinned) options.push({ value: "unpinned", label: `About the whole design (${unpinned})` });
  for (const c of components) if (counts.get(c.id)) options.push({ value: "c:" + c.id, label: `${c.label} (${counts.get(c.id)})` });
  const removed = filterNotes(notes, "removed").length;
  if (removed) options.push({ value: "removed", label: `Component removed (${removed})` });
  return options;
}

export const parseFilter = (value: string): NoteFilter => (value === "all" || value === "unpinned" || value === "removed" ? value : value.startsWith("c:") ? { componentId: value.slice(2) } : "all");
