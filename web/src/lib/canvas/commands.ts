import type { Graph } from "@/lib/api/designs";
import { moveComponent } from "@/lib/canvas/model";

function nextId(graph: Graph, prefix: string) {
  const ids = new Set([...graph.nodes, ...graph.edges].map(x => x.id));
  let n = 1;
  while (ids.has(prefix + n)) n++;
  return prefix + n;
}
export function connectNodes(graph: Graph, from: string, to: string): {graph: Graph; id: string} {
  const source = graph.nodes.find(n => n.id === from), target = graph.nodes.find(n => n.id === to);
  if (!source || !target) throw new Error("Choose an existing source and destination.");
  if (from === to) throw new Error("A component cannot connect to itself.");
  if (target.type === "client") throw new Error("Clients only send traffic; connections cannot point into Clients.");
  if (graph.edges.some(e => e.from === from && e.to === to)) throw new Error("These components are already connected in this direction.");
  if (graph.edges.length >= 200) throw new Error("This design already has 200 connections.");
  const id = nextId(graph, "e");
  return {id, graph: {...graph, edges: [...graph.edges, {id, from, to}]}};
}
export function reverseConnection(graph: Graph, id: string): Graph {
  const edge = graph.edges.find(e => e.id === id);
  if (!edge) throw new Error("Select an existing connection.");
  // Validate against all other edges but retain this edge's identity and array order.
  connectNodes({...graph, edges: graph.edges.filter(e => e.id !== id)}, edge.to, edge.from);
  return {...graph, edges: graph.edges.map(e => e.id === id ? {...e, from: e.to, to: e.from} : e)};
}
export function deleteSelection(graph: Graph, kind: "node" | "edge", id: string): Graph {
  return kind === "edge"
    ? {...graph, edges: graph.edges.filter(e => e.id !== id)}
    : {...graph, nodes: graph.nodes.filter(n => n.id !== id), edges: graph.edges.filter(e => e.from !== id && e.to !== id)};
}
export function duplicateComponent(graph: Graph, id: string): {graph: Graph; id: string} {
  if (graph.nodes.length >= 50) throw new Error("This design already has 50 components.");
  const original = graph.nodes.find(n => n.id === id);
  if (!original) throw new Error("Select an existing component.");
  const copy = structuredClone(original), newId = nextId(graph, "n");
  copy.id = newId;
  copy.label = original.label.slice(0, 75) + " copy";
  const added = {...graph, nodes: [...graph.nodes, copy]};
  return {id: newId, graph: moveComponent(added, newId, original.x + 36, original.y + 84, false)};
}
