"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { AuthSide } from "@/components/auth/auth-side";
import { useAuth } from "@/components/auth/auth-provider";
import { Icon, cx } from "@/components/ui/icon";
import { login } from "@/lib/api/auth";
import { ApiError, isApiError } from "@/lib/api/errors";
import { notify } from "@/lib/notify";
import { authLink, safeNext } from "@/lib/safe-next";
import { fieldErrors, loginSchema } from "@/lib/validation/auth";

type Field = "email" | "password";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, status } = useAuth();
  const next = safeNext(params.get("next"));
  const redirected = params.has("next");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setErrors(fieldErrors<Field>(parsed.error));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const session = await login(parsed.data);
      notify(`Logged in as ${session.user.email}.`, "ok");
      router.replace(next);
    } catch (err) {
      if (isApiError(err)) setFormError(messageFor(err));
      // A network failure already opened the "waking up" screen.
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth-form">
        <div className="stack lg">
          <div className="stack" style={{ gap: 6 }}>
            <span className="eyebrow">Welcome back</span>
            <h1 className="h1">Log in</h1>
          </div>
          {redirected && !user && (
            <div className="note accent">
              <Icon n="lock" />
              <div>Log in to continue. You will return to the page you were opening.</div>
            </div>
          )}
          {status === "authed" && user && (
            <div className="note">
              <Icon n="info" />
              <div>
                You are logged in as {user.email}. <Link href="/dashboard">Go to the dashboard</Link>, or log in as someone else below.
              </div>
            </div>
          )}
          {formError && (
            <div className="note fail" role="alert">
              <Icon n="xcircle" />
              <div>{formError}</div>
            </div>
          )}
          <form className="stack" onSubmit={submit} noValidate>
            <div className="field">
              <label className="label" htmlFor="login-email">
                Email
              </label>
              <input
                id="login-email"
                className={cx("input", (errors.email || formError) && "bad")}
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? "login-email-err" : undefined}
              />
              {errors.email && (
                <span id="login-email-err" className="small c-fail">
                  {errors.email}
                </span>
              )}
            </div>
            <div className="field">
              <label className="label" htmlFor="login-pw">
                Password
              </label>
              <div style={{ position: "relative" }}>
                <input
                  id="login-pw"
                  className={cx("input", (errors.password || formError) && "bad")}
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ paddingRight: 64 }}
                  aria-invalid={!!errors.password}
                  aria-describedby={errors.password ? "login-pw-err" : undefined}
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ position: "absolute", right: 4, top: 4 }}
                  onClick={() => setShow(!show)}
                  aria-pressed={show}
                >
                  {show ? "Hide" : "Show"}
                </button>
              </div>
              {errors.password && (
                <span id="login-pw-err" className="small c-fail">
                  {errors.password}
                </span>
              )}
            </div>
            <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={busy}>
              {busy ? (
                <>
                  <Icon n="refresh" className="spin" /> Logging in…
                </>
              ) : (
                "Log in"
              )}
            </button>
          </form>
          <div className="small">
            <span className="muted">
              No account? <Link href={authLink("/register", next)}>Sign up</Link>
            </span>
          </div>
        </div>
      </div>
      <AuthSide />
    </div>
  );
}

function messageFor(err: ApiError): string {
  switch (err.code) {
    case "UNAUTHENTICATED":
      return "That email and password don’t match an account. Check for typos and try again.";
    case "RATE_LIMITED":
      return "Too many attempts. Wait a minute, then try again.";
    case "VALIDATION_FAILED":
      return "Check the email and password and try again.";
    case "NETWORK":
      return "Could not reach the server.";
    default:
      return "Something went wrong on our side. Try again in a moment.";
  }
}
