"use client";

import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { addComment, editComment, fetchThread, removeComment } from "@/lib/api/reviews";
import { dateText } from "@/lib/report-presentation";
import { COMMENT_HINT, COMMENT_MAX_CHARS, REMOVED_TEXT, buildThread, charCount, commentCountText, commentErrorText } from "@/lib/review-presentation";

type Notice = { ok: boolean; text: string } | null;

/** The Reviewer's feedback on one review: write, edit and remove their own comments, and read the owner's replies. */
export function ReviewerComments({ id }: { id: string }) {
  const { user } = useAuth();
  const queries = useQueryClient();
  const uid = useId();
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const key = ["review-thread", user?.id, id];
  const thread = useQuery({ queryKey: key, queryFn: ({ signal }) => fetchThread(id, signal), enabled: !!user, retry: false, refetchOnWindowFocus: false });
  const settle = () => void queries.invalidateQueries({ queryKey: key });
  const failed = (e: unknown) => {
    setConfirming(null);
    setNotice({ ok: false, text: commentErrorText(e) });
  };

  const add = useMutation({
    mutationFn: () => addComment(id, text.trim()),
    onSuccess: () => {
      setText("");
      setNotice({ ok: true, text: "Comment added." });
      settle();
    },
    onError: failed,
  });
  const save = useMutation({
    mutationFn: (commentId: string) => editComment(id, commentId, editText.trim()),
    onSuccess: () => {
      setEditing(null);
      setNotice({ ok: true, text: "Comment updated." });
      settle();
    },
    onError: failed,
  });
  const remove = useMutation({
    mutationFn: (commentId: string) => removeComment(id, commentId),
    onSuccess: () => {
      setConfirming(null);
      setNotice({ ok: true, text: "Comment removed." });
      settle();
    },
    onError: failed,
  });

  const tree = buildThread(thread.data ?? []);
  const count = charCount(text);
  const busy = add.isPending || save.isPending || remove.isPending;

  return (
    <section className="panel stack r2-pad m16-noprint" aria-label="Your feedback" data-testid="reviewer-comments">
      <div className="stack">
        <h2 className="h3">Feedback</h2>
        <p className="hint">{COMMENT_HINT}</p>
      </div>

      <form
        className="stack"
        aria-label="Add a comment"
        onSubmit={(e) => {
          e.preventDefault();
          if (count.ok && !busy) add.mutate();
        }}
      >
        <div className="m15-field">
          <label htmlFor={uid + "t"}>Add a comment</label>
          <textarea id={uid + "t"} className="r2-input" rows={3} value={text} onChange={(e) => setText(e.target.value)} />
          <span className={"hint" + (count.used > COMMENT_MAX_CHARS ? " m16-warn" : "")} data-testid="comment-counter">
            {count.used} / {COMMENT_MAX_CHARS}
          </span>
        </div>
        <div className="row">
          <button className="btn btn-primary" type="submit" disabled={!count.ok || busy}>
            {add.isPending ? "Posting…" : "Post comment"}
          </button>
        </div>
      </form>

      {notice && (
        <p className={notice.ok ? "hint" : "m16-warn"} role={notice.ok ? "status" : "alert"} data-testid="comment-notice">
          {notice.text}
        </p>
      )}

      <div className="stack" aria-label="Thread">
        <h3 className="h4">{commentCountText(thread.data?.length ?? 0)}</h3>
        {thread.isPending && <p className="hint">Loading…</p>}
        {thread.isError && (
          <p className="m16-warn" role="alert">
            {commentErrorText(thread.error)}
          </p>
        )}
        {tree.length > 0 && (
          <ul className="r2-list">
            {tree.map(({ comment: c, replies }) => (
              <li key={c.id} className="r4-comment" data-testid="comment">
                <div className="r4-meta muted small">
                  You · {dateText(c.createdAt)}
                  {c.editedAt && !c.removed ? " · edited" : ""}
                </div>
                {c.removed ? (
                  <p className="muted r4-removed">{REMOVED_TEXT}</p>
                ) : editing === c.id ? (
                  <div className="stack">
                    <label className="sr-only" htmlFor={uid + "e" + c.id}>
                      Edit your comment
                    </label>
                    <textarea id={uid + "e" + c.id} className="r2-input" rows={3} value={editText} onChange={(e) => setEditText(e.target.value)} />
                    <span className="hint">
                      {charCount(editText).used} / {COMMENT_MAX_CHARS}
                    </span>
                    <div className="row tight">
                      <button className="btn btn-sm btn-primary" type="button" disabled={!charCount(editText).ok || busy} onClick={() => save.mutate(c.id)}>
                        Save
                      </button>
                      <button className="btn btn-sm" type="button" onClick={() => setEditing(null)}>
                        Cancel edit
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="r4-text">{c.text}</p>
                )}
                {!c.removed && editing !== c.id && (
                  <div className="row tight">
                    <button
                      className="btn btn-sm"
                      type="button"
                      onClick={() => {
                        setEditing(c.id);
                        setEditText(c.text ?? "");
                        setConfirming(null);
                      }}
                    >
                      Edit
                    </button>
                    {confirming !== c.id ? (
                      <button className="btn btn-sm" type="button" onClick={() => setConfirming(c.id)}>
                        Delete
                      </button>
                    ) : (
                      <>
                        <button className="btn btn-sm btn-danger" type="button" disabled={busy} onClick={() => remove.mutate(c.id)}>
                          Confirm delete
                        </button>
                        <button className="btn btn-sm" type="button" onClick={() => setConfirming(null)}>
                          Cancel
                        </button>
                      </>
                    )}
                  </div>
                )}
                {replies.length > 0 && (
                  <ul className="r2-list r4-replies">
                    {replies.map((r) => (
                      <li key={r.id} className="r4-reply" data-testid="reply">
                        <div className="r4-meta muted small">
                          {r.author.displayName} (owner) · {dateText(r.createdAt)}
                        </div>
                        <p className="r4-text">{r.text}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
