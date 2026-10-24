import type { Graph } from "@/lib/api/designs";
import type { Point } from "@/lib/canvas/geometry";
import { NODE_H, NODE_W, edgePath } from "@/lib/canvas/geometry";

import { ComponentGlyph } from "@/components/canvas/component-glyph";
export function GraphNodes({
  graph,
  selected,
  preview,
  onSelect,
  markerId,
  edgeSelected,
  onEdgeSelect,
  connecting,
}: {
  graph: Graph;
  selected: string;
  preview?: { id: string; position: Point };
  onSelect: (id: string) => void;
  markerId: string;
  edgeSelected?: string;
  onEdgeSelect: (id:string) => void;
  connecting: boolean;
}) {
  const positions = new Map(
    graph.nodes.map((n) => [
      n.id,
      preview?.id === n.id ? { ...n, ...preview.position } : n,
    ]),
  );
  return (
    <>
      {graph.edges.map((e) => {
        const a = positions.get(e.from),
          b = positions.get(e.to);
        return a && b ? (
          <g key={e.id} data-edge={e.id} role="button" tabIndex={0}
            aria-label={"Connection: " + a.label + " to " + b.label}
            aria-pressed={edgeSelected===e.id}
            onFocus={()=>onEdgeSelect(e.id)}
            onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();onEdgeSelect(e.id);}}}>
            <path className={"cv-edge"+(edgeSelected===e.id?" is-sel":"")} markerEnd={"url(#"+markerId+")"} d={edgePath(a,b)} fill="none"/>
            <path className="m6-edge-hit" d={edgePath(a,b)} fill="none" stroke="transparent" strokeWidth="16"/>
          </g>
        ) : null;
      })}
      {graph.nodes.map((n) => {
        const p = positions.get(n.id)!;
        return (
          <g
            key={n.id}
            data-node={n.id}
            role="button"
            tabIndex={0}
            aria-label={n.label + ", " + n.type}
            aria-pressed={selected === n.id}
            className={"cv-node" + (selected === n.id ? " is-sel" : "")}
            transform={`translate(${p.x} ${p.y})`}
            onFocus={() => onSelect(n.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(n.id);
              }
            }}
          >
            <title>{n.label}</title>
            <rect
              className="cv-node-body"
              width={NODE_W}
              height={NODE_H}
              rx="8"
            />
            <rect
              className="cv-node-icon"
              x="10"
              y="12"
              width="40"
              height="40"
              rx="6"
            />
            <g className="cv-glyph" transform="translate(19 21)">
              <ComponentGlyph type={n.type} size={22} />
            </g>
            <circle className="cv-port" data-output={n.id} cx={NODE_W} cy={NODE_H/2} r="6" aria-hidden="true" style={{opacity:connecting?1:undefined}} />
            <text className="cv-node-label" x="60" y="28">
              {n.label.length > 17 ? n.label.slice(0, 16) + "…" : n.label}
            </text>
            <text className="cv-node-sub" x="60" y="46">
              {n.type}
              {"replicas" in n.props
                ? " ×" + (n.props.replicas ?? 1)
                : ""} ·{" "}
              {n.type === "cdn"
                ? "edge"
                : "region" in n.props
                  ? (n.props.region ?? "us-east")
                  : "us-east"}
            </text>
          </g>
        );
      })}
    </>
  );
}
