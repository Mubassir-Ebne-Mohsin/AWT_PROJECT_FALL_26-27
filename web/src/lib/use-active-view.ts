"use client";
import { useCallback, useEffect, useRef } from "react";
/** Async UI actions may finish after navigation; only their mounted view may redirect. */
export function useActiveView() {
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  return useCallback(() => active.current, []);
}
