import Link from "next/link";
import { ComponentGlyph } from "@/components/canvas/component-glyph";
import { numericRules } from "@/lib/canvas/model";
import { TOPICS, type Topic } from "@/lib/learn-content";
import type { ComponentType } from "@/lib/learn-types";
const types: Record<string, ComponentType> = { Clients:"client", App:"app", "App server":"app", "Load balancer":"lb", "API gateway":"gateway", Cache:"cache", Database:"db", "Read replica":"replica", Queue:"queue", Worker:"worker", CDN:"cdn", "Object storage":"storage", "Third-party API":"external" };
function editorRange(key: string, component: Topic["component"]) {
 const traffic: Record<string,string> = { rps: "Number field: 0–10,000,000 rps; slider: 10–50,000 rps", burst: "Number field: 1–100×; slider: 1–4×", readRatio: "0–100% reads (stored as a fraction)", sloP95: "1–60,000 ms", errorBudget: "Editor offers 0.1%, 0.5%, 1%, 2%, 5% plus the current value", durationMin: "Editor offers 5, 10, 30 and 60 modeled minutes plus the current imported value", shape: "Steady with one burst / Two sharp spikes / Climbs all day" };
 if (Object.hasOwn(traffic,key)) return traffic[key];
 if (key === "region") return "US East / EU West / Asia South";
 if (!Object.hasOwn(numericRules,key)) return "See the relevant editor control";
 const rule = numericRules[key as keyof typeof numericRules];
 return `${key === "share" ? 0 : rule.min}–${key === "share" && component === "client" ? 1000000 : rule.max} ${key === "share" && component === "client" ? "relative weight" : rule.unit}`;
}
export function LessonGuide({ topic }: { topic: Topic }) {
 return <div className="stack lg" data-testid="lesson-guide">
  {topic.diagram?.length ? <section className="learn-example"><h2 className="h2">Example architecture</h2><p className="hint">Conceptual illustration. Connect the paths appropriate to your scenario; this is not a calculated result.</p><ol className="learn-mini-diagram" aria-label="Example component sequence">{topic.diagram.map((label,i) => <li key={i}>{types[label] && <ComponentGlyph type={types[label]} size={20}/>}<span>{label}</span>{i < topic.diagram!.length-1 && <span className="learn-diagram-arrow" aria-hidden="true">→</span>}</li>)}</ol>{topic.example && <p>{topic.example}</p>}</section> : null}
  {topic.properties?.length ? <section className="stack"><h2 className="h2">{topic.category === "traffic" ? "Traffic controls" : "Component properties"}</h2><div className="learn-table-wrap"><table className="learn-properties"><caption>Editor controls: meaning, range and effect</caption><thead><tr><th scope="col">Property</th><th scope="col">Meaning / editor range</th><th scope="col">When you change it</th></tr></thead><tbody>{topic.properties.map(p => <tr key={p.key}><th scope="row">{p.key === "share" && topic.component === "client" ? "Traffic weight" : p.key}</th><td>{p.meaning}<small>{editorRange(p.key,topic.component)}</small></td><td>{p.change}</td></tr>)}</tbody></table></div><p className="hint">These are editor ranges, not measured operating limits. Only controls relevant to this lesson are shown.</p></section> : null}
  {topic.practice?.length ? <section className="learn-example"><h2 className="h2">Try it yourself</h2><ol>{topic.practice.map(step => <li key={step}>{step}</li>)}</ol><p className="hint">Practical exercise, not a precomputed pass/fail promise. Inspect the actual result of your saved scenario.</p></section> : null}
  {topic.tradeoff && <section className="learn-boundary"><h2 className="h3">Tradeoffs and model boundary</h2><p>{topic.tradeoff}</p></section>}
  {topic.links?.length ? <nav className="row" aria-label="Relevant screens">{topic.links.map(l => <Link key={l.href} href={l.href}>{l.label} →</Link>)}</nav> : null}
 </div>;
}
export function RelatedLessons({ topic }: { topic: Topic }) {
 const related = topic.related?.map(id => TOPICS.find(t => t.id === id)).filter((t): t is Topic => !!t) ?? [];
 return related.length ? <section className="stack"><h2 className="h2">Keep exploring</h2><ul className="learn-related">{related.map(t => <li key={t.id}><Link href={`/learn/${t.id}`}>{t.title} →</Link><p className="hint">{t.summary}</p></li>)}</ul></section> : null;
}
