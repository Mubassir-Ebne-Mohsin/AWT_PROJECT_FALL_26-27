// Questions the drawer could not answer, kept in this browser only so the person can suggest topics. Nothing here is ever sent
// automatically: the list is shown, can be copied by the person, and can be cleared.
export const UNANSWERED_KEY = "sf.concept-help.unanswered";
export const UNANSWERED_MAX = 20;
const MAX_LENGTH = 200;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function browserStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readUnanswered(store: StorageLike | null = browserStorage()): string[] {
  try {
    const raw = store?.getItem(UNANSWERED_KEY);
    const value: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string").slice(0, UNANSWERED_MAX) : [];
  } catch {
    return [];
  }
}

/** Adds a question (newest first, no duplicates ignoring case, at most 20). Returns the new list. */
export function recordUnanswered(question: string, store: StorageLike | null = browserStorage()): string[] {
  const q = question.trim().replace(/\s+/g, " ").slice(0, MAX_LENGTH);
  const current = readUnanswered(store);
  if (!q) return current;
  const next = [q, ...current.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, UNANSWERED_MAX);
  try {
    store?.setItem(UNANSWERED_KEY, JSON.stringify(next));
  } catch {
    /* storage full or blocked: the drawer still works without the list */
  }
  return next;
}

export function clearUnanswered(store: StorageLike | null = browserStorage()): void {
  try {
    store?.removeItem(UNANSWERED_KEY);
  } catch {
    /* nothing to clear */
  }
}
