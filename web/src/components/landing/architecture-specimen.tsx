"use client";

import { useEffect, useRef, useState } from "react";
import { useLiveWhenVisible, usePointerTilt } from "@/components/landing/landing-hooks";

const LAYERS = [
  { name: "CLIENTS", detail: "Traffic starts here", color: "#7d95ff", y: 195, index: "01", icon: "#19223f" },
  { name: "ROUTING", detail: "Distribute requests", color: "#5fb0d9", y: 250, index: "02", icon: "#12283a" },
  { name: "COMPUTE", detail: "Process the work", color: "#36c384", y: 305, index: "03", icon: "#10281d" },
  { name: "DATA", detail: "Follow the dependency", color: "#efb03a", y: 360, index: "04", icon: "#2b220f" },
];

/**
 * The hero figure: four isometric layers. The stack opens under the pointer, tilts toward it and glides; layers can be
 * hovered, focused or tapped to inspect them. (The story section has its own, different figure: PressureCore.)
 *
 * `--separation` is the exact target. The glide is visual only: `--shown` is the eased value and `--delta` (shown minus
 * target) offsets each plate's inner group, decaying to exactly zero, so nothing drifts and motion never steps.
 */
export function ArchitectureSpecimen() {
  const figure = useRef<HTMLElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const active = hover ?? pinned;
  usePointerTilt(figure);
  useLiveWhenVisible(figure);

  useEffect(() => {
    const element = figure.current;
    if (!element) return;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const fine = matchMedia("(hover: hover) and (pointer: fine)");
    const REST = 0.13, OPEN = 0.62;
    let current = REST, target = REST, raf = 0, last = 0;
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
    const enter = () => { if (fine.matches && !motion.matches) { commit(OPEN); glide(); } };
    const leave = () => { commit(REST); glide(); };
    commit(REST);
    apply();
    element.addEventListener("pointerenter", enter);
    element.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(raf);
      element.removeEventListener("pointerenter", enter);
      element.removeEventListener("pointerleave", leave);
    };
  }, []);

  const info = active === null ? null : LAYERS[active];
  return (
    <figure
      ref={figure}
      className="sf-specimen sf-specimen--hero"
      data-active={active ?? undefined}
      aria-label="Exploded architecture illustration: clients, routing, compute and data"
    >
      <div className="sf-stage">
        <div className="sf-float">
          <svg viewBox="0 0 680 600" role="img" aria-label="Four connected architecture layers. The database remains a shared dependency when app servers scale.">
            <defs>
              <pattern id="sf-hero-grid" width="40" height="23" patternUnits="userSpaceOnUse" patternTransform="matrix(1 .5 -1 .5 310 380)">
                <path d="M40 0H0V23" fill="none" stroke="#7d95ff" strokeOpacity=".16" strokeWidth=".7" />
              </pattern>
            </defs>
            <path d="M15 395 320 240 650 405 345 565Z" fill="url(#sf-hero-grid)" />
            <path d="M92 405 320 291 548 405 320 519Z" fill="none" stroke="#2f3b66" strokeDasharray="3 8" />
            <g className="sf-specimen-spine" stroke="#4a5c9e" strokeWidth="1" strokeDasharray="3 6"><path d="M320 104V480" /><path d="M112 228V410M528 228V410" /></g>
            {[...LAYERS].reverse().map((layer, reverseIndex) => {
              const index = 3 - reverseIndex;
              return (
                <g
                  key={layer.name}
                  className={`sf-plate sf-plate--${index}`}
                  style={{ "--layer-shift": `${(index - 1.5) * 65}px`, "--layer-x": `${index % 2 ? 12 : -12}px`, "--glow": layer.color } as React.CSSProperties}
                  tabIndex={0}
                  role="button"
                  aria-pressed={pinned === index}
                  aria-label={`${layer.name}: ${layer.detail}`}
                  onPointerEnter={() => setHover(index)}
                  onPointerLeave={() => setHover(null)}
                  onFocus={() => setHover(index)}
                  onBlur={() => setHover(null)}
                  onClick={() => setPinned((p) => (p === index ? null : index))}
                  onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setPinned((p) => (p === index ? null : index)); } }}
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
                  </g>
                </g>
              );
            })}
            <g className="sf-object-origin"><circle cx="320" cy="519" r="3" fill="#7d95ff" /><path d="M320 527v18" stroke="#4a5c9e" /><text x="320" y="566" textAnchor="middle" fill="#8691a0">SYSTEM / 001</text></g>
          </svg>
        </div>
      </div>
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
