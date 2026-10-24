import type { Catalog, Entry, Node, NumericProperty } from "@/lib/canvas/model";
import { defaultValue, moveComponent } from "@/lib/canvas/model";
import { ComponentGlyph } from "@/components/canvas/component-glyph";
import { NumericField, LabelField } from "@/components/canvas/property-fields";
import type { EditorSession } from "@/lib/editor-session";
import { GRID } from "@/lib/canvas/geometry";
export function NodeProperties({
  node,
  entry,
  catalog,
  session,
}: {
  node: Node;
  entry: Entry;
  catalog: Catalog;
  session: EditorSession;
}) {
  const patch = (value: Record<string, unknown>, label?: string) => {
    const graph = session.state.design.graph;
    session.edit({
      ...graph,
      nodes: graph.nodes.map((n) =>
        n.id === node.id
          ? {
              ...n,
              ...(label !== undefined ? { label } : {}),
              props: { ...n.props, ...value },
            }
          : n,
      ) as typeof graph.nodes,
    }, label !== undefined ? "label:"+node.id : "prop:"+node.id+":"+Object.keys(value).join(","));
  };
  return (
    <>
      <div className="props-sec stack">
        <div className="row">
          <ComponentGlyph type={node.type} size={24} />
          <div>
            <span className="eyebrow">{entry.category}</span>
            <h3 className="h3">{entry.label}</h3>
          </div>
        </div>
        <p className="small muted">{entry.blurb}</p>
        <LabelField
          node={node}
          session={session}
          change={(label) => patch({}, label)}
        />
      </div>
      <div className="props-sec stack">
        {entry.editableProperties
          .filter((key) => key !== "region")
          .map((key) => (
            <NumericField
              key={key}
              property={key as NumericProperty}
              node={node}
              session={session}
              value={defaultValue(node, entry, key as NumericProperty)}
              change={(value) => patch({ [key]: value })}
            />
          ))}
        {entry.editableProperties.includes("region") && (
          <label className="field">
            <span className="label">Region</span>
            <select
              aria-label="Region"
              className="select sm"
              value={
                "region" in node.props
                  ? (node.props.region ?? "us-east")
                  : "us-east"
              }
              onChange={(e) => patch({ region: e.target.value })}
            >
              {catalog.regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {node.type === "cdn" && (
          <p className="hint">Global edge, next to users. No fixed region.</p>
        )}
        {node.type === "client" && (
          <p className="hint">
            Clients are traffic entry points, without a replica pool.
          </p>
        )}
      </div>
      <div className="props-sec stack">
        <h3 className="h3">Position</h3>
        <p className="hint num" data-testid="node-position">
          x {node.x} · y {node.y}
        </p>
        <div className="row" role="group" aria-label="Move selected component">
          {[
            ["Left", -GRID, 0],
            ["Up", 0, -GRID],
            ["Down", 0, GRID],
            ["Right", GRID, 0],
          ].map(([label, x, y]) => (
            <button
              key={label}
              className="btn btn-sm"
              aria-label={"Move " + label}
              onClick={() =>
                session.edit(
                  moveComponent(
                    session.state.design.graph,
                    node.id,
                    node.x + Number(x),
                    node.y + Number(y),
                    false,
                  ),
                )
              }
            >
              {label}
            </button>
          ))}
        </div>
        <p className="hint">
          Canvas arrows move 12 units; Shift + arrows move 48.
        </p>
      </div>
      <div className="props-sec">
        <p className="hint">
          Use the toolbar to duplicate or delete this component. Deleting also removes its connections; Undo restores them.
        </p>
      </div>
    </>
  );
}
