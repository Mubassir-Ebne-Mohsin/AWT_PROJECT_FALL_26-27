"use client";

import { useEffect } from "react";

/**
 * Progressive enhancement for the public page. Nothing here is needed to read or use it: without JavaScript every
 * section is visible and every link works. Pointer effects run only for a fine pointer and never under reduced
 * motion. All writes are CSS variables or attributes, batched in animation frames, so scrolling stays native.
 */
export function LandingEffects() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".sf-landing");
    if (!root) return;
    const scroller = document.getElementById("main") ?? document.documentElement;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
    const undo: Array<() => void> = [];
    const on = <T extends EventTarget>(target: T, type: string, handler: EventListener, options?: AddEventListenerOptions) => {
      target.addEventListener(type, handler, options);
      undo.push(() => target.removeEventListener(type, handler, options));
    };

    // Reveals start hidden only once this script is running, so a no-JS visitor never sees an empty page.
    root.classList.add("sf-fx");
    undo.push(() => root.classList.remove("sf-fx"));
    const reveals = [...root.querySelectorAll<HTMLElement>("[data-reveal]")];
    if (reduce || typeof IntersectionObserver === "undefined") reveals.forEach((el) => el.classList.add("is-in"));
    else {
      const io = new IntersectionObserver(
        (entries) =>
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add("is-in");
            io.unobserve(entry.target);
          }),
        { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
      );
      reveals.forEach((el) => io.observe(el));
      undo.push(() => io.disconnect());
    }

    // Reading progress along the header hairline.
    let progressFrame = 0;
    const paintProgress = () => {
      progressFrame = 0;
      const max = scroller.scrollHeight - scroller.clientHeight;
      root.style.setProperty("--progress", (max > 0 ? Math.min(1, Math.max(0, scroller.scrollTop / max)) : 0).toFixed(4));
    };
    on(scroller, "scroll", () => { if (!progressFrame) progressFrame = requestAnimationFrame(paintProgress); }, { passive: true });
    paintProgress();
    undo.push(() => cancelAnimationFrame(progressFrame));

    // Which section is under the reading line, for the navigation and the story steps.
    if (typeof IntersectionObserver !== "undefined") {
      const links = [...root.querySelectorAll<HTMLAnchorElement>("[data-nav]")];
      const sections = links.map((link) => document.getElementById(link.dataset.nav ?? "")).filter((el): el is HTMLElement => !!el);
      const navIo = new IntersectionObserver(
        (entries) => entries.forEach((entry) => links.forEach((link) => { if (link.dataset.nav === (entry.target as HTMLElement).id) link.toggleAttribute("data-active", entry.isIntersecting); })),
        { rootMargin: "-45% 0px -45% 0px" },
      );
      sections.forEach((el) => navIo.observe(el));
      const stepIo = new IntersectionObserver(
        (entries) => entries.forEach((entry) => entry.target.classList.toggle("is-active", entry.isIntersecting)),
        { rootMargin: "-38% 0px -38% 0px" },
      );
      root.querySelectorAll<HTMLElement>(".sf-story-step").forEach((el) => stepIo.observe(el));
      undo.push(() => { navIo.disconnect(); stepIo.disconnect(); });
    }

    if (fine && !reduce) {
      // A drafting-table lamp: the grid brightens around the cursor. One small element moved by transform.
      const spotlight = root.querySelector<HTMLElement>(".sf-spotlight");
      const radius = 300;
      let x = -999, y = -999, frame = 0;
      const place = () => {
        frame = 0;
        if (!spotlight) return;
        spotlight.style.transform = `translate3d(${x - radius}px, ${y - radius}px, 0)`;
        spotlight.style.backgroundPosition = `${radius - x}px ${radius - y}px`;
      };
      on(root, "pointermove", ((event: PointerEvent) => {
        x = event.clientX;
        y = event.clientY;
        root.dataset.pointer = "true";
        if (!frame) frame = requestAnimationFrame(place);
        const card = (event.target as HTMLElement | null)?.closest<HTMLElement>(".sf-spot");
        if (card) {
          const box = card.getBoundingClientRect();
          card.style.setProperty("--sx", `${event.clientX - box.left}px`);
          card.style.setProperty("--sy", `${event.clientY - box.top}px`);
        }
      }) as EventListener, { passive: true });
      on(root, "pointerleave", () => { root.dataset.pointer = "false"; });
      undo.push(() => cancelAnimationFrame(frame));

      // Buttons lean a few pixels toward the pointer.
      root.querySelectorAll<HTMLElement>(".sf-magnetic").forEach((button) => {
        on(button, "pointermove", ((event: PointerEvent) => {
          const box = button.getBoundingClientRect();
          button.style.setProperty("--bx", `${(((event.clientX - box.left) / box.width - 0.5) * 10).toFixed(2)}px`);
          button.style.setProperty("--by", `${(((event.clientY - box.top) / box.height - 0.5) * 8).toFixed(2)}px`);
        }) as EventListener);
        on(button, "pointerleave", () => { button.style.removeProperty("--bx"); button.style.removeProperty("--by"); });
      });

      // Plotter crosshair with live coordinates over the hero figure.
      const hero = root.querySelector<HTMLElement>(".sf-hero-object");
      const readout = hero?.querySelector<HTMLElement>("[data-readout]");
      if (hero) {
        const pad = (n: number) => String(Math.max(0, Math.round(n))).padStart(4, "0");
        on(hero, "pointermove", ((event: PointerEvent) => {
          const box = hero.getBoundingClientRect();
          const px = event.clientX - box.left, py = event.clientY - box.top;
          hero.style.setProperty("--cx", `${px}px`);
          hero.style.setProperty("--cy", `${py}px`);
          if (readout) readout.textContent = `X ${pad(px)} · Y ${pad(py)}`;
          hero.dataset.hover = "true";
        }) as EventListener, { passive: true });
        on(hero, "pointerleave", () => { hero.dataset.hover = "false"; });
      }
    }

    return () => undo.forEach((fn) => fn());
  }, []);
  return null;
}
