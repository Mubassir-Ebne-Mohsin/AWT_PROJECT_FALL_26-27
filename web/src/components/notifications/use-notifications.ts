"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchNotifications,
  openNotification,
  readNotification,
  type NotificationPage,
} from "@/lib/api/notifications";
import { notificationDelay } from "@/lib/notifications";

/** One request generation per account. Mutations/visibility changes invalidate older reads. */
export function useNotifications() {
  const [data, setData] = useState<NotificationPage | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [paused, setPaused] = useState(false);
  const state = useRef({
    alive: false,
    acting: false,
    paused: false,
    failures: 0,
    seq: 0,
    controller: null as AbortController | null,
    timer: undefined as ReturnType<typeof setTimeout> | undefined,
    data: null as NotificationPage | null,
  });
  const reloadRef = useRef<() => void>(() => {});
  const request = useCallback(
    async (cursor?: NonNullable<NotificationPage["next"]>) => {
      const s = state.current;
      if (!s.alive || s.acting || document.hidden) return;
      clearTimeout(s.timer);
      s.controller?.abort();
      const controller = new AbortController();
      s.controller = controller;
      const seq = ++s.seq;
      setBusy(true);
      try {
        const page = await fetchNotifications(cursor, controller.signal);
        if (!s.alive || seq !== s.seq || controller.signal.aborted) return;
        const next =
          cursor && s.data
            ? {
                ...page,
                items: [...s.data.items, ...page.items].filter(
                  (x, i, a) => a.findIndex((y) => y.id === x.id) === i,
                ),
              }
            : page;
        s.data = next;
        setData(next);
        s.failures = 0;
        setError("");
      } catch (e) {
        if (s.alive && seq === s.seq && !controller.signal.aborted) {
          s.failures++;
          setError(
            e instanceof Error
              ? e.message
              : "Notifications could not be loaded.",
          );
        }
      } finally {
        if (s.alive && seq === s.seq) {
          setBusy(false);
          if (!s.paused && !document.hidden)
            s.timer = setTimeout(
              () => reloadRef.current(),
              notificationDelay(s.failures),
            );
        }
      }
    },
    [],
  );
  const refresh = useCallback(() => {
    void request();
  }, [request]);
  useEffect(() => {
    reloadRef.current = refresh;
    const s = state.current;
    s.alive = true;
    refresh();
    const visibility = () => {
      clearTimeout(s.timer);
      s.seq++;
      s.controller?.abort();
      s.acting = false;
      setBusy(false);
      if (!document.hidden && !s.paused) refresh();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      s.alive = false;
      s.seq++;
      s.controller?.abort();
      clearTimeout(s.timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [refresh]);
  const pause = () => {
    const s = state.current;
    s.paused = !s.paused;
    setPaused(s.paused);
    clearTimeout(s.timer);
    s.seq++;
    s.controller?.abort();
    s.acting = false;
    setBusy(false);
    if (!s.paused) refresh();
  };
  async function act(id: string | undefined, open = false) {
    const s = state.current;
    if (!s.alive || s.acting) return undefined;
    s.acting = true;
    clearTimeout(s.timer);
    s.controller?.abort();
    const controller = new AbortController();
    s.controller = controller;
    const seq = ++s.seq;
    setBusy(true);
    try {
      const result = open
        ? await openNotification(id!, controller.signal)
        : await readNotification(id, controller.signal);
      if (!s.alive || seq !== s.seq || controller.signal.aborted)
        return undefined;
      s.acting = false;
      setBusy(false);
      refresh();
      return result;
    } catch (e) {
      if (s.alive && seq === s.seq && !controller.signal.aborted) {
        s.acting = false;
        setError(
          e instanceof Error ? e.message : "The update could not be saved.",
        );
        setBusy(false);
        if (!s.paused && !document.hidden)
          s.timer = setTimeout(refresh, notificationDelay(++s.failures));
      }
      return undefined;
    }
  }
  return {
    data,
    error,
    busy,
    paused,
    refresh,
    pause,
    cancel: () => {
      const s = state.current;
      if (s.acting) {
        s.seq++;
        s.controller?.abort();
        s.acting = false;
        setBusy(false);
        refresh();
      }
    },
    more: () => {
      if (data?.next && !busy) void request(data.next);
    },
    read: (id?: string) => act(id),
    open: async (id: string) => {
      const result = await act(id, true);
      return result && "href" in result ? result : undefined;
    },
  };
}
