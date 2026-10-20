"use client";

import { FormEvent, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { useUi } from "@/components/shell/ui-provider";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import { login } from "@/lib/api/auth";
import { isApiError } from "@/lib/api/errors";
import { notify } from "@/lib/notify";

/** Shown when the refresh token no longer works. Signing in again keeps the page and its state. */
export function SessionModal() {
  const { closeSystem } = useUi();
  const { user, signOut } = useAuth();
  const queryClient = useQueryClient();
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !pw) return;
    setBusy(true);
    setError(null);
    try {
      await login({ email: user.email, password: pw });
      closeSystem();
      notify("Logged in again. Nothing was lost.", "ok");
      void queryClient.invalidateQueries();
    } catch (err) {
      setError(isApiError(err) ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal label="Your session expired" center alert labelledBy="sess-t">
      <form onSubmit={submit}>
        <div className="modal-h">
          <Icon n="key" />
          <div className="h3 grow" id="sess-t">
            Your session expired
          </div>
          <span className="tag">HTTP 401</span>
        </div>
        <div className="modal-b stack">
          <p className="ink2">For security you are logged out after a period of inactivity. Log in again to keep working; the page you were on stays as it is.</p>
          {error && (
            <div className="note fail" role="alert">
              <Icon n="xcircle" />
              <div>{error}</div>
            </div>
          )}
          <div className="field">
            <label className="label" htmlFor="sess-email">
              Email
            </label>
            <input id="sess-email" className="input" value={user?.email ?? ""} disabled readOnly />
          </div>
          <div className="field">
            <label className="label" htmlFor="sess-pw">
              Password
            </label>
            <input id="sess-pw" data-autofocus type="password" className="input" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </div>
        </div>
        <div className="modal-f">
          <button
            type="button"
            className="btn"
            onClick={() => {
              closeSystem();
              void signOut();
            }}
          >
            Use another account
          </button>
          <button className="btn btn-primary" type="submit" disabled={busy || !pw}>
            {busy ? "Logging in…" : "Log in again"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
