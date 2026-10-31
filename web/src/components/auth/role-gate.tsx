"use client";

import Link from "next/link";
import { ReactNode } from "react";
import { useMyRoles } from "@/components/auth/use-my-roles";
import { Icon } from "@/components/ui/icon";
import { ROLE_LABEL, RoleName, canEnter } from "@/lib/roles-presentation";

/**
 * Wraps a screen that belongs to one role. It decides what to show only; every action behind it is checked again by
 * the server, so hiding a screen is a courtesy, not the protection.
 */
export function RoleGate({ role, children }: { role: RoleName; children: ReactNode }) {
  const { roles, loading, failed } = useMyRoles();
  if (loading)
    return (
      <p className="muted" role="status">
        Checking your access…
      </p>
    );
  if (failed)
    return (
      <div className="empty" role="alert" data-testid="role-gate-unavailable">
        <Icon n="lock" s={22} />
        <h2 className="h3">We could not check your access</h2>
        <p className="muted">Nothing was changed. Try again in a moment.</p>
      </div>
    );
  if (!canEnter(roles, role))
    return (
      <div className="empty" role="alert" data-testid="role-gate-denied">
        <Icon n="lock" s={22} />
        <h2 className="h3">This area is for {ROLE_LABEL[role]} accounts</h2>
        <p className="muted">Your account does not have that role. An Admin can grant it.</p>
        <Link href="/dashboard" className="btn btn-primary btn-sm">
          Back to your dashboard
        </Link>
      </div>
    );
  return <>{children}</>;
}
