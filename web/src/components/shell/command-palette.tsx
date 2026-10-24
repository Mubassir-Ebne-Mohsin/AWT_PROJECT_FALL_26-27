"use client";

import { THEME_OPTIONS } from "@/components/shell/theme-select";
import { confirmDraftNavigation } from "@/lib/draft-navigation";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useMemo } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { useUi } from "@/components/shell/ui-provider";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import { CHALLENGES, EVAL_TABS, LEARN_TOPICS, SETTINGS_SECTIONS } from "@/lib/catalog";
import { STATIC_ROUTES } from "@/lib/routes";
import { SYSTEM_STATES } from "@/lib/system-states";

interface Cmd {
  group: string;
  label: string;
  run: () => void;
  icon?: string;
  hint?: string;
  keywords?: string;
}

/** Ctrl+K palette. Every destination comes from the route registry and catalog. */
export function CommandPalette() {
  const { setUI, openSystem } = useUi();
  const { status, signOut } = useAuth();
  const { setTheme } = useTheme();
  const router = useRouter();
  const authed = status === "authed";

  const commands = useMemo(() => {
    const out: Cmd[] = [];
    const add = (group: string, label: string, run: () => void, o: Partial<Cmd> = {}) =>
      out.push({ group, label, run, ...o });
    const go = (path: string) => () => { if (confirmDraftNavigation(path)) router.push(path); };

    if (authed) add("Actions", "New design", go("/new"), { icon: "plus", hint: "/new" });
    for (const theme of THEME_OPTIONS) {
      add("Appearance", `Use ${theme} theme`, () => setTheme(theme), { icon: theme === "dark" ? "moon" : "sun" });
    }
    if (authed) add("Actions", "Ask the AI assistant", () => setUI({ ai: true, help: false }), { icon: "sparkle", hint: "." });
    add("Actions", "Help for this screen", () => setUI({ help: true, ai: false }), { icon: "help" });
    add("Actions", "Keyboard shortcuts", () => setUI({ shortcuts: true }), { icon: "keyboard", hint: "?" });
    add("Actions", "Send feedback", () => setUI({ feedback: true }), { icon: "msg" });
    if (authed) add("Actions", "Log out", () => void signOut(), { icon: "logout" });
    else add("Actions", "Log in", go("/login"), { icon: "user" });

    for (const r of STATIC_ROUTES) {
      const group = r.area === "public" ? "Public pages" : r.area === "dev" ? "Developer" : "App";
      add(group, r.title as string, go(r.path), { icon: "arrowR", hint: r.phase > 2 ? `Phase ${r.phase}` : r.path });
    }
    add("App", "Evaluation", go("/evaluation/simulator"), { icon: "arrowR", hint: "Phase 5" });
    add("App", "Settings", go("/settings/profile"), { icon: "arrowR", hint: "Phase 5" });
    for (const [k, v] of Object.entries(LEARN_TOPICS)) add("Learn", v, go(`/learn/${k}`), { icon: "book", hint: "Phase 4", keywords: "concept" });
    for (const [k, v] of Object.entries(CHALLENGES)) add("Challenges", v, go(`/challenges/${k}`), { icon: "flag", hint: "Phase 4" });
    for (const [k, v] of Object.entries(EVAL_TABS)) add("Evaluation", `Evaluation: ${v}`, go(`/evaluation/${k}`), { icon: "beaker", hint: "Phase 5" });
    for (const [k, v] of Object.entries(SETTINGS_SECTIONS)) add("Settings", `Settings: ${v}`, go(`/settings/${k}`), { icon: "settings", hint: "Phase 5" });
    if (process.env.NODE_ENV !== "production") {
      for (const st of SYSTEM_STATES) add("System states", st.label, () => openSystem(st.id, true), { icon: st.icon, hint: st.code, keywords: "error state dev" });
    }
    return out;
  }, [authed, router, setTheme, setUI, signOut, openSystem]);

  const groups = useMemo(() => {
    const map = new Map<string, Cmd[]>();
    for (const c of commands) map.set(c.group, [...(map.get(c.group) ?? []), c]);
    return [...map.entries()];
  }, [commands]);

  const close = () => setUI({ palette: false });
  const run = (c: Cmd) => {
    close();
    // Let the dialog unmount (and return focus) before navigating or opening another panel.
    setTimeout(c.run, 0);
  };

  return (
    <Modal label="Command palette" wide onClose={close}>
      <Command label="Command palette" loop>
        <div style={{ position: "relative" }}>
          <Icon n="search" s={18} style={{ position: "absolute", left: 16, top: 17, color: "var(--ink-3)" }} />
          <Command.Input data-autofocus className="cmdk-input" placeholder="Jump to a screen, a design, or an action…" aria-label="Search commands" />
        </div>
        <Command.List className="cmdk-list">
          <Command.Empty className="empty">Nothing matches your search.</Command.Empty>
          {groups.map(([group, items]) => (
            <Command.Group key={group} heading={group}>
              {items.map((c) => (
                <Command.Item
                  key={`${c.group}:${c.label}:${c.hint ?? ""}`}
                  className="cmdk-item"
                  value={`${c.label} ${c.group} ${c.keywords ?? ""} ${c.hint ?? ""}`}
                  onSelect={() => run(c)}
                >
                  <Icon n={c.icon ?? "arrowR"} s={15} />
                  <span>{c.label}</span>
                  {c.hint && <span className="path">{c.hint}</span>}
                </Command.Item>
              ))}
            </Command.Group>
          ))}
        </Command.List>
        <div className="modal-f" style={{ justifyContent: "space-between" }}>
          <span className="muted small row tight">
            <kbd>↑</kbd>
            <kbd>↓</kbd> move <kbd>↵</kbd> open <kbd>Esc</kbd> close
          </span>
          <span className="muted small">{commands.length} destinations</span>
        </div>
      </Command>
    </Modal>
  );
}
