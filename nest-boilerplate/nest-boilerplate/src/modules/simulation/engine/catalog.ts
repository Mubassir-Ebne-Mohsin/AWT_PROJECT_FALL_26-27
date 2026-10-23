import type {
  EngineNode,
  Design,
  Traffic,
  NodeType,
  Region,
  CatalogEntry,
  NodeMetric,
} from "@/modules/simulation/engine/types";
export const CATALOG: Record<NodeType, CatalogEntry> = {
  client: {
    label: "Clients",
    short: "Users",
    category: "Entry",
    capacity: Infinity,
    latency: 0,
    behavior: "none",
    blurb: "Where requests start. Its region is where your users are.",
  },
  cdn: {
    label: "CDN",
    short: "CDN",
    category: "Edge",
    capacity: 40000,
    latency: 12,
    behavior: "shed",
    defaults: { hitRatio: 0.6 },
    blurb: "Answers cacheable reads at an edge location near users.",
  },
  lb: {
    label: "Load balancer",
    short: "LB",
    category: "Routing",
    capacity: 20000,
    latency: 1,
    behavior: "shed",
    blurb: "Spreads requests across the servers behind it.",
  },
  gateway: {
    label: "API gateway",
    short: "Gateway",
    category: "Routing",
    capacity: 8000,
    latency: 3,
    behavior: "shed",
    blurb: "Auth, rate limits and routing in front of your services.",
  },
  app: {
    label: "App server",
    short: "App",
    category: "Compute",
    capacity: 600,
    latency: 22,
    behavior: "shed",
    blurb: "Runs your request handlers. Scale out with replicas.",
  },
  worker: {
    label: "Worker",
    short: "Worker",
    category: "Compute",
    capacity: 250,
    latency: 60,
    behavior: "backlog",
    blurb: "Pulls jobs from a queue and processes them in the background.",
  },
  cache: {
    label: "Cache",
    short: "Cache",
    category: "Data",
    capacity: 30000,
    latency: 1.2,
    behavior: "shed",
    defaults: { hitRatio: 0.8 },
    blurb:
      "In-memory store for hot reads. Misses fall through to the database.",
  },
  db: {
    label: "Database",
    short: "DB",
    category: "Data",
    capacity: 1800,
    latency: 6,
    behavior: "timeout",
    blurb: "Primary database. Takes every write and any reads sent to it.",
  },
  replica: {
    label: "Read replica",
    short: "Replica",
    category: "Data",
    capacity: 1800,
    latency: 6,
    behavior: "timeout",
    blurb:
      "Read-only copy of the primary. Takes reads and replays every write.",
  },
  queue: {
    label: "Queue",
    short: "Queue",
    category: "Async",
    capacity: 12000,
    latency: 2,
    behavior: "reject",
    defaults: { maxDepth: 500000 },
    blurb: "Accepts work now and hands it to workers at their own pace.",
  },
  storage: {
    label: "Object storage",
    short: "Storage",
    category: "Data",
    capacity: 3500,
    latency: 35,
    behavior: "shed",
    defaults: { share: 0.15 },
    blurb: "Files and media, S3-style. A share of reads fetch from it.",
  },
  external: {
    label: "Third-party API",
    short: "External",
    category: "External",
    capacity: 150,
    latency: 180,
    behavior: "shed",
    defaults: { share: 0.1 },
    blurb: "A service you call but do not run, such as payments or email.",
  },
};
export const TYPES = Object.keys(CATALOG);
export const REGIONS: Record<Region, string> = {
  "us-east": "US East",
  "eu-west": "EU West",
  "ap-south": "Asia South",
};
export const RTT: Record<string, number> = {
  "us-east|eu-west": 75,
  "us-east|ap-south": 190,
  "eu-west|ap-south": 115,
}; // round trip, ms
export const TIMEOUT_MS = 3000;
export const REPLICATION_COST = 0.25; // a replica spends 1/4 of a write's cost replaying it
export const BURST_SECONDS = 60; // bursts are modelled as one-minute spikes
export const STATUS = { ok: 0.75, fail: 1 }; // utilization thresholds: healthy < 75% <= warning < 100% <= failing

