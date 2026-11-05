"use client";

import Link from "next/link";
import { ReactNode, useEffect, useState } from "react";
import { RoleGate } from "@/components/auth/role-gate";
import { Crumbs } from "@/components/shell/crumbs";
import { useLiveMetrics } from "@/components/admin/use-live-metrics";
import {
  AdminMetrics,
  COMPONENT_TEXT,
  LEVEL_TEXT,
  OUTCOME_TEXT,
  STATUS_TEXT,
  TASK_TEXT,
  VERDICT_TEXT,
  ageText,
  alertText,
  barHeights,
  bucketLabel,
  compact,
  liveStatus,
  percent,
  sortedAlerts,
  statusDetail,
  sum,
  utcTime,
} from "@/lib/admin-metrics";
import { resolveRoute } from "@/lib/routes";

const STATUS_PILL = { live: "ok", paused: "outline", reconnecting: "warn", stale: "fail" } as const;

export function AdminDashboard() {
  return (
    <div className="page stack lg">
      <Crumbs resolved={resolveRoute("/admin/dashboard")} />
      <div className="page-head">
        <div className="stack">
          <span className="eyebrow">Admin</span>
          <h1 className="h1">Live dashboard</h1>
          <p className="lede">How StressForge is being used right now. Counts only: you see no one&apos;s name, email, design or notes here.</p>
        </div>
      </div>
      <RoleGate role="admin">
        <Live />
      </RoleGate>
    </div>
  );
}

/** A clock that ticks once a second, so "updated 12 s ago" moves without refetching anything. */
function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

function Live() {
  const { state, denied, setPaused, retryNow } = useLiveMetrics(true);
  const now = useNow();
  const status = liveStatus(state, now);
  const m = state.data;

  if (denied)
    return (
      <div className="empty" role="alert" data-testid="dash-denied">
        <h2 className="h3">Your Admin access was removed</h2>
        <p className="muted">The dashboard has stopped updating. Nothing was changed.</p>
      </div>
    );

  return (
    <div className="stack lg" data-testid="admin-dashboard" data-live={status}>
      <section className="panel dash-status" aria-label="Update status">
        <div className="row between">
          <div className="row">
            <span className={`pill ${STATUS_PILL[status]}`} role="status" data-testid="dash-status">
              <span className="dot" aria-hidden="true" /> {STATUS_TEXT[status]}
            </span>
            <span className="small muted" data-testid="dash-detail">
              {statusDetail(state, status, now)}
            </span>
          </div>
          <div className="row tight">
            {m && (status === "live" || status === "paused") && (
              <span className="small muted" data-testid="dash-updated">
                Numbers from {utcTime(m.generatedAt)}
                {state.lastGoodAt !== null && status !== "paused" ? ` (${ageText(Math.max(0, Math.round((now - state.lastGoodAt) / 1000)))} ago)` : ""}
              </span>
            )}
            {(status === "reconnecting" || status === "stale") && (
              <button className="btn btn-sm" onClick={retryNow}>
                Try now
              </button>
            )}
            <button className="btn btn-sm" aria-pressed={state.paused} onClick={() => setPaused(!state.paused)} data-testid="dash-pause">
              {state.paused ? "Resume" : "Pause"}
            </button>
            <Link href="/admin/dashboard/wall" className="btn btn-sm" data-testid="dash-wall-link">
              Wall display
            </Link>
          </div>
        </div>
      </section>

      {!m ? (
        <p className="muted" role="status" data-testid="dash-loading">
          {state.failures > 0 ? "The first numbers have not loaded yet. Trying again." : "Loading the first numbers…"}
        </p>
      ) : (
        <Board m={m} stale={status === "stale"} />
      )}
    </div>
  );
}

