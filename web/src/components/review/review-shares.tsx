"use client";

import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { fetchRunSummaries, fetchVersions } from "@/lib/api/history";
import { createReview, fetchReviews, revokeReview } from "@/lib/api/reviews";
import { verdictLabel } from "@/lib/history-presentation";
import { dateText } from "@/lib/report-presentation";
import { REVIEW_BOUNDARY_TEXT, REVIEW_SNAPSHOT_TEXT, grantStatusText, looksLikeEmail, reviewErrorText } from "@/lib/review-presentation";

type Notice = { ok: boolean; text: string } | null;

/** The owner's side of R3: name one Reviewer and one revision, see who has a copy, stop it at any time. */
export function ReviewShares({ id }: { id: string }) {
  const { user } = useAuth();
  const queries = useQueryClient();
  const uid = useId();
  const [email, setEmail] = useState("");
  const [revision, setRevision] = useState("");
  const [run, setRun] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const grants = useQuery({ queryKey: ["reviews", user?.id, id], queryFn: ({ signal }) => fetchReviews(id, signal), enabled: !!user, retry: false });
  const versions = useQuery({ queryKey: ["report-versions", user?.id, id], queryFn: ({ signal }) => fetchVersions(id, undefined, signal), enabled: !!user, retry: false });
  const runs = useQuery({ queryKey: ["report-runs", user?.id, id], queryFn: ({ signal }) => fetchRunSummaries(id, signal), enabled: !!user, retry: false });
  const completed = (runs.data ?? []).filter((r) => r.kind === "simulation" && r.status === "completed");

  const create = useMutation({
    mutationFn: () => createReview(id, { email: email.trim(), ...(revision ? { revision: Number(revision) } : {}), ...(run ? { run } : {}) }),
    onSuccess: (made) => {
      setNotice({ ok: true, text: `Shared revision ${made.revision} with ${made.reviewer.displayName}.` });
      setEmail("");
      setRun("");
      void queries.invalidateQueries({ queryKey: ["reviews", user?.id, id] });
    },
    onError: (e) => setNotice({ ok: false, text: reviewErrorText(e) }),
  });
  const stop = useMutation({
    mutationFn: (grantId: string) => revokeReview(id, grantId),
    onSuccess: () => {
      setConfirming(null);
      setNotice({ ok: true, text: "Review stopped. The Reviewer can no longer open it." });
      void queries.invalidateQueries({ queryKey: ["reviews", user?.id, id] });
    },
    onError: (e) => {
      setConfirming(null);
      setNotice({ ok: false, text: reviewErrorText(e) });
    },
  });

  return (
    <section className="stack lg" aria-label="Reviewers" data-testid="review-shares">
      <div className="stack">
        <h2 className="h2">Share with a Reviewer</h2>
        <p className="hint">{REVIEW_SNAPSHOT_TEXT}</p>
      </div>

      <form
        className="panel stack r2-pad"
        aria-label="Share with a Reviewer"
        onSubmit={(e) => {
          e.preventDefault();
          if (looksLikeEmail(email) && !create.isPending) create.mutate();
        }}
      >
        <div className="m15-field">
          <label htmlFor={uid + "e"}>Reviewer&apos;s email</label>
          <input id={uid + "e"} className="r2-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
          <span className="hint">They need an account that an Admin has given the Reviewer role.</span>
        </div>
        <div className="m15-pickers">
          <div className="m15-field">
            <label htmlFor={uid + "r"}>Revision</label>
            <select id={uid + "r"} value={revision} onChange={(e) => setRevision(e.target.value)} disabled={!versions.data}>
              <option value="">Current revision</option>
              {(versions.data ?? []).map((v) => (
                <option key={v.revision} value={v.revision}>
                  Revision {v.revision} · {dateText(v.createdAt)}
                </option>
              ))}
            </select>
          </div>
          <div className="m15-field">
            <label htmlFor={uid + "x"}>Result</label>
            <select id={uid + "x"} value={run} onChange={(e) => setRun(e.target.value)} disabled={!runs.data}>
              <option value="">Latest result for this revision</option>
              {completed.map((r) => (
                <option key={r.id} value={r.id}>
                  Revision {r.designRevision} · {dateText(r.createdAt)} · {verdictLabel(r.verdict)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="row">
          <button className="btn btn-primary" type="submit" disabled={!looksLikeEmail(email) || create.isPending}>
            {create.isPending ? "Sharing…" : "Share with Reviewer"}
          </button>
        </div>
      </form>

      {notice && (
        <p className={notice.ok ? "hint" : "m16-warn"} role={notice.ok ? "status" : "alert"} data-testid="review-notice">
          {notice.text}
        </p>
      )}

      <div className="panel stack r2-pad" aria-label="Who can open a copy">
        <h3 className="h3">Who has a copy</h3>
        <p className="hint">{REVIEW_BOUNDARY_TEXT}</p>
        {grants.isPending && <p className="hint">Loading…</p>}
        {grants.isError && (
          <p className="m16-warn" role="alert">
            {reviewErrorText(grants.error)}
          </p>
        )}
        {grants.data && grants.data.length === 0 && <p className="hint">Nobody yet.</p>}
        {grants.data && grants.data.length > 0 && (
          <ul className="r2-list">
            {grants.data.map((g) => (
              <li key={g.id} className="r2-audit" data-testid="review-grant">
                <span>
                  <strong>{g.reviewer.displayName}</strong> <span className="muted">{g.reviewer.email}</span>
                  <br />
                  <span className="muted small">
                    Revision {g.revision} · {grantStatusText(g)}
                  </span>
                </span>
                {g.status === "active" && confirming !== g.id && (
                  <button className="btn btn-sm" type="button" onClick={() => setConfirming(g.id)} aria-label={`Stop sharing with ${g.reviewer.displayName}`}>
                    Stop sharing
                  </button>
                )}
                {g.status === "active" && confirming === g.id && (
                  <span className="row tight">
                    <button className="btn btn-sm btn-danger" type="button" disabled={stop.isPending} onClick={() => stop.mutate(g.id)}>
                      Confirm stop
                    </button>
                    <button className="btn btn-sm" type="button" onClick={() => setConfirming(null)}>
                      Cancel
                    </button>
                  </span>
                )}
                {g.status === "revoked" && <span className="pill">Stopped</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
