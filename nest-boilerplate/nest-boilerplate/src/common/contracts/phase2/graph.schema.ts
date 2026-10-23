import { z } from "zod";

export const SCHEMA_VERSION = 1;
export const MODEL_VERSION = "reference-port-v1";
export const BOUNDS = { nodes: 50, edges: 200, importBytes: 65536, replicas: 200 } as const;
export const componentType = z.enum(["client", "cdn", "lb", "gateway", "app", "worker", "cache", "db", "replica", "queue", "storage", "external"]);
export const region = z.enum(["us-east", "eu-west", "ap-south"]);
export const templateId = z.enum(["three-tier", "content", "ingest", "checkout", "mvp", "media"]);

// IDs also appear in source flow keys; delimiters and prototype-property names are unsafe.
const reserved = Object.getOwnPropertyNames(Object.prototype).concat(["prototype"]);
export const localId = z.string().min(1).max(64).regex(/^[A-Za-z][A-Za-z0-9_-]*$/)
  .refine(id => !reserved.includes(id), "Reserved identifier");
export const coordinate = z.number().min(-100000).max(100000);
const ratio = z.number().min(0).max(1);
const ordinaryProps = {
  replicas: z.number().int().min(1).max(BOUNDS.replicas).optional(),
  capacity: z.number().positive().max(1e9).optional(),
  latency: z.number().min(0).max(60000).optional(),
  region: region.optional(),
};
const common = { id: localId, label: z.string().trim().min(1).max(80), x: coordinate, y: coordinate };
function node<T extends z.infer<typeof componentType>, P extends z.ZodRawShape>(type: T, props: P) {
  return z.strictObject({ ...common, type: z.literal(type), props: z.strictObject(props) });
}
const plain = <T extends z.infer<typeof componentType>>(type: T) => node(type, ordinaryProps);
export const graphNode = z.discriminatedUnion("type", [
  node("client", { region: region.optional(), share: z.number().min(0).max(1e6).optional() }),
  node("cdn", { replicas: ordinaryProps.replicas, capacity: ordinaryProps.capacity, latency: ordinaryProps.latency, hitRatio: ratio.optional() }),
  plain("lb"), plain("gateway"), plain("app"), plain("worker"),
  node("cache", { ...ordinaryProps, hitRatio: ratio.optional() }),
  plain("db"), plain("replica"),
  node("queue", { ...ordinaryProps, maxDepth: z.number().int().min(1).max(1e9).optional() }),
  node("storage", { ...ordinaryProps, share: ratio.optional() }),
  node("external", { ...ordinaryProps, share: ratio.optional() }),
]);
export const graphEdge = z.strictObject({ id: localId, from: localId, to: localId });
const graphShape = { nodes: z.array(graphNode).max(BOUNDS.nodes), edges: z.array(graphEdge).max(BOUNDS.edges) };

type Topology = { nodes: { id: string }[]; edges: { id?: string; from: string; to: string }[] };
function safeTopology(graph: Topology, ctx: z.RefinementCtx) {
  const nodeIds = new Set<string>(), allIds = new Set<string>(), pairs = new Set<string>();
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
  graph.nodes.forEach((n, i) => {
    if (allIds.has(n.id)) issue(["nodes", i, "id"], "Duplicate identifier");
    nodeIds.add(n.id); allIds.add(n.id);
  });
  graph.edges.forEach((e, i) => {
    if (e.id && allIds.has(e.id)) issue(["edges", i, "id"], "Duplicate identifier");
    if (e.id) allIds.add(e.id);
    if (!nodeIds.has(e.from)) issue(["edges", i, "from"], "Unknown source node");
    if (!nodeIds.has(e.to)) issue(["edges", i, "to"], "Unknown target node");
    if (e.from === e.to) issue(["edges", i], "Self edges are not supported");
    const pair = e.from + ">" + e.to;
    if (pairs.has(pair)) issue(["edges", i], "Duplicate directed edge");
    pairs.add(pair);
  });
}
export const graphSchema = z.strictObject(graphShape).superRefine(safeTopology);

export const trafficSchema = z.strictObject({
  preset: z.enum(["custom", "steady", "evening", "flash", "launch", "ingest"]),
  rps: z.number().min(0).max(1e7),
  burst: z.number().min(1).max(100),
  readRatio: ratio,
  sloP95: z.number().min(1).max(60000),
  errorBudget: ratio,
  durationMin: z.number().min(1).max(1440),
  shape: z.enum(["steady", "ramp", "spike"]),
});
export const TRAFFIC_DEFAULTS: z.infer<typeof trafficSchema> = {
  preset: "custom", rps: 500, burst: 1.5, readRatio: 0.8, sloP95: 300,
  errorBudget: 0.01, durationMin: 10, shape: "steady",
};
export const snapshotSchema = z.strictObject({
  schemaVersion: z.literal(SCHEMA_VERSION), graph: graphSchema, traffic: trafficSchema,
});

// Import is a boundary format, not a stored graph. M2 supplies omitted labels/props,
// deterministic positions and collision-free edge ids before graphSchema validation.
const importOptions = graphNode.options.map(n => n.extend({
  label: common.label.optional(), x: coordinate.optional(), y: coordinate.optional(),
  props: n.shape.props.optional(),
}));
const importNode = z.union([importOptions[0], importOptions[1], ...importOptions.slice(2)]);
const importShape = {
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().max(2000).optional(),
  nodes: z.array(importNode).max(BOUNDS.nodes),
  edges: z.array(graphEdge.extend({ id: localId.optional() })).max(BOUNDS.edges).optional(),
  traffic: trafficSchema.partial().optional(),
};
export const importSchema = z.union([
  z.strictObject({ ...importShape, schemaVersion: z.literal(1) }),
  z.strictObject(importShape),
]).superRefine((value, ctx) => safeTopology({ ...value, edges: value.edges ?? [] } as Topology, ctx));
// Missing edges are equivalent to []; byte limits must be checked on raw UTF-8 text.
export type Graph = z.infer<typeof graphSchema>;
export type Traffic = z.infer<typeof trafficSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
