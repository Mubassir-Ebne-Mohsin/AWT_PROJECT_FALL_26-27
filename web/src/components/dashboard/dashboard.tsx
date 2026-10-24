"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { Crumbs } from "@/components/shell/crumbs";
import { resolveRoute } from "@/lib/routes";
import { fetchMe } from "@/lib/api/auth";
import { fetchDashboard } from "@/lib/api/designs";
export function Dashboard() {
  const { user } = useAuth();
  const me = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const dashboard = useQuery({ queryKey: ["dashboard", user?.id], queryFn: fetchDashboard, enabled: !!user });
  const data = dashboard.data;
  return <div className="page stack lg">
    <Crumbs resolved={resolveRoute("/dashboard")} />
    <div className="page-head"><div className="stack"><span className="eyebrow">Dashboard</span><h1 className="h1">Welcome, {(me.data?.displayName ?? user?.displayName ?? "").split(" ")[0]}.</h1><p className="lede">Your saved architectures and model results.</p></div><Link href="/new/template" className="btn btn-primary">New design from template</Link></div>
    {me.data && <div className="note accent" data-testid="me-card">Signed in as <b>{me.data.displayName}</b> ({me.data.email}), role <code>{me.data.role}</code>.</div>}
    <div className="readouts">
      <div className="readout"><span className="eyebrow">Designs</span><div className="v num">{data?.counts.designs ?? "—"}</div></div>
      <div className="readout"><span className="eyebrow">Stored test runs</span><div className="v num">{data?.counts.retainedRuns ?? "—"}</div><span className="hint">{data?.countsLabel ?? "Runs in the retained window"}</span></div>
      <div className="readout"><span className="eyebrow">AI</span><div className="v">Scripted mock</div><span className="hint">Real AI arrives in a later phase</span></div>
    </div>
    {dashboard.isPending && <p role="status">Loading saved designs…</p>}
    {dashboard.isError && <div className="note warn"><p>Could not load saved designs.</p><button className="btn" onClick={() => dashboard.refetch()}>Retry</button></div>}
    <section className="stack"><div className="row between"><h2 className="h2">Your designs</h2><span className="hint">10 most recently edited</span></div>
      {!data?.designs.length ? <div className="panel empty">No designs yet. Choose a template to start.</div> : <div className="m3-template-grid">{data.designs.map(d => <Link className="panel panel-b stack" key={d.id} href={`/designs/${d.id}/edit${d.latestRun ? "?run="+d.latestRun.id : ""}`} style={{ color: "var(--ink)", textDecoration: "none" }}><h3 className="h3">{d.name}</h3><p className="muted">{d.nodeCount} components · revision {d.revision}</p><span className="tag">{d.latestRun ? d.latestRun.verdict ?? d.latestRun.status : "Not run"}</span>{d.latestRun && d.latestRun.designRevision !== d.revision && <span className="hint">Result is from an older revision</span>}</Link>)}</div>}
    </section>
    <section className="panel"><div className="panel-h"><h2 className="h3">Recent test runs</h2></div><div className="tbl-wrap"><table className="tbl"><thead><tr><th>Design</th><th>Revision</th><th>Status</th><th>p95</th></tr></thead><tbody>{data?.recentRuns.map(r => <tr key={r.id}><td><Link href={`/designs/${r.designId}/results?run=${r.id}`}>{r.designName}</Link></td><td>{r.designRevision}</td><td>{r.verdict ?? r.status}</td><td>{r.p95 == null ? "—" : r.p95.toFixed(2)+" ms"}</td></tr>)}{!data?.recentRuns.length && <tr><td colSpan={4} className="muted">No runs yet.</td></tr>}</tbody></table></div></section>
    <p className="hint">M3 connects saved designs to the mathematical engine. Full canvas editing, creation tools, Traffic and Limits follow in later milestones.</p>
  </div>;
}