function Board({ m, stale }: { m: AdminMetrics; stale: boolean }) {
  return (
    <div className={`stack lg${stale ? " dash-stale" : ""}`} data-testid="dash-board">
      <Alerts alerts={m.alerts} />
      <div className="dash-cards" role="list">
        <Card label="Accounts" value={m.totals.users} sub={`+${compact(m.last24h.signups)} in 24 h`} series={m.series.signups} start={m.seriesStart} id="signups" />
        <Card label="Designs" value={m.totals.designs} sub={`+${compact(m.last24h.designsCreated)} in 24 h`} series={m.series.designsCreated} start={m.seriesStart} id="designs" />
        <Card label="Simulation runs" value={m.totals.runs} sub={`${compact(m.last24h.runsCompleted)} done, ${compact(m.last24h.runsFailed)} failed in 24 h`} series={m.series.runsCompleted} start={m.seriesStart} id="runs" />
        <Card label="AI calls" value={sum(m.series.aiCalls)} sub="in the last 24 h" series={m.series.aiCalls} start={m.seriesStart} id="ai" />
        <Card label="Active now" value={m.activeNow} sub="accounts that did something in the last 15 min" id="active" />
        <Card label="Open share links" value={m.totals.openShares} sub={`${compact(m.totals.shares)} ever created`} id="shares" />
      </div>

      <div className="grid-2 dash-two">
        <Panel title="Accounts by role" id="roles">
          <Bars
            rows={[
              ["User", m.roles.user],
              ["Instructor", m.roles.instructor],
              ["Reviewer", m.roles.reviewer],
              ["Admin", m.roles.admin],
            ]}
            note={`${compact(m.totals.suspendedUsers)} suspended`}
          />
        </Panel>
        <Panel title="How finished runs turned out" id="verdicts">
          <Bars rows={(Object.keys(VERDICT_TEXT) as (keyof typeof VERDICT_TEXT)[]).map((k) => [VERDICT_TEXT[k], m.runs.byVerdict[k]])} tone="verdict" />
        </Panel>
        <Panel title="Where designs break" id="bottlenecks">
          <Breaks m={m} />
        </Panel>
        <Panel title="Run queue" id="queue">
          <Queue m={m} />
        </Panel>
        <Panel title="AI in the last 24 hours" id="ai-usage">
          <AiUsage m={m} />
        </Panel>
        <Panel title="How far people get" id="funnel">
          <Funnel m={m} />
        </Panel>
        <Panel title="System" id="system">
          <System m={m} />
        </Panel>
      </div>
    </div>
  );
}

