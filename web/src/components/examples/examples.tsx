"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { GraphThumbnail } from "@/components/creation/shared";
import { GalleryPreview } from "@/components/gallery/gallery-preview";
import { Icon } from "@/components/ui/icon";
import { Crumbs } from "@/components/shell/crumbs";
import {
  BEHAVIOR_WORD,
  CATALOG,
  SETTING_LABEL,
  TEMPLATES,
  breakingPointText,
  byCategory,
  capacityText,
  curveText,
  defaultsText,
  filterByTags,
  goalText,
  n0,
  nearestCurveIndex,
  ownResultText,
  presetText,
  startPath,
  tagsInUse,
  tagsOf,
  type ExampleTemplate,
} from "@/lib/examples";
import { resolveRoute } from "@/lib/routes";
import { authLink } from "@/lib/safe-next";

type ThumbGraph = Parameters<typeof GraphThumbnail>[0]["graph"];
const thumb = (t: ExampleTemplate) => t.graph as unknown as ThumbGraph;

function componentList(t: ExampleTemplate) {
  const counts = new Map<string, number>();
  for (const n of t.graph.nodes) counts.set(n.label, (counts.get(n.label) ?? 0) + 1);
  return [...counts.entries()].map(([label, n]) => (n > 1 ? `${label} ×${n}` : label)).join(", ");
}

/** A guest is sent to sign up and brought back to this template; a signed-in person goes straight to it. */
function MakeCopy({ id, name }: { id: string; name: string }) {
  const { status } = useAuth();
  const authed = status === "authed";
  return (
    <Link className="btn btn-primary" href={authed ? startPath(id) : authLink("/register", startPath(id))} data-testid="make-copy">
      {authed ? `Start from ${name}` : `Make your own copy of ${name}`}
    </Link>
  );
}

function Explorer({ t }: { t: ExampleTemplate }) {
  const id = useId();
  const [index, setIndex] = useState(() => nearestCurveIndex(t));
  const curve = t.limits.curve;
  const point = curve[index];
  return (
    <div className="stack examples-explorer" data-testid="explorer">
      <h3 className="h3"><Icon n="wave" s={16} /> Load explorer</h3>
      <div className="lrn-field">
        <label htmlFor={id}>Load</label>
        <input id={id} type="range" min={0} max={curve.length - 1} step={1} value={index} aria-valuetext={`${n0(point.rps)} requests a second`} className="examples-range" onChange={(e) => setIndex(Number(e.target.value))} />
        <output htmlFor={id} className="lrn-value">
          {n0(point.rps)} requests a second
        </output>
      </div>
      <p role="status" className="lrn-summary" data-testid="explorer-summary">
        {curveText(t, index)}
      </p>
      <p className="hint">These are {curve.length} load levels the model worked out in advance for this design. Nothing is calculated as you move the slider.</p>
    </div>
  );
}

function ExamplePanel({ t }: { t: ExampleTemplate }) {
  const verdict = t.result.verdict;
  return (
    <article className="panel stack r2-pad examples-card" id={t.id} aria-labelledby={`h-${t.id}`} data-testid="example-panel" data-verdict={verdict}>
      <div className="row between examples-card-heading" style={{ flexWrap: "wrap" }}>
        <h2 className="h2" id={`h-${t.id}`}>
          {t.name}
        </h2>
        <span className={"pill " + (verdict === "pass" ? "ok" : verdict === "strained" ? "warn" : "fail")} data-testid="verdict">
          <span className="dot" aria-hidden="true" /> {verdict === "pass" ? "Meets its goal" : verdict === "strained" ? "Meets its goal, close to the edge" : "Misses its goal"}
        </span>
      </div>
      <div className="examples-diagram paper" tabIndex={0} role="region" aria-label={`${t.name} diagram, scroll to inspect`}><GalleryPreview graph={thumb(t)} title={t.name} context="saved" /></div>
      <p className="examples-diagram-hint">Scroll the diagram to inspect its components.</p>
      <p className="examples-description">{t.blurb}</p>
      <p className="small muted" data-testid="components-list">
        Components: {componentList(t)}.
      </p>
      <section className="stack examples-result" aria-label="Result at its own traffic">
        <h3 className="h3">At the traffic it ships with</h3>
        <p data-testid="own-result">{ownResultText(t)}</p>
      </section>
      <section className="stack examples-breaking" aria-label="Breaking point">
        <h3 className="h3">Breaking point</h3>
        <p data-testid="breaking-point">{breakingPointText(t)}</p>
        <p className="hint">Goal: {goalText(t.traffic)}. Model estimate, not a measurement.</p>
      </section>
      <Explorer t={t} />
      <div className="row examples-card-footer">
        <MakeCopy id={t.id} name={t.name} />
      </div>
    </article>
  );
}

