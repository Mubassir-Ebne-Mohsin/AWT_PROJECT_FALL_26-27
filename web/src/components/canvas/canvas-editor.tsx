"use client";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { EditorSession } from "@/lib/editor-session";
import { Catalog, Entry, addComponent } from "@/lib/canvas/model";
import { GraphCanvas, CanvasApi } from "@/components/canvas/graph-canvas";
import { ComponentPalette } from "@/components/canvas/palette";
import {
  connectNodes,
  reverseConnection,
  deleteSelection,
  duplicateComponent,
} from "@/lib/canvas/commands";
import { ValidationPanel } from "@/components/canvas/validation-panel";
import { ConnectionPanel } from "@/components/canvas/connection-panel";
import { NodeProperties } from "@/components/canvas/node-properties";
export function CanvasEditor({
  session,
  focusNode,
}: {
  session: EditorSession;
  focusNode?: string;
}) {
  const graph = session.state.design.graph;
  const [selected, setSelected] = useState(
      graph.nodes.find((n) => n.id === focusNode)?.id ??
        graph.nodes.find((n) => n.type === "app")?.id ??
        graph.nodes[0]?.id ??
        "",
    ),
    [error, setError] = useState(""),
    [edgeSelected, setEdgeSelected] = useState(""),
    [connectMode, setConnectMode] = useState(false);
  const apiRef = useRef<CanvasApi | null>(null);
  const catalog = useQuery({
    queryKey: ["simulation-catalog"],
    queryFn: () => api<Catalog>("/simulation/catalog"),
  });
  const selectNode = (id: string) => {
    setSelected(id);
    setEdgeSelected("");
  };
  const selectEdge = (id: string) => {
    setEdgeSelected(id);
    setSelected("");
  };
  const edge = graph.edges.find((e) => e.id === edgeSelected);
  const node = graph.nodes.find((n) => n.id === selected),
    entry = catalog.data?.components.find((c) => c.type === node?.type);
  function add(entry: Entry, x: number, y: number) {
    try {
      const result = addComponent(session.state.design.graph, entry, x, y);
      session.edit(result.graph);
      selectNode(result.id);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add component");
    }
  }
  function command(action: () => void) {
    try {
      action();
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not edit graph.");
    }
  }
  function connect(from: string, to: string) {
    command(() => {
      const result = connectNodes(session.state.design.graph, from, to);
      session.edit(result.graph);
      selectEdge(result.id);
    });
  }
  function remove() {
    command(() => {
      if (node || graph.edges.some((e) => e.id === edgeSelected)) {
        session.edit(
          deleteSelection(
            session.state.design.graph,
            node ? "node" : "edge",
            node?.id ?? edgeSelected,
          ),
        );
        selectNode("");
      }
    });
  }
  function duplicate() {
    command(() => {
      const result = duplicateComponent(session.state.design.graph, selected);
      session.edit(result.graph);
      selectNode(result.id);
    });
  }
  const blocked = session.state.gesture || !!session.state.inputErrors.length;
  function toggleConnect() {
    apiRef.current?.cancel();
    setConnectMode((v) => !v);
  }
  return (
    <section
      className="m5-workspace stack"
      onKeyDown={(e) => {
        if (
          (e.target as Element).closest(
            "input,select,textarea,[contenteditable=true]",
          ) ||
          e.altKey
        )
          return;
        const mod = e.ctrlKey || e.metaKey,
          key = e.key.toLowerCase();
        if (mod && key === "z") {
          e.preventDefault();
          if (!blocked) {
            if (e.shiftKey) session.redo();
            else session.undo();
          }
          return;
        }
        if (mod && key === "y") {
          e.preventDefault();
          if (!blocked) session.redo();
          return;
        }
        if (mod && key === "d") {
          e.preventDefault();
          if (!blocked && node) duplicate();
          return;
        }
        if (mod) return;
        if (key === "c") {
          e.preventDefault();
          toggleConnect();
        }
        if (
          (key === "delete" || key === "backspace") &&
          (node || edgeSelected)
        ) {
          e.preventDefault();
          if (!blocked) remove();
        }
      }}
    >
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
      <div className="row" role="group" aria-label="Graph editing tools">
        <button
          className="btn btn-sm"
          aria-label="Connect tool"
          aria-pressed={connectMode}
          onClick={toggleConnect}
        >
          Connect (C)
        </button>
        <button
          className="btn btn-sm"
          disabled={!session.state.canUndo || blocked}
          onClick={() => session.undo()}
        >
          Undo
        </button>
        <button
          className="btn btn-sm"
          disabled={!session.state.canRedo || blocked}
          onClick={() => session.redo()}
        >
          Redo
        </button>
        <button
          className="btn btn-sm"
          disabled={!node || blocked || graph.nodes.length >= 50}
          onClick={duplicate}
        >
          Duplicate component
        </button>
        <button
          className="btn btn-sm"
          disabled={(!node && !edge) || blocked}
          onClick={remove}
        >
          Delete selection
        </button>
      </div>
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
            onSelect={selectNode}
            onEdgeSelect={selectEdge}
            edgeSelected={edgeSelected}
            connectMode={connectMode}
            setConnectMode={setConnectMode}
            onConnect={connect}
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
              onChange={(e) => selectNode(e.target.value)}
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
          <ConnectionPanel
            graph={graph}
            selected={edgeSelected}
            select={selectEdge}
            connect={connect}
            reverse={() =>
              command(() =>
                session.edit(
                  reverseConnection(session.state.design.graph, edgeSelected),
                ),
              )
            }
            remove={remove}
          />
        </aside>
        <div className="ed-live m5-live" id="canvas-help">
          Select and move · drag background to pan · wheel or +/− to zoom · F to
          fit · C to connect · Esc to cancel · Delete selection · Ctrl+Z to
          undo. Live load colours arrive in M8.
        </div>
      </div>
      <ValidationPanel
        session={session}
        focus={(id) => {
          selectNode(id);
          apiRef.current?.focus(id);
        }}
        connect={(id) => {
          selectNode(id);
          setConnectMode(true);
          apiRef.current?.connectFrom(id);
        }}
      />
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
