"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchMetrics } from "@/lib/api/admin";
import { LiveState, initialLive, needsFetchNow, nextDelay, onFailure, onSuccess, shouldPoll, withHidden, withPaused } from "@/lib/admin-metrics";

/**
 * Polls the dashboard numbers. The rules (back-off, ignoring an older answer, pausing) are the pure functions in
 * lib/admin-metrics; this hook only owns the timer, the abort controller and the tab visibility.
 * A 403 means the Admin role was taken away: polling stops and the screen says so, instead of retrying forever.
 */
export function useLiveMetrics(enabled: boolean) {
  const [state, setState] = useState<LiveState>(() => initialLive());
  const [denied, setDenied] = useState(false);
  const ref = useRef(state);
  const control = useRef<{ tick: () => void; schedule: () => void } | null>(null);

  const apply = useCallback((fn: (s: LiveState) => LiveState) => {
    ref.current = fn(ref.current);
    setState(ref.current);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inflight: AbortController | null = null;

    const schedule = () => {
      clearTimeout(timer);
      if (!alive || !shouldPoll(ref.current)) return;
      timer = setTimeout(() => void tick(), nextDelay(ref.current.failures));
    };
    const tick = async () => {
      clearTimeout(timer);
      if (!alive || !shouldPoll(ref.current)) return;
      inflight?.abort();
      const mine = (inflight = new AbortController());
      try {
        const data = await fetchMetrics(mine.signal);
        if (!alive || mine.signal.aborted) return;
        apply((s) => onSuccess(s, data, Date.now()));
      } catch (e) {
        if (!alive || mine.signal.aborted) return;
        if ((e as { status?: number }).status === 403) {
          setDenied(true);
          return;
        }
        apply(onFailure);
      }
      schedule();
    };
    control.current = { tick: () => void tick(), schedule };

    const onVisibility = () => {
      const hidden = document.visibilityState === "hidden";
      apply((s) => withHidden(s, hidden));
      if (hidden) {
        clearTimeout(timer);
        inflight?.abort();
      } else if (needsFetchNow(ref.current, Date.now())) void tick();
      else schedule();
    };
    document.addEventListener("visibilitychange", onVisibility);
    apply((s) => withHidden(s, document.visibilityState === "hidden"));
    void tick();

    return () => {
      alive = false;
      clearTimeout(timer);
      inflight?.abort();
      document.removeEventListener("visibilitychange", onVisibility);
      control.current = null;
    };
  }, [enabled, apply]);

  const setPaused = useCallback(
    (paused: boolean) => {
      apply((s) => withPaused(s, paused));
      if (!paused) {
        if (needsFetchNow(ref.current, Date.now())) control.current?.tick();
        else control.current?.schedule();
      }
    },
    [apply],
  );
  const retryNow = useCallback(() => control.current?.tick(), []);

  return { state, denied, setPaused, retryNow };
}
