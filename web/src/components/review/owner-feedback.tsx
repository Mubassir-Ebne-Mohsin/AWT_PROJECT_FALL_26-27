"use client";

import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { fetchOwnerThread, replyToComment, type ReviewGrant } from "@/lib/api/reviews";
import { dateText } from "@/lib/report-presentation";
import { COMMENT_MAX_CHARS, OWNER_THREAD_HINT, REMOVED_TEXT, REPLIES_CLOSED_TEXT, buildThread, charCount, commentCountText, commentErrorText } from "@/lib/review-presentation";

type Notice = { ok: boolean; text: string } | null;

/** The owner's side of one review's thread: always readable, replies only while the review is active. */
export function OwnerFeedback({ designId, grant }: { designId: string; grant: ReviewGrant }) {
  const { user } = useAuth();
  const queries = useQueryClient();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [notice, setNotice] = useState<Notice>(null);

  const key = ["owner-thread", user?.id, grant.id];
  const thread = useQuery({ queryKey: key, queryFn: ({ signal }) => fetchOwnerThread(designId, grant.id, signal), enabled: !!user && open, retry: false, refetchOnWindowFocus: false });
  const send = useMutation({
    mutationFn: (parentId: string) => replyToComment(designId, grant.id, parentId, text.trim()),
    onSuccess: () => {
      setText("");
      setReplyTo(null);
      setNotice({ ok: true, text: "Reply sent." });
      void queries.invalidateQueries({ queryKey: key });
      void queries.invalidateQueries({ queryKey: ["reviews", user?.id, designId] });
    },
    onError: (e) => setNotice({ ok: false, text: commentErrorText(e) }),
  });

  const active = grant.status === "active";
  const tree = buildThread(thread.data ?? []);
  const count = charCount(text);

  return (
    <div className="r4-owner stack" data-testid="owner-feedback">
      <div className="row">
        <button className="btn btn-sm" type="button" aria-expanded={open} onClick={() => setOpen(!open)} aria-label={`Feedback from ${grant.reviewer.displayName}`}>
          Feedback ({grant.commentCount})
        </button>
        <span className="muted small">{commentCountText(grant.commentCount)}</span>
      </div>
      {open && (
        <div className="stack" aria-label={`Feedback from ${grant.reviewer.displayName}`}>
          <p className="hint">{OWNER_THREAD_HINT}</p>
          {!active && <p className="hint" data-testid="replies-closed">{REPLIES_CLOSED_TEXT}</p>}
          {notice && (
            <p className={notice.ok ? "hint" : "m16-warn"} role={notice.ok ? "status" : "alert"} data-testid="reply-notice">
              {notice.text}
            </p>
          )}
          {thread.isPending && <p className="hint">Loading…</p>}
          {thread.isError && (
            <p className="m16-warn" role="alert">
              {commentErrorText(thread.error)}
            </p>
          )}
          {thread.data && tree.length === 0 && <p className="hint">Nothing written yet.</p>}
          {tree.length > 0 && (
            <ul className="r2-list">
              {tree.map(({ comment: c, replies }) => (
                <li key={c.id} className="r4-comment" data-testid="owner-comment">
                  <div className="r4-meta muted small">
                    {c.author.displayName} · {dateText(c.createdAt)}
                    {c.editedAt && !c.removed ? " · edited" : ""}
                  </div>
                  {c.removed ? <p className="muted r4-removed">{REMOVED_TEXT}</p> : <p className="r4-text">{c.text}</p>}
                  {replies.length > 0 && (
                    <ul className="r2-list r4-replies">
                      {replies.map((r) => (
                        <li key={r.id} className="r4-reply" data-testid="owner-reply">
                          <div className="r4-meta muted small">You · {dateText(r.createdAt)}</div>
                          <p className="r4-text">{r.text}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                  {active && !c.removed && replyTo !== c.id && (
                    <div className="row tight">
                      <button
                        className="btn btn-sm"
                        type="button"
                        onClick={() => {
                          setReplyTo(c.id);
                          setText("");
                          setNotice(null);
                        }}
                      >
                        Reply
                      </button>
                    </div>
                  )}
                  {active && replyTo === c.id && (
                    <div className="stack">
                      <label className="sr-only" htmlFor={uid + c.id}>
                        Your reply
                      </label>
                      <textarea id={uid + c.id} className="r2-input" rows={2} value={text} onChange={(e) => setText(e.target.value)} />
                      <span className="hint">
                        {count.used} / {COMMENT_MAX_CHARS}
                      </span>
                      <div className="row tight">
                        <button className="btn btn-sm btn-primary" type="button" disabled={!count.ok || send.isPending} onClick={() => send.mutate(c.id)}>
                          {send.isPending ? "Sending…" : "Send reply"}
                        </button>
                        <button className="btn btn-sm" type="button" onClick={() => setReplyTo(null)}>
                          Cancel reply
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
