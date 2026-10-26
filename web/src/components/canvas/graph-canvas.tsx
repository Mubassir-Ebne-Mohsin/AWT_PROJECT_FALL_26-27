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
import { LOAD_LEGEND, type LoadOverlay } from "@/lib/load-overlay";
import { Minimap } from "@/components/canvas/minimap";
import { Icon } from "@/components/ui/icon";
import type { EditorSession } from "@/lib/editor-session";
export type CanvasApi = {
  center: () => Point;
  locate: (p: Point) => Point;
  inside: (p: Point) => boolean;
  focus: (id:string) => void;
  cancel:()=>void;
  connectFrom:(id:string)=>void;
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
  | { kind: "pan"; start: Point; view: View; pointer: number }
  | {kind:"connect"; id:string; start:Point; position:Point; moved:boolean; pointer:number};
export function GraphCanvas({
  graph,
  session,
  selected,
  onSelect,
  apiRef,
  connectMode,
  setConnectMode,
  edgeSelected,
  onEdgeSelect,
  onConnect,
  overlay,
}: {
  graph: Graph;
  session: EditorSession;
  selected: string;
  onSelect: (id: string) => void;
  apiRef: Ref<CanvasApi>;
  connectMode:boolean;
  setConnectMode:(value:boolean)=>void;
  edgeSelected:string;
  onEdgeSelect:(id:string)=>void;
  onConnect:(from:string,to:string)=>void;
  overlay?: LoadOverlay | null;
}) {
  const box = useRef<HTMLDivElement>(null),
    svg = useRef<SVGSVGElement>(null),
    drag = useRef<Drag | null>(null), pendingSource=useRef("");
  const [link,setLink]=useState<{from:string;position:Point}|null>(null);
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
    cancel:()=>finish(true),
    connectFrom:(id)=>{finish(true);const n=session.state.design.graph.nodes.find(n=>n.id===id);if(n){pendingSource.current=id;session.beginGesture();setLink({from:id,position:{x:n.x+NODE_W+50,y:n.y+NODE_H/2}});box.current?.focus();}},
    center: () => world({ x: size.w / 2, y: size.h / 2 }, view),
    locate,
    focus:(id)=>{const n=session.state.design.graph.nodes.find(n=>n.id===id);if(n){setView(v=>({...v??view,x:size.w/2-(n.x+NODE_W/2)*(v??view).k,y:size.h/2-(n.y+NODE_H/2)*(v??view).k})); box.current?.focus();}},
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
      if (drag.current || pendingSource.current) return;
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
      if (drag.current?.kind === "node" || drag.current?.kind === "connect" || pendingSource.current) session.endGesture();
      pendingSource.current="";
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
    const edge=(e.target as Element).closest("[data-edge]")?.getAttribute("data-edge");
    const output=(e.target as Element).closest("[data-output]");
    if(id && (connectMode || output || pendingSource.current)) {
      onSelect(id);
      if(pendingSource.current) {
        const from=pendingSource.current;
        pendingSource.current="";setLink(null);session.endGesture();onConnect(from,id);
      } else {
        session.beginGesture();
        drag.current={kind:"connect",id,start:p,position:locate(p),moved:false,pointer:e.pointerId};
        setLink({from:id,position:locate(p)});
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      e.preventDefault(); return;
    }
    if(edge){onEdgeSelect(edge);e.preventDefault();return;}
    if(pendingSource.current){finish(true);}
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
    if(d.kind==="connect"){d.moved=true;d.position=w;setLink({from:d.id,position:w});return;}
    d.moved = true;
    d.position = { x: snap(w.x - d.offset.x), y: snap(w.y - d.offset.y) };
    setPreview({ id: d.id, position: d.position });
  }
  function finish(cancel = false, target?:string) {
    if(pendingSource.current){pendingSource.current="";session.endGesture();}
    setLink(null);
    const d = drag.current;
    drag.current = null;
    setPreview(undefined);
    if (d && svg.current?.hasPointerCapture(d.pointer))
      svg.current.releasePointerCapture(d.pointer);
    if(d?.kind==="connect"){
      if(!cancel && !d.moved){pendingSource.current=d.id;setLink({from:d.id,position:d.position});return;}
      session.endGesture();
      if(!cancel && target)onConnect(d.id,target);
    }
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
      onBlur={e=>{if((drag.current||pendingSource.current)&&!e.currentTarget.contains(e.relatedTarget as Node|null))finish(true);}}
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
          if (drag.current || pendingSource.current) finish(true);
          else {setConnectMode(false);onSelect("");}
          return;
        }
        if (drag.current || pendingSource.current) return;
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
              moveComponent(graph, n.id, n.x + delta.x, n.y + delta.y, false), "move:"+n.id,
            );
          }
        }
      }}
    >
      <svg
        ref={svg}
        className={"cv-svg"+(connectMode?" connecting":"")}
        aria-label="Architecture graph"
        role="group"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={(e) => {
          if (drag.current?.pointer === e.pointerId) {
            const target=document.elementFromPoint(e.clientX,e.clientY)?.closest("[data-node]");
            finish(false,target && e.currentTarget.contains(target)?target.getAttribute("data-node")??undefined:undefined);
          }
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
            edgeSelected={edgeSelected}
            onEdgeSelect={onEdgeSelect}
            connecting={connectMode || !!link}
            overlay={overlay}
          />
          {link && (()=>{const n=graph.nodes.find(n=>n.id===link.from);return n?<path className="m6-link-preview" pointerEvents="none" d={`M${n.x+NODE_W} ${n.y+NODE_H/2} L${link.position.x} ${link.position.y}`} markerEnd={"url(#"+gridId+"-arrow)"} />:null;})()}
        </g>
      </svg>
      {overlay && graph.nodes.length > 0 && (
        <div className="cv-legend" aria-label="Load overlay legend">
          {LOAD_LEGEND.map((l) => (
            <span key={l.status}>
              <span className={"sdot " + l.status} aria-hidden="true"></span>
              {l.text}
            </span>
          ))}
        </div>
      )}
      <div className="cv-tools" role="toolbar" aria-label="Canvas tools">
        <button
          className="btn btn-ghost icon"
          aria-label="Select and move"
          onClick={() => {finish(true);setConnectMode(false);box.current?.focus();}}
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
      {connectMode && <p className="m6-connect-hint" role="status">{link?"Choose the destination component.":"Connect: choose a source, then a destination."} Escape cancels.</p>}
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
