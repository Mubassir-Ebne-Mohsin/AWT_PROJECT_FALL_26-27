"use client";
import type { Graph } from "@/lib/api/designs";
const W = 172, H = 76;
export function GraphView({ graph, selected, onSelect }: { graph: Graph; selected: string; onSelect: (id: string) => void }) {
  const left = Math.min(...(graph.nodes.length ? graph.nodes.map(n => n.x) : [0])) - 30, top = Math.min(...(graph.nodes.length ? graph.nodes.map(n => n.y) : [0])) - 30;
  const width = Math.max(500, Math.max(0, ...graph.nodes.map(n => n.x + W)) - left + 30), height = Math.max(250, Math.max(0, ...graph.nodes.map(n => n.y + H)) - top + 30);
  return <div className="m3-graph"><svg viewBox={`${left} ${top} ${width} ${height}`} role="img" aria-label="Architecture graph. Select a component in the list to edit replicas.">
    {graph.edges.map(e => { const a = graph.nodes.find(n => n.id === e.from)!, b = graph.nodes.find(n => n.id === e.to)!; return <path key={e.id} d={`M${a.x + W},${a.y + H/2} C${a.x+W+50},${a.y+H/2} ${b.x-50},${b.y+H/2} ${b.x},${b.y+H/2}`} fill="none" stroke="var(--ink-3)" strokeWidth="2" />; })}
    {graph.nodes.map(n => <g key={n.id} onClick={() => onSelect(n.id)} style={{ cursor: "pointer" }}>
      <rect x={n.x} y={n.y} width={W} height={H} rx="10" fill="var(--surface)" stroke={selected === n.id ? "var(--accent)" : "var(--line)"} strokeWidth="2" />
      <text x={n.x+14} y={n.y+29} fill="var(--ink)" fontSize="14">{n.label.slice(0,21)}</text>
      <text x={n.x+14} y={n.y+54} fill="var(--ink-3)" fontSize="11">{n.type}{"replicas" in n.props ? ` · ×${n.props.replicas ?? 1}` : ""}</text>
    </g>)}
  </svg></div>;
}
