"use client";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { EditorSession } from "@/lib/editor-session";
import { Catalog, Entry, addComponent } from "@/lib/canvas/model";
import { GraphCanvas, CanvasApi } from "@/components/canvas/graph-canvas";
import { ComponentPalette } from "@/components/canvas/palette";
import { NodeProperties } from "@/components/canvas/node-properties";
export function CanvasEditor({ session }: { session: EditorSession }) {
  const graph = session.state.design.graph;
  const [selected, setSelected] = useState(
      graph.nodes.find((n) => n.type === "app")?.id ?? graph.nodes[0]?.id ?? "",
    ),
    [error, setError] = useState("");
  const apiRef = useRef<CanvasApi | null>(null);
  const catalog = useQuery({
    queryKey: ["simulation-catalog"],
    queryFn: () => api<Catalog>("/simulation/catalog"),
  });
  const node = graph.nodes.find((n) => n.id === selected),
    entry = catalog.data?.components.find((c) => c.type === node?.type);
  function add(entry: Entry, x: number, y: number) {
    try {
      const result = addComponent(session.state.design.graph, entry, x, y);
      session.edit(result.graph);
      setSelected(result.id);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add component");
    }
  }
  return (
    <section className="m5-workspace stack">
      {catalog.isPending && <p role="status">Loading component catalog…</p>}
      {catalog.isError && (
        <div className="note warn" role="alert">
          Could not load components. Your graph is retained.{" "}
          <button className="btn" onClick={() => catalog.refetch()}>
            Retry catalog
          </button>
        </div>
      )}
      {error && (
        <p className="note fail" role="alert">
          {error}
        </p>
      )}
      <div className="ed m5-editor">
        {catalog.data ? (
          <ComponentPalette
            catalog={catalog.data}
            session={session}
            api={apiRef}
            add={add}
          />
        ) : (
          <aside className="ed-palette" aria-label="Component palette">
            Components unavailable
          </aside>
        )}
        <div className="ed-canvas">
          <GraphCanvas
            graph={graph}
            session={session}
            selected={selected}
            onSelect={setSelected}
            apiRef={apiRef}
          />
        </div>
        <aside className="ed-props" aria-label="Component properties">
          <div className="props-sec stack">
            <h2 className="h3">Component properties</h2>
            <label htmlFor="component-choice">Component</label>
            <select
              className="select sm"
              id="component-choice"
              value={node?.id ?? ""}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">Select a component</option>
              {graph.nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label}
                </option>
              ))}
            </select>
          </div>
          {node && entry && catalog.data ? (
            <NodeProperties
              key={node.id}
              node={node}
              entry={entry}
              catalog={catalog.data}
              session={session}
            />
          ) : (
            <div className="props-sec">
              <p className="muted">
                Select a component to edit its properties, or add one from the
                palette.
              </p>
            </div>
          )}
        </aside>
        <div className="ed-live m5-live" id="canvas-help">
          Select and move · drag background to pan · wheel or +/− to zoom · F to
          fit · Esc to cancel. Connections and undo arrive in M6; live load
          colours arrive in M8.
        </div>
      </div>
      <div className="ed-narrow">
        <h2 className="h2">The canvas needs a wider window</h2>
        <p>
          Editing works from 900 px wide. Widen the window, or use Results to
          read an existing test.
        </p>
      </div>
    </section>
  );
}
