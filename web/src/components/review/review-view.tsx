"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { RoleGate } from "@/components/auth/role-gate";
import { ReportDocument } from "@/components/report/report-document";
import { Crumbs } from "@/components/shell/crumbs";
import { ApiError } from "@/lib/api/errors";
import { fetchReview } from "@/lib/api/reviews";
import { dateText } from "@/lib/report-presentation";
import { NOT_AVAILABLE_TEXT, REVIEWER_NOTE_TEXT } from "@/lib/review-presentation";
import { resolveRoute } from "@/lib/routes";

/** One frozen design shared with the signed-in Reviewer. Read-only: no editing, no running, no owner contact details. */
export function ReviewView({ id }: { id: string }) {
  return (
    <div className="page stack lg">
      <Crumbs resolved={resolveRoute(`/reviews/${id}`)} />
      <div className="page-head m16-noprint">
        <div className="stack">
          <span className="eyebrow">Reviewer</span>
          <h1 className="h1">Review</h1>
          <p className="lede">A read-only copy of a design shared with you.</p>
        </div>
        <Link className="btn" href="/reviews">
          Back to shared with me
        </Link>
      </div>
      <RoleGate role="reviewer">
        <Body id={id} />
      </RoleGate>
    </div>
  );
}

function Body({ id }: { id: string }) {
  const { user } = useAuth();
  const view = useQuery({ queryKey: ["review", user?.id, id], queryFn: ({ signal }) => fetchReview(id, signal), enabled: !!user, retry: false, refetchOnWindowFocus: false });
  const gone = view.isError && view.error instanceof ApiError && view.error.status === 404;
  if (gone)
    return (
      <div className="panel stack r2-pad" role="status" data-testid="review-gone">
        <h2 className="h3">{NOT_AVAILABLE_TEXT}</h2>
        <p className="hint">The owner may have stopped sharing it. Ask them if you still need it.</p>
      </div>
    );
  if (view.isError)
    return (
      <div className="panel stack r2-pad" role="alert">
        <h2 className="h3">The review could not be loaded</h2>
        <p className="hint">Check the connection and try again.</p>
        <div className="row">
          <button className="btn" type="button" onClick={() => void view.refetch()}>
            Try again
          </button>
        </div>
      </div>
    );
  if (!view.data)
    return (
      <p className="hint" role="status">
        Opening the review…
      </p>
    );
  return (
    <>
      <p className="hint m16-noprint" data-testid="review-banner">
        Shared by {view.data.ownerDisplayName} on {dateText(view.data.sharedAt)}. {REVIEWER_NOTE_TEXT}
      </p>
      <ReportDocument report={view.data.report} />
    </>
  );
}
