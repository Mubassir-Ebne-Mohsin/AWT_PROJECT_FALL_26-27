import { useId } from "react";
import Link from "next/link";
import type { DesignRun } from "@/lib/api/designs";
import {
  causeText,
  curveRowText,
  firstComponent,
  headroomText,
  limitsHeadline,
  orderRows,
  rampGeometry,
  rpsText,
  type LimitsOutput,
} from "@/lib/limits-presentation";
import { milliseconds, numberText, percent } from "@/lib/result-presentation";
import { workspaceHref, type Selection } from "@/lib/run-links";

interface Props {
  designId: string;
  run?: DesignRun;
  stale: boolean;
  selection: Selection;
  canFind: boolean;
  finding: boolean;
  uncertain: boolean;
  blockedReason?: string;
  onFind: () => void;
}

/** Saved Limits search (prototype SECTION 16 LimitsTab), rendered only from a recorded backend result. */
export function LimitsTab(p: Props) {
  const r = p.run;
  return (
    <section className="stack lg m8-limits" aria-label="Limits">
      <div className="row between">
        <div className="stack" style={{ gap: 4 }}>
          <h2 className="h2">Breaking point</h2>
          <p className="muted">
            A saved search ramps average entry traffic until p95 passes its target or errors pass
            the budget. Bursts stay on throughout. Model estimate, not measured capacity.
          </p>
        </div>
        <div className="row">
          <Link className="btn btn-sm" href={workspaceHref(p.designId, "traffic", p.selection)}>
            Change targets
          </Link>
          <button className="btn btn-primary btn-sm" disabled={!p.canFind} onClick={p.onFind}>
            {p.finding
              ? "Submitting…"
              : p.uncertain
                ? "Retry same Limits request"
                : r?.status === "pending"
                  ? "Searching…"
                  : "Find limits"}
          </button>
        </div>
      </div>
      {p.blockedReason && <p className="hint">{p.blockedReason}</p>}
      {p.uncertain && (
        <p className="note warn">
          Limits acceptance is unconfirmed. Retry the same Limits request to recover its status; it
          is never resubmitted as a test run.
        </p>
      )}
      {!r ? (
        <div className="panel empty">
          No saved Limits search for this design yet. Find limits saves your latest valid inputs
          first, then searches that saved revision.
        </div>
      ) : r.status === "pending" ? (
        <div className="note accent" role="status">
          Limits search queued or running for revision {r.designRevision}. You can leave this page;
          accepted work continues.
        </div>
      ) : r.status === "failed" ? (
        <div className="note fail" role="alert">
          {r.failure.code}: {r.failure.message} Use Find limits for a new calculation.
        </div>
      ) : r.result.kind !== "limits" ? (
        <p className="note warn">This selection is a test run. Open Results to inspect it.</p>
      ) : (
        <LimitsResult run={r} result={r.result} stale={p.stale} designId={p.designId} selection={p.selection} />
      )}
    </section>
  );
}

