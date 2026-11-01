"use client";

import { useId, useState } from "react";
import {
  CACHE_DEFAULT_HIT,
  CDN_DEFAULT_HIT,
  COMPONENT,
  REGIONS,
  WORKER_CAPACITY,
  caching,
  cdn,
  loadBalancing,
  percentiles,
  queue,
  replicas,
  roundTripMs,
  utilization,
  type NodeStats,
  type Region,
  type Status,
} from "@/lib/learn-model";

// P2 Learn demos. Each one runs entirely in the browser on the shared model (checked against the real simulator),
// needs no account and makes no request. Every result is also written out in words, so nothing depends on colour or on
// reading a bar, and every control is a native input that works from the keyboard.

const n0 = (x: number) => (Number.isFinite(x) ? Math.round(x).toLocaleString("en-US") : "never");
const n1 = (x: number) => (Number.isFinite(x) ? (Math.round(x * 10) / 10).toLocaleString("en-US") : "never");
const pct = (x: number) => (Number.isFinite(x) ? `${Math.round(x * 100).toLocaleString("en-US")}%` : "beyond any limit");
const duration = (seconds: number) => (!Number.isFinite(seconds) ? "it never catches up" : seconds < 120 ? `${n0(seconds)} s` : seconds < 7200 ? `${n0(seconds / 60)} min` : `${n1(seconds / 3600)} h`);

export const STATUS_WORD: Record<Status, string> = { idle: "Idle", ok: "Healthy", warn: "Warning", fail: "Failing" };
const STATUS_CLASS: Record<Status, string> = { idle: "", ok: "ok", warn: "warn", fail: "fail" };

function StatusPill({ status }: { status: Status }) {
  return (
    <span className={"pill " + STATUS_CLASS[status]} data-testid="status">
      <span className="dot" aria-hidden="true" /> {STATUS_WORD[status]}
    </span>
  );
}

function Range({ label, value, min, max, step, onChange, format }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format: (v: number) => string }) {
  const id = useId();
  return (
    <div className="lrn-field">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} aria-valuetext={format(value)} onChange={(e) => onChange(Number(e.target.value))} />
      <output htmlFor={id} className="lrn-value">
        {format(value)}
      </output>
    </div>
  );
}

