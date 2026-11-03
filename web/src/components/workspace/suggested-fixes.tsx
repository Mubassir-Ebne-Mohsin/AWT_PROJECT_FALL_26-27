"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  FIXES_NOTE,
  KIND_CHOICES,
  NO_FILTER,
  PREFERENCE_CHOICES,
  changeText,
  fixesError,
  isNoFilter,
  requestFixes,
  statusText,
  toggleKind,
  verdictWord,
  type FixFilter,
  type FixPreferenceName,
  type FixSuggestion,
  type Fixes,
} from "@/lib/fixes";
import { AI_FIX_GOAL_EXPERIMENTAL, AI_FIX_GOAL_MAX, AI_FIX_GOAL_NOTICE, fixGoalEnabled, fixGoalError, fixGoalUnavailableText, requestFixGoal, type AiFixGoal } from "@/lib/ai-fix-goal";
import { fetchAiTasksReadiness, type AiTaskReadiness } from "@/lib/ai-describe";
import { milliseconds, percent } from "@/lib/result-presentation";
import { workspaceHref } from "@/lib/run-links";

/**
 * Suggested fixes for a test run that did not pass. A click asks the server to try a few ordinary edits at the limiting component
 * and run the model on each; every figure shown is the server's. Applying a fix puts the edited design into the editor draft as one
 * undoable change. Nothing is saved until the person saves, and then a new revision is made by the normal save.
 */
