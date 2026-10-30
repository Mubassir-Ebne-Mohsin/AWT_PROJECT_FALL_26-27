"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { clamp01, smooth, useLiveWhenVisible, usePointerTilt } from "@/components/landing/landing-hooks";

const CX = 340, CY = 300;
const polar = (r: number, deg: number) => [CX + r * Math.cos((deg * Math.PI) / 180), CY + r * Math.sin((deg * Math.PI) / 180)] as const;

/**
 * Rings are the "plates": scale `b + s * separation` about the centre, so the system opens like an orrery and closes
 * again. Anchors and label rows are where each tier's callout attaches (at full separation).
 */
const TIERS = [
  { name: "CLIENTS", detail: "Traffic starts here", color: "#7d95ff", index: "01", r: 235, b: 0.55, s: 0.45, spin: "70s", anchor: -60, labelY: 124 },
  { name: "ROUTING", detail: "Distribute requests", color: "#5fb0d9", index: "02", r: 176, b: 0.66, s: 0.34, spin: "52s", anchor: -30, labelY: 219 },
  { name: "COMPUTE", detail: "Process the work", color: "#36c384", index: "03", r: 118, b: 0.78, s: 0.22, spin: "44s", anchor: 10, labelY: 314 },
  { name: "DATA", detail: "Follow the dependency", color: "#efb03a", index: "04", r: 56, b: 0.9, s: 0.1, spin: "30s", anchor: 50, labelY: 409 },
];

const DIAL = Array.from({ length: 72 }, (_, i) => {
  const a = i * 5, long = a % 30 === 0;
  const [x1, y1] = polar(long ? 250 : 255, a), [x2, y2] = polar(262, a);
  return `M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`;
}).join("");

/** A fading radar wedge: 18 thin slices, brightest at the leading edge. */
const WEDGES = Array.from({ length: 18 }, (_, k) => {
  const [x1, y1] = polar(262, -90 + k * 2.5), [x2, y2] = polar(262, -90 + (k + 1) * 2.5);
  return { d: `M${CX} ${CY}L${x1.toFixed(1)} ${y1.toFixed(1)}A262 262 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}Z`, o: ((k + 1) / 18) * 0.17 };
});

const num = (value: number) => value as unknown as string; // custom properties take plain numbers

function Node({ x, y, a, at, tier, replica = false, children }: { x: number; y: number; a: number; at: number; tier: number; replica?: boolean; children: React.ReactNode }) {
  return (
    <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${a + 90})`} className={replica ? "sf-node sf-replica" : "sf-node"} style={{ "--at": num(at) } as CSSProperties}>
      <circle r="15" fill={`url(#sf-halo-${tier})`} className="sf-halo" />
      {children}
    </g>
  );
}

const PHASES = ["ASSEMBLE", "EXAMINE", "RETHINK"] as const;

/**
 * The story figure: a radial "pressure core". Requests spiral in from the clients ring, through routing and compute,
 * toward a shared database at the centre. Scroll drives the narrative: rings draw in, load builds, the core heats,
 * and extra app replicas appear while the core stays hot. Hold the core to stress it.
 *
 * Contract with the page: `--separation` is the exact scroll-driven target (smoothstep, hold, close) and `data-phase`
 * follows progress. Smoothing is visual only (`--shown`, `--delta` and the eased load/heat/scale-out values), so the
 * plate transforms stay deterministic and reversible.
 */
