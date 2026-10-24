"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { useDrafts } from "@/components/workspace/draft-provider";
import { CanvasEditor } from "@/components/canvas/canvas-editor";
import { RunResults } from "@/components/workspace/run-results";
import { Crumbs } from "@/components/shell/crumbs";
import { RoutePlaceholder } from "@/components/placeholder";
import { resolveRoute } from "@/lib/routes";
import { WS_TABS } from "@/lib/catalog";
import { Design, fetchDesign, fetchRun, deleteDesign } from "@/lib/api/designs";
import { useActiveView } from "@/lib/use-active-view";
import { EditorSession } from "@/lib/editor-session";
export function Workspace({ id, tab }: { id: string; tab: string }) {
  const { user } = useAuth();
  const design = useQuery({ queryKey: ["design", user?.id, id], queryFn: () => fetchDesign(id), enabled: !!user && ["edit", "results"].includes(tab), refetchOnMount: "always", refetchOnWindowFocus: "always" });
  if (!["edit","results"].includes(tab)) return <RoutePlaceholder />;
  if (!design.data) return <div className="page" role="status">{design.isError ? "Could not load this design." : "Loading design…"}</div>;
  return <LoadedWorkspace key={user!.id + id} initial={design.data} tab={tab} />;
}
function LoadedWorkspace({ initial, tab }: { initial: Design; tab: string }) {
  const drafts = useDrafts(), { user } = useAuth(), router = useRouter(), queries = useQueryClient(), search = useSearchParams();
  const isActive = useActiveView();
  const [session] = useState(() => {
    const key = user!.id + ":" + initial.id;
    let value = drafts.get(key);
    if (!value) { value = new EditorSession(initial); drafts.set(key, value); }
    return value;
  });
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);

  const [current, setCurrent] = useState<Design | null>(null);
  const [actionError, setActionError] = useState("");

  const runId = search.get("run") ?? state.run?.id;
  const runQuery = useQuery({ queryKey: ["run", user?.id, initial.id, runId], queryFn: ({ signal }) => fetchRun(initial.id, runId!, signal), enabled: !!runId, refetchInterval: q => q.state.data?.status === "pending" ? 600 : false });
  const displayedRun = runQuery.data?.id === runId ? runQuery.data : state.run?.id === runId ? state.run : undefined;
  useEffect(() => { session.receiveServer(initial); }, [session, initial, state.saving, state.design, state.gesture, state.inputErrors]);
  useEffect(() => { if (runQuery.data && runQuery.data.id === runId) session.setRun(runQuery.data); }, [runQuery.data, runId, session]);
  useEffect(() => {
    if (!session.dirty || state.conflict || state.saving || state.error || state.gesture || state.inputErrors.length) return;
    const timer = setTimeout(() => { void session.save().then(() => queries.invalidateQueries({ queryKey: ["dashboard"] })).catch(() => undefined); }, 750);
    return () => clearTimeout(timer);
  }, [session, state.design, state.conflict, state.saving, state.error, state.gesture, state.inputErrors, queries]);
  async function run() {
    setActionError("");
    try { const accepted = await session.run(); if (!isActive()) return; await queries.invalidateQueries({ queryKey: ["dashboard"] }); if (!isActive()) return; router.replace("/designs/" + initial.id + "/results?run=" + accepted.run.id); }
    catch { /* Session keeps a retryable identity and the draft. */ }
  }
  async function resolveConflict() {
    try { setCurrent(await fetchDesign(initial.id)); } catch (e) { setActionError(e instanceof Error ? e.message : "Could not reload"); }
  }
  async function remove() {
    if (!window.confirm("Delete this design and its stored results?")) return;
    try { await deleteDesign(initial.id); session.dispose(); drafts.delete(user!.id + ":" + initial.id); await queries.invalidateQueries({ queryKey: ["dashboard"] }); router.push("/dashboard"); }
    catch (e) { setActionError(e instanceof Error ? e.message : "Deletion failed"); }
  }
  return <div className="ws">
    <div className="ws-head stack"><h1 className="sr-only">{WS_TABS.find(t => t.id === tab)?.label}</h1>
      <Crumbs resolved={resolveRoute("/designs/" + initial.id + "/" + tab)} />
      <div className="row between"><div className="grow stack">
        <label className="sr-only" htmlFor="design-name">Design name</label><input id="design-name" className="ws-name" maxLength={100} value={state.design.name} onChange={e => session.rename(e.target.value)} />
        <span className="hint" role="status">{state.saving ? "Saving…" : state.conflict ? "Save conflict" : session.dirty ? (state.error ? "Save failed — unsaved changes" : "Unsaved") : "Saved"} · revision {state.saved.revision}</span>
      </div><div className="row tight">
        <button className="btn btn-sm" disabled={state.saving || !session.dirty || state.conflict || state.gesture || !!state.inputErrors.length} onClick={() => session.save().then(() => queries.invalidateQueries({ queryKey: ["dashboard"] })).catch(() => undefined)}>Save</button>
        <button className="btn btn-primary btn-sm" disabled={state.running || state.run?.status === "pending" || state.conflict || state.gesture || !!state.inputErrors.length} onClick={run}>{state.running ? "Submitting…" : state.intent ? "Retry same request" : state.run?.status === "pending" ? "Queued / running…" : "Run test"}</button>
        <button className="btn btn-ghost btn-sm" onClick={remove}>Delete</button>
      </div></div>
      <nav className="tabs" aria-label="Design workspace">{WS_TABS.map(t => <Link key={t.id} className={`tab ${tab === t.id ? "active" : ""}`} aria-current={tab === t.id ? "page" : undefined} href={`/designs/${initial.id}/${t.id}${runId ? "?run="+runId : ""}`}>{t.label}{!["edit","results"].includes(t.id) && <span className="ph-mark">Later</span>}</Link>)}</nav>
    </div>
    <div className="ws-body stack lg m3-body">

      {(state.error || actionError) && <p className="note fail" role="alert">{state.error || actionError}</p>}
      {state.intent && <p className="note warn">Acceptance is unconfirmed. Retry the same request to recover its status. Your newer edits will be used only for a subsequent run.</p>}
      {state.intent && state.error.includes("Acceptance is unknown beyond the 24-hour") && <button className="btn" onClick={() => { if (window.confirm("The original acceptance is unknown. Check recent runs first. Starting another intent may duplicate that calculation. Continue?")) session.abandonUncertainIntent(); }}>Allow a deliberate new calculation</button>}
      {state.conflict && <button className="btn" onClick={resolveConflict}>Inspect current saved version</button>}
      {current && <section className="panel panel-b stack" aria-label="Save conflict resolution">
        <h2 className="h3">Saved revision {current.revision}: {current.name}</h2>
        <p>Your draft remains in memory. Review the saved graph before deciding.</p>
        <details><summary>Current saved inputs</summary><pre className="m3-wrap">{JSON.stringify({ graph: current.graph, traffic: current.traffic }, null, 2)}</pre></details>
        <div className="row"><button className="btn" onClick={() => { if (window.confirm("Discard your draft and load this saved version?")) { session.reload(current); setCurrent(null); } }}>Discard draft and reload</button>
        <button className="btn" onClick={() => { if (window.confirm("Keep your draft on this revision? The next save will replace the reviewed saved inputs.")) { session.reapply(current); setCurrent(null); } }}>Reapply my draft deliberately</button></div>
      </section>}
      {tab === "edit" && <CanvasEditor session={session}/>}
      {state.design.description && <details className="panel panel-b"><summary>Design description and assumptions</summary><p className="m3-wrap">{state.design.description}</p></details>}
      {runQuery.isError && <div className="note fail" role="alert"><p>Could not load the selected result.</p><button className="btn" onClick={() => runQuery.refetch()}>Retry loading result</button></div>}
      <RunResults run={displayedRun} stale={session.isRunStale(displayedRun)} />
    </div>
  </div>;
}
