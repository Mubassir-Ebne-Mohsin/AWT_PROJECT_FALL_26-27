"use client";

import { useEffect, type RefObject } from "react";

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
/** Smoothstep has no velocity discontinuities. */
export const smooth = (x: number) => { const t = clamp01(x); return t * t * (3 - 2 * t); };

/** The figure leans toward the cursor with a damped glide. Fine pointers only, never under reduced motion. */
export function usePointerTilt(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (!matchMedia("(hover: hover) and (pointer: fine)").matches || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0, last = 0;
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
      last = now;
      const k = 1 - Math.exp(-dt * 7);
      cx += (tx - cx) * k;
      cy += (ty - cy) * k;
      element.style.setProperty("--tilt-x", `${cx.toFixed(3)}deg`);
      element.style.setProperty("--tilt-y", `${cy.toFixed(3)}deg`);
      raf = Math.abs(tx - cx) < 0.01 && Math.abs(ty - cy) < 0.01 ? 0 : requestAnimationFrame(step);
    };
    const kick = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(step); } };
    const move = (event: PointerEvent) => {
      const box = element.getBoundingClientRect();
      ty = ((event.clientX - box.left) / box.width - 0.5) * 2 * 7;
      tx = -((event.clientY - box.top) / box.height - 0.5) * 2 * 5;
      kick();
    };
    const leave = () => { tx = 0; ty = 0; kick(); };
    element.addEventListener("pointermove", move, { passive: true });
    element.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(raf);
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerleave", leave);
    };
  }, [ref]);
}

/** Infinite glow and motion only run while the figure is on screen (CSS reads data-live). */
export function useLiveWhenVisible(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => { element.dataset.live = entry?.isIntersecting ? "true" : "false"; });
    io.observe(element);
    return () => io.disconnect();
  }, [ref]);
}
