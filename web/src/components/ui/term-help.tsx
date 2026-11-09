"use client";

import { useId, useState, type ReactNode } from "react";
import { entryById } from "@/lib/concept-help";

/**
 * A term that opens a short written definition from the Concept help topics. It opens on click, Enter or Space
 * (never on hover alone), closes on a second press or Escape, and is a real button so it is reachable by keyboard.
 */
export function TermHelp({ topic, children }: { topic: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const cardId = useId();
  const entry = entryById(topic);
  if (!entry) return <>{children}</>;
  return (
    <span className="term-help">
      <button
        type="button"
        className="term-btn"
        aria-expanded={open}
        aria-controls={open ? cardId : undefined}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) {
            event.stopPropagation();
            setOpen(false);
          }
        }}
      >
        {children}
      </button>
      {open && (
        <span id={cardId} role="note" className="term-card">
          <strong>{entry.title}.</strong> {entry.a}
        </span>
      )}
    </span>
  );
}
