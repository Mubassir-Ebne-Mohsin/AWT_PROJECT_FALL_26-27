import type { Graph, Traffic } from "@/common/contracts/phase2/graph.schema";
import { BOUNDS } from "@/common/contracts/phase2/graph.schema";
import { CATALOG } from "@/modules/simulation/engine/catalog";
import type { NodeType } from "@/modules/simulation/engine/types";

/**
 * Verified fix suggestions (F2). A fix is a small, ordinary edit of the graph at the component that limits the design: more copies,
 * a bigger instance, a cache in front of the database, a read replica. This module only proposes edits; whether an edit helps is
 * decided by running the engine on the edited graph (see FixesService), and every number shown to a person comes from that run.
 * No model is involved.
 */
export type FixKind = "replicas" | "capacity" | "cache" | "readReplica";
export interface Candidate {
  /** Stable for the same graph and bottleneck, so the same fix is the same id on every request. */
  id: string;
  kind: FixKind;
  title: string;
  detail: string;
  /** What the fix takes for granted, in a sentence, or null when it takes nothing for granted. */
  assumption: string | null;
  /** The whole graph with the edit applied. The original is never changed. */
  graph: Graph;
  /** Smaller is simpler; used to prefer the lighter fix between two that help equally. */
  effort: number;
}

/** Components that are ours to scale. A client is the user; a third-party API is not something the design can add copies of. */
const SCALABLE = new Set<NodeType>(["cdn", "lb", "gateway", "app", "worker", "cache", "db", "replica", "queue", "storage"]);
export const MAX_CANDIDATES = 6;
export const MAX_SUGGESTIONS = 3;
const MAX_READ_REPLICAS = 5;
const CACHE_HIT_RATIO = CATALOG.cache.defaults?.hitRatio ?? 0.8;

const clone = (graph: Graph): Graph => JSON.parse(JSON.stringify(graph)) as Graph;
const count = (n: number) => n.toLocaleString("en-US");
type GraphNode = Graph["nodes"][number];

function nextId(graph: Graph, prefix: string) {
  const used = new Set([...graph.nodes.map((n) => n.id), ...graph.edges.map((e) => e.id)]);
  let i = 1;
  while (used.has(prefix + i)) i++;
  return prefix + i;
}
/** A spot near (x, y) that does not sit on top of another component. */
function freeSpot(graph: Graph, x: number, y: number) {
  const taken = (py: number) => graph.nodes.some((n) => Math.abs(n.x - x) < 200 && Math.abs(n.y - py) < 80);
  let py = y;
  for (let i = 0; i < 12 && taken(py); i++) py += 94;
  return { x: Math.round(x), y: Math.round(py) };
}
const labelCount = (graph: Graph, type: NodeType) => graph.nodes.filter((n) => n.type === type).length;

function withProps(node: GraphNode, change: Record<string, unknown>) {
  (node as { props: Record<string, unknown> }).props = { ...node.props, ...change };
}
const regionOf = (node: GraphNode) => ("region" in node.props && node.props.region ? { region: node.props.region } : {});

/**
 * The edits worth trying, for the component that limits the design. At most MAX_CANDIDATES, in a fixed order. The same inputs give
 * the same list.
 */
