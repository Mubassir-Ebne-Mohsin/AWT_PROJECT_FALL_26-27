import { Icon } from "@/components/ui/icon";

// Static stand-in for the prototype's engine-drawn example diagram (the engine arrives in phase 2).
const NODES = [
  { x: 6, y: 78, label: "CDN", s: "ok" },
  { x: 118, y: 78, label: "Load balancer", s: "ok" },
  { x: 230, y: 30, label: "App ×3", s: "warn" },
  { x: 230, y: 126, label: "Cache", s: "ok" },
  { x: 342, y: 78, label: "Postgres", s: "fail" },
] as const;
const EDGES: Array<[number, number]> = [
  [0, 1],
  [1, 2],
  [1, 3],
  [2, 4],
  [3, 4],
];

export function AuthSide() {
  return (
    <div className="auth-side paper">
      <div className="stack" style={{ gap: 8 }}>
        <span className="eyebrow">What you will do here</span>
        <h2 className="display" style={{ fontSize: 30, maxWidth: "18ch" }}>
          Find where your design breaks before your users do.
        </h2>
      </div>
      <div className="panel" style={{ padding: 14, background: "var(--surface)" }}>
        <svg viewBox="0 0 440 200" width="100%" height="200" role="img" aria-label="Example architecture: the database is the first component to fail">
          {EDGES.map(([a, b]) => {
            const p = NODES[a];
            const q = NODES[b];
            const x1 = p.x + 92;
            const y1 = p.y + 22;
            const x2 = q.x;
            const y2 = q.y + 22;
            const dx = Math.max(24, (x2 - x1) / 2);
            return <path key={`${a}-${b}`} d={`M${x1} ${y1} C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`} fill="none" stroke="var(--edge)" strokeWidth="1.5" />;
          })}
          {NODES.map((n) => (
            <g key={n.label} transform={`translate(${n.x} ${n.y})`}>
              <rect width="92" height="44" rx="8" fill="var(--surface)" stroke={`var(--${n.s})`} strokeWidth="1.6" />
              <rect width="92" height="44" rx="8" fill={`var(--${n.s}-soft)`} opacity="0.7" />
              <text x="46" y="26" textAnchor="middle" fontSize="11.5" fontWeight="600" fill="var(--ink)" fontFamily="var(--font-body)">
                {n.label}
              </text>
            </g>
          ))}
        </svg>
        <div className="row between small" style={{ marginTop: 8 }}>
          <span className="muted">Illustration: an example at 2.6k rps, ×2 bursts</span>
          <span className="pill fail">
            <span className="dot" />
            Breaks
          </span>
        </div>
      </div>
      <ul className="ph-list">
        <li>
          <Icon n="pencil" s={14} />
          <span>Draw the system: load balancer, app servers, cache, database, queue.</span>
        </li>
        <li>
          <Icon n="gauge" s={14} />
          <span>Ramp the traffic and see the first component to fail.</span>
        </li>
        <li>
          <Icon n="sparkle" s={14} />
          <span>Get fixes chosen by the real bottleneck, and learn why they work.</span>
        </li>
      </ul>
    </div>
  );
}
