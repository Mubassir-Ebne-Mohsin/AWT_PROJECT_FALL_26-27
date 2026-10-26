"use client";
import Link from "next/link";
import { kindLabel, runHref, workspaceHref } from "@/lib/run-links";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { useDrafts } from "@/components/workspace/draft-provider";
import { Crumbs } from "@/components/shell/crumbs";
import { Modal } from "@/components/ui/modal";
import { CREATION_CHOICES } from "@/components/creation/chooser";
import { resolveRoute } from "@/lib/routes";
import { fetchDashboard, deleteDesign, DashboardData } from "@/lib/api/designs";
import { designStatus } from "@/lib/design-status";
import { fetchMe } from "@/lib/api/auth";
import { useActiveView } from "@/lib/use-active-view";
export function Dashboard() {
  const { user } = useAuth(),
    queries = useQueryClient(),
    drafts = useDrafts(),
    active = useActiveView();
  const me = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const dashboard = useQuery({
    queryKey: ["dashboard", user?.id],
    queryFn: fetchDashboard,
    enabled: !!user,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: (q) =>
      q.state.data?.designs.some((d) => d.latestRun?.status === "pending")
        ? 5000
        : false,
  });
  const [removing, setRemoving] = useState<
      DashboardData["designs"][number] | null
    >(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const deleting = useRef(false),
    data = dashboard.data;
  const attention =
    data?.designs.filter(
      (d) =>
        d.latestRun?.status === "completed" &&
        d.latestRun.designRevision === d.revision &&
        ["fail", "strained"].includes(d.latestRun.verdict ?? ""),
    ) ?? [];
  async function remove() {
    if (!removing || deleting.current || !user) return;
    deleting.current = true;
    setBusy(true);
    setError("");
    try {
      await deleteDesign(removing.id);
      const key = user.id + ":" + removing.id;
      drafts.get(key)?.dispose();
      drafts.delete(key);
      queries.removeQueries({ queryKey: ["design", user.id, removing.id] });
      queries.removeQueries({ queryKey: ["run", user.id, removing.id] });
      if (!active()) return;
      setRemoving(null);
      await queries.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (e) {
      if (active())
        setError(e instanceof Error ? e.message : "Deletion failed");
    } finally {
      deleting.current = false;
      if (active()) setBusy(false);
    }
  }
  return (
    <div className="page stack lg">
      <Crumbs resolved={resolveRoute("/dashboard")} />
      <div className="page-head">
        <div className="stack">
          <span className="eyebrow">Dashboard</span>
          <h1 className="h1">
            Welcome, {(user?.displayName ?? "").split(" ")[0]}.
          </h1>
          <p className="lede">
            Your architectures, saved progress and predicted results.
          </p>
        </div>
        <div className="row">
          <Link className="btn" href="/new/describe">
            Describe a system
          </Link>
          <Link className="btn btn-primary" href="/new">
            New design
          </Link>
        </div>
      </div>
      {me.data && (
        <p className="hint" data-testid="me-card">
          Signed in as {me.data.displayName} ({me.data.email}).
        </p>
      )}
      <div className="readouts">
        <div className="readout">
          <span className="eyebrow">Designs</span>
          <div className="v num">{data?.counts.designs ?? "—"}</div>
          <span className="hint">Owned by your account</span>
        </div>
        <div className="readout">
          <span className="eyebrow">Stored test runs</span>
          <div className="v num">{data?.counts.retainedRuns ?? "—"}</div>
          <span className="hint">
            {data?.countsLabel ?? "Runs in the retained window"}
          </span>
        </div>
        <div className="readout">
          <span className="eyebrow">Needs attention</span>
          <div className="v num">{data ? attention.length : "—"}</div>
          <span className="hint">Current results in the 10 recent designs</span>
        </div>
        <div className="readout">
          <span className="eyebrow">Draft assistant</span>
          <div className="v m4-small-value">Scripted mock</div>
          <span className="hint">Local rules · no AI calls</span>
        </div>
      </div>
      {dashboard.isPending && <p role="status">Loading saved designs…</p>}
      {dashboard.isError && (
        <div className="note warn" role="alert">
          <p>Could not load saved designs.</p>
          <button className="btn" onClick={() => dashboard.refetch()}>
            Retry
          </button>
        </div>
      )}
      {attention.length > 0 && (
        <section className="stack">
          <div className="row between">
            <h2 className="h2">Needs attention</h2>
            <span className="hint">Saved results, not live recalculations</span>
          </div>
          <div className="panel">
            {attention.map((d) => (
              <div key={d.id} className="m4-attention row between">
                <span>
                  <b>{d.name}</b> · {designStatus(d).label}
                </span>
                <Link
                  className="btn btn-sm"
                  href={runHref(d.id, d.latestRun!)}
                >
                  {d.latestRun!.kind === "limits" ? "Open Limits" : "Open results"}
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="stack">
        <div className="row between">
          <h2 className="h2">Your designs</h2>
          <span className="hint">10 most recently edited</span>
        </div>
        {data && !data.designs.length && (
          <div className="panel empty stack">
            <h3 className="h3">Your first design starts here</h3>
            <p>
              Choose a template, describe a system, start blank or import JSON.
            </p>
            <Link className="btn btn-primary" href="/new">
              Start a design
            </Link>
          </div>
        )}
        <div className="m3-template-grid">
          {data?.designs.map((d) => {
            const status = designStatus(d);
            return (
              <article className="panel m4-design-card" key={d.id}>
                <Link
                  className="m4-design-link stack"
                  href={workspaceHref(
                    d.id,
                    "edit",
                    d.latestRun
                      ? d.latestRun.kind === "limits"
                        ? { limits: d.latestRun.id }
                        : { run: d.latestRun.id }
                      : {},
                  )}
                >
                  <div className="m4-card-head">
                    <span className="eyebrow">
                      {d.source === "scripted" ? "Scripted mock" : d.source}
                    </span>
                    <span className={"tag " + status.tone}>{status.label}</span>
                  </div>
                  <h3 className="h3">{d.name}</h3>
                  <p className="muted">
                    {d.nodeCount} components · {d.edgeCount} connections
                  </p>
                  <span className="hint">
                    Revision {d.revision} · edited{" "}
                    {new Date(d.updatedAt).toLocaleDateString()}
                  </span>
                </Link>
                <div className="m4-card-footer row between">
                  <span className="hint">
                    {d.latestRun?.p95 == null
                      ? "No completed latency"
                      : d.latestRun.p95.toFixed(2) +
                        (d.latestRun.kind === "limits"
                          ? " ms p95 at current load (Limits search)"
                          : " ms p95 (stored)")}
                  </span>
                  <button
                    className="btn btn-ghost btn-sm"
                    aria-label={"Delete " + d.name}
                    onClick={() => {
                      setError("");
                      setRemoving(d);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
      <div className="split">
        <section className="panel">
          <div className="panel-h">
            <h2 className="h3">Recent test runs</h2>
            <span className="hint">Latest 10 retained</span>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Design</th>
                  <th>Revision</th>
                  <th>Result</th>
                  <th>p95</th>
                </tr>
              </thead>
              <tbody>
                {data?.recentRuns.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link
                        href={runHref(r.designId, r)}
                      >
                        {r.designName}
                      </Link>
                      <span className="hint"> · {kindLabel(r.kind)}</span>
                    </td>
                    <td>{r.designRevision}</td>
                    <td>
                      {r.status === "failed"
                        ? "Calculation failed"
                        : r.status === "pending"
                          ? r.kind === "limits"
                            ? "Limits search running"
                            : "Test running"
                          : r.kind === "limits"
                            ? (r.verdict ?? "completed") + " at current load"
                            : r.verdict}
                    </td>
                    <td>{r.p95 == null ? "—" : r.p95.toFixed(2) + " ms"}</td>
                  </tr>
                ))}
                {data && !data.recentRuns.length && (
                  <tr>
                    <td colSpan={4}>
                      No runs yet. Open a saved design to run the model.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel">
          <div className="panel-h">
            <h2 className="h3">Start something new</h2>
          </div>
          <div className="panel-b stack">
            {CREATION_CHOICES.map(([path, title, description]) => (
              <Link key={path} href={"/new/" + path} className="m4-shortcut">
                <b>{title}</b>
                <span className="muted small">{description}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
      <Link className="btn btn-ghost" href="/new/template">
        New design from template
      </Link>
      <p className="hint">
        Results are mathematical predictions from saved runs. Earlier revisions are labelled; open results to compare tested inputs. Canvas connections and undo are available in Edit.
      </p>
      {removing && (
        <Modal
          label="Delete design"
          onClose={busy ? undefined : () => setRemoving(null)}
          alert
          center
        >
          <div className="modal-h">
            <h2 className="h3">Delete “{removing.name}”?</h2>
          </div>
          <div className="modal-b stack">
            <p>
              This permanently removes the design and its stored test results.
              Active calculations will be cancelled.
            </p>
            {error && (
              <p role="alert" className="note fail">
                {error} Check the dashboard before retrying if the response was
                lost.
              </p>
            )}
          </div>
          <div className="modal-f">
            <button
              className="btn"
              disabled={busy}
              onClick={() => setRemoving(null)}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void remove()}
            >
              {busy ? "Deleting…" : "Delete design"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
