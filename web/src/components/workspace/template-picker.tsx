"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Crumbs } from "@/components/shell/crumbs";
import { resolveRoute } from "@/lib/routes";
import { createDesign, fetchTemplates, Template } from "@/lib/api/designs";
export function TemplatePicker() {
  const templates = useQuery({ queryKey: ["templates"], queryFn: fetchTemplates });
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const router = useRouter(), queries = useQueryClient();
  async function choose(t: Template) {
    if (pending) return;
    setPending(true); setError("");
    try { const d = await createDesign(t); await queries.invalidateQueries({ queryKey: ["dashboard"] }); router.push("/designs/" + d.id + "/edit"); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not create design"); setPending(false); }
  }
  return <div className="page stack lg">
    <Crumbs resolved={resolveRoute("/new/template")} />
    <div className="page-head"><div><span className="eyebrow">New design</span><h1 className="h1">Pick a template</h1><p className="lede">Start from a complete design with sensible traffic.</p></div></div>
    {error && <p className="note fail" role="alert">{error}</p>}
    {templates.isPending && <p role="status">Loading templates…</p>}
    {templates.isError && <button className="btn" onClick={() => templates.refetch()}>Retry loading templates</button>}
    <div className="m3-template-grid">{templates.data?.map(t => <article className="panel stack" key={t.id}><div className="panel-b stack">
      <span className="tag">{t.graph.nodes.length} components</span><h2 className="h2">{t.name}</h2><p className="muted">{t.blurb}</p>
      <span className="num small">{t.traffic.rps} rps · p95 target {t.traffic.sloP95} ms</span>
      <button className="btn btn-primary" disabled={pending} onClick={() => choose(t)}>Use {t.name}</button>
    </div></article>)}</div>
    <p className="hint">M3: template, replica editing, save, run and reopen. The full canvas editor arrives in the next milestones.</p>
  </div>;
}