function LimitsResult({
  run,
  result,
  stale,
  designId,
  selection,
}: {
  run: DesignRun;
  result: LimitsOutput;
  stale: boolean;
  designId: string;
  selection: Selection;
}) {
  const head = limitsHeadline(result),
    room = headroomText(result),
    first = firstComponent(result),
    rows = orderRows(result),
    t = result.current.traffic;
  return (
    <>
      {stale && (
        <div className="note warn" role="status">
          Stale search — inputs changed since revision {run.designRevision}. Every number below
          still describes that saved snapshot. Find limits again to search your current design.
        </div>
      )}
      <div className="readouts m9-limits-readouts">
        <div className="readout">
          <div className="eyebrow">{head.label}</div>
          <div className={"v c-" + head.tone} style={{ fontSize: 19 }}>{head.value}</div>
          <div className="s">{head.detail}</div>
        </div>
        <div className="readout">
          <div className="eyebrow">Fails because</div>
          <div className="v" style={{ fontSize: 17, marginTop: 8 }}>{causeText(result)}</div>
          <div className="s">
            {result.state === "notReachedWithinRange"
              ? "—"
              : "At the failing load: p95 " + milliseconds(result.at.p95) + " · errors " + percent(result.at.errorRate)}
          </div>
        </div>
        <div className="readout">
          <div className="eyebrow">Gives out first</div>
          <div className="v" style={{ fontSize: 17, marginTop: 8 }}>{first ? first.label : "—"}</div>
          <div className="s">
            {first?.rhoAtFailure != null
              ? "at " + numberText(first.rhoAtFailure * 100, 0) + "% utilization when it fails"
              : result.state === "failsAtMinimumLoad"
                ? "Latency built into the layout can fail before capacity does"
                : "No component reached its limit in the tested range"}
          </div>
        </div>
        <div className="readout">
          <div className="eyebrow">Headroom</div>
          <div className="v" style={{ fontSize: 19 }}>{room.value}</div>
          <div className="s">{room.detail}</div>
        </div>
      </div>
      <div className="split">
        <section className="panel" style={{ minWidth: 0 }}>
          <div className="panel-h">
            <h3 className="h3">Ramp test</h3>
            <div className="legend">
              <span><i style={{ background: "var(--accent)" }} />p95</span>
              <span><i style={{ background: "var(--accent)", opacity: 0.5 }} />p99</span>
              <span><i style={{ background: "var(--fail)" }} />errors</span>
              <span><i style={{ background: "var(--warn)" }} />target / budget</span>
            </div>
          </div>
          <div className="panel-b stack">
            <RampChart result={result} />
            <p className="hint">
              Tested 1–{rpsText(result.maximumTestedRps)} average entry traffic
              {result.state === "found" ? `, ${result.searchIterations} refinement iterations` : ""}. Curve
              points are independent model evaluations.
            </p>
            <details>
              <summary>Read ramp data</summary>
              <div className="tbl-wrap">
                <table className="tbl">
                  <caption className="sr-only">Saved Limits ramp samples</caption>
                  <thead>
                    <tr><th>Average rps</th><th>p50</th><th>p95</th><th>p99</th><th>Errors</th><th>Busiest utilization</th></tr>
                  </thead>
                  <tbody>
                    {result.curve.map((point, i) => {
                      const c = curveRowText(point);
                      return (
                        <tr key={i}>
                          <td>{c.rps}</td><td>{c.p50}</td><td>{c.p95}</td><td>{c.p99}</td><td>{c.err}</td><td>{c.maxRho}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        </section>
        <section className="panel" style={{ minWidth: 0 }}>
          <div className="panel-h">
            <h3 className="h3">Saturation order</h3>
            <span className="hint">{result.orderLabel}</span>
          </div>
          <div className="panel-b">
            {rows.length === 0 && <p className="hint">No component has a finite saturation load.</p>}
            {rows.map((row, i) => (
              <div className="fo-row" key={row.id}>
                <span className="ix">{i + 1}</span>
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: i === 0 ? 700 : 500 }}>
                  {row.label}
                </span>
                <div className="fo-bar" aria-hidden="true">
                  <i style={{ width: row.width + "%", background: row.tone ? `var(--${row.tone})` : "var(--ink-4)" }} />
                </div>
                <span className="mono small num nowrap">
                  {row.sat} {row.ratio && <span className="muted">{row.ratio}</span>}{" "}
                  <Link href={workspaceHref(designId, "edit", { ...selection, limits: run.id }) + "&node=" + encodeURIComponent(row.id)}>
                    Edit <span className="sr-only">{row.label}</span>
                  </Link>
                </span>
              </div>
            ))}
            <p className="hint" style={{ marginTop: 10 }}>
              Predicted saturation under unshed demand: each component&apos;s 100% load if it received its
              full share. Not a chronological failure trace; latency or error targets can fail before
              anything reaches 100%. {t.rps > 0 ? "Red: already past 100% at today's average traffic. Amber: within ×1.5." : "Current traffic is 0 rps, so no colour is relative to today's load."}
            </p>
            {result.state === "failsAtMinimumLoad" && (
              <div className="note warn">
                This design misses its targets at the minimum tested load, so the limiting cause is
                latency or errors built into the layout rather than capacity alone.
                {result.current.crossRegion.length > 0 && " Calls cross regions: moving servers next to users may help."}
              </div>
            )}
          </div>
        </section>
      </div>
      <dl className="kv m8-provenance">
        <dt>Saved revision</dt><dd>{run.designRevision}</dd>
        <dt>Fingerprint</dt><dd title={run.fingerprint}>{run.fingerprint.slice(0, 12)}…</dd>
        <dt>Engine</dt><dd>{run.engineVersion}</dd>
        <dt>Calculated</dt><dd>{new Date(run.createdAt).toLocaleString()}</dd>
        <dt>Traffic searched</dt><dd>{rpsText(t.rps)} today · ×{numberText(t.burst)} bursts · p95 target {milliseconds(t.sloP95)} · budget {percent(t.errorBudget)}</dd>
      </dl>
    </>
  );
}

function RampChart({ result }: { result: LimitsOutput }) {
  const id = useId(),
    g = rampGeometry(result),
    t = result.current.traffic;
  if (!result.curve.length) return <p className="hint">No ramp samples were returned for this search.</p>;
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  return (
    <svg className="chart m8-ramp" viewBox="0 0 720 340" role="img" aria-labelledby={id}>
      <title id={id}>
        p95/p99 latency and error rate as average entry traffic ramps up; saved Limits search
      </title>
      <text x={g.left} y={g.top - 8} style={{ fontWeight: 700 }}>Latency (ms)</text>
      <text x={g.left} y={g.bot - 8} style={{ fontWeight: 700 }}>Error rate</text>
      {ticks.map((f) => (
        <g key={f}>
          <line className="gl" x1={g.left} x2={g.right} y1={g.y(g.latencyMax * f)} y2={g.y(g.latencyMax * f)} />
          <text x={g.left - 8} y={g.y(g.latencyMax * f) + 4} textAnchor="end">{numberText(g.latencyMax * f, 0)}</text>
          <text x={g.x(g.xmax * f)} y={334} textAnchor="middle">{numberText(g.xmax * f, 0)}</text>
        </g>
      ))}
      {[0, 0.5, 1].map((f) => (
        <g key={"e" + f}>
          <line className="gl" x1={g.left} x2={g.right} y1={g.ey(g.errorMax * f)} y2={g.ey(g.errorMax * f)} />
          <text x={g.left - 8} y={g.ey(g.errorMax * f) + 4} textAnchor="end">{percent(g.errorMax * f)}</text>
        </g>
      ))}
      <text x={g.right} y={334 - 14} textAnchor="end">average entry traffic (rps)</text>
      <path className="l-p99" d={g.p99} />
      <path className="l-p95" d={g.p95} />
      <path className="l-err" d={g.err} />
      <line className="slo" x1={g.left} x2={g.right} y1={g.y(t.sloP95)} y2={g.y(t.sloP95)} />
      <text className="slo-t" x={g.right - 4} y={g.y(t.sloP95) - 6} textAnchor="end">target {milliseconds(t.sloP95)}</text>
      <line className="slo" x1={g.left} x2={g.right} y1={g.ey(t.errorBudget)} y2={g.ey(t.errorBudget)} />
      <text className="slo-t" x={g.right - 4} y={g.ey(t.errorBudget) - 6} textAnchor="end">budget {percent(t.errorBudget)}</text>
      <line className="ax" x1={g.left} x2={g.right} y1={g.top + g.topH} y2={g.top + g.topH} />
      <line className="ax" x1={g.left} x2={g.right} y1={g.bot + g.botH} y2={g.bot + g.botH} />
      {g.markers.current !== null && (
        <g>
          <line className="mk-cur" x1={g.x(g.markers.current)} x2={g.x(g.markers.current)} y1={g.top} y2={g.bot + g.botH} />
          <text className="mk-t" x={g.x(g.markers.current) + 5} y={g.top + 12}>now {rpsText(g.markers.current)}</text>
        </g>
      )}
      {g.markers.passing !== null && (
        <line className="mk-brk" strokeDasharray="2 3" x1={g.x(g.markers.passing)} x2={g.x(g.markers.passing)} y1={g.top} y2={g.bot + g.botH} />
      )}
      {g.markers.failing !== null && (
        <g>
          <line className="mk-brk" x1={g.x(g.markers.failing)} x2={g.x(g.markers.failing)} y1={g.top} y2={g.bot + g.botH} />
          <text className="mk-t f" x={g.x(g.markers.failing) + 5} y={g.top + 26}>
            {result.state === "found" ? "first failing " + rpsText(g.markers.failing) : "fails at 1 rps (minimum tested)"}
          </text>
        </g>
      )}
    </svg>
  );
}
