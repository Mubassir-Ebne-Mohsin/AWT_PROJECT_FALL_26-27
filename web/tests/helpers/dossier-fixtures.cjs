// Report documents for the PDF dossier tests. They have exactly the shape of the server's report (report.schema.ts), including the
// component `id` and the design `source`. Nothing here is computed: every figure is written out, so a test can find it in the PDF.
const NODE = (id, label, type, x, y, props = {}) => ({ id, label, type, x, y, props });

const THREE_TIER = {
  nodes: [
    NODE("n1", "Users", "client", 40, 228, { region: "us-east" }),
    NODE("n2", "Load balancer", "lb", 280, 228, { region: "us-east" }),
    NODE("n3", "App servers", "app", 520, 228, { replicas: 3, region: "us-east" }),
    NODE("n4", "Cache", "cache", 760, 120, { hitRatio: 0.8, region: "us-east" }),
    NODE("n5", "Database", "db", 760, 336, { region: "us-east" }),
    NODE("n6", "Read replica", "replica", 1000, 336, { region: "us-east" }),
  ],
  edges: [
    { id: "e1", from: "n1", to: "n2" },
    { id: "e2", from: "n2", to: "n3" },
    { id: "e3", from: "n3", to: "n4" },
    { id: "e4", from: "n3", to: "n5" },
    { id: "e5", from: "n5", to: "n6" },
  ],
};

const TRAFFIC = { preset: "custom", rps: 2000, burst: 1.5, readRatio: 0.8, sloP95: 300, errorBudget: 0.01, durationMin: 10, shape: "steady" };

const component = (n, over = {}) => ({ id: n.id, label: n.label, type: n.type, region: "us-east", peak: 100, rho: 0.4, status: "ok", errors: 0, ...over });

function simulation(graph, over = {}) {
  return {
    verdict: "fail",
    p50: 12.5,
    p95: 1842.07,
    p99: 2210.4,
    errorRate: 0.40918,
    throughput: 1181.64,
    sloMet: false,
    p95Target: 300,
    errorBudget: 0.01,
    bottleneck: { label: "App servers", type: "app", rho: 1.67 },
    components: graph.nodes.map((n) => component(n, n.id === "n3" ? { rho: 1.67, status: "fail", peak: 3000, errors: 0.4 } : n.id === "n5" ? { rho: 0.84, status: "warn" } : n.id === "n1" ? { rho: 0, status: "idle" } : {})),
    ...over,
  };
}

function report(over = {}) {
  const graph = over.graph ?? THREE_TIER;
  return {
    designId: "11111111-1111-4111-8111-111111111111",
    name: "Classic three-tier web app",
    description: "A load balancer, three app servers, a cache and a database with a read replica.",
    source: "template",
    revision: 4,
    isCurrentRevision: true,
    versionCreatedAt: "2026-11-03T10:15:00.000Z",
    generatedAt: "2026-11-04T08:30:00.000Z",
    graph,
    traffic: TRAFFIC,
    run: {
      id: "22222222-2222-4222-8222-222222222222",
      kind: "simulation",
      status: "completed",
      designRevision: 4,
      matchesRevision: true,
      engineVersion: "reference-port-v1",
      createdAt: "2026-11-03T10:20:00.000Z",
      traffic: TRAFFIC,
      simulation: simulation(graph),
      failure: null,
    },
    limits: null,
    noteScope: "all",
    notes: [
      { revision: 3, kind: "decision", text: "Keep the cache: reads dominate.", createdAt: "2026-11-03T10:00:00.000Z" },
      { revision: 4, kind: "assumption", text: "Peak traffic is 2,000 requests per second during sales.", createdAt: "2026-11-03T10:05:00.000Z" },
    ],
    limitations: ["These figures come from a queueing model, not from real servers.", "The model assumes steady arrival within each burst."],
    ...over,
  };
}

/** A grid of `count` components, wide enough that the diagram must shrink. */
function bigGraph(count, columns = 10) {
  const nodes = Array.from({ length: count }, (_, i) => NODE("g" + i, "Component " + i, i % 3 === 0 ? "app" : i % 3 === 1 ? "cache" : "db", (i % columns) * 240, Math.floor(i / columns) * 120, { region: "us-east" }));
  const edges = nodes.slice(1).map((n, i) => ({ id: "ge" + i, from: nodes[i].id, to: n.id }));
  return { nodes, edges };
}

const fake = (text, size) => text.length * size * 0.5;

module.exports = { report, simulation, component, THREE_TIER, TRAFFIC, bigGraph, NODE, fake };
