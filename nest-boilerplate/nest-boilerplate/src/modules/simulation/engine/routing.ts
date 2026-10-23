import type {
  EngineNode,
  Design,
  Traffic,
  NodeType,
  Topology,
  Kind,
  Tables,
  Load,
  NodeState,
} from "@/modules/simulation/engine/types";
import { dict } from "@/modules/simulation/engine/types";
import {
  capacityOf,
  propsOf,
  clamp01,
  num,
  CATALOG,
  REPLICATION_COST,
} from "@/modules/simulation/engine/catalog";
export function weightOf(n: EngineNode) {
  const c = capacityOf(n);
  return c === Infinity ? 1e9 : Math.max(c, 1e-9);
}
export function split(list: EngineNode[], p = 1) {
  const tot = list.reduce((s, n) => s + weightOf(n), 0);
  return list.map((n) => ({ to: n.id, p: (p * weightOf(n)) / tot }));
}
export function uniq(list: EngineNode[]) {
  const s = new Set();
  return list.filter((n) => (s.has(n.id) ? false : (s.add(n.id), true)));
}
export function routingTables(design: Design, g: Topology) {
  const T = dict<Record<Kind, { to: string; p: number }[][]>>();
  (design.nodes || []).forEach((n) => {
    const kids = g.out[n.id].map((id) => g.byId[id]);
    const of = (...ts: NodeType[]) => kids.filter((k) => ts.includes(k.type));
    const t: Tables[string] = { r: [], w: [], a: [] };
    const P = propsOf(n);
    const readPoolFrom = (primaries: EngineNode[]) =>
      uniq(
        primaries.concat(
          of("replica"),
          primaries.reduce(
            (acc, d) =>
              acc.concat(
                g.out[d.id]
                  .map((id) => g.byId[id])
                  .filter((k) => k.type === "replica"),
              ),
            [] as EngineNode[],
          ),
        ),
      );
    switch (n.type) {
      case "client":
        if (kids.length) {
          t.r.push(split(kids));
          t.w.push(split(kids));
        }
        break;
      case "cdn":
        if (kids.length) {
          t.r.push(split(kids, 1 - clamp01(P.hitRatio)));
          t.w.push(split(kids));
        }
        break;
      case "lb":
      case "gateway":
        if (kids.length) {
          t.r.push(split(kids));
          t.w.push(split(kids));
          t.a.push(split(kids));
        }
        break;
      case "app":
      case "worker": {
        const compute = of("lb", "gateway", "app");
        const caches = of("cache"),
          ext = of("external"),
          sto = of("storage"),
          queues = of("queue");
        const primaries = of("db");
        const pool = readPoolFrom(primaries);
        const replicasOnly = pool.filter((x) => x.type === "replica");
        if (compute.length) {
          t.r.push(split(compute));
          t.w.push(split(compute));
          t.a.push(split(compute));
        }
        ext.forEach((x) => {
          const s = clamp01(propsOf(x).share);
          t.r.push([{ to: x.id, p: s }]);
          t.w.push([{ to: x.id, p: s }]);
          t.a.push([{ to: x.id, p: s }]);
        });
        sto.forEach((x) => {
          t.r.push([{ to: x.id, p: clamp01(propsOf(x).share) }]);
        });
        if (caches.length) {
          const cs = split(caches);
          t.r.push(cs);
          let miss = 0;
          cs.forEach((c) => {
            const cn = g.byId[c.to];
            const cacheHasStore = g.out[cn.id].some(
              (k) => ["db", "replica"].indexOf(g.byId[k].type) !== -1,
            );
            if (!cacheHasStore)
              miss += c.p * (1 - clamp01(propsOf(cn).hitRatio));
          });
          if (miss > 0 && pool.length) t.r.push(split(pool, miss));
        } else if (pool.length) t.r.push(split(pool));
        if (queues.length) t.w.push(split(queues));
        else if (primaries.length) t.w.push(split(primaries));
        else if (replicasOnly.length) t.w.push(split(replicasOnly));
        if (primaries.length) t.a.push(split(primaries));
        else if (queues.length) t.a.push(split(queues));
        break;
      }
      case "cache": {
        const pool = readPoolFrom(of("db"));
        if (pool.length) t.r.push(split(pool, 1 - clamp01(P.hitRatio)));
        break;
      }
      case "queue": {
        const workers = of("worker");
        if (workers.length) t.a.push(split(workers));
        break;
      }
      default:
        break; // db, replica, storage, external are leaves
    }
    T[n.id] = t;
  });
  return T;
}
export const leafKind = (tn: EngineNode, kind: Kind): Kind =>
  tn.type === "external" || tn.type === "storage" ? "r" : kind;

/* ---------- 1.6 Load propagation ---------- */
export function propagate(
  design: Design,
  g: Topology,
  tables: Tables,
  order: string[],
  traffic: Traffic,
  R: number,
  shedding: boolean,
) {
  const B = traffic.burst;
  const L = dict<Load>(),
    F = dict<number>();
  design.nodes.forEach((n) => {
    L[n.id] = { r: 0, w: 0, a: 0 };
  });
  const clients = design.nodes.filter((n) => n.type === "client");
  const shareTot =
    clients.reduce((s, c) => s + Math.max(0, num(propsOf(c).share, 1)), 0) || 1;
  clients.forEach((c) => {
    const sh = Math.max(0, num(propsOf(c).share, 1)) / shareTot;
    L[c.id].r = R * traffic.readRatio * sh;
    L[c.id].w = R * (1 - traffic.readRatio) * sh;
  });
  const st = dict<NodeState>();
  const flow = (from: string, to: string, amt: number) => {
    const k = from + ">" + to;
    F[k] = (F[k] || 0) + amt;
  };
  order.forEach((id) => {
    const n = g.byId[id],
      l = L[id];
    const cap = capacityOf(n);
    const peak = n.type === "queue" ? l.w * B + l.a : (l.r + l.w) * B + l.a;
    const rho =
      cap === Infinity ? 0 : cap > 0 ? peak / cap : peak > 0 ? Infinity : 0;
    const beh = CATALOG[n.type].behavior;
    const sheds =
      shedding &&
      rho > 1 &&
      (beh === "shed" || beh === "timeout" || beh === "reject");
    const s = sheds ? 1 / rho : 1;
    st[id] = { load: l, peak, cap, rho, s };
    const tb = tables[id];
    (["r", "w"] as const).forEach((kind) =>
      tb[kind].forEach((call) =>
        call.forEach(({ to, p }) => {
          const amt = l[kind] * p * s;
          if (amt <= 0) return;
          L[to][leafKind(g.byId[to], kind)] += amt;
          flow(id, to, amt * B);
        }),
      ),
    );
    if (n.type === "queue") {
      const inflow = (l.w + l.a) * s;
      tb.a.forEach((call) =>
        call.forEach(({ to, p }) => {
          L[to].a += inflow * p;
          flow(id, to, inflow * p);
        }),
      );
    } else {
      tb.a.forEach((call) =>
        call.forEach(({ to, p }) => {
          const amt = l.a * p * s;
          if (amt > 0) {
            L[to].a += amt;
            flow(id, to, amt);
          }
        }),
      );
    }
    if (n.type === "db") {
      g.out[id].forEach((k) => {
        if (g.byId[k].type !== "replica") return;
        const amt = (l.w + l.a) * s * REPLICATION_COST;
        L[k].a += amt;
        flow(id, k, amt);
      });
    }
  });
  return { L, st, F, B };
}
