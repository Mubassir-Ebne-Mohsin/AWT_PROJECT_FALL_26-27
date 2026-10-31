"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { RoleGate } from "@/components/auth/role-gate";
import { ChallengeForm } from "@/components/instructor/challenge-form";
import { SubmissionsPanel } from "@/components/instructor/submissions-panel";
import { Crumbs } from "@/components/shell/crumbs";
import { ApiError } from "@/lib/api/errors";
import { archiveChallenge, duplicateChallenge, fetchMyChallenge, patchChallenge, publishChallenge, type Challenge, type PatchChallenge } from "@/lib/api/challenges";
import { CHALLENGE_RULES_TEXT, baselineText, challengeErrorText, fromChallenge, goalText, statusLabel, trafficText } from "@/lib/challenge-presentation";
import { dateText } from "@/lib/report-presentation";
import { resolveRoute } from "@/lib/routes";

type Notice = { ok: boolean; text: string } | null;

/** One of the Instructor's challenges: its goal, traffic and measured baseline, the edit form, and publish, archive and duplicate. */
export function ChallengeDetail({ id }: { id: string }) {
  return (
    <div className="page stack lg">
      <Crumbs resolved={resolveRoute(`/instructor/challenges/${id}`)} />
      <div className="page-head">
        <div className="stack">
          <span className="eyebrow">Instructor</span>
          <h1 className="h1">Challenge</h1>
          <p className="lede">Your goal, the traffic it is tested at, and where learners start.</p>
        </div>
        <Link className="btn" href="/instructor/challenges">
          Back to my challenges
        </Link>
      </div>
      <RoleGate role="instructor">
        <Body id={id} />
      </RoleGate>
    </div>
  );
}

function Body({ id }: { id: string }) {
  const { user } = useAuth();
  const queries = useQueryClient();
  const router = useRouter();
  const [notice, setNotice] = useState<Notice>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const key = ["my-challenge", user?.id, id];
  const one = useQuery({ queryKey: key, queryFn: ({ signal }) => fetchMyChallenge(id, signal), enabled: !!user, retry: false, refetchOnWindowFocus: false });
  const done = (text: string) => (made: Challenge) => {
    queries.setQueryData(key, made);
    void queries.invalidateQueries({ queryKey: ["my-challenges", user?.id] });
    setError(null);
    setConfirming(false);
    setNotice({ ok: true, text });
  };
  const failed = (e: unknown) => {
    setConfirming(false);
    setNotice({ ok: false, text: challengeErrorText(e) });
  };

  const save = useMutation({ mutationFn: (body: PatchChallenge) => patchChallenge(id, body), onSuccess: done("Saved."), onError: (e) => setError(challengeErrorText(e)) });
  const publish = useMutation({ mutationFn: () => publishChallenge(id), onSuccess: done("Published. The starting design was measured at this traffic."), onError: failed });
  const archive = useMutation({ mutationFn: () => archiveChallenge(id), onSuccess: done("Archived. It is no longer offered, and nothing already submitted is lost."), onError: failed });
  const copy = useMutation({
    mutationFn: () => duplicateChallenge(id),
    onSuccess: (made) => {
      void queries.invalidateQueries({ queryKey: ["my-challenges", user?.id] });
      router.push(`/instructor/challenges/${made.id}`);
    },
    onError: failed,
  });
  const busy = save.isPending || publish.isPending || archive.isPending || copy.isPending;

  if (one.isPending) return <p className="hint">Loading…</p>;
  if (one.isError) {
    const gone = one.error instanceof ApiError && one.error.status === 404;
    return (
      <div className="panel stack r2-pad" role={gone ? "status" : "alert"} data-testid={gone ? "challenge-gone" : "challenge-error-load"}>
        <h2 className="h3">{gone ? "That challenge is not available." : "The challenge could not be loaded."}</h2>
        <p className="hint">{gone ? "It may belong to another account, or it no longer exists." : challengeErrorText(one.error)}</p>
      </div>
    );
  }
  const c = one.data;
  const mode = c.status === "draft" ? "draft" : c.status === "published" ? "wording" : null;

  return (
    <>
      <section className="panel stack r2-pad" aria-label="Challenge summary" data-testid="challenge-summary">
        <div className="row between">
          <h2 className="h3">{c.title}</h2>
          <span className={"pill" + (c.status === "published" ? " ok" : c.status === "archived" ? "" : " warn")} data-testid="challenge-status">
            {statusLabel(c.status)}
          </span>
        </div>
        <p className="r4-text">{c.summary}</p>
        <dl className="stack small">
          <div>
            <dt className="muted">Goal</dt>
            <dd>{goalText(c.goal)}</dd>
          </div>
          <div>
            <dt className="muted">Traffic</dt>
            <dd>{trafficText(c.traffic)}</dd>
          </div>
          <div>
            <dt className="muted">Starting design</dt>
            <dd>
              {c.componentCount} components, frozen when the challenge was made. <span data-testid="baseline-text">{baselineText(c.baseline)}</span>
            </dd>
          </div>
          <div>
            <dt className="muted">History</dt>
            <dd>
              Made {dateText(c.createdAt)}
              {c.publishedAt ? ` · published ${dateText(c.publishedAt)}` : ""}
              {c.archivedAt ? ` · archived ${dateText(c.archivedAt)}` : ""}
            </dd>
          </div>
        </dl>
      </section>

      {notice && (
        <p className={notice.ok ? "hint" : "m16-warn"} role={notice.ok ? "status" : "alert"} data-testid="challenge-notice">
          {notice.text}
        </p>
      )}

      <section className="panel stack r2-pad" aria-label="Actions">
        <h2 className="h3">Actions</h2>
        <p className="hint">{CHALLENGE_RULES_TEXT}</p>
        <div className="row">
          {c.status === "draft" && (
            <button className="btn btn-primary" type="button" disabled={busy} onClick={() => publish.mutate()}>
              {publish.isPending ? "Testing the starting design…" : "Publish"}
            </button>
          )}
          {c.status !== "archived" && !confirming && (
            <button className="btn" type="button" disabled={busy} onClick={() => setConfirming(true)}>
              Archive
            </button>
          )}
          {c.status !== "archived" && confirming && (
            <>
              <button className="btn btn-danger" type="button" disabled={busy} onClick={() => archive.mutate()}>
                Confirm archive
              </button>
              <button className="btn" type="button" onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </>
          )}
          <button className="btn" type="button" disabled={busy} onClick={() => copy.mutate()}>
            Duplicate as a new draft
          </button>
        </div>
      </section>

      {c.status !== "draft" && <SubmissionsPanel challengeId={id} />}

      {mode && (
        <section className="panel stack r2-pad" aria-label="Edit">
          <h2 className="h3">{mode === "draft" ? "Edit the draft" : "Fix the wording"}</h2>
          {mode === "wording" && <p className="hint">The goal, traffic and starting design are frozen now that this is published.</p>}
          <ChallengeForm
            key={c.updatedAt}
            mode={mode}
            initial={fromChallenge(c)}
            busy={save.isPending}
            serverError={error}
            submitLabel="Save changes"
            onSubmit={(body) => {
              setError(null);
              save.mutate(body as PatchChallenge);
            }}
          />
        </section>
      )}
      {!mode && <p className="hint">An archived challenge cannot be changed. Duplicate it to start a new draft.</p>}
    </>
  );
}
