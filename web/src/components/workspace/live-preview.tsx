import type { EditorSession } from "@/lib/editor-session";
import type { PreviewState } from "@/lib/preview-session";
import { rpsToSlider, sliderToRps } from "@/lib/traffic";
import { milliseconds, numberText, percent } from "@/lib/result-presentation";

export interface LivePreviewView {
  enabled: boolean;
  state: PreviewState;
  /** True only when the shown output was computed for the exact current semantic inputs. */
  current: boolean;
  onToggle: () => void;
  onRetry: () => void;
}

/** Status line shared by the Edit live bar and the Traffic panel. Stale output is labelled, never shown as current. */
function statusText(v: LivePreviewView) {
  const s = v.state;
  if (!v.enabled) return "Live preview off";
  if (s.status === "paused") return s.message ?? "Live preview paused";
  if (s.status === "error") return s.message ?? "Live preview unavailable";
  if (s.status === "waiting" || s.status === "loading") return s.summary ? "Updating… showing the previous preview as stale" : "Calculating live preview…";
  if (!v.current && s.summary) return "Inputs changed; this preview is stale";
  if (s.status === "ready" && s.summary === null) return s.message ?? "Fix the graph to see a live preview.";
  return "Live preview — unsaved inputs";
}

function Readouts({ v, onSelect }: { v: LivePreviewView; onSelect?: (id: string) => void }) {
  const s = v.state.summary;
  if (!v.enabled || !s) return null;
  const t = s.traffic,
    b = s.nodes.find((n) => n.id === s.bottleneckId);
  const p95 = s.p95 > t.sloP95 ? "c-fail" : s.p95 > t.sloP95 * 0.8 ? "c-warn" : "c-ok";
  const err = s.errorRate > t.errorBudget ? "c-fail" : s.errorRate > 0 ? "c-warn" : "c-ok";
  return (
    <div className={"row m8-readouts" + (v.current ? "" : " is-stale")} aria-live="polite">
      <div className="ro"><span className="k">p50</span><span className="v">{milliseconds(s.p50)}</span></div>
      <div className="ro"><span className="k">p95 · target {milliseconds(t.sloP95)}</span><span className={"v " + (v.current ? p95 : "")}>{milliseconds(s.p95)}</span></div>
      <div className="ro"><span className="k">Errors</span><span className={"v " + (v.current ? err : "")}>{percent(s.errorRate)}</span></div>
      <div className="ro grow">
        <span className="k">Busiest</span>
        {b && v.current ? (
          onSelect ? (
            <button className="btn btn-ghost btn-sm" onClick={() => onSelect(b.id)}>
              <span className={"sdot " + b.status} aria-hidden="true"></span> {b.label} · {numberText(b.rho * 100, 0)}%
            </button>
          ) : (
            <span className="v">{b.label} · {numberText(b.rho * 100, 0)}%</span>
          )
        ) : (
          <span className="v muted">{v.current ? "nothing near its limit" : "—"}</span>
        )}
      </div>
      {v.current && s.backgroundIssues.length > 0 && (
        <p className="hint">
          Background (not request) drops: {s.backgroundIssues.map((i) => i.label + " " + percent(i.dropped)).join(", ")}
        </p>
      )}
    </div>
  );
}

/** Bottom bar on Edit (prototype LiveBar): a real draft traffic control plus the live model preview. */
export function LiveBar({ session, v, onSelect, disabled }: { session: EditorSession; v: LivePreviewView; onSelect: (id: string) => void; disabled: boolean }) {
  const t = session.state.design.traffic;
  return (
    <div className="live m8-live" role="region" aria-label="Live traffic and preview">
      <div className="slider">
        <label className="eyebrow" htmlFor="live-rps">Traffic</label>
        <input
          id="live-rps"
          type="range"
          min={0}
          max={1000}
          step={1}
          disabled={disabled}
          value={rpsToSlider(t.rps)}
          aria-valuetext={numberText(t.rps, 0) + " requests per second"}
          onChange={(e) => session.setTraffic({ rps: sliderToRps(Number(e.target.value)) })}
        />
        <span className="mono num" style={{ fontWeight: 700, minWidth: 84 }}>{numberText(t.rps, 0)} rps</span>
      </div>
      <span className="sep" />
      <span className={"tag " + (v.enabled ? "accent" : "")} role="status">{statusText(v)}</span>
      <Readouts v={v} onSelect={onSelect} />
      {v.enabled && v.state.status === "error" && v.state.retryable && (
        <button className="btn btn-sm" onClick={v.onRetry}>Retry preview</button>
      )}
    </div>
  );
}

/** Traffic tab panel: explicit opt-in, clearly separate from the recorded run's chart. */
export function LivePreviewPanel({ v }: { v: LivePreviewView }) {
  return (
    <section className="panel" aria-label="Live preview">
      <div className="panel-h">
        <h2 className="h3">Live preview — unsaved inputs</h2>
        <label className="row tight small">
          <input type="checkbox" checked={v.enabled} onChange={v.onToggle} /> Live preview
        </label>
      </div>
      <div className="panel-b stack">
        <p className="hint" role="status">{statusText(v)}</p>
        <Readouts v={v} />
        {v.enabled && v.state.status === "error" && v.state.retryable && (
          <button className="btn btn-sm" style={{ justifySelf: "start" }} onClick={v.onRetry}>Retry preview</button>
        )}
        <p className="hint">
          A model summary of your current, possibly unsaved inputs. It is never saved and never replaces a recorded run;
          the timeline below belongs to the recorded run only.
        </p>
      </div>
    </section>
  );
}
