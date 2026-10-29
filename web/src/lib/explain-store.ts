import { useEffect, useSyncExternalStore } from "react";
import { onSessionChange } from "@/lib/api/client";
import { fetchAiReadiness, type AiReadiness } from "@/lib/api/ai";
import { ExplainSession, type ExplainContext } from "@/lib/explain-session";

/** The verified headline numbers of the recorded run, shown before and beside any generated text. */
export interface ExplainFactsView {
  verdict: "pass" | "strained" | "fail";
  p95Ms: number;
  p95TargetMs: number;
  errorRateFraction: number;
  errorBudgetFraction: number;
  bottleneck: { label: string; utilizationFraction: number } | null;
}
/** What the workspace publishes for the saved result on screen; the assistant drawer reads it. */
export interface ExplainView extends ExplainContext {
  /** Unsaved edits exist in the editor. They are never sent; the panel says so. */
  unsavedChanges: boolean;
  facts: ExplainFactsView | null;
}

let view: ExplainView | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

export const explainView = {
  get: () => view,
  subscribe: (fn: () => void) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  /** Called by the workspace; identical content does not re-render subscribers. */
  publish(next: ExplainView | null) {
    if (JSON.stringify(next) === JSON.stringify(view)) return;
    view = next;
    emit();
  },
};
export const useExplainView = () => useSyncExternalStore(explainView.subscribe, explainView.get, () => null);

/**
 * AI is optional and off by default. The UI shows nothing AI-related unless the backend reports it enabled
 * (AI_ENABLED), so deferring AI needs no frontend change and enabling it later is a backend setting only.
 * Unknown (not loaded or unreachable) is treated as hidden and retried on the next mount. The answer is
 * cached per sign-in and cleared on sign-out or account switch so one account never inherits another's.
 */
let aiEnabled: boolean | null = null;
let aiProbe: Promise<void> | null = null;
let aiUser: string | null = null;
let watching = false;
const aiListeners = new Set<() => void>();
const notifyAi = () => aiListeners.forEach((fn) => fn());
function watchAccount() {
  if (watching) return;
  watching = true;
  onSessionChange((user) => {
    if ((user?.id ?? null) !== aiUser) {
      aiEnabled = null;
      aiUser = user?.id ?? null;
      notifyAi();
    }
  });
}
export function probeAiEnabled(fetcher: () => Promise<Pick<AiReadiness, "enabled">> = fetchAiReadiness) {
  watchAccount();
  if (aiEnabled !== null) return Promise.resolve();
  aiProbe ??= fetcher()
    .then((r) => {
      aiEnabled = r.enabled;
    })
    .catch(() => {
      aiEnabled = null; // not cached: try again on a later mount, show nothing meanwhile
    })
    .finally(() => {
      aiProbe = null;
      notifyAi();
    });
  return aiProbe;
}
export const aiEnabledStore = {
  get: () => aiEnabled === true,
  subscribe: (fn: () => void) => {
    aiListeners.add(fn);
    return () => {
      aiListeners.delete(fn);
    };
  },
};
/** True only when the backend reports AI enabled. Triggers the one-time readiness probe. */
export function useAiEnabled() {
  const enabled = useSyncExternalStore(aiEnabledStore.subscribe, aiEnabledStore.get, () => false);
  useEffect(() => {
    void probeAiEnabled();
  }, []);
  return enabled;
}

let session: ExplainSession | null = null;
let unsubscribeSession: (() => void) | null = null;
/** One explanation flow per browser tab. Context binding (account/design/run/revision) isolates results. */
export function getExplainSession() {
  if (!session) {
    session = new ExplainSession();
    // Account-scoped state never survives sign-out or an account switch.
    unsubscribeSession = onSessionChange((user) => {
      if (!user || (session?.ctx && session.ctx.userId !== user.id)) {
        explainView.publish(null);
        session?.bind(null);
      }
    });
  }
  return session;
}
export function resetExplainForTests() {
  unsubscribeSession?.();
  unsubscribeSession = null;
  session?.dispose();
  session = null;
  view = null;
  aiEnabled = null;
  aiProbe = null;
  aiUser = null;
}

/** The retained job id rides in ?explain=. Other parameters (run, limits) are preserved untouched. */
export function explainParam(search: URLSearchParams) {
  const id = search.get("explain");
  return id && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}
export function withExplainParam(search: string, jobId: string | null) {
  const q = new URLSearchParams(search);
  if (jobId) q.set("explain", jobId);
  else q.delete("explain");
  const s = q.toString();
  return s ? "?" + s : "";
}