export function ExamplesPage() {
  const resolved = resolveRoute("/examples");
  return (
    <div className="page stack lg examples-page" data-testid="examples-page">
      <Crumbs resolved={resolved} />
      <header className="stack examples-header">
        <span className="examples-eyebrow">THE ARCHITECTURE PLAYBOOK</span>
        <h1 className="h1">Examples</h1>
        <p className="lede">Six ready-made designs and what the model says about each: how it does at the traffic it ships with, and where it breaks. You do not need an account to look.</p>
        <nav className="examples-jump" aria-label="Jump to an example">
          <ul className="row" style={{ flexWrap: "wrap", gap: 8, listStyle: "none", padding: 0 }}>
            {TEMPLATES.map((t) => (
              <li key={t.id}>
                <a className="chip" href={`#${t.id}`}>
                  {t.name}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      {TEMPLATES.map((t) => (
        <ExamplePanel key={t.id} t={t} />
      ))}
      <p className="hint">
        All results are model estimates, worked out in advance by the same model the app uses when you run a design. Nothing here was measured on real servers. <Link href="/how-it-works">How the model works</Link>
      </p>
    </div>
  );
}

export function TemplatesPage() {
  const resolved = resolveRoute("/templates");
  const [selected, setSelected] = useState<string[]>([]);
  const tags = tagsInUse();
  const shown = filterByTags(TEMPLATES, selected);
  const toggle = (id: string) => setSelected(cur => cur.includes(id) ? cur.filter(value => value !== id) : [...cur, id]);
  const filterIcons: Record<string, string> = { cache: "sparkle", queue: "layers", cdn: "globe", replicas: "copy", storage: "file", external: "link" };
  return (
    <div className="page stack lg templates-library" data-testid="templates-page">
      <Crumbs resolved={resolved} />
      <header className="templates-header"><span className="templates-eyebrow">A HEAD START FOR YOUR NEXT IDEA</span><h1 className="h1">Templates</h1><p className="lede">Working starting points with traffic tested against their targets. Pick a design, run it, then experiment; everything stays editable.</p></header>
      <fieldset className="templates-filters" data-testid="tag-filter" aria-describedby="template-filter-help">
        <legend className="h3">Show templates that</legend>
        <div className="templates-filter-options">{tags.map(tag => <label key={tag.id} className="template-filter-chip" data-selected={selected.includes(tag.id)}>
          <input type="checkbox" checked={selected.includes(tag.id)} onChange={() => toggle(tag.id)} />
          <Icon n={filterIcons[tag.id] ?? "layers"} s={16}/><span>{tag.label}</span><span className="template-filter-check" aria-hidden="true"><Icon n="tick" s={13}/></span>
        </label>)}</div>
        <div className="templates-filter-help"><p id="template-filter-help">Match all selected features. Choose more than one to narrow the library.</p><button className="btn btn-sm" type="button" disabled={!selected.length} onClick={() => setSelected([])}>Reset filters</button></div>
      </fieldset>
      <div className="templates-list-heading"><p className="hint" role="status" aria-live="polite" data-testid="template-count">Showing {shown.length} of {TEMPLATES.length} templates</p><span>{selected.length ? selected.length + " selected" : "All architectures"}</span></div>
      {shown.length === 0 && <div className="templates-empty"><Icon n="search" s={26}/><p>No template has all of those. Clear a choice to see more.</p><button className="btn" type="button" onClick={() => setSelected([])}>Clear filters</button></div>}
      <ul className="templates-grid" aria-label="Templates">
        {shown.map(t => <li key={t.id} className="template-library-card" data-testid="template-card" data-id={t.id} data-verdict={t.result.verdict}>
          <div className="template-card-preview paper"><GalleryPreview graph={thumb(t)} title={t.name} context="saved" /></div>
          <div className="template-card-body">
            <div className="template-card-title"><h2 className="h3">{t.name}</h2></div>
            <p className="template-card-description" title={t.blurb}>{t.blurb}</p>
            <p className="template-card-meta">{t.graph.nodes.length} components · {t.graph.edges.length} connections</p>
            <ul className="template-card-tags" aria-label="What is in it">{tagsOf(t.graph).map(tag => <li key={tag.id} data-testid="tag"><Icon n={filterIcons[tag.id] ?? "layers"} s={12}/>{tag.label}</li>)}</ul>
            <details className="template-model-details"><summary><span>{t.limits.passingRps === null ? "Explore model details" : "Breaking point ≈ " + n0(t.limits.passingRps) + " rps"}</span><Icon n="chevD" s={14}/></summary><p className="small" data-testid="template-breaking">{breakingPointText(t)}</p><p className="hint">Goal: {goalText(t.traffic)}. Model estimate, not a measurement.</p></details>
          </div>
          <div className="template-card-actions"><Link className="btn btn-primary" href={startPath(t.id)} data-testid="start-template">Start from this template</Link><Link className="btn btn-ghost" href={"/examples#" + t.id}>See how it behaves <Icon n="arrowR" s={14}/></Link></div>
        </li>)}
      </ul>
      <p className="templates-model-note"><Icon n="info" s={15}/> Template results are saved model estimates at their supplied traffic. Open the model details to check the targets and limits.</p>
    </div>
  );
}

export function ComponentsPage() {
  const resolved = resolveRoute("/components");
  return (
    <div className="page stack lg" data-testid="components-page">
      <Crumbs resolved={resolved} />
      <div className="stack">
        <h1 className="h1">Components</h1>
        <p className="lede">The twelve building blocks a design is made of, what each one models, and what happens when traffic is more than it can take. Figures are the model&apos;s defaults; every design can change them.</p>
      </div>
      {byCategory().map(([category, list]) => (
        <section key={category} className="stack" aria-labelledby={`cat-${category}`} data-testid="category">
          <h2 className="h2" id={`cat-${category}`}>
            {category}
          </h2>
          <ul className="lrn-cards" aria-label={category}>
            {list.map((c) => (
              <li key={c.type} className="panel stack r2-pad" data-testid="component-card" data-type={c.type}>
                <h3 className="h3">{c.label}</h3>
                <p>{c.blurb}</p>
                <dl className="lrn-readouts">
                  <div>
                    <dt className="muted">Can handle</dt>
                    <dd>{capacityText(c)}</dd>
                  </div>
                  <div>
                    <dt className="muted">Takes</dt>
                    <dd>{c.latency === 0 ? "no time of its own" : `${c.latency} ms per request`}</dd>
                  </div>
                  <div>
                    <dt className="muted">When overloaded</dt>
                    <dd data-testid="overload">It {BEHAVIOR_WORD[c.behavior]}.</dd>
                  </div>
                  <div>
                    <dt className="muted">Starts with</dt>
                    <dd>{defaultsText(c)}</dd>
                  </div>
                  <div>
                    <dt className="muted">You can change</dt>
                    <dd>{c.editableProperties.map((p) => SETTING_LABEL[p] ?? p).join(", ")}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <section className="stack" aria-labelledby="presets">
        <h2 className="h2" id="presets">
          Traffic presets
        </h2>
        <p className="hint">Ready-made traffic you can pick for a design. They describe load, not products.</p>
        <ul className="stack" aria-label="Traffic presets" style={{ listStyle: "none", padding: 0 }}>
          {CATALOG.presets.map((p) => (
            <li key={p.id} className="panel stack r2-pad" data-testid="preset-row">
              <h3 className="h3">{p.name}</h3>
              <p>{p.note}</p>
              <p className="small muted">{presetText(p)}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
