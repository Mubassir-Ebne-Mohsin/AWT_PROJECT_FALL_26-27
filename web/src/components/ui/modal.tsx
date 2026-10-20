"use client";

import { ReactNode, useEffect, useRef } from "react";
import { cx } from "@/components/ui/icon";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ModalProps {
  /** Accessible name of the dialog. */
  label: string;
  onClose?: () => void;
  wide?: boolean;
  center?: boolean;
  alert?: boolean;
  /** Offset from the top: the palette sits high, dialogs sit centred. */
  children: ReactNode;
  labelledBy?: string;
}

/**
 * Scrim + dialog with a focus trap. Focus moves in on open (to `[data-autofocus]` if
 * present), Tab cycles inside, Escape closes, and focus returns to the trigger on close.
 */
export function Modal({ label, onClose, wide, center, alert, children, labelledBy }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const first = dialog?.querySelector<HTMLElement>("[data-autofocus]") ?? dialog?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    return () => previous?.focus?.();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && onClose) {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const nodes = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
    if (!nodes?.length) return;
    const firstNode = nodes[0];
    const lastNode = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === firstNode) {
      e.preventDefault();
      lastNode.focus();
    } else if (!e.shiftKey && document.activeElement === lastNode) {
      e.preventDefault();
      firstNode.focus();
    }
  };

  return (
    <div
      className={cx("scrim", center && "center")}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        ref={dialogRef}
        className={cx("modal", wide && "wide")}
        role={alert ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-label={labelledBy ? undefined : label}
        aria-labelledby={labelledBy}
        onKeyDown={onKeyDown}
      >
        {children}
      </div>
    </div>
  );
}
