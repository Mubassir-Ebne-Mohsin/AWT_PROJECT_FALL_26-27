"use client";
import Link from "next/link";
import { useState } from "react";
import { GalleryPreview } from "@/components/gallery/gallery-preview";
import { LEARN_TOPICS } from "@/lib/catalog";
import type { components } from "@/lib/api/phase3-schema";
type Challenge = components["schemas"]["PublicChallenge"];
export function ChallengeBrief({ challenge: c }: { challenge: Challenge }) {
  const [hints, setHints] = useState(0),
    t = c.traffic,
    learning = c.learning;
  const nodeLabel = (id: string) =>
    c.preview?.nodes.find((n) => n.id === id)?.label ?? id;
  return (
    <div className="challenge-brief">
      <section className="panel stack r2-pad">
        <h2 className="h3">Your mission</h2>
        <p>{c.summary}</p>
        {learning && (
          <>
            <p>{learning.brief}</p>
            <p className="hint">
              {learning.category} · {learning.difficulty} · about{" "}
              {learning.estimatedMinutes} minutes (editorial estimate)
            </p>
          </>
        )}
        <div className="challenge-targets">
          <span>p95 ≤ {c.goal.p95Ms} ms</span>
          <span>errors ≤ {(c.goal.errorRate * 100).toFixed(2)}%</span>
        </div>
        {t && (
          <dl className="challenge-traffic-grid">
            <div>
              <dt>Baseline traffic</dt>
              <dd>{t.rps.toLocaleString()} rps total</dd>
            </div>
            <div>
              <dt>Burst</dt>
              <dd>×{t.burst}</dd>
            </div>
            <div>
              <dt>Reads / writes</dt>
              <dd>
                {Math.round(t.readRatio * 100)}% /{" "}
                {Math.round((1 - t.readRatio) * 100)}%
              </dd>
            </div>
            <div>
              <dt>Shape</dt>
              <dd>
                {t.shape === "spike"
                  ? "Two sharp spikes"
                  : t.shape === "ramp"
                    ? "Climbs all day"
                    : "Steady with one burst"}
              </dd>
            </div>
            <div>
              <dt>Modeled duration</dt>
              <dd>{t.durationMin} minutes</dd>
            </div>
          </dl>
        )}
        <h3 className="h3">Allowed changes</h3>
        {c.rules ? (
          <>
            <p className="hint">
              Fixed workload, original components and per-instance properties.
              Positions and labels are cosmetic. Server checks these rules
              before consuming a graded submission.
            </p>
            <ul>
              {c.rules.editable.map((e) => (
                <li key={e.nodeId + e.property}>
                  {nodeLabel(e.nodeId)}:{" "}
                  {e.property === "replicas"
                    ? `${e.min}–${e.max} replicas`
                    : `region: ${e.choices.join(", ")}`}
                </li>
              ))}
              {c.rules.additions.map((a) => (
                <li key={a.type}>
                  Add up to {a.maxNodes} {a.type} component
                  {a.maxNodes > 1 ? "s" : ""} with default service properties
                  {a.maxHitRatio !== undefined
                    ? `; hit ratio ≤ ${Math.round(a.maxHitRatio * 100)}%`
                    : ""}
                  .
                </li>
              ))}
            </ul>
            <p className="hint">
              Keep original paths; insert CDNs before the original entry tier,
              connect caches after the app and replicas from the primary. Do not
              bypass or disconnect required components.
            </p>
          </>
        ) : (
          <p>
            Improve the architecture within the supported model. This challenge
            uses the original p95/error-only grading.
          </p>
        )}
        <p className="hint">
          Twenty graded submissions. Save before submitting; submission uses the
          frozen challenge traffic even if you changed your design’s traffic.
        </p>
      </section>
      <aside className="stack">
        <section className="panel r2-pad">
          <h2 className="h3">Starting architecture</h2>
          <div className="challenge-detail-preview">
            <GalleryPreview
              graph={c.preview}
              title={`${c.title} — starting design`}
              context="saved"
            />
          </div>
          <p className="hint">
            Frozen starting snapshot, not a reference solution.
          </p>
          {c.baseline && (
            <p className="hint">
              Starter{" "}
              {c.baseline.passes ? "already meets" : "does not yet meet"} the
              request targets · p95 {c.baseline.p95.toFixed(2)} ms ·{" "}
              {(c.baseline.errorRate * 100).toFixed(2)}% errors
            </p>
          )}
        </section>
        {learning && (
          <>
            <section className="panel stack r2-pad">
              <h2 className="h3">Before you start</h2>
              {learning.topics
                .filter((id) => Object.hasOwn(LEARN_TOPICS, id))
                .map((id) => (
                  <Link key={id} href={`/learn/${id}`}>
                    {LEARN_TOPICS[id]} →
                  </Link>
                ))}
            </section>
            <section className="panel stack r2-pad">
              <h2 className="h3">A nudge, not the answer</h2>
              <p className="hint">Hints have no hidden score penalty.</p>
              {learning.hints.slice(0, hints).map((h, i) => (
                <p key={i}>
                  <strong>Hint {i + 1}.</strong> {h}
                </p>
              ))}
              {hints < 3 ? (
                <button className="btn" onClick={() => setHints((n) => n + 1)}>
                  Reveal hint {hints + 1}
                </button>
              ) : (
                <p className="hint">All three hints are open.</p>
              )}
            </section>
          </>
        )}
      </aside>
    </div>
  );
}
