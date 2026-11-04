import type { Graph } from "@/lib/api/designs";
import type { Point } from "@/lib/canvas/geometry";
import { NODE_H, NODE_W, edgePath } from "@/lib/canvas/geometry";

import { ComponentGlyph } from "@/components/canvas/component-glyph";
import type { LoadOverlay } from "@/lib/load-overlay";
import { markerLabel } from "@/lib/notes-presentation";
export function GraphNodes({
  graph,
  selected,
  preview,
  onSelect,
  markerId,
  edgeSelected,
  onEdgeSelect,
  connecting,
  overlay,
  noteCounts,
  onOpenNotes,
}: {
  graph: Graph;
  selected: string;
  preview?: { id: string; position: Point };
  onSelect: (id: string) => void;
  markerId: string;
  edgeSelected?: string;
  onEdgeSelect: (id:string) => void;
  connecting: boolean;
  /** M8 load overlay; present only for output computed from exactly these inputs. */
  overlay?: LoadOverlay | null;
  /** How many notes are pinned to each component; a component with none shows no marker. */
  noteCounts?: ReadonlyMap<string, number>;
  /** Opens the notes of a component (selects it and moves to its notes). */
  onOpenNotes?: (id: string) => void;
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
            aria-label={"Connection: " + a.label + " to " + b.label + (overlay?.edges.has(e.id) ? ", modeled flow " + overlay.edges.get(e.id)!.label : "")}
            aria-pressed={edgeSelected===e.id}
            onFocus={()=>onEdgeSelect(e.id)}
            onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();onEdgeSelect(e.id);}}}>
            <path className={"cv-edge"+(edgeSelected===e.id?" is-sel":"")+(overlay?.edges.has(e.id)?" flow":"")} markerEnd={"url(#"+markerId+")"} d={edgePath(a,b)} fill="none" style={overlay?.edges.has(e.id)?{strokeWidth:overlay.edges.get(e.id)!.width}:undefined}/>
            <path className="m6-edge-hit" d={edgePath(a,b)} fill="none" stroke="transparent" strokeWidth="16"/>
          </g>
        ) : null;
      })}
      {graph.nodes.map((n) => {
        const p = positions.get(n.id)!;
        const load = overlay?.nodes.get(n.id);
        const isBottleneck = overlay?.bottleneckId === n.id;
        return (
          <g
            key={n.id}
            data-node={n.id}
            role="button"
            tabIndex={0}
            aria-label={n.label + ", " + n.type + (load && n.type !== "client" ? ", modeled utilization " + load.utilization + (load.status === "fail" ? ", failing" : load.status === "warn" ? ", strained" : ", healthy") : "")}
            aria-pressed={selected === n.id}
            className={"cv-node" + (selected === n.id ? " is-sel" : "") + (load ? " overlay s-" + load.status : "")}
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
            {isBottleneck && <rect className="cv-bneck" x="-7" y="-7" width={NODE_W + 14} height={NODE_H + 14} rx="12" />}
            {isBottleneck && <g className="cv-bneck-tag" transform="translate(0 -30)"><rect width="86" height="17" rx="4" /><text x="7" y="12">BOTTLENECK</text></g>}
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
            {load && n.type !== "client" ? (
              <>
                <text className="cv-node-sub" x="60" y="46">
                  <tspan className={"cv-pct s-" + load.status}>{load.utilization}</tspan> · {load.peak}{load.background ? " · background" : ""}
                </text>
                <rect className="cv-meter-bg" x="60" y="53" width="112" height="3" rx="1.5" />
                <rect className={"cv-meter s-" + load.status} x="60" y="53" width={112 * load.meter} height="3" rx="1.5" />
              </>
            ) : (
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
            )}
          </g>
        );
      })}
      {noteCounts &&
        graph.nodes.map((n) => {
          const count = noteCounts.get(n.id) ?? 0;
          const p = positions.get(n.id)!;
          if (!count) return null;
          // A separate button beside the component (not inside it), so the component stays one control and a drag on the marker never moves it.
          return (
            <g
              key={"notes-" + n.id}
              className="cv-notes-marker"
              data-notes-marker={n.id}
              role="button"
              tabIndex={0}
              aria-label={markerLabel(count, n.label)}
              transform={`translate(${p.x + NODE_W - 4} ${p.y - 6})`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onOpenNotes?.(n.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onOpenNotes?.(n.id);
                }
              }}
            >
              <title>{markerLabel(count, n.label)}</title>
              <rect className="cv-notes-marker-body" x="-12" y="-11" width={count > 9 ? 28 : 24} height="22" rx="11" />
              <text className="cv-notes-marker-count" x={count > 9 ? 2 : 0} y="4.5" textAnchor="middle">
                {count > 99 ? "99+" : count}
              </text>
            </g>
          );
        })}
      {overlay && overlay.edges.size > 0 && (
        <g className="cv-flow-labels" aria-hidden="true" pointerEvents="none">
          {graph.edges.map((e) => {
            const a = positions.get(e.from), b = positions.get(e.to), flow = overlay.edges.get(e.id);
            if (!a || !b || !flow) return null;
            const ax = a.x + NODE_W, ay = a.y + NODE_H / 2, bx = b.x, by = b.y + NODE_H / 2;
            return <text key={e.id} className="cv-edge-label" x={(ax + bx) / 2} y={(ay + by) / 2 - 8} textAnchor="middle">{flow.label}</text>;
          })}
        </g>
      )}
    </>
  );
}
