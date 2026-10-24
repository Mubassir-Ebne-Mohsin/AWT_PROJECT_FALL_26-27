"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  ReactNode,
} from "react";
import { onSessionChange } from "@/lib/api/client";
import { useAuth } from "@/components/auth/auth-provider";
import { CreationSession } from "@/lib/creation-session";
const Context = createContext<Map<string, CreationSession> | null>(null);
export function CreationProvider({ children }: { children: ReactNode }) {
  const [sessions] = useState(() => new Map<string, CreationSession>());
  useEffect(() => {
    let owner: string | undefined;
    return onSessionChange((user) => {
      if (!user || (owner && owner !== user.id)) {
        sessions.forEach((s) => s.dispose());
        sessions.clear();
      }
      owner = user?.id;
    });
  }, [sessions]);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (
        [...sessions.values()].some((s) => s.state.pending || s.state.uncertain)
      ) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, [sessions]);
  return <Context.Provider value={sessions}>{children}</Context.Provider>;
}
export function useCreation(key: string) {
  const sessions = useContext(Context),
    { user } = useAuth();
  if (!sessions) throw new Error("Creation provider required");
  const id = (user?.id ?? "signed-out") + ":" + key;
  if (!sessions.has(id)) sessions.set(id, new CreationSession());
  const session = sessions.get(id)!;
  return [
    session,
    useSyncExternalStore(session.subscribe, session.snapshot, session.snapshot),
  ] as const;
}
