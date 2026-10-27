import { useEffect, useRef, useState } from "react";
import type { Catalog, Entry } from "@/lib/canvas/model";
import type { CanvasApi } from "@/components/canvas/graph-canvas";
import type { EditorSession } from "@/lib/editor-session";
import { ComponentGlyph } from "@/components/canvas/component-glyph";
type Ghost = {
  entry: Entry;
  x: number;
  y: number;
  sx: number;
  sy: number;
  moved: boolean;
  pointer: number;
};
export function ComponentPalette({
  catalog,
  session,
  api,
  add,
}: {
  catalog: Catalog;
  session: EditorSession;
  api: React.RefObject<CanvasApi | null>;
  add: (entry: Entry, x: number, y: number) => void;
}) {
  const ref = useRef<Ghost | null>(null),
    skipClick = useRef(false),
    [ghost, setGhost] = useState<Ghost | null>(null);
  useEffect(
    () => () => {
      if (ref.current) {
        ref.current = null;
        session.endGesture();
      }
    },
    [session],
  );
  function cancel() {
    if (!ref.current) return;
    ref.current = null;
    skipClick.current = true;
    setGhost(null);
    session.endGesture();
  }
  const groups = [...new Set(catalog.components.map((c) => c.category))];
  return (
    <aside className="ed-palette" aria-label="Component palette"
      onKeyDown={e => { if (e.key === "Escape" && ref.current) { e.preventDefault(); e.stopPropagation(); cancel(); } }}
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) cancel(); }}>
      <p className="m9-palette-note">{catalog.components.length} component types · Scroll for more</p>
      {groups.map((group) => (
        <div className="pal-group" key={group}>
          <h2 className="eyebrow">{group}</h2>
          {catalog.components
            .filter((c) => c.category === group)
            .map((entry) => (
              <button
                key={entry.type}
                type="button"
                className="pal-item"
                aria-label={"Add " + entry.label}
                title={entry.label + ": " + entry.blurb}
                disabled={session.state.design.graph.nodes.length >= 50}
                onPointerDown={(e) => {
                  if (e.button !== 0 || ref.current) return;
                  e.currentTarget.focus({preventScroll:true});
                  skipClick.current = false;
                  const g = {
                    entry,
                    x: e.clientX,
                    y: e.clientY,
                    sx: e.clientX,
                    sy: e.clientY,
                    moved: false,
                    pointer: e.pointerId,
                  };
                  ref.current = g;
                  setGhost(g);
                  session.beginGesture();
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  const g = ref.current;
                  if (!g || g.pointer !== e.pointerId) return;
                  const next = {
                    ...g,
                    x: e.clientX,
                    y: e.clientY,
                    moved:
                      g.moved ||
                      Math.abs(g.sx - e.clientX) + Math.abs(g.sy - e.clientY) >
                        3,
                  };
                  ref.current = next;
                  setGhost(next);
                }}
                onPointerUp={(e) => {
                  const g = ref.current;
                  if (!g || g.pointer !== e.pointerId) return;
                  ref.current = null;
                  setGhost(null);
                  session.endGesture();
                  if (g.moved) {
                    skipClick.current = true;
                    const p = { x: e.clientX, y: e.clientY };
                    if (api.current?.inside(p)) {
                      const w = api.current.locate(p);
                      add(g.entry, w.x, w.y);
                    }
                  }
                }}
                onPointerCancel={e=>{if(ref.current?.pointer===e.pointerId)cancel();}}
                onLostPointerCapture={e=>{if(ref.current?.pointer===e.pointerId)cancel();}}
                onClick={(e) => {
                  if (e.detail !== 0 && skipClick.current) {
                    skipClick.current = false;
                    return;
                  }
                  const p = api.current?.center();
                  if (p) add(entry, p.x, p.y);
                }}
              >
                <span className="gl">
                  <ComponentGlyph type={entry.type} />
                </span>
                <span className="txt">
                  <span className="nm">{entry.label}</span>
                  <span className="cp">
                    {entry.capacity.kind === "finite"
                      ? entry.capacity.value.toLocaleString() +
                        "/s · " +
                        entry.latency +
                        " ms"
                      : "traffic entry"}
                  </span>
                </span>
              </button>
            ))}
        </div>
      ))}
      <p className="hint">
        Drag onto the canvas, or click to add in the middle. 50 components
        maximum.
      </p>
      {ghost?.moved && (
        <div className="ghost" style={{ left: ghost.x, top: ghost.y }}>
          <ComponentGlyph type={ghost.entry.type} />
          {ghost.entry.label}
        </div>
      )}
    </aside>
  );
}
