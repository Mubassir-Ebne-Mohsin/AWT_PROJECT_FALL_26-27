"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { RoleGate } from "@/components/auth/role-gate";
import { Crumbs } from "@/components/shell/crumbs";
import { ContextList, PlainText, PriorityPill, StatusPill } from "@/components/support/parts";
import { ApiError } from "@/lib/api/errors";
import { getInboxReport, listSupportAgents, markInboxRead, replyInbox, updateInbox } from "@/lib/api/support";
import { resolveRoute } from "@/lib/routes";
import { CATEGORY_LABEL, MESSAGE_MAX, PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL_SUPPORT, dateTimeText, messageIssue, sinceText, supportErrorText, type Priority, type Status } from "@/lib/support";

const REFRESH_MS = 20_000;

export function SupportTicket({ id }: { id: string }) {
  return (
    <div className="page stack lg">
      <Crumbs resolved={resolveRoute(`/support/${id}`)} />
      <RoleGate role="support">
        <Ticket id={id} />
      </RoleGate>
    </div>
  );
}

function Ticket({ id }: { id: string }) {
  const { user } = useAuth();
  const queries = useQueryClient();
  const key = ["support-ticket", user?.id, id];
  const q = useQuery({ queryKey: key, queryFn: ({ signal }) => getInboxReport(id, signal), enabled: !!user, retry: false, refetchInterval: REFRESH_MS });
  const agents = useQuery({ queryKey: ["support-agents", user?.id], queryFn: ({ signal }) => listSupportAgents(signal), enabled: !!user, retry: false, staleTime: 60_000 });
  const [text, setText] = useState("");
  const [internal, setInternal] = useState(false);
  const [shown, setShown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const r = q.data;
  const latest = r?.messages[r.messages.length - 1]?.id ?? "";

  // Opening a report, and any new message that arrives while it is open, marks it read for this account.
  const read = useMutation({ mutationFn: () => markInboxRead(id), onSuccess: () => void queries.invalidateQueries({ queryKey: ["support-inbox"] }) });
  useEffect(() => {
    if (r) read.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r?.id, latest]);

  const refreshed = (detail: unknown) => {
    queries.setQueryData(key, detail);
    void queries.invalidateQueries({ queryKey: ["support-inbox"] });
  };
  const send = useMutation({
    mutationFn: () => replyInbox(id, text, internal),
    onSuccess: (d) => {
      refreshed(d);
      setText("");
      setShown(false);
      setError(null);
    },
    onError: (e) => setError(supportErrorText(e)),
  });
  const change = useMutation({
    mutationFn: (c: { status?: Status; priority?: Priority; assigneeId?: string | null }) => updateInbox(id, c),
    onSuccess: (d) => {
      refreshed(d);
      setError(null);
    },
    onError: (e) => setError(supportErrorText(e)),
  });

  if (q.isPending)
    return (
      <p className="muted" role="status">
        Loading…
      </p>
    );
  if (q.isError || !r)
    return (
      <div className="empty panel" role="alert" data-testid="ticket-missing">
        <h2 className="h3">{q.error instanceof ApiError && q.error.status === 404 ? "That report does not exist" : "That report could not be loaded"}</h2>
        <p className="muted">{supportErrorText(q.error)}</p>
        <Link href="/support" className="btn btn-sm">
          Back to the inbox
        </Link>
      </div>
    );

  const issue = shown ? messageIssue(text) : null;
  const busy = send.isPending || change.isPending;
  const now = Date.now();
  return (
    <div className="rp-ticket" data-testid="ticket">
      <div className="stack lg rp-ticket-main">
        <div className="stack">
          <span className="eyebrow">
            {r.code} · {CATEGORY_LABEL[r.category]}
          </span>
          <h1 className="h1" data-testid="ticket-title">
            {r.title}
          </h1>
          <div className="row tight">
            <StatusPill status={r.status} labels={STATUS_LABEL_SUPPORT} />
            <PriorityPill priority={r.priority} />
            <span className="muted small">
              From {r.authorName ?? "a deleted account"} · sent {dateTimeText(r.createdAt)} ({sinceText(r.createdAt, now)} ago)
            </span>
          </div>
        </div>

        <section className="panel stack rp-pad" aria-label="The report">
          <h2 className="h3">What they wrote</h2>
          <PlainText text={r.body} />
          {r.expected && (
            <>
              <h3 className="eyebrow">What they expected</h3>
              <PlainText text={r.expected} />
            </>
          )}
          <h3 className="eyebrow">Sent with it (chosen by the reporter)</h3>
          <ContextList context={r.context} />
        </section>

        <section className="stack" aria-label="Conversation" data-testid="thread">
          <h2 className="h3">Conversation</h2>
          {r.messages.length === 0 ? (
            <p className="muted">No messages yet.</p>
          ) : (
            <ul className="rp-thread" role="list">
              {r.messages.map((m) => (
                <li key={m.id} className={`rp-msg ${m.kind === "user" ? "you" : m.kind === "note" ? "note" : "support"}`} data-testid={`msg-${m.kind}`}>
                  <div className="small muted">
                    <b>{m.kind === "user" ? (m.authorName ?? "Reporter") : (m.authorName ?? "Support")}</b> · {dateTimeText(m.at)}
                    {m.kind === "note" && <span className="pill warn rp-note-tag"> Internal note: the reporter cannot see this</span>}
                  </div>
                  <PlainText text={m.body} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel stack rp-pad" aria-label="Reply">
          <div className="seg" role="group" aria-label="Who can see this">
            <button aria-pressed={!internal} onClick={() => setInternal(false)} data-testid="mode-reply">
              Reply to the reporter
            </button>
            <button aria-pressed={internal} onClick={() => setInternal(true)} data-testid="mode-note">
              Internal note
            </button>
          </div>
          <div className="field">
            <label className="label" htmlFor="tk-msg">
              {internal ? "Only Support will see this" : "The reporter will see this under My reports"}
            </label>
            <textarea
              id="tk-msg"
              className={`textarea${issue ? " bad" : ""}${internal ? " rp-note-box" : ""}`}
              rows={4}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setError(null);
              }}
              aria-invalid={!!issue}
              data-testid="reply-box"
            />
            <span className="hint" role={issue ? "alert" : undefined} style={issue ? { color: "var(--fail-ink)" } : undefined}>
              {issue ?? `${text.trim().length} of ${MESSAGE_MAX} characters`}
            </span>
          </div>
          {error && (
            <div className="note fail" role="alert" data-testid="ticket-error">
              {error}
            </div>
          )}
          <div className="row">
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() => {
                setShown(true);
                if (!messageIssue(text)) send.mutate();
              }}
              data-testid="reply-send"
            >
              {send.isPending ? "Sending…" : internal ? "Add note" : "Send reply"}
            </button>
          </div>
        </section>
      </div>

      <aside className="panel stack rp-pad rp-ticket-side" aria-label="Handle this report" data-testid="ticket-controls">
        <h2 className="h3">Handle</h2>
        <div className="field">
          <label className="label" htmlFor="tk-status">
            Status
          </label>
          <select id="tk-status" className="select" value={r.status} disabled={busy} onChange={(e) => change.mutate({ status: e.target.value as Status })} data-testid="ctl-status">
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL_SUPPORT[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="tk-priority">
            Priority
          </label>
          <select id="tk-priority" className="select" value={r.priority} disabled={busy} onChange={(e) => change.mutate({ priority: e.target.value as Priority })} data-testid="ctl-priority">
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="tk-owner">
            Owner
          </label>
          <select id="tk-owner" className="select" value={r.assigneeId ?? ""} disabled={busy} onChange={(e) => change.mutate({ assigneeId: e.target.value || null })} data-testid="ctl-owner">
            <option value="">Unassigned</option>
            {(agents.data ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.id === user?.id ? `${a.displayName} (me)` : a.displayName}
              </option>
            ))}
          </select>
          {user && r.assigneeId !== user.id && (
            <button className="btn btn-sm" disabled={busy} onClick={() => change.mutate({ assigneeId: user.id })} data-testid="ctl-take">
              Assign to me
            </button>
          )}
        </div>
        <Link href="/support" className="btn btn-sm">
          Back to the inbox
        </Link>
      </aside>
    </div>
  );
}
