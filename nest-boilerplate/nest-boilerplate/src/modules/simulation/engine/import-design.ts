import {
  graphSchema,
  snapshotSchema,
  TRAFFIC_DEFAULTS,
} from "@/common/contracts/phase2/graph.schema";
import { parseImportText } from "@/common/contracts/phase2/import-text";
import { CATALOG } from "@/modules/simulation/engine/catalog";
import { layout } from "@/modules/simulation/engine/builders";
import type { Design } from "@/modules/simulation/engine/types";
export function importDesign(text: string) {
  const parsed = parseImportText(text);
  const graph: Design = {
    nodes: parsed.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      label: n.label ?? CATALOG[n.type].label,
      x: n.x ?? 0,
      y: n.y ?? 0,
      props: n.props ?? {},
    })),
    edges: [],
  };
  const used = new Set([
    ...graph.nodes.map((n) => n.id),
    ...(parsed.edges ?? []).flatMap((e) => (e.id ? [e.id] : [])),
  ]);
  let next = 1;
  graph.edges = (parsed.edges ?? []).map((e) => {
    let id = e.id;
    if (!id) {
      while (used.has("e" + next)) next++;
      id = "e" + next++;
      used.add(id);
    }
    return { id, from: e.from, to: e.to };
  });
  if (parsed.nodes.some((n) => n.x === undefined || n.y === undefined))
    layout(graph);
  return {
    name: parsed.name ?? "Imported design",
    description: parsed.description ?? "",
    snapshot: snapshotSchema.parse({
      schemaVersion: 1,
      graph: graphSchema.parse(graph),
      traffic: { ...TRAFFIC_DEFAULTS, ...parsed.traffic },
    }),
  };
}
