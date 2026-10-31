"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { RoleGate } from "@/components/auth/role-gate";
import { Crumbs } from "@/components/shell/crumbs";
import { fetchSharedWithMe } from "@/lib/api/reviews";
import { verdictLabel } from "@/lib/history-presentation";
import { dateText } from "@/lib/report-presentation";
import { resolveRoute } from "@/lib/routes";

/** The Reviewer's inbox: designs owners have chosen to share with this account. Display names only. */
export function SharedWithMe() {
  return (
    <div className="page stack lg">
      <Crumbs resolved={resolveRoute("/reviews")} />
      <div className="page-head">
        <div className="stack">
          <span className="eyebrow">Reviewer</span>
          <h1 className="h1">Shared with me</h1>
          <p className="lede">Frozen, read-only copies of designs that owners have shared with you.</p>
        </div>
      </div>
      <RoleGate role="reviewer">
        <Inbox />
      </RoleGate>
    </div>
  );
}

function Inbox() {
  const { user } = useAuth();
  const list = useQuery({ queryKey: ["shared-with-me", user?.id], queryFn: ({ signal }) => fetchSharedWithMe(signal), enabled: !!user, retry: false });
  return (
    <section className="panel stack r2-pad" aria-label="Designs shared with you" data-testid="shared-with-me">
      {list.isPending && <p className="hint">Loading…</p>}
      {list.isError && (
        <div className="stack" role="alert">
          <p className="m16-warn">The list could not be loaded. Nothing was changed.</p>
          <div className="row">
            <button className="btn" type="button" onClick={() => void list.refetch()}>
              Try again
            </button>
          </div>
        </div>
      )}
      {list.data && list.data.length === 0 && <p className="hint">Nothing has been shared with you yet. When an owner shares a design, it appears here.</p>}
      {list.data && list.data.length > 0 && (
        <ul className="r2-list">
          {list.data.map((item) => (
            <li key={item.id} className="r2-audit" data-testid="shared-item">
              <span>
                <strong>{item.designName}</strong>
                <br />
                <span className="muted small">
                  From {item.ownerDisplayName} · revision {item.revision} · {dateText(item.sharedAt)}
                  {item.verdict ? ` · ${verdictLabel(item.verdict)}` : " · no result recorded"}
                </span>
              </span>
              <Link className="btn btn-sm" href={`/reviews/${item.id}`} aria-label={`Open ${item.designName}`}>
                Open
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
