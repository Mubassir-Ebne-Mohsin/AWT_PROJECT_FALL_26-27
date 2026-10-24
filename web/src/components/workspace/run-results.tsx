import type { DesignRun } from "@/lib/api/designs";
export function RunResults({ run, stale }: { run?: DesignRun; stale: boolean }) {
  if (!run) return <div className="panel empty">Run the saved design to see model estimates.</div>;
  if (run.status === "pending") return <div className="note accent" role="status">Queued or running… You can leave this page; accepted work continues.</div>;
  if (run.status === "failed") return <div className="note fail" role="alert">{run.failure.code}: {run.failure.message} Use Run test for a new calculation.</div>;
  const summary = run.result.kind === "simulation" ? run.result.summary : run.result.current;
  const bottleneck = summary.nodes.find(n => n.id === summary.bottleneckId);
  return <section className="stack">
    {stale && <div className="note warn" role="status">Stale result — inputs changed. Run again after saving.</div>}
    <div className="row between"><h2 className="h2">Model results</h2><span className={`pill ${summary.verdict === "pass" ? "ok" : summary.verdict === "fail" ? "fail" : "warn"}`}>{summary.verdict}</span></div>
    <div className="readouts">
      {[["p95 latency", `${summary.p95.toFixed(2)} ms`], ["Errors", `${(summary.errorRate * 100).toFixed(3)}%`], ["Bottleneck", bottleneck?.label ?? "None"], ["Peak traffic", `${summary.peakRps.toFixed(0)} rps`]].map(([label, value]) => <div className="readout" key={label}><span className="eyebrow">{label}</span><div className="v num">{value}</div></div>)}
    </div>
    <p className="hint">Mathematical estimates, not measured infrastructure performance. Revision {run.designRevision} · {run.engineVersion} · {new Date(run.createdAt).toLocaleString()}</p>
    <details><summary>Tested inputs and fingerprint</summary><p className="num small m3-wrap">{run.fingerprint}</p><p>{summary.traffic.rps} rps × {summary.traffic.burst} burst · target p95 {summary.traffic.sloP95} ms · error budget {summary.traffic.errorBudget * 100}%</p></details>
    <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Component</th><th>Utilization</th><th>State</th></tr></thead><tbody>{summary.nodes.map(n => <tr key={n.id}><td>{n.label}</td><td>{(n.rho * 100).toFixed(1)}%</td><td>{n.status}</td></tr>)}</tbody></table></div>
  </section>;
}
