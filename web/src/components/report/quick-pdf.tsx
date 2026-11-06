"use client";

import Link from "next/link";
import { useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchReport } from "@/lib/api/report";
import { useReportPdf } from "@/lib/use-report-pdf";

interface Props {
  userId: string;
  designId: string;
  revision: number;
  run?: string;
  refreshKey?: string;
  dirty?: boolean;
  placement: "header" | "results";
}
export function QuickPdf({ userId, designId, revision, run, refreshKey, dirty, placement }: Props) {
  const labelId = useId();
  // Only the existing report endpoint is used. Results already knows its completed run.
  const saved = useQuery({
    queryKey: ["quick-pdf-ready", userId, designId, revision, refreshKey],
    queryFn: ({ signal }) => fetchReport(designId, { revision }, signal),
    enabled: placement === "header",
    retry: false,
    refetchOnMount: "always",
  });
  const pdf = useReportPdf({ userId, designId, revision, run, requireSimulation: true });
  const noRun = placement === "header" && !saved.isPending && !saved.isError && (!saved.data?.run || saved.data.run.kind !== "simulation" || saved.data.run.status !== "completed");
  const unavailable = placement === "header" && (saved.isPending || saved.isError || noRun);
  const query = new URLSearchParams({ revision: String(revision) });
  if (run) query.set("run", run);
  const fallback = `/designs/${designId}/report?${query}`;
  return (
    <div className="stack" style={{ gap: 4, maxWidth: "100%" }} data-testid={`quick-pdf-${placement}`}>
      <div className="row tight">
        <button className="btn btn-sm" type="button" disabled={pdf.busy || unavailable} onClick={() => void pdf.download()} aria-describedby={labelId} data-testid={`quick-pdf-download-${placement}`}>
          {pdf.busy ? "Making the PDF…" : "Download PDF"}
        </button>
        <label className="row tight small">
          <input type="checkbox" checked={pdf.includeNotes} disabled={pdf.busy} onChange={(event) => pdf.setIncludeNotes(event.target.checked)} data-testid={`quick-pdf-notes-${placement}`} />
          Include decisions and assumptions
        </label>
      </div>
      <span className="hint" id={labelId}>
        {placement === "results" ? `Recorded revision ${revision}.` : `Saved revision ${revision}, latest completed simulation.`}
        {dirty ? " Unsaved changes are not included." : ""}
        {noRun ? " Run a simulation for this saved revision first." : ""}
        {placement === "header" && saved.isPending ? " Checking for a saved result…" : ""}
      </span>
      {(pdf.error || (placement === "header" && saved.isError)) && (
        <div className="note fail stack" role="alert" data-testid={`quick-pdf-error-${placement}`}>
          <span>{pdf.error ?? "The saved result could not be checked. Nothing was changed."}</span>
          <div className="row tight">
            {saved.isError && placement === "header" && <button className="btn btn-sm" type="button" onClick={() => void saved.refetch()}>Try again</button>}
            <Link className="btn btn-sm" href={fallback}>Open the Report page</Link>
          </div>
        </div>
      )}
    </div>
  );
}
