"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { fetchReport, type Report } from "@/lib/api/report";
import { ApiError } from "@/lib/api/errors";
import { usePdfNotes } from "@/lib/pdf-notes-preference";

export interface PdfSource {
  userId: string | undefined;
  designId: string;
  revision?: number;
  run?: string;
  requireSimulation?: boolean;
}
function failure(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 403) return "You no longer have access to this report.";
    if (error.status === 404) return "That saved revision or result is no longer available.";
    if (error.code === "NETWORK") return "The server could not be reached. Try again or open the Report page.";
  }
  return "The PDF could not be made. You can still print this page.";
}
/** Same renderer for both entry points; a changed page/account cancels late downloads. */
export function useReportPdf(source: PdfSource) {
  const { userId, designId, revision, run, requireSimulation = false } = source;
  const identity = JSON.stringify([userId, designId, revision, run, requireSimulation]);
  const [includeNotes, setIncludeNotes] = usePdfNotes();
  const [state, setState] = useState({ identity, busy: false, error: null as string | null });
  const active = useRef<AbortController | null>(null);
  useLayoutEffect(() => () => { active.current?.abort(); active.current = null; }, [identity]);

  // A guarded render reset prevents revisiting a cancelled selection from reviving its old busy/error state.
  if (state.identity !== identity) setState({ identity, busy: false, error: null });

  async function download(report?: Report) {
    if (!userId || active.current) return;
    const task = new AbortController();
    active.current = task;
    setState({ identity, busy: true, error: null });
    const current = () => active.current === task && !task.signal.aborted;
    try {
      const data = report ?? await fetchReport(designId, { revision, run }, task.signal);
      if (!current()) return;
      if (data.designId !== designId || (revision !== undefined && data.revision !== revision) || (run !== undefined && data.run?.id !== run))
        throw new Error("Report identity mismatch");
      if (requireSimulation && (!data.run || data.run.status !== "completed" || data.run.kind !== "simulation" || !data.run.simulation || !data.run.matchesRevision || data.run.designRevision !== data.revision))
        throw new Error("A completed simulation for this revision is required");
      const { renderDossier, downloadPdf } = await import("@/lib/dossier/render");
      if (!current()) return;
      const result = await renderDossier(data, { includeNotes });
      if (!current()) return;
      downloadPdf(result.bytes, result.dossier.fileName);
      setState({ identity, busy: false, error: null });
    } catch (error) {
      if (current()) setState({ identity, busy: false, error: failure(error) });
    } finally {
      if (active.current === task) active.current = null;
    }
  }
  return {
    busy: state.identity === identity && state.busy,
    error: state.identity === identity ? state.error : null,
    includeNotes, setIncludeNotes, download,
  };
}
