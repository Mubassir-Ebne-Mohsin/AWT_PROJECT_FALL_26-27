import type { Graph } from "@/lib/api/designs";
import type { components } from "@/lib/api/schema";
import { numberText } from "@/lib/result-presentation";

type Summary = components["schemas"]["SimulationOutput"]["summary"];
export type LoadStatus = "idle" | "ok" | "warn" | "fail";
export interface NodeLoad {
  status: LoadStatus;
  rho: number;
  /** Numeric utilization stays truthful above 100%; only the meter is clamped. */
  utilization: string;
  peak: string;
  meter: number;
  background: boolean;
}
export interface EdgeLoad {
  rps: number;
  label: string;
  width: number;
}
export interface LoadOverlay {
  nodes: Map<string, NodeLoad>;
  edges: Map<string, EdgeLoad>;
  /** Highlighted like the prototype only when the busiest component is at least strained. */
  bottleneckId: string | null;
}

export const LOAD_LEGEND = [
  { status: "ok", text: "healthy below 75%" },
  { status: "warn", text: "strained 75–under 100%" },
  { status: "fail", text: "failing at or above 100%" },
] as const;

const rpsShort = (v: number) => numberText(v, v < 10 ? 1 : 0) + "/s";

/**
 * Model load for the graph currently drawn. The caller passes a summary ONLY when it was computed for exactly
 * these semantic inputs; anything not present in it stays unpainted rather than borrowing old metrics.
 */
export function loadOverlay(graph: Graph, summary: Summary | null | undefined): LoadOverlay | null {
  if (!summary) return null;
  const byId = new Map(summary.nodes.map((n) => [n.id, n]));
  const nodes = new Map<string, NodeLoad>();
  for (const node of graph.nodes) {
    const m = byId.get(node.id);
    if (!m || m.type !== node.type) continue;
    const status: LoadStatus = node.type === "client" ? "idle" : m.status;
    nodes.set(node.id, {
      status,
      rho: m.rho,
      utilization: numberText(m.rho * 100, m.rho < 0.1 ? 1 : 0) + "%",
      peak: rpsShort(m.peak),
      meter: Math.max(0, Math.min(1, m.rho)),
      background: m.background,
    });
  }
  // Defensive: render node load even if a partial summary carries no flow list.
  const flowList = summary.flows ?? [];
  const flows = new Map(flowList.map((f) => [f.from + ">" + f.to, f.rps]));
  const max = Math.max(1e-9, ...flowList.map((f) => f.rps));
  const edges = new Map<string, EdgeLoad>();
  for (const e of graph.edges) {
    const rps = flows.get(e.from + ">" + e.to) ?? 0;
    if (rps > 0) edges.set(e.id, { rps, label: rpsShort(rps), width: 1.4 + 3.4 * Math.sqrt(rps / max) });
  }
  const b = summary.bottleneckId ? byId.get(summary.bottleneckId) : undefined;
  return { nodes, edges, bottleneckId: b && b.rho >= 0.75 && nodes.has(b.id) ? b.id : null };
}
