"use client";

import { useState, type FormEvent } from "react";
import { UsernameField } from "@/components/auth/username-field";
import { changeUsername } from "@/lib/api/account";
import { serverFields } from "@/lib/settings-presentation";
import { usernameSchema } from "@/lib/validation/auth";

export function ProfileUsername({ current }: { current?: string }) {
  const [value, setValue] = useState(current ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const parsed = usernameSchema.safeParse(value);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || !parsed.success || parsed.data === current) return;
    setBusy(true);
    setError(undefined);
    setSaved(false);
    try {
      const user = await changeUsername(parsed.data);
      setValue(user.username ?? parsed.data);
      setSaved(true);
    } catch (failure) {
      setError(serverFields(failure).username ?? "Could not save your username. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={save} aria-label="Change username">
      <UsernameField
        current={current}
        value={value}
        onChange={(next) => { setValue(next); setError(undefined); setSaved(false); }}
        error={error}
        disabled={busy}
      />
      <div className="row">
        <button className="btn btn-primary" type="submit" disabled={busy || !parsed.success || parsed.data === current}>
          {busy ? "Saving…" : "Save username"}
        </button>
      </div>
      {saved && <p role="status" className="small c-ok">Username saved.</p>}
    </form>
  );
}
