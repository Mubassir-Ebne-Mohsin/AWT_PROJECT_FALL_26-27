import { useState } from "react";
import Link from "next/link";
import type { DesignRun } from "@/lib/api/designs";
import type { Summary, Simulation } from "@/lib/result-presentation";
import {
  numberText,
  percent,
  milliseconds,
  boundedText,
  verdictReasons,
} from "@/lib/result-presentation";
import { TimelineChart } from "@/components/workspace/timeline-chart";
import { RecordedTopology } from "@/components/workspace/recorded-topology";
export function RunResults({
  run,
  stale,
  compact = false,
  currentNodeIds,
}: {
  run?: DesignRun;
  stale: boolean;
  compact?: boolean;
  /** Component ids in the current draft; Edit links appear only for components that still exist. */
  currentNodeIds?: string[];
}) {
  if (!run)
    return (
      <div className="panel empty">
        Run the saved design to see model estimates.
      </div>
    );
  if (run.status === "pending")
    return (
      <div className="note accent" role="status">
        Queued or running… You can leave this page; accepted work continues.
      </div>
    );
  if (run.status === "failed")
    return (
      <div className="note fail" role="alert">
        {run.failure.code}: {run.failure.message} Use Run test for a new
        calculation.
      </div>
    );
  if (run.result.kind !== "simulation")
    return (
      <p className="note warn">
        This is a Limits calculation. Open the Limits tab to inspect it when
        available.
      </p>
    );
  const s = run.result.summary,
    b = s.nodes.find((n) => n.id === s.bottleneckId);
  return (
    <section className="stack lg" aria-label="Recorded model results">
      {stale && (
        <div className="note warn" role="status">
          Stale result — inputs changed. Run again after saving. All numbers
          below still describe the recorded snapshot.
        </div>
      )}
      <div className="row between">
        <h2 className="h2">Model results</h2>
        <span
          className={
            "pill " +
            (s.verdict === "pass"
              ? "ok"
              : s.verdict === "fail"
                ? "fail"
                : "warn")
          }
        >
          {s.verdict}
        </span>
      </div>
      <div className={"verdict " + s.verdict}>
        <div>
          <h3 className="vt">
            {s.verdict === "pass"
              ? "Passes comfortably"
              : s.verdict === "strained"
                ? "Passes, with little headroom"
                : "Breaks under this load"}
          </h3>
          <ul className="m7-reasons">
            {verdictReasons(s).map((reason, i) => (
              <li key={i}>{reason}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="readouts m7-readouts">
        {[
          ["p50 latency", milliseconds(s.p50), "Half of requests are faster"],
          [
            "p95 latency",
            milliseconds(s.p95),
            "Target " + milliseconds(s.traffic.sloP95),
          ],
          ["p99 latency", milliseconds(s.p99), "One in 100 is slower"],
          [
            "Errors",
            percent(s.errorRate),
            "Budget " + percent(s.traffic.errorBudget),
          ],
          [
            "Served",
            numberText(s.throughput) + " rps",
            "Of " + numberText(s.rps) + " average rps",
          ],
          [
            "Bottleneck",
            b?.label ?? "None",
            b ? percent(b.rho) + " utilization" : "No qualifying bottleneck",
          ],
        ].map(([label, value, note]) => (
          <div className="readout" key={label}>
            <span className="eyebrow">{label}</span>
            <div className="v num">{value}</div>
            <div className="s">{note}</div>
          </div>
        ))}
      </div>
      <p className="hint">
        Mathematical estimates, not measured infrastructure performance.
        Revision {run.designRevision} · {run.engineVersion} ·{" "}
        {new Date(run.createdAt).toLocaleString()}
      </p>
      <details>
        <summary>Tested inputs and fingerprint</summary>
        <p className="num small m3-wrap">{run.fingerprint}</p>
        <p>
          {s.traffic.rps} rps × {s.traffic.burst} burst · target p95{" "}
          {s.traffic.sloP95} ms · error budget {percent(s.traffic.errorBudget)}{" "}
          · {s.traffic.durationMin} modeled minutes · {s.traffic.shape}
        </p>
        <details>
          <summary>Recorded architecture and traffic</summary>
          <pre className="m3-wrap">{JSON.stringify(run.snapshot, null, 2)}</pre>
        </details>
      </details>
      {compact ? (
        <Link
          className="btn"
          href={"/designs/" + run.designId + "/results?run=" + run.id}
        >
          Open full results
        </Link>
      ) : (
        <ResultDetails key={run.id} run={run} output={run.result} summary={s} currentNodeIds={currentNodeIds} />
      )}
    </section>
  );
}
function ResultDetails({
  run,
  output,
  summary: s,
  currentNodeIds,
}: {
  run: DesignRun;
  output: Simulation;
  summary: Summary;
  currentNodeIds?: string[];
}) {
  const [selected, setSelected] = useState(s.bottleneckId ?? "");
  const node = s.nodes.find((n) => n.id === selected);
  const contributions = s.nodes
    .filter((n) => n.contribution > 0)
    .sort((a, b) => b.contribution - a.contribution);
  const rows = s.nodes
    .filter((n) => n.type !== "client")
    .slice()
    .sort((a, b) => b.rho - a.rho);
  return (
    <div className="m7-split m7-results">
      <div className="stack lg">
        <section className="panel">
          <div className="panel-h">
            <h3 className="h3">Topology under load</h3>
            <span className="hint">Revision {run.designRevision} snapshot</span>
          </div>
          <div className="panel-b">
            <RecordedTopology
              graph={run.snapshot.graph}
              summary={s}
              selected={selected}
              onSelect={setSelected}
            />
          </div>
        </section>
        <section className="panel">
          <div className="panel-h">
            <h3 className="h3">Test timeline</h3>
          </div>
          <div className="panel-b">
            <TimelineChart output={output} />
          </div>
        </section>
        <section className="panel">
          <div className="panel-h">
            <h3 className="h3">Components under load</h3>
            <span className="hint">Sorted by utilization</span>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <caption className="sr-only">
                Recorded component metrics; choose a component to inspect it
              </caption>
              <thead>
                <tr>
                  <th>Component</th>
                  <th>Peak load</th>
                  <th>Capacity</th>
                  <th>Utilization</th>
                  <th>Mean time</th>
                  <th>Rejected</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((n) => (
                  <tr
                    key={n.id}
                    className={n.id === selected ? "m7-selected" : ""}
                  >
                    <td>
                      <button
                        className="m7-row-button"
                        aria-pressed={selected === n.id}
                        onClick={() => setSelected(n.id)}
                      >
                        {n.label}
                      </button>
                      {n.background && <span className="tag">bg</span>}
                      <span
                        className={
                          "pill " +
                          (n.status === "warn"
                            ? "warn"
                            : n.status === "fail"
                              ? "fail"
                              : "ok")
                        }
                      >
                        {n.status}
                      </span>
                    </td>
                    <td>{numberText(n.peak)} rps</td>
                    <td>{boundedText(n.cap, " rps")}</td>
                    <td>
                      <span className={"meter " + n.status}>
                        <i
                          style={{ width: Math.min(100, n.rho * 100) + "%" }}
                        />
                      </span>
                      {percent(n.rho)}
                    </td>
                    <td>{milliseconds(n.T)}</td>
                    <td>{percent(n.errors)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel">
          <div className="panel-h">
            <h3 className="h3">How requests travel</h3>
          </div>
          <div className="panel-b stack">
            {output.paths.length ? (
              output.paths.map((p, i) => (
                <div className="pathrow" key={i}>
                  <span className="tag">{p.kind}</span>
                  <div className="grow">
                    <p className="m7-path">
                      {p.steps.map((st) => st.label).join(" → ")}
                    </p>
                    <p className="hint">
                      {percent(p.p)} of requests · {percent(1 - p.ok)} fail on
                      this path
                    </p>
                    <p className="hint">
                      Mean {milliseconds(p.mean)} · p95 {milliseconds(p.p95)}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="hint">
                No request paths were returned for this run.
              </p>
            )}
            <p className="hint">
              Returned common paths only; this is not an exhaustive list of
              every possible route.
            </p>
          </div>
        </section>
      </div>
      <aside className="stack lg">
        <section className="panel">
          <div className="panel-h">
            <h3 className="h3">Component inspection</h3>
          </div>
          <div className="panel-b stack">
            {node ? (
              <>
                <h4 className="h3">{node.label}</h4>
                <dl className="kv">
                  <dt>Peak load</dt>
                  <dd>{numberText(node.peak)} rps</dd>
                  <dt>Capacity</dt>
                  <dd>{boundedText(node.cap, " rps")}</dd>
                  <dt>Utilization</dt>
                  <dd>{percent(node.rho)}</dd>
                  <dt>Mean service time</dt>
                  <dd>{milliseconds(node.S)}</dd>
                  <dt>Mean queue wait</dt>
                  <dd>{milliseconds(node.Wq)}</dd>
                  <dt>Hits 100% at</dt>
                  <dd>{boundedText(node.satRps, " rps")}</dd>
                </dl>
                {!currentNodeIds || currentNodeIds.includes(node.id) ? (
                  <Link
                    className="btn"
                    href={
                      "/designs/" +
                      run.designId +
                      "/edit?node=" +
                      encodeURIComponent(node.id) +
                      "&run=" +
                      run.id
                    }
                  >
                    Edit {node.label}
                  </Link>
                ) : (
                  <p className="note">
                    {node.label} no longer exists in the current draft. Its
                    recorded metrics remain available here.
                  </p>
                )}
                <p className="hint">
                  Opens this component in the current draft if it still exists.
                  Metrics here remain from the recorded run.
                </p>
              </>
            ) : (
              <p className="hint">
                Select a component in the table to inspect it.
              </p>
            )}
          </div>
        </section>
        {!!s.queues.length && (
          <section className="panel">
            <div className="panel-h">
              <h3 className="h3">Background queues</h3>
            </div>
            <div className="panel-b stack">
              {s.queues.map((q) => (
                <div key={q.id}>
                  <h4>
                    {q.label} · {q.state}
                  </h4>
                  <p>
                    Arrival {numberText(q.arrival)} jobs/s · Drain{" "}
                    {numberText(q.drain)} jobs/s
                  </p>
                  <p>
                    Backlog {numberText(q.backlog)} messages · Lag{" "}
                    {boundedText(q.lag, " s")} · Overflow {percent(q.overflow)}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}
        {!!s.backgroundIssues.length && (
          <section className="panel panel-b stack">
            <h3 className="h3">Background failures</h3>
            {s.backgroundIssues.map((b) => (
              <p key={b.id}>
                {b.label}: {percent(b.dropped)} of background calls dropped.
                These are separate from foreground request errors.
              </p>
            ))}
          </section>
        )}
        {!!s.crossRegion.length && (
          <section className="panel panel-b stack">
            <h3 className="h3">Cross-region calls</h3>
            {s.crossRegion.map((c, i) => (
              <p key={i}>
                {s.nodes.find((n) => n.id === c.from)?.label ?? c.from} →{" "}
                {s.nodes.find((n) => n.id === c.to)?.label ?? c.to}:{" "}
                {c.fromRegion} → {c.toRegion}, {milliseconds(c.rtt)} round-trip
                contribution per call.
              </p>
            ))}
            <p className="hint">
              Adding replicas does not remove geographic travel time.
            </p>
          </section>
        )}
        <section className="panel">
          <div className="panel-h">
            <h3 className="h3">Where an average request spends its time</h3>
          </div>
          <div className="panel-b stack">
            <dl className="kv">
              {contributions.map((n) => (
                <div className="m7-kv-pair" key={n.id}>
                  <dt>{n.label}</dt>
                  <dd>{milliseconds(n.contribution)}</dd>
                </div>
              ))}
            </dl>
            <p className="hint">
              Modeled average: {milliseconds(s.mean)} per request. Components
              list their mean contributions; network travel and other modeled
              contributions can make up the remainder. These values are not a
              breakdown of p95.
            </p>
          </div>
        </section>
        <section className="panel panel-b stack">
          <h3 className="h3">Model assumptions</h3>
          <p className="small muted">
            Queueing approximations estimate latency and rejected load. They do
            not measure hardware, cold starts or real retry storms. The
            illustrated timeline samples independent loads rather than evolving
            a real system.
          </p>
        </section>
      </aside>
    </div>
  );
}
