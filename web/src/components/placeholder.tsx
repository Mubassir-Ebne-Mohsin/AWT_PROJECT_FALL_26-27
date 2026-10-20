"use client";

import Link from "next/link";
import { notFound, usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { Crumbs } from "@/components/shell/crumbs";
import { useUi } from "@/components/shell/ui-provider";
import { Icon } from "@/components/ui/icon";
import { FIDELITY_LABEL, PHASE_NAMES, WS_TABS } from "@/lib/catalog";
import { NOT_FOUND_ROUTE, resolveRoute } from "@/lib/routes";

/** The one placeholder every not-yet-built route renders (title, breadcrumb, what is coming). */
export function RoutePlaceholder() {
  const pathname = usePathname();
  const { setUI } = useUi();
  const { status } = useAuth();
  const resolved = resolveRoute(pathname);
  if (resolved.route === NOT_FOUND_ROUTE) notFound();

  const { route, params } = resolved;
  const tab = route.id === "workspace" ? WS_TABS.find((t) => t.id === params.tab) : undefined;
  const phase = tab?.phase ?? route.phase;
  const fidelity = tab?.fid ?? route.fidelity;
  const title = tab ? tab.label : resolved.title;
  const description = tab?.desc ?? route.description ?? `The ${title} screen of the design workspace.`;
  const planned = tab?.planned ?? route.planned ?? [];
  const authed = status === "authed";

  return (
    <div className="page">
      <Crumbs resolved={resolved} />
      <div className="ph">
        <div className="stack lg">
          <div className="row tight">
            <span className="tag accent">Phase {phase}</span>
            <span className="tag">{FIDELITY_LABEL[fidelity]}</span>
          </div>
          <h1 className="h1">{title}</h1>
          <p className="lede">{description}</p>
          <div>
            <div className="phase-rail" aria-hidden="true">
              {[1, 2, 3, 4, 5].map((p) => (
                <span key={p} className={p <= 1 ? "done" : p === phase ? "here" : ""} />
              ))}
            </div>
            <p className="hint" style={{ marginTop: 8 }}>
              Phase 1 is built. Coming in phase {phase}: {PHASE_NAMES[phase]}.
            </p>
          </div>
          <div className="row">
            <Link href={authed ? "/dashboard" : "/login"} className="btn btn-primary">
              {authed ? "Back to the dashboard" : "Log in"}
            </Link>
            <button className="btn" onClick={() => setUI({ palette: true })}>
              <Icon n="search" /> Jump to another screen
            </button>
          </div>
        </div>
        <div className="panel ph-card stack">
          <div className="eyebrow">Planned for this screen</div>
          <ul className="ph-list">
            {(planned.length ? planned : [`The ${title} screen arrives in phase ${phase}.`]).map((p) => (
              <li key={p}>
                <Icon n="clock" s={14} />
                <span>{p}</span>
              </li>
            ))}
          </ul>
          <hr />
          <div className="eyebrow">Works now</div>
          <ul className="ph-list">
            {(authed
              ? [
                  ["/dashboard", "Dashboard"],
                  ["/settings/profile", "Settings (placeholder)"],
                ]
              : [
                  ["/login", "Log in"],
                  ["/register", "Sign up"],
                ]
            ).map(([to, label]) => (
              <li key={to}>
                <Icon n="arrowR" s={14} />
                <Link href={to}>{label}</Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
