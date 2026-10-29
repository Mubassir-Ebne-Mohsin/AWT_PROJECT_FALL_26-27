"use client";

import { useState } from "react";
import Link from "next/link";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { ComparePanel } from "@/components/workspace/compare-panel";
import { orderPair } from "@/lib/compare-presentation";
import type { Design } from "@/lib/api/designs";
import { ApiError } from "@/lib/api/errors";
import { VERSIONS_PAGE, fetchRunSummaries, fetchVersions, restoreVersion, type DesignVersion } from "@/lib/api/history";
import {
  RETENTION_TEXT,
  groupRunsByRevision,
  restoreChanges,
  runLabel,
  snapshotSummary,
  verdictLabel,
  versionOrigin,
} from "@/lib/history-presentation";
import { milliseconds } from "@/lib/result-presentation";
import { runHref } from "@/lib/run-links";

type Notice = { ok: boolean; text: string } | null;

function failureText(error: unknown, designId: string): string {
  if (!(error instanceof ApiError)) return "Something went wrong. Nothing was changed.";
  const reason = (error.details as { reason?: string; currentRevision?: number } | undefined)?.reason;
  const current = (error.details as { currentRevision?: number } | undefined)?.currentRevision;
  if (reason === "REVISION_MISMATCH")
    return `This design changed elsewhere${current ? ` (it is now revision ${current})` : ""}. History was refreshed; nothing was changed. Review it and try again.`;
  if (reason === "VERSION_NOT_RETAINED") return "That version is no longer retained, so it cannot be restored. Nothing was changed.";
  if (reason === "RESTORE_NO_CHANGES") return "That version is identical to the current design. There is nothing to restore.";
  if (reason === "RESTORE_SCHEMA_MISMATCH") return "That version uses an older design format and cannot be restored.";
  if (error.status === 403 || error.status === 404) return `This design (${designId.slice(0, 8)}) is not available to this account.`;
  if (error.code === "NETWORK") return "The server could not be reached. Nothing was changed.";
  return "Restore did not complete. Nothing was changed.";
}

