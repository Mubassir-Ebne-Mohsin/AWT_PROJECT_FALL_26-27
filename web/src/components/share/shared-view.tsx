"use client";

import { useQuery } from "@tanstack/react-query";
import { ReportDocument } from "@/components/report/report-document";
import { Crumbs } from "@/components/shell/crumbs";
import { ApiError } from "@/lib/api/errors";
import { openShare } from "@/lib/api/shares";
import { dateText, reportFileTitle } from "@/lib/report-presentation";
import { resolveRoute } from "@/lib/routes";
import { GONE_TEXT, looksLikeToken } from "@/lib/share-presentation";

/**
 * The public, read-only view. No login. Every unusable link (unknown, expired, revoked, malformed) shows the same
 * sentence, so a visitor cannot tell why. The page never refetches on focus or reconnect: each read is counted
 * for the owner, so only a deliberate visit or retry should make one.
 */
export function SharedView({ token }: { token: string }) {
  const valid = looksLikeToken(token);
  const view = useQuery({
    queryKey: ["shared-view", token],
    queryFn: ({ signal }) => openShare(token, signal),
    enabled: valid,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    staleTime: Infinity,
    gcTime: 0,
  });
  const gone = !valid || (view.isError && view.error instanceof ApiError && view.error.status === 404);
  const data = view.data;

  function print() {
    if (!data) return;
    const before = document.title;
    document.title = reportFileTitle(data.report);
    window.print();
    document.title = before;
  }

  return (
    <div className="page stack lg">
      <Crumbs resolved={resolveRoute("/share/x")} />
      <div className="page-head m16-noprint">
        <div className="stack">
          <span className="eyebrow">Shared with you</span>
          <h1 className="h1">Shared design</h1>
          <p className="lede">A read-only copy of a design, shared by its owner.</p>
        </div>
        <button className="btn btn-primary" type="button" disabled={!data} onClick={print}>
          Print or save as PDF
        </button>
      </div>

      {gone ? (
        <div className="panel stack" role="status" data-testid="share-gone">
          <h2 className="h3">{GONE_TEXT}</h2>
          <p className="hint">The owner may have stopped sharing it, or it may have expired. Ask them for a new link if you still need it.</p>
        </div>
      ) : view.isError ? (
        <div className="panel stack" role="alert">
          <h2 className="h3">The shared design could not be loaded</h2>
          <p className="hint">Check the connection and try again.</p>
          <button className="btn" type="button" onClick={() => void view.refetch()}>
            Try again
          </button>
        </div>
      ) : !data ? (
        <p className="hint" role="status">
          Opening the shared design…
        </p>
      ) : (
        <>
          <p className="hint m16-noprint" data-testid="share-banner">
            Read-only copy made on {dateText(data.sharedAt)}.{" "}
            {data.expiresAt ? `This link expires on ${dateText(data.expiresAt)}.` : "This link does not expire until the owner stops it."} Nothing here changes if the owner
            edits the design, and you cannot edit, run or change it.
          </p>
          <ReportDocument report={data.report} designOnly={data.scope === "design"} />
        </>
      )}
    </div>
  );
}
