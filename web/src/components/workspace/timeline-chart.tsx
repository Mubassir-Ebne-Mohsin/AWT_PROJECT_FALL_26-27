import { useId } from "react";
import type { Simulation } from "@/lib/result-presentation";
import {
  timelineGeometry,
  numberText,
  milliseconds,
  percent,
} from "@/lib/result-presentation";
export function TimelineChart({ output }: { output: Simulation }) {
  const id = useId(),
    t = output.summary.traffic,
    pts = output.timeline;
  if (!pts.length)
    return (
      <p className="hint">No timeline samples were returned for this run.</p>
    );
  const g = timelineGeometry(pts, t.sloP95, t.durationMin);
  return (
    <div className="stack">
      <svg
        className="chart m7-chart"
        viewBox="0 0 720 252"
        role="img"
        aria-labelledby={id}
      >
        <title id={id}>
          Recorded p95 latency and request rate; illustrative sampled timeline
        </title>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line
              className="gl"
              x1="58"
              x2="654"
              y1={g.y(g.latencyMax * f)}
              y2={g.y(g.latencyMax * f)}
            />
            <text x="50" y={g.y(g.latencyMax * f) + 4} textAnchor="end">
              {numberText(g.latencyMax * f, 1)}
            </text>
            <text x="662" y={g.ry(g.rateMax * f) + 4}>
              {numberText(g.rateMax * f, 0)}
            </text>
            <text x={g.x(g.end * f)} y="245" textAnchor="middle">
              {numberText(g.end * f, 1)} min
            </text>
          </g>
        ))}
        <text x="58" y="16">
          Latency (ms)
        </text>
        <text x="654" y="16" textAnchor="end">
          Traffic (rps)
        </text>
        <path className="a-rps" d={g.rate} />
        <path className="l-p95" d={g.line} />
        <line
          className="slo"
          x1="58"
          x2="654"
          y1={g.y(t.sloP95)}
          y2={g.y(t.sloP95)}
        />
        <text className="slo-t" x="64" y={g.y(t.sloP95) - 7}>
          target {milliseconds(t.sloP95)}
        </text>
      </svg>
      <div className="legend">
        <span>
          <i style={{ background: "var(--accent)" }} />
          p95
        </span>
        <span>
          <i style={{ background: "var(--ink-4)" }} />
          requests/s
        </span>
        <span>
          <i style={{ background: "var(--warn)" }} />
          target
        </span>
      </div>
      <p className="hint">
        Illustrative sampled timeline from this recorded run. Independent
        modeled samples; not measured infrastructure performance.
      </p>
      <details>
        <summary>Read timeline data</summary>
        <div className="tbl-wrap">
          <table className="tbl">
            <caption className="sr-only">Recorded timeline samples</caption>
            <thead>
              <tr>
                <th>Minute</th>
                <th>Requests/s</th>
                <th>p95</th>
                <th>Errors</th>
              </tr>
            </thead>
            <tbody>
              {pts.map((p, i) => (
                <tr key={i}>
                  <td>{numberText(p.t)}</td>
                  <td>{numberText(p.rps)}</td>
                  <td>{milliseconds(p.p95)}</td>
                  <td>{percent(p.err)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
