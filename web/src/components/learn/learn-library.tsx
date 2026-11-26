"use client";
import Link from "next/link";
import { useState } from "react";
import { Crumbs } from "@/components/shell/crumbs";
import { LessonIcon } from "@/components/learn/lesson-icon";
import { CORE_TOPICS, TOPICS } from "@/lib/learn-content";
import { LEARN_CATEGORIES, type LearnCategory } from "@/lib/learn-types";
import { MARK_LABEL, markOf, type Progress } from "@/lib/learn-progress";
import { resolveRoute } from "@/lib/routes";
const interactive = new Set(CORE_TOPICS.map(t => t.id));
export function LearnLibrary({ progress, clear }: { progress: Progress; clear: () => void }) {
 const [search, setSearch] = useState("");
 const [category, setCategory] = useState<LearnCategory | "all">("all");
 const [cleared, setCleared] = useState(false);
 const needle = search.trim().toLowerCase();
 const topics = TOPICS.filter(t => (category === "all" || t.category === category) && [t.title,t.summary,t.component,...(t.keywords ?? []),...(t.properties?.map(p => p.key+" "+p.meaning) ?? [])].join(" ").toLowerCase().includes(needle));
 return <div className="page stack lg learn-library" data-testid="learn-index">
  <Crumbs resolved={resolveRoute("/learn")} />
  <div className="learn-heading"><div><span className="eyebrow">The architecture field guide</span><h1 className="h1">Learn</h1><p className="lede">Understand every building block. Shape the traffic. Explain what the results mean.</p></div><span className="learn-total">{TOPICS.length} lessons · 12 components</span></div>
  <p className="hint">Eight interactive model demos, practical guides and two-question checks. Lessons run in your browser; learning marks stay on this device.</p>
  <div className="learn-paths" aria-label="Suggested learning paths"><Link href="/learn/clients"><span>01 · Start here</span><strong>Meet the components →</strong></Link><Link href="/learn/canvas-graph"><span>02 · Build something</span><strong>From canvas to a test →</strong></Link><Link href="/learn/utilization"><span>03 · Read the result</span><strong>Find the constraint →</strong></Link></div>
  <div className="learn-discovery"><label htmlFor="learn-search">Find a lesson<input id="learn-search" type="search" className="input" placeholder="Search components, properties or concepts" value={search} onChange={e => setSearch(e.target.value)} /></label><p className="hint" data-testid="learn-tally">{progress.opened.length} of {TOPICS.length} opened · {progress.passed.length} passed</p></div>
  <div className="learn-categories" role="group" aria-label="Lesson category"><button className="chip" aria-pressed={category === "all"} onClick={() => setCategory("all")}>All lessons <span>{TOPICS.length}</span></button>{LEARN_CATEGORIES.map(c => <button key={c.id} className="chip" aria-pressed={category === c.id} onClick={() => setCategory(c.id)} title={c.hint}>{c.title} <span>{TOPICS.filter(t => t.category === c.id).length}</span></button>)}</div>
  <p className="hint" role="status">{topics.length} {topics.length === 1 ? "lesson" : "lessons"}{category !== "all" || needle ? " match your filters" : " to explore"}</p>
  {topics.length ? <ul className="lrn-cards learn-library-grid" aria-label="Concepts">{topics.map(t => {
   const mark = markOf(progress,t.id);
   return <li key={t.id} className="learn-library-card" data-testid="learn-card" data-mark={mark}>
    <div className="learn-card-head"><LessonIcon topic={t}/><span className="eyebrow">{LEARN_CATEGORIES.find(c => c.id === t.category)?.title}</span></div>
    <h2 className="h3"><Link href={`/learn/${t.id}`}>{t.title}</Link></h2><p className="learn-card-summary">{t.summary}</p>
    <div className="learn-card-footer"><span className={"learn-status is-"+mark} data-testid="learn-mark">{MARK_LABEL[mark]}</span><span>{interactive.has(t.id) ? "Interactive demo + check" : "Guide + check"}</span></div>
   </li>;
  })}</ul> : <div className="panel stack r2-pad" data-testid="learn-empty"><h2 className="h3">No lessons match</h2><p>Try another component name or clear your filters.</p><button className="btn" onClick={() => { setSearch("");setCategory("all"); }}>Clear filters</button></div>}
  <section className="stack" aria-label="Your progress"><p className="hint">Your marks are kept on this device only, separately for each account and for guests.</p><div className="row"><button className="btn" data-testid="learn-clear" onClick={() => { clear();setCleared(true); }}>Clear my learning progress</button></div>{cleared && <p className="hint" role="status" data-testid="learn-cleared">Cleared. Your marks on this device are gone.</p>}</section>
 </div>;
}
