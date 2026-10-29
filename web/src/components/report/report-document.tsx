import type { Report } from "@/lib/api/report";
import { milliseconds, numberText, percent } from "@/lib/result-presentation";
import { dateText, limitsStatement, noteScopeText, runStatement, trafficRows, verdictSentence } from "@/lib/report-presentation";

/**
 * The report itself: pure display of the server's document. It adds no figures of its own, so everything printed
 * or shared comes from the model's recorded output. Reused by the owner's report and the shared snapshot viewer.
 */
export function ReportDocument({ report, designOnly = false }: { report: Omit<Report, "designId">; designOnly?: boolean }) {
  const sim = report.run?.simulation ?? null;
  const status = runStatement(report.run, report.revision);
  const label = new Map(report.graph.nodes.map((n) => [n.id, n.label]));
  return (
    <article className="m16-doc stack lg" aria-label="Design report">
      <header className="stack">
        <h2 className="h2">{report.name}</h2>
        <p className="hint">
          Revision {report.revision}
          {report.isCurrentRevision ? " (current)" : " (an earlier revision)"} · saved {dateText(report.versionCreatedAt)} · report made {dateText(report.generatedAt)}
        </p>
        {report.description && <p>{report.description}</p>}
        {designOnly && <p className="hint">The owner shared the design only, without results, Limits or notes.</p>}
      </header>

      {!designOnly && (
<section className="stack" aria-labelledby="m16-summary">
        <h3 className="h3" id="m16-summary">
          Result
        </h3>
        <p className={status.warn ? "m16-warn" : "hint"} data-testid="report-run-statement">
          {status.text}
        </p>
        {sim && (
          <>
            <p className="m16-verdict" data-testid="report-verdict">
              {verdictSentence(sim.verdict)}
            </p>
            <table className="m15-table">
              <caption>Predicted figures at the traffic tested</caption>
              <thead>
                <tr>
                  <th scope="col">Measure</th>
                  <th scope="col">Predicted</th>
                  <th scope="col">Target</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">p50 latency</th>
                  <td>{milliseconds(sim.p50)}</td>
                  <td>-</td>
                </tr>
                <tr>
                  <th scope="row">p95 latency</th>
                  <td>{milliseconds(sim.p95)}</td>
                  <td>{milliseconds(sim.p95Target)}</td>
                </tr>
                <tr>
                  <th scope="row">p99 latency</th>
                  <td>{milliseconds(sim.p99)}</td>
                  <td>-</td>
                </tr>
                <tr>
                  <th scope="row">Error rate</th>
                  <td>{percent(sim.errorRate)}</td>
                  <td>{percent(sim.errorBudget)}</td>
                </tr>
                <tr>
                  <th scope="row">Throughput</th>
                  <td>{numberText(sim.throughput, 0)} requests per second</td>
                  <td>-</td>
                </tr>
              </tbody>
            </table>
            <p>
              {sim.bottleneck
                ? `The most loaded component is ${sim.bottleneck.label} (${sim.bottleneck.type}) at ${percent(sim.bottleneck.rho)} utilisation.`
                : "The model identified no single most-loaded component."}
            </p>
          </>
        )}
      </section>
      )}

      <section className="stack" aria-labelledby="m16-traffic">
        <h3 className="h3" id="m16-traffic">
          Traffic
        </h3>
        <p className="hint">{report.run?.simulation ? "The traffic this result was recorded at:" : "The traffic saved with this revision:"}</p>
        <table className="m15-table">
          <caption>Traffic settings</caption>
          <tbody>
            {trafficRows(report.run?.simulation ? report.run.traffic : report.traffic).map(([k, v]) => (
              <tr key={k}>
                <th scope="row">{k}</th>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="stack" aria-labelledby="m16-components">
        <h3 className="h3" id="m16-components">
          Components
        </h3>
        {sim ? (
          <table className="m15-table">
            <caption>Load on each component</caption>
            <thead>
              <tr>
                <th scope="col">Component</th>
                <th scope="col">Type</th>
                <th scope="col">Region</th>
                <th scope="col">Peak requests per second</th>
                <th scope="col">Utilisation</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {sim.components.map((c, i) => (
                <tr key={i}>
                  <th scope="row">{c.label}</th>
                  <td>{c.type}</td>
                  <td>{c.region}</td>
                  <td>{numberText(c.peak, 1)}</td>
                  <td>{percent(c.rho)}</td>
                  <td>{c.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <ul>
            {report.graph.nodes.map((n) => (
              <li key={n.id}>
                {n.label} ({n.type})
              </li>
            ))}
          </ul>
        )}
        <p className="hint">
          {report.graph.nodes.length} component{report.graph.nodes.length === 1 ? "" : "s"} and {report.graph.edges.length} connection{report.graph.edges.length === 1 ? "" : "s"}.
        </p>
        {report.graph.edges.length > 0 && (
          <ul aria-label="Connections">
            {report.graph.edges.map((e) => (
              <li key={e.id}>
                {label.get(e.from) ?? e.from} to {label.get(e.to) ?? e.to}
              </li>
            ))}
          </ul>
        )}
      </section>

      {!designOnly && (
<section className="stack" aria-labelledby="m16-limits">
        <h3 className="h3" id="m16-limits">
          Limits
        </h3>
        <p data-testid="report-limits">{limitsStatement(report.limits)}</p>
      </section>
      )}

      {!designOnly && (
<section className="stack" aria-labelledby="m16-notes">
        <h3 className="h3" id="m16-notes">
          Decisions and assumptions
        </h3>
        <p className="hint">{noteScopeText(report.noteScope)}</p>
        {report.notes.length === 0 ? (
          <p>{report.noteScope === "none" ? "The owner did not include notes." : "No notes were written for this design."}</p>
        ) : (
          <ul className="m16-notes" aria-label="Notes">
            {report.notes.map((n, i) => (
              <li key={i}>
                <strong>{n.kind === "decision" ? "Decision" : "Assumption"}</strong> (revision {n.revision}): <span className="m15-note-text">{n.text}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      )}

      <section className="stack" aria-labelledby="m16-limitations">
        <h3 className="h3" id="m16-limitations">
          What these numbers are
        </h3>
        <ul>
          {report.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </section>
    </article>
  );
}