function Pick<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: Array<[T, string]>; onChange: (v: T) => void }) {
  const id = useId();
  return (
    <div className="lrn-field">
      <label htmlFor={id}>{label}</label>
      <select id={id} className="r2-input" value={String(value)} onChange={(e) => onChange((typeof value === "number" ? Number(e.target.value) : e.target.value) as T)}>
        {options.map(([v, text]) => (
          <option key={String(v)} value={String(v)}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );
}

function Frame({ title, setup, children, summary }: { title: string; setup: string; children: React.ReactNode; summary: string }) {
  return (
    <section className="panel stack r2-pad" aria-label={`Demo: ${title}`} data-testid="demo">
      <h2 className="h3">Try it: {title}</h2>
      <p className="hint">{setup} Model estimate, not a measurement.</p>
      <div className="lrn-controls">{children}</div>
      <p role="status" className="lrn-summary" data-testid="demo-summary">
        {summary}
      </p>
    </section>
  );
}

function Readouts({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="lrn-readouts" data-testid="readouts">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt className="muted">{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const nodeSentence = (what: string, s: NodeStats) =>
  s.status === "idle" ? `${what} gets no traffic.` : `${what} is ${pct(s.rho)} busy at the burst peak of ${n0(s.peak)} requests a second: ${STATUS_WORD[s.status].toLowerCase()}. A request spends about ${n1(s.T)} ms there (${n1(s.S)} ms of work and ${n1(s.Wq)} ms waiting).`;

export function UtilizationDemo() {
  const [rps, setRps] = useState(500);
  const [burst, setBurst] = useState(1.5);
  const [reps, setReps] = useState(1);
  const s = utilization({ rps, burst, replicas: reps, capacity: COMPONENT.app.capacity, latency: COMPONENT.app.latency });
  return (
    <Frame title="utilization" setup={`An app server handles ${COMPONENT.app.capacity} requests a second per replica and takes ${COMPONENT.app.latency} ms per request.`} summary={nodeSentence("The app tier", s)}>
      <Range label="Steady load" value={rps} min={0} max={2000} step={50} onChange={setRps} format={(v) => `${n0(v)} requests/s`} />
      <Range label="Burst multiplier" value={burst} min={1} max={3} step={0.5} onChange={setBurst} format={(v) => `×${v}`} />
      <Range label="Replicas" value={reps} min={1} max={4} step={1} onChange={setReps} format={(v) => `${v}`} />
      <Readouts
        rows={[
          ["Peak load", `${n0(s.peak)} requests/s`],
          ["Capacity", `${n0(s.cap)} requests/s`],
          ["Utilization (ρ)", pct(s.rho)],
          ["Status", <StatusPill key="s" status={s.status} />],
          ["Time in this component", `${n1(s.T)} ms`],
        ]}
      />
    </Frame>
  );
}

export function QueuesDemo() {
  const [rps, setRps] = useState(500);
  const [burst, setBurst] = useState(2);
  const [workers, setWorkers] = useState(1);
  const [maxDepth, setMaxDepth] = useState(500000);
  const q = queue({ rps, burst, drain: workers * WORKER_CAPACITY, maxDepth, durationMin: 10 });
  const word = { idle: "Idle", clear: "Clear", absorbing: "Absorbing a burst", growing: "Growing" }[q.state];
  const summary =
    q.state === "idle"
      ? "No jobs are arriving."
      : q.state === "clear"
        ? `The workers drain ${n0(q.drain)} jobs a second, more than the peak of ${n0(q.peakArrival)}, so no backlog builds.`
        : q.state === "absorbing"
          ? `The workers keep up with the average of ${n0(q.arrival)} jobs a second but not with the burst of ${n0(q.peakArrival)}. The burst leaves a backlog of ${n0(q.backlog)} jobs, and a new job waits about ${duration(q.lag)} until it drains.`
          : `Jobs arrive at ${n0(q.arrival)} a second but the workers drain only ${n0(q.drain)}. In 10 minutes the backlog reaches ${n0(q.backlog)} jobs and a new job waits ${duration(q.lag)}${q.overflow > 0 ? `; ${pct(q.overflow)} of jobs are lost because the queue is full` : ""}.`;
  return (
    <Frame title="a queue and its workers" setup={`Each worker drains ${WORKER_CAPACITY} jobs a second. The test runs for 10 minutes and bursts last one minute.`} summary={summary}>
      <Range label="Jobs arriving" value={rps} min={0} max={2000} step={50} onChange={setRps} format={(v) => `${n0(v)} jobs/s`} />
      <Range label="Burst multiplier" value={burst} min={1} max={4} step={0.5} onChange={setBurst} format={(v) => `×${v}`} />
      <Range label="Workers" value={workers} min={1} max={8} step={1} onChange={setWorkers} format={(v) => `${v}`} />
      <Pick label="Queue size limit" value={maxDepth} options={[[1000, "1,000 jobs"], [50000, "50,000 jobs"], [500000, "500,000 jobs"]]} onChange={setMaxDepth} />
      <Readouts
        rows={[
          ["State", <span key="s" className={"pill " + ({ idle: "", clear: "ok", absorbing: "warn", growing: "fail" }[q.state])} data-testid="status"><span className="dot" aria-hidden="true" /> {word}</span>],
          ["Backlog", `${n0(q.backlog)} jobs`],
          ["Wait for a new job", duration(q.lag)],
          ["Jobs lost", pct(q.overflow)],
        ]}
      />
    </Frame>
  );
}

export function PercentilesDemo() {
  const [share, setShare] = useState(0.05);
  const p = percentiles({ fast: 20, slow: 400, share });
  const base = percentiles({ fast: 20, slow: 400, share: 0 });
  return (
    <Frame
      title="the slow tail"
      setup="Most requests take about 20 ms. A share of them take about 400 ms instead."
      summary={`With ${pct(share)} slow requests, the middle request takes ${n0(p.p50)} ms, p95 is ${n0(p.p95)} ms and p99 is ${n0(p.p99)} ms. With none slow they would be ${n0(base.p50)}, ${n0(base.p95)} and ${n0(base.p99)} ms.`}
    >
      <Range label="Share of slow requests" value={share} min={0} max={0.5} step={0.01} onChange={setShare} format={pct} />
      <Readouts
        rows={[
          ["p50 (the middle request)", `${n0(p.p50)} ms`],
          ["p95", `${n0(p.p95)} ms`],
          ["p99", `${n0(p.p99)} ms`],
        ]}
      />
    </Frame>
  );
}

export function CachingDemo() {
  const [rps, setRps] = useState(1000);
  const [readShare, setReadShare] = useState(0.8);
  const [hit, setHit] = useState(CACHE_DEFAULT_HIT);
  const c = caching({ rps, readRatio: readShare, hit, burst: 1.5 });
  return (
    <Frame
      title="a cache in front of a database"
      setup={`The database handles ${n0(COMPONENT.db.capacity)} requests a second and takes ${COMPONENT.db.latency} ms per request. Bursts are ×1.5.`}
      summary={`${n0(c.dbReads)} reads a second miss the cache and reach the database, together with ${n0(c.dbWrites)} writes. ${nodeSentence("The database", c.db)}`}
    >
      <Range label="Steady load" value={rps} min={200} max={3000} step={100} onChange={setRps} format={(v) => `${n0(v)} requests/s`} />
      <Range label="Share that are reads" value={readShare} min={0.5} max={1} step={0.05} onChange={setReadShare} format={pct} />
      <Range label="Cache hit ratio" value={hit} min={0} max={1} step={0.05} onChange={setHit} format={pct} />
      <Readouts
        rows={[
          ["Reads reaching the database", `${n0(c.dbReads)} /s`],
          ["Writes reaching the database", `${n0(c.dbWrites)} /s`],
          ["Database utilization (ρ)", pct(c.db.rho)],
          ["Status", <StatusPill key="s" status={c.db.status} />],
        ]}
      />
    </Frame>
  );
}

export function ReplicasDemo() {
  const [rps, setRps] = useState(1000);
  const [readShare, setReadShare] = useState(0.8);
  const [n, setN] = useState(2);
  const r = replicas({ rps, readRatio: readShare, replicas: n, burst: 1.5 });
  return (
    <Frame
      title="read replicas"
      setup="The primary and every replica handle 1,800 requests a second and take 6 ms per request. Bursts are ×1.5."
      summary={`Each of the ${n + 1} server${n === 0 ? "" : "s"} takes ${n0(r.readsEach)} reads a second. ${nodeSentence("The primary", r.primary)}${r.replica ? ` Each replica also replays ${n0(r.replayed)} writes a second. ${nodeSentence("A replica", r.replica)}` : " With no replicas, the primary takes every read as well."}`}
    >
      <Range label="Steady load" value={rps} min={200} max={3000} step={100} onChange={setRps} format={(v) => `${n0(v)} requests/s`} />
      <Range label="Share that are reads" value={readShare} min={0.5} max={1} step={0.05} onChange={setReadShare} format={pct} />
      <Range label="Replicas" value={n} min={0} max={4} step={1} onChange={setN} format={(v) => `${v}`} />
      <Readouts
        rows={[
          ["Reads on each server", `${n0(r.readsEach)} /s`],
          ["Primary utilization (ρ)", pct(r.primary.rho)],
          ["Primary status", <StatusPill key="p" status={r.primary.status} />],
          ["Replica utilization (ρ)", r.replica ? pct(r.replica.rho) : "no replicas"],
          ["Replica status", r.replica ? <StatusPill key="r" status={r.replica.status} /> : "no replicas"],
        ]}
      />
    </Frame>
  );
}

export function LoadBalancingDemo() {
  const [rps, setRps] = useState(1200);
  const [servers, setServers] = useState(3);
  const l = loadBalancing({ rps, servers, burst: 1.5 });
  return (
    <Frame
      title="a load balancer"
      setup={`Identical app servers, each handling ${COMPONENT.app.capacity} requests a second and taking ${COMPONENT.app.latency} ms. The model splits the load evenly. Bursts are ×1.5.`}
      summary={`Each of ${servers} server${servers === 1 ? "" : "s"} gets ${n0(l.perServer)} requests a second. ${nodeSentence("Each server", l.server)} Real balancers can split unevenly; this is the best case.`}
    >
      <Range label="Steady load" value={rps} min={300} max={3000} step={100} onChange={setRps} format={(v) => `${n0(v)} requests/s`} />
      <Range label="Servers" value={servers} min={1} max={8} step={1} onChange={setServers} format={(v) => `${v}`} />
      <Readouts
        rows={[
          ["Load on each server", `${n0(l.perServer)} /s`],
          ["Utilization (ρ) of each", pct(l.server.rho)],
          ["Status", <StatusPill key="s" status={l.server.status} />],
          ["Time in each server", `${n1(l.server.T)} ms`],
        ]}
      />
    </Frame>
  );
}

export function CdnDemo() {
  const [rps, setRps] = useState(2000);
  const [readShare, setReadShare] = useState(0.8);
  const [hit, setHit] = useState(CDN_DEFAULT_HIT);
  const c = cdn({ rps, readRatio: readShare, hit, burst: 1.5 });
  const reads = rps * readShare;
  return (
    <Frame
      title="a CDN in front of your servers"
      setup={`The origin is 8 app servers, each handling ${COMPONENT.app.capacity} requests a second. Bursts are ×1.5.`}
      summary={`The CDN answers ${n0(reads - c.originReads)} of the ${n0(reads)} reads a second at the edge. The origin gets ${n0(c.originReads)} reads and ${n0(c.originWrites)} writes. ${nodeSentence("The origin", c.origin)}`}
    >
      <Range label="Steady load" value={rps} min={500} max={4000} step={100} onChange={setRps} format={(v) => `${n0(v)} requests/s`} />
      <Range label="Share that are reads" value={readShare} min={0.5} max={1} step={0.05} onChange={setReadShare} format={pct} />
      <Range label="CDN hit ratio" value={hit} min={0} max={1} step={0.05} onChange={setHit} format={pct} />
      <Readouts
        rows={[
          ["Reads answered at the edge", `${n0(reads - c.originReads)} /s`],
          ["Reads reaching the origin", `${n0(c.originReads)} /s`],
          ["Origin utilization (ρ)", pct(c.origin.rho)],
          ["Status", <StatusPill key="s" status={c.origin.status} />],
        ]}
      />
    </Frame>
  );
}

const REGION_OPTIONS = (Object.entries(REGIONS) as Array<[Region, string]>).map(([id, name]) => [id, name] as [Region, string]);

export function RegionsDemo() {
  const [from, setFrom] = useState<Region>("us-east");
  const [to, setTo] = useState<Region>("ap-south");
  const [calls, setCalls] = useState(3);
  const one = roundTripMs(from, to);
  return (
    <Frame
      title="calls between regions"
      setup="Each time a request crosses between two regions the model adds a fixed round trip. Within a region it adds none."
      summary={
        one === 0
          ? `The app and the database are both in ${REGIONS[from]}, so the calls add no round-trip time.`
          : `Each call between ${REGIONS[from]} and ${REGIONS[to]} adds ${one} ms. ${calls} call${calls === 1 ? "" : "s"} in a row add ${calls * one} ms.`
      }
    >
      <Pick label="Where the app runs" value={from} options={REGION_OPTIONS} onChange={setFrom} />
      <Pick label="Where the database runs" value={to} options={REGION_OPTIONS} onChange={setTo} />
      <Range label="Calls in a row" value={calls} min={1} max={10} step={1} onChange={setCalls} format={(v) => `${v}`} />
      <Readouts
        rows={[
          ["Added by one call", `${one} ms`],
          ["Added by all the calls", `${calls * one} ms`],
        ]}
      />
    </Frame>
  );
}

export const DEMOS: Record<string, () => React.ReactElement> = {
  utilization: UtilizationDemo,
  queues: QueuesDemo,
  p95: PercentilesDemo,
  caching: CachingDemo,
  replicas: ReplicasDemo,
  "load-balancing": LoadBalancingDemo,
  cdn: CdnDemo,
  regions: RegionsDemo,
};
