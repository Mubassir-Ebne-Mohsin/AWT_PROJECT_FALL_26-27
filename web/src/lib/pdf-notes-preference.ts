"use client";

import { useSyncExternalStore } from "react";

const KEY = "sf-pdf-include-notes";
const CHANGED = "sf:pdf-notes-changed";
let memory = true;
const serverSnapshot = () => true;
function snapshot() {
  try { return window.localStorage.getItem(KEY) === "false" ? false : window.localStorage.getItem(KEY) === "true" ? true : memory; }
  catch { return memory; }
}
function subscribe(update: () => void) {
  const storage = (event: StorageEvent) => { if (event.key === KEY || event.key === null) update(); };
  window.addEventListener("storage", storage);
  window.addEventListener(CHANGED, update);
  return () => { window.removeEventListener("storage", storage); window.removeEventListener(CHANGED, update); };
}
/** One browser-wide, non-sensitive preference; private browsing still works without storage. */
export function setPdfNotes(value: boolean) {
  memory = value;
  try { window.localStorage.setItem(KEY, String(value)); } catch { /* Use memory when storage is unavailable. */ }
  window.dispatchEvent(new Event(CHANGED));
}
export function usePdfNotes() {
  return [useSyncExternalStore(subscribe, snapshot, serverSnapshot), setPdfNotes] as const;
}
