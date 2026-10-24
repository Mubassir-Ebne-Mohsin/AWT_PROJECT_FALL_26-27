"use client";
import {
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  Ref,
  PointerEvent,
} from "react";
import type { Graph } from "@/lib/api/designs";
import {
  fit,
  world,
  zoomAt,
  snap,
  GRID,
  NODE_H,
  NODE_W,
  Point,
  Size,
  View,
} from "@/lib/canvas/geometry";
import { moveComponent } from "@/lib/canvas/model";
import { GraphNodes } from "@/components/canvas/graph-nodes";
import { Minimap } from "@/components/canvas/minimap";
import { Icon } from "@/components/ui/icon";
import type { EditorSession } from "@/lib/editor-session";
export type CanvasApi = {
  center: () => Point;
  locate: (p: Point) => Point;
  inside: (p: Point) => boolean;
};
type Drag =
  | {
      kind: "node";
      id: string;
      start: Point;
      offset: Point;
      position: Point;
      moved: boolean;
      pointer: number;
    }
  | { kind: "pan"; start: Point; view: View; pointer: number };
export function GraphCanvas({
  graph,
  session,
  selected,
  onSelect,
  apiRef,
}: {
  graph: Graph;
  session: EditorSession;
  selected: string;
  onSelect: (id: string) => void;
  apiRef: Ref<CanvasApi>;
}) {
  const box = useRef<HTMLDivElement>(null),
    svg = useRef<SVGSVGElement>(null),
    drag = useRef<Drag | null>(null);
  const [size, setSize] = useState<Size>({ w: 0, h: 0 }),
    [storedView, setView] = useState<View | null>(null),
    [preview, setPreview] = useState<
      { id: string; position: Point } | undefined
    >();
  const view = storedView ?? fit(graph.nodes, size),
    gridId = useId().replace(/:/g, "");
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const measured = { w: el.clientWidth, h: el.clientHeight };
      setSize(measured);
      if (measured.w && measured.h)
        setView((v) => v ?? fit(session.state.design.graph.nodes, measured));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [session]);
  const local = (p: Point) => {
    const r = box.current!.getBoundingClientRect();
    return { x: p.x - r.left, y: p.y - r.top };
  };
  const locate = (p: Point) => world(local(p), view);
  useImperativeHandle(apiRef, () => ({
    center: () => world({ x: size.w / 2, y: size.h / 2 }, view),
    locate,
    inside: (p) => {
      const r = box.current!.getBoundingClientRect();
      return p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
    },
  }));
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (drag.current) return;
      const r = el.getBoundingClientRect();
      const p = { x: e.clientX - r.left, y: e.clientY - r.top };
      setView((v) =>
        zoomAt(p, v ?? fit(graph.nodes, size), Math.exp(-e.deltaY * 0.0015)),
      );
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [graph.nodes, size]);
  useEffect(
    () => () => {
      if (drag.current?.kind === "node") session.endGesture();
      drag.current = null;
    },
    [session],
  );
  const point = (e: PointerEvent) => ({ x: e.clientX, y: e.clientY });
  function start(e: PointerEvent<SVGSVGElement>) {
    if (e.button !== 0 || drag.current) return;
    box.current?.focus({ preventScroll: true });
    const id = (e.target as Element)
        .closest("[data-node]")
        ?.getAttribute("data-node"),
      p = point(e);
    if (id) {
      const n = graph.nodes.find((n) => n.id === id)!;
      const w = locate(p);
      onSelect(id);
      session.beginGesture();
      drag.current = {
        kind: "node",
        id,
        start: p,
        offset: { x: w.x - n.x, y: w.y - n.y },
        position: { x: n.x, y: n.y },
        moved: false,
        pointer: e.pointerId,
      };
    } else {
      onSelect("");
      drag.current = { kind: "pan", start: p, view, pointer: e.pointerId };
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  function move(e: PointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    const p = point(e);
    if (d.kind === "pan") {
      setView({
        ...d.view,
        x: d.view.x + p.x - d.start.x,
        y: d.view.y + p.y - d.start.y,
      });
      return;
    }
    if (!d.moved && Math.abs(p.x - d.start.x) + Math.abs(p.y - d.start.y) <= 3)
      return;
    const w = locate(p);
    d.moved = true;
    d.position = { x: snap(w.x - d.offset.x), y: snap(w.y - d.offset.y) };
    setPreview({ id: d.id, position: d.position });
  }
  function finish(cancel = false) {
    const d = drag.current;
    drag.current = null;
    setPreview(undefined);
    if (d && svg.current?.hasPointerCapture(d.pointer))
      svg.current.releasePointerCapture(d.pointer);
    if (d?.kind === "node")
      session.endGesture(
        !cancel && d.moved
          ? moveComponent(
              session.state.design.graph,
              d.id,
              d.position.x,
              d.position.y,
            )
          : undefined,
      );
  }
  const changeZoom = (factor: number) =>
    setView(zoomAt({ x: size.w / 2, y: size.h / 2 }, view, factor));
  const center = (p: Point) =>
    setView({
      ...view,
      x: size.w / 2 - p.x * view.k,
      y: size.h / 2 - p.y * view.k,
    });
  return (
    <div
      className="cv m5-canvas"
      ref={box}
      tabIndex={0}
      role="region"
      aria-label="Architecture canvas"
      aria-describedby="canvas-help"
      onBlur={e=>{if(drag.current&&!e.currentTarget.contains(e.relatedTarget as Node|null))finish(true);}}
      onKeyDown={(e) => {
        if (
          (e.target as Element).closest("button,input,select,textarea") &&
          !(e.target as Element).closest("[data-node]")
        )
          return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          if (drag.current) finish(true);
          else onSelect("");
          return;
        }
        if (drag.current) return;
        if (e.key === "f" || e.key === "F") {
          e.preventDefault();
          setView(fit(graph.nodes, size));
        } else if (e.key === "+" || e.key === "=") {
          e.preventDefault();
          changeZoom(1.2);
        } else if (e.key === "-" || e.key === "_") {
          e.preventDefault();
          changeZoom(1 / 1.2);
        } else if (selected && e.key.startsWith("Arrow")) {
          const n = graph.nodes.find((n) => n.id === selected);
          if (!n) return;
          const step = e.shiftKey ? 48 : GRID;
          const offsets: Record<string, Point> = {
            ArrowLeft: { x: -step, y: 0 },
            ArrowRight: { x: step, y: 0 },
            ArrowUp: { x: 0, y: -step },
            ArrowDown: { x: 0, y: step },
          };
          const delta = offsets[e.key];
          if (delta) {
            e.preventDefault();
            session.edit(
              moveComponent(graph, n.id, n.x + delta.x, n.y + delta.y, false),
            );
          }
        }
      }}
    >
      <svg
        ref={svg}
        className="cv-svg"
        aria-label="Architecture graph"
        role="group"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={(e) => {
          if (drag.current?.pointer === e.pointerId) finish();
        }}
        onPointerCancel={(e) => {
          if (drag.current?.pointer === e.pointerId) finish(true);
        }}
        onLostPointerCapture={() => {
          if (drag.current) finish(true);
        }}
      >
        <defs>
          <marker
            id={gridId + "-arrow"}
            viewBox="0 0 10 10"
            refX="9.5"
            refY="5"
            markerUnits="userSpaceOnUse"
            markerWidth="11"
            markerHeight="11"
            orient="auto-start-reverse"
          >
            <path className="cv-arrow" d="M0 1L10 5L0 9z" />
          </marker>
          <pattern
            id={gridId}
            width="120"
            height="120"
            patternUnits="userSpaceOnUse"
          >
            <path
              className="cv-grid-minor"
              d="M24 0V120M48 0V120M72 0V120M96 0V120M0 24H120M0 48H120M0 72H120M0 96H120"
              fill="none"
            />
            <path className="cv-grid-major" d="M0 0V120M0 0H120" fill="none" />
          </pattern>
        </defs>
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          <rect
            data-canvas-background="true"
            x={(-view.x - size.w) / view.k}
            y={(-view.y - size.h) / view.k}
            width={(size.w * 3) / view.k}
            height={(size.h * 3) / view.k}
            fill={`url(#${gridId})`}
          />
          <GraphNodes
            markerId={gridId + "-arrow"}
            graph={graph}
            selected={selected}
            onSelect={onSelect}
            preview={preview}
          />
        </g>
      </svg>
      <div className="cv-tools" role="toolbar" aria-label="Canvas tools">
        <button
          className="btn btn-ghost icon"
          aria-label="Select and move"
          onClick={() => box.current?.focus()}
        >
          <Icon n="cursor" />
        </button>
        <button
          className="btn btn-ghost icon"
          aria-label="Zoom out"
          onClick={() => changeZoom(1 / 1.2)}
        >
          <Icon n="zoomOut" />
        </button>
        <output className="cv-zoom num" aria-label="Canvas zoom">
          {Math.round(view.k * 100)}%
        </output>
        <button
          className="btn btn-ghost icon"
          aria-label="Zoom in"
          onClick={() => changeZoom(1.2)}
        >
          <Icon n="zoomIn" />
        </button>
        <button
          className="btn btn-ghost icon"
          aria-label="Fit to screen"
          onClick={() => setView(fit(graph.nodes, size))}
        >
          <Icon n="fit" />
        </button>
        <button
          className="btn btn-ghost icon"
          aria-label="Focus selected component"
          disabled={!selected}
          onClick={() => {
            const n = graph.nodes.find((n) => n.id === selected);
            if (n) center({ x: n.x + NODE_W / 2, y: n.y + NODE_H / 2 });
          }}
        >
          <Icon n="search" />
        </button>
      </div>
      <Minimap graph={graph} view={view} size={size} onCenter={center} />
      {!graph.nodes.length && (
        <div className="cv-empty">
          <div>
            <Icon n="layers" s={28} />
            <b>The canvas is empty</b>
            <span>Add a component from the palette. Start with Clients.</span>
          </div>
        </div>
      )}
    </div>
  );
}
