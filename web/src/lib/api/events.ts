// Tiny pub/sub that lets the (non-React) API client tell the UI about failures that
// should open a system-state screen. The UI subscribes once, in the providers.

export type ApiEventName =
  | "unreachable" // no response: server asleep, down, or offline
  | "session-expired" // refresh failed while the user was signed in
  | "server-error" // 500
  | "rate-limited" // 429
  | "not-found" // 404
  | "forbidden"; // 403

type Listener = () => void;
const listeners = new Map<ApiEventName, Set<Listener>>();

export const apiEvents = {
  on(name: ApiEventName, fn: Listener) {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name)!.add(fn);
    return () => listeners.get(name)!.delete(fn);
  },
  emit(name: ApiEventName) {
    listeners.get(name)?.forEach((fn) => fn());
  },
};