export function PressureCore() {
  const figure = useRef<HTMLElement>(null);
  const press = useRef(false);
  const retarget = useRef<() => void>(() => undefined);
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const active = hover ?? pinned;
  usePointerTilt(figure);
  useLiveWhenVisible(figure);

  useEffect(() => {
    const element = figure.current;
    const story = element?.closest<HTMLElement>("[data-architecture-story]");
    if (!element || !story) return;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    type V = { sep: number; build: number; load: number; heat: number; scale: number };
    const KEYS: Array<keyof V> = ["sep", "build", "load", "heat", "scale"];
    const STATIC: V = { sep: 1, build: 1, load: 0.7, heat: 0.75, scale: 1 };
    let progress = 0, target: V = { ...STATIC }, cur: V = { ...STATIC }, raf = 0, last = 0, frame = 0, first = true;
    const compute = (): V => {
      if (motion.matches) return { ...STATIC };
      const boost = press.current ? 1 : 0;
      return {
        sep: smooth(progress / 0.34) * (1 - smooth((progress - 0.73) / 0.27)),
        build: smooth(progress / 0.14),
        load: clamp01(smooth((progress - 0.1) / 0.42) + 0.45 * boost),
        heat: clamp01(smooth((progress - 0.28) / 0.42) + 0.5 * boost),
        scale: smooth((progress - 0.68) / 0.2),
      };
    };
    const paint = () => {
      const set = (name: string, value: number) => element.style.setProperty(name, value.toFixed(4));
      set("--shown", cur.sep);
      set("--delta", cur.sep - target.sep);
      set("--build", cur.build);
      set("--load", cur.load);
      set("--heat", cur.heat);
      set("--scale-out", cur.scale);
    };
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
      last = now;
      const k = 1 - Math.exp(-dt * 8);
      let moving = false;
      for (const key of KEYS) {
        cur[key] += (target[key] - cur[key]) * k;
        if (Math.abs(target[key] - cur[key]) < 0.0005) cur[key] = target[key];
        else moving = true;
      }
      paint();
      raf = moving ? requestAnimationFrame(tick) : 0;
    };
    const glide = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); } };
    const commit = () => { target = compute(); element.style.setProperty("--separation", target.sep.toFixed(4)); };
    const draw = () => {
      frame = 0;
      const bounds = story.getBoundingClientRect();
      const distance = Math.max(1, bounds.height - innerHeight);
      progress = clamp01((100 - bounds.top) / distance);
      element.dataset.phase = progress < 0.3 ? "assemble" : progress < 0.72 ? "inspect" : "rethink";
      commit();
      if (first || motion.matches) { cur = { ...target }; paint(); first = false; } else glide();
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(draw); };
    retarget.current = () => { commit(); if (motion.matches) { cur = { ...target }; paint(); } else glide(); };
    const release = () => { if (press.current) { press.current = false; retarget.current(); } };
    draw();
    window.addEventListener("scroll", schedule, { passive: true, capture: true });
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    motion.addEventListener("change", schedule);
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      motion.removeEventListener("change", schedule);
    };
  }, []);

  const info = active === null ? null : TIERS[active];
  const stopPress = () => { if (press.current) { press.current = false; retarget.current(); } };
  const hold = { onPointerDown: () => { press.current = true; retarget.current(); } };
  return (
    <figure
      ref={figure}
      className="sf-specimen sf-specimen--scroll sf-core"
      data-active={active ?? undefined}
      aria-label="Radial architecture illustration: client traffic flows inward through routing and compute to a shared database"
    >
      <div className="sf-stage">
        <div className="sf-float">
          <svg viewBox="0 0 680 600" role="img" aria-label="Requests spiral inward from clients through routing and compute toward a shared database core. As load builds the core heats up, and adding app replicas does not cool it.">
            <defs>
              {TIERS.map((t, i) => (
                <radialGradient id={`sf-halo-${i}`} key={t.name}><stop offset="0" stopColor={t.color} stopOpacity=".38" /><stop offset="1" stopColor={t.color} stopOpacity="0" /></radialGradient>
              ))}
              <radialGradient id="sf-core-grad"><stop offset="0" style={{ stopColor: "var(--heat-color)" }} stopOpacity=".95" /><stop offset=".62" style={{ stopColor: "var(--heat-color)" }} stopOpacity=".3" /><stop offset="1" style={{ stopColor: "var(--heat-color)" }} stopOpacity="0" /></radialGradient>
            </defs>

            <g className="sf-dial sf-spin" style={{ "--spin": "170s" } as CSSProperties}>
              <circle cx={CX} cy={CY} r="262" fill="none" stroke="#394a92" strokeOpacity=".55" />
              <path d={DIAL} stroke="#5c6fb5" strokeOpacity=".6" strokeWidth="1" />
            </g>
            <circle cx={CX} cy={CY} r="276" fill="none" stroke="#262f3c" strokeDasharray="2 7" />
            <path d={`M${CX - 270} ${CY}H${CX + 270}M${CX} ${CY - 270}V${CY + 270}`} stroke="#262f3c" strokeWidth="1" />

            <g className="sf-sweep sf-spin" style={{ "--spin": "14s" } as CSSProperties} aria-hidden="true">
              {WEDGES.map((w, k) => <path key={k} d={w.d} fill="#7d95ff" fillOpacity={w.o} />)}
              <path d={`M${CX} ${CY}L${polar(262, -45)[0].toFixed(1)} ${polar(262, -45)[1].toFixed(1)}`} stroke="#a9bcff" strokeOpacity=".5" strokeWidth="1" />
            </g>

            {Array.from({ length: 12 }, (_, k) => (
              <g key={k} transform={`rotate(${k * 30} ${CX} ${CY})`} className="sf-ray" style={{ "--need": num((k % 4) * 0.22) } as CSSProperties}>
                <path className="sf-spoke" d={`M${CX + 58} ${CY}H${CX + 262}`} />
                {[0, 1, 2].map((j) => <circle key={j} className="sf-pkt" cx={CX} cy={CY} r="2.6" style={{ "--j": num(j) } as CSSProperties} />)}
              </g>
            ))}

            <g className="sf-ripples" aria-hidden="true">
              {[0, 1, 2].map((j) => <circle key={j} className="sf-ripple" cx={CX} cy={CY} r="56" style={{ "--j": num(j) } as CSSProperties} />)}
            </g>

            {TIERS.map((t, i) => (
              <g
                key={t.name}
                className={`sf-plate sf-plate--${i}`}
                style={{ "--b": num(t.b), "--s": num(t.s), "--glow": t.color } as CSSProperties}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => { setHover(null); if (i === 3) stopPress(); }}
                onClick={() => setPinned((p) => (p === i ? null : i))}
                {...(i === 3 ? hold : {})}
              >
                <g className="sf-plate-glide">
                  <g className="sf-spin" style={{ "--spin": t.spin } as CSSProperties}>
                    <circle cx={CX} cy={CY} r={t.r} fill="none" stroke="transparent" strokeWidth="34" pointerEvents="stroke" />
                    <circle className="sf-ring" cx={CX} cy={CY} r={t.r} pathLength={100} fill="none" stroke={t.color} strokeOpacity=".62" />
                    <circle className={`sf-util sf-util--${i}`} cx={CX} cy={CY} r={t.r} pathLength={100} fill="none" stroke={t.color} transform={`rotate(-90 ${CX} ${CY})`} />
                    {i === 0 && Array.from({ length: 10 }, (_, n) => {
                      const a = n * 36 + 18, [x, y] = polar(t.r, a);
                      return <Node key={n} x={x} y={y} a={a} tier={0} at={0.72 + n * 0.02}><rect x="-8" y="-6" width="16" height="12" rx="3" fill="#19223f" stroke={t.color} strokeWidth="1.3" /><circle r="1.8" fill={t.color} /></Node>;
                    })}
                    {i === 1 && [45, 135, 225, 315].map((a, n) => {
                      const [x, y] = polar(t.r, a);
                      return <Node key={a} x={x} y={y} a={a} tier={1} at={0.5 + n * 0.04}><path d="M0-11 11 0 0 11-11 0Z" fill="#12283a" stroke={t.color} strokeWidth="1.4" /><circle r="2.2" fill={t.color} /></Node>;
                    })}
                    {i === 2 && [90, 210, 330, 30, 150, 270].map((a, n) => {
                      const [x, y] = polar(t.r, a), replica = n >= 3;
                      return (
                        <Node key={a} x={x} y={y} a={a} tier={2} replica={replica} at={0.28 + (n % 3) * 0.04}>
                          <g className={replica ? "sf-pop" : undefined}>
                            <rect x="-9" y="-13" width="18" height="26" rx="4" fill="#10281d" stroke={t.color} strokeWidth="1.4" />
                            <path d="M-5-6h10M-5-1h10M-5 4h10" stroke={t.color} strokeOpacity=".8" />
                            <circle className="sf-node-dot" cy="9" r="1.4" fill={t.color} />
                          </g>
                        </Node>
                      );
                    })}
                    {i === 3 && (
                      <g className="sf-node" style={{ "--at": num(0) } as CSSProperties}>
                        <circle className="sf-core-disc" cx={CX} cy={CY} r="52" fill="url(#sf-core-grad)" pointerEvents="all" />
                        <g className="sf-core-glyph" transform={`translate(${CX} ${CY})`} fill="none" stroke="var(--heat-color)" strokeWidth="1.6">
                          <ellipse cy="-9" rx="17" ry="6.5" fill="#1b1608" />
                          <path d="M-17-9v18c0 3.6 7.6 6.5 17 6.5s17-2.9 17-6.5V-9M-17 0c0 3.6 7.6 6.5 17 6.5S17 3.6 17 0" />
                        </g>
                      </g>
                    )}
                  </g>
                </g>
              </g>
            ))}

            <g className="sf-layer-annotation" aria-hidden="true">
              {TIERS.map((t) => {
                const [ax, ay] = polar(t.r, t.anchor);
                return (
                  <g key={t.name}>
                    <path d={`M${ax.toFixed(1)} ${ay.toFixed(1)}L${572} ${t.labelY - 4}H${586}`} stroke={t.color} strokeOpacity=".7" fill="none" />
                    <text x="596" y={t.labelY} fill={t.color}>{t.name}</text>
                    <text x="596" y={t.labelY + 17} fill="#b0b9c6" className="sf-layer-detail">{t.detail}</text>
                  </g>
                );
              })}
            </g>

            <g className="sf-hud" aria-hidden="true">
              <text x="24" y="36">FIG. 002 · THE PRESSURE CORE</text>
              {PHASES.map((p, n) => <text key={p} className={`sf-ph sf-ph--${n}`} x="24" y={510 + n * 20}>{`0${n + 1} ${p}`}</text>)}
              <g className="sf-bars">
                <text x="478" y="548">LOAD</text><rect className="sf-bar-track" x="526" y="544" width="110" height="4" /><rect className="sf-bar-fill sf-bar-fill--load" x="526" y="544" width="110" height="4" />
                <text x="478" y="566">HEAT</text><rect className="sf-bar-track" x="526" y="562" width="110" height="4" /><rect className="sf-bar-fill sf-bar-fill--heat" x="526" y="562" width="110" height="4" />
              </g>
            </g>
          </svg>
        </div>
      </div>
      <div className="sf-mobile-layer-key" aria-hidden="true"><span>01 Clients</span><span>02 Routing</span><span>03 Compute</span><span>04 Data</span></div>
      <div className="sf-layer-card" data-on={info ? "true" : "false"} style={info ? ({ "--glow": info.color } as CSSProperties) : undefined} aria-live="polite">
        {info ? (
          <><span className="sf-layer-index">{info.index}</span><strong>{info.name}</strong><span>{info.detail}</span></>
        ) : (
          <span className="sf-layer-hint"><span className="sf-hint-fine">Hover a ring · hold the core to stress it</span><span className="sf-hint-coarse">Tap a ring · press and hold the core</span></span>
        )}
      </div>
      <figcaption><span className="sf-status-dot" /> Architecture illustration <span>Not a live simulation</span></figcaption>
    </figure>
  );
}
