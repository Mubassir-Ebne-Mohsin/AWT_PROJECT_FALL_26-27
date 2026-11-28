"use client";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import {
  socialMethods,
  passwordProof,
  startProviderReauth,
  linkProvider,
  unlinkProvider,
  setFirstPassword,
  deleteSocial,
  readProof,
  rememberProof,
  forgetProof,
  type SocialMethods,
  type Provider,
} from "@/lib/api/social";
import { hardNavigate } from "@/lib/navigation";
import { clearSessionHint } from "@/lib/session-hint";
import { ProviderIcon } from "@/components/auth/social-buttons";
export function SocialSettings() {
  const { user } = useAuth(),
    [methods, setMethods] = useState<SocialMethods | null>(null),
    [password, setPassword] = useState(""),
    [newPassword, setNewPassword] = useState(""),
    [typed, setTyped] = useState(""),
    [action, setAction] = useState(
      readProof(user?.id)?.action ?? "link:google",
    ),
    [proof, setProof] = useState(readProof(user?.id)),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(
    (m: SocialMethods) => {
      setMethods(m);
      if (!readProof(user?.id)) {
        const p = m.available.google
          ? "google"
          : m.available.github
            ? "github"
            : (m.providers[0]?.provider ?? "google");
        setAction(
          (m.providers.some((v) => v.provider === p) ? "unlink:" : "link:") + p,
        );
      }
    },
    [user?.id],
  );
  const reload = () => socialMethods().then(load);
  useEffect(() => {
    let alive = true;
    socialMethods()
      .then((m) => {
        if (alive) load(m);
      })
      .catch(() => {
        if (alive)
          setMessage("Login methods could not be loaded. Retry below.");
      });
    return () => {
      alive = false;
    };
  }, [load]);
  async function run(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await work();
    } catch (e) {
      forgetProof();
      setProof(null);
      setMessage(
        e instanceof Error
          ? e.message
          : "This action could not be completed. Authenticate again.",
      );
    } finally {
      setBusy(false);
    }
  }
  const ready = proof?.owner === user?.id && proof?.action === action;
  return (
    <section
      className="panel stack r2-pad social-settings"
      aria-labelledby="connected-title"
    >
      <h3 className="h3" id="connected-title">
        Connected accounts
      </h3>
      <p className="hint">
        Connect providers explicitly. Matching email addresses never merge
        accounts. Keep at least one usable sign-in method.
      </p>
      {message && <p role="status">{message}</p>}
      {!methods ? (
        <button
          className="btn"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await reload();
            })
          }
        >
          Retry login methods
        </button>
      ) : (
        <>
          <p>
            {methods.hasPassword
              ? "Email/password is available."
              : "This account has no local password."}
          </p>
          <ul className="social-methods">
            {(["google", "github"] as const).map((p) => {
              const linked = methods.providers.find((m) => m.provider === p);
              return (
                <li key={p}>
                  <ProviderIcon provider={p} />
                  <strong>{p === "google" ? "Google" : "GitHub"}</strong>
                  <span>
                    {linked
                      ? linked.enabled
                        ? "Connected"
                        : "Connected · provider unavailable"
                      : "Not connected"}
                  </span>
                </li>
              );
            })}
          </ul>
          <label className="stack" htmlFor="social-action">
            Account action
          </label>
          <select
            id="social-action"
            className="field"
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setProof(null);
              forgetProof();
            }}
          >
            {(["google", "github"] as const)
              .filter(
                (p) =>
                  methods.available[p] ||
                  methods.providers.some((v) => v.provider === p),
              )
              .map((p) => (
                <option
                  key={p}
                  value={
                    (methods.providers.some((m) => m.provider === p)
                      ? "unlink:"
                      : "link:") + p
                  }
                >
                  {methods.providers.some((m) => m.provider === p)
                    ? "Disconnect"
                    : "Connect"}{" "}
                  {p === "google" ? "Google" : "GitHub"}
                </option>
              ))}
            {!methods.hasPassword && (
              <>
                <option value="set-password">Set a local password</option>
                <option value="delete">Delete this account</option>
              </>
            )}
          </select>
          {!ready && (
            <div className="stack">
              {methods.hasPassword && (
                <>
                  <label className="stack">
                    Current password
                    <input
                      className="field"
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </label>
                  <button
                    className="btn"
                    disabled={busy || !password}
                    onClick={() =>
                      void run(async () => {
                        const p = await passwordProof(password, action);
                        rememberProof(p);
                        setProof(readProof(user?.id));
                        setPassword("");
                      })
                    }
                  >
                    Authenticate for this action
                  </button>
                </>
              )}
              {methods.providers
                .filter((p) => p.enabled)
                .map((p) => (
                  <button
                    className="social-provider"
                    key={p.provider}
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const result = await startProviderReauth(
                          p.provider,
                          action,
                        );
                        window.location.assign(result.url);
                      })
                    }
                  >
                    <ProviderIcon provider={p.provider} />
                    Authenticate with{" "}
                    {p.provider === "google" ? "Google" : "GitHub"}
                  </button>
                ))}
              <p className="hint">
                Authentication is required again for each sensitive action.
                Provider passwords are entered only on their website.
              </p>
            </div>
          )}
          {ready && (
            <div className="stack">
              <p className="hint">
                Authenticated for this action for up to five minutes.
              </p>
              {action === "set-password" && (
                <>
                  <label className="stack" htmlFor="social-new-password">
                    New password
                  </label>
                  <input
                    id="social-new-password"
                    aria-describedby="social-password-hint"
                    className="field"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <span className="hint" id="social-password-hint">
                    8–128 characters, including a letter and number.
                  </span>
                </>
              )}
              {action === "delete" && (
                <>
                  <p>
                    Deleting permanently removes your account and designs.
                    Download your data first.
                  </p>
                  <label className="stack">
                    Type delete my account
                    <input
                      className="field"
                      value={typed}
                      onChange={(e) => setTyped(e.target.value)}
                    />
                  </label>
                </>
              )}
              <button
                className={
                  action === "delete" ? "btn btn-danger" : "btn btn-primary"
                }
                disabled={
                  busy ||
                  (action === "delete" && typed !== "delete my account") ||
                  (action === "set-password" &&
                    !/^(?=.*[A-Za-z])(?=.*\d).{8,128}$/.test(newPassword))
                }
                onClick={() =>
                  void run(async () => {
                    const token = proof!.proof;
                    forgetProof();
                    setProof(null);
                    if (action.startsWith("link:")) {
                      const result = await linkProvider(
                        action.split(":")[1] as Provider,
                        token,
                      );
                      window.location.assign(result.url);
                      return;
                    }
                    if (action.startsWith("unlink:"))
                      await unlinkProvider(
                        action.split(":")[1] as Provider,
                        token,
                      );
                    else if (action === "set-password") {
                      await setFirstPassword(newPassword, token);
                      setNewPassword("");
                    } else if (action === "delete") {
                      await deleteSocial(typed, token);
                      clearSessionHint();
                      hardNavigate("/");
                      return;
                    }
                    await reload();
                    setMessage("Your login methods were updated.");
                  })
                }
              >
                {busy
                  ? "Working…"
                  : action.startsWith("link:")
                    ? "Continue to provider"
                    : action.startsWith("unlink:")
                      ? "Disconnect provider"
                      : action === "delete"
                        ? "Permanently delete my account"
                        : "Set password"}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
