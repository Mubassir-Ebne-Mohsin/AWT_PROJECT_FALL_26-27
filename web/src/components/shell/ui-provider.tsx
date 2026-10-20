"use client";

import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from "react";
import type { SystemKind } from "@/lib/system-states";

export interface UiState {
  palette: boolean;
  ai: boolean;
  help: boolean;
  shortcuts: boolean;
  feedback: boolean;
  navMenu: boolean;
  userMenu: boolean;
  dev: boolean;
  /** Which system-state screen replaces the page, if any. */
  system: SystemKind | null;
  /** True when the state was forced from the dev switcher rather than a real failure. */
  systemFromDev: boolean;
}

const INITIAL: UiState = {
  palette: false,
  ai: false,
  help: false,
  shortcuts: false,
  feedback: false,
  navMenu: false,
  userMenu: false,
  dev: false,
  system: null,
  systemFromDev: false,
};

interface UiContextValue {
  ui: UiState;
  setUI: (patch: Partial<UiState>) => void;
  openSystem: (kind: SystemKind, fromDev?: boolean) => void;
  closeSystem: () => void;
}

const UiContext = createContext<UiContextValue | null>(null);

export function UiProvider({ children }: { children: ReactNode }) {
  const [ui, setUi] = useState<UiState>(INITIAL);
  const setUI = useCallback((patch: Partial<UiState>) => setUi((s) => ({ ...s, ...patch })), []);
  const openSystem = useCallback(
    (kind: SystemKind, fromDev = false) =>
      setUi((s) => ({ ...s, system: kind, systemFromDev: fromDev, dev: false, palette: false })),
    [],
  );
  const closeSystem = useCallback(() => setUi((s) => ({ ...s, system: null, systemFromDev: false })), []);
  const value = useMemo(() => ({ ui, setUI, openSystem, closeSystem }), [ui, setUI, openSystem, closeSystem]);
  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi() {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error("useUi must be used inside <UiProvider>");
  return ctx;
}
