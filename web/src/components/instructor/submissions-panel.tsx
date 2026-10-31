"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { fetchChallengeSubmissions, fetchSubmission, sendFeedback } from "@/lib/api/instructor-submissions";
import { FEEDBACK_MAX, FEEDBACK_NOTE, challengeErrorText, feedbackErrorText, goalText, outcomeText, trafficText } from "@/lib/challenge-presentation";
import { dateText } from "@/lib/report-presentation";

/**
 * R5.3 Submissions to one of the Instructor's own challenges. Learners appear by display name only. Opening a
 * submission shows the frozen design that was judged and the notes already sent; a new note is plain text and,
 * once sent, cannot be edited or removed.
 */
export function SubmissionsPanel({ challengeId }: { challengeId: string }) {
  const { user } = useAuth();
  const [open, setOpen] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ["challenge-submissions", user?.id, challengeId],
    queryFn: ({ signal }) => fetchChallengeSubmissions(challengeId, signal),
    enabled: !!user,
    retry: false,
    refetchOnWindowFocus: false,
  });

  return (
    <section className="panel stack r2-pad" aria-label="Submissions" data-testid="submissions-panel">
      <h2 className="h3">Submissions</h2>
      {list.isPending && <p className="hint">Loading…</p>}
      {list.isError && (
        <p className="m16-warn" role="alert" data-testid="submissions-error">
          {challengeErrorText(list.error)}{" "}
          <button className="btn" type="button" onClick={() => void list.refetch()}>
            Try again
          </button>
        </p>
      )}
      {list.data && list.data.length === 0 && <p className="hint" data-testid="submissions-empty">No one has submitted a graded attempt yet.</p>}
      {list.data && list.data.length > 0 && (
        <ul className="r2-list" aria-label="Graded submissions">
          {list.data.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className={"r2-row" + (open === s.id ? " is-on" : "")}
                aria-pressed={open === s.id}
                data-testid="submission-row"
                onClick={() => setOpen(open === s.id ? null : s.id)}
              >
                <span className="stack">
                  <strong>{s.learner.displayName}</strong>
                  <span className="small muted">
                    Revision {s.designRevision} · {dateText(s.createdAt)}
                  </span>
                </span>
                <span className="small">
                  {outcomeText(s)} · {s.feedbackCount} {s.feedbackCount === 1 ? "note" : "notes"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && <Detail key={open} id={open} challengeId={challengeId} />}
    </section>
  );
}

function Detail({ id, challengeId }: { id: string; challengeId: string }) {
  const { user } = useAuth();
  const queries = useQueryClient();
  const [text, setText] = useState("");
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const key = ["challenge-submission", user?.id, id];
  const one = useQuery({ queryKey: key, queryFn: ({ signal }) => fetchSubmission(id, signal), enabled: !!user, retry: false, refetchOnWindowFocus: false });
  const send = useMutation({
    mutationFn: (body: string) => sendFeedback(id, body),
    onSuccess: () => {
      setText("");
      setNotice({ ok: true, text: "Feedback sent. The learner can read it on their attempt page." });
      void queries.invalidateQueries({ queryKey: key });
      void queries.invalidateQueries({ queryKey: ["challenge-submissions", user?.id, challengeId] });
    },
    onError: (e) => setNotice({ ok: false, text: feedbackErrorText(e) }),
  });

  if (one.isPending) return <p className="hint">Loading…</p>;
  if (one.isError)
    return (
      <p className="m16-warn" role="alert" data-testid="submission-error">
        {challengeErrorText(one.error)}
      </p>
    );
  const d = one.data;
  const label = new Map(d.snapshot.graph.nodes.map((n) => [n.id, n.label]));
  const trimmed = text.trim();
  return (
    <div className="stack" role="region" aria-label="Submission detail" data-testid="submission-detail">
      <h3 className="h3">
        {d.submission.learner.displayName}, revision {d.submission.designRevision}
      </h3>
      <p data-testid="submission-outcome">{outcomeText(d.submission)}</p>
      <p className="small muted">
        Goal: {goalText(d.challenge.goal)}. Judged at {trafficText(d.snapshot.traffic)}. Model estimate ({d.submission.engineVersion}), not measured infrastructure.
      </p>
      <h4 className="h4">Design as submitted</h4>
      <p className="small muted">
        {d.snapshot.graph.nodes.length} components and {d.snapshot.graph.edges.length} connections, frozen when it was submitted.
      </p>
      <ul aria-label="Components" data-testid="submission-components">
        {d.snapshot.graph.nodes.map((n) => (
          <li key={n.id}>
            {n.label} ({n.type})
          </li>
        ))}
      </ul>
      <ul aria-label="Connections">
        {d.snapshot.graph.edges.map((e, i) => (
          <li key={i}>
            {label.get(e.from) ?? e.from} to {label.get(e.to) ?? e.to}
          </li>
        ))}
      </ul>

      <h4 className="h4">Feedback</h4>
      {d.feedback.length === 0 && <p className="hint">No feedback sent yet.</p>}
      {d.feedback.map((f) => (
        <div className="r4-comment" key={f.id} data-testid="feedback-item">
          <div className="small muted">
            {f.author.displayName} · {dateText(f.createdAt)}
          </div>
          <p className="r4-text">{f.text}</p>
        </div>
      ))}
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (!trimmed || send.isPending) return;
          setNotice(null);
          send.mutate(trimmed);
        }}
      >
        <label htmlFor={`fb-${id}`}>Write feedback for {d.submission.learner.displayName}</label>
        <textarea
          id={`fb-${id}`}
          className="r2-input"
          rows={4}
          maxLength={FEEDBACK_MAX}
          value={text}
          data-testid="feedback-input"
          aria-describedby={`fb-note-${id}`}
          onChange={(e) => setText(e.target.value)}
        />
        <p className="hint" id={`fb-note-${id}`}>
          {FEEDBACK_NOTE} {text.length}/{FEEDBACK_MAX} characters.
        </p>
        <div className="row">
          <button className="btn btn-primary" type="submit" disabled={!trimmed || send.isPending} data-testid="feedback-send">
            {send.isPending ? "Sending…" : "Send feedback"}
          </button>
        </div>
        {notice && (
          <p className={notice.ok ? "hint" : "m16-warn"} role={notice.ok ? "status" : "alert"} data-testid="feedback-notice">
            {notice.text}
          </p>
        )}
      </form>
    </div>
  );
}
