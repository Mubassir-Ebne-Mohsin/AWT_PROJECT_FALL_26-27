"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ReactNode } from "react";
import { Crumbs } from "@/components/shell/crumbs";
import { useCreation } from "@/components/creation/creation-provider";
import { useActiveView } from "@/lib/use-active-view";
import { resolveRoute } from "@/lib/routes";
import type { CreationDraft, Prepared } from "@/lib/creation-session";
import type { Graph } from "@/lib/api/designs";
export function useCreationFlow(key: string) {
  const [session, state] = useCreation(key),
    active = useActiveView();
  const router = useRouter(),
    queries = useQueryClient();
  async function create(draft: CreationDraft) {
    if (!active()) return;
    const design = await session.create(draft);
    if (!design || !active()) return;
    await queries.invalidateQueries({ queryKey: ["dashboard"] });
    if (active()) router.push("/designs/" + design.id + "/edit");
  }
  return { session, state, create };
}
export function CreationPage({
  path,
  title,
  intro,
  children,
}: {
  path: string;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <div className="page stack lg">
      <Crumbs resolved={resolveRoute(path)} />
      <div className="page-head">
        <div className="stack">
          <span className="eyebrow">New design</span>
          <h1 className="h1">{title}</h1>
          <p className="lede">{intro}</p>
        </div>
      </div>
      {children}
      <p className="hint">
        Unsaved form inputs stay in memory during temporary errors. Refreshing
        this page clears them.
      </p>
    </div>
  );
}
export function CreationFeedback({
  flow,
}: {
  flow: ReturnType<typeof useCreationFlow>;
}) {
  const { session, state } = flow;
  return (
    <>
      {state.pending && <p role="status">Working…</p>}
      {state.error && (
        <div className="note fail" role="alert">
          <p>{state.error}</p>
          {state.uncertain && (
            <div className="row">
              <Link className="btn" href="/dashboard">
                Check dashboard
              </Link>
              <button
                className="btn"
                onClick={() => {
                  if (
                    window.confirm(
                      "A copy may already exist. Start another creation deliberately?",
                    )
                  )
                    session.clearForNewIntent();
                }}
              >
                Start another creation deliberately
              </button>
            </div>
          )}
        </div>
      )}
      {state.created && (
        <div className="note ok">
          <p>Created “{state.created.name}”.</p>
          <Link className="btn" href={"/designs/" + state.created.id + "/edit"}>
            Open created design
          </Link>
          <button
            className="btn btn-ghost"
            onClick={() => session.clearForNewIntent()}
          >
            Create another design
          </button>
        </div>
      )}
    </>
  );
}
export function GraphThumbnail({ graph }: { graph: Graph }) {
  const x = Math.min(0, ...graph.nodes.map((n) => n.x)) - 20,
    y = Math.min(0, ...graph.nodes.map((n) => n.y)) - 20;
  const w = Math.max(360, ...graph.nodes.map((n) => n.x + 204)) - x,
    h = Math.max(170, ...graph.nodes.map((n) => n.y + 84)) - y;
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  return (
    <div className="m4-thumb paper">
      <svg
        role="img"
        aria-label={
          graph.nodes.length ? "Design preview" : "Empty design preview"
        }
        viewBox={[x, y, w, h].join(" ")}
      >
        {graph.edges.map((e) => {
          const a = nodes.get(e.from),
            b = nodes.get(e.to);
          return a && b ? (
            <path
              key={e.id}
              d={`M${a.x + 184} ${a.y + 32} L${b.x} ${b.y + 32}`}
              stroke="var(--ink-3)"
              strokeWidth="2"
            />
          ) : null;
        })}
        {graph.nodes.map((n) => (
          <g key={n.id}>
            <rect
              x={n.x}
              y={n.y}
              width="184"
              height="64"
              rx="9"
              fill="var(--surface)"
              stroke="var(--accent)"
              strokeWidth="2"
            />
            <text x={n.x + 12} y={n.y + 27} fill="var(--ink)" fontSize="14">
              {n.label.slice(0, 23)}
            </text>
            <text x={n.x + 12} y={n.y + 47} fill="var(--ink-3)" fontSize="11">
              {n.type}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
export function PreparedPreview({ prepared }: { prepared: Prepared }) {
  const d = prepared.design;
  return (
    <div className="stack">
      <GraphThumbnail graph={d.graph} />
      <dl className="kv">
        <dt>Components</dt>
        <dd>{d.graph.nodes.length}</dd>
        <dt>Traffic</dt>
        <dd>
          {d.traffic.rps.toLocaleString()} rps ×{d.traffic.burst}
        </dd>
        <dt>Reads</dt>
        <dd>{Math.round(d.traffic.readRatio * 100)}%</dd>
        <dt>p95 target</dt>
        <dd>{d.traffic.sloP95} ms</dd>
      </dl>
      {prepared.assumptions.length > 0 && (
        <section>
          <h2 className="h3">Assumptions to review</h2>
          <ul>
            {prepared.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </section>
      )}
      <p className="hint">
        No test has run. Save this design, then run the backend model to see
        predictions.
      </p>
    </div>
  );
}
