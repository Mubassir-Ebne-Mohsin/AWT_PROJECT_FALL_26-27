"use client";

import { enterDrawer } from "@/lib/drawer-focus";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { useUi } from "@/components/shell/ui-provider";
import { Icon } from "@/components/ui/icon";
import { LEARN_TOPICS, PHASE_NAMES, WS_TABS } from "@/lib/catalog";
import { HELP } from "@/lib/help";
import type { ResolvedRoute } from "@/lib/routes";

export function HelpDrawer({ resolved }: { resolved: ResolvedRoute }) {
  const { setUI } = useUi();
  const closeRef = useRef<HTMLButtonElement>(null);
  const { route, params } = resolved;

  useEffect(() => enterDrawer(closeRef.current), []);

  const tab = route.id === "workspace" ? WS_TABS.find((t) => t.id === params.tab) : undefined;
  const entry = HELP[route.id === "workspace" ? `ws-${params.tab}` : route.id];
  const phase = tab ? tab.phase : route.phase;
  const desc = tab?.desc ?? route.description ?? "This screen shows a system state.";

  return (
    <aside className="drawer" aria-label="Help">
      <div className="drawer-h">
        <Icon n="help" />
        <div className="grow">
          <div style={{ fontWeight: 650 }}>Help</div>
          <div className="muted small">{tab ? `${tab.label} tab` : resolved.title}</div>
        </div>
        <button ref={closeRef} className="btn btn-ghost icon btn-sm" aria-label="Close help" onClick={() => setUI({ help: false })}>
          <Icon n="x" />
        </button>
      </div>
      <div className="drawer-b stack lg">
        {entry ? (
          <>
            <div className="stack">
              <div className="eyebrow">What this screen is for</div>
              <p className="ink2">{entry.what}</p>
            </div>
            <div className="stack">
              <div className="eyebrow">How to use it</div>
              <ul className="ph-list">
                {entry.how.map((x) => (
                  <li key={x}>
                    <Icon n="tick" s={14} />
                    <span>{x}</span>
                  </li>
                ))}
              </ul>
            </div>
            {entry.concepts.length > 0 && (
              <div className="stack">
                <div className="eyebrow">Concepts</div>
                <div className="row tight">
                  {entry.concepts.map((c) => (
                    <Link key={c} href={`/learn/${c}`} className="chip">
                      {LEARN_TOPICS[c]}
                    </Link>
                  ))}
                </div>
                <p className="hint">Concept pages arrive in phase 4.</p>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="stack">
              <div className="eyebrow">What this screen is for</div>
              <p className="ink2">{desc}</p>
            </div>
            {phase > 1 && (
              <div className="note">
                <Icon n="clock" />
                <div>
                  This screen arrives in phase {phase} ({PHASE_NAMES[phase]}). The page you see is a placeholder with the right title and breadcrumb.
                </div>
              </div>
            )}
          </>
        )}
        <div className="stack">
          <div className="eyebrow">Anywhere</div>
          <div className="kv" style={{ gridTemplateColumns: "1fr auto" }}>
            <span>Jump to any screen</span>
            <span>
              <kbd>Ctrl</kbd> <kbd>K</kbd>
            </span>
            <span>All shortcuts</span>
            <span>
              <kbd>?</kbd>
            </span>
            <span>AI assistant</span>
            <span>
              <kbd>.</kbd>
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
