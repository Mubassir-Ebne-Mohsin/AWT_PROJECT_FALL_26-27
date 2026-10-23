import type {
  Design,
  Traffic,
  Region,
  Topology,
  Kind,
  Propagation,
  Model,
  Component,
  QueueMetric,
  Simulation,
  InvalidSimulation,
  NodeMetric,
  NamedPath,
  EngineOptions,
} from "@/modules/simulation/engine/types";
import { dict } from "@/modules/simulation/engine/types";
import {
  TIMEOUT_MS,
  STATUS,
  BURST_SECONDS,
  normTraffic,
  propsOf,
  num,
  capacityOf,
  regionOf,
  rtt,
  statusOf,
} from "@/modules/simulation/engine/catalog";
import { graph, topoOrder, validate } from "@/modules/simulation/engine/graph";
import { routingTables, propagate } from "@/modules/simulation/engine/routing";
import {
  nodeModel,
  makeWalker,
  toLogn,
  quantile,
  phi,
} from "@/modules/simulation/engine/distributions";
import { WorkBudget } from "@/modules/simulation/engine/budget";
export function queueStats(
  design: Design,
  g: Topology,
  P: Propagation,
  traffic: Traffic,
): QueueMetric[] {
  const D = traffic.durationMin * 60;
  return design.nodes
    .filter((n) => n.type === "queue")
    .map((q) => {
      const l = P.L[q.id],
        s = P.st[q.id].s;
      const arrival = (l.w + l.a) * s,
        peakArrival = (l.w * P.B + l.a) * s;
      const workers = g.out[q.id]
        .map((id) => g.byId[id])
        .filter((k) => k.type === "worker");
      const drain = workers.reduce((t, w) => t + capacityOf(w), 0);
      const maxDepth = num(propsOf(q).maxDepth, 500000);
      let backlog = 0,
        lag = 0,
        overflow = 0,
        state: QueueMetric["state"] = "clear";
      if (!(arrival > 0)) state = "idle";
      else if (drain < arrival) {
        backlog = (arrival - drain) * D;
        lag = drain > 0 ? backlog / drain : Infinity;
        state = "growing";
        overflow = Math.max(0, backlog - maxDepth) / (arrival * D);
      } else if (drain < peakArrival) {
        backlog = (peakArrival - drain) * BURST_SECONDS;
        lag = backlog / drain;
        state = "absorbing";
      }
      return {
        id: q.id,
        label: q.label,
        arrival,
        peakArrival,
        drain,
        backlog,
        lag,
        overflow: Math.min(1, overflow),
        maxDepth,
        state,
        syncShare: 0,
      };
    });
}

