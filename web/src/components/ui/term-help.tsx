"use client";

import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { entryById } from "@/lib/concept-help";

const EDGE = 8;

/**
 * A term that opens a short written definition from the Concept help topics. It opens on click, Enter or Space
 * (never on hover alone), closes on a second press or Escape, and is a real button so it is reachable by keyboard.
 * On a narrow screen the card is moved back inside the window instead of running off its edge.
 */
export function TermHelp({ topic, children }: { topic: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const cardId = useId();
  const card = useRef<HTMLSpanElement>(null);
  const entry = entryById(topic);

  useLayoutEffect(() => {
    const el = card.current;
    if (!open || !el) return;
    el.style.transform = "";
    const rect = el.getBoundingClientRect();
    const width = document.documentElement.clientWidth;
    let shift = 0;
    if (rect.right > width - EDGE) shift = width - EDGE - rect.right;
    if (rect.left + shift < EDGE) shift = EDGE - rect.left;
    if (shift !== 0) el.style.transform = `translateX(${Math.round(shift)}px)`;
  }, [open]);

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
        <span ref={card} id={cardId} role="note" className="term-card">
          <strong>{entry.title}.</strong> {entry.a}
        </span>
      )}
    </span>
  );
}
