// P2 Learn: which topics a person has opened and passed, kept in this browser only. Nothing is sent to a server.
// One bucket per signed-in account (so two people sharing a browser do not see each other's marks) and one for guests.
// Whatever is stored is treated as untrusted: anything unreadable, or naming a topic that does not exist, is ignored.

export type Progress = { opened: string[]; passed: string[] };
export type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const GUEST_BUCKET = "guest";
const PREFIX = "sf:learn:v1:";
const EMPTY: Progress = { opened: [], passed: [] };

export const bucketFor = (userId: string | null | undefined) => (userId ? `user:${userId}` : GUEST_BUCKET);
const keyFor = (bucket: string) => PREFIX + bucket;

/** The browser's storage, or nothing when it is blocked or unavailable (private windows, cleared site data). */
export function browserStore(): Store | null {
  try {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

const clean = (value: unknown, known: readonly string[]): string[] =>
  Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === "string" && known.includes(v)))] : [];

/** The stored text for a bucket (a plain string, so it is a stable snapshot for useSyncExternalStore), or null. */
export function rawProgress(store: Store | null, bucket: string): string | null {
  try {
    return store ? store.getItem(keyFor(bucket)) : null;
  } catch {
    return null;
  }
}

export const readProgress = (store: Store | null, bucket: string, known: readonly string[]): Progress => parseProgress(rawProgress(store, bucket), known);

export function parseProgress(raw: string | null, known: readonly string[]): Progress {
  try {
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as { opened?: unknown; passed?: unknown } | null;
    if (!parsed || typeof parsed !== "object") return { ...EMPTY };
    const passed = clean(parsed.passed, known);
    // Passing a topic means it was opened.
    return { opened: [...new Set([...clean(parsed.opened, known), ...passed])], passed };
  } catch {
    return { ...EMPTY };
  }
}

function write(store: Store | null, bucket: string, progress: Progress) {
  try {
    store?.setItem(keyFor(bucket), JSON.stringify(progress));
  } catch {
    /* Storage full or blocked: the marks just do not stick. The lessons still work. */
  }
}

export function markOpened(store: Store | null, bucket: string, topic: string, known: readonly string[]): Progress {
  const p = readProgress(store, bucket, known);
  if (!known.includes(topic) || p.opened.includes(topic)) return p;
  const next = { ...p, opened: [...p.opened, topic] };
  write(store, bucket, next);
  return next;
}

export function markPassed(store: Store | null, bucket: string, topic: string, known: readonly string[]): Progress {
  const p = readProgress(store, bucket, known);
  if (!known.includes(topic) || p.passed.includes(topic)) return p;
  const next = { opened: p.opened.includes(topic) ? p.opened : [...p.opened, topic], passed: [...p.passed, topic] };
  write(store, bucket, next);
  return next;
}

export function clearProgress(store: Store | null, bucket: string): Progress {
  try {
    store?.removeItem(keyFor(bucket));
  } catch {
    /* nothing to clear */
  }
  return { ...EMPTY };
}

export type TopicMark = "new" | "opened" | "passed";
export const markOf = (p: Progress, topic: string): TopicMark => (p.passed.includes(topic) ? "passed" : p.opened.includes(topic) ? "opened" : "new");
export const MARK_LABEL: Record<TopicMark, string> = { new: "Not opened yet", opened: "Opened", passed: "Passed the check" };