/* ---------- 1.11 simulate() — one steady-state test at a given load ---------- */
export function simulate(
  design: Design,
  trafficIn?: Traffic,
  opts: EngineOptions = {},
): Simulation | InvalidSimulation {
  opts = opts || {};
  const traffic = normTraffic(trafficIn || design.traffic);
  const R = opts.rps !== undefined ? Math.max(0, opts.rps) : traffic.rps;
  const shedding = opts.shedding !== false;
  const validation = validate(design);
  if (!validation.ok) return { ok: false, validation, rps: R, traffic };
  const g = graph(design);
  const order = topoOrder(design.nodes, g.out, g.inn);
  const tables = routingTables(design, g);
  const P = propagate(design, g, tables, order, traffic, R, shedding);
  const model = dict<Model>();
  design.nodes.forEach((n) => {
    model[n.id] = nodeModel(n, P.st[n.id]);
  });

  // Request mixture across clients and request kinds
  const clients = design.nodes.filter((n) => n.type === "client");
  const shareTot =
    clients.reduce((s, c) => s + Math.max(0, num(propsOf(c).share, 1)), 0) || 1;
  const walk = makeWalker(
    g,
    tables,
    model,
    false,
    opts.budget ?? new WorkBudget(),
  );
  const rawComps: Omit<Component, "seq">[] = [];
  clients.forEach((c) => {
    const sh = Math.max(0, num(propsOf(c).share, 1)) / shareTot;
    (
      [
        ["r", traffic.readRatio],
        ["w", 1 - traffic.readRatio],
      ] as [Kind, number][]
    ).forEach(([kind, kp]) => {
      if (kp <= 0) return;
      walk(c.id, kind, null).forEach((o) =>
        rawComps.push({ p: sh * kp * o.p, m: o.m, v: o.v, ok: o.ok }),
      );
    });
  });
  const ptot = rawComps.reduce((s, c) => s + c.p, 0) || 1;
  const comps = rawComps.map((c) =>
    toLogn(Object.assign({}, c, { p: c.p / ptot })),
  );
  const mean = comps.length
    ? comps.reduce((s, c) => s + c.p * Math.exp(c.mu + (c.s * c.s) / 2), 0)
    : 0;
  const p50 = comps.length ? quantile(comps, 0.5) : 0;
  const p95 = comps.length ? quantile(comps, 0.95) : 0;
  const p99 = comps.length ? quantile(comps, 0.99) : 0;
  let okWithinTimeout = 0;
  comps.forEach((c) => {
    okWithinTimeout += c.p * c.ok * phi((Math.log(TIMEOUT_MS) - c.mu) / c.s);
  });
  let errorRate = 1 - okWithinTimeout;
  const queues = queueStats(design, g, P, traffic);
  queues.forEach((q) => {
    q.syncShare = R > 0 ? P.L[q.id].w / R : 0;
    errorRate += q.syncShare * q.overflow;
  });
  errorRate = Math.max(0, Math.min(1, errorRate));

  // Effective region: a CDN edge sits next to whoever calls it.
  const eff = dict<Region>();
  order.forEach((id) => {
    const n = g.byId[id];
    if (n.type === "cdn") {
      const par = g.inn[id][0];
      eff[id] = par ? eff[par] : "us-east";
    } else eff[id] = regionOf(n, null);
  });

  // Per-component summary
  const nodes: NodeMetric[] = design.nodes.map((n) => {
    const s = P.st[n.id],
      m = model[n.id],
      l = s.load;
    const visit = R > 0 ? (l.r + l.w) / R : 0;
    const status = n.type === "client" ? "idle" : statusOf(s.rho, s.peak);
    return {
      id: n.id,
      type: n.type,
      label: n.label,
      region: eff[n.id],
      reads: l.r,
      writes: l.w,
      async: l.a,
      peak: s.peak,
      cap: s.cap,
      rho: s.rho,
      status,
      background: n.type !== "client" && l.r + l.w === 0 && l.a > 0,
      T: m.T,
      S: m.S,
      Wq: m.Wq,
      servers: n.type === "client" ? null : m.c,
      errors: n.type === "replica" && l.w > 0 ? Math.max(m.e, 1) : m.e,
      visit,
      contribution: visit * m.T,
      satRps: s.rho > 0 ? R / s.rho : Infinity,
    };
  });
  // The bottleneck is the busiest component on the request path. Background-only
  // components (behind a queue) only count when nothing on the request path is busy.
  const byRho = (a: NodeMetric, b: NodeMetric) => b.rho - a.rho;
  const live = nodes.filter((n) => n.type !== "client" && n.peak > 0);
  const syncTop = live.filter((n) => !n.background).sort(byRho)[0] || null;
  const bgTop = live.filter((n) => n.background).sort(byRho)[0] || null;
  const bottleneck =
    syncTop && syncTop.rho >= 0.5
      ? syncTop
      : bgTop && bgTop.rho >= 1
        ? bgTop
        : null;
  const maxRho = live.reduce((m, n) => Math.max(m, n.rho), 0);
  const backgroundIssues = live
    .filter((n) => n.background && n.rho >= 1)
    .map((n) => ({
      id: n.id,
      label: n.label,
      rho: n.rho,
      dropped: 1 - 1 / n.rho,
    }));
  const sloMet = p95 <= traffic.sloP95 && errorRate <= traffic.errorBudget;
  let verdict: Simulation["verdict"] = "pass";
  if (!sloMet) verdict = "fail";
  else if (
    maxRho >= STATUS.ok ||
    p95 > traffic.sloP95 * 0.8 ||
    queues.some((q) => q.state === "growing")
  )
    verdict = "strained";

  // Edges that cross regions and carry traffic
  const crossRegion: Simulation["crossRegion"] = [];
  (design.edges || []).forEach((e) => {
    const a = g.byId[e.from],
      b = g.byId[e.to];
    if (!a || !b || b.type === "cdn") return;
    const ra = eff[e.from],
      rb = eff[e.to];
    if (ra !== rb && (P.F[e.from + ">" + e.to] || 0) > 0)
      crossRegion.push({
        from: e.from,
        to: e.to,
        fromRegion: ra,
        toRegion: rb,
        rtt: rtt(ra, rb),
        flow: P.F[e.from + ">" + e.to],
      });
  });

  return {
    ok: true,
    validation,
    traffic,
    rps: R,
    peakRps: R * traffic.burst,
    p50,
    p95,
    p99,
    mean,
    errorRate,
    throughput: R * (1 - errorRate),
    sloMet,
    verdict,
    nodes,
    byId: nodes.reduce((acc, n) => {
      acc[n.id] = n;
      return acc;
    }, dict<NodeMetric>()),
    bottleneck,
    maxRho,
    queues,
    backgroundIssues,
    flows: P.F,
    crossRegion,
  };
}

