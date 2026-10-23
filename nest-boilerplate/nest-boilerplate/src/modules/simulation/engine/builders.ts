import { CATALOG } from "@/modules/simulation/engine/catalog";
import type {
  EngineNode,
  Design,
  NodeProps,
  NodeType,
  Region,
} from "@/modules/simulation/engine/types";
import { dict } from "@/modules/simulation/engine/types";
export interface ExternalSpec {
  label: string;
  share?: number;
  capacity?: number;
}
export interface BuilderSpec {
  region?: Region;
  clientLabel?: string;
  cdn?: { hitRatio?: number };
  gateway?: boolean;
  lb?: boolean;
  appReplicas?: number;
  appLabel?: string;
  appProps?: NodeProps;
  cache?: { label?: string; hitRatio?: number };
  db?: boolean;
  dbLabel?: string;
  dbProps?: NodeProps;
  replicas?: number;
  queue?: {
    label?: string;
    workerLabel?: string;
    workers?: number;
    external?: ExternalSpec[];
  };
  external?: ExternalSpec[];
  storage?: { share?: number };
}
export const NODE_W = 184,
  NODE_H = 64;
export function clone(d: Design): Design {
  return JSON.parse(JSON.stringify(d));
}
export function nextId(design: Design, prefix = "n") {
  let max = 0;
  [...design.nodes, ...(design.edges || [])].forEach((x) => {
    const m = /(\d+)$/.exec(x.id || "");
    if (m) max = Math.max(max, +m[1]);
  });
  return (prefix || "n") + (max + 1);
}
export function addNode(
  design: Design,
  type: NodeType,
  x: number,
  y: number,
  extra: Partial<EngineNode> = {},
) {
  const id = nextId(design, "n");
  const sameType = design.nodes.filter((n) => n.type === type).length;
  const node = Object.assign(
    {
      id,
      type,
      label: CATALOG[type].label + (sameType ? " " + (sameType + 1) : ""),
      x: Math.round(x),
      y: Math.round(y),
      props: {},
    },
    extra || {},
  );
  design.nodes.push(node);
  return node;
}
export function addEdge(design: Design, from: string, to: string) {
  if (from === to || design.edges.some((e) => e.from === from && e.to === to))
    return null;
  const e = { id: nextId(design, "e"), from, to };
  design.edges.push(e);
  return e;
}
const TIER: Record<NodeType, number> = {
  client: 0,
  cdn: 1,
  lb: 2,
  gateway: 2,
  app: 3,
  cache: 4,
  queue: 4,
  external: 4,
  storage: 4,
  db: 5,
  worker: 5,
  replica: 6,
};
export function layout(design: Design) {
  const cols = dict<EngineNode[]>();
  design.nodes.forEach((n) => {
    const t = TIER[n.type];
    (cols[t] = cols[t] || []).push(n);
  });
  const tiers = Object.keys(cols)
    .map(Number)
    .sort((a, b) => a - b);
  tiers.forEach((t, i) => {
    const list = cols[t];
    const h = list.length * (NODE_H + 30) - 30;
    list.forEach((n, j) => {
      n.x = 40 + i * 240;
      n.y = Math.round(260 - h / 2 + j * (NODE_H + 30));
    });
  });
  return design;
}
export function buildFromSpec(spec: BuilderSpec) {
  const region: Region = spec.region || "us-east";
  const d: Design = { nodes: [], edges: [] };
  const reg: NodeProps = { region };
  const client = addNode(d, "client", 0, 0, {
    label: spec.clientLabel || "Users",
    props: { region },
  });
  let front = client;
  if (spec.cdn) {
    const c = addNode(d, "cdn", 0, 0, {
      props: {
        hitRatio: spec.cdn.hitRatio !== undefined ? spec.cdn.hitRatio : 0.6,
      },
    });
    addEdge(d, front.id, c.id);
    front = c;
  }
  if (spec.gateway) {
    const gw = addNode(d, "gateway", 0, 0, { props: Object.assign({}, reg) });
    addEdge(d, front.id, gw.id);
    front = gw;
  }
  if (spec.lb) {
    const lb = addNode(d, "lb", 0, 0, { props: Object.assign({}, reg) });
    addEdge(d, front.id, lb.id);
    front = lb;
  }
  const app = addNode(d, "app", 0, 0, {
    label: spec.appLabel || "App servers",
    props: Object.assign(
      { replicas: spec.appReplicas || 2 },
      reg,
      spec.appProps || {},
    ),
  });
  addEdge(d, front.id, app.id);
  let db: EngineNode | null = null;
  if (spec.cache) {
    const c = addNode(d, "cache", 0, 0, {
      label: spec.cache.label || "Cache",
      props: Object.assign(
        {
          hitRatio:
            spec.cache.hitRatio !== undefined ? spec.cache.hitRatio : 0.8,
        },
        reg,
      ),
    });
    addEdge(d, app.id, c.id);
  }
  if (spec.db !== false) {
    db = addNode(d, "db", 0, 0, {
      label: spec.dbLabel || "Database",
      props: Object.assign({}, reg, spec.dbProps || {}),
    });
  }
  if (spec.queue) {
    const q = addNode(d, "queue", 0, 0, {
      label: spec.queue.label || "Queue",
      props: Object.assign({}, reg),
    });
    const w = addNode(d, "worker", 0, 0, {
      label: spec.queue.workerLabel || "Workers",
      props: Object.assign({ replicas: spec.queue.workers || 2 }, reg),
    });
    addEdge(d, app.id, q.id);
    addEdge(d, q.id, w.id);
    if (db) addEdge(d, w.id, db.id);
    (spec.queue.external || []).forEach((x) => {
      const e = addNode(d, "external", 0, 0, {
        label: x.label,
        props: Object.assign(
          { share: x.share !== undefined ? x.share : 1 },
          reg,
          x.capacity ? { capacity: x.capacity } : {},
        ),
      });
      addEdge(d, w.id, e.id);
    });
  }
  if (db) {
    addEdge(d, app.id, db.id);
    for (let i = 0; i < (spec.replicas || 0); i++) {
      const r = addNode(d, "replica", 0, 0, {
        label: "Read replica" + (i ? " " + (i + 1) : ""),
        props: Object.assign({}, reg),
      });
      addEdge(d, db.id, r.id);
    }
  }
  (spec.external || []).forEach((x) => {
    const e = addNode(d, "external", 0, 0, {
      label: x.label,
      props: Object.assign(
        { share: x.share !== undefined ? x.share : 0.1 },
        reg,
        x.capacity ? { capacity: x.capacity } : {},
      ),
    });
    addEdge(d, app.id, e.id);
  });
  if (spec.storage) {
    const s = addNode(d, "storage", 0, 0, {
      props: Object.assign(
        { share: spec.storage.share !== undefined ? spec.storage.share : 0.15 },
        reg,
      ),
    });
    addEdge(d, app.id, s.id);
  }
  return layout(d);
}
