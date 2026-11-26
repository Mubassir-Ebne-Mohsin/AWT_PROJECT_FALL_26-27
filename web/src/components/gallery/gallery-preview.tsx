"use client";
import { useId } from "react";
import { ComponentGlyph } from "@/components/canvas/component-glyph";
import { NODE_W, NODE_H, edgePath } from "@/lib/canvas/geometry";
import type { GalleryPreview as Preview } from "@/lib/api/gallery";

export const COMPONENT_NAMES: Record<Preview["nodes"][number]["type"], string> = {
  client: "Clients", cdn: "CDN", lb: "Load balancer", gateway: "API gateway", app: "App server",
  worker: "Worker", cache: "Cache", db: "Database", replica: "Read replica", queue: "Queue", storage: "Object storage", external: "External API",
};

export function GalleryPreview({ graph, title, context = "published" }: { graph?: Preview | null; title: string; context?: "published" | "saved" }) {
  const marker = "gallery-arrow-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  if (context === "saved" && graph && !graph.nodes.length) return <div className="gallery-preview-empty">Empty canvas<span>Add components to start this design.</span></div>;
  if (!graph?.nodes.length) return <div className="gallery-preview-empty">Diagram preview unavailable<span>{context === "saved" ? "Open the design to inspect its saved architecture." : "Open the published design to inspect its snapshot."}</span></div>;
  const nodes = new Map(graph.nodes.map(n => [n.id, n]));
  const left = Math.min(...graph.nodes.map(n => n.x)) - 100;
  const top = Math.min(...graph.nodes.map(n => n.y)) - 50;
  const width = Math.max(360, Math.max(...graph.nodes.map(n => n.x + NODE_W)) - left + 100);
  const height = Math.max(180, Math.max(...graph.nodes.map(n => n.y + NODE_H)) - top + 50);
  return <svg className="gallery-diagram" viewBox={`${left} ${top} ${width} ${height}`} role="img" aria-label={`${context === "saved" ? "Saved" : "Published"} architecture for ${title}: ${graph.nodes.length} components, ${graph.edges.length} connections`}>
    <defs><marker id={marker} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="var(--edge)" /></marker></defs>
    {graph.edges.map(e => {
      const a = nodes.get(e.from), b = nodes.get(e.to);
      return a && b ? <path key={e.id} d={edgePath(a, b)} fill="none" stroke="var(--edge)" strokeWidth="2" markerEnd={`url(#${marker})`} /> : null;
    })}
    {graph.nodes.map(n => <g key={n.id} transform={`translate(${n.x} ${n.y})`}>
      <title>{`${n.label} - ${COMPONENT_NAMES[n.type]}`}</title>
      <rect width={NODE_W} height={NODE_H} rx="8" fill="var(--surface)" stroke="var(--line-strong)" />
      <g transform="translate(12 23)" color="var(--accent)"><ComponentGlyph type={n.type} size={20} /></g>
      <text x="42" y="28" fill="var(--ink)" fontSize="13" fontWeight="600">{n.label.length > 17 ? n.label.slice(0, 16) + "…" : n.label}</text>
      <text x="42" y="46" fill="var(--ink-3)" fontSize="10">{COMPONENT_NAMES[n.type]}</text>
    </g>)}
  </svg>;
}
