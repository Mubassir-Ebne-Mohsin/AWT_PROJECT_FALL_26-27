"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AI_WHATIF_EXPERIMENTAL,
  AI_WHATIF_MAX,
  AI_WHATIF_NOTICE,
  NO_CHANGE,
  READ_SHARE_CHOICES,
  SHAPE_CHOICES,
  TRAFFIC_CHOICES,
  WHATIF_NOTE,
  aiWhatIfError,
  changeProblem,
  changeSentence,
  normalised,
  requestAiWhatIf,
  requestWhatIf,
  resultText,
  whatIfAiEnabled,
  whatIfAiUnavailableText,
  whatIfError,
  type AiWhatIf,
  type ReadShareChoice,
  type ShapeChoice,
  type TrafficMode,
  type WhatIf,
  type WhatIfChange,
  type WhatIfSide,
} from "@/lib/what-if";
import { fetchAiTasksReadiness, type AiTaskReadiness } from "@/lib/ai-describe";
import { milliseconds, numberText, percent } from "@/lib/result-presentation";

/**
 * "What if the traffic changed?" For a completed test run, the person chooses a change (multiply or set the request rate, a shape,
 * a read share), and the server shows the same design under it next to the recorded run. The controls work with no AI. Nothing is
 * saved, nothing is changed, and there is no "difference" column: the two columns are the server's own figures.
 */
const tone = (s: WhatIfSide) => (s.status !== "OK" || !s.measure ? "" : s.measure.verdict === "pass" ? "ok" : s.measure.verdict === "fail" ? "fail" : "warn");
const SHAPE_WORD = { steady: "Steady", ramp: "Ramp up", spike: "Spike" } as const;

