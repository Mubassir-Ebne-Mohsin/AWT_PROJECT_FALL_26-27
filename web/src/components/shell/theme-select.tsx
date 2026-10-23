"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";

export const THEME_OPTIONS = ["light", "dark", "system"] as const;
const subscribe = () => () => {};

export function ThemeSelect() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  return (
    <select className="btn btn-ghost btn-sm" aria-label="Color theme"
      value={mounted ? theme ?? "system" : "system"} disabled={!mounted}
      onChange={(event) => setTheme(event.target.value)}>
      {THEME_OPTIONS.map((value) => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}
    </select>
  );
}
