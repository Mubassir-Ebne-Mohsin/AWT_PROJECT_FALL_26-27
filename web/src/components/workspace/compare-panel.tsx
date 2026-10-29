"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import type { Design } from "@/lib/api/designs";
import { compareVersions, type Comparison, type DesignVersion, type RunSummary } from "@/lib/api/history";
import { METRIC_ROWS, NOT_COMPARABLE_GUIDANCE, deltaTag, reasonText, verdictTag, verdictText } from "@/lib/compare-presentation";
import { restoreChanges, runLabel, verdictLabel } from "@/lib/history-presentation";
import { milliseconds, percent } from "@/lib/result-presentation";
import { runHref } from "@/lib/run-links";

const toneClass = { better: "ok", worse: "fail", same: "" } as const;

function RunPicker({ revision, runs, value, onChange }: { revision: number; runs: RunSummary[]; value: string; onChange: (id: string) => void }) {
  const id = useId();
  return (
    <div className="m15-field">
      <label htmlFor={id}>Run for revision {revision}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Latest completed test run (default)</option>
        {runs.map((r) => (
          <option key={r.id} value={r.id}>
            {runLabel(r)} · {new Date(r.createdAt).toLocaleString()}
            {r.status === "completed" ? ` · ${verdictLabel(r.verdict)}` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

function runLink(designId: string, side: Comparison["a"]) {
  return side.run ? <Link href={runHref(designId, side.run)}>Open revision {side.revision}&apos;s run</Link> : <span className="muted">No run for revision {side.revision}</span>;
}

/** Two retained versions of one design, side by side. The server decides whether the results are comparable. */
export function ComparePanel({
  designId,
  older,
  newer,
  runs,
  onClose,
}: {
  designId: string;
  older: DesignVersion;
  newer: DesignVersion;
  runs: RunSummary[];
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [runA, setRunA] = useState("");
  const [runB, setRunB] = useState("");
  const a = older.revision,
    b = newer.revision;
  const result = useQuery({
    queryKey: ["compare", user?.id, designId, a, b, runA, runB],
    queryFn: ({ signal }) => compareVersions(designId, { a, b, runA: runA || undefined, runB: runB || undefined }, signal),
  });
  const changes = restoreChanges(older.snapshot as Design, newer.snapshot as Design);
  const data = result.data;
  const ma = data?.a.run?.metrics ?? null,
    mb = data?.b.run?.metrics ?? null;

  return (
    <section className="m15-compare stack" aria-label={`Comparison of revision ${a} and revision ${b}`}>
      <div className="panel">
        <div className="panel-h">
          <h3 className="h3">
            Compare revision {a} and revision {b}
          </h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            Close comparison
          </button>
        </div>
        <div className="panel-b stack">
          <div className="m15-pickers">
            <RunPicker revision={a} runs={runs.filter((r) => r.designRevision === a)} value={runA} onChange={setRunA} />
            <RunPicker revision={b} runs={runs.filter((r) => r.designRevision === b)} value={runB} onChange={setRunB} />
          </div>
          <div>
            <h4 className="h4">
              What changed from revision {a} to revision {b}
            </h4>
            {changes.length ? (
              <ul className="m15-changes">
                {changes.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : (
              <p className="small muted">The saved content is identical.</p>
            )}
          </div>
          {result.isPending && <p role="status">Comparing…</p>}
          {result.isError && (
            <div className="note fail" role="alert">
              <div>The comparison could not be loaded. Your design is unaffected.</div>
              <button className="btn btn-sm" onClick={() => void result.refetch()}>
                Try again
              </button>
            </div>
          )}
          {data && !data.comparable && (
            <div className="stack">
              <div className="note warn" role="status">
                <div className="stack">
                  <strong>These results cannot be compared.</strong>
                  <ul>
                    {data.reasons.map((reason) => (
                      <li key={reason}>{reasonText(reason, a, b)}</li>
                    ))}
                  </ul>
                  <span>{NOT_COMPARABLE_GUIDANCE}</span>
                </div>
              </div>
              {(ma || mb) && (
                <table className="m15-table">
                  <caption>Each result on its own (not subtracted)</caption>
                  <thead>
                    <tr>
                      <th scope="col">Metric</th>
                      <th scope="col">Revision {a}</th>
                      <th scope="col">Revision {b}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th scope="row">Verdict</th>
                      <td>{ma ? verdictText(ma.verdict) : "No result"}</td>
                      <td>{mb ? verdictText(mb.verdict) : "No result"}</td>
                    </tr>
                    {METRIC_ROWS.map((row) => (
                      <tr key={row.key}>
                        <th scope="row">{row.label}</th>
                        <td>{ma ? row.format(ma[row.key]) : "—"}</td>
                        <td>{mb ? row.format(mb[row.key]) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
          {data && data.comparable && ma && mb && data.deltas && (
            <div className="stack">
              <table className="m15-table">
                <caption>
                  Revision {a} to revision {b}, same traffic and model version
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Metric</th>
                    <th scope="col">Revision {a}</th>
                    <th scope="col">Revision {b}</th>
                    <th scope="col">Change</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">Verdict</th>
                    <td>{verdictText(ma.verdict)}</td>
                    <td>{verdictText(mb.verdict)}</td>
                    <td>
                      <span className={"tag " + toneClass[verdictTag(ma.verdict, mb.verdict).tone]}>{verdictTag(ma.verdict, mb.verdict).label}</span>
                    </td>
                  </tr>
                  {METRIC_ROWS.map((row) => {
                    const delta = data.deltas![row.key];
                    const tag = deltaTag(row, ma[row.key], delta);
                    return (
                      <tr key={row.key}>
                        <th scope="row">{row.label}</th>
                        <td>{row.format(ma[row.key])}</td>
                        <td>{row.format(mb[row.key])}</td>
                        <td>
                          <span className={"tag " + toneClass[tag.tone]}>{tag.label}</span> <span className="small muted">{row.formatDelta(delta)}</span>
                        </td>
                      </tr>
                    );
                  })}
                  <tr>
                    <th scope="row">Bottleneck</th>
                    <td>{ma.bottleneckLabel ?? "None identified"}</td>
                    <td>{mb.bottleneckLabel ?? "None identified"}</td>
                    <td className="small muted">{ma.bottleneckLabel === mb.bottleneckLabel ? "Same" : "Changed"}</td>
                  </tr>
                </tbody>
              </table>
              <p className="small muted">
                Targets: p95 {milliseconds(ma.p95Target)}, error budget {percent(ma.errorBudget)}. Predicted by the model, not measured.
              </p>
            </div>
          )}
          {data && (
            <p className="small">
              {runLink(designId, data.a)} · {runLink(designId, data.b)}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
