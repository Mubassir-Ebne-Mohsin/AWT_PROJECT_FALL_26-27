"use client";

import Link from "next/link";
import { SimilarDesigns } from "@/components/gallery/similar-designs";
import { LoadLadder } from "@/components/workspace/load-ladder";
import { SuggestedFixes } from "@/components/workspace/suggested-fixes";
import { WhatIfPanel } from "@/components/workspace/what-if";
import type { DesignRun, Graph } from "@/lib/api/designs";
import { numberText, percent } from "@/lib/result-presentation";

const VERDICT: Record<string, { text: string; tone: string }> = {
  pass: { text: "Passes", tone: "ok" },
  strained: { text: "Strained", tone: "warn" },
  fail: { text: "Fails", tone: "fail" },
};

interface Props {
  designId: string;
  savedRevision: number;
  run: DesignRun | null | undefined;
  stale: boolean;
  dirty: boolean;
  componentTypes: readonly string[];
  onApplyFix: (graph: Graph, id: string) => void;
}

/**
 * One place for the fix loop: what is limiting the design, engine-checked fixes, how far it can go, what if the traffic changes,
 * and how others solved the same limit. Every figure comes from the saved run; nothing here is recalculated in the browser.
 */
export function ImproveTab({ designId, savedRevision, run, stale, dirty, componentTypes, onApplyFix }: Props) {
  if (!run || run.status !== "completed" || run.result.kind !== "simulation") {
    return (
      <section className="panel stack" style={{ padding: 16 }} data-testid="improve-empty">
        <h2 className="h3">Improve this design</h2>
        <p>Run a test first. The Improve tab works from a completed result: it shows what limits the design and tries ordinary fixes at that component.</p>
        <p className="hint">Use Run test at the top of the page, then come back here.</p>
      </section>
    );
  }
  const s = run.result.summary;
  const limiting = s.nodes.find((n) => n.id === s.bottleneckId) ?? null;
  const verdict = VERDICT[s.verdict] ?? { text: s.verdict, tone: "" };
  return (
    <>
      <section className="panel stack" style={{ padding: 16 }} aria-label="What limits this design" data-testid="improve-header">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <h2 className="h3">What limits this design</h2>
          <span className={"tag " + verdict.tone}>{verdict.text}</span>
        </div>
        {limiting ? (
          <p>
            <strong>{limiting.label}</strong> is the most loaded component, at {percent(limiting.rho)} utilization. Fixes below are tried at that component first.
          </p>
        ) : (
          <p>No component is close to its limit in this run.</p>
        )}
        <p className="small muted">
          p95 {numberText(s.p95)} ms against a target of {numberText(s.traffic.sloP95)} ms · errors {percent(s.errorRate)} against a budget of {percent(s.traffic.errorBudget)}. Model estimates from revision{" "}
          {run.designRevision}
          {stale ? ", which is older than the saved design." : "."}
        </p>
        <div className="row tight">
          <Link className="btn btn-sm" href={`/designs/${designId}/results?run=${run.id}`}>
            Open the full result
          </Link>
          <Link className="btn btn-sm" href={`/designs/${designId}/history`} data-testid="improve-compare-link">
            Compare with an earlier version
          </Link>
        </div>
      </section>
      <SuggestedFixes
        key={run.id + ":" + savedRevision}
        designId={designId}
        savedRevision={savedRevision}
        runId={run.id}
        runRevision={run.designRevision}
        verdict={s.verdict}
        stale={stale}
        dirty={dirty}
        onApply={(fix) => onApplyFix(fix.graph as unknown as Graph, "fix:" + fix.id)}
      />
      <LoadLadder key={"ladder:" + run.id + ":" + savedRevision} designId={designId} savedRevision={savedRevision} runId={run.id} runRevision={run.designRevision} stale={stale} />
      <WhatIfPanel key={"whatif:" + run.id + ":" + savedRevision} designId={designId} savedRevision={savedRevision} runId={run.id} runRevision={run.designRevision} stale={stale} />
      {limiting && <SimilarDesigns bottleneckType={limiting.type} bottleneckLabel={limiting.label} componentTypes={componentTypes} />}
    </>
  );
}