/* ---------- 1.12 Named request paths (for "how requests travel") ---------- */
export function paths(
  design: Design,
  trafficIn?: Traffic,
  opts: EngineOptions = {},
): NamedPath[] {
  opts = opts || {};
  const traffic = normTraffic(trafficIn || design.traffic);
  const v = validate(design);
  if (!v.ok) return [];
  const R = opts.rps !== undefined ? opts.rps : traffic.rps;
  const g = graph(design);
  const order = topoOrder(design.nodes, g.out, g.inn);
  const tables = routingTables(design, g);
  const P = propagate(design, g, tables, order, traffic, R, true);
  const model = dict<Model>();
  design.nodes.forEach((n) => {
    model[n.id] = nodeModel(n, P.st[n.id]);
  });
  const walk = makeWalker(
    g,
    tables,
    model,
    true,
    opts.budget ?? new WorkBudget(),
  );
  const clients = design.nodes.filter((n) => n.type === "client");
  const shareTot =
    clients.reduce((s, c) => s + Math.max(0, num(propsOf(c).share, 1)), 0) || 1;
  const out: NamedPath[] = [];
  clients.forEach((c) => {
    const sh = Math.max(0, num(propsOf(c).share, 1)) / shareTot;
    (
      [
        ["r", traffic.readRatio, "Read"],
        ["w", 1 - traffic.readRatio, "Write"],
      ] as [Kind, number, "Read" | "Write"][]
    ).forEach(([kind, kp, kindLabel]) => {
      if (kp <= 0) return;
      walk(c.id, kind, null).forEach((o) =>
        out.push({
          kind: kindLabel,
          p: sh * kp * o.p,
          mean: o.m,
          p95: Math.exp(toLogn(o).mu + 1.645 * toLogn(o).s),
          ok: o.ok,
          seq: o.seq!,
        }),
      );
    });
  });
  // merge identical sequences
  const merged = new Map<string, NamedPath>();
  out.forEach((o) => {
    const key = o.kind + ":" + o.seq.map((x) => x.id).join(">");
    const cur = merged.get(key);
    if (!cur) merged.set(key, Object.assign({}, o));
    else {
      const p = cur.p + o.p;
      cur.mean = (cur.mean * cur.p + o.mean * o.p) / p;
      cur.p95 = Math.max(cur.p95, o.p95);
      cur.p = p;
    }
  });
  return Array.from(merged.values())
    .sort((a, b) => b.p - a.p)
    .slice(0, opts.limit || 6)
    .map((o) =>
      Object.assign(o, {
        steps: o.seq.map((x) => ({
          id: x.id,
          label: g.byId[x.id].label,
          type: g.byId[x.id].type,
          hop: x.hop,
          T: model[x.id].T,
        })),
      }),
    );
}
