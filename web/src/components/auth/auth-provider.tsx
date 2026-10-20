"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { onSessionChange, refreshSession, RefreshResult, User } from "@/lib/api/client";
import { logout as apiLogout } from "@/lib/api/auth";
import { hasSessionHint } from "@/lib/session-hint";

export type AuthStatus = "loading" | "authed" | "anon";

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  /** Try to restore the session from the refresh cookie (runs on load and after an outage). */
  restore: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<User | null>(null);
  const queryClient = useQueryClient();

  // Login, register and logout all flow through here, wherever they were called from.
  useEffect(
    () =>
      onSessionChange((next) => {
        setUser(next);
        setStatus(next ? "authed" : "anon");
      }),
    [],
  );

  const applyResult = useCallback((result: RefreshResult) => {
    if (result.ok) {
      setUser(result.session.user);
      setStatus("authed");
    } else if (result.reason === "signed-out") {
      setUser(null);
      setStatus("anon");
    }
    // "unreachable": stay in "loading"; the waking-up screen retries once the API is back.
  }, []);

  const restore = useCallback(() => refreshSession().then(applyResult), [applyResult]);

  useEffect(() => {
    // No hint cookie means no one signed in here: skip the request (and its 401 in the console).
    const signedOut: RefreshResult = { ok: false, reason: "signed-out" };
    void (hasSessionHint() ? refreshSession() : Promise.resolve(signedOut)).then(applyResult);
  }, [applyResult]);

  const signOut = useCallback(async () => {
    await apiLogout();
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo(() => ({ status, user, restore, signOut }), [status, user, restore, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "U";
