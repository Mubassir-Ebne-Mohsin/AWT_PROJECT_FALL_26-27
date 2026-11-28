"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { API_URL } from "@/lib/api/client";
import { safeNext } from "@/lib/safe-next";
export function ProviderIcon({ provider }: { provider: "google" | "github" }) {
  return provider === "google" ? (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.07v2.59A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.41 13.92A6 6 0 0 1 6.1 12c0-.67.11-1.32.31-1.92V7.49H3.07A10 10 0 0 0 2 12c0 1.61.39 3.14 1.07 4.51l3.34-2.59Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.96c1.47 0 2.79.5 3.83 1.5l2.88-2.88A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.93 5.49l3.34 2.59A6 6 0 0 1 12 5.96Z"
      />
    </svg>
  ) : (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 .6a11.7 11.7 0 0 0-3.7 22.8c.6.1.8-.2.8-.6v-2.2c-3.3.7-4-1.4-4-1.4-.5-1.4-1.3-1.8-1.3-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.4-1.3-5.4-5.8 0-1.3.5-2.3 1.2-3.2-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.8.9 1.2 1.9 1.2 3.2 0 4.5-2.8 5.5-5.4 5.8.4.4.8 1.1.8 2.2v3.3c0 .4.2.7.8.6A11.7 11.7 0 0 0 12 .6Z" />
    </svg>
  );
}
const messages: Record<string, string> = {
  "verified-email-required":
    "Add and verify a primary email in your provider account, then try again.",
  "email-or-identity-conflict":
    "An account already uses this email or provider. Sign in to your existing account, then connect it in Settings.",
  "account-unavailable":
    "This account or account action is unavailable. Contact Support if your account is suspended.",
  "provider-unavailable":
    "The sign-in provider is temporarily unavailable. Try again or use email.",
  "authorization-canceled":
    "Authorization was canceled. Nothing was connected.",
  "sign-in-failed": "Sign-in could not be confirmed. Please start again.",
};
export function SocialButtons() {
  const params = useSearchParams(),
    [enabled, setEnabled] = useState<{
      google: boolean;
      github: boolean;
    } | null>(null),
    [busy, setBusy] = useState(false);
  const reason = params.get("social_error") ?? "",
    error = Object.hasOwn(messages, reason) ? messages[reason] : undefined;
  useEffect(() => {
    const controller = new AbortController();
    fetch(API_URL + "/auth/providers", {
      signal: controller.signal,
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((r) => {
        if (
          r?.data &&
          typeof r.data.google === "boolean" &&
          typeof r.data.github === "boolean"
        )
          setEnabled(r.data);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return (
    <>
      {error && (
        <p role="alert" className="note">
          {error}
        </p>
      )}
      {enabled && (enabled.google || enabled.github) && (
        <div className="social-buttons" aria-label="Other sign-in methods">
          {(["google", "github"] as const)
            .filter((p) => enabled[p])
            .map((p) => (
              <button
                className="social-provider"
                key={p}
                type="button"
                disabled={busy}
                onClick={() => {
                  if (busy) return;
                  setBusy(true);
                  window.location.assign(
                    API_URL +
                      `/auth/${p}/start?next=` +
                      encodeURIComponent(safeNext(params.get("next"))),
                  );
                }}
              >
                <ProviderIcon provider={p} /> Continue with{" "}
                {p === "google" ? "Google" : "GitHub"}
              </button>
            ))}
          <span className="social-divider">Or continue with email</span>
        </div>
      )}
    </>
  );
}
