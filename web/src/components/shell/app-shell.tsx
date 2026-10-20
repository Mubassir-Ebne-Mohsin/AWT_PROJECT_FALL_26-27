"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ReactNode, Suspense, useEffect, useMemo, useRef } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { AiPanel } from "@/components/shell/ai-panel";
import { CommandPalette } from "@/components/shell/command-palette";
import { FeedbackModal } from "@/components/shell/feedback-modal";
import { HelpDrawer } from "@/components/shell/help-drawer";
import { ShortcutsSheet } from "@/components/shell/shortcuts-sheet";
import { TopBar } from "@/components/shell/top-bar";
import { useUi } from "@/components/shell/ui-provider";
import { SessionModal } from "@/components/system/session-modal";
import { SystemScreen } from "@/components/system/system-screen";
import { isProtected, resolveRoute } from "@/lib/routes";

// Bundled only outside production, so the dev switcher cannot ship.
const DevSwitcher =
  process.env.NODE_ENV !== "production"
    ? dynamic(() => import("@/components/shell/dev-switcher"), { ssr: false })
    : () => null;

const isTyping = (el: Element | null) =>
  !!el &&
  (el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    (el as HTMLElement).isContentEditable);

/** Sends signed-out visitors of protected routes to /login, remembering where they were. */
function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const router = useRouter();
  const { status } = useAuth();
  const { route } = resolveRoute(pathname);
  const guarded = isProtected(route);

  useEffect(() => {
    if (guarded && status === "anon") {
      const next = pathname + (search ? `?${search}` : "");
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [guarded, status, pathname, search, router]);

  if (guarded && status !== "authed") {
    return (
      <div className="page" role="status" aria-live="polite">
        <p className="muted">Checking your session…</p>
      </div>
    );
  }
  return <>{children}</>;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { ui, setUI } = useUi();
  const { status } = useAuth();
  const resolved = useMemo(() => resolveRoute(pathname), [pathname]);
  const stateRef = useRef({ ui, status, pathname });
  useEffect(() => {
    stateRef.current = { ui, status, pathname };
  });

  // Close transient UI whenever the route changes.
  useEffect(() => {
    setUI({ navMenu: false, userMenu: false, palette: false });
  }, [pathname, setUI]);

  useEffect(() => {
    let gAt = 0;
    const onKey = (e: KeyboardEvent) => {
      const { ui: u, status: st } = stateRef.current;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key;
      if (mod && k.toLowerCase() === "k") {
        e.preventDefault();
        setUI({ palette: !u.palette });
        return;
      }
      if (process.env.NODE_ENV !== "production" && mod && e.shiftKey && k.toLowerCase() === "d") {
        e.preventDefault();
        setUI({ dev: !u.dev });
        return;
      }
      if (k === "Escape") {
        // Modals handle their own Escape; this closes the non-modal layers.
        if (u.palette || u.shortcuts || u.feedback) return;
        if (u.userMenu || u.navMenu || u.dev) setUI({ userMenu: false, navMenu: false, dev: false });
        else if (u.ai || u.help) setUI({ ai: false, help: false });
        return;
      }
      if (isTyping(document.activeElement) || mod || e.altKey) return;
      if (u.palette || u.shortcuts || u.feedback || u.system === "session") return;
      if (k === "?") {
        setUI({ shortcuts: true });
        return;
      }
      if (k === ".") {
        if (st === "authed") setUI({ ai: !u.ai, help: false });
        return;
      }
      if (gAt && Date.now() - gAt < 1200) {
        gAt = 0;
        if (k === "d") router.push("/dashboard");
        else if (k === "n") router.push("/new");
        return;
      }
      if (k === "g") gAt = Date.now();
    };
    const onDown = (e: MouseEvent) => {
      const { ui: u } = stateRef.current;
      const target = e.target as Element;
      if ((u.userMenu || u.navMenu) && !target.closest(".menu-wrap")) setUI({ userMenu: false, navMenu: false });
      if (u.dev && !target.closest(".devmenu")) setUI({ dev: false });
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [router, setUI]);

  const showSystem = ui.system && ui.system !== "session";

  return (
    <div className="shell">
      {/* React 19 hoists this into <head>; it survives client navigations, unlike a document.title write. */}
      <title>{`${showSystem && ui.system === "404" ? "Page not found" : resolved.title} · StressForge`}</title>
      <TopBar pathname={pathname} />
      <main className="main" id="main" tabIndex={-1}>
        {showSystem ? (
          <SystemScreen key={`sys-${ui.system}`} kind={ui.system!} fromDev={ui.systemFromDev} />
        ) : (
          <Suspense fallback={null}>
            <AuthGate>{children}</AuthGate>
          </Suspense>
        )}
      </main>
      {ui.ai && status === "authed" && <AiPanel />}
      {ui.help && !ui.ai && <HelpDrawer resolved={resolved} />}
      {ui.palette && <CommandPalette />}
      {ui.shortcuts && <ShortcutsSheet />}
      {ui.feedback && <FeedbackModal path={pathname} />}
      {ui.system === "session" && <SessionModal />}
      <DevSwitcher />
    </div>
  );
}