export function candidateFixes(graph: Graph, traffic: Traffic, limiterId: string | null): Candidate[] {
  const limiter = graph.nodes.find((n) => n.id === limiterId);
  if (!limiter || !SCALABLE.has(limiter.type)) return [];
  const out: Candidate[] = [];
  const name = '"' + limiter.label + '"';
  const props = limiter.props as { replicas?: number; capacity?: number };
  const replicas = props.replicas ?? 1;

  const edit = (change: (g: Graph, n: GraphNode) => void) => {
    const g = clone(graph);
    change(g, g.nodes.find((n) => n.id === limiter.id)!);
    return g;
  };

  const oneMore = replicas + 1;
  if (oneMore <= BOUNDS.replicas)
    out.push({
      id: `${limiter.id}:replicas:${oneMore}`,
      kind: "replicas",
      title: `Add one more copy of ${name} (${count(replicas)} to ${count(oneMore)})`,
      detail: "Another copy shares the load, so each copy works less hard.",
      assumption: null,
      graph: edit((_g, n) => withProps(n, { replicas: oneMore })),
      effort: 1,
    });
  const doubled = Math.min(replicas * 2, BOUNDS.replicas);
  if (replicas >= 2 && doubled > oneMore)
    out.push({
      id: `${limiter.id}:replicas:${doubled}`,
      kind: "replicas",
      title: `Double the copies of ${name} (${count(replicas)} to ${count(doubled)})`,
      detail: "Twice as many copies share the load.",
      assumption: null,
      graph: edit((_g, n) => withProps(n, { replicas: doubled })),
      effort: 3,
    });
  const capacity = props.capacity ?? CATALOG[limiter.type].capacity;
  if (Number.isFinite(capacity) && capacity * 2 <= 1e9)
    out.push({
      id: `${limiter.id}:capacity:${capacity * 2}`,
      kind: "capacity",
      title: `Use a bigger size for ${name} (${count(capacity)} to ${count(capacity * 2)} requests per second each)`,
      detail: "Each copy can take twice the requests before it is full.",
      assumption: "Assumes a size with twice the capacity exists and that latency stays the same.",
      graph: edit((_g, n) => withProps(n, { capacity: capacity * 2 })),
      effort: 2,
    });

  if (limiter.type === "db") {
    const feeders = graph.edges
      .filter((e) => e.to === limiter.id)
      .map((e) => graph.nodes.find((n) => n.id === e.from))
      .filter((n): n is GraphNode => !!n && (n.type === "app" || n.type === "worker"));
    if (!graph.nodes.some((n) => n.type === "cache") && traffic.readRatio >= 0.3 && feeders.length)
      out.push({
        id: `${limiter.id}:cache`,
        kind: "cache",
        title: `Add a cache in front of ${name}`,
        detail: "Repeated reads are answered from memory instead of reaching the database.",
        assumption: `Assumes the cache answers ${Math.round(CACHE_HIT_RATIO * 100)}% of reads.`,
        graph: edit((g) => {
          const id = nextId(g, "n");
          const spot = freeSpot(g, feeders[0].x + 240, feeders[0].y - 110);
          g.nodes.push({ id, type: "cache", label: "Cache", ...spot, props: { hitRatio: CACHE_HIT_RATIO, ...regionOf(feeders[0]) } } as GraphNode);
          for (const f of feeders) g.edges.push({ id: nextId(g, "e"), from: f.id, to: id });
        }),
        effort: 4,
      });
    const replicasNow = labelCount(graph, "replica");
    if (traffic.readRatio >= 0.5 && replicasNow < MAX_READ_REPLICAS)
      out.push({
        id: `${limiter.id}:readReplica:${replicasNow + 1}`,
        kind: "readReplica",
        title: `Add a read replica to ${name}`,
        detail: "Reads can be answered by the copy, leaving the primary for writes.",
        assumption: "Assumes reads can be served slightly behind the primary.",
        graph: edit((g, n) => {
          const id = nextId(g, "n");
          const spot = freeSpot(g, n.x + 240, n.y);
          g.nodes.push({ id, type: "replica", label: "Read replica" + (replicasNow ? " " + (replicasNow + 1) : ""), ...spot, props: { ...regionOf(n) } } as GraphNode);
          g.edges.push({ id: nextId(g, "e"), from: n.id, to: id });
        }),
        effort: 5,
      });
  }
  return out.slice(0, MAX_CANDIDATES);
}

/** What the engine reported for one graph: the three numbers a person compares, and how full the busiest component is. */
export interface Measure {
  verdict: "pass" | "strained" | "fail";
  p95: number;
  errorRate: number;
  maxRho: number;
}
const RANK = { pass: 0, strained: 1, fail: 2 } as const;

/**
 * A fix counts only if it makes the design better and nothing worse: the verdict is no worse, p95 and the error rate are no worse,
 * and at least one of the three is better. A fix that trades one metric for another is not offered.
 */
export function improves(before: Measure, after: Measure): boolean {
  if (RANK[after.verdict] > RANK[before.verdict]) return false;
  if (after.p95 > before.p95 * 1.001 + 1e-9) return false;
  if (after.errorRate > before.errorRate + 1e-9) return false;
  return RANK[after.verdict] < RANK[before.verdict] || after.p95 < before.p95 * 0.99 || after.errorRate < before.errorRate - 0.0005;
}

/** Best first: a better verdict, then fewer errors, then lower p95, then the lighter fix. Stable for equal fixes. */
export function rank<T extends { after: Measure; effort: number; id: string }>(items: readonly T[]): T[] {
  return [...items].sort(
    (a, b) =>
      RANK[a.after.verdict] - RANK[b.after.verdict] ||
      Math.round(a.after.errorRate * 10_000) - Math.round(b.after.errorRate * 10_000) ||
      a.after.p95 - b.after.p95 ||
      a.effort - b.effort ||
      a.id.localeCompare(b.id),
  );
}