export function WhatIfPanel({ designId, savedRevision, runId, runRevision, stale }: { designId: string; savedRevision: number; runId: string; runRevision: number; stale: boolean }) {
  const [change, setChange] = useState<WhatIfChange>(NO_CHANGE);
  const [valueText, setValueText] = useState("2");
  const [state, setState] = useState<{ phase: "idle" | "loading" | "done" | "error"; data?: WhatIf; error?: string }>({ phase: "idle" });
  const abort = useRef<AbortController | null>(null);
  const [tasks, setTasks] = useState<AiTaskReadiness[] | null>(null);
  const [sentence, setSentence] = useState("");
  const [aiState, setAiState] = useState<{ phase: "idle" | "loading" | "done" | "error"; data?: AiWhatIf; error?: string; applied?: boolean }>({ phase: "idle" });
  const aiAbort = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      abort.current?.abort();
      aiAbort.current?.abort();
    },
    [],
  );
  // Whether the sentence box is offered depends on the server's own switch. If the answer cannot be had, it is simply not offered.
  useEffect(() => {
    const controller = new AbortController();
    fetchAiTasksReadiness()
      .then((r) => !controller.signal.aborted && setTasks(r.tasks))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  const aiOffered = whatIfAiEnabled(tasks);
  const aiBlocked = whatIfAiUnavailableText(tasks);
  const current = !stale && runRevision === savedRevision;
  const problem = changeProblem(change);

  // Editing the change drops the old answer: a table must never sit beside controls that no longer describe it.
  function edit(next: WhatIfChange) {
    abort.current?.abort();
    setChange(next);
    if (state.phase !== "idle") setState({ phase: "idle" });
  }
  function setMode(mode: TrafficMode) {
    const value = mode === "keep" ? 0 : Number(valueText);
    edit({ ...change, trafficMode: mode, value: Number.isFinite(value) ? value : 0 });
  }
  function setValue(text: string) {
    setValueText(text);
    edit({ ...change, value: text.trim() === "" ? Number.NaN : Number(text) });
  }

  async function readSentence() {
    aiAbort.current?.abort();
    const controller = new AbortController();
    aiAbort.current = controller;
    setAiState({ phase: "loading" });
    try {
      const data = await requestAiWhatIf(sentence.trim(), controller.signal);
      // Nothing is applied here: the proposal waits for the person's click, so a late reply cannot overwrite their controls.
      if (!controller.signal.aborted) setAiState({ phase: "done", data });
    } catch (e) {
      if (!controller.signal.aborted) setAiState({ phase: "error", error: aiWhatIfError(e) });
    }
  }
  function applyProposal(proposal: WhatIfChange) {
    setValueText(proposal.trafficMode === "keep" ? valueText : String(proposal.value));
    edit(proposal);
    setAiState((previous) => ({ ...previous, applied: true }));
  }

  async function run() {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setState({ phase: "loading" });
    try {
      const data = await requestWhatIf(designId, savedRevision, runId, normalised(change), controller.signal);
      if (!controller.signal.aborted) setState({ phase: "done", data });
    } catch (e) {
      if (!controller.signal.aborted) setState({ phase: "error", error: whatIfError(e) });
    }
  }

  const rows = (d: WhatIf): { label: string; before: string; after: string }[] => [
    { label: "Requests per second", before: numberText(d.before.rps, 2), after: numberText(d.after.rps, 2) },
    { label: "Traffic shape", before: SHAPE_WORD[d.before.shape], after: SHAPE_WORD[d.after.shape] },
    { label: "Share of reads", before: percent(d.before.readRatio), after: percent(d.after.readRatio) },
    { label: "p95", before: d.before.measure ? milliseconds(d.before.measure.p95) : "—", after: d.after.measure ? milliseconds(d.after.measure.p95) : "—" },
    { label: "Errors", before: d.before.measure ? percent(d.before.measure.errorRate) : "—", after: d.after.measure ? percent(d.after.measure.errorRate) : "—" },
    { label: "Limiting component", before: d.before.measure ? (d.before.limiter?.label ?? "None named") : "—", after: d.after.measure ? (d.after.limiter?.label ?? "None named") : "—" },
  ];

  return (
    <section className="panel panel-b stack" aria-label="What if" data-testid="whatif-panel">
      <div className="row">
        <h2 className="h3">What if the traffic changed?</h2>
        <span className="tag" title="Calculated by running the model under the changed load, not by a language model.">
          Calculated by the model, no AI
        </span>
      </div>
      <p className="muted">Choose a change and see the same design under it, next to the result you have.</p>
      {aiOffered && (
        <div className="stack" data-testid="whatif-ai">
          <div className="row">
            <label htmlFor="whatif-ai-input">Say it in words</label>
            <span className="tag" title="A hosted AI model only fills the controls below. It never writes a figure.">
              AI-assisted, experimental
            </span>
          </div>
          <div className="row">
            <input
              id="whatif-ai-input"
              className="input"
              data-testid="whatif-ai-input"
              type="text"
              maxLength={AI_WHATIF_MAX}
              placeholder="For example: what if traffic doubles during a flash sale?"
              value={sentence}
              onChange={(e) => {
                setSentence(e.target.value);
                // A proposal or a pending reply belongs to the words it was made from; once they change it is dropped.
                if (aiState.phase !== "idle") {
                  aiAbort.current?.abort();
                  setAiState({ phase: "idle" });
                }
              }}
            />
            <button className="btn" data-testid="whatif-ai-button" disabled={!sentence.trim() || !!aiBlocked || aiState.phase === "loading"} onClick={() => void readSentence()}>
              {aiState.phase === "loading" ? "Reading…" : "Read my sentence"}
            </button>
          </div>
          <p className="hint" data-testid="whatif-ai-experimental">
            {AI_WHATIF_EXPERIMENTAL} <Link href="/evaluation/ai">What was measured is on the Evaluation page.</Link>
          </p>
          <p className="hint">{AI_WHATIF_NOTICE}</p>
          {aiBlocked && (
            <p className="hint" data-testid="whatif-ai-blocked">
              {aiBlocked}
            </p>
          )}
          {aiState.phase === "error" && (
            <div className="note fail" role="alert" data-testid="whatif-ai-error">
              {aiState.error}
            </div>
          )}
          {aiState.phase === "done" && aiState.data && (
            <div className={"note " + (aiState.data.status === "SUPPORTED" ? "accent" : "")} role="status" data-testid="whatif-ai-result">
              {aiState.data.interpretation.map((line) => (
                <p key={line}>{line}</p>
              ))}
              {aiState.data.status === "SUPPORTED" && (
                <div className="row">
                  <button className="btn btn-primary" data-testid="whatif-ai-apply" disabled={aiState.applied} onClick={() => applyProposal(aiState.data!.change)}>
                    {aiState.applied ? "Applied to the controls" : "Apply these choices"}
                  </button>
                </div>
              )}
              <p className="hint">
                {aiState.data.status === "SUPPORTED"
                  ? "Nothing changes until you apply it, and nothing runs until you click Run what-if."
                  : "Nothing was changed. Use the controls."}
              </p>
            </div>
          )}
          <p className="hint">Or choose it yourself:</p>
        </div>
      )}
      <div className="stack">
        <div className="row">
          <label htmlFor="whatif-mode" className="sr-only">
            Request rate
          </label>
          <select id="whatif-mode" data-testid="whatif-mode" value={change.trafficMode} onChange={(e) => setMode(e.target.value as TrafficMode)}>
            {TRAFFIC_CHOICES.map((c) => (
              <option key={c.mode} value={c.mode}>
                {c.label}
              </option>
            ))}
          </select>
          {change.trafficMode !== "keep" && (
            <>
              <label htmlFor="whatif-value" className="sr-only">
                Value
              </label>
              <input id="whatif-value" data-testid="whatif-value" className="input" type="number" inputMode="decimal" step="any" value={valueText} onChange={(e) => setValue(e.target.value)} style={{ maxWidth: 160 }} />
              <span className="hint">{change.trafficMode === "multiply" ? "times (0.1 to 20)" : "requests per second (1 to 10,000,000)"}</span>
            </>
          )}
        </div>
        <div className="row">
          <label>
            Shape{" "}
            <select data-testid="whatif-shape" value={change.shape} onChange={(e) => edit({ ...change, shape: e.target.value as ShapeChoice })}>
              {SHAPE_CHOICES.map((c) => (
                <option key={c.shape} value={c.shape}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Reads and writes{" "}
            <select data-testid="whatif-readshare" value={change.readShare} onChange={(e) => edit({ ...change, readShare: e.target.value as ReadShareChoice })}>
              {READ_SHARE_CHOICES.map((c) => (
                <option key={c.share} value={c.share}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="row">
          <button className="btn" data-testid="whatif-button" disabled={!current || !!problem || state.phase === "loading"} onClick={() => void run()}>
            {state.phase === "loading" ? "Calculating…" : "Run what-if"}
          </button>
          {!current && (
            <span className="hint" data-testid="whatif-stale">
              This result is not for the saved design. Save, then run the test again to ask a what-if.
            </span>
          )}
          {current && problem && state.phase === "idle" && (
            <span className="hint" data-testid="whatif-problem">
              {problem}
            </span>
          )}
        </div>
      </div>
      {state.phase === "loading" && <p role="status">Running the model under the changed load…</p>}
      {state.phase === "error" && (
        <div className="note fail" role="alert" data-testid="whatif-error">
          {state.error}
        </div>
      )}
      {state.phase === "done" && state.data && (
        <div className="stack" aria-live="polite">
          <p data-testid="whatif-sentence">{changeSentence(state.data.change)}</p>
          <div style={{ overflowX: "auto" }}>
            <table className="table" data-testid="whatif-table">
              <caption className="sr-only">The recorded run and the same design under the changed traffic</caption>
              <thead>
                <tr>
                  <th scope="col">Same design</th>
                  <th scope="col">Your run</th>
                  <th scope="col">What-if</th>
                </tr>
              </thead>
              <tbody>
                <tr data-testid="whatif-result-row">
                  <th scope="row">Result</th>
                  <td>
                    <span className={"pill " + tone(state.data.before)}>{resultText(state.data.before)}</span>
                  </td>
                  <td>
                    <span className={"pill " + tone(state.data.after)}>{resultText(state.data.after)}</span>
                  </td>
                </tr>
                {rows(state.data).map((r) => (
                  <tr key={r.label}>
                    <th scope="row">{r.label}</th>
                    <td>{r.before}</td>
                    <td>{r.after}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint">{WHATIF_NOTE}</p>
        </div>
      )}
    </section>
  );
}