export const TRAFFIC_DEFAULTS: Traffic = {
  preset: "custom",
  rps: 500,
  burst: 1.5,
  readRatio: 0.8,
  sloP95: 300,
  errorBudget: 0.01,
  durationMin: 10,
  shape: "steady",
};
export const PRESETS = [
  {
    id: "steady",
    name: "Steady weekday",
    rps: 400,
    burst: 1.2,
    readRatio: 0.8,
    sloP95: 300,
    shape: "steady",
    note: "Normal working-hours load with small bumps.",
  },
  {
    id: "evening",
    name: "Evening peak",
    rps: 1200,
    burst: 1.5,
    readRatio: 0.85,
    sloP95: 300,
    shape: "steady",
    note: "The busiest hour of a normal day.",
  },
  {
    id: "flash",
    name: "Flash sale",
    rps: 1400,
    burst: 3,
    readRatio: 0.6,
    sloP95: 400,
    shape: "spike",
    note: "Short spikes at 3x while carts and orders surge.",
  },
  {
    id: "launch",
    name: "Launch day",
    rps: 5000,
    burst: 2,
    readRatio: 0.92,
    sloP95: 300,
    shape: "ramp",
    note: "Traffic climbs all day after a big announcement.",
  },
  {
    id: "ingest",
    name: "Write-heavy ingest",
    rps: 1500,
    burst: 1.3,
    readRatio: 0.15,
    sloP95: 250,
    shape: "steady",
    note: "Devices or logs pushing data in constantly.",
  },
];

/* ---------- 1.2 Small helpers ---------- */
export const num = (v: unknown, d: number) =>
  typeof v === "number" && isFinite(v) ? v : d;
export const clamp01 = (v: unknown) => Math.max(0, Math.min(1, num(v, 0)));
export function propsOf(n: EngineNode) {
  const t = CATALOG[n.type];
  return Object.assign({ replicas: 1 }, t.defaults || {}, n.props || {});
}
export function replicasOf(n: EngineNode) {
  return Math.max(1, Math.round(num(propsOf(n).replicas, 1)));
}
export function perReplicaCap(n: EngineNode) {
  const t = CATALOG[n.type];
  return t ? num(propsOf(n).capacity, t.capacity) : 0;
}
export function capacityOf(n: EngineNode) {
  const t = CATALOG[n.type];
  if (!t) return 0;
  if (t.capacity === Infinity) return Infinity;
  return perReplicaCap(n) * replicasOf(n);
}
export function baseLatencyOf(n: EngineNode) {
  const t = CATALOG[n.type];
  return t ? Math.max(0, num(propsOf(n).latency, t.latency)) : 0;
}
// Parallel servers for the M/M/c shape: capacity x service time, per replica.
export function serversOf(n: EngineNode) {
  if (n.type === "client") return 0; // no service pool; wire count is not applicable
  const per = Math.max(
    1,
    Math.round((perReplicaCap(n) * baseLatencyOf(n)) / 1000),
  );
  return per * replicasOf(n);
}
export function regionOf(n: EngineNode, from?: Region | null): Region {
  if (n.type === "cdn") return from || "us-east"; // the edge sits next to whoever called it
  return propsOf(n).region || "us-east";
}
export function rtt(a?: Region | null, b?: Region | null) {
  if (!a || !b || a === b) return 0;
  return RTT[a + "|" + b] || RTT[b + "|" + a] || 120;
}
export function statusOf(rho: number, load: number): NodeMetric["status"] {
  if (!(load > 0)) return "idle";
  if (rho >= STATUS.fail) return "fail";
  if (rho >= STATUS.ok) return "warn";
  return "ok";
}
export function normTraffic(t?: Partial<Traffic>) {
  const x = Object.assign({}, TRAFFIC_DEFAULTS, t || {});
  x.rps = Math.max(0, num(x.rps, 500));
  x.burst = Math.max(1, num(x.burst, 1.5));
  x.readRatio = clamp01(x.readRatio);
  x.sloP95 = Math.max(1, num(x.sloP95, 300));
  x.errorBudget = Math.max(0, num(x.errorBudget, 0.01));
  x.durationMin = Math.max(1, num(x.durationMin, 10));
  return x;
}
export function hashStr(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function designKey(design: Design, traffic?: Traffic) {
  const nodes = (design.nodes || []).map((n) => [
    n.id,
    n.type,
    n.label,
    n.props || {},
  ]);
  const edges = (design.edges || []).map((e) => [e.from, e.to]);
  return JSON.stringify([nodes, edges, traffic || design.traffic || {}]);
}
