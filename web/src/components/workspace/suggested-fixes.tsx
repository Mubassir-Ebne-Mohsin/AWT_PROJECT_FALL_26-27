"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FIXES_NOTE, changeText, fixesError, requestFixes, statusText, verdictWord, type FixSuggestion, type Fixes } from "@/lib/fixes";
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
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  if (verdict === "pass") return null;
  const current = !stale && runRevision === savedRevision;

  async function ask() {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setApplied(null);
    setState({ phase: "loading" });
    try {
      const data = await requestFixes(designId, savedRevision, runId, controller.signal);
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
