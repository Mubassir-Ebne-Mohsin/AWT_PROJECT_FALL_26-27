"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { useUi } from "@/components/shell/ui-provider";
import { Icon } from "@/components/ui/icon";
import { SYSTEM_STATES } from "@/lib/system-states";

/**
 * Developer tool: forces any system state. Hidden until Ctrl+Shift+D. AppShell only
 * imports this module when NODE_ENV !== "production", so it is not in production bundles.
 */
export default function DevSwitcher() {
  const { ui, setUI, openSystem, closeSystem } = useUi();
  const { status, signOut } = useAuth();
  const router = useRouter();
  if (!ui.dev) return null;
  const go = (path: string) => {
    setUI({ dev: false });
    router.push(path);
  };
  return (
    <div className="devmenu" role="menu" aria-label="Developer states">
      <div className="row between" style={{ padding: "4px 8px 8px" }}>
        <span className="eyebrow">System states</span>
        <span className="tag mock">Dev only</span>
      </div>
      {SYSTEM_STATES.map((st) => (
        <button
          key={st.id}
          className="mi"
          role="menuitem"
          onClick={() => openSystem(st.id, true)}
          style={ui.system === st.id ? { background: "var(--accent-soft)" } : undefined}
        >
          <Icon n={st.icon} s={14} /> {st.label}
          <span className="code">{st.code}</span>
        </button>
      ))}
      {ui.system && (
        <button className="mi" role="menuitem" onClick={closeSystem}>
          <Icon n="x" s={14} /> Clear state, back to the app
        </button>
      )}
      <div style={{ height: 1, background: "var(--line-soft)", margin: "6px 4px" }} />
      <div className="eyebrow" style={{ padding: "6px 8px" }}>
        Natural triggers
      </div>
      <button className="mi" role="menuitem" onClick={() => go("/this/does-not-exist")}>
        <Icon n="search" s={14} /> Visit a broken link
      </button>
      {status === "authed" && (
        <button className="mi" role="menuitem" onClick={() => void signOut()}>
          <Icon n="logout" s={14} /> Log out
        </button>
      )}
      <div className="hint" style={{ padding: 8 }}>
        Ctrl+Shift+D toggles this menu. Not included in production builds.
      </div>
    </div>
  );
}
