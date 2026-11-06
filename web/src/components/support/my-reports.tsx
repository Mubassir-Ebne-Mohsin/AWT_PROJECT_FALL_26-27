"use client";

import Link from "next/link";
import { useNow } from "@/lib/use-now";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { Crumbs } from "@/components/shell/crumbs";
import { useUi } from "@/components/shell/ui-provider";
import { ContextList, PlainText, StatusPill } from "@/components/support/parts";
import { addReportMessage, getMyReport, listMyReports } from "@/lib/api/support";
import { ApiError } from "@/lib/api/errors";
import { resolveRoute } from "@/lib/routes";
import { CATEGORY_LABEL, MESSAGE_MAX, REOPEN_DAYS, STATUS_LABEL, dateTimeText, messageIssue, sinceText, supportErrorText } from "@/lib/support";

/** Reports refresh on their own every half minute while the tab is showing, so a reply appears without a reload. */
const REFRESH_MS = 30_000;

export function MyReports() {
  const { user } = useAuth();
  const { setUI } = useUi();
  const list = useQuery({ queryKey: ["my-reports", user?.id], queryFn: ({ signal }) => listMyReports(signal), enabled: !!user, retry: false, refetchInterval: REFRESH_MS });
  const now = useNow(REFRESH_MS);
  return (
    <div className="page stack lg">
      <Crumbs resolved={resolveRoute("/reports")} />
      <div className="page-head">
        <div className="stack">
          <span className="eyebrow">Support</span>
          <h1 className="h1">My reports</h1>
          <p className="lede">The problems you have reported, and what Support has said. Support cannot see your designs.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setUI({ feedback: true, reportRef: null })} data-testid="new-report">
          Report a problem
        </button>
      </div>
      {list.isPending ? (
        <p className="muted" role="status">
          Loading your reports…
        </p>
      ) : list.isError ? (
        <div className="note fail" role="alert" data-testid="reports-error">
          <span>{supportErrorText(list.error)}</span>
          <button className="btn btn-sm" onClick={() => void list.refetch()}>
            Try again
          </button>
        </div>
      ) : list.data.length === 0 ? (
        <div className="empty panel" data-testid="reports-empty">
          <h2 className="h3">You have not reported anything</h2>
          <p className="muted">If something breaks or looks wrong, tell us. Reports come here with the answer.</p>
        </div>
      ) : (
        <ul className="rp-list" role="list" data-testid="reports-list">
          {list.data.map((r) => (
            <li key={r.id} className="panel rp-item">
              <div className="stack">
                <div className="row tight">
                  <b data-testid="report-item-code">{r.code}</b>
                  <StatusPill status={r.status} />
                  <span className="muted small">{CATEGORY_LABEL[r.category]}</span>
                </div>
                <Link href={`/reports/${r.id}`} prefetch={false} className="rp-title-link" data-testid="report-item-title">
                  {r.title}
                </Link>
              </div>
              <span className="muted small" title={dateTimeText(r.updatedAt)}>
                Updated {sinceText(r.updatedAt, now)} ago
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MyReport({ id }: { id: string }) {
  const { user } = useAuth();
  const queries = useQueryClient();
  const [text, setText] = useState("");
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = ["my-report", user?.id, id];
  const q = useQuery({ queryKey: key, queryFn: ({ signal }) => getMyReport(id, signal), enabled: !!user, retry: false, refetchInterval: REFRESH_MS });
  const now = useNow(REFRESH_MS);
  const r = q.data;

  async function send() {
    if (busy) return;
    setShown(true);
    if (messageIssue(text)) return;
    setBusy(true);
    setError(null);
    try {
      queries.setQueryData(key, await addReportMessage(id, text));
      void queries.invalidateQueries({ queryKey: ["my-reports", user?.id] });
      setText("");
      setShown(false);
    } catch (e) {
      setError(supportErrorText(e));
      if (e instanceof ApiError && e.status === 409) void q.refetch();
    } finally {
      setBusy(false);
    }
  }

  const issue = shown ? messageIssue(text) : null;
  const closedForGood = r?.status === "resolved" && r.reopenUntil === null;
  return (
    <div className="page stack lg">
      <Crumbs resolved={resolveRoute(`/reports/${id}`)} />
      {q.isPending ? (
        <p className="muted" role="status">
          Loading…
        </p>
      ) : q.isError || !r ? (
        <div className="empty panel" role="alert" data-testid="report-missing">
          <h2 className="h3">{q.error instanceof ApiError && q.error.status === 404 ? "We could not find that report" : "That report could not be loaded"}</h2>
          <p className="muted">{supportErrorText(q.error)}</p>
          <Link href="/reports" className="btn btn-sm">
            Back to my reports
          </Link>
        </div>
      ) : (
        <>
          <div className="page-head">
            <div className="stack">
              <span className="eyebrow">
                {r.code} · {CATEGORY_LABEL[r.category]}
              </span>
              <h1 className="h1" data-testid="report-title-text">
                {r.title}
              </h1>
              <div className="row tight">
                <StatusPill status={r.status} />
                <span className="muted small">Sent {dateTimeText(r.createdAt)}</span>
              </div>
            </div>
          </div>

          <section className="panel stack rp-pad" aria-label="What you sent">
            <h2 className="h3">What you sent</h2>
            <PlainText text={r.body} />
            {r.expected && (
              <>
                <h3 className="eyebrow">What you expected</h3>
                <PlainText text={r.expected} />
              </>
            )}
            <h3 className="eyebrow">Sent with it</h3>
            <ContextList context={r.context} />
          </section>

          <section className="stack" aria-label="Conversation" data-testid="thread">
            <h2 className="h3">Conversation</h2>
            {r.messages.length === 0 ? (
              <p className="muted" data-testid="thread-empty">
                No reply yet. Support will answer here.
              </p>
            ) : (
              <ul className="rp-thread" role="list">
                {r.messages.map((m) => (
                  <li key={m.id} className={`rp-msg ${m.from}`} data-testid={`msg-${m.from}`}>
                    <div className="small muted">
                      <b>{m.from === "you" ? "You" : "Support"}</b> · {dateTimeText(m.at)}
                    </div>
                    <PlainText text={m.body} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel stack rp-pad" aria-label="Add a message">
            {r.status === "resolved" && r.reopenUntil && (
              <p className="note accent" data-testid="reopen-note">
                This report is resolved. Writing here reopens it, until {dateTimeText(r.reopenUntil)} ({REOPEN_DAYS} days after it was resolved).
              </p>
            )}
            {closedForGood ? (
              <p className="note" data-testid="closed-note">
                This report was resolved more than {REOPEN_DAYS} days ago, so it can no longer be reopened. If the problem is back, send a new report.
              </p>
            ) : (
              <div className="field">
                <label className="label" htmlFor="rp-msg">
                  {r.status === "waiting" ? "Support is waiting for your answer" : "Add a message"}
                </label>
                <textarea
                  id="rp-msg"
                  className={`textarea${issue ? " bad" : ""}`}
                  rows={3}
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    setError(null);
                  }}
                  aria-invalid={!!issue}
                  data-testid="message-box"
                />
                <span className="hint" role={issue ? "alert" : undefined} style={issue ? { color: "var(--fail-ink)" } : undefined}>
                  {issue ?? `${text.trim().length} of ${MESSAGE_MAX} characters`}
                </span>
              </div>
            )}
            {error && (
              <div className="note fail" role="alert" data-testid="message-error">
                {error}
              </div>
            )}
            {!closedForGood && (
              <div className="row">
                <button className="btn btn-primary" onClick={() => void send()} disabled={busy} data-testid="message-send">
                  {busy ? "Sending…" : r.status === "resolved" ? "Reopen and send" : "Send"}
                </button>
                <span className="muted small">
                  Status: {STATUS_LABEL[r.status]} · updated {sinceText(r.updatedAt, now)} ago
                </span>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
