"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { pendingSocial, finishSocial } from "@/lib/api/social";
import { safeNext } from "@/lib/safe-next";
import { AuthSide } from "@/components/auth/auth-side";
import { UsernameField } from "@/components/auth/username-field";
export function SocialRegistration() {
  const router = useRouter(),
    [pending, setPending] = useState<Awaited<
      ReturnType<typeof pendingSocial>
    > | null>(null),
    [name, setName] = useState(""),
    [username, setUsername] = useState(""),
    [terms, setTerms] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    pendingSocial()
      .then((p) => {
        if (alive) {
          setPending(p);
          setName(p.displayName);
        }
      })
      .catch(() => {
        if (alive)
          setError("This registration expired. Start again from Log in.");
      });
    return () => {
      alive = false;
    };
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!pending || busy) return;
    setError("");
    if (!name.trim() || name.trim().length > 60 || !terms) {
      setError(
        "Enter a display name (up to 60 characters) and accept the terms.",
      );
      return;
    }
    setBusy(true);
    try {
      const s = await finishSocial({
        displayName: name.trim(),
        username: username.trim() || undefined,
        terms,
        csrf: pending.csrf,
      });
      router.replace(safeNext(s.next));
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Registration failed. Please start again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth">
      <div className="auth-form">
        <div className="stack lg">
          <span className="eyebrow">ONE MORE STEP</span>
          <h1 className="h1">Complete your account</h1>
          {!pending && !error && (
            <p role="status">Checking provider registration…</p>
          )}
          {error && (
            <p role="alert" className="note">
              {error}
            </p>
          )}
          {pending && (
            <form className="stack social-register-form" onSubmit={submit}>
              <label className="stack">
                Verified email
                <input
                  className="field"
                  value={pending.email ?? ""}
                  readOnly
                  autoComplete="email"
                />
              </label>
              <label className="stack">
                Name
                <input
                  className="field"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={60}
                  autoComplete="name"
                  required
                />
              </label>
              <UsernameField
                optional
                value={username}
                onChange={setUsername}
                disabled={busy}
              />
              <label className="row">
                <input
                  type="checkbox"
                  checked={terms}
                  onChange={(e) => setTerms(e.target.checked)}
                />
                I accept the <Link href="/terms">terms</Link> and{" "}
                <Link href="/privacy">privacy notes</Link>.
              </label>
              <button className="btn btn-primary" disabled={busy || !terms}>
                {busy ? "Creating account…" : "Create account"}
              </button>
            </form>
          )}
          <Link href="/login">Start again from Log in</Link>
        </div>
      </div>
      <AuthSide />
    </div>
  );
}
