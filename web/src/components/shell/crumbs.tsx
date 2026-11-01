"use client";

import Link from "next/link";
import { useAuth } from "@/components/auth/auth-provider";
import { Icon } from "@/components/ui/icon";
import { crumbsFor, ResolvedRoute } from "@/lib/routes";

/** Whether someone is signed in. False where there is no AuthProvider at all (isolated renders), never an error. */
function useSignedIn() {
  try {
    return useAuth().status === "authed";
  } catch {
    return false;
  }
}

export function Crumbs({ resolved }: { resolved: ResolvedRoute }) {
  const signedIn = useSignedIn();
  // Public pages start at "Home" (the landing page). A signed-in person's home is their dashboard.
  const list = crumbsFor(resolved).map((c, i) => (i === 0 && signedIn && c.label === "Home" && c.to === "/" ? { label: "Dashboard", to: "/dashboard" } : c));
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      {list.map((c, i) => {
        const last = i === list.length - 1;
        return (
          <span key={`${c.label}-${i}`} style={{ display: "contents" }}>
            {i > 0 && <Icon n="chevR" s={12} />}
            {c.to && !last ? (
              <Link href={c.to}>{c.label}</Link>
            ) : (
              <span className={last ? "cur" : ""} aria-current={last ? "page" : undefined}>
                {c.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
