"use client";

import { useEffect, useState } from "react";

/** A cleanup-safe clock for relative ages; rendering reads state rather than the wall clock. */
export function useNow(intervalMs = 30000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