/** Read-only timeline of saved versions and recorded runs, with a safe Restore that creates a new revision. */
export function HistoryTab({
  designId,
  saved,
  blocked,
  onRestored,
}: {
  designId: string;
  saved: Design;
  /** Why Restore is unavailable right now (unsaved draft, conflict, calculation); null when allowed. */
  blocked: string | null;
  onRestored: (design: Design) => void;
}) {
  const { user } = useAuth();
  const queries = useQueryClient();
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  // At most two versions can be picked for a side-by-side comparison.
  const [picked, setPicked] = useState<number[]>([]);
  const togglePick = (revision: number) =>
    setPicked((now) => (now.includes(revision) ? now.filter((r) => r !== revision) : now.length < 2 ? [...now, revision] : now));

  const versions = useInfiniteQuery({
    queryKey: ["versions", user?.id, designId, saved.revision],
    queryFn: ({ pageParam, signal }) => fetchVersions(designId, pageParam, signal),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => (last.length === VERSIONS_PAGE ? last[last.length - 1].revision : undefined),
    refetchOnMount: "always",
  });
  const runs = useQuery({
    queryKey: ["history-runs", user?.id, designId, saved.revision],
    queryFn: ({ signal }) => fetchRunSummaries(designId, signal),
    refetchOnMount: "always",
  });

  const items: DesignVersion[] = versions.data?.pages.flat() ?? [];
  const byRevision = groupRunsByRevision(runs.data ?? []);
  const shown = new Set(items.map((v) => v.revision));
  const orphans = (runs.data ?? []).filter((r) => !shown.has(r.designRevision));

  async function confirm(v: DesignVersion) {
    setBusy(true);
    setNotice(null);
    try {
      const next = (await restoreVersion(designId, v.revision, saved.revision)) as Design;
      onRestored(next);
      setOpen(null);
      setNotice({ ok: true, text: `Restored revision ${v.revision} as revision ${next.revision}. Revision ${saved.revision} is still in History. Run a test to see how the restored design performs.` });
      await queries.invalidateQueries({ queryKey: ["versions", user?.id, designId] });
    } catch (error) {
      setNotice({ ok: false, text: failureText(error, designId) });
      setOpen(null);
      void queries.invalidateQueries({ queryKey: ["design", user?.id, designId] });
      void queries.invalidateQueries({ queryKey: ["versions", user?.id, designId] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="m15-history stack" aria-label="Version history">
      <div className="panel">
        <div className="panel-h">
          <h2 className="h3">History</h2>
          <span className="tag">Revision {saved.revision} is current</span>
        </div>
        <div className="panel-b stack">
          <p className="hint">{RETENTION_TEXT}</p>
          {blocked && (
            <p className="note warn" role="status">
              {blocked}
            </p>
          )}
          {notice && (
            <p className={"note " + (notice.ok ? "ok" : "fail")} role={notice.ok ? "status" : "alert"}>
              {notice.text}
            </p>
          )}
          {versions.isPending && <p role="status">Loading history…</p>}
          {versions.isError && (
            <div className="note fail" role="alert">
              <div>History could not be loaded. Your design is unaffected.</div>
              <button className="btn btn-sm" onClick={() => void versions.refetch()}>
                Try again
              </button>
            </div>
          )}
          {versions.isSuccess && items.length === 0 && <p>No saved versions are available for this design.</p>}
          {items.length === 1 && items[0].revision === saved.revision && (
            <p className="hint">Only the current version exists so far. Every save adds a version you can return to.</p>
          )}
          {items.length > 1 && picked.length < 2 && (
            <p className="small muted">Select two versions below to compare them side by side.</p>
          )}
          {picked.length === 2 &&
            (() => {
              const [lo, hi] = orderPair(picked[0], picked[1]);
              const older = items.find((v) => v.revision === lo);
              const newer = items.find((v) => v.revision === hi);
              return older && newer ? (
                <ComparePanel designId={designId} older={older} newer={newer} runs={runs.data ?? []} onClose={() => setPicked([])} />
              ) : null;
            })()}
          <ol className="m15-timeline" aria-label="Versions, newest first">
            {items.map((v) => {
              const origin = versionOrigin(v);
              const isCurrent = v.revision === saved.revision;
              const runsHere = byRevision.get(v.revision) ?? [];
              const changes = open === v.revision ? restoreChanges(saved, v.snapshot as Design) : [];
              return (
                <li key={v.id} className={"m15-version" + (isCurrent ? " is-current" : "")}>
                  <div className="row tight m15-vh">
                    <h3 className="h4">Revision {v.revision}</h3>
                    {isCurrent && <span className="tag accent">Current</span>}
                    <span className="tag">{origin.label}</span>
                    <time className="small muted" dateTime={v.createdAt}>
                      {new Date(v.createdAt).toLocaleString()}
                    </time>
                  </div>
                  {origin.note && <p className="small muted">{origin.note}</p>}
                  <p className="small">{snapshotSummary(v.snapshot as Design)}</p>
                  {runsHere.length > 0 && (
                    <ul className="m15-runs" aria-label={`Recorded runs for revision ${v.revision}`}>
                      {runsHere.map((r) => (
                        <li key={r.id}>
                          <Link href={runHref(designId, r)}>{runLabel(r)}</Link>
                          {r.status === "completed" && (
                            <span className="muted">
                              {" "}
                              · {verdictLabel(r.verdict)}
                              {r.p95 !== null && ` · p95 ${milliseconds(r.p95)}`}
                            </span>
                          )}{" "}
                          <time className="small muted" dateTime={r.createdAt}>
                            {new Date(r.createdAt).toLocaleString()}
                          </time>
                        </li>
                      ))}
                    </ul>
                  )}
                  <label className="m15-pick small">
                    <input
                      type="checkbox"
                      checked={picked.includes(v.revision)}
                      disabled={!picked.includes(v.revision) && picked.length >= 2}
                      onChange={() => togglePick(v.revision)}
                    />
                    Select revision {v.revision} to compare
                  </label>
                  {!isCurrent && (
                    <div className="row tight">
                      <button
                        className="btn btn-sm"
                        disabled={!!blocked || busy}
                        aria-expanded={open === v.revision}
                        onClick={() => setOpen(open === v.revision ? null : v.revision)}
                      >
                        Restore revision {v.revision}
                      </button>
                    </div>
                  )}
                  {open === v.revision && (
                    <div className="m15-confirm note" role="group" aria-label={`Confirm restoring revision ${v.revision}`}>
                      <div className="stack">
                        <strong>
                          Restoring saves revision {v.revision}&apos;s content as revision {saved.revision + 1}. Revision {saved.revision} stays in History.
                        </strong>
                        <ul>
                          {(changes.length ? changes : ["No visible differences."]).map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                        <div className="row tight">
                          <button className="btn btn-primary btn-sm" disabled={busy || !!blocked} onClick={() => void confirm(v)}>
                            {busy ? "Restoring…" : `Restore as revision ${saved.revision + 1}`}
                          </button>
                          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setOpen(null)}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          {versions.hasNextPage && (
            <button className="btn btn-sm" disabled={versions.isFetchingNextPage} onClick={() => void versions.fetchNextPage()}>
              {versions.isFetchingNextPage ? "Loading…" : "Load older versions"}
            </button>
          )}
          {runs.isError && <p className="small muted">Recorded runs could not be loaded; the versions above are unaffected.</p>}
          {orphans.length > 0 && (
            <div className="stack">
              <h3 className="h4">Other recorded runs</h3>
              <p className="small muted">
                These belong to versions that are {versions.hasNextPage ? "not loaded yet or " : ""}no longer retained.
              </p>
              <ul className="m15-runs">
                {orphans.map((r) => (
                  <li key={r.id}>
                    <Link href={runHref(designId, r)}>{runLabel(r)}</Link>
                    <span className="muted"> · revision {r.designRevision}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
