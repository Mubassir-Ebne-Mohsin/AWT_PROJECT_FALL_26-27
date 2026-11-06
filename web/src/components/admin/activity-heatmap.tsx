"use client";
import type { CSSProperties } from "react";
import type { AdminMetrics } from "@/lib/admin-metrics";
const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
export function ActivityHeatmap({ m }: { m: AdminMetrics }) {
  const h = m.heatmap,
    peak = Math.max(1, ...h.cells);
  return (
    <section
      className="panel"
      aria-labelledby="activity-title"
      data-testid="activity-heatmap"
    >
      <div className="panel-h">
        <h2 className="h3" id="activity-title">
          Peak hours · UTC
        </h2>
      </div>
      <div className="panel-body stack">
        <p>
          Rolling 28 days:{" "}
          <b data-testid="activity-designs">{h.designsCreated}</b> designs +{" "}
          <b data-testid="activity-runs">{h.runsCreated}</b> runs ={" "}
          <b data-testid="activity-total">{h.total}</b> activities.
        </p>
        <p className="small muted">
          {h.windowStart} to {h.windowEnd} (end excluded). These totals use a
          different window from the 24-hour charts.
        </p>
        <div className="activity-scroll" aria-hidden="true">
          <div className="activity-grid">
            <span />
            {Array.from({ length: 24 }, (_, hour) => (
              <span key={hour}>{hour}</span>
            ))}
            {DAYS.map((day, d) => (
              <div className="activity-row" key={day}>
                <span>{day.slice(0, 3)}</span>
                {h.cells.slice(d * 24, d * 24 + 24).map((n, hour) => (
                  <span
                    className="activity-cell"
                    key={hour}
                    data-testid="activity-cell"
                    title={`${day} ${hour}:00 UTC: ${n}`}
                    style={{ "--activity-strength": n / peak } as CSSProperties}
                  >
                    {n}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
        <p className="small muted">
          Lighter to stronger accent = fewer to more activities. Every cell also
          shows its count; 0 means no activity.
        </p>
        <details>
          <summary>Show activity as table</summary>
          <div
            className="activity-table-scroll"
            tabIndex={0}
            role="region"
            aria-label="Scrollable UTC activity table"
          >
            <table
              className="table"
              aria-label="Activity by UTC weekday and hour"
            >
              <caption>Designs and runs created, rolling 28 days · UTC</caption>
              <thead>
                <tr>
                  <th scope="col">Weekday</th>
                  <th scope="col">UTC hour</th>
                  <th scope="col">Count</th>
                </tr>
              </thead>
              <tbody>
                {h.cells.map((n, i) => (
                  <tr key={i}>
                    <th scope="row">{DAYS[Math.floor(i / 24)]}</th>
                    <td>{i % 24}:00</td>
                    <td>{n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </section>
  );
}
