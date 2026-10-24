"use client";
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { onSessionChange } from "@/lib/api/client";
import { confirmDraftNavigation, registerDraftGuard } from "@/lib/draft-navigation";
import { EditorSession } from "@/lib/editor-session";
const Context = createContext<Map<string, EditorSession> | null>(null);
export function DraftProvider({ children }: { children: ReactNode }) {
  const [sessions] = useState(() => new Map<string, EditorSession>());
  useEffect(() => {
    let owner: string | undefined;
    return onSessionChange(user => {
      if (!user || (owner && owner !== user.id)) {
        sessions.forEach(s => s.dispose());
        sessions.clear();
      }
      owner = user?.id;
    });
  }, [sessions]);
  useEffect(() => {
    const dirty = () => [...sessions.values()].some(s => s.dirty);
    const unregister = registerDraftGuard(dirty);
    const unload = (e: BeforeUnloadEvent) => { if (dirty()) { e.preventDefault(); e.returnValue = ""; } };
    const click = (e: MouseEvent) => {
      const anchor = (e.target as Element).closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || e.ctrlKey || e.metaKey) return;
      if (!confirmDraftNavigation(anchor.href)) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click, true);
    return () => { unregister(); window.removeEventListener("beforeunload", unload); document.removeEventListener("click", click, true); };
  }, [sessions]);
  return <Context.Provider value={sessions}>{children}</Context.Provider>;
}
export function useDrafts() {
  const value = useContext(Context);
  if (!value) throw new Error("Draft provider required");
  return value;
}
