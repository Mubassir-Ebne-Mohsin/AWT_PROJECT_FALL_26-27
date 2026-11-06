"use client";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { exportMetrics } from "@/lib/api/admin";
import type { AdminMetrics } from "@/lib/admin-metrics";
import { buildAdminSummary } from "@/lib/admin-summary";

function save(content: BlobPart, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export function MetricsExports({
  m,
  refresh,
}: {
  m: AdminMetrics;
  refresh: () => void;
}) {
  const { user } = useAuth();
  return (
    <ExportControls key={user?.id ?? "anonymous"} m={m} refresh={refresh} />
  );
}
function ExportControls({
  m,
  refresh,
}: {
  m: AdminMetrics;
  refresh: () => void;
}) {
  const active = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  useEffect(
    () => () => {
      active.current?.abort();
      active.current = null;
    },
    [],
  );
  async function download(kind: "csv" | "json" | "pdf") {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    const clicked = m;
    setBusy(kind);
    setMessage("");
    try {
      const file = await exportMetrics(
        clicked.snapshotKey,
        kind === "pdf" ? "json" : kind,
        kind === "pdf" ? "pdf" : "download",
        controller.signal,
      );
      if (controller.signal.aborted) return;
      if (file.snapshotKey !== clicked.snapshotKey)
        throw new Error(
          "The export did not match the selected snapshot. Refresh and try again.",
        );
      if (kind === "pdf") {
        const snapshot: AdminMetrics = JSON.parse(file.content);
        if (snapshot.snapshotKey !== clicked.snapshotKey)
          throw new Error("Snapshot mismatch");
        const { renderPdfDocument } = await import("@/lib/dossier/render");
        const pdf = await renderPdfDocument(
          () => buildAdminSummary(snapshot),
          snapshot.generatedAt,
          "Aggregate Admin dashboard snapshot",
        );
        if (controller.signal.aborted) return;
        save(pdf.bytes as BlobPart, "application/pdf", pdf.dossier.fileName);
      } else save(file.content, file.contentType, file.fileName);
      setMessage(
        `Downloaded ${kind.toUpperCase()} from ${clicked.generatedAt}.`,
      );
    } catch (error) {
      if (!controller.signal.aborted)
        setMessage(
          error instanceof Error
            ? error.message
            : "Export failed. Please try again.",
        );
    } finally {
      if (active.current === controller) {
        active.current = null;
        setBusy(null);
      }
    }
  }
  return (
    <section
      className="panel"
      aria-labelledby="metrics-export-title"
      data-testid="metrics-exports"
      data-snapshot={m.snapshotKey}
    >
      <div className="panel-h">
        <h2 className="h3" id="metrics-export-title">
          Export this view
        </h2>
      </div>
      <div className="panel-body stack">
        <p className="small muted">
          Uses the numbers shown when you click, even if live updates continue.
          CSV/JSON include the full aggregate snapshot; PDF is a one-page
          headline summary. No names, emails or design contents.
        </p>
        <div className="row wrap">
          {(["csv", "json", "pdf"] as const).map((kind) => (
            <button
              key={kind}
              className="btn btn-sm"
              disabled={!!busy}
              onClick={() => void download(kind)}
            >
              {busy === kind
                ? `Making ${kind.toUpperCase()}…`
                : `Download ${kind.toUpperCase()}`}
            </button>
          ))}
        </div>
        <p className="small muted">
          Snapshots expire after five minutes or an API restart. Accepted export
          requests are counted; local file saving is not tracked.
        </p>
        {message && (
          <div className="stack">
            <p role="status" data-testid="metrics-export-message">
              {message}
            </p>
            {!message.startsWith("Downloaded") && (
              <button className="btn btn-sm" onClick={refresh}>
                Refresh dashboard
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
