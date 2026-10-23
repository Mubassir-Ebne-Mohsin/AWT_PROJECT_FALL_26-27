import type {
  EngineNode,
  Region,
  Topology,
  Kind,
  Tables,
  NodeState,
  Model,
  Component,
  Lognormal,
} from "@/modules/simulation/engine/types";
import {
  baseLatencyOf,
  serversOf,
  regionOf,
  rtt,
} from "@/modules/simulation/engine/catalog";
import { leafKind } from "@/modules/simulation/engine/routing";
import { WorkBudget } from "@/modules/simulation/engine/budget";
export function nodeModel(n: EngineNode, st: NodeState) {
  const S = baseLatencyOf(n),
    c = serversOf(n),
    rho = st.rho;
  let Wq = 0;
  if (n.type !== "client" && rho > 0 && S > 0) {
    const rc = Math.min(rho, 0.985);
    Wq = (S * Math.pow(rc, Math.sqrt(2 * (c + 1)) - 1)) / (c * (1 - rc));
    if (rho > 0.985) Wq += S * 25 * Math.min(1, (rho - 0.985) / 0.15); // past saturation: requests sit in a full queue
  }
  const T = S + Wq;
  const sd = Math.sqrt(Math.pow(0.35 * S, 2) + Math.pow(1.25 * Wq, 2));
  return { S, Wq, T, sd, c, e: 1 - st.s };
}

/* ---------- 1.8 Request path walk ---------- */
export function compress(list: Component[], max: number) {
  if (list.length <= max) return list;
  let lo = Infinity,
    hi = -Infinity;
  list.forEach((o) => {
    const v = Math.log(Math.max(0.1, o.m));
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  });
  hi += 1e-9;
  const buckets = new Map<
    number,
    { p: number; mp: number; m2: number; okp: number }
  >();
  list.forEach((o) => {
    const b = Math.floor(
      ((Math.log(Math.max(0.1, o.m)) - lo) / (hi - lo)) * (max - 1),
    );
    const cur = buckets.get(b);
    const m2 = (o.v + o.m * o.m) * o.p;
    if (!cur) buckets.set(b, { p: o.p, mp: o.m * o.p, m2, okp: o.ok * o.p });
    else {
      cur.p += o.p;
      cur.mp += o.m * o.p;
      cur.m2 += m2;
      cur.okp += o.ok * o.p;
    }
  });
  const res: Component[] = [];
  buckets.forEach((b) => {
    const m = b.mp / b.p;
    res.push({
      p: b.p,
      m,
      v: Math.max(0, b.m2 / b.p - m * m),
      ok: b.okp / b.p,
      seq: null,
    });
  });
  return res;
}
export function combine(
  A: Component[],
  Bd: Component[],
  keepSeq: boolean,
  budget: WorkBudget,
) {
  const res: Component[] = [];
  const minP = keepSeq ? 0.002 : 1e-7;
  for (const a of A)
    for (const b of Bd) {
      budget.pair();
      const p = a.p * b.p;
      if (p < minP) continue;
      budget.list(res.length + 1);
      res.push({
        p,
        m: a.m + b.m,
        v: a.v + b.v,
        ok: a.ok * b.ok,
        seq: keepSeq ? a.seq!.concat(b.seq!) : null,
      });
    }
  budget.list(res.length);
  return keepSeq ? res : compress(res, 90);
}
export function makeWalker(
  g: Topology,
  tables: Tables,
  model: Record<string, Model>,
  keepSeq: boolean,
  budget: WorkBudget,
) {
  const memo = new Map<string, Component[]>();
  function walk(
    id: string,
    kind: Kind,
    fromRegion: Region | null,
  ): Component[] {
    budget.walk();
    const key = id + "|" + kind + "|" + fromRegion;
    if (!keepSeq && memo.has(key)) return memo.get(key)!;
    const n = g.byId[id],
      reg = regionOf(n, fromRegion),
      m = model[id];
    const hop = fromRegion ? rtt(fromRegion, reg) : 0;
    const err = n.type === "replica" && kind === "w" ? 1 : m.e;
    let outs: Component[] = [
      {
        p: 1,
        m: m.T + hop,
        v: m.sd * m.sd + Math.pow(0.08 * hop, 2),
        ok: 1 - err,
        seq: keepSeq ? [{ id, hop }] : null,
      },
    ];
    (tables[id][kind] || []).forEach((call) => {
      const dist: Component[] = [];
      let pc = 0;
      call.forEach(({ to, p }) => {
        if (p <= 0) return;
        pc += p;
        walk(to, leafKind(g.byId[to], kind), reg).forEach((o) => {
          budget.list(dist.length + 1);
          dist.push({ p: p * o.p, m: o.m, v: o.v, ok: o.ok, seq: o.seq });
        });
      });
      if (pc < 1 - 1e-9)
        dist.push({ p: 1 - pc, m: 0, v: 0, ok: 1, seq: keepSeq ? [] : null });
      budget.list(dist.length);
      outs = combine(outs, dist, keepSeq, budget);
    });
    if (!keepSeq) memo.set(key, outs);
    return outs;
  }
  return walk;
}

/* ---------- 1.9 Lognormal mixture percentiles ---------- */
export function phi(z: number) {
  const x = Math.abs(z) / Math.SQRT2,
    t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-x * x);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}
export function toLogn(o: Pick<Component, "p" | "m" | "v" | "ok">) {
  const m = Math.max(o.m, 0.05);
  const s2 = Math.log(1 + Math.max(o.v, 1e-6) / (m * m));
  return {
    p: o.p,
    ok: o.ok,
    mu: Math.log(m) - s2 / 2,
    s: Math.sqrt(Math.max(s2, 1e-6)),
  };
}
export function cdf(comps: Lognormal[], x: number) {
  const lx = Math.log(x);
  let F = 0;
  for (const c of comps) F += c.p * phi((lx - c.mu) / c.s);
  return F;
}
export function quantile(comps: Lognormal[], q: number) {
  let lo = Math.log(0.05),
    hi = Math.log(1e7);
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    if (cdf(comps, Math.exp(mid)) < q) lo = mid;
    else hi = mid;
  }
  return Math.exp((lo + hi) / 2);
}