export function SuggestedFixes({
  designId,
  savedRevision,
  runId,
  runRevision,
  verdict,
  stale,
  dirty,
  onApply,
}: {
  designId: string;
  savedRevision: number;
  runId: string;
  runRevision: number;
  verdict: "pass" | "strained" | "fail";
  stale: boolean;
  /** The draft has edits that are not saved. */
  dirty: boolean;
  onApply: (fix: FixSuggestion) => void;
}) {
  const [state, setState] = useState<{ phase: "idle" | "loading" | "done" | "error"; data?: Fixes; error?: string }>({ phase: "idle" });
  const [applied, setApplied] = useState<string | null>(null);
  const [filter, setFilter] = useState<FixFilter>(NO_FILTER);
  const [tasks, setTasks] = useState<AiTaskReadiness[] | null>(null);
  const [goal, setGoal] = useState("");
  const [goalState, setGoalState] = useState<{ phase: "idle" | "loading" | "done" | "error"; data?: AiFixGoal; error?: string; applied?: boolean }>({ phase: "idle" });
  const abort = useRef<AbortController | null>(null);
  const goalAbort = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      abort.current?.abort();
      goalAbort.current?.abort();
    },
    [],
  );
  // Whether the goal box is offered depends on the server's own switch. If the answer cannot be had, it is simply not offered.
  useEffect(() => {
    const controller = new AbortController();
    fetchAiTasksReadiness()
      .then((r) => !controller.signal.aborted && setTasks(r.tasks))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  if (verdict === "pass") return null;
  const current = !stale && runRevision === savedRevision;
  const goalOffered = fixGoalEnabled(tasks);
  const goalBlocked = fixGoalUnavailableText(tasks);

  async function readGoal() {
    goalAbort.current?.abort();
    const controller = new AbortController();
    goalAbort.current = controller;
    setGoalState({ phase: "loading" });
    try {
      const data = await requestFixGoal(goal.trim(), controller.signal);
      // Nothing is applied here: the proposal waits for the person's click, so a late reply cannot overwrite their choices.
      if (controller.signal.aborted) return;
      setGoalState({ phase: "done", data });
    } catch (e) {
      if (!controller.signal.aborted) setGoalState({ phase: "error", error: fixGoalError(e) });
    }
  }

  async function ask() {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setApplied(null);
    setState({ phase: "loading" });
    try {
      const data = await requestFixes(designId, savedRevision, runId, controller.signal, filter);
      if (!controller.signal.aborted) setState({ phase: "done", data });
    } catch (e) {
      if (!controller.signal.aborted) setState({ phase: "error", error: fixesError(e) });
    }
  }

  return (
    <section className="panel panel-b stack" aria-label="Suggested fixes" data-testid="fixes-panel">
      <div className="row">
        <h2 className="h3">Suggested fixes</h2>
        <span className="tag" title="Found by trying changes and running the model on each, not by a language model.">
          Verified by the model, no AI
        </span>
      </div>
      <p className="muted">Try a few ordinary changes at the part of your design that limits it, and keep the ones the model says help.</p>
      <details className="stack" data-testid="fix-choices" open={goalOffered || !isNoFilter(filter) ? true : undefined}>
        <summary>Leave some fixes out, or choose what comes first</summary>
        <div className="stack">
          {goalOffered && (
            <div className="stack" data-testid="fix-goal">
              <div className="row">
                <label htmlFor="fix-goal-input">Say what you want from the fixes</label>
                <span className="tag" title="A hosted AI model only sets the choices below. It never writes a figure.">
                  AI-assisted, experimental
                </span>
              </div>
              <div className="row">
                <input
                  id="fix-goal-input"
                  className="input"
                  data-testid="fix-goal-input"
                  type="text"
                  maxLength={AI_FIX_GOAL_MAX}
                  placeholder="For example: no extra database, cheapest first"
                  value={goal}
                  onChange={(e) => {
                    setGoal(e.target.value);
                    // A proposal or a pending reply belongs to the words it was made from; once they change it is dropped.
                    if (goalState.phase !== "idle") {
                      goalAbort.current?.abort();
                      setGoalState({ phase: "idle" });
                    }
                  }}
                />
                <button className="btn" data-testid="fix-goal-button" disabled={!goal.trim() || !!goalBlocked || goalState.phase === "loading"} onClick={() => void readGoal()}>
                  {goalState.phase === "loading" ? "Reading…" : "Read my goal"}
                </button>
              </div>
              <p className="hint" data-testid="fix-goal-experimental">
                {AI_FIX_GOAL_EXPERIMENTAL} <Link href="/evaluation/ai">What was measured is on the Evaluation page.</Link>
              </p>
              <p className="hint">{AI_FIX_GOAL_NOTICE}</p>
              {goalBlocked && (
                <p className="hint" data-testid="fix-goal-blocked">
                  {goalBlocked}
                </p>
              )}
              {goalState.phase === "error" && (
                <div className="note fail" role="alert" data-testid="fix-goal-error">
                  {goalState.error}
                </div>
              )}
              {goalState.phase === "done" && goalState.data && (
                <div className="note accent" role="status" data-testid="fix-goal-result">
                  {goalState.data.interpretation.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                  {goalState.data.status === "SUPPORTED" && (
                    <div className="row">
                      <button
                        className="btn btn-primary"
                        data-testid="fix-goal-apply"
                        disabled={goalState.applied}
                        onClick={() => {
                          setFilter(goalState.data!.filter);
                          setGoalState({ ...goalState, applied: true });
                        }}
                      >
                        {goalState.applied ? "Applied to the choices below" : "Apply these choices"}
                      </button>
                    </div>
                  )}
                  {goalState.data.status === "CLARIFY" && goalState.data.clarification && (
                    <div className="stack" data-testid="fix-goal-clarify">
                      <p>{goalState.data.clarification.question}</p>
                      <div className="row">
                        {goalState.data.clarification.choices.map((choice) => (
                          <button
                            key={choice.id}
                            className="btn"
                            data-testid={"fix-goal-choice-" + choice.id}
                            disabled={goalState.applied}
                            onClick={() => {
                              setFilter(choice.filter);
                              setGoalState({ ...goalState, applied: true });
                            }}
                          >
                            {choice.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="hint">
                    {goalState.data.status === "SUPPORTED"
                      ? "Nothing changes until you apply it. You can still change the choices below."
                      : goalState.data.status === "CLARIFY"
                        ? "Nothing is applied until you choose. You can also set the choices below yourself."
                        : "Nothing was changed. Use the choices below."}
                  </p>
                </div>
              )}
            </div>
          )}
          <fieldset className="stack">
            <legend>Leave out</legend>
            {KIND_CHOICES.map((c) => (
              <label key={c.kind} className="row">
                <input type="checkbox" data-testid={"fix-exclude-" + c.kind} checked={filter.exclude.includes(c.kind)} onChange={(e) => setFilter(toggleKind(filter, c.kind, e.target.checked))} /> {c.label}
              </label>
            ))}
          </fieldset>
          <label className="row">
            Show first{" "}
            <select data-testid="fix-preference" value={filter.preference} onChange={(e) => setFilter({ ...filter, preference: e.target.value as FixPreferenceName })}>
              {PREFERENCE_CHOICES.map((c) => (
                <option key={c.preference} value={c.preference}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <p className="hint">These only narrow and order the fixes that are tried. Every figure still comes from the model.</p>
        </div>
      </details>
      <div className="row">
        <button className="btn btn-primary" data-testid="fixes-button" disabled={!current || state.phase === "loading"} onClick={() => void ask()}>
          {state.phase === "loading" ? "Trying fixes…" : state.phase === "done" ? "Try again" : "Suggest fixes"}
        </button>
        {!current && (
          <span className="hint" data-testid="fixes-stale">
            This result is not for the saved design. Save, then run the test again to get fixes.
          </span>
        )}
      </div>
      {state.phase === "loading" && <p role="status">Running the model on each fix…</p>}
      {state.phase === "error" && (
        <div className="note fail" role="alert" data-testid="fixes-error">
          {state.error}
        </div>
      )}
      {state.phase === "done" && state.data && (
        <div className="stack" aria-live="polite">
          {state.data.status !== "SUGGESTIONS" && (
            <p className="note" data-testid="fixes-status">
              {statusText(state.data)}
            </p>
          )}
          {state.data.status === "SUGGESTIONS" && state.data.limiter && (
            <p className="hint">
              Aimed at <b>{state.data.limiter.label}</b>, which limits this design. Now it {verdictWord(state.data.baseline.verdict)}: p95 {milliseconds(state.data.baseline.p95)}, errors {percent(state.data.baseline.errorRate)}.
            </p>
          )}
          {state.data.skipped > 0 && state.data.status === "SUGGESTIONS" && <p className="hint">{state.data.skipped} fix(es) could not be checked because the calculation service was busy.</p>}
          <ol className="stack" style={{ listStyle: "none", padding: 0 }}>
            {state.data.suggestions.map((fix, i) => {
              const blocked =
                applied !== null && applied !== fix.id
                  ? "A fix is already in your draft. Undo it in the editor to try another."
                  : dirty && applied === null
                    ? "You have unsaved changes. Save or undo them first, so a fix does not overwrite them."
                    : null;
              return (
                <li key={fix.id} className="panel panel-b stack" data-testid="fix-card">
                  <h3 className="h3">
                    {i + 1}. {fix.title}
                  </h3>
                  <p>{fix.detail}</p>
                  {fix.assumption && <p className="hint">{fix.assumption}</p>}
                  <dl className="kv">
                    <dt>Result</dt>
                    <dd>{verdictWord(fix.after.verdict)}</dd>
                    <dt>p95</dt>
                    <dd>
                      {milliseconds(state.data!.baseline.p95)} to {milliseconds(fix.after.p95)}
                    </dd>
                    <dt>Errors</dt>
                    <dd>
                      {percent(state.data!.baseline.errorRate)} to {percent(fix.after.errorRate)}
                    </dd>
                  </dl>
                  <p data-testid="fix-change">{changeText(state.data!.baseline, fix.after)}</p>
                  <div className="row">
                    <button
                      className="btn"
                      data-testid="fix-apply"
                      disabled={!!blocked || applied === fix.id}
                      onClick={() => {
                        onApply(fix);
                        setApplied(fix.id);
                      }}
                    >
                      {applied === fix.id ? "Applied to your draft" : "Apply to my draft"}
                    </button>
                    {blocked && <span className="hint">{blocked}</span>}
                  </div>
                </li>
              );
            })}
          </ol>
          {applied && (
            <p className="note accent" role="status" data-testid="fix-applied">
              Applied to your draft as an unsaved change. <Link href={workspaceHref(designId, "edit")}>Open the editor</Link> to look at it, save, then run the test to check the result.
            </p>
          )}
          <p className="hint">{FIXES_NOTE}</p>
        </div>
      )}
    </section>
  );
}
