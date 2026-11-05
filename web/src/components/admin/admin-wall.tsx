"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RoleGate } from "@/components/auth/role-gate";
import { useLiveMetrics } from "@/components/admin/use-live-metrics";
import { LEVEL_TEXT, STATUS_TEXT, WALL_CYCLE_S, ageText, alertText, compact, liveStatus, percent, sortedAlerts, sum, utcTime, wallPanel } from "@/lib/admin-metrics";
import type { AdminMetrics } from "@/lib/admin-metrics";

const PANELS = ["Run queue", "AI use", "How far people get"] as const;

export function AdminWall() {
  return (
    <div className="page stack lg dash-wall">
      <div className="row between">
        <div className="stack">
          <span className="eyebrow">Admin</span>
          <h1 className="h1">StressForge right now</h1>
        </div>
        <Link href="/admin/dashboard" className="btn btn-sm">
          Back to the dashboard
        </Link>
      </div>
      <RoleGate role="admin">
        <Wall />
      </RoleGate>
    </div>
  );
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(q.matches);
    const on = (e: MediaQueryListEvent) => setReduced(e.matches);
    q.addEventListener?.("change", on);
    return () => q.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

function Wall() {
  const { state, denied } = useLiveMetrics(true);
  const [tick, setTick] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const reduced = useReducedMotion();
  useEffect(() => {
    const id = setInterval(() => {
      setTick((t) => t + 1);
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, []);
  const status = liveStatus(state, now);
  const m = state.data;

  if (denied)
    return (
      <div className="empty" role="alert">
        <h2 className="h3">Your Admin access was removed</h2>
      </div>
    );
  if (!m)
    return (
      <p className="muted" role="status">
        Loading the first numbers…
      </p>
    );

  const alerts = sortedAlerts(m.alerts);
  const shown = wallPanel(tick, PANELS.length, !reduced);
  return (
    <div className={`stack lg${status === "stale" ? " dash-stale" : ""}`} data-testid="admin-wall" data-live={status}>
      <div className="row between">
        <span className={`pill ${status === "live" ? "ok" : status === "stale" ? "fail" : status === "reconnecting" ? "warn" : "outline"}`} role="status" data-testid="wall-status">
          <span className="dot" aria-hidden="true" /> {STATUS_TEXT[status]}
        </span>
        <span className="muted" data-testid="wall-updated">
          Numbers from {utcTime(m.generatedAt)}
        </span>
      </div>
      <div className="dash-wall-grid" role="list">
        <Big label="Accounts" value={m.totals.users} id="users" />
        <Big label="Designs" value={m.totals.designs} id="designs" />
        <Big label="Simulation runs" value={m.totals.runs} id="runs" />
        <Big label="Active now" value={m.activeNow} id="active" />
      </div>
      <section aria-label="Alerts" className="dash-wall-alerts" data-testid="wall-alerts">
        {alerts.length === 0 ? (
          <span className="pill ok">
            <span className="dot" aria-hidden="true" /> Nothing needs attention
          </span>
        ) : (
          <ul className="dash-alerts" role="list">
            {alerts.map((a) => (
              <li key={a.key} className={`dash-alert ${a.level}`}>
                <b>{LEVEL_TEXT[a.level]}</b> {alertText(a.key)}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="panel" aria-label={PANELS[shown]} data-testid="wall-panel" data-panel={PANELS[shown]}>
        <div className="panel-h">
          <h2 className="h3">{PANELS[shown]}</h2>
          <span className="small muted">{reduced ? "Not changing, because reduced motion is on" : `Changes every ${WALL_CYCLE_S} s`}</span>
        </div>
        <div className="panel-b dash-wall-body">{shown === 0 ? <WallQueue m={m} /> : shown === 1 ? <WallAi m={m} /> : <WallFunnel m={m} />}</div>
      </section>
    </div>
  );
}

function Big({ label, value, id }: { label: string; value: number; id: string }) {
  return (
    <div className="panel dash-wall-card" role="listitem" data-testid={`wall-${id}`}>
      <span className="eyebrow">{label}</span>
      <b className="dash-wall-num" title={value.toLocaleString("en-US")}>
        {compact(value)}
      </b>
    </div>
  );
}

function WallQueue({ m }: { m: AdminMetrics }) {
  const q = m.runs.queue;
  return (
    <p className="dash-wall-line">
      <b>{compact(q.pending)}</b> {q.pending === 1 ? "run waiting" : "runs waiting"}
      {q.oldestPendingSeconds !== null ? `, the oldest for ${ageText(q.oldestPendingSeconds)}` : ""}
    </p>
  );
}

function WallAi({ m }: { m: AdminMetrics }) {
  const a = m.ai;
  const calls = sum(m.series.aiCalls);
  return (
    <p className="dash-wall-line">
      <b>{compact(calls)}</b> AI calls in 24 hours, <b>{percent(a.failed, a.completed + a.failed)}%</b> failed
      {a.latencyMs.p50 !== null ? `, typically ${a.latencyMs.p50} ms` : ""}
    </p>
  );
}

function WallFunnel({ m }: { m: AdminMetrics }) {
  const f = m.funnel;
  return (
    <p className="dash-wall-line">
      <b>{compact(f.registered)}</b> registered, <b>{compact(f.createdDesign)}</b> made a design, <b>{compact(f.ranDesign)}</b> ran a simulation, <b>{compact(f.sharedDesign)}</b> shared one
    </p>
  );
}
