"use client";

import Link from "next/link";
import { notFound, usePathname } from "next/navigation";
import { Crumbs } from "@/components/shell/crumbs";
import {
  AI_RECORD,
  CALIBRATION_STEPS,
  CALIBRATION_WHY,
  COMMANDS,
  EVAL,
  LOADS_SHOWN,
  NOT_PROVEN,
  TAB_LIST,
  bandRows,
  consistencySummary,
  fidelityText,
  gapText,
  oneServerText,
  pct,
  typicalCell,
} from "@/lib/evaluation";
import { NOT_FOUND_ROUTE, resolveRoute } from "@/lib/routes";

const STATUS_CLASS: Record<string, string> = { Measured: "ok", "Not yet measured": "warn", "Parked, not evaluated": "outline" };

function Status({ text }: { text: string }) {
  return (
    <span className={"pill " + (STATUS_CLASS[text] ?? "")} data-testid="status">
      <span className="dot" aria-hidden="true" /> {text}
    </span>
  );
}

function Simulator() {
  const consistency = consistencySummary();
  return (
    <>
      <p className="lede">What has been checked about the model&apos;s own maths, with the numbers. These checks look inside the model. They do not show that it matches real servers; see the Calibration tab for that.</p>

      <section className="stack" aria-labelledby="ev-erlang" data-testid="erlang">
        <h2 className="h2" id="ev-erlang">
          1. The waiting-time formula against the exact textbook answer
        </h2>
        <p>
          When requests queue for a component, the model estimates the wait with a standard approximation. The exact answer for this kind of queue is known (the Erlang C formula), so the two can be compared directly. The comparison covers {EVAL.erlang.servers.length} server counts from {EVAL.erlang.servers[0]} to {EVAL.erlang.servers[EVAL.erlang.servers.length - 1]} and loads from 5% to 98% busy.
        </p>
        <p data-testid="one-server">{oneServerText()}</p>
        <p>With several servers the model is an approximation, and it overestimates small waits. How far off it is depends on how large the wait is:</p>
        <table className="table" data-testid="bands">
          <caption>Worst difference from the exact wait, by how large that wait is</caption>
          <thead>
            <tr>
              <th scope="col">When the exact wait is at least this share of one service time</th>
              <th scope="col">Points checked</th>
              <th scope="col">Worst error</th>
            </tr>
          </thead>
          <tbody>
            {bandRows().map((r) => (
              <tr key={r.share}>
                <th scope="row">{r.share}</th>
                <td>{r.points}</td>
                <td>{r.worst}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p data-testid="gap">{gapText()}</p>
        <p>
          In short: close to the exact answer where the wait is large enough to matter, and loose where the wait is tiny. The model was not changed to hide this; matching the exact formula would change every result and break the match with the original prototype.
        </p>

        <h3 className="h3">What it means for real components</h3>
        <p className="hint">Each cell shows the exact wait, then the model&apos;s wait, in milliseconds, at the load in the column heading. The number of parallel servers is what the model infers from each component&apos;s capacity and service time.</p>
        <div className="table-scroll" style={{ overflowX: "auto" }}>
          <table className="table" data-testid="typical">
            <caption>Exact wait / model wait for each component type (ms)</caption>
            <thead>
              <tr>
                <th scope="col">Component</th>
                <th scope="col">Servers</th>
                <th scope="col">Service time</th>
                {LOADS_SHOWN.map((r) => (
                  <th scope="col" key={r}>
                    {pct(r)} busy
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {EVAL.erlang.typical.map((t) => (
                <tr key={t.type}>
                  <th scope="row">{t.label}</th>
                  <td>{t.servers}</td>
                  <td>{t.serviceMs} ms</td>
                  {LOADS_SHOWN.map((r) => {
                    const row = t.rows.find((x) => x.rho === r)!;
                    return <td key={r}>{typicalCell(row)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="stack" aria-labelledby="ev-fidelity" data-testid="fidelity">
        <h2 className="h2" id="ev-fidelity">
          2. The engine against the original prototype
        </h2>
        <p data-testid="fidelity-text">{fidelityText()}</p>
        <p>This shows the engine in the app is a faithful copy of the original prototype&apos;s calculation. It does not show that the prototype&apos;s maths is correct.</p>
      </section>

      <section className="stack" aria-labelledby="ev-checks" data-testid="consistency">
        <h2 className="h2" id="ev-checks">
          3. Consistency checks on each shipped design
        </h2>
        <p data-testid="consistency-text">{consistency.text}</p>
        <div className="table-scroll" style={{ overflowX: "auto" }}>
          <table className="table">
            <caption>Each check, for each of the six example designs</caption>
            <thead>
              <tr>
                <th scope="col">Check</th>
                {EVAL.consistency[0].results.map((r) => (
                  <th scope="col" key={r.template}>
                    {r.template}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {EVAL.consistency.map((c) => (
                <tr key={c.id} data-testid="check-row" data-passed={c.passed}>
                  <th scope="row">{c.text}</th>
                  {c.results.map((r) => (
                    <td key={r.template}>{r.passed ? "Pass" : "FAIL"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel stack r2-pad" aria-labelledby="ev-not" data-testid="not-proven">
        <h2 className="h3" id="ev-not">
          What none of this proves
        </h2>
        <ul>
          {NOT_PROVEN.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </section>

      <section className="stack" aria-labelledby="ev-repro" data-testid="reproduce">
        <h2 className="h2" id="ev-repro">
          How to check this yourself
        </h2>
        <ul className="stack" style={{ listStyle: "none", padding: 0 }}>
          {COMMANDS.map((c) => (
            <li key={c.command}>
              <code>{c.command}</code> <span className="muted">in {c.dir}</span>
              <br />
              <span className="small">{c.says}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function Calibration() {
  return (
    <>
      <p className="lede" data-testid="calibration-why">
        {CALIBRATION_WHY}
      </p>
      <section className="stack" aria-labelledby="ev-method" data-testid="method">
        <h2 className="h2" id="ev-method">
          How it will be measured
        </h2>
        <ol className="stack">
          {CALIBRATION_STEPS.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </section>
      <section className="panel stack r2-pad" aria-labelledby="ev-result" data-testid="calibration-result">
        <h2 className="h3" id="ev-result">
          Result
        </h2>
        <p>There is no result yet, so no table or figure is shown here. When the experiment is done, the predicted and measured values for every step will appear on this page, with the raw measurements kept in the repository.</p>
      </section>
      <p className="hint">
        What has been checked so far is on the <Link href="/evaluation/simulator">Simulator tab</Link>. The limits of the model are described on <Link href="/how-it-works">How it works</Link>.
      </p>
    </>
  );
}

function Ai() {
  return (
    <>
      <p className="lede" data-testid="ai-lede">
        The AI features are switched off in this version, and nothing has been measured about how well AI would explain a result. This page records the only test that was made.
      </p>
      <section className="stack" aria-labelledby="ev-m10" data-testid="m10">
        <h2 className="h2" id="ev-m10">
          The one test that was run ({AI_RECORD.date})
        </h2>
        <p>{AI_RECORD.setup} Each was asked to explain eight kinds of result, such as healthy, failed and missing inputs.</p>
        <table className="table">
          <caption>Results of the eight explanation cases</caption>
          <thead>
            <tr>
              <th scope="col">Model</th>
              <th scope="col">Replies with the required shape</th>
              <th scope="col">Replies that passed every check</th>
              <th scope="col">Note</th>
            </tr>
          </thead>
          <tbody>
            {AI_RECORD.models.map((m) => (
              <tr key={m.name} data-testid="m10-row">
                <th scope="row">{m.name}</th>
                <td>{m.shape}</td>
                <td>{m.passed}</td>
                <td>{m.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>{AI_RECORD.resource}</p>
        <p>{AI_RECORD.verdict}</p>
      </section>
      <section className="stack" aria-labelledby="ev-later" data-testid="ai-later">
        <h2 className="h2" id="ev-later">
          What a future evaluation would measure
        </h2>
        <ul>
          {AI_RECORD.later.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <p className="hint">No comparison with a rule-based explanation has been made, so no such numbers are shown.</p>
      </section>
    </>
  );
}

export function EvaluationPage() {
  const pathname = usePathname();
  const resolved = resolveRoute(pathname);
  if (resolved.route === NOT_FOUND_ROUTE) notFound();
  const tab = resolved.params.tab as "simulator" | "calibration" | "ai";
  const info = TAB_LIST.find((t) => t.id === tab)!;
  return (
    <div className="page narrow stack lg" data-testid="evaluation-page">
      <Crumbs resolved={resolved} />
      <div className="stack">
        <h1 className="h1">Evaluation</h1>
        <nav aria-label="Evaluation sections">
          <ul className="row" style={{ flexWrap: "wrap", gap: 8, listStyle: "none", padding: 0 }}>
            {TAB_LIST.map((t) => (
              <li key={t.id}>
                <Link className={"chip" + (t.id === tab ? " is-on" : "")} href={`/evaluation/${t.id}`} aria-current={t.id === tab ? "page" : undefined}>
                  {t.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="row" style={{ alignItems: "center", gap: 10 }}>
          <h2 className="h2" data-testid="tab-heading">
            {info.label}
          </h2>
          <Status text={info.status} />
        </div>
      </div>
      {tab === "simulator" && <Simulator />}
      {tab === "calibration" && <Calibration />}
      {tab === "ai" && <Ai />}
    </div>
  );
}
