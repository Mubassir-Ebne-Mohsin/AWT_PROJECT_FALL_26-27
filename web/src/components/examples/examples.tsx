"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { GraphThumbnail } from "@/components/creation/shared";
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
    <div className="stack" data-testid="explorer">
      <h3 className="h3">Load explorer</h3>
      <div className="lrn-field">
        <label htmlFor={id}>Load</label>
        <input id={id} type="range" min={0} max={curve.length - 1} step={1} value={index} aria-valuetext={`${n0(point.rps)} requests a second`} onChange={(e) => setIndex(Number(e.target.value))} />
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
    <article className="panel stack r2-pad" id={t.id} aria-labelledby={`h-${t.id}`} data-testid="example-panel" data-verdict={verdict}>
      <div className="row between" style={{ flexWrap: "wrap" }}>
        <h2 className="h2" id={`h-${t.id}`}>
          {t.name}
        </h2>
        <span className={"pill " + (verdict === "pass" ? "ok" : verdict === "strained" ? "warn" : "fail")} data-testid="verdict">
          <span className="dot" aria-hidden="true" /> {verdict === "pass" ? "Meets its goal" : verdict === "strained" ? "Meets its goal, close to the edge" : "Misses its goal"}
        </span>
      </div>
      <GraphThumbnail graph={thumb(t)} />
      <p>{t.blurb}</p>
      <p className="small muted" data-testid="components-list">
        Components: {componentList(t)}.
      </p>
      <section className="stack" aria-label="Result at its own traffic">
        <h3 className="h3">At the traffic it ships with</h3>
        <p data-testid="own-result">{ownResultText(t)}</p>
      </section>
      <section className="stack" aria-label="Breaking point">
        <h3 className="h3">Breaking point</h3>
        <p data-testid="breaking-point">{breakingPointText(t)}</p>
        <p className="hint">Goal: {goalText(t.traffic)}. Model estimate, not a measurement.</p>
      </section>
      <Explorer t={t} />
      <div className="row">
        <MakeCopy id={t.id} name={t.name} />
      </div>
    </article>
  );
}

export function ExamplesPage() {
  const resolved = resolveRoute("/examples");
  return (
    <div className="page narrow stack lg" data-testid="examples-page">
      <Crumbs resolved={resolved} />
      <div className="stack">
        <h1 className="h1">Examples</h1>
        <p className="lede">Six ready-made designs and what the model says about each: how it does at the traffic it ships with, and where it breaks. You do not need an account to look.</p>
        <nav aria-label="Jump to an example">
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
      </div>
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
  const toggle = (id: string) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  return (
    <div className="page stack lg" data-testid="templates-page">
      <Crumbs resolved={resolved} />
      <div className="stack">
        <h1 className="h1">Templates</h1>
        <p className="lede">Complete designs with traffic to match. Pick one to start from; everything stays editable.</p>
      </div>
      <fieldset className="stack" data-testid="tag-filter" style={{ border: 0, padding: 0 }}>
        <legend className="h3">Show templates that</legend>
        <div className="row" style={{ flexWrap: "wrap", gap: 12 }}>
          {tags.map((t) => (
            <label key={t.id} className="row tight">
              <input type="checkbox" checked={selected.includes(t.id)} onChange={() => toggle(t.id)} /> {t.label}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="hint" role="status" data-testid="template-count">
        Showing {shown.length} of {TEMPLATES.length} templates
      </p>
      {shown.length === 0 && <p>No template has all of those. Clear a choice to see more.</p>}
      <ul className="lrn-cards" aria-label="Templates">
        {shown.map((t) => (
          <li key={t.id} className="panel stack r2-pad" data-testid="template-card" data-id={t.id}>
            <GraphThumbnail graph={thumb(t)} />
            <h2 className="h3">{t.name}</h2>
            <p>{t.blurb}</p>
            <ul className="row" style={{ flexWrap: "wrap", gap: 6, listStyle: "none", padding: 0 }} aria-label="What is in it">
              {tagsOf(t.graph).map((g) => (
                <li key={g.id} className="pill outline" data-testid="tag">
                  {g.label}
                </li>
              ))}
            </ul>
            <p className="small" data-testid="template-breaking">
              {breakingPointText(t)}
            </p>
            <div className="row">
              <Link className="btn btn-primary" href={startPath(t.id)} data-testid="start-template">
                Start from this template
              </Link>
              <Link className="btn btn-ghost" href={`/examples#${t.id}`}>
                See how it behaves
              </Link>
            </div>
          </li>
        ))}
      </ul>
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
