/* =====================================================================
   SECTION 1 — MOCK ENGINE   (window.MockEngine, window.MockAI)
   ---------------------------------------------------------------------
   Pure, deterministic functions. No DOM, no randomness except a seeded
   PRNG for chart jitter. In the real product this section becomes the
   NestJS backend:
     validate()      -> SimulationService.validate      POST /designs/:id/validate
     simulate()      -> SimulationService.run           POST /designs/:id/runs
     findLimits()    -> LimitsService.findBreakingPoint POST /designs/:id/limits
     timeline()      -> part of the run payload (per-interval metrics)
     suggest()       -> AiService.suggest (rules here; an LLM + validator later)
     MockAI.draft()  -> AiService.draftFromText
   Model: each component is an M/M/c queue. Load flows through the graph
   by request kind (read, write, async job). Latency per component uses
   Sakasegawa's M/M/c waiting-time approximation; request paths are
   combined as a lognormal mixture to get p50 / p95 / p99.
   ===================================================================== */
(function (root) {
  'use strict';

  /* ---------- 1.1 Component catalog ---------- */
  const CATALOG = {
    client:   { label: 'Clients',         short: 'Users',    category: 'Entry',    capacity: Infinity, latency: 0,   behavior: 'none',    blurb: 'Where requests start. Its region is where your users are.' },
    cdn:      { label: 'CDN',             short: 'CDN',      category: 'Edge',     capacity: 40000, latency: 12,  behavior: 'shed',    defaults: { hitRatio: 0.6 }, blurb: 'Answers cacheable reads at an edge location near users.' },
    lb:       { label: 'Load balancer',   short: 'LB',       category: 'Routing',  capacity: 20000, latency: 1,   behavior: 'shed',    blurb: 'Spreads requests across the servers behind it.' },
    gateway:  { label: 'API gateway',     short: 'Gateway',  category: 'Routing',  capacity: 8000,  latency: 3,   behavior: 'shed',    blurb: 'Auth, rate limits and routing in front of your services.' },
    app:      { label: 'App server',      short: 'App',      category: 'Compute',  capacity: 600,   latency: 22,  behavior: 'shed',    blurb: 'Runs your request handlers. Scale out with replicas.' },
    worker:   { label: 'Worker',          short: 'Worker',   category: 'Compute',  capacity: 250,   latency: 60,  behavior: 'backlog', blurb: 'Pulls jobs from a queue and processes them in the background.' },
    cache:    { label: 'Cache',           short: 'Cache',    category: 'Data',     capacity: 30000, latency: 1.2, behavior: 'shed',    defaults: { hitRatio: 0.8 }, blurb: 'In-memory store for hot reads. Misses fall through to the database.' },
    db:       { label: 'Database',        short: 'DB',       category: 'Data',     capacity: 1800,  latency: 6,   behavior: 'timeout', blurb: 'Primary database. Takes every write and any reads sent to it.' },
    replica:  { label: 'Read replica',    short: 'Replica',  category: 'Data',     capacity: 1800,  latency: 6,   behavior: 'timeout', blurb: 'Read-only copy of the primary. Takes reads and replays every write.' },
    queue:    { label: 'Queue',           short: 'Queue',    category: 'Async',    capacity: 12000, latency: 2,   behavior: 'reject',  defaults: { maxDepth: 500000 }, blurb: 'Accepts work now and hands it to workers at their own pace.' },
    storage:  { label: 'Object storage',  short: 'Storage',  category: 'Data',     capacity: 3500,  latency: 35,  behavior: 'shed',    defaults: { share: 0.15 }, blurb: 'Files and media, S3-style. A share of reads fetch from it.' },
    external: { label: 'Third-party API', short: 'External', category: 'External', capacity: 150,   latency: 180, behavior: 'shed',    defaults: { share: 0.1 }, blurb: 'A service you call but do not run, such as payments or email.' }
  };
  const TYPES = Object.keys(CATALOG);
  const REGIONS = { 'us-east': 'US East', 'eu-west': 'EU West', 'ap-south': 'Asia South' };
  const RTT = { 'us-east|eu-west': 75, 'us-east|ap-south': 190, 'eu-west|ap-south': 115 }; // round trip, ms
  const TIMEOUT_MS = 3000;
  const REPLICATION_COST = 0.25;   // a replica spends 1/4 of a write's cost replaying it
  const BURST_SECONDS = 60;        // bursts are modelled as one-minute spikes
  const STATUS = { ok: 0.75, fail: 1 }; // utilization thresholds: healthy < 75% <= warning < 100% <= failing

  const TRAFFIC_DEFAULTS = { preset: 'custom', rps: 500, burst: 1.5, readRatio: 0.8, sloP95: 300, errorBudget: 0.01, durationMin: 10, shape: 'steady' };
  const PRESETS = [
    { id: 'steady',  name: 'Steady weekday', rps: 400,  burst: 1.2, readRatio: 0.8,  sloP95: 300, shape: 'steady', note: 'Normal working-hours load with small bumps.' },
    { id: 'evening', name: 'Evening peak',   rps: 1200, burst: 1.5, readRatio: 0.85, sloP95: 300, shape: 'steady', note: 'The busiest hour of a normal day.' },
    { id: 'flash',   name: 'Flash sale',     rps: 1400, burst: 3,   readRatio: 0.6,  sloP95: 400, shape: 'spike',  note: 'Short spikes at 3x while carts and orders surge.' },
    { id: 'launch',  name: 'Launch day',     rps: 5000, burst: 2,   readRatio: 0.92, sloP95: 300, shape: 'ramp',   note: 'Traffic climbs all day after a big announcement.' },
    { id: 'ingest',  name: 'Write-heavy ingest', rps: 1500, burst: 1.3, readRatio: 0.15, sloP95: 250, shape: 'steady', note: 'Devices or logs pushing data in constantly.' }
  ];

  /* ---------- 1.2 Small helpers ---------- */
  const num = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : d;
  const clamp01 = (v) => Math.max(0, Math.min(1, num(v, 0)));
  function propsOf(n) {
    const t = CATALOG[n.type] || {};
    return Object.assign({ replicas: 1 }, t.defaults || {}, n.props || {});
  }
  function replicasOf(n) { return Math.max(1, Math.round(num(propsOf(n).replicas, 1))); }
  function perReplicaCap(n) { const t = CATALOG[n.type]; return t ? num(propsOf(n).capacity, t.capacity) : 0; }
  function capacityOf(n) {
    const t = CATALOG[n.type];
    if (!t) return 0;
    if (t.capacity === Infinity) return Infinity;
    return perReplicaCap(n) * replicasOf(n);
  }
  function baseLatencyOf(n) { const t = CATALOG[n.type]; return t ? Math.max(0, num(propsOf(n).latency, t.latency)) : 0; }
  // Parallel servers for the M/M/c shape: capacity x service time, per replica.
  function serversOf(n) {
    const per = Math.max(1, Math.round(perReplicaCap(n) * baseLatencyOf(n) / 1000));
    return per * replicasOf(n);
  }
  function regionOf(n, from) {
    if (n.type === 'cdn') return from || 'us-east';   // the edge sits next to whoever called it
    return propsOf(n).region || 'us-east';
  }
  function rtt(a, b) { if (!a || !b || a === b) return 0; return RTT[a + '|' + b] || RTT[b + '|' + a] || 120; }
  function statusOf(rho, load) {
    if (!(load > 0)) return 'idle';
    if (rho >= STATUS.fail) return 'fail';
    if (rho >= STATUS.ok) return 'warn';
    return 'ok';
  }
  function normTraffic(t) {
    const x = Object.assign({}, TRAFFIC_DEFAULTS, t || {});
    x.rps = Math.max(0, num(x.rps, 500));
    x.burst = Math.max(1, num(x.burst, 1.5));
    x.readRatio = clamp01(x.readRatio);
    x.sloP95 = Math.max(1, num(x.sloP95, 300));
    x.errorBudget = Math.max(0, num(x.errorBudget, 0.01));
    x.durationMin = Math.max(1, num(x.durationMin, 10));
    return x;
  }
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function designKey(design, traffic) {
    const nodes = (design.nodes || []).map(n => [n.id, n.type, n.label, n.props || {}]);
    const edges = (design.edges || []).map(e => [e.from, e.to]);
    return JSON.stringify([nodes, edges, traffic || design.traffic || {}]);
  }

  /* ---------- 1.3 Graph utilities ---------- */
  function graph(design) {
    const byId = {}, out = {}, inn = {};
    (design.nodes || []).forEach(n => { byId[n.id] = n; out[n.id] = []; inn[n.id] = []; });
    (design.edges || []).forEach(e => {
      if (!byId[e.from] || !byId[e.to] || e.from === e.to) return;
      if (out[e.from].indexOf(e.to) === -1) { out[e.from].push(e.to); inn[e.to].push(e.from); }
    });
    return { byId, out, inn };
  }
  function findCycle(nodes, out) {
    const color = {}, stack = [];
    let found = null;
    function dfs(id) {
      color[id] = 1; stack.push(id);
      for (const k of out[id]) {
        if (found) return;
        if (color[k] === 1) { found = stack.slice(stack.indexOf(k)); return; }
        if (!color[k]) dfs(k);
      }
      stack.pop(); color[id] = 2;
    }
    for (const n of nodes) { if (!found && !color[n.id]) dfs(n.id); }
    return found;
  }
  function topoOrder(nodes, out, inn) {
    const indeg = {}; nodes.forEach(n => { indeg[n.id] = inn[n.id].length; });
    const q = nodes.filter(n => indeg[n.id] === 0).map(n => n.id), order = [];
    while (q.length) { const id = q.shift(); order.push(id); out[id].forEach(k => { if (--indeg[k] === 0) q.push(k); }); }
    return order;
  }
  function issue(code, msg, fix, nodeIds, level) { return { code, msg, fix, nodeIds: nodeIds || [], level: level || 'error' }; }

  /* ---------- 1.4 Validation (the "simulation failed" cases) ---------- */
  function validate(design) {
    const errors = [], warnings = [];
    const nodes = design.nodes || [];
    if (!nodes.length) {
      errors.push(issue('EMPTY', 'The canvas is empty.', 'Add a Clients node and at least one server, then connect them.'));
      return { ok: false, errors, warnings };
    }
    const g = graph(design);
    nodes.forEach(n => { if (!CATALOG[n.type]) errors.push(issue('UNKNOWN_TYPE', '"' + n.type + '" is not a known component type.', 'Replace it with a component from the palette.', [n.id])); });
    const clients = nodes.filter(n => n.type === 'client');
    if (!clients.length) errors.push(issue('NO_ENTRY', 'There is no traffic entry.', 'Add a Clients node so requests have somewhere to start.'));
    clients.forEach(c => {
      if (!g.out[c.id].length) errors.push(issue('ENTRY_UNCONNECTED', c.label + ' is not connected to anything.', 'Draw an edge from it to your first server.', [c.id]));
      if (g.inn[c.id].length) errors.push(issue('EDGE_INTO_ENTRY', 'An edge points into ' + c.label + '.', 'Clients only send traffic. Delete the edge that ends at it.', [c.id].concat(g.inn[c.id])));
    });
    const cyc = findCycle(nodes, g.out);
    if (cyc) {
      const names = cyc.map(id => g.byId[id].label);
      errors.push(issue('CYCLE', 'Cycle found: ' + names.join(' → ') + ' → ' + names[0] + '.', 'Requests would loop forever. Delete one of these edges.', cyc));
    }
    if (!errors.length) {
      const seen = new Set(), st = clients.map(c => c.id);
      while (st.length) { const id = st.pop(); if (seen.has(id)) continue; seen.add(id); g.out[id].forEach(k => st.push(k)); }
      const orphans = nodes.filter(n => !seen.has(n.id));
      if (orphans.length) warnings.push(issue('UNREACHABLE', orphans.map(o => o.label).join(', ') + (orphans.length > 1 ? ' receive' : ' receives') + ' no traffic.', 'Connect ' + (orphans.length > 1 ? 'them' : 'it') + ' to the rest of the design, or delete ' + (orphans.length > 1 ? 'them.' : 'it.'), orphans.map(o => o.id), 'warning'));
      nodes.filter(n => n.type === 'queue').forEach(q => {
        if (!g.out[q.id].some(k => g.byId[k].type === 'worker')) warnings.push(issue('QUEUE_NO_CONSUMER', q.label + ' has no workers.', 'Messages pile up and are never processed. Connect a Worker to it.', [q.id], 'warning'));
      });
      nodes.filter(n => n.type === 'app').forEach(a => {
        const kids = g.out[a.id].map(k => g.byId[k].type);
        if (kids.indexOf('replica') !== -1 && kids.indexOf('db') === -1 && kids.indexOf('queue') === -1)
          warnings.push(issue('WRITES_TO_REPLICA', a.label + ' sends writes to a read replica.', 'Replicas are read-only and reject writes. Connect the primary Database too.', [a.id], 'warning'));
        else if (!kids.some(t => ['db', 'queue', 'app', 'lb', 'gateway', 'replica'].indexOf(t) !== -1))
          warnings.push(issue('NO_WRITE_TARGET', a.label + ' has nowhere to store writes.', 'The model treats writes as handled in memory. Connect a Database or a Queue.', [a.id], 'info'));
      });
    }
    return { ok: !errors.length, errors, warnings };
  }

  /* ---------- 1.5 Routing tables ----------
     For each node and request kind (r = read, w = write, a = async job),
     a list of sub-calls. Each sub-call is a distribution [{to, p}] with
     sum(p) <= 1; the remainder means "no call". Sub-calls run in series. */
  function weightOf(n) { const c = capacityOf(n); return c === Infinity ? 1e9 : Math.max(c, 1e-9); }
  function split(list, p) {
    if (p == null) p = 1;
    const tot = list.reduce((s, n) => s + weightOf(n), 0);
    return list.map(n => ({ to: n.id, p: p * weightOf(n) / tot }));
  }
  function uniq(list) { const s = new Set(); return list.filter(n => (s.has(n.id) ? false : (s.add(n.id), true))); }
  function routingTables(design, g) {
    const T = {};
    (design.nodes || []).forEach(n => {
      const kids = g.out[n.id].map(id => g.byId[id]);
      const of = function () { const ts = Array.prototype.slice.call(arguments); return kids.filter(k => ts.indexOf(k.type) !== -1); };
      const t = { r: [], w: [], a: [] };
      const P = propsOf(n);
      const readPoolFrom = (primaries) => uniq(primaries.concat(of('replica'), primaries.reduce((acc, d) => acc.concat(g.out[d.id].map(id => g.byId[id]).filter(k => k.type === 'replica')), [])));
      switch (n.type) {
        case 'client':
          if (kids.length) { t.r.push(split(kids)); t.w.push(split(kids)); }
          break;
        case 'cdn':
          if (kids.length) { t.r.push(split(kids, 1 - clamp01(P.hitRatio))); t.w.push(split(kids)); }
          break;
        case 'lb': case 'gateway':
          if (kids.length) { t.r.push(split(kids)); t.w.push(split(kids)); t.a.push(split(kids)); }
          break;
        case 'app': case 'worker': {
          const compute = of('lb', 'gateway', 'app');
          const caches = of('cache'), ext = of('external'), sto = of('storage'), queues = of('queue');
          const primaries = of('db');
          const pool = readPoolFrom(primaries);
          const replicasOnly = pool.filter(x => x.type === 'replica');
          if (compute.length) { t.r.push(split(compute)); t.w.push(split(compute)); t.a.push(split(compute)); }
          ext.forEach(x => { const s = clamp01(propsOf(x).share); t.r.push([{ to: x.id, p: s }]); t.w.push([{ to: x.id, p: s }]); t.a.push([{ to: x.id, p: s }]); });
          sto.forEach(x => { t.r.push([{ to: x.id, p: clamp01(propsOf(x).share) }]); });
          if (caches.length) {
            const cs = split(caches);
            t.r.push(cs);
            let miss = 0;
            cs.forEach(c => {
              const cn = g.byId[c.to];
              const cacheHasStore = g.out[cn.id].some(k => ['db', 'replica'].indexOf(g.byId[k].type) !== -1);
              if (!cacheHasStore) miss += c.p * (1 - clamp01(propsOf(cn).hitRatio));
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
        case 'cache': {
          const pool = readPoolFrom(of('db'));
          if (pool.length) t.r.push(split(pool, 1 - clamp01(P.hitRatio)));
          break;
        }
        case 'queue': {
          const workers = of('worker');
          if (workers.length) t.a.push(split(workers));
          break;
        }
        default: break; // db, replica, storage, external are leaves
      }
      T[n.id] = t;
    });
    return T;
  }
  const leafKind = (tn, kind) => (tn.type === 'external' || tn.type === 'storage') ? 'r' : kind;

  /* ---------- 1.6 Load propagation ---------- */
  function propagate(design, g, tables, order, traffic, R, shedding) {
    const B = traffic.burst;
    const L = {}, F = {};
    design.nodes.forEach(n => { L[n.id] = { r: 0, w: 0, a: 0 }; });
    const clients = design.nodes.filter(n => n.type === 'client');
    const shareTot = clients.reduce((s, c) => s + Math.max(0, num(propsOf(c).share, 1)), 0) || 1;
    clients.forEach(c => {
      const sh = Math.max(0, num(propsOf(c).share, 1)) / shareTot;
      L[c.id].r = R * traffic.readRatio * sh;
      L[c.id].w = R * (1 - traffic.readRatio) * sh;
    });
    const st = {};
    const flow = (from, to, amt) => { const k = from + '>' + to; F[k] = (F[k] || 0) + amt; };
    order.forEach(id => {
      const n = g.byId[id], l = L[id];
      const cap = capacityOf(n);
      const peak = n.type === 'queue' ? l.w * B + l.a : (l.r + l.w) * B + l.a;
      const rho = cap === Infinity ? 0 : (cap > 0 ? peak / cap : (peak > 0 ? Infinity : 0));
      const beh = CATALOG[n.type].behavior;
      const sheds = shedding && rho > 1 && (beh === 'shed' || beh === 'timeout' || beh === 'reject');
      const s = sheds ? 1 / rho : 1;
      st[id] = { load: l, peak, cap, rho, s };
      const tb = tables[id];
      ['r', 'w'].forEach(kind => tb[kind].forEach(call => call.forEach(({ to, p }) => {
        const amt = l[kind] * p * s;
        if (amt <= 0) return;
        L[to][leafKind(g.byId[to], kind)] += amt;
        flow(id, to, amt * B);
      })));
      if (n.type === 'queue') {
        const inflow = (l.w + l.a) * s;
        tb.a.forEach(call => call.forEach(({ to, p }) => { L[to].a += inflow * p; flow(id, to, inflow * p); }));
      } else {
        tb.a.forEach(call => call.forEach(({ to, p }) => { const amt = l.a * p * s; if (amt > 0) { L[to].a += amt; flow(id, to, amt); } }));
      }
      if (n.type === 'db') {
        g.out[id].forEach(k => {
          if (g.byId[k].type !== 'replica') return;
          const amt = (l.w + l.a) * s * REPLICATION_COST;
          L[k].a += amt; flow(id, k, amt);
        });
      }
    });
    return { L, st, F, B };
  }

  /* ---------- 1.7 Per-component latency (M/M/c, Sakasegawa) ---------- */
  function nodeModel(n, st) {
    const S = baseLatencyOf(n), c = serversOf(n), rho = st.rho;
    let Wq = 0;
    if (n.type !== 'client' && rho > 0 && S > 0) {
      const rc = Math.min(rho, 0.985);
      Wq = S * Math.pow(rc, Math.sqrt(2 * (c + 1)) - 1) / (c * (1 - rc));
      if (rho > 0.985) Wq += S * 25 * Math.min(1, (rho - 0.985) / 0.15); // past saturation: requests sit in a full queue
    }
    const T = S + Wq;
    const sd = Math.sqrt(Math.pow(0.35 * S, 2) + Math.pow(1.25 * Wq, 2));
    return { S, Wq, T, sd, c, e: 1 - st.s };
  }

  /* ---------- 1.8 Request path walk ---------- */
  function compress(list, max) {
    if (list.length <= max) return list;
    let lo = Infinity, hi = -Infinity;
    list.forEach(o => { const v = Math.log(Math.max(0.1, o.m)); if (v < lo) lo = v; if (v > hi) hi = v; });
    hi += 1e-9;
    const buckets = new Map();
    list.forEach(o => {
      const b = Math.floor((Math.log(Math.max(0.1, o.m)) - lo) / (hi - lo) * (max - 1));
      const cur = buckets.get(b);
      const m2 = (o.v + o.m * o.m) * o.p;
      if (!cur) buckets.set(b, { p: o.p, mp: o.m * o.p, m2, okp: o.ok * o.p });
      else { cur.p += o.p; cur.mp += o.m * o.p; cur.m2 += m2; cur.okp += o.ok * o.p; }
    });
    const res = [];
    buckets.forEach(b => { const m = b.mp / b.p; res.push({ p: b.p, m, v: Math.max(0, b.m2 / b.p - m * m), ok: b.okp / b.p, seq: null }); });
    return res;
  }
  function combine(A, Bd, keepSeq) {
    const res = [];
    const minP = keepSeq ? 0.002 : 1e-7;
    for (const a of A) for (const b of Bd) {
      const p = a.p * b.p;
      if (p < minP) continue;
      res.push({ p, m: a.m + b.m, v: a.v + b.v, ok: a.ok * b.ok, seq: keepSeq ? a.seq.concat(b.seq) : null });
    }
    return keepSeq ? res : compress(res, 90);
  }
  function makeWalker(g, tables, model, keepSeq) {
    const memo = new Map();
    function walk(id, kind, fromRegion) {
      const key = id + '|' + kind + '|' + fromRegion;
      if (!keepSeq && memo.has(key)) return memo.get(key);
      const n = g.byId[id], reg = regionOf(n, fromRegion), m = model[id];
      const hop = fromRegion ? rtt(fromRegion, reg) : 0;
      const err = (n.type === 'replica' && kind === 'w') ? 1 : m.e;
      let outs = [{ p: 1, m: m.T + hop, v: m.sd * m.sd + Math.pow(0.08 * hop, 2), ok: 1 - err, seq: keepSeq ? [{ id, hop }] : null }];
      (tables[id][kind] || []).forEach(call => {
        const dist = [];
        let pc = 0;
        call.forEach(({ to, p }) => {
          if (p <= 0) return;
          pc += p;
          walk(to, leafKind(g.byId[to], kind), reg).forEach(o => dist.push({ p: p * o.p, m: o.m, v: o.v, ok: o.ok, seq: o.seq }));
        });
        if (pc < 1 - 1e-9) dist.push({ p: 1 - pc, m: 0, v: 0, ok: 1, seq: keepSeq ? [] : null });
        outs = combine(outs, dist, keepSeq);
      });
      if (!keepSeq) memo.set(key, outs);
      return outs;
    }
    return walk;
  }

  /* ---------- 1.9 Lognormal mixture percentiles ---------- */
  function phi(z) {
    const x = Math.abs(z) / Math.SQRT2, t = 1 / (1 + 0.3275911 * x);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
  }
  function toLogn(o) {
    const m = Math.max(o.m, 0.05);
    const s2 = Math.log(1 + Math.max(o.v, 1e-6) / (m * m));
    return { p: o.p, ok: o.ok, mu: Math.log(m) - s2 / 2, s: Math.sqrt(Math.max(s2, 1e-6)) };
  }
  function cdf(comps, x) { const lx = Math.log(x); let F = 0; for (const c of comps) F += c.p * phi((lx - c.mu) / c.s); return F; }
  function quantile(comps, q) {
    let lo = Math.log(0.05), hi = Math.log(1e7);
    for (let i = 0; i < 48; i++) { const mid = (lo + hi) / 2; if (cdf(comps, Math.exp(mid)) < q) lo = mid; else hi = mid; }
    return Math.exp((lo + hi) / 2);
  }

  /* ---------- 1.10 Queue backlog ---------- */
  function queueStats(design, g, P, traffic) {
    const D = traffic.durationMin * 60;
    return design.nodes.filter(n => n.type === 'queue').map(q => {
      const l = P.L[q.id], s = P.st[q.id].s;
      const arrival = (l.w + l.a) * s, peakArrival = (l.w * P.B + l.a) * s;
      const workers = g.out[q.id].map(id => g.byId[id]).filter(k => k.type === 'worker');
      const drain = workers.reduce((t, w) => t + capacityOf(w), 0);
      const maxDepth = num(propsOf(q).maxDepth, 500000);
      let backlog = 0, lag = 0, overflow = 0, state = 'clear';
      if (!(arrival > 0)) state = 'idle';
      else if (drain < arrival) { backlog = (arrival - drain) * D; lag = drain > 0 ? backlog / drain : Infinity; state = 'growing'; overflow = Math.max(0, backlog - maxDepth) / (arrival * D); }
      else if (drain < peakArrival) { backlog = (peakArrival - drain) * BURST_SECONDS; lag = backlog / drain; state = 'absorbing'; }
      return { id: q.id, label: q.label, arrival, peakArrival, drain, backlog, lag, overflow: Math.min(1, overflow), maxDepth, state, syncShare: 0 };
    });
  }

  /* ---------- 1.11 simulate() — one steady-state test at a given load ---------- */
  function simulate(design, trafficIn, opts) {
    opts = opts || {};
    const traffic = normTraffic(trafficIn || design.traffic);
    const R = opts.rps != null ? Math.max(0, opts.rps) : traffic.rps;
    const shedding = opts.shedding !== false;
    const validation = validate(design);
    if (!validation.ok) return { ok: false, validation, rps: R, traffic };
    const g = graph(design);
    const order = topoOrder(design.nodes, g.out, g.inn);
    const tables = routingTables(design, g);
    const P = propagate(design, g, tables, order, traffic, R, shedding);
    const model = {};
    design.nodes.forEach(n => { model[n.id] = nodeModel(n, P.st[n.id]); });

    // Request mixture across clients and request kinds
    const clients = design.nodes.filter(n => n.type === 'client');
    const shareTot = clients.reduce((s, c) => s + Math.max(0, num(propsOf(c).share, 1)), 0) || 1;
    const walk = makeWalker(g, tables, model, false);
    let comps = [];
    clients.forEach(c => {
      const sh = Math.max(0, num(propsOf(c).share, 1)) / shareTot;
      [['r', traffic.readRatio], ['w', 1 - traffic.readRatio]].forEach(([kind, kp]) => {
        if (kp <= 0) return;
        walk(c.id, kind, null).forEach(o => comps.push({ p: sh * kp * o.p, m: o.m, v: o.v, ok: o.ok }));
      });
    });
    const ptot = comps.reduce((s, c) => s + c.p, 0) || 1;
    comps = comps.map(c => toLogn(Object.assign({}, c, { p: c.p / ptot })));
    const mean = comps.length ? comps.reduce((s, c) => s + c.p * Math.exp(c.mu + c.s * c.s / 2), 0) : 0;
    const p50 = comps.length ? quantile(comps, 0.5) : 0;
    const p95 = comps.length ? quantile(comps, 0.95) : 0;
    const p99 = comps.length ? quantile(comps, 0.99) : 0;
    let okWithinTimeout = 0;
    comps.forEach(c => { okWithinTimeout += c.p * c.ok * phi((Math.log(TIMEOUT_MS) - c.mu) / c.s); });
    let errorRate = 1 - okWithinTimeout;
    const queues = queueStats(design, g, P, traffic);
    queues.forEach(q => {
      q.syncShare = R > 0 ? P.L[q.id].w / R : 0;
      errorRate += q.syncShare * q.overflow;
    });
    errorRate = Math.max(0, Math.min(1, errorRate));

    // Effective region: a CDN edge sits next to whoever calls it.
    const eff = {};
    order.forEach(id => {
      const n = g.byId[id];
      if (n.type === 'cdn') { const par = g.inn[id][0]; eff[id] = par ? eff[par] : 'us-east'; }
      else eff[id] = regionOf(n, null);
    });

    // Per-component summary
    const nodes = design.nodes.map(n => {
      const s = P.st[n.id], m = model[n.id], l = s.load;
      const visit = R > 0 ? (l.r + l.w) / R : 0;
      const status = n.type === 'client' ? 'idle' : statusOf(s.rho, s.peak);
      return {
        id: n.id, type: n.type, label: n.label, region: eff[n.id],
        reads: l.r, writes: l.w, async: l.a, peak: s.peak, cap: s.cap, rho: s.rho, status,
        background: n.type !== 'client' && (l.r + l.w) === 0 && l.a > 0,
        T: m.T, S: m.S, Wq: m.Wq, servers: m.c, errors: n.type === 'replica' && l.w > 0 ? Math.max(m.e, 1) : m.e,
        visit, contribution: visit * m.T, satRps: s.rho > 0 ? R / s.rho : Infinity
      };
    });
    // The bottleneck is the busiest component on the request path. Background-only
    // components (behind a queue) only count when nothing on the request path is busy.
    const byRho = (a, b) => b.rho - a.rho;
    const live = nodes.filter(n => n.type !== 'client' && n.peak > 0);
    const syncTop = live.filter(n => !n.background).sort(byRho)[0] || null;
    const bgTop = live.filter(n => n.background).sort(byRho)[0] || null;
    const bottleneck = syncTop && syncTop.rho >= 0.5 ? syncTop : (bgTop && bgTop.rho >= 1 ? bgTop : null);
    const maxRho = live.reduce((m, n) => Math.max(m, n.rho), 0);
    const backgroundIssues = live.filter(n => n.background && n.rho >= 1).map(n => ({ id: n.id, label: n.label, rho: n.rho, dropped: 1 - 1 / n.rho }));
    const sloMet = p95 <= traffic.sloP95 && errorRate <= traffic.errorBudget;
    let verdict = 'pass';
    if (!sloMet) verdict = 'fail';
    else if (maxRho >= STATUS.ok || p95 > traffic.sloP95 * 0.8 || queues.some(q => q.state === 'growing')) verdict = 'strained';

    // Edges that cross regions and carry traffic
    const crossRegion = [];
    (design.edges || []).forEach(e => {
      const a = g.byId[e.from], b = g.byId[e.to];
      if (!a || !b || b.type === 'cdn') return;
      const ra = eff[e.from], rb = eff[e.to];
      if (ra !== rb && (P.F[e.from + '>' + e.to] || 0) > 0) crossRegion.push({ from: e.from, to: e.to, fromRegion: ra, toRegion: rb, rtt: rtt(ra, rb), flow: P.F[e.from + '>' + e.to] });
    });

    return {
      ok: true, validation, traffic, rps: R, peakRps: R * traffic.burst,
      p50, p95, p99, mean, errorRate, throughput: R * (1 - errorRate),
      sloMet, verdict, nodes, byId: nodes.reduce((acc, n) => { acc[n.id] = n; return acc; }, {}),
      bottleneck, maxRho, queues, backgroundIssues, flows: P.F, crossRegion
    };
  }

  /* ---------- 1.12 Named request paths (for "how requests travel") ---------- */
  function paths(design, trafficIn, opts) {
    opts = opts || {};
    const traffic = normTraffic(trafficIn || design.traffic);
    const v = validate(design);
    if (!v.ok) return [];
    const R = opts.rps != null ? opts.rps : traffic.rps;
    const g = graph(design);
    const order = topoOrder(design.nodes, g.out, g.inn);
    const tables = routingTables(design, g);
    const P = propagate(design, g, tables, order, traffic, R, true);
    const model = {};
    design.nodes.forEach(n => { model[n.id] = nodeModel(n, P.st[n.id]); });
    const walk = makeWalker(g, tables, model, true);
    const clients = design.nodes.filter(n => n.type === 'client');
    const shareTot = clients.reduce((s, c) => s + Math.max(0, num(propsOf(c).share, 1)), 0) || 1;
    const out = [];
    clients.forEach(c => {
      const sh = Math.max(0, num(propsOf(c).share, 1)) / shareTot;
      [['r', traffic.readRatio, 'Read'], ['w', 1 - traffic.readRatio, 'Write']].forEach(([kind, kp, kindLabel]) => {
        if (kp <= 0) return;
        walk(c.id, kind, null).forEach(o => out.push({ kind: kindLabel, p: sh * kp * o.p, mean: o.m, p95: Math.exp(toLogn(o).mu + 1.645 * toLogn(o).s), ok: o.ok, seq: o.seq }));
      });
    });
    // merge identical sequences
    const merged = new Map();
    out.forEach(o => {
      const key = o.kind + ':' + o.seq.map(x => x.id).join('>');
      const cur = merged.get(key);
      if (!cur) merged.set(key, Object.assign({}, o));
      else { const p = cur.p + o.p; cur.mean = (cur.mean * cur.p + o.mean * o.p) / p; cur.p95 = Math.max(cur.p95, o.p95); cur.p = p; }
    });
    return Array.from(merged.values()).sort((a, b) => b.p - a.p).slice(0, opts.limit || 6).map(o => Object.assign(o, {
      steps: o.seq.map(x => ({ id: x.id, label: g.byId[x.id].label, type: g.byId[x.id].type, hop: x.hop, T: model[x.id].T }))
    }));
  }

  /* ---------- 1.13 findLimits() — ramp until the design breaks ---------- */
  function findLimits(design, trafficIn) {
    const traffic = normTraffic(trafficIn || design.traffic);
    const validation = validate(design);
    if (!validation.ok) return { ok: false, validation };
    const isBroken = (r) => { const s = simulate(design, traffic, { rps: r }); return { b: s.errorRate > traffic.errorBudget || s.p95 > traffic.sloP95, s }; };
    // Failure order: demand-based utilization (no shedding) scales linearly with entry traffic.
    const R0 = 100;
    const demand = simulate(design, traffic, { rps: R0, shedding: false });
    const order = demand.nodes.filter(n => n.type !== 'client' && n.rho > 0)
      .map(n => ({ id: n.id, label: n.label, type: n.type, satRps: R0 / n.rho }))
      .sort((a, b) => a.satRps - b.satRps);
    const floor = isBroken(1);
    const base = { ok: true, traffic, order, current: simulate(design, traffic) };
    if (floor.b) {
      return Object.assign(base, { breakRps: 0, floor: true, cause: floor.s.p95 > traffic.sloP95 ? 'latency' : 'errors', at: floor.s, firstId: floor.s.bottleneck ? floor.s.bottleneck.id : null, curve: rampCurve(design, traffic, Math.max(traffic.rps * 1.3, 100)), headroom: 0 });
    }
    let lo = 1, hi = Math.max(traffic.rps, 50), guard = 0;
    while (!isBroken(hi).b) { lo = hi; hi *= 2; if (++guard > 24) break; }
    if (!isBroken(hi).b) {
      return Object.assign(base, { breakRps: Infinity, cause: null, at: null, firstId: order[0] ? order[0].id : null, curve: rampCurve(design, traffic, traffic.rps * 4), headroom: Infinity });
    }
    for (let i = 0; i < 24; i++) { const mid = Math.sqrt(lo * hi); if (isBroken(mid).b) hi = mid; else lo = mid; }
    const at = simulate(design, traffic, { rps: hi });
    const latencyBad = at.p95 > traffic.sloP95, errorsBad = at.errorRate > traffic.errorBudget;
    const cause = latencyBad && errorsBad ? 'both' : latencyBad ? 'latency' : 'errors';
    const firstId = at.bottleneck ? at.bottleneck.id : (order[0] ? order[0].id : null);
    const xmax = Math.max(hi * 1.6, traffic.rps * 1.25);
    return Object.assign(base, { breakRps: hi, cause, at, firstId, curve: rampCurve(design, traffic, xmax), headroom: traffic.rps > 0 ? hi / traffic.rps : Infinity });
  }
  function rampCurve(design, traffic, xmax) {
    const N = 44, pts = [];
    for (let i = 0; i <= N; i++) {
      const r = Math.max(1, xmax * i / N);
      const s = simulate(design, traffic, { rps: r });
      pts.push({ rps: r, p50: s.p50, p95: s.p95, p99: s.p99, err: s.errorRate, maxRho: s.maxRho });
    }
    return pts;
  }

  /* ---------- 1.14 timeline() — per-interval metrics for the strip chart ---------- */
  function shapeFactor(shape, t, B) {
    if (shape === 'ramp') return 0.15 + (B - 0.15) * t;
    if (shape === 'spike') {
      const spike = (c) => Math.max(0, 1 - Math.abs(t - c) / 0.05);
      return Math.min(1, t / 0.08) * (1 + (B - 1) * Math.max(spike(0.32), spike(0.7)));
    }
    const bump = Math.max(0, 1 - Math.abs(t - 0.5) / 0.07);
    return Math.min(1, t / 0.1) * (1 + (B - 1) * bump);
  }
  function timeline(design, trafficIn) {
    const traffic = normTraffic(trafficIn || design.traffic);
    if (!validate(design).ok) return [];
    const rnd = mulberry32(hashStr(designKey(design, traffic)));
    const N = 48, pts = [];
    const flat = Object.assign({}, traffic, { burst: 1 });
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const rps = traffic.rps * shapeFactor(traffic.shape, t, traffic.burst) * (1 + (rnd() - 0.5) * 0.05);
      const s = simulate(design, flat, { rps: Math.max(0, rps) });
      pts.push({ t: t * traffic.durationMin, rps, p95: s.p95 * (1 + (rnd() - 0.5) * 0.07), err: s.errorRate });
    }
    return pts;
  }

  /* ---------- 1.15 Design edit helpers (used by suggestions and the AI draft) ---------- */
  const NODE_W = 184, NODE_H = 64;
  function clone(d) { return JSON.parse(JSON.stringify(d)); }
  function nextId(design, prefix) {
    let max = 0;
    design.nodes.concat(design.edges || []).forEach(x => { const m = /(\d+)$/.exec(x.id || ''); if (m) max = Math.max(max, +m[1]); });
    return (prefix || 'n') + (max + 1);
  }
  function addNode(design, type, x, y, extra) {
    const id = nextId(design, 'n');
    const sameType = design.nodes.filter(n => n.type === type).length;
    const node = Object.assign({ id, type, label: CATALOG[type].label + (sameType ? ' ' + (sameType + 1) : ''), x: Math.round(x), y: Math.round(y), props: {} }, extra || {});
    design.nodes.push(node);
    return node;
  }
  function addEdge(design, from, to) {
    if (from === to || design.edges.some(e => e.from === from && e.to === to)) return null;
    const e = { id: nextId(design, 'e'), from, to };
    design.edges.push(e);
    return e;
  }
  function freeSpot(design, x, y) {
    let tries = 0;
    while (design.nodes.some(n => Math.abs(n.x - x) < NODE_W && Math.abs(n.y - y) < NODE_H + 16) && tries++ < 20) y += NODE_H + 28;
    return { x, y };
  }

  /* ---------- 1.16 suggest() — scripted "AI" fixes chosen by the real bottleneck ---------- */
  function suggest(design, trafficIn) {
    const traffic = normTraffic(trafficIn || design.traffic);
    const sim = simulate(design, traffic);
    if (!sim.ok) return [];
    const g = graph(design);
    const out = [];
    const b = sim.bottleneck;
    const fmt = (v) => v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 'k' : String(Math.round(v));
    const callers = (id, types) => g.inn[id].map(k => g.byId[k]).filter(n => !types || types.indexOf(n.type) !== -1);
    const push = (s) => { if (!out.some(o => o.id === s.id)) out.push(s); };
    if (b) {
      const bn = g.byId[b.id];
      const pct = Math.round(b.rho * 100);
      const readShare = (b.reads + b.writes + b.async) > 0 ? b.reads / (b.reads + b.writes + b.async) : 0;
      if (b.type === 'db') {
        const apps = callers(b.id, ['app', 'worker']);
        const hasCache = apps.some(a => g.out[a.id].some(k => g.byId[k].type === 'cache'));
        if (readShare >= 0.5 && !hasCache && apps.length) push({ id: 'add-cache', title: 'Put a cache in front of ' + bn.label, why: bn.label + ' is at ' + pct + '% and ' + Math.round(readShare * 100) + '% of its load is reads. A cache with an 80% hit rate answers most of them from memory.', apply: (d) => { const p = freeSpot(d, (apps[0].x + bn.x) / 2, bn.y - 110); const c = addNode(d, 'cache', p.x, p.y); apps.forEach(a => addEdge(d, a.id, c.id)); return d; } });
        if (readShare >= 0.4) push({ id: 'add-replica', title: 'Add a read replica to ' + bn.label, why: 'Reads are ' + Math.round(readShare * 100) + '% of the load on ' + bn.label + '. A replica takes a share of reads; writes still go to the primary.', apply: (d) => { const p = freeSpot(d, bn.x, bn.y + 100); const r = addNode(d, 'replica', p.x, p.y, { props: { region: propsOf(bn).region || 'us-east' } }); addEdge(d, bn.id, r.id); return d; } });
        const writers = apps.filter(a => !g.out[a.id].some(k => g.byId[k].type === 'queue'));
        if (readShare < 0.5 && writers.length) push({ id: 'add-queue', title: 'Send writes through a queue', why: 'Writes are ' + Math.round((1 - readShare) * 100) + '% of the load on ' + bn.label + '. A queue accepts them immediately and workers write at a steady pace, so bursts stop hitting the database directly.', apply: (d) => { const a0 = writers[0]; const p = freeSpot(d, a0.x + 230, a0.y + 110); const q = addNode(d, 'queue', p.x, p.y); const p2 = freeSpot(d, q.x + 230, q.y); const w = addNode(d, 'worker', p2.x, p2.y, { props: { replicas: 2 } }); writers.forEach(a => addEdge(d, a.id, q.id)); addEdge(d, q.id, w.id); addEdge(d, w.id, bn.id); return d; } });
        push({ id: 'scale-db', title: 'Move ' + bn.label + ' to a larger instance', why: 'Doubling the instance size doubles what it can take per second. It is the quickest fix but also the most expensive one.', apply: (d) => { const n = d.nodes.find(x => x.id === bn.id); n.props = Object.assign({}, n.props, { capacity: perReplicaCap(bn) * 2 }); return d; } });
      } else if (b.type === 'app' || b.type === 'worker' || b.type === 'replica' || b.type === 'cache' || b.type === 'lb' || b.type === 'gateway') {
        const cur = replicasOf(bn);
        const need = Math.max(cur + 1, Math.ceil(cur * b.rho / 0.65));
        const noun = { app: 'app server', worker: 'worker', replica: 'replica', cache: 'cache node', lb: 'load balancer', gateway: 'gateway' }[b.type];
        push({ id: 'scale-' + b.type, title: 'Scale ' + bn.label + ' to ' + need + ' ' + noun + (need > 1 ? 's' : ''), why: bn.label + ' is at ' + pct + '% with ' + cur + ' replica' + (cur > 1 ? 's' : '') + '. ' + need + ' would bring it to about ' + Math.round(b.rho * cur / need * 100) + '% at this traffic.', apply: (d) => { const n = d.nodes.find(x => x.id === bn.id); n.props = Object.assign({}, n.props, { replicas: need }); return d; } });
        if (b.type === 'cache' && clamp01(propsOf(bn).hitRatio) < 0.85) push({ id: 'cache-ttl', title: 'Raise the cache hit rate with longer TTLs', why: 'The cache answers ' + Math.round(clamp01(propsOf(bn).hitRatio) * 100) + '% of reads. Longer expiry on stable data lifts that, so fewer reads reach the database.', apply: (d) => { const n = d.nodes.find(x => x.id === bn.id); n.props = Object.assign({}, n.props, { hitRatio: Math.min(0.95, clamp01(propsOf(bn).hitRatio) + 0.1) }); return d; } });
      } else if (b.type === 'external') {
        push({ id: 'ext-cache', title: 'Cache responses from ' + bn.label, why: bn.label + ' is at ' + pct + '% of its rate limit. Caching repeat lookups for a minute halves the calls you make.', apply: (d) => { const n = d.nodes.find(x => x.id === bn.id); n.props = Object.assign({}, n.props, { share: clamp01(propsOf(bn).share) / 2 }); return d; } });
        push({ id: 'ext-limit', title: 'Ask ' + bn.label + ' for a higher rate limit', why: 'At ' + fmt(b.peak) + ' calls/s you are past the ' + fmt(b.cap) + '/s limit. A higher tier doubles it.', apply: (d) => { const n = d.nodes.find(x => x.id === bn.id); n.props = Object.assign({}, n.props, { capacity: perReplicaCap(bn) * 2 }); return d; } });
      } else if (b.type === 'storage' || b.type === 'cdn' || b.type === 'queue') {
        push({ id: 'scale-' + b.type, title: 'Raise ' + bn.label + ' capacity', why: bn.label + ' is at ' + pct + '%. Request more throughput or partition it.', apply: (d) => { const n = d.nodes.find(x => x.id === bn.id); n.props = Object.assign({}, n.props, { capacity: perReplicaCap(bn) * 2 }); return d; } });
      }
    }
    sim.queues.filter(q => q.state === 'growing').forEach(q => {
      const w = g.out[q.id].map(id => g.byId[id]).find(k => k.type === 'worker');
      if (w) push({ id: 'more-workers', title: 'Add workers to drain ' + q.label, why: 'Jobs arrive at ' + fmt(q.arrival) + '/s but workers handle ' + fmt(q.drain) + '/s, so the backlog grows for the whole test.', apply: (d) => { const n = d.nodes.find(x => x.id === w.id); n.props = Object.assign({}, n.props, { replicas: Math.ceil(replicasOf(w) * q.arrival / q.drain / 0.7) }); return d; } });
    });
    const clients = design.nodes.filter(n => n.type === 'client');
    if (sim.crossRegion.length && clients.length) {
      const main = clients.slice().sort((a, c) => num(propsOf(c).share, 1) - num(propsOf(a).share, 1))[0];
      const userRegion = regionOf(main, null);
      const far = sim.crossRegion.filter(e => e.fromRegion === userRegion).sort((a, c) => c.flow - a.flow)[0];
      if (far) {
        const farRegion = far.toRegion;
        push({ id: 'region-move', title: 'Run the backend in ' + REGIONS[userRegion], why: 'Your users are in ' + REGIONS[userRegion] + ', but requests that reach your servers travel to ' + REGIONS[farRegion] + ' and back, adding about ' + far.rtt + ' ms each time.', apply: (d) => { d.nodes.forEach(n => { if (n.type !== 'client' && n.type !== 'cdn' && (propsOf(n).region || 'us-east') === farRegion) n.props = Object.assign({}, n.props, { region: userRegion }); }); return d; } });
      } else {
        const worst = sim.crossRegion.slice().sort((a, c) => c.rtt * c.flow - a.rtt * a.flow)[0];
        const a = g.byId[worst.from], bb = g.byId[worst.to];
        push({ id: 'region-' + bb.id, title: 'Move ' + bb.label + ' to ' + REGIONS[worst.fromRegion], why: 'Every call from ' + a.label + ' to ' + bb.label + ' crosses regions and adds about ' + worst.rtt + ' ms.', apply: (d) => { const n = d.nodes.find(x => x.id === bb.id); n.props = Object.assign({}, n.props, { region: worst.fromRegion }); return d; } });
      }
    }
    if (traffic.readRatio >= 0.7 && !design.nodes.some(n => n.type === 'cdn') && clients.length && out.length < 3) {
      const c = clients[0];
      push({ id: 'add-cdn', title: 'Put a CDN in front of ' + (g.byId[g.out[c.id][0]] || {}).label, why: Math.round(traffic.readRatio * 100) + '% of requests are reads. A CDN answers cacheable ones at the edge, close to users, before they reach your servers.', apply: (d) => { const kids = d.edges.filter(e => e.from === c.id).map(e => e.to); d.edges = d.edges.filter(e => e.from !== c.id); const p = freeSpot(d, c.x + 120, c.y - 110); const cdn = addNode(d, 'cdn', p.x, p.y); addEdge(d, c.id, cdn.id); kids.forEach(k => addEdge(d, cdn.id, k)); return d; } });
    }
    return out.slice(0, 4).map(s => {
      const after = s.apply(clone(design));
      const sa = simulate(after, traffic);
      return Object.assign({}, s, { after, before: { p95: sim.p95, err: sim.errorRate, maxRho: sim.maxRho }, result: sa.ok ? { p95: sa.p95, err: sa.errorRate, maxRho: sa.maxRho, verdict: sa.verdict } : null });
    });
  }

  /* ---------- 1.17 Builder: spec -> design (templates and AI drafts) ---------- */
  const TIER = { client: 0, cdn: 1, lb: 2, gateway: 2, app: 3, cache: 4, queue: 4, external: 4, storage: 4, db: 5, worker: 5, replica: 6 };
  function layout(design) {
    const cols = {};
    design.nodes.forEach(n => { const t = TIER[n.type] != null ? TIER[n.type] : 3; (cols[t] = cols[t] || []).push(n); });
    const tiers = Object.keys(cols).map(Number).sort((a, b) => a - b);
    tiers.forEach((t, i) => {
      const list = cols[t];
      const h = list.length * (NODE_H + 30) - 30;
      list.forEach((n, j) => { n.x = 40 + i * 240; n.y = Math.round(260 - h / 2 + j * (NODE_H + 30)); });
    });
    return design;
  }
  function buildFromSpec(spec) {
    const region = spec.region || 'us-east';
    const d = { nodes: [], edges: [] };
    const reg = { region };
    const client = addNode(d, 'client', 0, 0, { label: spec.clientLabel || 'Users', props: { region } });
    let front = client;
    if (spec.cdn) { const c = addNode(d, 'cdn', 0, 0, { props: { hitRatio: spec.cdn.hitRatio != null ? spec.cdn.hitRatio : 0.6 } }); addEdge(d, front.id, c.id); front = c; }
    if (spec.gateway) { const gw = addNode(d, 'gateway', 0, 0, { props: Object.assign({}, reg) }); addEdge(d, front.id, gw.id); front = gw; }
    if (spec.lb) { const lb = addNode(d, 'lb', 0, 0, { props: Object.assign({}, reg) }); addEdge(d, front.id, lb.id); front = lb; }
    const app = addNode(d, 'app', 0, 0, { label: spec.appLabel || 'App servers', props: Object.assign({ replicas: spec.appReplicas || 2 }, reg, spec.appProps || {}) });
    addEdge(d, front.id, app.id);
    let db = null;
    if (spec.cache) { const c = addNode(d, 'cache', 0, 0, { label: spec.cache.label || 'Cache', props: Object.assign({ hitRatio: spec.cache.hitRatio != null ? spec.cache.hitRatio : 0.8 }, reg) }); addEdge(d, app.id, c.id); }
    if (spec.db !== false) { db = addNode(d, 'db', 0, 0, { label: spec.dbLabel || 'Database', props: Object.assign({}, reg, spec.dbProps || {}) }); }
    if (spec.queue) {
      const q = addNode(d, 'queue', 0, 0, { label: spec.queue.label || 'Queue', props: Object.assign({}, reg) });
      const w = addNode(d, 'worker', 0, 0, { label: spec.queue.workerLabel || 'Workers', props: Object.assign({ replicas: spec.queue.workers || 2 }, reg) });
      addEdge(d, app.id, q.id); addEdge(d, q.id, w.id);
      if (db) addEdge(d, w.id, db.id);
      (spec.queue.external || []).forEach(x => { const e = addNode(d, 'external', 0, 0, { label: x.label, props: Object.assign({ share: x.share != null ? x.share : 1 }, reg, x.capacity ? { capacity: x.capacity } : {}) }); addEdge(d, w.id, e.id); });
    }
    if (db) { addEdge(d, app.id, db.id); for (let i = 0; i < (spec.replicas || 0); i++) { const r = addNode(d, 'replica', 0, 0, { label: 'Read replica' + (i ? ' ' + (i + 1) : ''), props: Object.assign({}, reg) }); addEdge(d, db.id, r.id); } }
    (spec.external || []).forEach(x => { const e = addNode(d, 'external', 0, 0, { label: x.label, props: Object.assign({ share: x.share != null ? x.share : 0.1 }, reg, x.capacity ? { capacity: x.capacity } : {}) }); addEdge(d, app.id, e.id); });
    if (spec.storage) { const s = addNode(d, 'storage', 0, 0, { props: Object.assign({ share: spec.storage.share != null ? spec.storage.share : 0.15 }, reg) }); addEdge(d, app.id, s.id); }
    return layout(d);
  }

  /* ---------- 1.18 MockAI.draft() — keyword parser standing in for the LLM ---------- */
  function parseNumber(s, unit) {
    let v = parseFloat(String(s).replace(/,/g, ''));
    if (!isFinite(v)) return null;
    const u = (unit || '').toLowerCase();
    if (u === 'k' || u === 'thousand') v *= 1e3;
    if (u === 'm' || u === 'million') v *= 1e6;
    return v;
  }
  function draft(text) {
    const t = ' ' + String(text || '').toLowerCase().replace(/\s+/g, ' ') + ' ';
    const has = function () { return Array.prototype.slice.call(arguments).some(w => t.indexOf(w) !== -1); };
    const found = [], assumptions = [];
    const spec = {};
    spec.region = has('europe', ' eu ', 'germany', ' uk ', 'london', 'paris') ? 'eu-west' : has('asia', 'india', 'bangladesh', 'mumbai', 'singapore', 'pakistan', 'nepal', 'sri lanka') ? 'ap-south' : 'us-east';
    if (spec.region !== 'us-east') found.push('Users in ' + REGIONS[spec.region]); else assumptions.push('No region mentioned, so everything runs in US East.');
    const mApps = t.match(/(\d+)\s*(?:app|api|web|application|backend|node)?\s*(?:servers?|instances?|replicas?|pods?|containers?)/);
    spec.appReplicas = mApps ? Math.max(1, Math.min(40, parseInt(mApps[1], 10))) : 2;
    if (mApps) found.push(spec.appReplicas + ' app servers'); else assumptions.push('Started with 2 app servers.');
    if (has('cdn', 'cloudfront', 'cloudflare', 'static', 'image', 'video', 'media', 'photo', 'assets')) { spec.cdn = { hitRatio: has('video', 'media', 'image', 'photo') ? 0.75 : 0.6 }; found.push('CDN'); }
    if (has('gateway', 'kong', 'apigee')) { spec.gateway = true; found.push('API gateway'); }
    spec.lb = has('load balancer', 'balancer', 'nginx', 'haproxy', ' elb', ' alb') || spec.appReplicas > 1;
    if (spec.lb) { if (has('load balancer', 'balancer', 'nginx', 'haproxy', ' elb', ' alb')) found.push('Load balancer'); else assumptions.push('Added a load balancer because there is more than one app server.'); }
    if (has('cache', 'redis', 'memcache', 'valkey')) {
      const mh = t.match(/(\d{1,2})\s*%\s*(?:cache\s*)?hit/);
      spec.cache = { label: has('redis') ? 'Redis' : has('memcache') ? 'Memcached' : 'Cache', hitRatio: mh ? parseInt(mh[1], 10) / 100 : 0.8 };
      found.push(spec.cache.label + ' cache'); if (!mh) assumptions.push('Assumed the cache answers 80% of reads.');
    }
    spec.dbLabel = has('postgres', 'postgresql') ? 'Postgres' : has('mysql') ? 'MySQL' : has('mongo') ? 'MongoDB' : has('timescale', 'time-series', 'time series', 'influx') ? 'Time-series DB' : has('dynamo') ? 'DynamoDB' : 'Database';
    found.push(spec.dbLabel);
    const mRep = t.match(/(\d+)\s*read replicas?/);
    spec.replicas = mRep ? Math.min(6, parseInt(mRep[1], 10)) : (has('replica') ? 1 : 0);
    if (spec.replicas) found.push(spec.replicas + ' read replica' + (spec.replicas > 1 ? 's' : ''));
    const wantsQueue = has('queue', 'kafka', 'rabbit', 'sqs', 'background', 'async', 'worker', 'jobs', 'emails', 'e-mail', 'notification');
    const ext = [];
    if (has('stripe', 'payment', 'checkout', 'paypal', 'bkash')) ext.push({ label: 'Payments API', share: has('checkout') ? 0.08 : 0.05 });
    if (wantsQueue) {
      const mw = t.match(/(\d+)\s*workers?/);
      spec.queue = { label: has('kafka') ? 'Kafka' : has('rabbit') ? 'RabbitMQ' : has('sqs') ? 'SQS' : 'Queue', workers: mw ? Math.min(30, parseInt(mw[1], 10)) : 2, external: has('email', 'e-mail', 'notification', 'sendgrid') ? [{ label: 'Email API', share: 1 }] : [] };
      found.push(spec.queue.label + ' + ' + spec.queue.workers + ' workers');
      if (!mw) assumptions.push('Assumed 2 workers read from the queue.');
      if (spec.queue.external.length) found.push('Email API (called by workers)');
    }
    if (has('sms', 'twilio')) ext.push({ label: 'SMS API', share: 0.05 });
    if (has('maps', 'geocod', 'location lookup')) ext.push({ label: 'Maps API', share: 0.1 });
    spec.external = ext; ext.forEach(x => found.push(x.label));
    if (has('upload', ' s3', 'storage', ' file', 'photo', 'video', 'media')) { spec.storage = { share: has('photo', 'video', 'media') ? 0.25 : 0.12 }; found.push('Object storage'); }

    const traffic = Object.assign({}, TRAFFIC_DEFAULTS);
    const mRps = t.match(/(\d[\d,.]*)\s*(k|thousand)?\s*(?:rps|req\/s|requests? (?:per|a|each) second|requests?\/s)/);
    const mUsers = t.match(/(\d[\d,.]*)\s*(k|m|thousand|million)?\s*(?:daily active users|daily users|dau|users|visitors|customers|devices|sensors)/);
    if (mRps) { traffic.rps = Math.round(parseNumber(mRps[1], mRps[2])); found.push(traffic.rps.toLocaleString('en-US') + ' rps'); }
    else if (mUsers) {
      const users = parseNumber(mUsers[1], mUsers[2]);
      traffic.rps = Math.max(20, Math.round(users * 50 / 86400 * 3));
      assumptions.push('Turned ' + Math.round(users).toLocaleString('en-US') + ' users into ' + traffic.rps.toLocaleString('en-US') + ' rps at the busiest hour (50 requests per user per day, peak hour 3x the average).');
    } else { traffic.rps = 500; assumptions.push('No traffic figure given, so the test starts at 500 rps.'); }
    if (has('read-heavy', 'read heavy', 'feed', 'news', 'blog', 'content', 'catalog', 'browse', 'photo', 'video')) traffic.readRatio = 0.9;
    else if (has('write-heavy', 'write heavy', 'ingest', 'logging', 'sensor', 'iot', 'telemetry', 'analytics', 'events')) traffic.readRatio = 0.15;
    else if (has('chat', 'messag')) traffic.readRatio = 0.5;
    else if (has('store', 'shop', 'commerce', 'checkout')) traffic.readRatio = 0.75;
    assumptions.push('Assumed ' + Math.round(traffic.readRatio * 100) + '% of requests are reads.');
    if (has('flash sale', 'launch', 'spike', 'black friday', 'viral', 'eid')) { traffic.burst = 3; traffic.shape = 'spike'; found.push('Traffic spikes (3x bursts)'); }
    const name = has('news', 'feed') ? 'News feed' : has('shop', 'store', 'commerce', 'checkout') ? 'Online store' : has('iot', 'sensor', 'telemetry', 'ingest') ? 'Sensor ingest' : has('photo', 'image', 'video') ? 'Photo sharing' : has('chat', 'messag') ? 'Chat service' : has('ride', 'carpool', 'taxi') ? 'Ride booking' : 'Drafted design';
    const design = buildFromSpec(spec);
    return { name, design, traffic, found, assumptions, spec };
  }
  // A canned bad response, used to demo the "AI output invalid" state.
  function invalidDraft() {
    return {
      raw: '{\n  "nodes": [\n    { "id": "n1", "type": "client" },\n    { "id": "n2", "type": "redis-cluster", "replicas": "three" },\n    { "id": "n3", "type": "app", "capacity": -200 }\n  ],\n  "edges": [ { "from": "n1", "to": "n9" } ]\n}',
      errors: [
        'nodes[1].type: "redis-cluster" is not a known component type',
        'nodes[1].replicas: expected a whole number, got "three"',
        'nodes[2].capacity: must be greater than 0',
        'edges[0].to: "n9" does not match any node id'
      ]
    };
  }

  root.MockEngine = { CATALOG, TYPES, REGIONS, PRESETS, TRAFFIC_DEFAULTS, TIMEOUT_MS, STATUS, NODE_W, NODE_H, propsOf, capacityOf, perReplicaCap, replicasOf, baseLatencyOf, regionOf, rtt, normTraffic, designKey, hashStr, validate, simulate, paths, findLimits, timeline, suggest, buildFromSpec, layout, addNode, addEdge, nextId, clone };
  root.MockAI = { draft, invalidDraft };
})(typeof window !== 'undefined' ? window : globalThis);
