"use client";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import {
  getNotificationPreferences,
  setNotificationPreference,
  type NotificationKind,
  type NotificationPreferences as Preferences,
} from "@/lib/api/notifications";
import { NOTIFICATION_PREFERENCE_LABELS } from "@/lib/notifications";
export function NotificationPreferences() {
  const { user } = useAuth();
  return <Controls key={user?.id ?? "signed-out"} />;
}
function Controls() {
  const [prefs, setPrefs] = useState<Preferences | null>(null),
    [busy, setBusy] = useState(true),
    [message, setMessage] = useState("");
  const active = useRef<AbortController | null>(null);
  function load() {
    active.current?.abort();
    const c = new AbortController();
    active.current = c;
    return getNotificationPreferences(c.signal)
      .then((p) => {
        if (!c.signal.aborted) {
          setPrefs(p);
          setMessage("");
        }
      })
      .catch((e) => {
        if (!c.signal.aborted)
          setMessage(
            e instanceof Error ? e.message : "Could not load preferences",
          );
      })
      .finally(() => {
        if (!c.signal.aborted) setBusy(false);
      });
  }
  useEffect(() => {
    void load();
    return () => active.current?.abort();
  }, []);
  async function change(kind: NotificationKind, muted: boolean) {
    if (busy) return;
    const c = new AbortController();
    active.current = c;
    const previous = prefs;
    setPrefs(
      (current) =>
        current?.map((p) => (p.kind === kind ? { ...p, muted } : p)) ?? null,
    );
    setMessage("");
    setBusy(true);
    try {
      const p = await setNotificationPreference(kind, muted, c.signal);
      if (!c.signal.aborted) {
        setPrefs(p);
        setMessage("Notification preference saved.");
      }
    } catch (e) {
      if (!c.signal.aborted) {
        setPrefs(previous);
        setMessage(
          e instanceof Error ? e.message : "Could not save preference",
        );
      }
    } finally {
      if (!c.signal.aborted) setBusy(false);
    }
  }
  return (
    <section
      className="panel stack r2-pad"
      aria-label="Notification preferences"
    >
      <h3 className="h3">Notification preferences</h3>
      <p className="hint">
        Mute future notifications by kind. Existing items stay readable. Staff
        events apply only while you hold the Support role.
      </p>
      {prefs?.map((p) => (
        <label className="row" key={p.kind}>
          <input
            type="checkbox"
            checked={p.muted}
            disabled={busy}
            onChange={(e) => void change(p.kind, e.target.checked)}
          />
          Mute {NOTIFICATION_PREFERENCE_LABELS[p.kind]}
        </label>
      ))}
      {busy && !prefs && <p role="status">Loading preferences…</p>}
      {message && <p role="status">{message}</p>}
      {!prefs && !busy && (
        <button
          className="btn"
          onClick={() => {
            setBusy(true);
            void load();
          }}
        >
          Retry notification preferences
        </button>
      )}
    </section>
  );
}
