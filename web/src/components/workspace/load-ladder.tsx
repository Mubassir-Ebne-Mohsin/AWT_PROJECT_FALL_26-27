"use client";
import { useEffect, useRef, useState } from "react";
import { LADDER_NOTE, headline, ladderError, loadLabel, rate, requestLadder, resultText, type Ladder, type Rung } from "@/lib/ladder";
import { milliseconds, percent } from "@/lib/result-presentation";

/**
 * "Where does it break?" For a completed test run, one click shows the same design at two, five and ten times its request rate,
 * calculated by the server with the same model as a test run. Nothing is saved and nothing is changed. It works for a run that
 * passes (that is when it is most useful) as well as one that does not.
 */
const tone = (r: Rung) => (r.status !== "OK" || !r.measure ? "" : r.measure.verdict === "pass" ? "ok" : r.measure.verdict === "fail" ? "fail" : "warn");

export function LoadLadder({ designId, savedRevision, runId, runRevision, stale }: { designId: string; savedRevision: number; runId: string; runRevision: number; stale: boolean }) {
  const [state, setState] = useState<{ phase: "idle" | "loading" | "done" | "error"; data?: Ladder; error?: string }>({ phase: "idle" });
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  const current = !stale && runRevision === savedRevision;

  async function ask() {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setState({ phase: "loading" });
    try {
      const data = await requestLadder(designId, savedRevision, runId, controller.signal);
      if (!controller.signal.aborted) setState({ phase: "done", data });
    } catch (e) {
      if (!controller.signal.aborted) setState({ phase: "error", error: ladderError(e) });
    }
  }

  return (
    <section className="panel panel-b stack" aria-label="Load ladder" data-testid="ladder-panel">
      <div className="row">
        <h2 className="h3">Where does it break?</h2>
        <span className="tag" title="Calculated by running the model at higher load, not by a language model.">
          Calculated by the model, no AI
        </span>
      </div>
      <p className="muted">See this design at two, five and ten times its request rate, with the same traffic shape and targets.</p>
      <div className="row">
        <button className="btn" data-testid="ladder-button" disabled={!current || state.phase === "loading"} onClick={() => void ask()}>
          {state.phase === "loading" ? "Calculating…" : state.phase === "done" ? "Calculate again" : "Show 2×, 5× and 10× load"}
        </button>
        {!current && (
          <span className="hint" data-testid="ladder-stale">
            This result is not for the saved design. Save, then run the test again to see the ladder.
          </span>
        )}
      </div>
      {state.phase === "loading" && <p role="status">Running the model at higher load…</p>}
      {state.phase === "error" && (
        <div className="note fail" role="alert" data-testid="ladder-error">
          {state.error}
        </div>
      )}
      {state.phase === "done" && state.data && (
        <div className="stack" aria-live="polite">
          <p data-testid="ladder-headline">
            <b>{headline(state.data.rungs)}</b>
          </p>
          <div style={{ overflowX: "auto" }}>
            <table className="table" data-testid="ladder-table">
              <caption className="sr-only">The recorded run and the same design at higher load</caption>
              <thead>
                <tr>
                  <th scope="col">Load</th>
                  <th scope="col">Requests per second</th>
                  <th scope="col">Result</th>
                  <th scope="col">p95</th>
                  <th scope="col">Errors</th>
                  <th scope="col">Limiting component</th>
                </tr>
              </thead>
              <tbody>
                {state.data.rungs.map((r) => (
                  <tr key={r.multiplier} data-testid="ladder-row">
                    <th scope="row">{loadLabel(r.multiplier)}</th>
                    <td>{rate(r.rps)}</td>
                    <td>
                      <span className={"pill " + tone(r)}>{resultText(r)}</span>
                    </td>
                    <td>{r.measure ? milliseconds(r.measure.p95) : "—"}</td>
                    <td>{r.measure ? percent(r.measure.errorRate) : "—"}</td>
                    <td>{r.measure ? (r.limiter ? r.limiter.label : "None named") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint">{LADDER_NOTE}</p>
        </div>
      )}
    </section>
  );
}