function Alerts({ alerts }: { alerts: AdminMetrics["alerts"] }) {
  const list = sortedAlerts(alerts);
  return (
    <section aria-label="Alerts" data-testid="dash-alerts">
      {list.length === 0 ? (
        <p className="pill ok" data-testid="dash-alerts-none">
          <span className="dot" aria-hidden="true" /> Nothing needs attention
        </p>
      ) : (
        <ul className="dash-alerts" role="list">
          {list.map((a) => (
            <li key={a.key} className={`dash-alert ${a.level}`} data-testid={`alert-${a.key}`}>
              <b>{LEVEL_TEXT[a.level]}</b> {alertText(a.key)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Card({ label, value, sub, series, start, id }: { label: string; value: number; sub: string; series?: number[]; start?: string; id: string }) {
  return (
    <div className="panel dash-card" role="listitem" data-testid={`card-${id}`}>
      <span className="eyebrow">{label}</span>
      <b className="dash-num" data-testid={`card-${id}-value`} title={value.toLocaleString("en-US")}>
        {compact(value)}
      </b>
      <span className="small muted">{sub}</span>
      {series && start && <Spark label={label} values={series} start={start} />}
    </div>
  );
}

/** A 24-bar chart. The table behind it carries every number, so nothing depends on seeing the bars. */
function Spark({ label, values, start }: { label: string; values: number[]; start: string }) {
  const heights = barHeights(values);
  const top = Math.max(0, ...values);
  const busiest = values.indexOf(top);
  const summary = top === 0 ? `${label}: none in the last 24 hours` : `${label}: ${sum(values)} in the last 24 hours, most in the hour from ${bucketLabel(start, busiest)} (${top})`;
  return (
    <div className="dash-spark">
      <svg viewBox="0 0 96 24" preserveAspectRatio="none" role="img" aria-label={summary} data-testid="spark">
        {heights.map((h, i) => (
          <rect key={i} x={i * 4 + 0.5} width={3} y={24 - Math.max(1, h * 22)} height={Math.max(1, h * 22)} className={h === 0 ? "dash-bar zero" : "dash-bar"} />
        ))}
      </svg>
      <details>
        <summary className="small">Show as table</summary>
        <table className="dash-table">
          <caption className="sr-only">{label} per hour, oldest first</caption>
          <thead>
            <tr>
              <th scope="col">Hour</th>
              <th scope="col">Count</th>
            </tr>
          </thead>
          <tbody>
            {values.map((v, i) => (
              <tr key={i}>
                <th scope="row">{bucketLabel(start, i)}</th>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function Panel({ title, id, children }: { title: string; id: string; children: ReactNode }) {
  return (
    <section className="panel" aria-labelledby={`dash-${id}`} data-testid={`panel-${id}`}>
      <div className="panel-h">
        <h2 className="h3" id={`dash-${id}`}>
          {title}
        </h2>
      </div>
      <div className="panel-b">{children}</div>
    </section>
  );
}

/** Horizontal bars with the number written beside each one, so colour never carries meaning alone. */
function Bars({ rows, note, tone }: { rows: [string, number][]; note?: string; tone?: "verdict" }) {
  const total = sum(rows.map((r) => r[1]));
  const top = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <div className="stack">
      <ul className="dash-bars" role="list">
        {rows.map(([name, n]) => (
          <li key={name} data-testid={`bar-${name}`}>
            <span className="dash-bar-name">{name}</span>
            <span className="dash-bar-track" aria-hidden="true">
              <span className={`dash-bar-fill${tone === "verdict" ? ` v-${name.split(" ")[0].toLowerCase()}` : ""}`} style={{ width: `${(n / top) * 100}%` }} />
            </span>
            <span className="dash-bar-n">
              {compact(n)}
              {tone === "verdict" && total > 0 ? ` (${percent(n, total)}%)` : ""}
            </span>
          </li>
        ))}
      </ul>
      {note && <span className="small muted">{note}</span>}
    </div>
  );
}

/** Which kind of component limited the design, in runs that were strained or failed. Empty is good news, and says so. */
function Breaks({ m }: { m: AdminMetrics }) {
  const rows = (Object.keys(COMPONENT_TEXT) as (keyof typeof COMPONENT_TEXT)[]).map((k) => [COMPONENT_TEXT[k], m.runs.bottlenecks[k]] as [string, number]).filter((r) => r[1] > 0);
  if (rows.length === 0) return <p className="muted" data-testid="breaks-none">No finished run has been strained or failed yet.</p>;
  return <Bars rows={rows.sort((a, b) => b[1] - a[1])} note="The component that limited the design in runs that were strained or failed." />;
}

function Queue({ m }: { m: AdminMetrics }) {
  const q = m.runs.queue;
  return (
    <div className="stack" data-testid="queue">
      <div className="row">
        <b className="dash-num sm" data-testid="queue-pending">
          {compact(q.pending)}
        </b>
        <span className="muted">{q.pending === 1 ? "run waiting" : "runs waiting"}</span>
      </div>
      <span className="small muted" data-testid="queue-oldest">
        {q.oldestPendingSeconds === null ? "Nothing is waiting." : `The oldest has waited ${ageText(q.oldestPendingSeconds)}.`}
      </span>
    </div>
  );
}

function AiUsage({ m }: { m: AdminMetrics }) {
  const a = m.ai;
  const calls = a.completed + a.failed;
  return (
    <div className="stack" data-testid="ai-usage">
      <Bars rows={(Object.keys(TASK_TEXT) as (keyof typeof TASK_TEXT)[]).map((k) => [TASK_TEXT[k], a.byTask[k]])} />
      <h3 className="h3">What happened to the calls</h3>
      <Bars rows={(Object.keys(OUTCOME_TEXT) as (keyof typeof OUTCOME_TEXT)[]).map((k) => [OUTCOME_TEXT[k], a.byOutcome[k]])} />
      <dl className="dash-dl">
        <dt>Failed share</dt>
        <dd>{compact(a.failed)}{calls > 0 ? ` (${percent(a.failed, calls)}%)` : ""}</dd>
        <dt>Tokens used</dt>
        <dd>{compact(a.tokens24h)}</dd>
        <dt>Answer time</dt>
        <dd data-testid="ai-latency">{a.latencyMs.p50 === null ? "no answers yet" : `typically ${a.latencyMs.p50} ms, slowest 1 in 20 over ${a.latencyMs.p95} ms`}</dd>
        <dt>Last minute</dt>
        <dd data-testid="ai-minute">
          {a.usage.lastMinute} of {a.usage.limitPerMinute} allowed
        </dd>
        <dt>Today (UTC)</dt>
        <dd data-testid="ai-day">
          {compact(a.usage.today)} of {compact(a.usage.limitPerDay)} allowed
        </dd>
      </dl>
    </div>
  );
}

function Funnel({ m }: { m: AdminMetrics }) {
  const f = m.funnel;
  const steps: [string, number][] = [
    ["Registered", f.registered],
    ["Made a design", f.createdDesign],
    ["Ran a simulation", f.ranDesign],
    ["Shared a design", f.sharedDesign],
  ];
  return (
    <ol className="dash-funnel" data-testid="funnel">
      {steps.map(([name, n], i) => (
        <li key={name}>
          <span>{name}</span>
          <b>{compact(n)}</b>
          <span className="small muted">{i === 0 ? "of accounts" : `${percent(n, f.registered)}% of accounts`}</span>
        </li>
      ))}
    </ol>
  );
}

function System({ m }: { m: AdminMetrics }) {
  const s = m.system;
  const row = (name: string, ok: boolean, text: string) => (
    <li key={name} className="row between">
      <span>{name}</span>
      <span className={`pill ${ok ? "ok" : "fail"}`}>
        <span className="dot" aria-hidden="true" /> {text}
      </span>
    </li>
  );
  return (
    <ul className="dash-system stack" role="list" data-testid="system">
      {row("Database", s.database.ok, s.database.ok ? `Up, ${s.database.latencyMs} ms` : "Not answering")}
      {row("Cache", s.cache.ok, s.cache.ok ? "Up" : "Not answering")}
      <li className="row between">
        <span>Server running for</span>
        <b>{ageText(s.uptimeSeconds)}</b>
      </li>
    </ul>
  );
}
