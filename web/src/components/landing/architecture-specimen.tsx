"use client";

import { useEffect, useRef, useState } from "react";

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
/** Smoothstep has no velocity discontinuities. */
const smooth = (x: number) => { const t = clamp01(x); return t * t * (3 - 2 * t); };

const LAYERS = [
  { name: "CLIENTS", detail: "Traffic starts here", color: "#7d95ff", y: 195, index: "01", icon: "#19223f" },
  { name: "ROUTING", detail: "Distribute requests", color: "#5fb0d9", y: 250, index: "02", icon: "#12283a" },
  { name: "COMPUTE", detail: "Process the work", color: "#36c384", y: 305, index: "03", icon: "#10281d" },
  { name: "DATA", detail: "Follow the dependency", color: "#efb03a", y: 360, index: "04", icon: "#2b220f" },
];

/**
 * The exploded architecture figure.
 *
 * Scroll mapping stays deterministic (the target comes from the scroll position, never from accumulated deltas),
 * and a short critically-damped glide eases the drawn value toward it, so fast or reversed scrolling cannot drift
 * and motion never steps. The hero version separates when the pointer is over it. Layers are interactive: hover,
 * focus or tap one to inspect it.
 */
export function ArchitectureSpecimen({ animated = false }: { animated?: boolean }) {
  const figure = useRef<HTMLElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const active = hover ?? pinned;

  // Separation: scroll-driven in the story, pointer-driven in the hero. Both glide.
  useEffect(() => {
    const element = figure.current;
    if (!element) return;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const fine = matchMedia("(hover: hover) and (pointer: fine)");
    const story = animated ? element.closest<HTMLElement>("[data-architecture-story]") : null;
    if (animated && !story) return;
    const REST = 0.13, OPEN = 0.62;
    // `--separation` is always the exact, deterministic target. The glide is visual only: `--shown` is the eased
    // value and `--delta` (shown minus target) offsets each plate's inner group, decaying to exactly zero.
    let current = animated ? 0 : REST, target = current, raf = 0, last = 0, frame = 0;
    const apply = () => {
      element.style.setProperty("--shown", current.toFixed(4));
      element.style.setProperty("--delta", (current - target).toFixed(4));
    };
    const commit = (value: number) => { target = value; element.style.setProperty("--separation", value.toFixed(4)); };
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
      last = now;
      current += (target - current) * (1 - Math.exp(-dt * 9));
      if (Math.abs(target - current) < 0.0005) { current = target; apply(); raf = 0; return; }
      apply();
      raf = requestAnimationFrame(tick);
    };
    const glide = () => { apply(); if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); } };
    let first = true;
    const draw = () => {
      frame = 0;
      if (!story) return;
      const bounds = story.getBoundingClientRect();
      const distance = Math.max(1, bounds.height - innerHeight);
      const progress = clamp01((100 - bounds.top) / distance);
      commit(motion.matches ? 1 : smooth(progress / 0.34) * (1 - smooth((progress - 0.73) / 0.27)));
      element.dataset.phase = progress < 0.3 ? "assemble" : progress < 0.72 ? "inspect" : "rethink";
      if (first || motion.matches) { current = target; apply(); first = false; } else glide();
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(draw); };
    const enter = () => { if (fine.matches && !motion.matches) { commit(OPEN); glide(); } };
    const leave = () => { commit(REST); glide(); };
    if (animated) {
      draw();
      window.addEventListener("scroll", schedule, { passive: true, capture: true });
      window.addEventListener("resize", schedule, { passive: true });
      motion.addEventListener("change", schedule);
    } else {
      commit(REST);
      apply();
      element.addEventListener("pointerenter", enter);
      element.addEventListener("pointerleave", leave);
    }
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      motion.removeEventListener("change", schedule);
      element.removeEventListener("pointerenter", enter);
      element.removeEventListener("pointerleave", leave);
    };
  }, [animated]);

  // Pointer tilt: the whole figure leans toward the cursor with a damped glide. Fine pointers only.
  useEffect(() => {
    const element = figure.current;
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
  }, []);

  // Infinite glow and traffic only run while the figure is on screen.
  useEffect(() => {
    const element = figure.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => { element.dataset.live = entry?.isIntersecting ? "true" : "false"; });
    io.observe(element);
    return () => io.disconnect();
  }, []);

  const gridId = animated ? "sf-story-grid" : "sf-hero-grid";
  const info = active === null ? null : LAYERS[active];
  return (
    <figure
      ref={figure}
      className={`sf-specimen ${animated ? "sf-specimen--scroll" : "sf-specimen--hero"}`}
      data-active={active ?? undefined}
      aria-label="Exploded architecture illustration: clients, routing, compute and data"
    >
      <div className="sf-stage">
        <div className="sf-float">
          <svg viewBox="0 0 680 600" role="img" aria-label="Four connected architecture layers. The database remains a shared dependency when app servers scale.">
            <defs>
              <pattern id={gridId} width="40" height="23" patternUnits="userSpaceOnUse" patternTransform="matrix(1 .5 -1 .5 310 380)">
                <path d="M40 0H0V23" fill="none" stroke="#7d95ff" strokeOpacity=".16" strokeWidth=".7" />
              </pattern>
            </defs>
            <path d="M15 395 320 240 650 405 345 565Z" fill={`url(#${gridId})`} />
            <path d="M92 405 320 291 548 405 320 519Z" fill="none" stroke="#2f3b66" strokeDasharray="3 8" />
            <g className="sf-specimen-spine" stroke="#4a5c9e" strokeWidth="1" strokeDasharray="3 6"><path d="M320 104V480" /><path d="M112 228V410M528 228V410" /></g>
            {[...LAYERS].reverse().map((layer, reverseIndex) => {
              const index = 3 - reverseIndex;
              const focusProps = animated
                ? {}
                : {
                    tabIndex: 0,
                    role: "button" as const,
                    "aria-pressed": pinned === index,
                    "aria-label": `${layer.name}: ${layer.detail}`,
                    onFocus: () => setHover(index),
                    onBlur: () => setHover(null),
                    onKeyDown: (event: React.KeyboardEvent) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setPinned((p) => (p === index ? null : index)); } },
                  };
              return (
                <g
                  key={layer.name}
                  className={`sf-plate sf-plate--${index}`}
                  style={{ "--layer-shift": `${(index - 1.5) * 65}px`, "--layer-x": `${index % 2 ? 12 : -12}px`, "--glow": layer.color } as React.CSSProperties}
                  onPointerEnter={() => setHover(index)}
                  onPointerLeave={() => setHover(null)}
                  onClick={() => setPinned((p) => (p === index ? null : index))}
                  {...focusProps}
                >
                  <g className="sf-plate-glide">
                  <path className="sf-plate-top" d={`M112 ${layer.y} 320 ${layer.y - 104} 528 ${layer.y} 320 ${layer.y + 104}Z`} fill={index === 3 ? "#161d2b" : "#121926"} stroke={layer.color} strokeOpacity=".72" />
                  <path d={`M112 ${layer.y}v16l208 104v-16Z`} fill="#0a0e15" stroke={layer.color} strokeOpacity=".3" />
                  <path d={`M320 ${layer.y + 104} 528 ${layer.y}v16L320 ${layer.y + 120}Z`} fill="#0d121b" stroke={layer.color} strokeOpacity=".4" />
                  <path d={`M131 ${layer.y} 320 ${layer.y - 94} 509 ${layer.y} 320 ${layer.y + 94}Z`} fill="none" stroke={layer.color} strokeOpacity=".14" />
                  <g transform={`translate(320 ${layer.y}) matrix(1 .5 -1 .5 0 0)`} stroke={layer.color} strokeWidth="1.5" fill="none">
                    <path d="M-130 0H130M0-65V65M-75-35V35M75-35V35" strokeOpacity=".28" />
                    <path className="sf-traffic-glow" d="M-130 0H130" stroke={layer.color} aria-hidden="true" />
                    <path className="sf-traffic-trace" d="M-130 0H130" stroke={layer.color} aria-hidden="true" />
                    {index === 0 && [-85, 0, 85].map((x) => <g key={x} transform={`translate(${x} 0)`}><rect x="-22" y="-25" width="44" height="34" rx="3" fill={layer.icon} /><path d="M0 9v13m-15 0h30M-15-16h30" /><circle className="sf-node-dot" cy="-7" r="3" fill={layer.color} /></g>)}
                    {index === 1 && <><path d="M-100 0h200M0-55V55M-85-35 0 0l85-35M-85 35 0 0l85 35" /><rect x="-28" y="-22" width="56" height="44" rx="5" fill={layer.icon} /><path d="m-14-5 14-9 14 9m-28 10 14 9 14-9" /></>}
                    {index === 2 && [-85, 0, 85].map((x) => <g key={x} transform={`translate(${x} 0)`}><rect x="-24" y="-35" width="48" height="70" rx="4" fill={layer.icon} /><path d="M-14-20h28M-14-7h28M-14 6h28" /><circle className="sf-node-dot" cx="-12" cy="22" r="2" fill={layer.color} /><circle className="sf-node-dot" cy="22" r="2" fill={layer.color} /></g>)}
                    {index === 3 && <><ellipse cy="-25" rx="58" ry="23" fill={layer.icon} /><path d="M-58-25v48c0 30 116 30 116 0v-48M-58-5c0 30 116 30 116 0M-58 13c0 30 116 30 116 0" /><ellipse cy="-25" rx="58" ry="23" /><path d="M-115 0h55m120 0h55" /></>}
                  </g>
                  <text x="308" y={layer.y + 115} textAnchor="end" className="sf-plate-number" fill={layer.color}>{layer.index} / {layer.name}</text>
                  {animated && <g className="sf-layer-annotation"><path d={`M528 ${layer.y + 6}h23`} stroke={layer.color} /><text x="563" y={layer.y + 10} fill={layer.color}>{layer.name}</text><text x="563" y={layer.y + 27} fill="#b0b9c6" className="sf-layer-detail">{layer.detail}</text></g>}
                  </g>
                </g>
              );
            })}
            <g className="sf-object-origin"><circle cx="320" cy="519" r="3" fill="#7d95ff" /><path d="M320 527v18" stroke="#4a5c9e" /><text x="320" y="566" textAnchor="middle" fill="#8691a0">SYSTEM / 001</text></g>
          </svg>
        </div>
      </div>
      {animated && <div className="sf-mobile-layer-key" aria-hidden="true"><span>01 Clients</span><span>02 Routing</span><span>03 Compute</span><span>04 Data</span></div>}
      <div className="sf-layer-card" data-on={info ? "true" : "false"} style={info ? ({ "--glow": info.color } as React.CSSProperties) : undefined} aria-live="polite">
        {info ? (
          <><span className="sf-layer-index">{info.index}</span><strong>{info.name}</strong><span>{info.detail}</span></>
        ) : (
          <span className="sf-layer-hint"><span className="sf-hint-fine">Hover a layer to inspect it</span><span className="sf-hint-coarse">Tap a layer to inspect it</span></span>
        )}
      </div>
      <figcaption><span className="sf-status-dot" /> Architecture illustration <span>Not a live simulation</span></figcaption>
    </figure>
  );
}
