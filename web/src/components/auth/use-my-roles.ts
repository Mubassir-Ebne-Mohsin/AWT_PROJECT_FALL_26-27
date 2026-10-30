"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { fetchMyRoles } from "@/lib/api/roles";

/**
 * The signed-in account's roles, read from the server. Keyed by account id so one account never sees another's roles
 * after signing out and in. Short stale time: a role granted or revoked shows up within a minute without a re-login.
 */
export function useMyRoles() {
  const { user, status } = useAuth();
  const query = useQuery({
    queryKey: ["account-roles", user?.id],
    queryFn: ({ signal }) => fetchMyRoles(signal),
    enabled: status === "authed" && !!user,
    staleTime: 15_000,
    retry: false,
  });
  return { roles: query.data?.roles ?? [], loading: query.isPending && query.fetchStatus !== "idle", failed: query.isError };
}
