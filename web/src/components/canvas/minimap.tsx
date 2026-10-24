import type { Graph } from "@/lib/api/designs";
import type { View, Size, Point } from "@/lib/canvas/geometry";
import { NODE_W, NODE_H } from "@/lib/canvas/geometry";
export function Minimap({
  graph,
  view,
  size,
  onCenter,
}: {
  graph: Graph;
  view: View;
  size: Size;
  onCenter: (p: Point) => void;
}) {
  if (!graph.nodes.length || !size.w) return null;
  const vp = {
    x: -view.x / view.k,
    y: -view.y / view.k,
    w: size.w / view.k,
    h: size.h / view.k,
  };
  const left = Math.min(vp.x, ...graph.nodes.map((n) => n.x)),
    top = Math.min(vp.y, ...graph.nodes.map((n) => n.y));
  const w =
      Math.max(vp.x + vp.w, ...graph.nodes.map((n) => n.x + NODE_W)) - left,
    h = Math.max(vp.y + vp.h, ...graph.nodes.map((n) => n.y + NODE_H)) - top;
  const scale = Math.min(160 / w, 98 / h),
    ox = 6 + (160 - w * scale) / 2,
    oy = 6 + (98 - h * scale) / 2;
  return (
    <button
      className="cv-mini m5-minimap"
      type="button"
      aria-label="Minimap: centre the view. Fit to screen is the keyboard alternative."
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        if (e.detail === 0) {
          onCenter({ x: left + w / 2, y: top + h / 2 });
          return;
        }
        onCenter({
          x: (e.clientX - r.left - ox) / scale + left,
          y: (e.clientY - r.top - oy) / scale + top,
        });
      }}
    >
      <svg viewBox="0 0 172 110" aria-hidden="true">
        {graph.nodes.map((n) => (
          <rect
            className="mn"
            key={n.id}
            x={ox + (n.x - left) * scale}
            y={oy + (n.y - top) * scale}
            width={Math.max(3, NODE_W * scale)}
            height={Math.max(2, NODE_H * scale)}
            rx="1.5"
          />
        ))}
        <rect
          className="vp"
          x={ox + (vp.x - left) * scale}
          y={oy + (vp.y - top) * scale}
          width={vp.w * scale}
          height={vp.h * scale}
        />
      </svg>
    </button>
  );
}
