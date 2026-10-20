"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { AuthSide } from "@/components/auth/auth-side";
import { Icon, cx } from "@/components/ui/icon";
import { register } from "@/lib/api/auth";
import { isApiError } from "@/lib/api/errors";
import { notify } from "@/lib/notify";
import { safeNext } from "@/lib/safe-next";
import { fieldErrors, passwordStrength, registerSchema } from "@/lib/validation/auth";

type Field = "displayName" | "email" | "password" | "terms";

export function RegisterForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [f, setF] = useState({ displayName: "", email: "", password: "", terms: false });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { score, word } = passwordStrength(f.password);
  const color = score >= 3 ? "var(--ok)" : score === 2 ? "var(--warn)" : "var(--fail)";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const parsed = registerSchema.safeParse(f);
    if (!parsed.success) {
      setErrors(fieldErrors<Field>(parsed.error));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const { displayName, email, password } = parsed.data;
      const session = await register({ displayName, email, password });
      notify(`Welcome, ${session.user.displayName}. Your account is ready.`, "ok");
      router.replace(next);
    } catch (err) {
      if (!isApiError(err)) return;
      if (err.code === "VALIDATION_FAILED") {
        const server = err.fieldErrors;
        setErrors(server as Partial<Record<Field, string>>);
        if (Object.keys(server).length === 0) setFormError("Check your details and try again.");
      } else if (err.code === "RATE_LIMITED") {
        setFormError("Too many attempts. Wait a minute, then try again.");
      } else if (err.code !== "NETWORK") {
        setFormError("Something went wrong on our side. Try again in a moment.");
      }
    } finally {
      setBusy(false);
    }
  };

  const bind = (key: "displayName" | "email" | "password") => ({
    value: f[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [key]: e.target.value }),
    "aria-invalid": !!errors[key],
    "aria-describedby": errors[key] ? `reg-${key}-err` : undefined,
  });
  const err = (key: Field) =>
    errors[key] && (
      <span id={`reg-${key}-err`} className="small c-fail">
        {errors[key]}
      </span>
    );

  return (
    <div className="auth">
      <div className="auth-form">
        <div className="stack lg">
          <div className="stack" style={{ gap: 6 }}>
            <span className="eyebrow">Free while in beta</span>
            <h1 className="h1">Create your account</h1>
            <p className="muted">50 AI calls a day, unlimited stress tests.</p>
          </div>
          {formError && (
            <div className="note fail" role="alert">
              <Icon n="xcircle" />
              <div>{formError}</div>
            </div>
          )}
          <form className="stack" onSubmit={submit} noValidate>
            <div className="field">
              <label className="label" htmlFor="reg-name">
                Name
              </label>
              <input id="reg-name" className={cx("input", errors.displayName && "bad")} autoComplete="name" placeholder="Ada Lovelace" {...bind("displayName")} />
              {err("displayName")}
            </div>
            <div className="field">
              <label className="label" htmlFor="reg-email">
                Email
              </label>
              <input id="reg-email" className={cx("input", errors.email && "bad")} type="email" autoComplete="email" placeholder="you@example.com" {...bind("email")} />
              {err("email")}
            </div>
            <div className="field">
              <label className="label" htmlFor="reg-pw">
                Password
              </label>
              <input id="reg-pw" className={cx("input", errors.password && "bad")} type="password" autoComplete="new-password" placeholder="At least 8 characters" {...bind("password")} />
              <div className="strength" aria-hidden="true">
                {[0, 1, 2, 3].map((i) => (
                  <i key={i} style={f.password && i < Math.max(1, score) ? { background: color } : undefined} />
                ))}
              </div>
              {err("password") ?? <span className="hint">{f.password ? `Strength: ${word}` : "Use 8 or more characters with at least one letter and one number."}</span>}
            </div>
            <label className="row tight small ink2">
              <input id="reg-terms" type="checkbox" checked={f.terms} onChange={(e) => setF({ ...f, terms: e.target.checked })} aria-invalid={!!errors.terms} /> I accept the{" "}
              <Link href="/terms">terms</Link> and the <Link href="/privacy">privacy notes</Link>
            </label>
            {err("terms")}
            <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={busy}>
              {busy ? (
                <>
                  <Icon n="refresh" className="spin" /> Creating account…
                </>
              ) : (
                "Create account"
              )}
            </button>
          </form>
          <div className="small">
            <span className="muted">
              Have an account? <Link href="/login">Log in</Link>
            </span>
          </div>
        </div>
      </div>
      <AuthSide />
    </div>
  );
}
