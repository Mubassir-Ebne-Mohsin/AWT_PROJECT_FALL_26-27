import { useId } from "react";
import type { Graph } from "@/lib/api/designs";
import type { Summary } from "@/lib/result-presentation";
import { GraphNodes } from "@/components/canvas/graph-nodes";
import { NODE_H, NODE_W } from "@/lib/canvas/geometry";
import { LOAD_LEGEND, loadOverlay } from "@/lib/load-overlay";

/**
 * Read-only "Topology under load" (prototype ResultsTab). Drawn from the selected run's SAVED snapshot graph and
 * its stored metrics, even if the current draft has since changed. Selection reveals the recorded metrics.
 */
export function RecordedTopology({
  graph,
  summary,
  selected,
  onSelect,
}: {
  graph: Graph;
  summary: Summary;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const markerId = useId().replace(/:/g, "") + "-rt-arrow";
  const overlay = loadOverlay(graph, summary);
  if (!graph.nodes.length) return <p className="hint">The recorded snapshot has no components.</p>;
  const xs = graph.nodes.map((n) => n.x),
    ys = graph.nodes.map((n) => n.y);
  const pad = 40,
    minX = Math.min(...xs) - pad,
    minY = Math.min(...ys) - pad - 30;
  const w = Math.max(...xs) + NODE_W + pad - minX,
    h = Math.max(...ys) + NODE_H + pad - minY;
  return (
    <div className="stack">
      <div className="paper m8-topology" style={{ position: "relative", height: 300, borderRadius: 8, overflow: "hidden" }}>
        <svg
          width="100%"
          height="100%"
          viewBox={`${minX} ${minY} ${w} ${h}`}
          preserveAspectRatio="xMidYMid meet"
          role="group"
          aria-label="Recorded topology under load: components are selectable"
        >
          <defs>
            <marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" fill="var(--edge)" />
            </marker>
          </defs>
          <GraphNodes
            graph={graph}
            selected={selected}
            onSelect={onSelect}
            markerId={markerId}
            onEdgeSelect={() => undefined}
            connecting={false}
            overlay={overlay}
          />
        </svg>
        <div className="cv-legend" aria-label="Load legend">
          {LOAD_LEGEND.map((l) => (
            <span key={l.status}>
              <span className={"sdot " + l.status} aria-hidden="true"></span>
              {l.text}
            </span>
          ))}
        </div>
      </div>
      <p className="hint">
        Saved snapshot of this run. Edge widths show modeled request flow, not observed packets. Select a component to
        inspect its recorded metrics.
      </p>
    </div>
  );
}
