import type { components } from "@/lib/api/schema";
import type { Graph } from "@/lib/api/designs";
import { snap } from "@/lib/canvas/geometry";
export type Catalog = components["schemas"]["Catalog"];
export type Entry = Catalog["components"][number];
export type Node = Graph["nodes"][number];
export function addComponent(
  graph: Graph,
  entry: Entry,
  x: number,
  y: number,
): { graph: Graph; id: string } {
  if (!Number.isFinite(x) || !Number.isFinite(y))
    throw new Error("Position must be finite.");
  if (graph.nodes.length >= 50)
    throw new Error("This design already has 50 components.");
  const ids = new Set([...graph.nodes, ...graph.edges].map((n) => n.id));
  let next = 1;
  while (ids.has("n" + next)) next++;
  const id = "n" + next;
  const props: Record<string, string | number> = Object.fromEntries(
    Object.entries(entry.defaults).filter(([key]) =>
      entry.editableProperties.includes(
        key as Entry["editableProperties"][number],
      ),
    ),
  );
  if (entry.editableProperties.includes("region")) props.region = "us-east";
  const node = {
    id,
    type: entry.type,
    label: entry.label,
    x: snap(x),
    y: snap(y),
    props,
  } as Node;
  return { id, graph: { ...graph, nodes: [...graph.nodes, node] } };
}
export function moveComponent(
  graph: Graph,
  id: string,
  x: number,
  y: number,
  snapPosition = true,
): Graph {
  if (!Number.isFinite(x) || !Number.isFinite(y))
    throw new Error("Position must be finite.");
  return {
    ...graph,
    nodes: graph.nodes.map((n) =>
      n.id === id
        ? {
            ...n,
            x: snapPosition ? snap(x) : Math.max(-100000, Math.min(100000, x)),
            y: snapPosition ? snap(y) : Math.max(-100000, Math.min(100000, y)),
          }
        : n,
    ),
  };
}
export const numericRules = {
  capacity: {
    label: "Capacity per replica",
    min: 1,
    max: 1e9,
    step: 10,
    unit: "requests/s",
  },
  replicas: { label: "Replicas (1–200)", min: 1, max: 200, step: 1, unit: "" },
  latency: { label: "Service time", min: 0.1, max: 60000, step: 1, unit: "ms" },
  hitRatio: {
    label: "Hit rate",
    min: 0,
    max: 0.99,
    step: 0.01,
    unit: "fraction",
  },
  share: {
    label: "Request share",
    min: 0,
    max: 1,
    step: 0.01,
    unit: "fraction",
  },
  maxDepth: {
    label: "Max messages",
    min: 100,
    max: 1e9,
    step: 10000,
    unit: "messages",
  },
} as const;
export type NumericProperty = keyof typeof numericRules;
export function numericError(
  key: NumericProperty,
  raw: string,
  type: Node["type"],
) {
  const n = Number(raw),
    r = numericRules[key],
    max = key === "share" && type === "client" ? 1e6 : r.max;
  const min = key === "share" ? 0 : r.min;
  if (
    !raw.trim() ||
    !Number.isFinite(n) ||
    n < min ||
    n > max ||
    (["replicas", "maxDepth"].includes(key) && !Number.isInteger(n))
  )
    return `Enter ${["replicas", "maxDepth"].includes(key) ? "a whole number" : "a number"} between ${min} and ${max}.`;
  return "";
}
export function defaultValue(node: Node, entry: Entry, key: NumericProperty) {
  if (key in node.props)
    return Number(node.props[key as keyof typeof node.props]);
  if (key === "capacity")
    return entry.capacity.kind === "finite" ? entry.capacity.value : 0;
  if (key === "latency") return entry.latency;
  if (key === "share")
    return "share" in entry.defaults ? (entry.defaults.share ?? 1) : 1;
  return key in entry.defaults
    ? Number(entry.defaults[key as keyof typeof entry.defaults])
    : key === "maxDepth"
      ? 100000
      : 1;
}
