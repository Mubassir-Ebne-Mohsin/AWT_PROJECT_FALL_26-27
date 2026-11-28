"use client";
import { ChallengeLibrary } from "@/components/learner/challenge-library";
import { ChallengeIntroduction } from "@/components/public/challenge-introduction";
import { ChallengeBrief } from "@/components/learner/challenge-brief";
import {
  readSubmissionIdentity,
  rememberSubmissionIdentity,
  recoveryKey,
} from "@/lib/attempt-recovery";
import { useDrafts } from "@/components/workspace/draft-provider";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { ProgressPage } from "@/components/progress/progress-page";
import { Crumbs } from "@/components/shell/crumbs";
import { resolveRoute } from "@/lib/routes";
import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import {
  publishedChallenge,
  startAttempt,
  readAttempt,
  submitAttempt,
} from "@/lib/api/attempts";
const uuid = (s: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
function Notice({ error }: { error: unknown }) {
  return error ? (
    <p role="alert">
      Could not load this information. Your design is preserved. Try again.
    </p>
  ) : null;
}
export function LearnerCatalog() {
  const { status, user } = useAuth();
  return status === "authed" && user ? <ChallengeLibrary key={user.id} /> : <ChallengeIntroduction />;
}
export function LearnerChallenge() {
  const id = String(useParams().id),
    search = useSearchParams(),
    router = useRouter();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const q = useQuery({
    queryKey: ["published-challenge", id, user?.id],
    queryFn: ({ signal }) => publishedChallenge(id, signal),
    enabled: !!user && uuid(id),
    retry: false,
  });
  const attemptId = search.get("attempt");
  async function start() {
    setBusy(true);
    setMessage("");
    try {
      const a = await startAttempt(id);
      router.replace(`/challenges/${id}?attempt=${a.id}`);
    } catch {
      setMessage(
        "The attempt could not be opened. Try again; an existing attempt is reused.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page stack lg">
      <Crumbs resolved={resolveRoute(`/challenges/${id}`)} />
      <h1 className="h1">
        {q.data?.title ?? resolveRoute(`/challenges/${id}`).title}
      </h1>
      {q.data && (
        <>
          <ChallengeBrief key={id} challenge={q.data} />
        </>
      )}
      {!uuid(id) && <p>This challenge is unavailable.</p>}
      <Notice error={q.error} />
      {q.isError && (
        <button className="btn" onClick={() => void q.refetch()}>
          Try again
        </button>
      )}
      {user ? (
        q.data && (
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void start()}
          >
            {busy ? "Opening…" : "Start or resume private attempt"}
          </button>
        )
      ) : (
        <Link
          className="btn btn-primary"
          href={`/login?next=${encodeURIComponent(`/challenges/${id}`)}`}
        >
          Log in to start
        </Link>
      )}
      {message && <p role="alert">{message}</p>}
      {user && attemptId && uuid(attemptId) && (
        <Attempt
          key={`${user.id}:${attemptId}`}
          id={attemptId}
          challengeId={id}
        />
      )}
      <Link href="/progress">My progress</Link>
    </div>
  );
}
function Attempt({ id, challengeId }: { id: string; challengeId: string }) {
  const drafts = useDrafts();
  const { user } = useAuth();
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false);
  const submitting = useRef(false);
  const request = useRef<{
    requestId: string;
    expectedRevision: number;
  } | null>(null);
  const q = useQuery({
    queryKey: ["challenge-attempt", user?.id, id],
    queryFn: ({ signal }) => readAttempt(id, signal),
    retry: false,
    refetchInterval: (q) =>
      q.state.data?.submissions.some((s) => s.status === "pending")
        ? 2000
        : false,
  });
  async function submit() {
    if (
      !q.data ||
      busy ||
      submitting.current ||
      q.data.attempt.challengeId !== challengeId.toLowerCase()
    )
      return;
    if (
      drafts.get(`${user?.id}:${q.data.attempt.designId}`)?.hasUnsettledWork
    ) {
      setMessage(
        "Save your edits and resolve pending editor work before submitting. Your draft is preserved.",
      );
      return;
    }
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setMessage("");
    try {
      if (!request.current) {
        request.current = readSubmissionIdentity(
          sessionStorage,
          recoveryKey(user!.id, id),
        );
      }
      if (!request.current) {
        const d = await api<{ revision: number }>(
          `/designs/${q.data.attempt.designId}`,
          { scope: "local" },
        );
        request.current = {
          requestId: crypto.randomUUID(),
          expectedRevision: d.revision,
        };
      }
      rememberSubmissionIdentity(
        sessionStorage,
        recoveryKey(user!.id, id),
        request.current,
      );
      const result = await submitAttempt(id, request.current);
      request.current = null;
      rememberSubmissionIdentity(
        sessionStorage,
        recoveryKey(user!.id, id),
        null,
      );
      setUncertain(false);
      await q.refetch();
      setMessage(
        result.status === "pending"
          ? "Judging saved inputs with the challenge traffic…"
          : "Recovered the recorded submission.",
      );
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 429
      ) {
        request.current = null;
        rememberSubmissionIdentity(
          sessionStorage,
          recoveryKey(user!.id, id),
          null,
        );
        setUncertain(false);
        const details = error.details as
          { reason?: unknown; issues?: unknown } | undefined;
        const issues =
          details?.reason === "EXERCISE_RULES" && Array.isArray(details.issues)
            ? details.issues
                .flatMap((issue: unknown) =>
                  typeof issue === "object" &&
                  issue !== null &&
                  "message" in issue &&
                  typeof issue.message === "string"
                    ? [issue.message]
                    : [],
                )
                .slice(0, 5)
            : [];
        setMessage(
          [
            error.message,
            ...issues,
            ...(issues.length
              ? [
                  "Review Allowed changes above, edit your attempt and save before retrying. No graded submission was used.",
                ]
              : []),
          ].join(" "),
        );
        return;
      }
      setUncertain(true);
      setMessage(
        "Submission was not confirmed. Retry uses the same request identity. Your saved design is unchanged.",
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  if (q.data && q.data.attempt.challengeId !== challengeId.toLowerCase())
    return (
      <p role="alert">
        This attempt belongs to a different challenge and is not shown here.
      </p>
    );
  return (
    <section className="challenge-attempt stack">
      <h2 className="h2">Your private attempt</h2>
      {q.data?.challenge.archived && (
        <p role="status">
          This challenge is archived. Earlier results are kept; new submissions
          are closed.
        </p>
      )}
      <Notice error={q.error} />
      {q.isError && (
        <button className="btn" onClick={() => void q.refetch()}>
          Try again
        </button>
      )}
      {q.data && (
        <>
          <Link
            className="btn"
            href={`/designs/${q.data.attempt.designId}/edit?attempt=${id}`}
          >
            Edit and save your attempt
          </Link>
          <p>
            Only your saved revision is submitted. Save any editor changes
            first. Judging always uses the challenge traffic, even if you
            changed your copy’s traffic. Submitting shares this frozen revision
            with the challenge’s Instructor.
          </p>
          <button
            className="btn btn-primary"
            disabled={
              busy ||
              q.data.challenge.archived ||
              q.data.submissions.some((s) => s.status === "pending")
            }
            onClick={() => void submit()}
          >
            {busy
              ? "Submitting…"
              : uncertain
                ? "Check the same submission"
                : "Submit saved revision"}
          </button>
          <p role="status">
            {q.data.submissions.some((s) => s.status === "pending")
              ? "Judging saved inputs with the challenge traffic…"
              : message === "Judging saved inputs with the challenge traffic…"
                ? "Judging finished; see the recorded outcome below."
                : message}
          </p>
          <ul>
            {q.data.submissions.map((s) => (
              <li key={s.id}>
                Revision {s.designRevision} ·{" "}
                {s.status === "completed"
                  ? `${s.passes ? "Passed" : "Not passed"} · p95 ${s.p95} ms · errors ${((s.errorRate ?? 0) * 100).toFixed(2)}%`
                  : s.status}{" "}
                · {s.engineVersion ?? "No graded result"}
                {s.modelVerdict && (
                  <span className="hint"> · Model state: {s.modelVerdict}</span>
                )}
                {s.rulesVersion && (
                  <span className="hint">
                    {" "}
                    · Exercise rules v{s.rulesVersion}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {q.data.feedback.length > 0 && (
            <section
              className="stack"
              aria-label="Instructor feedback"
              data-testid="attempt-feedback"
            >
              <h3 className="h3">Instructor feedback</h3>
              {q.data.feedback.map((f) => {
                const on = q.data.submissions.find(
                  (s) => s.id === f.submissionId,
                );
                return (
                  <div
                    className="r4-comment"
                    key={f.id}
                    data-testid="attempt-feedback-item"
                  >
                    <div className="small muted">
                      {f.author.displayName}
                      {on ? ` on revision ${on.designRevision}` : ""} ·{" "}
                      {new Date(f.createdAt).toLocaleDateString()}
                    </div>
                    <p className="r4-text">{f.text}</p>
                  </div>
                );
              })}
            </section>
          )}
          <p className="small muted">
            Mathematical model estimates, not measured infrastructure
            performance. Twenty graded submissions per challenge.
          </p>
        </>
      )}
    </section>
  );
}
export function LearnerProgress() {
  return <ProgressPage />;
}
